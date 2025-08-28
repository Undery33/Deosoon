
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');

const config = require('./config/configLoader').get();
const DatabaseService = require('./services/database');
const TranslateService = require('./services/translate');
const RoleManager = require('./services/roleManager');
const logger = require('./utils/logger');
const ErrorHandler = require('./utils/errorHandler');

ErrorHandler.setupGlobalHandlers();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ]
});
client.commands = new Collection();

// 명령어 자동 로딩
const foldersPath = path.join(__dirname, 'commands');
fs.readdirSync(foldersPath).forEach(folder => {
    const commandsPath = path.join(foldersPath, folder);
    fs.readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'))
        .forEach(file => {
            const filePath = path.join(commandsPath, file);
            try {
                const command = require(filePath);
                if (command?.data && command?.execute) {
                    client.commands.set(command.data.name, command);
                } else {
                    logger.warn(`[WARNING] ${filePath}에 "data" 또는 "execute" 속성이 누락됨.`);
                }
            } catch (err) {
                logger.error(`[ERROR] ${filePath} 명령어 로딩 실패:`, err);
            }
        });
});

const database = new DatabaseService(config);
const translator = new TranslateService(config);
const roleManager = new RoleManager(config);
const services = { database, translator, roleManager, config };

client.once(Events.ClientReady, c => {
    logger.info(`Bot ready! Logged in as ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return logger.error(`명령어를 찾을 수 없습니다: ${interaction.commandName}`);
        try {
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
        const roleIds = interaction.values;
        const roles = roleIds.map(id => interaction.guild.roles.cache.get(id)).filter(Boolean);
        if (!roles.length) {
            return interaction.reply({ content: '선택한 역할을 찾을 수 없습니다.', ephemeral: true });
        }
        try {
            const toAdd = roles.filter(r => !interaction.member.roles.cache.has(r.id));
            await Promise.all(toAdd.map(r => interaction.member.roles.add(r)));
            const addedNames = toAdd.map(r => r.name).join(', ');
            await interaction.reply({
                content: addedNames ? `${addedNames} 역할을 부여하였습니다! 😀` : '이미 선택한 역할을 보유 중입니다 😥',
                ephemeral: true
            });
        } catch (err) {
            ErrorHandler.handleRoleUpdateError(interaction.user.id, err, {
                newRole: roles.map(r => r.name)
            });
            await interaction.reply({ content: '역할 부여 중 오류가 발생했습니다.', ephemeral: true });
        }
    }
});

client.on(Events.GuildMemberAdd, async member => {
    const defaultRole = member.guild.roles.cache.get(config.defaultRoleId);
    if (!defaultRole) return logger.error('기본 역할을 찾을 수 없습니다.');
    try {
        await member.roles.add(defaultRole);
    } catch (err) {
        ErrorHandler.handleRoleUpdateError(member.id, err, { newRole: 'default' });
    }
});

client.on('messageCreate', ErrorHandler.createAsyncWrapper(async message => {
    if (message.author.bot) return;
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
    await handleTranslation(message);
}));

async function handleTranslation(message) {
    try {
        if (message.guild) {
            const serverData = await database.getServerSettings(message.guild.id);
            const allowedChannels = serverData.Item?.chattingID?.L?.map(x => x.S) || [];
            if (!allowedChannels.includes(message.channel.id)) return;
        }
        const userSettings = await database.getUserTranslateSettings(message.author.id);
        const translatedText = await translator.processMessage(message, userSettings);
        if (translatedText) await message.reply(translatedText);
    } catch (error) {
        ErrorHandler.handleTranslationError(message.author.id, error);
    }
}

client.on('voiceStateUpdate', ErrorHandler.createAsyncWrapper(async (oldState, newState) => {
    if (!newState.guild || newState.guild.id !== config.guildId) return;
    if (!newState.member || newState.member.user.bot) return;
    if (oldState.channel || !newState.channel) return;
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

function shutdownBot() {
    logger.info('Shutting down bot...');
    database.clearCache();
    client.destroy();
    process.exit(0);
}

process.on('SIGINT', shutdownBot);
process.on('SIGTERM', shutdownBot);

client.login(config.token)
    .then(() => logger.info('Bot login successful'))
    .catch(error => {
        logger.error('Bot login failed', error);
        process.exit(1);
    });