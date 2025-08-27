/*
  실시간 번역 여부를 설정하는 명령어
  - 사용자가 실시간 번역을 켜거나 끌 수 있도록 버튼을 제공
  - 버튼 클릭 시 DynamoDB에 설정을 저장
*/

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { MessageUtils } = require('../../utils/logger');

// AWS DynamoDB 연결
const {
  DynamoDBClient,
  UpdateItemCommand
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

    const lang = interaction.locale || "ko";
    const locales = {
      "en-US": "Would you like to enable real-time translation?",
      "en-GB": "Would you like to enable real-time translation?",
      "ja": "リアルタイム翻訳を有効にしますか？",
      "zh-CN": "您要启用实时翻译吗？",
      "zh-TW": "您要啟用即時翻譯嗎？",
    };

    await interaction.reply({
      content: locales[lang] ?? `실시간 번역을 활성화하시겠습니까?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });

    const filter = (i) =>
      i.customId === "transOn" || i.customId === "transOff";

    const collector = interaction.channel.createMessageComponentCollector({
      filter,
      time: 15000,
    });

    collector.on("collect", async (i) => {
      const isOn = i.customId === "transOn";
      const userId = i.user.id;

      const command = new UpdateItemCommand({
        TableName: config.userTable,
        Key: {
          userId: { S: userId },
        },
        UpdateExpression: "SET transOnOff = :val",
        ExpressionAttributeValues: {
          ":val": { BOOL: isOn },
        },
      });

      try {
        await dynamodbClient.send(command);
        const reply = await i.reply({
          content: isOn
            ? "실시간 번역이 활성화되었습니다."
            : "실시간 번역이 비활성화되었습니다.",
          ephemeral: true,
        });
        setTimeout(async () => {
          try {
            await reply.delete();
          } catch (deleteError) {
            console.debug('번역 설정 메시지 삭제 실패 (무시됨):', deleteError.message);
          }
        }, 3000);
      } catch (err) {
        console.error("DynamoDB 업데이트 실패:", err);
        const errorReply = await i.reply({
          content: "설정 저장 중 오류가 발생했습니다.",
          ephemeral: true,
        });
        setTimeout(async () => {
          try {
            await errorReply.delete();
          } catch (deleteError) {
            console.debug('번역 설정 오류 메시지 삭제 실패 (무시됨):', deleteError.message);
          }
        }, 3000);
      }

      collector.stop();
    });
  },
};