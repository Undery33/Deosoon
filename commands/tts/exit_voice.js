// commands/voice/exit_voice.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('exit_voice')
    .setDescription('봇을 음성 채널에서 퇴장시킵니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  async execute(interaction) {
    const states = interaction.client._voiceStates ?? new Map();
    const state = states.get(interaction.guild.id);
    if (!state) return interaction.reply({ content: '현재 연결된 음성 채널이 없습니다.', ephemeral: true });

    try {
      state.connection.destroy();
    } finally {
      states.delete(interaction.guild.id);
    }
    return interaction.reply({ content: '퇴장했습니다.', ephemeral: true });
  },
};
