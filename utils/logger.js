const fs = require('node:fs');
const path = require('node:path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../logs');
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...(data && { data })
        };
        return JSON.stringify(logEntry);
    }

    writeToFile(filename, message) {
        try {
            const logFile = path.join(this.logDir, filename);
            fs.appendFileSync(logFile, message + '\n');
        } catch (error) {
            console.error('로그 파일 쓰기 실패:', error);
        }
    }

    info(message, data = null) {
        const formattedMessage = this.formatMessage('INFO', message, data);
        console.log(`[INFO] ${message}`);
        this.writeToFile('app.log', formattedMessage);
    }

    error(message, error = null) {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
        } : null;
        
        const formattedMessage = this.formatMessage('ERROR', message, errorData);
        console.error(`[ERROR] ${message}`, error);
        this.writeToFile('error.log', formattedMessage);
    }

    warn(message, data = null) {
        const formattedMessage = this.formatMessage('WARN', message, data);
        console.warn(`[WARN] ${message}`);
        this.writeToFile('app.log', formattedMessage);
    }

    debug(message, data = null) {
        if (process.env.NODE_ENV === 'development') {
            const formattedMessage = this.formatMessage('DEBUG', message, data);
            console.debug(`[DEBUG] ${message}`);
            this.writeToFile('debug.log', formattedMessage);
        }
    }

    // 특정 기능별 로거
    command(commandName, userId, guildId, success = true, error = null) {
        const logData = {
            commandName,
            userId,
            guildId,
            success,
            ...(error && { error: error.message })
        };
        
        const level = success ? 'INFO' : 'ERROR';
        const message = `Command ${commandName} ${success ? 'executed' : 'failed'} by user ${userId}`;
        
        this.writeToFile('commands.log', this.formatMessage(level, message, logData));
    }

    translation(userId, fromLang, toLang, success = true, error = null) {
        const logData = {
            userId,
            fromLang,
            toLang,
            success,
            ...(error && { error: error.message })
        };
        
        const level = success ? 'INFO' : 'ERROR';
        const message = `Translation ${success ? 'successful' : 'failed'} from ${fromLang} to ${toLang}`;
        
        this.writeToFile('translations.log', this.formatMessage(level, message, logData));
    }

    roleUpdate(userId, oldRole, newRole, success = true, error = null) {
        const logData = {
            userId,
            oldRole,
            newRole,
            success,
            ...(error && { error: error.message })
        };
        
        const level = success ? 'INFO' : 'ERROR';
        const message = `Role update ${success ? 'successful' : 'failed'} for user ${userId}`;
        
        this.writeToFile('roles.log', this.formatMessage(level, message, logData));
    }
}

// 자동 메시지 삭제 유틸리티
class MessageUtils {
    static async replyAndDelete(message, content, delay = 3000) {
        try {
            const reply = await message.reply(content);
            setTimeout(async () => {
                try {
                    await reply.delete();
                } catch (deleteError) {
                    // 메시지가 이미 삭제되었거나 권한이 없는 경우 무시
                    console.debug('메시지 삭제 실패 (무시됨):', deleteError.message);
                }
            }, delay);
            return reply;
        } catch (error) {
            console.error('메시지 전송 실패:', error);
            throw error;
        }
    }

    static async followUpAndDelete(interaction, content, delay = 3000) {
        try {
            const followUp = await interaction.followUp(content);
            setTimeout(async () => {
                try {
                    await followUp.delete();
                } catch (deleteError) {
                    console.debug('팔로우업 메시지 삭제 실패 (무시됨):', deleteError.message);
                }
            }, delay);
            return followUp;
        } catch (error) {
            console.error('팔로우업 메시지 전송 실패:', error);
            throw error;
        }
    }
}

module.exports = new Logger();
module.exports.MessageUtils = MessageUtils;