import fs from "fs/promises";
import path from "path";
import { Logger } from "./logger";
import { Config } from "./config";

export interface AuthTokens {
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  localId: string;
  email: string;
  loginTime: number;
}

export interface UserProfile {
  id: string;
  patientIdentifier: string;
  fname: string;
  lname: string;
  preferredName: string;
  biologicalSex: string;
  dob: string;
  pronouns: string;
  canScheduleInBetaStates: boolean;
  patientContactInfo: {
    email: string;
    phoneNumber: string;
    streetAddress: string;
    city: string;
    state: string;
    zip: string;
  };
  dateJoined: string;
  intake_status: boolean;
  patientMembership: string;
}

export interface UserSettings {
  [key: string]: unknown;
}

export interface HealthResult {
  id: string;
  dateOfService: string;
  calculatedResult: string;
  displayResult: string;
  inRange: boolean;
  requisitionId: string;
}

export interface SexDetails {
  id: string;
  sex: string;
  oneLineDescription: string;
  optimalRangeHigh: string;
  optimalRangeLow: string;
  questRefRangeHigh: string;
  questRefRangeLow: string;
}

export interface Biomarker {
  id: string;
  name: string;
  questBiomarkerCode: string;
  categories: Array<{ id: string; categoryName: string }>;
  sexDetails: SexDetails[];
  status: string | null;
}

export interface Category {
  id: string;
  categoryName: string;
  description: string;
  biomarkers: Biomarker[];
}

export interface IndividualBiomarkerData {
  id: string;
  name: string;
  oneLineDescription: string;
  whyItMatters: string;
  recommendations: string;
  causesDescription: string;
  symptomsDescription: string;
  foodsToEatDescription: string;
  foodsToAvoidDescription: string;
  supplementsDescription: string;
  selfCareDescription: string;
  additionalTestsDescription: string;
  followUpDescription: string;
  resourcesCited: string;
  sexFilter: string;
  fullData: Record<string, unknown> | null;
}

