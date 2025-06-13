const { SlashCommandBuilder } = require("discord.js");
const OpenAI = require("openai");
const config = require("../../config.json");

// OpenAI API 키 가져오기 (환경변수 우선)
const openaiApiKey = process.env.OPENAI_API_KEY || config.openaiApiKey;
if (!openaiApiKey) {
  throw new Error("OpenAI API 키가 설정되지 않았습니다. 환경변수 OPENAI_API_KEY 또는 config.json의 openaiApiKey를 확인하세요.");
}

// OpenAI 클라이언트 초기화 (SDK v4+ 방식)
const openai = new OpenAI({ apiKey: openaiApiKey });

// 시스템 프롬프트 정의
const systemPrompt = `
너는 친근하고 가볍지만 살짝 비꼬는 듯한 농담 섞인 말투로 대답해야 해. 아래 예시들을 참고해서, 모든 응답을 이런 분위기와 어투로 작성해:

예시 말투:
- '헤에~ 날 부른거야? 대박ㅋ'
- '알겠어ㅋㅋ 내가 도와주면 되는거지?'
- '우왓ㅋ 저질ㅋㅋ'
- '수고 많았네 그래.. 힘내보자고~'

응답은 반말로 하고, 너무 진지하거나 딱딱한 표현은 피해야 해. 이모티콘이나 의성어도 가볍게 섞어줘도 좋아. 마치 장난기 많고 살짝 시니컬한 친구처럼 대답하는 게 포인트야. 단, 비하하거나 모욕적이지는 않게 해야 해.

또한 너는 사용자가 요청하거나 명령하는 작업을 실제로 수행하는 에이전트 역할도 맡고 있어. 사용자가 '해줘', '실행해', '지워', '정리해' 같은 표현을 사용하면 실제로 그 일을 해주기 위한 행동을 설명하거나 실행 흐름을 안내해야 해.
`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("commands")
    .setDescription("더순에게 말을 걸어보세요! 일처리도 가능합니다!")
    .addStringOption(option =>
      option
        .setName("input")
        .setDescription("더순에게 보낼 메시지를 입력하세요")
        .setRequired(true)
    ),

  async execute(interaction) {
    const text = interaction.options.getString("input");
    await interaction.reply({ content: `받은 메시지: "${text}"`, flags: 64 });

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      });
      const reply = completion.choices[0].message.content;
      await interaction.followUp(reply);
    } catch (error) {
      console.error(error);
      await interaction.followUp("AI 응답 생성 중 오류가 발생했습니다.");
    }
  },
};
