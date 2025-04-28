/*
    유저의 활동량을 확인하는 명령어를 구현합니다.
    - 채팅 횟수, 음성 채팅 접속 횟수, 마지막 활동 날짜를 확인합니다.
    - 활동량 TOP 3를 표시합니다.
*/
const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

// AWS DynamoDB 연결
const {
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
} = require("@aws-sdk/client-dynamodb");

const config = require("../../config.json");

const dynamodbClient = new DynamoDBClient({
  region: config.region,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName("check-stats")
    .setDescription("본인의 현재 활동량을 확인합니다.")
    .setDescriptionLocalizations({
      "en-US": "Check your current activity.",
      "en-GB": "Check your current activity.",
      "ja": "現在の活動量を確認します。",
      "zh-CN": "检查您当前的活动量。",
      "zh-TW": "檢查您當前的活動量。",
    }),

  async execute(interaction) {
    const userId = interaction.user.id;

    const params = {
      TableName: config.userStatsTable,
      Key: {
        userId: { S: userId },
      },
    };

    try {
      const data = await dynamodbClient.send(new GetItemCommand(params));

      if (!data.Item) {
        return await interaction.reply("⚠️ 활동 데이터가 존재하지 않습니다.");
      }

      // // 채팅 횟수 기준으로 정렬
      // const sortedByChat = [...allUsers].sort(
      //   (a, b) => b.userChat - a.userChat
      // );
      // // 음성 접속 기준으로 정렬
      // const sortedByVoice = [...allUsers].sort(
      //   (a, b) => b.joinVoice - a.joinVoice
      // );

      // // 본인 채팅 순위 찾기
      // const userChatRank =
      //   sortedByChat.findIndex(
      //     (user) => user.userName === (data.Item.userName?.S ?? "Unknown")
      //   ) + 1;

      // // 본인 음성 순위 찾기
      // const userVoiceRank =
      //   sortedByVoice.findIndex(
      //     (user) => user.userName === (data.Item.userName?.S ?? "Unknown")
      //   ) + 1;

      const chatCount = data.Item.userChat?.N ?? "0";
      const voiceCount = data.Item.joinVoice?.N ?? "0";
      const lastUpdated = new Date(data.Item.lastUpdated?.S).toLocaleString(
        "ko-KR",
        { timeZone: "Asia/Seoul" }
      );

      const scanResult = await dynamodbClient.send(
        new ScanCommand({ TableName: config.userStatsTable })
      );
      const allUsers = scanResult.Items.map((item) => ({
        userId: item.userId?.S,
        userName: item.userName?.S ?? "Unknown",
        userChat: parseInt(item.userChat?.N ?? "0"),
        joinVoice: parseInt(item.joinVoice?.N ?? "0"),
      }));

      // 채팅/음성 정렬
      const sortedByChat = [...allUsers].sort(
        (a, b) => b.userChat - a.userChat
      );
      const sortedByVoice = [...allUsers].sort(
        (a, b) => b.joinVoice - a.joinVoice
      );

      // 본인 userId로 찾기
      const userChatRank =
        sortedByChat.findIndex((user) => user.userId === userId) + 1;
      const userVoiceRank =
        sortedByVoice.findIndex((user) => user.userId === userId) + 1;

      const topChatUsers = [...allUsers]
        .sort((a, b) => b.userChat - a.userChat)
        .slice(0, 3);
      const topVoiceUsers = [...allUsers]
        .sort((a, b) => b.joinVoice - a.joinVoice)
        .slice(0, 3);

      const medals = ["🥇", "🥈", "🥉"];

      const topChatStats = topChatUsers
        .map(
          (user, index) =>
            `${medals[index]} ${user.userName} (${user.userChat}회)`
        )
        .join("\n");

      const topVoiceStats = topVoiceUsers
        .map(
          (user, index) =>
            `${medals[index]} ${user.userName} (${user.joinVoice}회)`
        )
        .join("\n");

      const statEmbed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`**${interaction.user.username}님의 정보**`)
        .addFields(
          { name: `채팅 횟수`, value: `${chatCount}` },
          { name: `음성 채팅 접속 횟수`, value: `${voiceCount}` },
          { name: `마지막 활동 날짜`, value: `${lastUpdated}` },
        );

      const statRankingEmbed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`**현재 활동 랭킹**`)
        .addFields(
          {
            name: `💬 채팅 활동 TOP 3`,
            value: topChatStats || "데이터 없음",
            inline: true,
          },
          {
            name: `🎤 음성 채팅 접속 TOP 3`,
            value: topVoiceStats || "데이터 없음",
            inline: true,
          },
          { name: `\u200B`, value: `` },
          {
            name: `📊 나의 채팅 순위`,
            value: `${userChatRank}위`,
            inline: true,
          },
          {
            name: `📊 나의 음성 순위`,
            value: `${userVoiceRank}위`,
            inline: true,
          }
        );

      await interaction.reply({
        embeds: [statEmbed, statRankingEmbed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("🔥 유저 활동 데이터 조회 실패 :", error);
      await interaction.reply("❌ 데이터를 불러오는 중 오류가 발생했습니다.");
    }
  },
};
