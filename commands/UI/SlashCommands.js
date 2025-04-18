// 이 부분은 UI를 구성하는 부분입니다.
// discord.js의 slash command를 사용하여 UI를 구성합니다.
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("language")
    .setDescription("language"),
  async execute(interaction) {
    const languageSelect = new StringSelectMenuBuilder()
      .setCustomId("languageSelector")
      .setPlaceholder("Select your language")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("English")
          .setDescription("Select English")
          .setValue("english"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Japanese")
          .setDescription("日本語を選択")
          .setValue("japanese"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Chinese")
          .setDescription("中文精选")
          .setValue("chinese")
      );
    const row = new ActionRowBuilder().addComponents(languageSelect);

    await interaction.reply({
      content: "Select your language",
      components: [row],
    });
  },
};
