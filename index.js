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

const languageMap = {
    'ko': 'ko',
    'en': 'en',
    'ja': 'ja',
    'zh-TW': 'zh-TW',
    'zh': 'zh'
};   

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

    if (!userData?.Item) {
        console.log('유저 데이터 없음');
        return;
    }

    const chatCount = parseInt(userData.Item.userChat?.N ?? '0');
    const voiceCount = parseInt(userData.Item.joinVoice?.N ?? '0');

    const ROLE_TIERS = config.roleTiers;

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
        if (chatCount >= tier.chat || voiceCount >= tier.voice) {
            try {
                await member.roles.add(tier.id);
    
                // 멤버 정보 최신화
                await member.fetch();
                const alreadyHasTier = member.roles.cache.has(tier.id);
    
                if (!alreadyHasTier) {
                    const targetChannel = member.guild.channels.cache.get(config.welcomeChannelId);
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
        TableName: config.userStateTable,
        Key: { userId: { S: userCountingId } },
    };

    try {
        const userData = await dynamodbClient.send(new GetItemCommand(userCountingParams));

        if (userData.Item) {
            const updateParams = {
                TableName: config.userStateTable,
                Key: {
                    userId: { S: userCountingId }
                },
                UpdateExpression: config.setUserSatatsTable,
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
                TableName: config.userStateTable,
                Item: {
                    userId: { S: userCountingId },
                    userName: { S: userCountingName },
                    userChat: { N: '1' },
                    joinVoice: { N: '0' },
                    lastUpdated: { S: new Date().toISOString() }
                }
            };
            await dynamodbClient.send(new PutItemCommand(putParams));
            console.log(`신규 유저 ${userCountingId} 등록 및 userChat = 1`);
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

    const userId = message.author.id;

    // 유저 정보 조회 (DynamoDB)
    const userParams = {
        TableName: config.userTable,
        Key: { userId: { S: userId } },
    };

    try {
        // 서버 설정 조회 (채널 제한 확인)
        const serverParams = {
            TableName: config.serverTable,
            Key: { serverId: { S: message.guild.id } },
        };
        const serverData = await dynamodbClient.send(new GetItemCommand(serverParams));

        if (serverData.Item) {
            const chattingIDs = serverData.Item.chattingID?.L?.map(item => item.S) ?? [];
            if (!chattingIDs.includes(message.channel.id)) {
                console.log('봇이 작동하지 않도록 설정된 채널입니다.');
                return;
            }
        } else {
            console.error('Server 테이블에 서버 정보 없음');
            return;
        }

        // 유저의 번역 설정 및 언어 정보 조회
        const userData = await dynamodbClient.send(new GetItemCommand(userParams));

        if (userData.Item) {
            const translateData = userData.Item.transOnOff?.BOOL ?? false;
            let sourceLang = userData.Item.transLang?.M?.source?.S ?? 'ko';
            let targetLang = userData.Item.transLang?.M?.target?.S ?? 'en';

            sourceLang = languageMap[sourceLang] || sourceLang;
            targetLang = languageMap[targetLang] || targetLang;         

            // 번역이 활성화된 경우
            if (translateData) {
                const validLangs = ['ko', 'en', 'zh-TW', 'zh', 'ja'];
                const sourceLanguageCode = validLangs.includes(sourceLang) ? sourceLang : 'en';
                const targetLanguageCode = validLangs.includes(targetLang) ? targetLang : 'ko';

                // ✅ 멘션 치환 함수
                function replaceMentionsWithUserTags(message) {
                    let content = message.content;
                    message.mentions.users.forEach(user => {
                        const mentionSyntax = `<@${user.id}>`;
                        const mentionSyntaxWithNick = `<@!${user.id}>`;
                        const userTag = `@${user.username}`;
                        content = content.replaceAll(mentionSyntax, userTag);
                        content = content.replaceAll(mentionSyntaxWithNick, userTag);
                    });
                    return content;
                }

                const originalText = replaceMentionsWithUserTags(message);

                const translateParams = {
                    Text: originalText,
                    SourceLanguageCode: sourceLanguageCode,
                    TargetLanguageCode: targetLanguageCode,
                };

                try {
                    const translateCommand = new TranslateTextCommand(translateParams);
                    const translateResult = await translateClient.send(translateCommand);
                    const translatedText = translateResult.TranslatedText;
                    await message.reply(`${translatedText}`);
                } catch (translateError) {
                    console.error('번역 요청 오류:', translateError);
                    await message.reply('번역 중 오류가 발생했습니다. 다시 시도해 주세요.');
                }
            } else {
                console.log(`번역 비활성화 유저: ${message.author.username}`);
            }
        } else {
            console.error('유저 데이터 없음');
        }
    } catch (error) {
        console.error('DynamoDB 조회 오류: ', error);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const userName = member.user.username;

    const userParams = {
        TableName: config.userStatsTable,
        Key: { userId: { S: userId } },
    };

    // 입장 이벤트인지 확인 (oldState.channel 없음 && newState.channel 있음)
    if (!oldState.channel && newState.channel) {
        try {
            const userData = await dynamodbClient.send(new GetItemCommand(userParams));

            if (userData.Item) {
                // 유저 존재 → joinVoice 증가
                const updateParams = {
                    TableName: config.userStatsTable,
                    Key: {
                        userId: { S: userId }
                    },
                    UpdateExpression: config.setUserStatesTable2,
                    ExpressionAttributeValues: {
                        ':inc': { N: '1' },
                        ':start': { N: '0' },
                        ':now': { S: new Date().toISOString() }
                    }
                };
                await dynamodbClient.send(new UpdateItemCommand(updateParams));
                console.log(`🎤 ${userId} joinVoice +1`);
            } else {
                // 유저 없으면 신규 등록
                const putParams = {
                    TableName: config.userStatsTable,
                    Item: {
                        userId: { S: userId },
                        userName: { S: userName },
                        userChat: { N: '0' },
                        joinVoice: { N: '1' },
                        lastUpdated: { S: new Date().toISOString() }
                    }
                };
                await dynamodbClient.send(new PutItemCommand(putParams));
                console.log(`🆕 음성 입장 신규 유저 ${message.author.username} 등록`);
            }
        } catch (err) {
            console.error('joinVoice 증가 실패:', err);
        }
    }
});


client.login(token);