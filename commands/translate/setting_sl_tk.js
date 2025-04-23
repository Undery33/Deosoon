/*
  유저의 입력 언어와 출력 언어를 설정하는 명령어
  - 입력 언어와 출력 언어를 선택하는 드롭다운 메뉴를 제공
  - 선택된 언어는 DynamoDB에 저장됨
  - 언어 선택 후 확인 메시지를 표시
*/

const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
} = require("discord.js");

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

// 각 언어 매핑핑
const languageCodeMap = {
  "Korean / 한국어": "ko",
  "English / 영어": "en",
  "Japanese / 日本語": "ja",
  "Chinese / 中文": "zh",
  "Taiwanese / 繁體中文": "zh-TW",
};

let selectedInputLanguage = null;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("translator")
    .setDescription("입력 언어를 선택해 주세요")
    .setDescriptionLocalizations({
      "en-US": "Select your input language",
      "en-GB": "Select your input language",
      "ja": "入力言語を選択してください",
      "zh-CN": "请选择您的输入语言",
      "zh-TW": "請選擇您的輸入語言",
    }),

  async execute(interaction) {

    // 입력 언어 선택 메뉴
    const inputLanguage = new StringSelectMenuBuilder()
      .setCustomId("inputLanguage")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Korean / 한국어")
          .setValue("Korean / 한국어"),
        new StringSelectMenuOptionBuilder()
          .setLabel("English / 영어")
          .setValue("English / 영어"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Japanese / 日本語")
          .setValue("Japanese / 日本語"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Chinese / 中文")
          .setValue("Chinese / 中文")
      );

    const inputRow = new ActionRowBuilder().addComponents(inputLanguage);

    // 출력 언어 선택 메뉴
    const outputLanguage = new StringSelectMenuBuilder()
      .setCustomId("outputLanguage")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Korean / 한국어")
          .setValue("Korean / 한국어"),
        new StringSelectMenuOptionBuilder()
          .setLabel("English / 영어")
          .setValue("English / 영어"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Japanese / 日本語")
          .setValue("Japanese / 日本語"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Chinese / 中文")
          .setValue("Chinese / 中文")
      );

    const outputRow = new ActionRowBuilder().addComponents(outputLanguage);

    const lang = interaction.locale || "ko";

    const inoutputLocales = {
      "en-US": `Select **input and output** languages.`,
      "ja": `**入力言語と出力言語**を選択してください。`,
      "zh-CN": `请选择输入和输出语言。`,
      "zh-TW": `請選擇輸入和輸出語言。`,
    };

    // 하나의 메시지에 둘 다 포함
    const replyMessage = await interaction.reply({
      content: inoutputLocales[lang] ?? "**입력 언어**와 **출력 언어**를 선택해 주세요.",
      components: [inputRow, outputRow],
      flags: MessageFlags.Ephemeral,
    });

    // 입력 언어 콜렉터
    const iCollector = replyMessage.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId === "inputLanguage",
      time: 60_000,
    });

    // 출력 언어 콜렉터
    const oCollector = replyMessage.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: (i) =>
        i.user.id === interaction.user.id && i.customId === "outputLanguage",
      time: 60_000,
    });

    iCollector.on("collect", async (i) => {
      selectedInputLanguage = i.values[0];
      const lang = i.locale || interaction.locale || "ko";

      const iLocales = {
        "en-US": `Input Language : ${selectedInputLanguage}\nSelect your output language.`,
        "ja": `入力言語 : ${selectedInputLanguage}\n出力言語を選択してください。`,
        "zh-CN": `输入语言 : ${selectedInputLanguage}\n请选择输出语言。`,
        "zh-TW": `輸入語言 : ${selectedInputLanguage}\n請選擇輸出語言。`,
      };

      await i.update({
        content:
          iLocales[lang] ??
          `입력 언어 : ${selectedInputLanguage}\n출력 언어를 선택해 주세요.`,
        components: [inputRow, outputRow],
        flags: MessageFlags.Ephemeral,
      });
    });

    oCollector.on("collect", async (i) => {
      const selectedOutputLanguage = i.values[0];
      const lang = i.locale || interaction.locale || "ko";

      // DynamoDB 저장
      const userId = interaction.user.id;
      const updateParams = {
        TableName: config.userTable,
        Key: { userId: { S: userId } },
        UpdateExpression: "SET transLang = :langs, userName = :name",
        ExpressionAttributeValues: {
          ":langs": {
            M: {
              source: { S: languageCodeMap[selectedInputLanguage] },
              target: { S: languageCodeMap[selectedOutputLanguage] },
            },
          },
          ":name": { S: interaction.user.username },
        },
      };

      try {
        await dynamodbClient.send(new UpdateItemCommand(updateParams));
        console.log(`[DynamoDB] ${interaction.user.username} 언어 설정 저장 완료`);
      } catch (err) {
        console.error("[DynamoDB] 저장 실패: ", err);
      }

      const finalMessage = {
        "en-US": `✅ Input Language : ${selectedInputLanguage}\n✅ Output Language : ${selectedOutputLanguage}`,
        "ja": `✅ 入力言語 : ${selectedInputLanguage}\n✅ 出力言語 : ${selectedOutputLanguage}`,
        "zh-CN": `✅ 输入语言 : ${selectedInputLanguage}\n✅ 输出语言 : ${selectedOutputLanguage}`,
        "zh-TW": `✅ 輸入語言 : ${selectedInputLanguage}\n✅ 輸出語言 : ${selectedOutputLanguage}`,
      };

      await i.update({
        content:
          finalMessage[lang] ??
          `✅ **입력 언어 :** ${selectedInputLanguage}\n✅ **출력 언어 : **${selectedOutputLanguage}`,
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    });
  },
};
