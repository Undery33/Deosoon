// 필수 모듈 및 외부 라이브러리
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');

// 최적화된 모듈들
const config = require('./config/configLoader').get();
const DatabaseService = require('./services/database');
const TranslateService = require('./services/translate');
const RoleManager = require('./services/roleManager');
const logger = require('./utils/logger');
const { MessageUtils } = require('./utils/logger');
const ErrorHandler = require('./utils/errorHandler');

// 전역 에러 핸들러 설정
ErrorHandler.setupGlobalHandlers();

// 디스코드 클라이언트 생성 및 인텐트 설정
const client = new Client({ intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
]});
client.commands = new Collection();

// 커맨드 로딩
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] ${filePath}에서 "data" 또는 "execute" 속성이 누락됨.`);
        }
    }
}

// 서비스 초기화
const database = new DatabaseService(config);
const translator = new TranslateService(config);
const roleManager = new RoleManager(config);

// 서비스 객체 (명령어에서 사용)
const services = {
    database,
    translator,
    roleManager,
    config
};


// 클라이언트 준비 완료
client.once(Events.ClientReady, c => {
    logger.info(`Bot ready! Logged in as ${c.user.tag}`);
});

// 슬래시 커맨드 처리
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return console.error(`명령어를 찾을 수 없습니다: ${interaction.commandName}`);
        try {
            // 새로운 방식과 기존 방식 모두 지원
            if (command.execute.length > 1) {
                await command.execute(interaction, services);
            } else {
                await command.execute(interaction);
            }
            logger.command(interaction.commandName, interaction.user.id, interaction.guildId, true);
        } catch (err) {
            await ErrorHandler.handleCommandError(interaction, err, interaction.commandName);
        }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'select-role') {
        const role = interaction.guild.roles.cache.get(interaction.values[0]);
        if (!role) {
            return interaction.reply({ content: '해당 역할을 찾을 수 없습니다.', ephemeral: true });
        }
        try {
            // 역할 부여
            await interaction.member.roles.add(role);

            const welcomeChannel = interaction.guild.channels.cache.get(config.welcomeChannelId);
            if (welcomeChannel?.isTextBased()) {
            await welcomeChannel.send(`${interaction.member}님이 ${role.name} 역할로 승급했습니다! 🎉`);
            }
        } catch (err) {
            ErrorHandler.handleRoleUpdateError(interaction.user.id, err, {
                newRole: role.name
            });
            
            await interaction.reply({ 
                content: '역할 부여 중 오류가 발생했습니다.', 
                ephemeral: true 
            });
        }
    }
});


// 길드 가입 시 기본 역할 부여
client.on(Events.GuildMemberAdd, async member => {
    const defaultRole = member.guild.roles.cache.get(config.defaultRoleId);
    if (!defaultRole) return console.error('기본 역할을 찾을 수 없습니다.');
    try {
        await member.roles.add(defaultRole);
    } catch (err) {
        ErrorHandler.handleRoleUpdateError(member.id, err, {
            newRole: 'default'
        });
    }
});

client.on('messageCreate', ErrorHandler.createAsyncWrapper(async message => {
    if (message.author.bot) return;

    // 통계 업데이트 & 역할 승급 (지정된 서버에서만)
    if (message.guild?.id === config.guildId) {
        try {
            await database.upsertUserStat(
                message.author.id,
                message.author.username,
                'userChat'
            );
            
            const userData = await database.getUserStats(message.author.id);
            const member = await message.guild.members.fetch(message.author.id);
            
            await roleManager.processRoleUpdate(member, userData);
        } catch (error) {
            ErrorHandler.handleDatabaseError('user activity update', error, {
                userId: message.author.id,
                guildId: message.guild.id
            });
        }
    }

    // 번역 처리
    await handleTranslation(message);

}));

// 번역 처리 함수
async function handleTranslation(message) {
    try {
        // 채널 권한 확인
        if (message.guild) {
            const serverData = await database.getServerSettings(message.guild.id);
            const allowedChannels = serverData.Item?.chattingID?.L?.map(x => x.S) || [];
            
            if (!allowedChannels.includes(message.channel.id)) {
                return;
            }
        }

        // 사용자 번역 설정 조회
        const userSettings = await database.getUserTranslateSettings(message.author.id);
        
        // 번역 실행
        const translatedText = await translator.processMessage(message, userSettings);
        
        if (translatedText) {
            await message.reply(translatedText);
        }
        
    } catch (error) {
        ErrorHandler.handleTranslationError(message.author.id, error);
    }
}

// 음성 채널 입장 처리
client.on('voiceStateUpdate', ErrorHandler.createAsyncWrapper(async (oldState, newState) => {
    // 음성 채널 입장 시에만 처리
    if (!newState.guild || newState.guild.id !== config.guildId) return;
    if (!newState.member || newState.member.user.bot) return;
    if (oldState.channel || !newState.channel) return; // 입장이 아닌 경우 제외

    try {
        await database.upsertUserStat(
            newState.member.id,
            newState.member.user.username,
            'joinVoice'
        );

        const userData = await database.getUserStats(newState.member.id);
        await roleManager.processRoleUpdate(newState.member, userData);
        
    } catch (error) {
        ErrorHandler.handleDatabaseError('voice activity update', error, {
            userId: newState.member.id,
            guildId: newState.guild.id
        });
    }
}));

// 종료 시 정리 작업
process.on('SIGINT', () => {
    logger.info('Shutting down bot...');
    database.clearCache();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Shutting down bot...');
    database.clearCache();
    client.destroy();
    process.exit(0);
});

// 로그인
client.login(config.token)
    .then(() => logger.info('Bot login successful'))
    .catch(error => {
        logger.error('Bot login failed', error);
        process.exit(1);
    });