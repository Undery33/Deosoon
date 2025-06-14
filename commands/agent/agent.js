const { SlashCommandBuilder } = require("discord.js");
const OpenAI = require("openai");
const config = require("../../config.json");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const roleTiers = config.roleTiers;

const openaiApiKey = process.env.OPENAI_API_KEY || config.openaiApiKey;
const systemPrompt = process.env.OPENAI_SYSTEM_PROMPT || config.systemPrompt;

if (!openaiApiKey) throw new Error("OpenAI API 키가 설정되지 않았습니다.");
if (!systemPrompt) throw new Error("OpenAI 시스템 프롬프트가 설정되지 않았습니다.");

const openai = new OpenAI({ apiKey: openaiApiKey });
const dynamodbClient = new DynamoDBClient({
  region: config.region,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

function getTierNameByChatCount(chatCount) {
  for (const tier of roleTiers) {
    if (chatCount >= tier.chat) return tier.name;
  }
  return "UNRANK";
}

async function getUserChatCount(userId) {
  const params = {
    TableName: config.userStatsTable,
    Key: { userId: { S: userId } }
  };
  const data = await dynamodbClient.send(new GetItemCommand(params));
  return data.Item?.userChat?.N ? Number(data.Item.userChat.N) : null;
}

// 따옴표 자동 제거 함수
function cleanQuotes(text) {
  return text.replace(/^"(.*)"$/, '$1').trim();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("talk")
    .setDescription("더순에게 말을 걸어보세요! 일처리도 가능합니다!")
    .addStringOption(option =>
      option
        .setName("say")
        .setDescription("더순에게 보낼 메시지를 입력하세요")
        .setRequired(true)
    ),

  async execute(interaction) {
    const text = interaction.options.getString("say");
    const userId = interaction.user.id;

    // 모두에게 공개되는 메시지(비공개 플래그 제거)
    await interaction.reply(`입력한 메세지: "${text}"`);

    try {
      // 1. 의도 판별
      const intentPrompt = `
너는 사용자의 Discord 서버 활동을 도와주는 언더순이라는 봇이다.
아래와 같이 사용자의 질문 유형을 판별해라.

- 만약 질문이 '본인의 티어'만 궁금한 의도라면 "TIER_QUERY"만 출력해.
- 만약 질문이 '본인의 채팅 수'만 궁금한 의도라면 "CHAT_COUNT_QUERY"만 출력해.
- 만약 둘 다 궁금한 질문이면 "TIER_AND_CHAT_QUERY"만 출력해.
- 꼭 '채팅 수'만 있다면 채팅 수만, '티어'만 있다면 티어를 출력해.
- '채팅 수'만 물어봤는데 '티어'도 같이 출력하면 안돼. 반대로 '티어'만 물어봤는데 '채팅 수'도 같이 출력하면 안돼.
- 그 외 일반 대화는 "NORMAL"만 출력해.

예시:
내 티어는 뭐야? => TIER_QUERY
채팅 몇 번 쳤어? => CHAT_COUNT_QUERY
티어와 채팅 수 알려줘 => TIER_AND_CHAT_QUERY
오늘 뭐 먹지? => NORMAL
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt + intentPrompt },
          { role: "user", content: text },
        ],
      });

      const intent = completion.choices[0].message.content.trim();

      if (
        intent === "TIER_QUERY" ||
        intent === "CHAT_COUNT_QUERY" ||
        intent === "TIER_AND_CHAT_QUERY"
      ) {
        const chatCount = await getUserChatCount(userId);
        if (chatCount === null) {
          await interaction.followUp("채팅 수 정보를 찾을 수 없습니다.");
          return;
        }
        const tierName = getTierNameByChatCount(chatCount);

        // LLM 스타일 답변 (따옴표 없는 자연스러운 말투)
        const answerPrompt = `
다음은 사용자의 질문입니다: "${text}"

아래 정보를 참고하여 장난스럽고 친근한 말투로 답변하세요:
- 티어명: ${tierName}
- 채팅 수: ${chatCount}회

조건:
- 질문이 티어만 궁금한 경우 티어 정보만 알려주세요.
- 채팅 수만 궁금한 경우 채팅 수만 알려주세요.
- 둘 다 궁금한 경우, 두 정보를 모두 포함하여 알려주세요.
- 숫자나 티어명만 단독으로 출력하지 말고, 자연스럽고 유쾌한 말투로 전달해주세요.

예시 말투:
- 오~ 그게 궁금했던 거야? 귀엽다ㅎㅎ
- 이런 것도 궁금해해? 정말 궁금쟁이네~!
- 알려줄게~ 궁금했지?
- 어머~ 이건 꼭 알아야지! 기다려봐~

존댓말은 사용하지 않고, 다정하고 유쾌한 반말을 사용해주세요.
`;

        const styleCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: answerPrompt }
          ]
        });

        const styledReply = cleanQuotes(styleCompletion.choices[0].message.content.trim());
        await interaction.followUp(styledReply);

      } else {
        // 일반 대화
        const talkCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          max_tokens: 300,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
        });
        const reply = talkCompletion.choices[0].message.content.trim();
        await interaction.followUp(reply);
      }
    } catch (error) {
      console.error(error);
      await interaction.followUp("AI 응답 생성 중 오류가 발생했습니다.");
    }
  },
};
