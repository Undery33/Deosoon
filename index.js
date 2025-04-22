// 필수 모듈 및 외부 라이브러리
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
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
    GatewayIntentBits.GuildVoiceStates, // 번역용 채널 확인을 위해 유지
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent
] });

// 명령어 컬렉션 초기화
client.commands = new Collection();

// commands 폴더에서 명령어 자동 등록
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

// AWS 클라이언트 설정
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

// 봇이 준비되었을 때 출력
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// 슬래시 커맨드 처리
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

// 실시간 메시지 감지 및 번역 처리
client.on('messageCreate', async message => {

    // 유저의 채팅을 감지하는 코드
    if (message.content.trim() === '안녕 더순아') {
        await message.reply('나에게 인사한거야? 웃겨ㅋㅋ');
        return;
    }

    // 봇 메시지 또는 이미 번역된 메시지는 무시
    if (message.author.bot || message.content.startsWith('[Translated]')) return;

    // 스티커 메시지 무시
    if (message.stickers.size > 0) return;

    // 이모지만 포함된 메시지 무시
    const onlyEmojis = message.content.trim().match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u);
    if (onlyEmojis) return;

    // 이미지, 비디오, 오디오만 포함된 메시지 무시
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
        TableName: 'DS_User',
        Key: { userId: { S: userId } },
    };

    try {
        // 서버 설정 조회 (채널 제한 확인)
        const serverParams = {
            TableName: 'DS_Server',
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

            // 언어 코드 매핑
            const languageMap = {
                'Korean': 'ko',
                'English': 'en',
                'Spanish': 'es',
                'French': 'fr',
                'Japanese': 'ja'
            };
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
                console.log(`번역 비활성화 유저: ${interaction.user.username}`);
            }
        } else {
            console.error('유저 데이터 없음');
        }
    } catch (error) {
        console.error('DynamoDB 조회 오류: ', error);
    }
});

// 봇 로그인
client.login(token);
