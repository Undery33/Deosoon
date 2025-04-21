const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("trans-onoff")
    .setDescription("실시간 번역 여부를 설정해 주세요")
    .setDescriptionLocalizations({
      "en-US": "Set whether to enable real-time translation",
      "en-GB": "Set whether to enable real-time translation",
      "ja": "リアルタイム翻訳かどうかを設定してください",
      "zh-CN": "请设置是否启用实时翻译",
      "zh-TW": "請設定是否啟用即時翻譯",
    }),
  async execute(interaction) {
    const transOn = new ButtonBuilder()
      .setCustomId("transOn")
      .setLabel("ON")
      .setStyle(ButtonStyle.Success);

    const transOff = new ButtonBuilder()
      .setCustomId("transOff")
      .setLabel("OFF")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(transOn, transOff);

    await interaction.reply({ content: "test", components: [row] });
  },
};
