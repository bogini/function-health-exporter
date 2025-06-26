# Function Health CLI

A command-line tool to export your complete Function Health data via reverse-engineered APIs.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

## Features

- 🔐 **Secure Authentication**: Firebase JWT token handling with auto-refresh
- 📊 **Complete Data Export**: All health data, lab results, biomarkers, and reports
- 🎯 **Smart Organization**: Data exported in 19+ categorized JSON files
- 🛡️ **Production Ready**: Comprehensive error handling, retry logic, and rate limiting
- ⚙️ **Configurable**: Customizable settings with config file support
- 🎨 **Beautiful CLI**: Professional interface with progress indicators and colored output
- 📝 **Detailed Logging**: Multiple log levels with optional verbose output
- 🔄 **Retry Logic**: Automatic retries with exponential backoff for network issues

## Setup

Install dependencies:
```bash
bun install
```

## Quick Start

### Basic Usage
```bash
# Export all your data (interactive)
bun run src/cli.ts export

# Export with saved email for faster login
bun run src/cli.ts export --save-credentials

# Export to custom directory with verbose logging
bun run src/cli.ts export --output ~/my-health-data --verbose
```

### Advanced Usage
```bash
# Configure default settings  
bun run src/cli.ts config --output-dir ~/health-exports

# Limit biomarkers if you have hundreds (0 = no limit)
bun run src/cli.ts config --max-biomarkers 50

# Show current configuration
bun run src/cli.ts config --list

# Export with custom options (limit biomarkers if you have many)
bun run src/cli.ts export --max-biomarkers 20 --no-retry --quiet
```

### Command Reference
```bash
# Main commands
export          # Export all data
config          # Manage configuration  
help           # Detailed help

# Export options
--email <email>                # Function Health email
--password <password>          # Function Health password  
--output <directory>           # Output directory
--max-biomarkers <number>      # Limit individual biomarker requests (0 = no limit)
--save-credentials             # Save email for future use
--verbose                      # Detailed logging
--quiet                        # Minimal output
--debug                        # Debug logging
--no-retry                     # Disable retry attempts

# Config options  
--list                         # Show current config
--reset                        # Reset to defaults
--output-dir <dir>             # Set default output directory
--retry-attempts <number>      # Set retry attempts
--rate-limit <ms>              # Set rate limiting delay
```

## Output Files

### Automated Export (`bun run export`)
Creates `function-health-export/` directory with:
- `complete-function-health-data.json` - Everything in one file
- `profile.json` - User profile and account info
- `health-results.json` - Lab test results and values
- `biomarkers.json` - Biomarker definitions and data
- `recommendations.json` - Health recommendations
- `reports.json` - Comprehensive health reports
- `biological-age.json` - Biological age calculation
- `bmi.json` - BMI data and trends
- `notes.json` - Personal health notes
- `lab-requisitions.json` - Lab test orders and history
- Plus 9 more categorized data files


## Architecture

- `src/cli.ts` - Main CLI interface with Commander.js
- `src/function-health-client.ts` - API client with authentication
- `src/logger.ts` - Professional logging system
- `src/config.ts` - Configuration management

## Notes

- All API calls are made directly without browser automation
- Network requests are rate-limited to avoid overwhelming the server
- JWT authentication tokens are automatically refreshed when needed
- The client is designed to be respectful of the server's resources

## Legal Notice

This tool is for educational and personal data extraction purposes only. Ensure you comply with Function Health's terms of service and applicable laws when using this tool.
