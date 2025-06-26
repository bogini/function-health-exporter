# Function Health CLI

A command-line tool to export your complete [Function Health](https://my.functionhealth.com/signup?code=IBEITIA%20AREVALO10&_saasquatch=IBEITIA%20AREVALO10) data via reverse-engineered APIs and convert it to LLM-ready Markdown reports for personalized health insights.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

## Features

- 🔐 **Secure Authentication**: Firebase JWT token handling with auto-refresh
- 📊 **Complete Data Export**: All health data, lab results, biomarkers, and reports in JSON format
- 📝 **LLM-Ready Markdown**: Convert JSON data to comprehensive, categorized health reports optimized for AI analysis
- 🩺 **Clinical Context**: Includes professional clinician notes and medical interpretations
- 🎯 **Smart Organization**: Data exported in 19+ categorized files with trend analysis
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

# Convert JSON data to LLM-ready Markdown reports
bun run src/cli.ts markdown

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

# Convert JSON to Markdown with custom directories
bun run src/cli.ts markdown --input ./my-health-data --output ./health-reports
```

### Command Reference
```bash
# Main commands
export          # Export all data
markdown        # Convert JSON to LLM-ready Markdown reports
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

# Markdown options
--input <directory>            # Input directory with JSON data
--output <directory>           # Output directory for Markdown files
--verbose                      # Detailed logging
--quiet                        # Minimal output  
--debug                        # Debug logging

# Config options  
--list                         # Show current config
--reset                        # Reset to defaults
--output-dir <dir>             # Set default output directory
--retry-attempts <number>      # Set retry attempts
--rate-limit <ms>              # Set rate limiting delay
```

## Output Files

### JSON Export (`bun run export`)
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

### Markdown Reports (`bun run markdown`)
Creates `health-reports/` directory with LLM-ready reports:
- `00-health-overview.md` - Executive summary with key metrics
- `01-auto-immunity.md` - Autoimmune and inflammatory markers
- `02-biological-age.md` - Aging and cellular health markers
- `03-blood-electrolytes.md` - Essential minerals and electrolytes
- `04-environmental-toxins.md` - Heavy metals and contaminants
- `05-heart-health.md` - Cardiovascular risk factors
- `06-immune-regulation.md` - Immune system markers
- `07-kidney-function.md` - Kidney health and filtration
- `08-liver-function.md` - Liver enzymes and hepatic health
- `09-male-health.md` - Male hormones and reproductive health
- `10-metabolic-health.md` - Blood sugar and metabolic markers
- `11-nutrients-vitamins.md` - Vitamins, minerals, nutritional status
- `12-pancreatic-function.md` - Pancreatic enzymes and digestion
- `13-stress-aging.md` - Stress hormones and aging markers
- `14-thyroid-function.md` - Thyroid hormones and health
- `15-urine-analysis.md` - Urinalysis and kidney filtration
- `99-uncategorized.md` - Biomarkers not fitting standard categories


## Architecture

- `src/cli.ts` - Main CLI interface with Commander.js
- `src/function-health-client.ts` - API client with authentication
- `src/markdown-generator.ts` - Converts JSON to LLM-ready Markdown reports
- `src/logger.ts` - Professional logging system
- `src/config.ts` - Configuration management

## Notes

- All API calls are made directly without browser automation
- Network requests are rate-limited to avoid overwhelming the server
- JWT authentication tokens are automatically refreshed when needed
- The client is designed to be respectful of the server's resources

## Legal Notice

This tool is for educational and personal data extraction purposes only. Ensure you comply with Function Health's terms of service and applicable laws when using this tool.
