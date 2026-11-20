type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
    private static instance: Logger;
    private debugEnabled: boolean;

    private constructor() {
        this.debugEnabled = process.env.NODE_ENV !== 'production';
    }

    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ` ${args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}` : '';
        return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedArgs}`;
    }

    public debug(message: string, ...args: any[]): void {
        if (this.debugEnabled) {
            console.debug(this.formatMessage('debug', message, ...args));
        }
    }

    public info(message: string, ...args: any[]): void {
        console.info(this.formatMessage('info', message, ...args));
    }

    public warn(message: string, ...args: any[]): void {
        console.warn(this.formatMessage('warn', message, ...args));
    }

    public error(message: string | Error, ...args: any[]): void {
        const errorMessage = message instanceof Error ? message.message : message;
        const stack = message instanceof Error ? message.stack : undefined;
        console.error(this.formatMessage('error', errorMessage, ...args));
        if (stack) {
            console.error(stack);
        }
    }
}

export const logger = Logger.getInstance();
