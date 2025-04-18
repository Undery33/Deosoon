// 이 부분은 UI를 구성하는 부분입니다.
// discord.js의 slash command를 사용하여 UI를 구성합니다.
const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("translator")
    .setDescription("Select your language"),
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

    const reply = await interaction.reply({
      components: [row],
      fetchReply: true,
    });

    const collector = reply.createMessageComponentCollector({
      ComponentType: ComponentType.StringSelect,
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId === "languageSelector",
      time: 60_000,
    });

    collector.on("collect", (i) => {
      const selected = i.values[0];
      console.log(`${selected} selected`);
      i.reply({ content: `Selected language : ${selected}` });
    });
  },
};
