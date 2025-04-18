const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('핑')
        .setDescription('서버 테스트를 위한 명령어에요!'),
    async execute(interaction){
        await interaction.reply('퐁!');
    },
};