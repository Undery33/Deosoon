const fs = require('node:fs');
const path = require('node:path');

class ConfigLoader {
    constructor() {
        this.config = null;
        this.loadConfig();
    }

    loadConfig() {
        // 환경변수 우선, 없으면 config.json 사용
        if (this.hasEnvironmentVariables()) {
            this.config = this.loadFromEnvironment();
        } else {
            this.config = this.loadFromFile();
        }
        
        this.validateConfig();
    }

    hasEnvironmentVariables() {
        return !!(process.env.DISCORD_TOKEN || process.env.NODE_ENV);
    }

    loadFromEnvironment() {
        return {
            token: process.env.DISCORD_TOKEN,
            clientId: process.env.DISCORD_CLIENT_ID,
            guildId: process.env.DISCORD_GUILD_ID,
            region: process.env.AWS_REGION || 'ap-northeast-2',
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            defaultRoleId: process.env.DEFAULT_ROLE_ID,
            welcomeChannelId: process.env.WELCOME_CHANNEL_ID,
            userStatsTable: process.env.USER_STATS_TABLE || 'DS_userstats',
            userTable: process.env.USER_TABLE || 'DS_User',
            serverTable: process.env.SERVER_TABLE || 'DS_Server',
            openaiApiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            systemPrompt: process.env.OPENAI_SYSTEM_PROMPT || this.getDefaultSystemPrompt(),
            roleTiers: this.getDefaultRoleTiers()
        };
    }

    loadFromFile() {
        try {
            const configPath = path.resolve(__dirname, '../config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (err) {
            console.error('Config 파일을 읽는 도중 오류가 발생했습니다:', err.message);
            throw new Error('설정을 불러올 수 없습니다. 환경변수나 config.json 파일을 확인해주세요.');
        }
    }

    validateConfig() {
        const required = ['token', 'clientId', 'guildId'];
        
        for (const key of required) {
            if (!this.config[key]) {
                console.warn(`경고: 필수 설정값이 누락되었습니다: ${key}`);
            }
        }
    }

    getDefaultSystemPrompt() {
        return `너는 메스가키 스타일의 언더순이야. 유저 질문 종류를 먼저 파악한 다음 정확한 정보를 얄밉고 건방지게 대답해야 해.
절대로 엉뚱한 정보를 섞으면 안돼. 
대답은 무조건 한 문장으로. 
스타일 특징:
- 상대가 멘탈 흔들릴 정도로 깐족대.
- 귀엽고 장난스럽지만 강하게 도발해야돼.
- 만약 슬픈 일이 있다면 더 놀려야해. 
- 만약 기쁜 일이 있다면 되려 화나도록 만들어야해.
- 들어줄려고 하는 것보다 일방적으로 할 말만 해야해. 
표현 예시:
- 뭐야~ 또 몰라? 뇌에 뭐가 든거야❤️
- 헤에~ 나 없으면 아무것도 못하는 허접 인증하는거야?
- 그걸 물어봐? 바보아냐ㅋ 불쌍하니까 알려줄게~
- 에~ 차인거야? 동정이니까 그렇지ㅋ
허접 힘내라❤️ 힘내라❤️`;
    }

    getDefaultRoleTiers() {
        return [
            { "id": "1365050608377139270", "name": "🌟RADIANT🌟", "chat": 2000, "voice": 200 },
            { "id": "1364153977259819030", "name": "🔥IMMORTAL🔥", "chat": 1500, "voice": 150 },
            { "id": "1365050476193910844", "name": "🌌ASCENDANT🌌", "chat": 1200, "voice": 100 },
            { "id": "1365050391607251115", "name": "💎DIAMOND💎", "chat": 900, "voice": 75 },
            { "id": "1364153824423710720", "name": "💠PLATINUM💠", "chat": 600, "voice": 50 },
            { "id": "1364153723474935860", "name": "🥇GOLD🥇", "chat": 400, "voice": 35 },
            { "id": "1364153651232379020", "name": "🥈SILVER🥈", "chat": 200, "voice": 20 },
            { "id": "1364153517295796224", "name": "🥉BRONZE🥉", "chat": 100, "voice": 10 },
            { "id": "1364153417911762965", "name": "UNRANK", "chat": 0, "voice": 0 }
        ];
    }

    get() {
        return this.config;
    }
}

module.exports = new ConfigLoader();