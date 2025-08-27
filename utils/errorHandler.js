const logger = require('./logger');
const { MessageUtils } = require('./logger');

class ErrorHandler {
    static async handleCommandError(interaction, error, commandName) {
        logger.command(commandName, interaction.user.id, interaction.guildId, false, error);
        
        const errorMessage = {
            content: '명령어 실행 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
            ephemeral: true
        };

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (followUpError) {
            logger.error('Error sending error message to user', followUpError);
        }
    }

    static handleTranslationError(userId, error, context = {}) {
        logger.translation(
            userId, 
            context.fromLang, 
            context.toLang, 
            false, 
            error
        );
        
        console.error('번역 처리 중 오류:', error);
    }

    static handleRoleUpdateError(userId, error, context = {}) {
        logger.roleUpdate(
            userId, 
            context.oldRole, 
            context.newRole, 
            false, 
            error
        );
        
        console.error('역할 업데이트 중 오류:', error);
    }

    static handleDatabaseError(operation, error, context = {}) {
        logger.error(`Database operation failed: ${operation}`, {
            error,
            context
        });
        
        console.error(`데이터베이스 작업 실패 (${operation}):`, error);
    }

    static setupGlobalHandlers() {
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Promise Rejection', {
                reason: reason?.message || reason,
                stack: reason?.stack,
                promise: promise.toString()
            });
            console.error('처리되지 않은 Promise 거부:', reason);
        });

        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception', error);
            console.error('처리되지 않은 예외:', error);
            // 심각한 오류이므로 프로세스 종료
            process.exit(1);
        });
    }

    static createAsyncWrapper(fn) {
        return async (...args) => {
            try {
                await fn(...args);
            } catch (error) {
                logger.error('Async function error', error);
            }
        };
    }
}

module.exports = ErrorHandler;