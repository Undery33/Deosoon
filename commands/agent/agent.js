const { SlashCommandBuilder } = require("discord.js");
const OpenAI = require("openai");
const config = require("../../config.json");

// OpenAI API 키 및 시스템 프롬프트 가져오기 (환경변수 우선)
const openaiApiKey = process.env.OPENAI_API_KEY || config.openaiApiKey;
const systemPrompt = process.env.OPENAI_SYSTEM_PROMPT || config.systemPrompt;

if (!openaiApiKey) {
  throw new Error("OpenAI API 키가 설정되지 않았습니다. 환경변수 OPENAI_API_KEY 또는 config.json의 openaiApiKey를 확인하세요.");
}
if (!systemPrompt) {
  throw new Error("OpenAI 시스템 프롬프트가 설정되지 않았습니다. 환경변수 OPENAI_SYSTEM_PROMPT 또는 config.json의 systemPrompt를 확인하세요.");
}

// OpenAI 클라이언트 초기화 (SDK v4+ 방식)
const openai = new OpenAI({ apiKey: openaiApiKey });

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
