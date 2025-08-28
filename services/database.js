const { 
    DynamoDBClient, 
    GetItemCommand,
    PutItemCommand,
    UpdateItemCommand,
    ScanCommand
} = require('@aws-sdk/client-dynamodb');

const logger = require('../utils/logger');

class DatabaseService {
    constructor(config) {
        this.config = config;
        this.client = new DynamoDBClient({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        
        // 간단한 캐시 구현
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5분
    }

    // 캐시 키 생성
    getCacheKey(tableName, key) {
        return `${tableName}:${JSON.stringify(key)}`;
    }

    // 캐시에서 데이터 가져오기
    getFromCache(cacheKey) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        this.cache.delete(cacheKey);
        return null;
    }

    // 캐시에 데이터 저장
    setCache(cacheKey, data) {
        this.cache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
    }

    // 유저 통계 조회
    async getUserStats(userId) {
        const cacheKey = this.getCacheKey(this.config.userStatsTable, { userId });
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const params = {
                TableName: this.config.userStatsTable,
                Key: { userId: { S: userId } }
            };
            
            const result = await this.client.send(new GetItemCommand(params));
            this.setCache(cacheKey, result);
            return result;
        } catch (error) {
            logger.error('사용자 통계 조회 실패', error);
            throw error;
        }
    }

    // 유저 번역 설정 조회
    async getUserTranslateSettings(userId) {
        try {
            const params = {
                TableName: this.config.userTable,
                Key: { userId: { S: userId } }
            };
            
            return await this.client.send(new GetItemCommand(params));
        } catch (error) {
            logger.error('사용자 번역 설정 조회 실패', error);
            throw error;
        }
    }

    // 서버 설정 조회
    async getServerSettings(serverId) {
        const cacheKey = this.getCacheKey(this.config.serverTable, { serverId });
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const params = {
                TableName: this.config.serverTable,
                Key: { serverId: { S: serverId } }
            };
            
            const result = await this.client.send(new GetItemCommand(params));
            this.setCache(cacheKey, result);
            return result;
        } catch (error) {
            logger.error('서버 설정 조회 실패', error);
            throw error;
        }
    }

    // 사용자 통계 업데이트
    async upsertUserStat(userId, userName, field) {
        const now = new Date().toISOString();
        
        try {
            // 기존 데이터 확인
            const existingData = await this.getUserStats(userId);
            
            if (existingData.Item) {
                // 업데이트
                const updateParams = {
                    TableName: this.config.userStatsTable,
                    Key: { userId: { S: userId } },
                    UpdateExpression: `SET lastUpdated = :now ADD ${field} :inc`,
                    ExpressionAttributeValues: {
                        ':now': { S: now },
                        ':inc': { N: '1' }
                    }
                };
                await this.client.send(new UpdateItemCommand(updateParams));
            } else {
                // 새로 생성
                const putParams = {
                    TableName: this.config.userStatsTable,
                    Item: {
                        userId: { S: userId },
                        userName: { S: userName },
                        userChat: { N: field === 'userChat' ? '1' : '0' },
                        joinVoice: { N: field === 'joinVoice' ? '1' : '0' },
                        lastUpdated: { S: now }
                    }
                };
                await this.client.send(new PutItemCommand(putParams));
            }

            // 캐시 무효화
            const cacheKey = this.getCacheKey(this.config.userStatsTable, { userId });
            this.cache.delete(cacheKey);
            
        } catch (error) {
            logger.error('사용자 통계 업데이트 실패', error);
            throw error;
        }
    }

    // 번역 설정 업데이트
    async updateTranslateSettings(userId, settings) {
        try {
            const params = {
                TableName: this.config.userTable,
                Key: { userId: { S: userId } },
                UpdateExpression: 'SET transOnOff = :onoff',
                ExpressionAttributeValues: {
                    ':onoff': { BOOL: settings.enabled }
                }
            };

            if (settings.source && settings.target) {
                params.UpdateExpression += ', transLang = :lang';
                params.ExpressionAttributeValues[':lang'] = {
                    M: {
                        source: { S: settings.source },
                        target: { S: settings.target }
                    }
                };
            }

            await this.client.send(new UpdateItemCommand(params));
        } catch (error) {
            logger.error('번역 설정 업데이트 실패', error);
            throw error;
        }
    }

    // 모든 사용자 통계 조회
    async getAllUserStats() {
        const cacheKey = 'all_user_stats';
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const params = {
                TableName: this.config.userStatsTable
            };
            
            const result = await this.client.send(new ScanCommand(params));
            
            // 짧은 캐시 시간 (1분)
            this.cache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
            
            return result;
        } catch (error) {
            logger.error('전체 사용자 통계 조회 실패', error);
            throw error;
        }
    }

    // 캐시 클리어
    clearCache() {
        this.cache.clear();
    }
}

module.exports = DatabaseService;