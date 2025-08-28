const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
const logger = require('../utils/logger');

class TranslateService {
    constructor(config) {
        this.config = config;
        this.client = new TranslateClient({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });

        this.languageMap = {
            'ko': 'ko', 
            'en': 'en', 
            'ja': 'ja', 
            'zh-TW': 'zh-TW', 
            'zh': 'zh'
        };
    }

    // 번역이 필요한지 필터링
    shouldTranslate(message) {
        // 번역 메시지는 스킵
        if (message.content.startsWith('[Translated]')) {
            return false;
        }

        // 스티커 메시지 스킵
        if (message.stickers.size > 0) {
            return false;
        }

        // 미디어 파일만 있는 메시지 스킵
        if (message.attachments.size > 0 &&
            [...message.attachments.values()].every(a =>
                ['image/', 'video/', 'audio/'].some(t => a.contentType?.startsWith(t))
            )
        ) {
            return false;
        }

        // 이모지만 있는 메시지 스킵
        const onlyEmojis = message.content.trim().match(
            /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\s)+$/u
        );
        const customEmojiRegex = /<a?:\w+:\d+>/;
        
        if (onlyEmojis || customEmojiRegex.test(message.content)) {
            return false;
        }

        // URL이 포함된 메시지 스킵
        const urlRegex = /https?:\/\/[^\s]+/;
        if (urlRegex.test(message.content)) {
            return false;
        }

        return true;
    }

    // 메시지 전처리 (멘션을 사용자명으로 변경)
    preprocessMessage(message) {
        let text = message.content;
        
        for (const user of message.mentions.users.values()) {
            text = text
                .replaceAll(`<@${user.id}>`, `@${user.username}`)
                .replaceAll(`<@!${user.id}>`, `@${user.username}`);
        }
        
        return text;
    }

    // 번역 실행
    async translateText(text, sourceLanguage, targetLanguage) {
        try {
            const mappedSource = this.languageMap[sourceLanguage] || sourceLanguage;
            const mappedTarget = this.languageMap[targetLanguage] || targetLanguage;

            const command = new TranslateTextCommand({
                Text: text,
                SourceLanguageCode: mappedSource,
                TargetLanguageCode: mappedTarget
            });

            const result = await this.client.send(command);
            return result.TranslatedText;
        } catch (error) {
            logger.error('번역 실행 중 오류', error);
            throw error;
        }
    }

    // 전체 번역 프로세스
    async processMessage(message, userSettings) {
        if (!this.shouldTranslate(message)) {
            return null;
        }

        if (!userSettings?.Item?.transOnOff?.BOOL) {
            return null;
        }

        const sourceLanguage = userSettings.Item.transLang?.M?.source?.S;
        const targetLanguage = userSettings.Item.transLang?.M?.target?.S;

        if (!sourceLanguage || !targetLanguage) {
            return null;
        }

        try {
            const preprocessedText = this.preprocessMessage(message);
            const translatedText = await this.translateText(preprocessedText, sourceLanguage, targetLanguage);
            
            logger.translation(message.author.id, sourceLanguage, targetLanguage, true);
            return translatedText;
        } catch (error) {
            logger.translation(message.author.id, sourceLanguage, targetLanguage, false, error);
            throw error;
        }
    }
}

module.exports = TranslateService;