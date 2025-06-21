// index.js

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
const configPath = path.resolve(__dirname, './config.json');
let config;
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
    console.error('Config 파일을 읽는 도중 오류가 발생했습니다:', err);
    process.exit(1);
}

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

// AWS SDK 클라이언트 설정
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

// 통역 언어맵
const languageMap = {
    'ko': 'ko', 'en': 'en', 'ja': 'ja', 'zh-TW': 'zh-TW', 'zh': 'zh'
};

// 역할 승급 로직
async function assignRoleIfEligible(member, userData) {
    if (!userData?.Item) return;
    const chatCount  = parseInt(userData.Item.userChat?.N ?? '0');
    const voiceCount = parseInt(userData.Item.joinVoice?.N ?? '0');
    const ROLE_TIERS = config.roleTiers.slice().sort((a,b)=>a.chat-b.chat);
    const currentTierIds = ROLE_TIERS.map(t=>t.id);
    const userCurrentTier = ROLE_TIERS.findLast(tier=>member.roles.cache.has(tier.id));
    const eligibleTier = ROLE_TIERS.findLast(tier=>chatCount>=tier.chat||voiceCount>=tier.voice);
    if (!eligibleTier || (userCurrentTier && userCurrentTier.id===eligibleTier.id)) return;
    try {
        // 기존 티어 역할 제거
        const rolesToRemove = member.roles.cache.filter(r=>currentTierIds.includes(r.id));
        for (const [_,role] of rolesToRemove) await member.roles.remove(role);
        // 새 티어 역할 부여
        await member.roles.add(eligibleTier.id);
        // 환영 채널에 메시지
        const channel = member.guild.channels.cache.get(config.welcomeChannelId);
        if (channel?.isTextBased()) {
            await channel.send(`<@${member.id}> 님이 ${eligibleTier.name} 역할로 승급했습니다! 🎉`);
        }
    } catch (err) {
        console.error('역할 처리 실패:', err);
    }
}

// userChat 또는 joinVoice 값을 upsert
async function upsertUserStat(userId, userName, field) {
    const now = new Date().toISOString();
    const getParams = {
        TableName: config.userStatsTable,
        Key: { userId: { S: userId } }
    };
    const { Item } = await dynamodbClient.send(new GetItemCommand(getParams));
    if (Item) {
        const updateParams = {
            TableName: config.userStatsTable,
            Key: { userId: { S: userId } },
            UpdateExpression: `SET lastUpdated = :now ADD ${field} :inc`,
            ExpressionAttributeValues: {
                ':now': { S: now },
                ':inc': { N: '1' }
            }
        };
        await dynamodbClient.send(new UpdateItemCommand(updateParams));
    } else {
        const putParams = {
            TableName: config.userStatsTable,
            Item: {
                userId:    { S: userId },
                userName:  { S: userName },
                userChat:  { N: field==='userChat'  ? '1':'0' },
                joinVoice: { N: field==='joinVoice' ? '1':'0' },
                lastUpdated: { S: now }
            }
        };
        await dynamodbClient.send(new PutItemCommand(putParams));
    }
}

// 클라이언트 준비 완료
client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
});

// 슬래시 커맨드 처리
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return console.error(`명령어를 찾을 수 없습니다: ${interaction.commandName}`);
        try {
            await command.execute(interaction);
        } catch (err) {
            console.error('명령어 실행 중 오류:', err);
            const msg = { content:'명령어 실행 중 오류가 발생했습니다.', ephemeral:true };
            interaction.replied||interaction.deferred
                ? await interaction.followUp(msg)
                : await interaction.reply(msg);
        }
    } else if (interaction.isStringSelectMenu() && interaction.customId==='select-role') {
        const role = interaction.guild.roles.cache.get(interaction.values[0]);
        if (!role) return interaction.reply({ content:'해당 역할을 찾을 수 없습니다.', ephemeral:true });
        try {
            await interaction.member.roles.add(role);
            await interaction.reply({ content:`${role.name} 역할이 부여되었습니다!`, ephemeral:true });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content:'역할 부여 중 오류가 발생했습니다.', ephemeral:true });
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
        console.error('기본 역할 부여 실패:', err);
    }
});

// 메시지 처리
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild || message.guild.id!==config.guildId) return;

    // 통계 업데이트 & 역할 승급
    await upsertUserStat(message.author.id, message.author.username, 'userChat');
    const data = await dynamodbClient.send(new GetItemCommand({
        TableName: config.userStatsTable,
        Key:{ userId:{ S:message.author.id }}
    }));
    await assignRoleIfEligible(await message.guild.members.fetch(message.author.id), data);

    // 번역 로직
    if (message.content.startsWith('[Translated]')) return;
    if (message.stickers.size>0) return;
    if ([...message.attachments.values()].every(a=>['image/','video/','audio/'].some(t=>a.contentType?.startsWith(t)))) return;
    const onlyEmojis = message.content.trim().match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u);
    if (onlyEmojis) return;

    // 채널 제한 확인
    try {
        const serverData = await dynamodbClient.send(new GetItemCommand({
            TableName: config.serverTable,
            Key:{ serverId:{ S:message.guild.id }}
        }));
        const allowed = serverData.Item?.chattingID?.L?.map(x=>x.S) || [];
        if (!allowed.includes(message.channel.id)) return;
    } catch (err) {
        console.error('Server 테이블 조회 오류:', err);
        return;
    }

    // 번역 설정 조회
    let userData;
    try {
        userData = await dynamodbClient.send(new GetItemCommand({
            TableName: config.userTable,
            Key:{ userId:{ S:message.author.id }}
        }));
    } catch (err) {
        console.error('유저 테이블 조회 오류:', err);
        return;
    }
    if (userData.Item?.transOnOff?.BOOL) {
        let src = userData.Item.transLang.M.source.S;
        let tgt = userData.Item.transLang.M.target.S;
        src = languageMap[src]||src; tgt = languageMap[tgt]||tgt;
        const text = [...message.mentions.users.values()].reduce(
            (t,u)=>t.replaceAll(`<@${u.id}>`, `@${u.username}`).replaceAll(`<@!${u.id}>`, `@${u.username}`),
            message.content
        );
        try {
            const res = await translateClient.send(new TranslateTextCommand({
                Text: text,
                SourceLanguageCode: src,
                TargetLanguageCode: tgt
            }));
            await message.reply(res.TranslatedText);
        } catch (err) {
            console.error('번역 오류:', err);
            await message.reply('번역 중 오류가 발생했습니다.');
        }
    }
});

// 음성 채널 입장 처리
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (!newState.guild || newState.guild.id!==config.guildId) return;
    const member = newState.member;
    if (!member || member.user.bot) return;
    if (!oldState.channel && newState.channel) {
        await upsertUserStat(member.id, member.user.username, 'joinVoice');
        const data = await dynamodbClient.send(new GetItemCommand({
            TableName: config.userStatsTable,
            Key:{ userId:{ S:member.id }}
        }));
        await assignRoleIfEligible(member, data);
    }
});

// 로그인
client.login(config.token);
