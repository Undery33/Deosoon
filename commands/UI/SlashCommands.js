// 이 부분은 UI를 구성하는 부분입니다.
// discord.js의 slash command를 사용하여 UI를 구성합니다.
const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("앙기모뚜")
    .setDescription("앙기모뚜"),
  async execute(interaction) {
    await interaction.reply("똥");
  },
};
