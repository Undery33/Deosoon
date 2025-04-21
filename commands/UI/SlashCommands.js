// 이 부분은 UI를 구성하는 부분입니다.
// discord.js의 slash command를 사용하여 UI를 구성합니다.
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("translator")
    .setDescription("번역할 언어를 선택해 주세요")
    .setDescriptionLocalizations({
      "en-US": "Select the language to translate to",
      "en-GB": "Select the language to translate to",
      "ja": "翻訳する言語を選択してください",
      "zh-CN": "请选择翻译目标语言",
      "zh-TW": "請選擇翻譯目標語言",
    }),
  async execute(interaction) {
    const languageSelect = new StringSelectMenuBuilder()
      .setCustomId("languageSelector")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Korean / 한국어")
          .setValue("Korean / 한국어"),
        new StringSelectMenuOptionBuilder()
          .setLabel("English / 영어")
          .setValue("English / 영어"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Japanese / 日本語")
          .setValue("Japanese / 日本語"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Chinese / 中文")
          .setValue("Chinese / 中文"),
      );
    const row = new ActionRowBuilder().addComponents(languageSelect);

    const reply = await interaction.reply({
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const collector = reply.createMessageComponentCollector({
      ComponentType: ComponentType.StringSelect,
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId === "languageSelector",
      time: 60_000,
    });

    collector.on("collect", (i) => {
      const selected = i.values[0];

      const locales = {
        "en-US": `Selected language : ${selected}`,
        "en-GB": `Selected language : ${selected}`,
        "ja": `選択した言語 : ${selected}`,
        "zh-CN": `选定的语言 : ${selected}`,
        "zh-TW": `選定的語言 : ${selected}`,
      };

      const lang = i.locale || interaction.locale || "ko";

      i.reply({
        content: locales[lang] ?? `선택된 언어 : ${selected}`,
        flags: MessageFlags.Ephemeral,
      });
    });
  },
};