export interface UserData {
  profile: UserProfile | null;
  settings: UserSettings | null;
  results: HealthResult[];
  biomarkers: Biomarker[];
  categories: Category[];
  recommendations: Record<string, unknown>[];
  reports: Record<string, unknown>[];
  biologicalAge: Record<string, unknown> | null;
  bmi: Record<string, unknown> | null;
  notes: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  cards: Record<string, unknown>[];
  codes: Record<string, unknown>[];
  inviteCode: Record<string, unknown> | null;
  requisitions: Record<string, unknown>[];
  pendingSchedules: Record<string, unknown>[];
  smartAddons: Record<string, unknown>[];
  myStory: Record<string, unknown> | null;
  biomarkerDetails: Record<string, unknown>[];
  individualBiomarkers: IndividualBiomarkerData[];
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
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": config.userAgent,
      "fe-app-version": config.appVersion,
      "x-backend-skip-cache": "true",
      referer: "https://my.functionhealth.com/",
    };
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    this.logger.startSpinner("Authenticating with Function Health...");

    try {
      const response = await this.retryRequest(async () => {
        return fetch(`${this.config.baseUrl}/login`, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({ email, password }),
        });
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `Login failed: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const data = (await response.json()) as AuthTokens;

      if (!data.idToken || !data.refreshToken) {
        throw new Error(
          "Invalid login response - missing authentication tokens"
        );
      }

      this.tokens = {
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: parseInt(String(data.expiresIn)),
        localId: data.localId,
        email: data.email,
        loginTime: Date.now(),
      };

      this.logger.succeedSpinner("Authentication successful");
      this.logger.debug(`Token expires in ${this.tokens.expiresIn} seconds`);

      return this.tokens;
    } catch (error) {
      this.logger.failSpinner("Authentication failed");
      throw error;
    }
  }

  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.tokens) {
      throw new Error("Not authenticated - call login() first");
    }

    const tokenAge = (Date.now() - this.tokens.loginTime) / 1000;

    if (tokenAge > this.tokens.expiresIn - this.config.tokenRefreshBuffer) {
      this.logger.startSpinner("Refreshing authentication token...");

      try {
        const response = await this.retryRequest(async () => {
          return fetch(
            "https://securetoken.googleapis.com/v1/token?key=AIzaSyDnxHI-7Xh7JtQrYzRv8n8wJNl3jH5jKl0",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                grant_type: "refresh_token",
                refresh_token: this.tokens!.refreshToken,
              }),
            }
          );
        });

        if (response.ok) {
          const data = (await response.json()) as {
            access_token: string;
            expires_in: string;
          };
          this.tokens.idToken = data.access_token;
          this.tokens.expiresIn = parseInt(data.expires_in);
          this.tokens.loginTime = Date.now();
          this.logger.succeedSpinner("Token refreshed successfully");
          this.logger.debug(
            `New token expires in ${this.tokens.expiresIn} seconds`
          );
        } else {
          throw new Error(`Token refresh failed: ${response.status}`);
        }
      } catch (error) {
        this.logger.failSpinner("Token refresh failed");
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

    throw new Error("All retry attempts failed");
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async makeRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    await this.refreshTokenIfNeeded();

    if (!this.tokens) {
      throw new Error("Not authenticated");
    }

    const url = `${this.config.baseUrl}${endpoint}`;
    const requestHeaders = {
      ...this.headers,
      Authorization: `Bearer ${this.tokens.idToken}`,
    };

    this.logger.debug(`${method} ${endpoint}`);

    try {
      const response = await this.retryRequest(async () => {
        await this.delay(this.config.rateLimit); // Rate limiting

        return fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        this.logger.warn(
          `${endpoint} failed: ${response.status} ${response.statusText}`
        );

        if (response.status === 401) {
          throw new Error("Authentication expired. Please log in again.");
        }

        if (response.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }

        if (response.status >= 500) {
          throw new Error(
            `Server error: ${response.status} ${response.statusText}`
          );
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

  async fetchUserProfile(): Promise<UserProfile | null> {
    const result = await this.makeRequest("/user");
    return result ? (result as unknown as UserProfile) : null;
  }

  async fetchUserSettings(): Promise<UserSettings | null> {
    const result = await this.makeRequest("/user/settings");
    return result as UserSettings | null;
  }

  async fetchResults(): Promise<HealthResult[]> {
    const result = await this.makeRequest("/results");
    return Array.isArray(result) ? (result as HealthResult[]) : [];
  }

  async fetchBiomarkers(): Promise<Biomarker[]> {
    const result = await this.makeRequest("/biomarkers");
    return Array.isArray(result) ? (result as Biomarker[]) : [];
  }

  async fetchCategories(): Promise<Category[]> {
    const result = await this.makeRequest("/categories");
    return Array.isArray(result) ? (result as Category[]) : [];
  }

  async fetchRecommendations(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/recommendations");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchResultsReport(): Promise<Record<string, unknown> | null> {
    return await this.makeRequest("/results-report");
  }

  async fetchBiologicalAge(): Promise<Record<string, unknown> | null> {
    return await this.makeRequest("/biological-calculations/biological-age");
  }

  async fetchBMI(): Promise<Record<string, unknown> | null> {
    const results = await this.fetchResults();
    if (results && results.length > 0) {
      // Try to get BMI for the latest requisition
      const latestRequisition = (
        results[0] as unknown as Record<string, unknown>
      )?.requisition_id as string;
      if (latestRequisition) {
        return await this.makeRequest(
          `/biological-calculations/bmi?requisition_id=${latestRequisition}`
        );
      }
    }
    return await this.makeRequest("/biological-calculations/bmi");
  }

  async fetchNotes(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/notes");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchNotifications(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/notifications");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchUserCards(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/user/cards");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchUserCodes(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/user/codes");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchInviteCode(): Promise<Record<string, unknown> | null> {
    return await this.makeRequest("/user/invite-code");
  }

  async fetchRequisitions(): Promise<Record<string, unknown>[]> {
    const pending = await this.makeRequest("/requisitions?pending=true");
    const completed = await this.makeRequest("/requisitions?pending=false");
    const pendingArray = Array.isArray(pending)
      ? (pending as Record<string, unknown>[])
      : [];
    const completedArray = Array.isArray(completed)
      ? (completed as Record<string, unknown>[])
      : [];
    return [...pendingArray, ...completedArray];
  }

  async fetchPendingSchedules(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/pending-schedules");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchSmartAddons(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/smart-addons");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchMyStory(): Promise<Record<string, unknown> | null> {
    return await this.makeRequest("/my-function-story");
  }

  async fetchBiomarkerDetails(): Promise<Record<string, unknown>[]> {
    const result = await this.makeRequest("/biomarker-details");
    return Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
  }

  async fetchFeatureFlags(): Promise<Record<string, unknown> | null> {
    return await this.makeRequest("/feature-flags");
  }

  async fetchIndividualBiomarkers(
    biomarkers: Biomarker[],
    userSex?: string
  ): Promise<IndividualBiomarkerData[]> {
    const individualData: IndividualBiomarkerData[] = [];
    const total = biomarkers.length;

    // Determine sex filter for API calls
    const sexFilter =
      userSex?.toLowerCase() === "male"
        ? "Male"
        : userSex?.toLowerCase() === "female"
        ? "Female"
        : "All";

    this.logger.debug(
      `Fetching ${total} individual biomarker details (sex filter: ${sexFilter})...`
    );

    for (let i = 0; i < biomarkers.length; i++) {
      const biomarker = biomarkers[i];

      // Update progress
      if (total > 10) {
        this.logger.updateSpinner(`🔬 Fetching biomarker ${i + 1}/${total}...`);
      }

      // Find the correct sexDetailsId based on user's biological sex
      let sexDetailsId: string | null = null;
      
      // Try to find exact sex match first
      const exactMatch = biomarker.sexDetails.find(sd => sd.sex === sexFilter);
      if (exactMatch) {
        sexDetailsId = exactMatch.id;
      } else {
        // Fallback to "All" if no exact match
        const allMatch = biomarker.sexDetails.find(sd => sd.sex === "All");
        if (allMatch) {
          sexDetailsId = allMatch.id;
        }
      }

      if (!sexDetailsId) {
        this.logger.debug(
          `No suitable sexDetails found for biomarker ${biomarker.name} (${i + 1}/${total})`
        );
        // Add empty entry to maintain consistency
        const emptyBiomarkerDetails: IndividualBiomarkerData = {
          id: biomarker.id,
          name: biomarker.name,
          oneLineDescription: "",
          whyItMatters: "",
          recommendations: "",
          causesDescription: "",
          symptomsDescription: "",
          foodsToEatDescription: "",
          foodsToAvoidDescription: "",
          supplementsDescription: "",
          selfCareDescription: "",
          additionalTestsDescription: "",
          followUpDescription: "",
          resourcesCited: "",
          sexFilter: sexFilter.toLowerCase(),
          fullData: null,
        };
        individualData.push(emptyBiomarkerDetails);
        continue;
      }

      // Use production API endpoint with correct sexDetailsId
      const data = await this.makeRequest(`/biomarker-data/${sexDetailsId}`);
      if (data) {
        this.logger.debug(
          `Raw biomarker data for ${biomarker.name} (sexDetailsId: ${sexDetailsId}): ${JSON.stringify(data, null, 2)}`
        );

        // Extract comprehensive biomarker details with sex-specific information
        const biomarkerDetails: IndividualBiomarkerData = {
          id: biomarker.id,
          name: String(data.name || biomarker.name),
          oneLineDescription: String(data.oneLineDescription || ""),
          whyItMatters: String(data.whyItMatters || ""),
          recommendations: String(data.recommendations || ""),
          causesDescription: String(data.causesDescription || ""),
          symptomsDescription: String(data.symptomsDescription || ""),
          foodsToEatDescription: String(data.foodsToEatDescription || ""),
          foodsToAvoidDescription: String(data.foodsToAvoidDescription || ""),
          supplementsDescription: String(data.supplementsDescription || ""),
          selfCareDescription: String(data.selfCareDescription || ""),
          additionalTestsDescription: String(
            data.additionalTestsDescription || ""
          ),
          followUpDescription: String(data.followUpDescription || ""),
          resourcesCited: String(data.resourcesCited || ""),
          sexFilter: sexFilter.toLowerCase(),
          fullData: data as Record<string, unknown>,
        };

        individualData.push(biomarkerDetails);
        this.logger.debug(
          `Retrieved comprehensive data for biomarker ${biomarker.name} (${i + 1}/${total})`
        );
      } else {
        this.logger.debug(
          `Failed to retrieve biomarker data for ${biomarker.name} (sexDetailsId: ${sexDetailsId}) (${i + 1}/${total})`
        );
        // Add empty entry to maintain consistency
        const emptyBiomarkerDetails: IndividualBiomarkerData = {
          id: biomarker.id,
          name: biomarker.name,
          oneLineDescription: "",
          whyItMatters: "",
          recommendations: "",
          causesDescription: "",
          symptomsDescription: "",
          foodsToEatDescription: "",
          foodsToAvoidDescription: "",
          supplementsDescription: "",
          selfCareDescription: "",
          additionalTestsDescription: "",
          followUpDescription: "",
          resourcesCited: "",
          sexFilter: sexFilter.toLowerCase(),
          fullData: null,
        };
        individualData.push(emptyBiomarkerDetails);
      }

      // Small delay to be respectful (but not too slow)
      await this.delay(250);
    }

    return individualData;
  }

  async fetchAllData(): Promise<UserData> {
    this.logger.divider("DATA EXTRACTION");
    this.logger.info("Starting comprehensive data extraction...");

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
      individualBiomarkers: [],
    };

    const sections = [
      {
        name: "User Profile Data",
        icon: "👤",
        tasks: [
          { name: "profile", fn: () => this.fetchUserProfile() },
          { name: "settings", fn: () => this.fetchUserSettings() },
          { name: "inviteCode", fn: () => this.fetchInviteCode() },
          { name: "cards", fn: () => this.fetchUserCards() },
          { name: "codes", fn: () => this.fetchUserCodes() },
        ],
      },
      {
        name: "Health Data",
        icon: "🏥",
        tasks: [
          { name: "results", fn: () => this.fetchResults() },
          { name: "biomarkers", fn: () => this.fetchBiomarkers() },
          { name: "categories", fn: () => this.fetchCategories() },
          { name: "biomarkerDetails", fn: () => this.fetchBiomarkerDetails() },
        ],
      },
      {
        name: "Reports & Analysis",
        icon: "📊",
        tasks: [
          { name: "reports", fn: () => this.fetchResultsReport() },
          { name: "recommendations", fn: () => this.fetchRecommendations() },
          { name: "biologicalAge", fn: () => this.fetchBiologicalAge() },
          { name: "bmi", fn: () => this.fetchBMI() },
          { name: "myStory", fn: () => this.fetchMyStory() },
        ],
      },
      {
        name: "User Interactions",
        icon: "📝",
        tasks: [
          { name: "notes", fn: () => this.fetchNotes() },
          { name: "notifications", fn: () => this.fetchNotifications() },
        ],
      },
      {
        name: "Lab & Scheduling",
        icon: "🧪",
        tasks: [
          { name: "requisitions", fn: () => this.fetchRequisitions() },
          { name: "pendingSchedules", fn: () => this.fetchPendingSchedules() },
          { name: "smartAddons", fn: () => this.fetchSmartAddons() },
        ],
      },
    ];

    try {
      for (const section of sections) {
        this.logger.startSpinner(
          `${section.icon} Fetching ${section.name.toLowerCase()}...`
        );

        for (const task of section.tasks) {
          try {
            const result = await task.fn();
            (userData as unknown as Record<string, unknown>)[task.name] =
              result;

            if (result !== null && result !== undefined) {
              const count = Array.isArray(result) ? result.length : "data";
              this.logger.debug(`${task.name}: ${count} items`);
            }
          } catch (error) {
            this.logger.warn(
              `Failed to fetch ${task.name}: ${(error as Error).message}`
            );
          }
        }

        this.logger.succeedSpinner(`${section.icon} ${section.name} completed`);
      }

      // Individual biomarker data with sex-specific filtering
      if (userData.biomarkers && userData.biomarkers.length > 0) {
        this.logger.startSpinner(
          "🔬 Fetching comprehensive biomarker details..."
        );

        // Extract user's biological sex from profile for sex-specific data
        const userSex = userData.profile?.biologicalSex || "all";

        // Apply limit only if configured (0 = no limit)
        const limitedBiomarkers =
          this.config.maxIndividualBiomarkers > 0
            ? userData.biomarkers.slice(0, this.config.maxIndividualBiomarkers)
            : userData.biomarkers;

        if (limitedBiomarkers.length > 0) {
          const limitMsg =
            this.config.maxIndividualBiomarkers > 0
              ? ` (limited to ${this.config.maxIndividualBiomarkers})`
              : "";
          this.logger.updateSpinner(
            `🔬 Fetching ${limitedBiomarkers.length} sex-specific biomarker details${limitMsg}...`
          );

          userData.individualBiomarkers = await this.fetchIndividualBiomarkers(
            limitedBiomarkers,
            userSex
          );
          this.logger.succeedSpinner(
            `🔬 Retrieved ${userData.individualBiomarkers.length} comprehensive biomarker details (${userSex})`
          );
        } else {
          this.logger.succeedSpinner("🔬 No biomarkers found");
        }
      }

      this.logger.success("Data extraction completed successfully!");
      return userData;
    } catch (error) {
      this.logger.error("Data extraction failed", error as Error);
      throw error;
    }
  }

  async exportData(
    userData: UserData,
    outputDir: string = "function-health-export"
  ): Promise<void> {
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString();
    const exportData = {
      exportInfo: {
        timestamp,
        email: this.tokens?.email,
        totalEndpoints: Object.keys(userData).length,
        exportVersion: "1.0.0",
      },
      userData,
    };

    // Save complete export
    await fs.writeFile(
      path.join(outputDir, "complete-function-health-data.json"),
      JSON.stringify(exportData, null, 2)
    );

    // Save individual sections
    const sections = [
      { name: "profile", data: userData.profile },
      { name: "settings", data: userData.settings },
      { name: "health-results", data: userData.results },
      { name: "biomarkers", data: userData.biomarkers },
      { name: "categories", data: userData.categories },
      { name: "recommendations", data: userData.recommendations },
      { name: "reports", data: userData.reports },
      { name: "biological-age", data: userData.biologicalAge },
      { name: "bmi", data: userData.bmi },
      { name: "notes", data: userData.notes },
      { name: "notifications", data: userData.notifications },
      { name: "cards", data: userData.cards },
      { name: "invite-codes", data: userData.codes },
      { name: "lab-requisitions", data: userData.requisitions },
      { name: "pending-schedules", data: userData.pendingSchedules },
      { name: "smart-addons", data: userData.smartAddons },
      { name: "my-story", data: userData.myStory },
      { name: "biomarker-details", data: userData.biomarkerDetails },
      { name: "individual-biomarkers", data: userData.individualBiomarkers },
    ];

    for (const section of sections) {
      if (section.data !== null && section.data !== undefined) {
        await fs.writeFile(
          path.join(outputDir, `${section.name}.json`),
          JSON.stringify(
            {
              timestamp,
              section: section.name,
              data: section.data,
            },
            null,
            2
          )
        );
      }
    }

    console.log(`\n💾 Export completed! Files saved to: ${outputDir}/`);
    console.log("📁 Files created:");
    console.log("   📄 complete-function-health-data.json - Complete export");

    sections.forEach((section) => {
      if (section.data !== null && section.data !== undefined) {
        const size = Array.isArray(section.data)
          ? section.data.length
          : "object";
        console.log(`   📄 ${section.name}.json - ${size} records`);
      }
    });
  }
}
