const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addrole")
    .setDescription(
      "선택 후 역할이 부여될 경우, 언급 및 알림에 동의한 것으로 간주됩니다."
    ),
  async execute(interaction) {
    const roleSelectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("select-role")
        .setPlaceholder("역할 선택")
        .setMinValues(0)
        .setMaxValues(12)
        .addOptions([
          { label: "Valorant", value: "1241611683366047834" },
          { label: "Minecraft", value: "1241612044365467759" },
          { label: "Hoyo", value: "1241611849032667216" },
          { label: "Rhythm", value: "1384818040637755394" },
          { label: "Maple", value: "1387499950027444386" },
          { label: "Rainbow Six", value: "1341734133600096266" },
          { label: "Battlefield V", value: "1322526183115456594" },
          { label: "Fate Trigger", value: "1407490619386892380" },
          { label: "Lost Ark", value: "1241612083372490814" },
          { label: "PUBG", value: "1241612122618593343" },
          { label: "Wuthering Waves", value: "1244981585623912469" },
          { label: "Delta Force", value: "1351495039745916998" },
          { label: "DNF", value: "1251493567147540582" }
        ])
    );
    await interaction.reply({
      content: "원하는 게임 역할을 선택하세요!",
      components: [roleSelectMenu],
      flags: MessageFlags.Ephemeral,
    });
  },
};
