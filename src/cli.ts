#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import fs from "fs/promises";
import readline from "readline";
import { FunctionHealthClient } from "./function-health-client";
import { Logger } from "./logger";
import { ConfigManager, Config } from "./config";
import { MarkdownGenerator } from "./markdown-generator";

const VERSION = "1.0.0";

interface CLIOptions {
  email?: string;
  password?: string;
  output?: string;
  config?: string;
  verbose?: boolean;
  quiet?: boolean;
  debug?: boolean;
  "save-credentials"?: boolean;
  "no-retry"?: boolean;
  "max-biomarkers"?: number;
}

interface MarkdownOptions {
  input?: string;
  output?: string;
  verbose?: boolean;
  quiet?: boolean;
  debug?: boolean;
}

class FunctionHealthCLI {
  private logger: Logger;
  private configManager: ConfigManager;
  private clientConfig: Config;
  private rl: readline.Interface;

  constructor() {
    this.logger = new Logger();
    this.configManager = new ConfigManager();
    this.clientConfig = {} as Config;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async askQuestion(
    question: string,
    hideInput = false
  ): Promise<string> {
    return new Promise((resolve) => {
      if (hideInput) {
        // Hide password input
        process.stdout.write(question);
        process.stdin.setRawMode(true);
        process.stdin.resume();

        let password = "";
        const onData = (char: Buffer) => {
          const c = char.toString();
          if (c === "\r" || c === "\n") {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener("data", onData);
            console.log();
            resolve(password);
          } else if (c === "\x7f" || c === "\b") {
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write("\b \b");
            }
          } else if (c >= " ") {
            password += c;
            process.stdout.write("*");
          }
        };

        process.stdin.on("data", onData);
      } else {
        this.rl.question(question, resolve);
      }
    });
  }

  private async loadConfig(configPath?: string): Promise<void> {
    if (configPath) {
      try {
        const configData = await fs.readFile(configPath, "utf-8");
        this.clientConfig = JSON.parse(configData);
        this.logger.debug(`Loaded config from ${configPath}`);
      } catch (error) {
        this.logger.error(
          `Failed to load config from ${configPath}`,
          error as Error
        );
        process.exit(1);
      }
    } else {
      this.clientConfig = await this.configManager.loadConfig();
    }
  }

  private async getCredentials(
    options: CLIOptions
  ): Promise<{ email: string; password: string }> {
    let email = options.email;
    let password = options.password;

    // Try to load saved credentials if not provided
    if (!email || !password) {
      const savedCreds = await this.configManager.loadCredentials();
      email = email || savedCreds.email;
    }

    // Prompt for missing credentials
    if (!email) {
      email = await this.askQuestion("Enter your Function Health email: ");
    }

    if (!password) {
      password = await this.askQuestion(
        "Enter your Function Health password: ",
        true
      );
    }

    // Save credentials if requested
    if (options["save-credentials"] && email) {
      await this.configManager.saveCredentials({ email });
      this.logger.debug(
        "Email saved to credentials (password not saved for security)"
      );
    }

    return { email, password };
  }

  private validateExportData(userData: any): { valid: boolean; summary: any } {
    const summary = {
      profile: userData.profile ? "✅" : "❌",
      results: userData.results?.length || 0,
      biomarkers: userData.biomarkers?.length || 0,
      categories: userData.categories?.length || 0,
      recommendations: userData.recommendations?.length || 0,
      reports: userData.reports ? "✅" : "❌",
      biologicalAge: userData.biologicalAge ? "✅" : "❌",
      bmi: userData.bmi ? "✅" : "❌",
      notes: userData.notes?.length || 0,
      requisitions: userData.requisitions?.length || 0,
      notifications: userData.notifications?.length || 0,
    };

    const hasData =
      userData.profile ||
      (userData.results && userData.results.length > 0) ||
      (userData.biomarkers && userData.biomarkers.length > 0);

    return { valid: hasData, summary };
  }

