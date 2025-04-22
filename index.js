// 필수 모듈 및 외부 라이브러리
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const { 
    DynamoDBClient, 
    GetItemCommand,
    PutItemCommand,
    UpdateItemCommand
} = require('@aws-sdk/client-dynamodb');
const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
const { token } = require('./config.json');

// config 파일 경로 지정 및 로딩
const configPath = path.resolve(__dirname, './config.json');
let try_config;
try {
    try_config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
    console.error('Config 파일을 읽는 도중 오류가 발생했습니다: ', err);
    process.exit(1); // config 읽기 실패 시 종료
}

// 디스코드 클라이언트 생성 및 인텐트 설정
const client = new Client({ intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
] });

client.commands = new Collection();

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

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const dynamodbClient = new DynamoDBClient({
    region: config.region,
    credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
    },
});

const translateClient = new TranslateClient({
    region: config.region,
    credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
    },
});

async function assignRoleIfEligible(member, userData) {
    const chatCount = parseInt(userData.Item.userChat?.N ?? '0');
    const voiceCount = parseInt(userData.Item.joinVoice?.N ?? '0');

    const ROLE_TIERS = [
        { id: '1364153977259819030', name: 'FEVER', chat: 150, voice: 50 },
        { id: '1364153824423710720', name: '80%', chat: 100, voice: 30 },
        { id: '1364153723474935860', name: '60%', chat: 60, voice: 15 },
        { id: '1364153651232379020', name: '40%', chat: 40, voice: 10 },
        { id: '1364153517295796224', name: '20%', chat: 20, voice: 5 },
        { id: '1364153417911762965', name: '0%', chat: 0, voice: 0 },
    ];

    const currentRoleIds = ROLE_TIERS.map(t => t.id);
    const rolesToRemove = member.roles.cache.filter(role => currentRoleIds.includes(role.id));
    for (const [_, role] of rolesToRemove) {
        try {
            await member.roles.remove(role);
        } catch (err) {
            console.error(`❌ 역할 제거 실패: ${role.name}`, err);
        }
    }

    for (const tier of ROLE_TIERS) {
        if (chatCount >= tier.chat && voiceCount >= tier.voice) {
            try {
                await member.roles.add(tier.id);
                console.log(`✅ ${member.user.username}에게 등급 역할 부여됨: ${tier.id}`);

                const alreadyHasTier = member.roles.cache.has(tier.id);
                if (!alreadyHasTier) {
                    const targetChannel = member.guild.channels.cache.get('1241576477116338257');
                    if (targetChannel && targetChannel.isTextBased()) {
                        await targetChannel.send(`<@${member.id}> 님이 <@&${tier.id}> 역할로 승급했습니다! 🎉`);
                    }
                }
            } catch (err) {
                console.error(`❌ 역할 부여 실패: ${tier.id}`, err);
            }
            break;
        }
    }
}

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`해당 명령어를 찾을 수 없습니다: ${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('명령어 실행 중 오류 발생:', error);
        const errorMsg = { content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true };
        interaction.replied || interaction.deferred
            ? await interaction.followUp(errorMsg)
            : await interaction.reply(errorMsg);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const userCountingId = message.author.id;
    const userCountingName = message.author.username;

    const userCountingParams = {
        TableName: 'DS_userstats',
        Key: { userId: { S: userCountingId } },
    };

    try {
        const userData = await dynamodbClient.send(new GetItemCommand(userCountingParams));

        if (userData.Item) {
            const updateParams = {
                TableName: 'DS_userstats',
                Key: {
                    userId: { S: userCountingId }
                },
                UpdateExpression: 'SET userChat = if_not_exists(userChat, :start) + :inc, lastUpdated = :now',
                ExpressionAttributeValues: {
                    ':inc': { N: '1' },
                    ':start': { N: '0' },
                    ':now': { S: new Date().toISOString() }
                }
            };
            await dynamodbClient.send(new UpdateItemCommand(updateParams));
            console.log(`✅ ${userCountingId} userChat +1`);
        } else {
            const putParams = {
                TableName: 'DS_userstats',
                Item: {
                    userId: { S: userCountingId },
                    userName: { S: userCountingName },
                    userChat: { N: '1' },
                    joinVoice: { N: '0' },
                    lastUpdated: { S: new Date().toISOString() }
                }
            };
            await dynamodbClient.send(new PutItemCommand(putParams));
            console.log(`🆕 신규 유저 ${userCountingId} 등록 및 userChat = 1`);
        }

        const guildMember = await message.guild.members.fetch(userCountingId);
        await assignRoleIfEligible(guildMember, userData);

    } catch (err) {
        console.error('userChat 증가 또는 신규 등록 실패:', err);
    }

    if (message.content.startsWith('[Translated]')) return;
    if (message.stickers.size > 0) return;

    const onlyEmojis = message.content.trim().match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u);
    if (onlyEmojis) return;

    if (message.attachments.size > 0) {
        const hasOnlyMedia = [...message.attachments.values()].every(attachment => {
            const mediaTypes = ['image/', 'video/', 'audio/'];
            return mediaTypes.some(type => attachment.contentType?.startsWith(type));
        });
        if (hasOnlyMedia) return;
    }
});

client.login(token);