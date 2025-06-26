import fs from 'fs/promises';
import path from 'path';
import { Logger } from './logger';
import { Config } from './config';

export interface AuthTokens {
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  localId: string;
  email: string;
  loginTime: number;
}

export interface UserData {
  profile: any;
  settings: any;
  results: any[];
  biomarkers: any[];
  categories: any[];
  recommendations: any[];
  reports: any[];
  biologicalAge: any;
  bmi: any;
  notes: any[];
  notifications: any[];
  cards: any[];
  codes: any[];
  inviteCode: any;
  requisitions: any[];
  pendingSchedules: any[];
  smartAddons: any[];
  myStory: any;
  biomarkerDetails: any[];
  individualBiomarkers: any[];
}

export class FunctionHealthClient {
  private config: Config;
  private logger: Logger;
  private tokens: AuthTokens | null = null;
  private headers: Record<string, string>;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': config.userAgent,
      'fe-app-version': config.appVersion,
      'x-backend-skip-cache': 'true',
      'referer': 'https://my.functionhealth.com/'
    };
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    this.logger.startSpinner('Authenticating with Function Health...');
    
    try {
      const response = await this.retryRequest(async () => {
        return fetch(`${this.config.baseUrl}/login`, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ email, password })
        });
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Login failed: ${response.status} ${response.statusText}. ${errorText}`);
      }

      const data = await response.json() as any;
      
      if (!data.idToken || !data.refreshToken) {
        throw new Error('Invalid login response - missing authentication tokens');
      }

      this.tokens = {
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: parseInt(data.expiresIn),
        localId: data.localId,
        email: data.email,
        loginTime: Date.now()
      };

      this.logger.succeedSpinner('Authentication successful');
      this.logger.debug(`Token expires in ${this.tokens.expiresIn} seconds`);
      
      return this.tokens;
    } catch (error) {
      this.logger.failSpinner('Authentication failed');
      throw error;
    }
  }

  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.tokens) {
      throw new Error('Not authenticated - call login() first');
    }

    const tokenAge = (Date.now() - this.tokens.loginTime) / 1000;
    
    if (tokenAge > (this.tokens.expiresIn - this.config.tokenRefreshBuffer)) {
      this.logger.startSpinner('Refreshing authentication token...');
      
      try {
        const response = await this.retryRequest(async () => {
          return fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyDnxHI-7Xh7JtQrYzRv8n8wJNl3jH5jKl0', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              grant_type: 'refresh_token',
              refresh_token: this.tokens!.refreshToken
            })
          });
        });

        if (response.ok) {
          const data = await response.json() as any;
          this.tokens.idToken = data.access_token;
          this.tokens.expiresIn = parseInt(data.expires_in);
          this.tokens.loginTime = Date.now();
          this.logger.succeedSpinner('Token refreshed successfully');
          this.logger.debug(`New token expires in ${this.tokens.expiresIn} seconds`);
        } else {
          throw new Error(`Token refresh failed: ${response.status}`);
        }
      } catch (error) {
        this.logger.failSpinner('Token refresh failed');
        throw error;
      }
    }
  }

  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempts: number = this.config.retryAttempts
  ): Promise<T> {
    for (let i = 0; i < attempts; i++) {
      try {
        if (i > 0) {
          this.logger.debug(`Retry attempt ${i + 1}/${attempts}`);
          await this.delay(this.config.retryDelay * Math.pow(2, i)); // Exponential backoff
        }
        
        return await requestFn();
      } catch (error) {
        if (i === attempts - 1) {
          throw error;
        }
        this.logger.warn(`Request failed, retrying... (${i + 1}/${attempts})`);
      }
    }
    
    throw new Error('All retry attempts failed');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async makeRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
    await this.refreshTokenIfNeeded();
    
    if (!this.tokens) {
      throw new Error('Not authenticated');
    }

    const url = `${this.config.baseUrl}${endpoint}`;
    const requestHeaders = {
      ...this.headers,
      'Authorization': `Bearer ${this.tokens.idToken}`
    };

    this.logger.debug(`${method} ${endpoint}`);

    try {
      const response = await this.retryRequest(async () => {
        await this.delay(this.config.rateLimit); // Rate limiting
        
        return fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined
        });
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        this.logger.warn(`${endpoint} failed: ${response.status} ${response.statusText}`);
        
        if (response.status === 401) {
          throw new Error('Authentication expired. Please log in again.');
        }
        
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        return null;
      }

      const data = await response.json();
      const dataSize = JSON.stringify(data).length;
      this.logger.debug(`${endpoint} - ${dataSize} bytes received`);
      
      return data;
    } catch (error) {
      this.logger.error(`Request to ${endpoint} failed`, error as Error);
      return null;
    }
  }

  async fetchUserProfile(): Promise<any> {
    return await this.makeRequest('/user');
  }

  async fetchUserSettings(): Promise<any> {
    return await this.makeRequest('/user/settings');
  }

  async fetchResults(): Promise<any[]> {
    return await this.makeRequest('/results') || [];
  }

  async fetchBiomarkers(): Promise<any[]> {
    return await this.makeRequest('/biomarkers') || [];
  }

  async fetchCategories(): Promise<any[]> {
    return await this.makeRequest('/categories') || [];
  }

  async fetchRecommendations(): Promise<any[]> {
    return await this.makeRequest('/recommendations') || [];
  }

  async fetchResultsReport(): Promise<any> {
    return await this.makeRequest('/results-report');
  }

  async fetchBiologicalAge(): Promise<any> {
    return await this.makeRequest('/biological-calculations/biological-age');
  }

  async fetchBMI(): Promise<any> {
    const results = await this.fetchResults();
    if (results && results.length > 0) {
      // Try to get BMI for the latest requisition
      const latestRequisition = results[0]?.requisition_id;
      if (latestRequisition) {
        return await this.makeRequest(`/biological-calculations/bmi?requisition_id=${latestRequisition}`);
      }
    }
    return await this.makeRequest('/biological-calculations/bmi');
  }

  async fetchNotes(): Promise<any[]> {
    return await this.makeRequest('/notes') || [];
  }

  async fetchNotifications(): Promise<any[]> {
    return await this.makeRequest('/notifications') || [];
  }

  async fetchUserCards(): Promise<any[]> {
    return await this.makeRequest('/user/cards') || [];
  }

  async fetchUserCodes(): Promise<any[]> {
    return await this.makeRequest('/user/codes') || [];
  }

  async fetchInviteCode(): Promise<any> {
    return await this.makeRequest('/user/invite-code');
  }

  async fetchRequisitions(): Promise<any[]> {
    const pending = await this.makeRequest('/requisitions?pending=true') || [];
    const completed = await this.makeRequest('/requisitions?pending=false') || [];
    return [...pending, ...completed];
  }

  async fetchPendingSchedules(): Promise<any[]> {
    return await this.makeRequest('/pending-schedules') || [];
  }

  async fetchSmartAddons(): Promise<any[]> {
    return await this.makeRequest('/smart-addons') || [];
  }

  async fetchMyStory(): Promise<any> {
    return await this.makeRequest('/my-function-story');
  }

  async fetchBiomarkerDetails(): Promise<any[]> {
    return await this.makeRequest('/biomarker-details') || [];
  }

  async fetchFeatureFlags(): Promise<any> {
    return await this.makeRequest('/feature-flags');
  }

  async fetchIndividualBiomarkers(biomarkerIds: string[]): Promise<any[]> {
    const individualData = [];
    const total = biomarkerIds.length;
    
    this.logger.debug(`Fetching ${total} individual biomarker details...`);
    
    for (let i = 0; i < biomarkerIds.length; i++) {
      const id = biomarkerIds[i];
      
      // Update progress
      if (total > 10) {
        this.logger.updateSpinner(`🔬 Fetching biomarker ${i + 1}/${total}...`);
      }
      
      const data = await this.makeRequest(`/biomarker-data/${id}`);
      if (data) {
        individualData.push({ id, data });
        this.logger.debug(`Retrieved biomarker ${id} (${i + 1}/${total})`);
      } else {
        this.logger.debug(`Failed to retrieve biomarker ${id} (${i + 1}/${total})`);
      }
      
      // Small delay to be respectful (but not too slow)
      await this.delay(250);
    }
    
    return individualData;
  }

  async fetchAllData(): Promise<UserData> {
    this.logger.divider('DATA EXTRACTION');
    this.logger.info('Starting comprehensive data extraction...');
    
    const userData: UserData = {
      profile: null,
      settings: null,
      results: [],
      biomarkers: [],
      categories: [],
      recommendations: [],
      reports: [],
      biologicalAge: null,
      bmi: null,
      notes: [],
      notifications: [],
      cards: [],
      codes: [],
      inviteCode: null,
      requisitions: [],
      pendingSchedules: [],
      smartAddons: [],
      myStory: null,
      biomarkerDetails: [],
      individualBiomarkers: []
    };

    const sections = [
      {
        name: 'User Profile Data',
        icon: '👤',
        tasks: [
          { name: 'profile', fn: () => this.fetchUserProfile() },
          { name: 'settings', fn: () => this.fetchUserSettings() },
          { name: 'inviteCode', fn: () => this.fetchInviteCode() },
          { name: 'cards', fn: () => this.fetchUserCards() },
          { name: 'codes', fn: () => this.fetchUserCodes() }
        ]
      },
      {
        name: 'Health Data',
        icon: '🏥',
        tasks: [
          { name: 'results', fn: () => this.fetchResults() },
          { name: 'biomarkers', fn: () => this.fetchBiomarkers() },
          { name: 'categories', fn: () => this.fetchCategories() },
          { name: 'biomarkerDetails', fn: () => this.fetchBiomarkerDetails() }
        ]
      },
      {
        name: 'Reports & Analysis',
        icon: '📊',
        tasks: [
          { name: 'reports', fn: () => this.fetchResultsReport() },
          { name: 'recommendations', fn: () => this.fetchRecommendations() },
          { name: 'biologicalAge', fn: () => this.fetchBiologicalAge() },
          { name: 'bmi', fn: () => this.fetchBMI() },
          { name: 'myStory', fn: () => this.fetchMyStory() }
        ]
      },
      {
        name: 'User Interactions',
        icon: '📝',
        tasks: [
          { name: 'notes', fn: () => this.fetchNotes() },
          { name: 'notifications', fn: () => this.fetchNotifications() }
        ]
      },
      {
        name: 'Lab & Scheduling',
        icon: '🧪',
        tasks: [
          { name: 'requisitions', fn: () => this.fetchRequisitions() },
          { name: 'pendingSchedules', fn: () => this.fetchPendingSchedules() },
          { name: 'smartAddons', fn: () => this.fetchSmartAddons() }
        ]
      }
    ];

    try {
      for (const section of sections) {
        this.logger.startSpinner(`${section.icon} Fetching ${section.name.toLowerCase()}...`);
        
        for (const task of section.tasks) {
          try {
            const result = await task.fn();
            (userData as any)[task.name] = result;
            
            if (result !== null && result !== undefined) {
              const count = Array.isArray(result) ? result.length : 'data';
              this.logger.debug(`${task.name}: ${count} items`);
            }
          } catch (error) {
            this.logger.warn(`Failed to fetch ${task.name}: ${(error as Error).message}`);
          }
        }
        
        this.logger.succeedSpinner(`${section.icon} ${section.name} completed`);
      }

      // Individual biomarker data (limited sample)
      if (userData.biomarkers && userData.biomarkers.length > 0) {
        this.logger.startSpinner('🔬 Fetching sample biomarker details...');
        
        const biomarkerIds = userData.biomarkers
          .map((b: any) => b.id)
          .filter(Boolean);
        
        // Apply limit only if configured (0 = no limit)
        const limitedIds = this.config.maxIndividualBiomarkers > 0 
          ? biomarkerIds.slice(0, this.config.maxIndividualBiomarkers)
          : biomarkerIds;
        
        if (limitedIds.length > 0) {
          const limitMsg = this.config.maxIndividualBiomarkers > 0 
            ? ` (limited to ${this.config.maxIndividualBiomarkers})`
            : '';
          this.logger.updateSpinner(`🔬 Fetching ${limitedIds.length} individual biomarker details${limitMsg}...`);
          
          userData.individualBiomarkers = await this.fetchIndividualBiomarkers(limitedIds);
          this.logger.succeedSpinner(`🔬 Retrieved ${userData.individualBiomarkers.length} biomarker details`);
        } else {
          this.logger.succeedSpinner('🔬 No biomarker IDs found');
        }
      }

      this.logger.success('Data extraction completed successfully!');
      return userData;
      
    } catch (error) {
      this.logger.error('Data extraction failed', error as Error);
      throw error;
    }
  }

  async exportData(userData: UserData, outputDir: string = 'function-health-export'): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });
    
    const timestamp = new Date().toISOString();
    const exportData = {
      exportInfo: {
        timestamp,
        email: this.tokens?.email,
        totalEndpoints: Object.keys(userData).length,
        exportVersion: '1.0.0'
      },
      userData
    };

    // Save complete export
    await fs.writeFile(
      path.join(outputDir, 'complete-function-health-data.json'),
      JSON.stringify(exportData, null, 2)
    );

    // Save individual sections
    const sections = [
      { name: 'profile', data: userData.profile },
      { name: 'settings', data: userData.settings },
      { name: 'health-results', data: userData.results },
      { name: 'biomarkers', data: userData.biomarkers },
      { name: 'categories', data: userData.categories },
      { name: 'recommendations', data: userData.recommendations },
      { name: 'reports', data: userData.reports },
      { name: 'biological-age', data: userData.biologicalAge },
      { name: 'bmi', data: userData.bmi },
      { name: 'notes', data: userData.notes },
      { name: 'notifications', data: userData.notifications },
      { name: 'cards', data: userData.cards },
      { name: 'invite-codes', data: userData.codes },
      { name: 'lab-requisitions', data: userData.requisitions },
      { name: 'pending-schedules', data: userData.pendingSchedules },
      { name: 'smart-addons', data: userData.smartAddons },
      { name: 'my-story', data: userData.myStory },
      { name: 'biomarker-details', data: userData.biomarkerDetails },
      { name: 'individual-biomarkers', data: userData.individualBiomarkers }
    ];

    for (const section of sections) {
      if (section.data !== null && section.data !== undefined) {
        await fs.writeFile(
          path.join(outputDir, `${section.name}.json`),
          JSON.stringify({
            timestamp,
            section: section.name,
            data: section.data
          }, null, 2)
        );
      }
    }

    console.log(`\n💾 Export completed! Files saved to: ${outputDir}/`);
    console.log('📁 Files created:');
    console.log('   📄 complete-function-health-data.json - Complete export');
    
    sections.forEach(section => {
      if (section.data !== null && section.data !== undefined) {
        const size = Array.isArray(section.data) ? section.data.length : 'object';
        console.log(`   📄 ${section.name}.json - ${size} records`);
      }
    });
  }
}