  async export(options: CLIOptions): Promise<void> {
    try {
      // Update logger options
      this.logger.updateOptions({
        verbose: options.verbose,
        quiet: options.quiet,
        level: options.debug ? "debug" : "info",
      });

      // Load configuration
      await this.loadConfig(options.config);

      // Override config with CLI options
      if (options.output) this.clientConfig.outputDir = options.output;
      if (options["max-biomarkers"])
        this.clientConfig.maxIndividualBiomarkers = options["max-biomarkers"];
      if (options["no-retry"]) this.clientConfig.retryAttempts = 1;

      // Display banner
      this.logger.box("Function Health Data Exporter", [
        `Version: ${VERSION}`,
        `Output Directory: ${this.clientConfig.outputDir}`,
        `Max Biomarkers: ${
          this.clientConfig.maxIndividualBiomarkers || "No limit"
        }`,
        `Retry Attempts: ${this.clientConfig.retryAttempts}`,
      ]);

      // Get credentials
      const { email, password } = await this.getCredentials(options);

      // Initialize client
      const client = new FunctionHealthClient(this.clientConfig, this.logger);

      // Login
      await client.login(email, password);

      // Fetch all data
      const userData = await client.fetchAllData();

      // Validate data
      const validation = this.validateExportData(userData);
      if (!validation.valid) {
        this.logger.error(
          "No data was retrieved. Please check your credentials and try again."
        );
        process.exit(1);
      }

      // Export data
      this.logger.startSpinner("Exporting data to files...");
      await client.exportData(userData, this.clientConfig.outputDir);
      this.logger.succeedSpinner("Data export completed");

      // Display summary
      this.logger.divider("EXPORT SUMMARY");
      this.logger.table([
        { Item: "Profile", Status: validation.summary.profile },
        { Item: "Health Results", Count: validation.summary.results },
        { Item: "Biomarkers", Count: validation.summary.biomarkers },
        { Item: "Categories", Count: validation.summary.categories },
        { Item: "Recommendations", Count: validation.summary.recommendations },
        { Item: "Reports", Status: validation.summary.reports },
        { Item: "Biological Age", Status: validation.summary.biologicalAge },
        { Item: "BMI Data", Status: validation.summary.bmi },
        { Item: "Notes", Count: validation.summary.notes },
        { Item: "Lab Requisitions", Count: validation.summary.requisitions },
        { Item: "Notifications", Count: validation.summary.notifications },
      ]);

      this.logger.box("Success!", [
        `Your Function Health data has been exported to: ${this.clientConfig.outputDir}`,
        `Files created: complete-function-health-data.json + 19 category files`,
        `Check the directory for your organized health data.`,
      ]);
    } catch (error) {
      this.logger.error("Export failed", error as Error);

      if ((error as Error).message.includes("Login failed")) {
        this.logger.info("Troubleshooting tips:");
        this.logger.info("• Check your email and password are correct");
        this.logger.info("• Ensure your Function Health account is active");
        this.logger.info("• Try logging in through the web interface first");
      }

      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async configCommand(options: any): Promise<void> {
    try {
      const config = await this.configManager.loadConfig();

      if (options.list) {
        this.logger.box("Current Configuration", [
          `Config file: ${this.configManager.getConfigPath()}`,
          `Base URL: ${config.baseUrl}`,
          `Output Directory: ${config.outputDir}`,
          `Retry Attempts: ${config.retryAttempts}`,
          `Retry Delay: ${config.retryDelay}ms`,
          `Rate Limit: ${config.rateLimit}ms`,
          `Token Refresh Buffer: ${config.tokenRefreshBuffer}s`,
          `Max Individual Biomarkers: ${config.maxIndividualBiomarkers}`,
          `App Version: ${config.appVersion}`,
        ]);
        return;
      }

      if (options.reset) {
        await this.configManager.saveConfig({});
        await this.configManager.clearCredentials();
        this.logger.success("Configuration reset to defaults");
        return;
      }

      // Set individual config values
      const updates: Partial<Config> = {};
      if (options.outputDir) updates.outputDir = options.outputDir;
      if (options.retryAttempts)
        updates.retryAttempts = parseInt(options.retryAttempts);
      if (options.retryDelay) updates.retryDelay = parseInt(options.retryDelay);
      if (options.rateLimit) updates.rateLimit = parseInt(options.rateLimit);
      if (options.maxBiomarkers)
        updates.maxIndividualBiomarkers = parseInt(options.maxBiomarkers);

      if (Object.keys(updates).length > 0) {
        await this.configManager.saveConfig(updates);
        this.logger.success("Configuration updated");
      }
    } catch (error) {
      this.logger.error("Configuration failed", error as Error);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  async markdownCommand(options: MarkdownOptions): Promise<void> {
    try {
      // Update logger options
      this.logger.updateOptions({
        verbose: options.verbose,
        quiet: options.quiet,
        level: options.debug ? "debug" : "info",
      });

      // Set default directories
      const inputDir = options.input || "function-health-export";
      const outputDir = options.output || "health-reports";

      // Display banner
      this.logger.box("Function Health Markdown Generator", [
        `Version: ${VERSION}`,
        `Input Directory: ${inputDir}`,
        `Output Directory: ${outputDir}`,
        `Converting JSON health data to LLM-ready Markdown reports`,
      ]);

      // Check if input directory exists
      try {
        await fs.access(inputDir);
      } catch {
        this.logger.error(
          `Input directory "${inputDir}" not found. Please run the export command first or specify a different input directory.`
        );
        process.exit(1);
      }

      // Initialize markdown generator
      const markdownGenerator = new MarkdownGenerator(this.logger);

      // Generate markdown reports
      await markdownGenerator.generateMarkdownReports(inputDir, outputDir);

      // Success message
      this.logger.box("Success!", [
        `Your health data has been converted to Markdown reports`,
        `Location: ${outputDir}/`,
        `Files created: Overview + categorized health reports`,
        `Ready for LLM analysis and personal health insights`,
      ]);
    } catch (error) {
      this.logger.error("Markdown generation failed", error as Error);

      if (
        (error as Error).message.includes("complete-function-health-data.json")
      ) {
        this.logger.info("Troubleshooting tips:");
        this.logger.info(
          "• Run 'function-health export' first to generate JSON data"
        );
        this.logger.info(
          "• Check that the input directory contains your exported data"
        );
        this.logger.info(
          "• Verify the complete-function-health-data.json file exists"
        );
      }

      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// CLI Setup
const program = new Command();
const cli = new FunctionHealthCLI();

program
  .name("function-health")
  .description("Export your complete Function Health data")
  .version(VERSION);

// Export command
program
  .command("export")
  .description("Export all your Function Health data")
  .option("-e, --email <email>", "Function Health email")
  .option("-p, --password <password>", "Function Health password")
  .option("-o, --output <directory>", "Output directory for exported data")
  .option("-c, --config <file>", "Custom config file path")
  .option("-v, --verbose", "Verbose logging")
  .option("-q, --quiet", "Minimal output")
  .option("-d, --debug", "Debug logging")
  .option("--save-credentials", "Save email to credentials file")
  .option("--no-retry", "Disable retry attempts")
  .option(
    "--max-biomarkers <number>",
    "Maximum individual biomarkers to fetch",
    parseInt
  )
  .action(async (options: CLIOptions) => {
    await cli.export(options);
  });

// Config command
program
  .command("config")
  .description("Manage configuration")
  .option("-l, --list", "Show current configuration")
  .option("-r, --reset", "Reset configuration to defaults")
  .option("--output-dir <directory>", "Set default output directory")
  .option("--retry-attempts <number>", "Set retry attempts", parseInt)
  .option("--retry-delay <ms>", "Set retry delay in milliseconds", parseInt)
  .option("--rate-limit <ms>", "Set rate limit delay in milliseconds", parseInt)
  .option(
    "--max-biomarkers <number>",
    "Set max individual biomarkers to fetch",
    parseInt
  )
  .action(async (options) => {
    await cli.configCommand(options);
  });

// Markdown command
program
  .command("markdown")
  .description("Convert exported JSON data to LLM-ready Markdown reports")
  .option(
    "-i, --input <directory>",
    "Input directory with JSON data",
    "function-health-export"
  )
  .option(
    "-o, --output <directory>",
    "Output directory for Markdown files",
    "health-reports"
  )
  .option("-v, --verbose", "Verbose logging")
  .option("-q, --quiet", "Minimal output")
  .option("-d, --debug", "Debug logging")
  .action(async (options: MarkdownOptions) => {
    await cli.markdownCommand(options);
  });

// Help command
program
  .command("help")
  .description("Show detailed help")
  .action(() => {
    console.log(chalk.blue.bold("\n🔬 Function Health Data Exporter\n"));
    console.log(
      "A tool to export your complete Function Health data via reverse-engineered APIs.\n"
    );

    console.log(chalk.yellow.bold("QUICK START:"));
    console.log(
      "  function-health export                 # Export all data interactively"
    );
    console.log(
      "  function-health markdown               # Convert JSON to LLM-ready Markdown"
    );
    console.log(
      "  function-health config --list          # Show current settings\n"
    );

    console.log(chalk.yellow.bold("EXAMPLES:"));
    console.log("  # Basic export");
    console.log("  function-health export");
    console.log("");
    console.log("  # Export with custom output directory");
    console.log("  function-health export --output ./my-health-data");
    console.log("");
    console.log("  # Export with credentials and verbose logging");
    console.log("  function-health export --email user@example.com --verbose");
    console.log("");
    console.log("  # Limit biomarker details and save credentials");
    console.log(
      "  function-health export --max-biomarkers 5 --save-credentials"
    );
    console.log("");
    console.log("  # Configure default settings");
    console.log(
      "  function-health config --output-dir ~/health-exports --max-biomarkers 15"
    );
    console.log("");
    console.log("  # Convert JSON data to Markdown reports");
    console.log("  function-health markdown");
    console.log("");
    console.log("  # Convert with custom input/output directories");
    console.log(
      "  function-health markdown --input ./my-data --output ./health-reports"
    );

    console.log(chalk.yellow.bold("\nDATA EXPORTED:"));
    console.log("  • User profile and settings");
    console.log("  • Lab test results and biomarker data");
    console.log("  • Health reports and recommendations");
    console.log("  • Biological age and BMI calculations");
    console.log("  • Personal notes and notifications");
    console.log("  • Lab requisitions and scheduling data");
    console.log("  • Payment cards and referral codes\n");

    console.log(
      chalk.green.bold(
        "For more information, visit: https://github.com/your-repo/function-health-cli"
      )
    );
  });

// Error handling
program.configureHelp({
  helpWidth: 100,
  sortSubcommands: true,
});

program.showHelpAfterError();

// Handle unhandled errors
process.on("unhandledRejection", (reason, promise) => {
  console.error(
    chalk.red("Unhandled Rejection at:"),
    promise,
    chalk.red("reason:"),
    reason
  );
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error(chalk.red("Uncaught Exception:"), error);
  process.exit(1);
});

// Default action - show help
if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

// Parse CLI arguments
program.parse();
