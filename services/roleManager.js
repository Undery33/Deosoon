const logger = require('../utils/logger');

class RoleManager {
    constructor(config) {
        this.config = config;
        this.roleTiers = config.roleTiers.slice().sort((a, b) => a.chat - b.chat);
    }

    // 채팅 수에 따른 티어명 조회
    getTierNameByChatCount(chatCount) {
        for (let i = this.roleTiers.length - 1; i >= 0; i--) {
            if (chatCount >= this.roleTiers[i].chat) {
                return this.roleTiers[i].name;
            }
        }
        return "UNRANK";
    }

    // 사용자가 자격을 갖춘 최고 티어 찾기
    findEligibleTier(chatCount, voiceCount) {
        return this.roleTiers.findLast(tier => 
            chatCount >= tier.chat || voiceCount >= tier.voice
        );
    }

    // 현재 사용자의 티어 찾기
    findCurrentUserTier(member) {
        const currentTierIds = this.roleTiers.map(t => t.id);
        return this.roleTiers.findLast(tier => 
            member.roles.cache.has(tier.id)
        );
    }

    // 역할 승급이 필요한지 확인
    needsRoleUpdate(member, chatCount, voiceCount) {
        const eligibleTier = this.findEligibleTier(chatCount, voiceCount);
        const currentTier = this.findCurrentUserTier(member);
        
        if (!eligibleTier) {
            return { needsUpdate: false };
        }

        if (!currentTier || currentTier.id !== eligibleTier.id) {
            return {
                needsUpdate: true,
                newTier: eligibleTier,
                currentTier: currentTier
            };
        }

        return { needsUpdate: false };
    }

    // 역할 업데이트 실행
    async updateMemberRoles(member, newTier) {
        try {
            const currentTierIds = this.roleTiers.map(t => t.id);
            
            // 기존 티어 역할 제거
            const rolesToRemove = member.roles.cache.filter(r => 
                currentTierIds.includes(r.id)
            );
            
            for (const [_, role] of rolesToRemove) {
                await member.roles.remove(role);
            }

            // 새 티어 역할 부여
            await member.roles.add(newTier.id);

            return true;
        } catch (error) {
            logger.error('역할 업데이트 실패', error);
            throw error;
        }
    }

    // 승급 메시지 전송
    async sendPromotionMessage(member, newTier) {
        try {
            const channel = member.guild.channels.cache.get(this.config.welcomeChannelId);
            
            if (channel?.isTextBased()) {
                await channel.send(
                    `${member.displayName} 님이 ${newTier.name} 역할로 승급했습니다! 🎉`
                );
            }
        } catch (error) {
            logger.error('승급 메시지 전송 실패', error);
        }
    }

    // 전체 역할 관리 프로세스
    async processRoleUpdate(member, userData) {
        if (!userData?.Item) {
            return;
        }

        const chatCount = parseInt(userData.Item.userChat?.N ?? '0');
        const voiceCount = parseInt(userData.Item.joinVoice?.N ?? '0');

        const updateInfo = this.needsRoleUpdate(member, chatCount, voiceCount);
        
        if (!updateInfo.needsUpdate) {
            return;
        }

        const oldRoleName = updateInfo.currentTier?.name || 'None';
        const newRoleName = updateInfo.newTier.name;

        try {
            await this.updateMemberRoles(member, updateInfo.newTier);
            await this.sendPromotionMessage(member, updateInfo.newTier);
            
            logger.roleUpdate(member.id, oldRoleName, newRoleName, true);
            logger.info(`역할 업데이트 완료: ${member.displayName} -> ${newRoleName}`);
        } catch (error) {
            logger.roleUpdate(member.id, oldRoleName, newRoleName, false, error);
        }
    }

    // 사용자 랭킹 계산
    calculateUserRanking(allUsers, targetUserId) {
        const sortedByChat = [...allUsers].sort((a, b) => b.userChat - a.userChat);
        const sortedByVoice = [...allUsers].sort((a, b) => b.joinVoice - a.joinVoice);

        const chatRank = sortedByChat.findIndex(user => user.userId === targetUserId) + 1;
        const voiceRank = sortedByVoice.findIndex(user => user.userId === targetUserId) + 1;

        return {
            chatRank: chatRank || '순위 없음',
            voiceRank: voiceRank || '순위 없음',
            topChatUsers: sortedByChat.slice(0, 3),
            topVoiceUsers: sortedByVoice.slice(0, 3)
        };
    }
}

module.exports = RoleManager;