const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

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

// 언어 코드 → 언어 이름 매핑
const languageNameMap = {
  ko: "Korean",
  ja: "Japanese",
  en: "English",
  zh: "Chinese",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("check-stats")
    .setDescription("본인의 현재 활동량을 확인합니다."),

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

      const sortedByChat = [...allUsers].sort((a, b) => b.userChat - a.userChat);
      const sortedByVoice = [...allUsers].sort((a, b) => b.joinVoice - a.joinVoice);

      const userChatRank =
        sortedByChat.findIndex((user) => user.userId === userId) + 1;
      const userVoiceRank =
        sortedByVoice.findIndex((user) => user.userId === userId) + 1;

      const topChatUsers = [...sortedByChat].slice(0, 3);
      const topVoiceUsers = [...sortedByVoice].slice(0, 3);

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
          { name: `마지막 활동 날짜`, value: `${lastUpdated}` }
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

      const translateParams = {
        TableName: config.userTable,
        Key: {
          userId: { S: userId },
        },
      };

      let translateEmbed;
      try {
        const translateData = await dynamodbClient.send(
          new GetItemCommand(translateParams)
        );

        const hasTransLang = translateData.Item?.transLang?.M;
        const sourceCode = hasTransLang?.source?.S;
        const targetCode = hasTransLang?.target?.S;
        const enabled = translateData.Item?.transOnOff?.BOOL ?? false;

        const sourceLang = languageNameMap[sourceCode] ?? sourceCode ?? "N/A";
        const targetLang = languageNameMap[targetCode] ?? targetCode ?? "N/A";

        if (hasTransLang) {
          translateEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("🈶 번역 설정")
            .addFields(
              { name: "입력 언어", value: sourceLang, inline: true },
              { name: "출력 언어", value: targetLang, inline: true },
              {
                name: "번역 활성화",
                value: enabled ? "✅ 활성화됨" : "❌ 비활성화됨",
                inline: true,
              }
            );
        } else {
          translateEmbed = new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle("❗ 번역 설정 정보 없음")
            .setDescription("이 유저의 번역 설정 데이터가 없습니다.");
        }
      } catch (translateError) {
        console.error("🔥 번역 설정 조회 실패:", translateError);
        translateEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ 번역 설정 조회 실패")
          .setDescription("데이터를 불러오는 중 오류가 발생했습니다.");
      }

      await interaction.reply({
        embeds: [statEmbed, statRankingEmbed, translateEmbed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("🔥 유저 활동 데이터 조회 실패 :", error);
      await interaction.reply("❌ 데이터를 불러오는 중 오류가 발생했습니다.");
    }
  },
};
