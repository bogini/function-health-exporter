import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface Config {
  baseUrl: string;
  outputDir: string;
  retryAttempts: number;
  retryDelay: number;
  rateLimit: number;
  tokenRefreshBuffer: number;
  maxIndividualBiomarkers: number;
  userAgent: string;
  appVersion: string;
}

export interface SavedCredentials {
  email?: string;
  // Never save passwords in config
}

const DEFAULT_CONFIG: Config = {
  baseUrl: 'https://production-member-app-mid-lhuqotpy2a-ue.a.run.app/api/v1',
  outputDir: 'function-health-export',
  retryAttempts: 3,
  retryDelay: 1000,
  rateLimit: 500,
  tokenRefreshBuffer: 300,
  maxIndividualBiomarkers: 0, // 0 = no limit, fetch all
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  appVersion: '0.84.0'
};

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private credentialsPath: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.function-health-cli');
    this.configPath = path.join(this.configDir, 'config.json');
    this.credentialsPath = path.join(this.configDir, 'credentials.json');
  }

  async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, that's fine
    }
  }

  async loadConfig(): Promise<Config> {
    await this.ensureConfigDir();
    
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const userConfig = JSON.parse(configData);
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch (error) {
      // Config doesn't exist, return defaults
      return DEFAULT_CONFIG;
    }
  }

  async saveConfig(config: Partial<Config>): Promise<void> {
    await this.ensureConfigDir();
    
    const currentConfig = await this.loadConfig();
    const newConfig = { ...currentConfig, ...config };
    
    await fs.writeFile(this.configPath, JSON.stringify(newConfig, null, 2));
  }

  async loadCredentials(): Promise<SavedCredentials> {
    try {
      const credData = await fs.readFile(this.credentialsPath, 'utf-8');
      return JSON.parse(credData);
    } catch (error) {
      return {};
    }
  }

  async saveCredentials(credentials: SavedCredentials): Promise<void> {
    await this.ensureConfigDir();
    await fs.writeFile(this.credentialsPath, JSON.stringify(credentials, null, 2));
  }

  async clearCredentials(): Promise<void> {
    try {
      await fs.unlink(this.credentialsPath);
    } catch (error) {
      // File might not exist, that's fine
    }
  }

  getConfigPath(): string {
    return this.configPath;
  }
}