import chalk from 'chalk';
import ora, { Ora } from 'ora';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface LogOptions {
  level?: LogLevel;
  verbose?: boolean;
  quiet?: boolean;
}

export class Logger {
  private options: LogOptions;
  private spinner: Ora | null = null;

  constructor(options: LogOptions = {}) {
    this.options = {
      level: 'info',
      verbose: false,
      quiet: false,
      ...options
    };
  }

  updateOptions(options: Partial<LogOptions>): void {
    this.options = { ...this.options, ...options };
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.options.quiet && level !== 'error') {
      return false;
    }

    const levels = ['debug', 'info', 'warn', 'error', 'success'];
    const currentLevelIndex = levels.indexOf(this.options.level || 'info');
    const messageLevelIndex = levels.indexOf(level);

    if (level === 'debug' && !this.options.verbose) {
      return false;
    }

    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString().substring(11, 19);
    const prefix = `[${timestamp}]`;

    switch (level) {
      case 'debug':
        return chalk.gray(`${prefix} 🔍 ${message}`);
      case 'info':
        return chalk.blue(`${prefix} ℹ️  ${message}`);
      case 'warn':
        return chalk.yellow(`${prefix} ⚠️  ${message}`);
      case 'error':
        return chalk.red(`${prefix} ❌ ${message}`);
      case 'success':
        return chalk.green(`${prefix} ✅ ${message}`);
      default:
        return `${prefix} ${message}`;
    }
  }

  debug(message: string): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message));
    }
  }

  info(message: string): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message));
    }
  }

  warn(message: string): void {
    if (this.shouldLog('warn')) {
      console.log(this.formatMessage('warn', message));
    }
  }

  error(message: string, error?: Error): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message));
      if (error && this.options.verbose) {
        console.error(chalk.red(error.stack || error.message));
      }
    }
  }

  success(message: string): void {
    if (this.shouldLog('success')) {
      console.log(this.formatMessage('success', message));
    }
  }

  startSpinner(text: string): void {
    if (this.options.quiet) return;
    
    this.stopSpinner();
    this.spinner = ora({
      text,
      color: 'blue',
      spinner: 'dots'
    }).start();
  }

  updateSpinner(text: string): void {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  succeedSpinner(text?: string): void {
    if (this.spinner) {
      this.spinner.succeed(text);
      this.spinner = null;
    }
  }

  failSpinner(text?: string): void {
    if (this.spinner) {
      this.spinner.fail(text);
      this.spinner = null;
    }
  }

  stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  table(data: Array<Record<string, any>>, headers?: string[]): void {
    if (this.options.quiet) return;
    
    console.table(data, headers);
  }

  divider(title?: string): void {
    if (this.options.quiet) return;
    
    const line = '━'.repeat(60);
    if (title) {
      const padding = Math.max(0, Math.floor((60 - title.length - 2) / 2));
      const paddedTitle = '━'.repeat(padding) + ` ${title} ` + '━'.repeat(padding);
      console.log(chalk.blue(paddedTitle));
    } else {
      console.log(chalk.blue(line));
    }
  }

  box(title: string, content: string[]): void {
    if (this.options.quiet) return;
    
    const maxLength = Math.max(title.length, ...content.map(line => line.length));
    const width = Math.min(maxLength + 4, 80);
    
    console.log(chalk.blue('┌' + '─'.repeat(width - 2) + '┐'));
    console.log(chalk.blue('│ ') + chalk.bold(title.padEnd(width - 4)) + chalk.blue(' │'));
    console.log(chalk.blue('├' + '─'.repeat(width - 2) + '┤'));
    
    content.forEach(line => {
      console.log(chalk.blue('│ ') + line.padEnd(width - 4) + chalk.blue(' │'));
    });
    
    console.log(chalk.blue('└' + '─'.repeat(width - 2) + '┘'));
  }
}