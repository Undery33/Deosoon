// commands/voice/join_voice.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join_voice')
    .setDescription('현재 내가 있는 음성 채널로 봇을 호출합니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  async execute(interaction) {
    const vch = interaction.member?.voice?.channel;
    if (!vch) return interaction.reply({ content: '먼저 음성 채널에 접속하세요.', ephemeral: true });

    // index.js의 전역 상태 맵 재사용. 없으면 생성.
    const states = interaction.client._voiceStates ??= new Map();

    let state = states.get(interaction.guild.id);
    if (!state) {
      const connection = joinVoiceChannel({
        channelId: vch.id,
        guildId: vch.guild.id,
        adapterCreator: vch.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      connection.subscribe(player);
      state = { connection, player, queue: [], playing: false };
      states.set(interaction.guild.id, state);
    } else if (state.connection.joinConfig.channelId !== vch.id) {
      state.connection.destroy();
      states.delete(interaction.guild.id);
      const connection = joinVoiceChannel({
        channelId: vch.id,
        guildId: vch.guild.id,
        adapterCreator: vch.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      state = { connection, player: state.player, queue: [], playing: false };
      states.set(interaction.guild.id, state);
    }

    // index.js의 ensureVoice와 동일 목적. 이후 TTS는 processQueue가 재생 처리. :contentReference[oaicite:2]{index=2}
    return interaction.reply({ content: `접속 완료: <#${vch.id}>`, ephemeral: true });
  },
};
