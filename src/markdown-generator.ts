import fs from "fs/promises";
import path from "path";
import { Logger } from "./logger";

export interface FunctionHealthCategory {
  id: string;
  categoryName: string;
  description: string;
  biomarkers: BiomarkerInfo[];
}

export interface BiomarkerInfo {
  id: string;
  name: string;
  oneLineDescription?: string;
  categories: Array<{ id: string; categoryName: string }>;
}

export interface BiomarkerResult {
  questBiomarkerId: string;
  rangeString: string;
  rangeMin: string;
  rangeMax: string;
  improving: boolean;
  neutral: boolean;
  currentResult: {
    id: string;
    dateOfService: string;
    calculatedResult: string;
    displayResult: string;
    inRange: boolean;
    requisitionId: string;
  };
  previousResult?: {
    dateOfService: string;
    calculatedResult: string;
    displayResult: string;
    inRange: boolean;
  };
  pastResults?: Record<string, unknown>[];
  outOfRangeType: string;
  units: string;
  biomarker: {
    id: string;
    name: string;
    oneLineDescription?: string;
    categories: { id: string; categoryName: string }[];
  };
  categories: string[];
}

export interface CategorySummary {
  totalBiomarkers: number;
  inRange: number;
  outOfRange: number;
  improving: number;
  highResults: BiomarkerResult[];
  lowResults: BiomarkerResult[];
  inRangeResults: BiomarkerResult[];
}

export interface HealthSummary {
  totalBiomarkers: number;
  inRange: number;
  outOfRange: number;
  improving: number;
  biologicalAge?: number;
  lastTestDate?: string;
  categorySummaries: Map<string, CategorySummary>;
}

export interface ClinicianNote {
  category?: { id: string; categoryName: string };
  note: string;
}

export interface IndividualBiomarker {
  id: string;
  whyItMatters?: string;
  recommendations?: string;
  causesDescription?: string;
  symptomsDescription?: string;
  foodsToEatDescription?: string;
  foodsToAvoidDescription?: string;
  supplementsDescription?: string;
  selfCareDescription?: string;
  additionalTestsDescription?: string;
  followUpDescription?: string;
  resourcesCited?: string;
}

export class MarkdownGenerator {
  private logger: Logger;
  private categories: FunctionHealthCategory[] = [];
  private biomarkerResults: BiomarkerResult[] = [];
  private clinicianNotes: ClinicianNote[] = [];
  private individualBiomarkers: IndividualBiomarker[] = [];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private async loadCategoriesAndResults(inputDir: string): Promise<void> {
    // Load categories
    const categoriesPath = path.join(inputDir, "categories.json");
    const categoriesContent = await fs.readFile(categoriesPath, "utf-8");
    const categoriesData = JSON.parse(categoriesContent);
    this.categories = categoriesData.data || [];

    // Load biomarker results
    const reportsPath = path.join(inputDir, "reports.json");
    const reportsContent = await fs.readFile(reportsPath, "utf-8");
    const reportsData = JSON.parse(reportsContent);
    this.biomarkerResults =
      reportsData.data?.data?.biomarkerResultsRecord || [];

    // Load clinician notes
    const notesPath = path.join(inputDir, "notes.json");
    const notesContent = await fs.readFile(notesPath, "utf-8");
    const notesData = JSON.parse(notesContent);

    // Flatten all notes from all requisitions and get the most recent ones
    this.clinicianNotes = [];
    if (notesData.data && Array.isArray(notesData.data)) {
      // Sort by date to get the most recent requisition (latest date)
      const sortedRequisitions = notesData.data.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Get the most recent requisition's notes
      const mostRecentRequisition = sortedRequisitions[0];
      if (mostRecentRequisition && mostRecentRequisition.notes) {
        this.clinicianNotes = mostRecentRequisition.notes;
      }
    }

    // Load individual biomarker details
    const individualBiomarkersPath = path.join(
      inputDir,
      "individual-biomarkers.json"
    );
    try {
      const individualBiomarkersContent = await fs.readFile(
        individualBiomarkersPath,
        "utf-8"
      );
      const individualBiomarkersData = JSON.parse(individualBiomarkersContent);
      this.individualBiomarkers = individualBiomarkersData.data || [];
    } catch (error) {
      this.logger.debug(
        "No individual biomarkers data found, enhanced details will not be available"
      );
      this.individualBiomarkers = [];
    }

    this.logger.debug(
      `Loaded ${this.categories.length} categories, ${this.biomarkerResults.length} biomarker results, ${this.clinicianNotes.length} clinician notes, and ${this.individualBiomarkers.length} detailed biomarkers`
    );
  }

  private generateCategorySummary(categoryId: string): CategorySummary {
    const categoryResults = this.biomarkerResults.filter(
      (result) => result.categories && result.categories.includes(categoryId)
    );

    const inRange = categoryResults.filter((r) => r.currentResult.inRange);
    const outOfRange = categoryResults.filter((r) => !r.currentResult.inRange);
    const improving = categoryResults.filter((r) => r.improving);
    const highResults = categoryResults.filter(
      (r) => r.outOfRangeType === "above"
    );
    const lowResults = categoryResults.filter(
      (r) => r.outOfRangeType === "below"
    );

    return {
      totalBiomarkers: categoryResults.length,
      inRange: inRange.length,
      outOfRange: outOfRange.length,
      improving: improving.length,
      highResults,
      lowResults,
      inRangeResults: inRange,
    };
  }

  private generateHealthSummary(
    jsonData: Record<string, unknown>
  ): HealthSummary {
    const inRange = this.biomarkerResults.filter(
      (r) => r.currentResult.inRange
    ).length;
    const outOfRange = this.biomarkerResults.filter(
      (r) => !r.currentResult.inRange
    ).length;
    const improving = this.biomarkerResults.filter((r) => r.improving).length;

    // Try to extract biological age
    let biologicalAge: number | undefined;
    const biologicalAgeData = jsonData.biologicalAge as Record<string, unknown>;
    if (biologicalAgeData?.data && typeof biologicalAgeData.data === "object") {
      const ageData = biologicalAgeData.data as Record<string, unknown>;
      if (typeof ageData.age === "number") {
        biologicalAge = ageData.age;
      }
    }

    // Generate category summaries
    const categorySummaries = new Map<string, CategorySummary>();
    for (const category of this.categories) {
      const summary = this.generateCategorySummary(category.id);
      categorySummaries.set(category.id, summary);
    }

    return {
      totalBiomarkers: this.biomarkerResults.length,
      inRange,
      outOfRange,
      improving,
      biologicalAge,
      lastTestDate: this.biomarkerResults.find(
        (r) => r.currentResult.dateOfService
      )?.currentResult.dateOfService,
      categorySummaries,
    };
  }

  private formatTrendIcon(result: BiomarkerResult): string {
    if (result.improving) return "📈 IMPROVING";
    if (result.neutral) return "➡️ STABLE";

    // Compare current vs previous if available
    if (result.previousResult) {
      const current = parseFloat(result.currentResult.calculatedResult);
      const previous = parseFloat(result.previousResult.calculatedResult);

      if (current > previous) return "📈 INCREASING";
      if (current < previous) return "📉 DECREASING";
      return "➡️ STABLE";
    }

    return "";
  }

  private getClinicianNoteForCategory(categoryId: string): string | null {
    const note = this.clinicianNotes.find(
      (note) => note.category && note.category.id === categoryId
    );
    return note ? note.note : null;
  }

  private getSummaryClinicianNote(): string | null {
    const summaryNote = this.clinicianNotes.find(
      (note) => note.category && note.category.categoryName === "Summary"
    );
    return summaryNote ? summaryNote.note : null;
  }

  private getDetailedBiomarkerInfo(
    biomarkerId: string
  ): IndividualBiomarker | null {
    return (
      this.individualBiomarkers.find(
        (biomarker) => biomarker.id === biomarkerId
      ) || null
    );
  }

  private formatDetailedBiomarkerSection(biomarker: BiomarkerResult): string {
    const detailedInfo = this.getDetailedBiomarkerInfo(biomarker.biomarker.id);

    if (!detailedInfo || !detailedInfo.whyItMatters) {
      // Check if we have empty enhanced data - if so, indicate that enhanced details are available
      if (this.individualBiomarkers.length > 0) {
        const hasEmptyData = this.individualBiomarkers.some(
          (b) =>
            b.id === biomarker.biomarker.id &&
            (!b.whyItMatters || b.whyItMatters === "")
        );
        if (hasEmptyData) {
          return "\n\n*Enhanced biomarker details available via re-export with updated data fetching.*";
        }
      }
      return "";
    }

    let sections = [];

    if (detailedInfo.whyItMatters) {
      sections.push(`**Why This Matters:** ${detailedInfo.whyItMatters}`);
    }

    if (detailedInfo.recommendations && biomarker.outOfRangeType) {
      sections.push(`**Recommendations:** ${detailedInfo.recommendations}`);
    }

    if (detailedInfo.causesDescription) {
      sections.push(`**Possible Causes:** ${detailedInfo.causesDescription}`);
    }

    if (detailedInfo.symptomsDescription) {
      sections.push(
        `**Associated Symptoms:** ${detailedInfo.symptomsDescription}`
      );
    }

    if (detailedInfo.foodsToEatDescription) {
      sections.push(
        `**Foods to Include:** ${detailedInfo.foodsToEatDescription}`
      );
    }

    if (detailedInfo.foodsToAvoidDescription) {
      sections.push(
        `**Foods to Limit:** ${detailedInfo.foodsToAvoidDescription}`
      );
    }

    if (detailedInfo.resourcesCited) {
      sections.push(
        `**Scientific References:** ${detailedInfo.resourcesCited}`
      );
    }

    return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
  }

  private generateBiomarkerFilename(
    biomarker: BiomarkerResult,
    categoryIndex?: number
  ): string {
    // Create a clean filename from biomarker name
    const cleanName = biomarker.biomarker.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars except spaces and hyphens
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

    // Use the primary category for hierarchical naming
    const primaryCategory = biomarker.biomarker.categories?.[0];
    if (primaryCategory && categoryIndex !== undefined) {
      const categoryClean = primaryCategory.categoryName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      return `${String(categoryIndex + 1).padStart(
        2,
        "0"
      )}-${categoryClean}-${cleanName}.md`;
    }

    return `biomarker-${cleanName}.md`;
  }

  private generateIndividualBiomarkerMarkdown(
    biomarker: BiomarkerResult
  ): string {
    const detailedInfo = this.getDetailedBiomarkerInfo(biomarker.biomarker.id);
    const statusIcon = biomarker.currentResult.inRange
      ? "✅"
      : biomarker.outOfRangeType === "above"
      ? "🔴"
      : biomarker.outOfRangeType === "below"
      ? "🔵"
      : "⚠️";

    const statusText = biomarker.currentResult.inRange
      ? "NORMAL RANGE"
      : biomarker.outOfRangeType === "above"
      ? "ABOVE NORMAL RANGE"
      : biomarker.outOfRangeType === "below"
      ? "BELOW NORMAL RANGE"
      : "OUT OF RANGE";

    return `# ${biomarker.biomarker.name}

## Current Status ${statusIcon}

**Result:** ${biomarker.currentResult.displayResult} ${biomarker.units}  
**Reference Range:** ${biomarker.rangeString}  
**Status:** ${statusIcon} ${statusText}  
**Test Date:** ${new Date(
      biomarker.currentResult.dateOfService
    ).toLocaleDateString()}  
${
  this.formatTrendIcon(biomarker)
    ? `**Trend:** ${this.formatTrendIcon(biomarker)}`
    : ""
}

## About This Biomarker

${biomarker.biomarker.oneLineDescription || "No basic description available."}

${
  detailedInfo?.whyItMatters
    ? `### Why This Matters

${detailedInfo.whyItMatters}`
    : ""
}

## Categories

This biomarker is part of the following health categories:
${
  biomarker.biomarker.categories
    ?.map((cat) => `- **${cat.categoryName}**`)
    .join("\n") || "- No categories assigned"
}

${
  biomarker.previousResult
    ? `## Historical Results

**Previous Result:** ${biomarker.previousResult.displayResult} ${
        biomarker.units
      } (${new Date(
        biomarker.previousResult.dateOfService
      ).toLocaleDateString()})

**Change:** ${
        biomarker.improving
          ? "📈 Improving"
          : parseFloat(biomarker.currentResult.calculatedResult) >
            parseFloat(biomarker.previousResult.calculatedResult)
          ? "📈 Increased"
          : parseFloat(biomarker.currentResult.calculatedResult) <
            parseFloat(biomarker.previousResult.calculatedResult)
          ? "📉 Decreased"
          : "➡️ Stable"
      }`
    : ""
}

${
  !biomarker.currentResult.inRange && detailedInfo?.recommendations
    ? `## Recommendations

${detailedInfo.recommendations}`
    : ""
}

${
  detailedInfo?.causesDescription
    ? `## Possible Causes

${detailedInfo.causesDescription}`
    : ""
}

${
  detailedInfo?.symptomsDescription
    ? `## Associated Symptoms

${detailedInfo.symptomsDescription}`
    : ""
}

${
  detailedInfo?.foodsToEatDescription
    ? `## Foods to Include

${detailedInfo.foodsToEatDescription}`
    : ""
}

${
  detailedInfo?.foodsToAvoidDescription
    ? `## Foods to Limit

${detailedInfo.foodsToAvoidDescription}`
    : ""
}

${
  detailedInfo?.supplementsDescription
    ? `## Supplements

${detailedInfo.supplementsDescription}`
    : ""
}

${
  detailedInfo?.selfCareDescription
    ? `## Self-Care & Lifestyle

${detailedInfo.selfCareDescription}`
    : ""
}

${
  detailedInfo?.additionalTestsDescription
    ? `## Additional Tests

${detailedInfo.additionalTestsDescription}`
    : ""
}

${
  detailedInfo?.followUpDescription
    ? `## Follow-Up

${detailedInfo.followUpDescription}`
    : ""
}

${
  detailedInfo?.resourcesCited
    ? `## Scientific References

${detailedInfo.resourcesCited}`
    : ""
}`;
  }

  private generateOverviewMarkdown(summary: HealthSummary): string {
    const date = new Date().toLocaleDateString();

    return `# Health Overview Report

*Generated on ${date}*

## Executive Summary

Your comprehensive Function Health analysis shows **${
      summary.totalBiomarkers
    } total biomarkers** from your latest test results.

### Key Metrics
- **${summary.inRange}** biomarkers in normal range (${Math.round(
      (summary.inRange / summary.totalBiomarkers) * 100
    )}%)
- **${summary.outOfRange}** biomarkers outside normal range (${Math.round(
      (summary.outOfRange / summary.totalBiomarkers) * 100
    )}%)
- **${summary.improving}** biomarkers showing improvement trends

${
  summary.biologicalAge
    ? `### Biological Age\nYour biological age is estimated at **${summary.biologicalAge} years**.`
    : ""
}

${
  summary.lastTestDate
    ? `### Latest Test Date\n${new Date(
        summary.lastTestDate
      ).toLocaleDateString()}`
    : ""
}

${
  this.getSummaryClinicianNote()
    ? `## 🩺 Clinical Analysis\n\n${this.getSummaryClinicianNote()}\n\n`
    : ""
}## Health Status by Category

${this.categories
  .map((category) => {
    const categorySummary = summary.categorySummaries.get(category.id);
    if (!categorySummary || categorySummary.totalBiomarkers === 0) return "";

    const statusIcon =
      categorySummary.outOfRange === 0
        ? "✅"
        : categorySummary.outOfRange > categorySummary.totalBiomarkers / 2
        ? "🔴"
        : "🟡";

    return `### ${statusIcon} ${category.categoryName}
- **Total biomarkers:** ${categorySummary.totalBiomarkers}
- **In range:** ${categorySummary.inRange}
- **Out of range:** ${categorySummary.outOfRange}
- **Improving:** ${categorySummary.improving}
- **Status:** ${
      categorySummary.outOfRange === 0
        ? "All normal"
        : categorySummary.outOfRange > categorySummary.totalBiomarkers / 2
        ? "Attention needed"
        : "Some concerns"
    }`;
  })
  .filter(Boolean)
  .join("\n\n")}

---

*For detailed analysis of each category, see the individual category reports.*
`;
  }

  private generateCategoryMarkdown(
    category: FunctionHealthCategory,
    categorySummary: CategorySummary
  ): string {
    if (categorySummary.totalBiomarkers === 0) {
      return `# ${category.categoryName}

*No biomarkers found in this category.*`;
    }

    return `# ${category.categoryName}

## Category Overview

${category.description}

## Summary Statistics
- **Total biomarkers tested:** ${categorySummary.totalBiomarkers}
- **In normal range:** ${categorySummary.inRange} (${Math.round(
      (categorySummary.inRange / categorySummary.totalBiomarkers) * 100
    )}%)
- **Out of range:** ${categorySummary.outOfRange} (${Math.round(
      (categorySummary.outOfRange / categorySummary.totalBiomarkers) * 100
    )}%)
- **Showing improvement:** ${categorySummary.improving}

${
  categorySummary.outOfRange === 0
    ? "✅ **All biomarkers in this category are within normal ranges.**"
    : ""
}

${
  this.getClinicianNoteForCategory(category.id)
    ? `## 🩺 Clinical Analysis\n\n${this.getClinicianNoteForCategory(
        category.id
      )}\n`
    : ""
}

${
  categorySummary.highResults.length > 0
    ? `## 🔴 Biomarkers Above Normal Range (${
        categorySummary.highResults.length
      })

${categorySummary.highResults
  .map((result, index) => {
    const categoryIndex = this.categories.findIndex(
      (cat) => cat.id === category.id
    );
    const biomarkerFilename = this.generateBiomarkerFilename(
      result,
      categoryIndex
    );
    return `### ${result.biomarker.name}

**Current Result:** ${result.currentResult.displayResult} ${result.units}  
**Reference Range:** ${result.rangeString}  
**Status:** 🔴 ABOVE NORMAL RANGE  
**Test Date:** ${new Date(
      result.currentResult.dateOfService
    ).toLocaleDateString()}  
${
  this.formatTrendIcon(result)
    ? `**Trend:** ${this.formatTrendIcon(result)}`
    : ""
}

${
  result.biomarker.oneLineDescription
    ? `**About this biomarker:** ${result.biomarker.oneLineDescription}`
    : ""
}

${
  result.previousResult
    ? `**Previous Result:** ${result.previousResult.displayResult} ${
        result.units
      } (${new Date(result.previousResult.dateOfService).toLocaleDateString()})`
    : ""
}

📄 **[View detailed analysis](${biomarkerFilename})**

---
`;
  })
  .join("\n")}`
    : ""
}

${
  categorySummary.lowResults.length > 0
    ? `## 🔵 Biomarkers Below Normal Range (${
        categorySummary.lowResults.length
      })

${categorySummary.lowResults
  .map((result, index) => {
    const categoryIndex = this.categories.findIndex(
      (cat) => cat.id === category.id
    );
    const biomarkerFilename = this.generateBiomarkerFilename(
      result,
      categoryIndex
    );
    return `### ${result.biomarker.name}

**Current Result:** ${result.currentResult.displayResult} ${result.units}  
**Reference Range:** ${result.rangeString}  
**Status:** 🔵 BELOW NORMAL RANGE  
**Test Date:** ${new Date(
      result.currentResult.dateOfService
    ).toLocaleDateString()}  
${
  this.formatTrendIcon(result)
    ? `**Trend:** ${this.formatTrendIcon(result)}`
    : ""
}

${
  result.biomarker.oneLineDescription
    ? `**About this biomarker:** ${result.biomarker.oneLineDescription}`
    : ""
}

${
  result.previousResult
    ? `**Previous Result:** ${result.previousResult.displayResult} ${
        result.units
      } (${new Date(result.previousResult.dateOfService).toLocaleDateString()})`
    : ""
}

📄 **[View detailed analysis](${biomarkerFilename})**

---
`;
  })
  .join("\n")}`
    : ""
}

${
  categorySummary.inRangeResults.length > 0
    ? `## ✅ Biomarkers in Normal Range (${
        categorySummary.inRangeResults.length
      })

${categorySummary.inRangeResults
  .map((result, index) => {
    const categoryIndex = this.categories.findIndex(
      (cat) => cat.id === category.id
    );
    const biomarkerFilename = this.generateBiomarkerFilename(
      result,
      categoryIndex
    );
    return `### ${result.biomarker.name}

**Current Result:** ${result.currentResult.displayResult} ${result.units}  
**Reference Range:** ${result.rangeString}  
**Status:** ✅ NORMAL RANGE  
**Test Date:** ${new Date(
      result.currentResult.dateOfService
    ).toLocaleDateString()}  
${
  this.formatTrendIcon(result)
    ? `**Trend:** ${this.formatTrendIcon(result)}`
    : ""
}

${
  result.biomarker.oneLineDescription
    ? `**About this biomarker:** ${result.biomarker.oneLineDescription}`
    : ""
}

📄 **[View detailed analysis](${biomarkerFilename})**

---
`;
  })
  .join("\n")}`
    : ""
}
`;
  }

  async generateMarkdownReports(
    inputDir: string,
    outputDir: string
  ): Promise<void> {
    this.logger.startSpinner(
      "Processing health data for markdown generation..."
    );

    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Load the complete JSON data for biological age
      const jsonPath = path.join(
        inputDir,
        "complete-function-health-data.json"
      );
      let jsonData;
      try {
        const jsonContent = await fs.readFile(jsonPath, "utf-8");
        jsonData = JSON.parse(jsonContent);
      } catch (error) {
        throw new Error(
          `Failed to read JSON data from ${jsonPath}. Make sure to run 'export' command first.`
        );
      }

      this.logger.updateSpinner("Loading categories and biomarker results...");

      // Load categories and biomarker results from the actual Function Health data
      await this.loadCategoriesAndResults(inputDir);

      if (this.biomarkerResults.length === 0) {
        throw new Error("No biomarker results found in reports.json.");
      }

      this.logger.updateSpinner("Generating health summary...");

      // Generate health summary using actual test results
      const summary = this.generateHealthSummary(jsonData.userData || jsonData);

      this.logger.updateSpinner("Creating overview report...");

      // Generate overview markdown
      const overviewMarkdown = this.generateOverviewMarkdown(summary);
      await fs.writeFile(
        path.join(outputDir, "00-health-overview.md"),
        overviewMarkdown
      );

      this.logger.updateSpinner("Creating detailed category reports...");

      // Generate comprehensive category-specific markdowns
      let categoryCount = 0;
      for (const category of this.categories) {
        const categorySummary = summary.categorySummaries.get(category.id);

        if (categorySummary && categorySummary.totalBiomarkers > 0) {
          const categoryMarkdown = this.generateCategoryMarkdown(
            category,
            categorySummary
          );
          const filename = `${String(categoryCount + 1).padStart(
            2,
            "0"
          )}-${category.categoryName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "-")}.md`;
          await fs.writeFile(path.join(outputDir, filename), categoryMarkdown);
          categoryCount++;
        }
      }

      this.logger.updateSpinner("Creating individual biomarker files...");

      // Generate individual biomarker files
      let biomarkerCount = 0;
      for (const biomarker of this.biomarkerResults) {
        const categoryIndex = this.categories.findIndex(
          (cat) => biomarker.categories && biomarker.categories.includes(cat.id)
        );

        const biomarkerMarkdown =
          this.generateIndividualBiomarkerMarkdown(biomarker);
        const biomarkerFilename = this.generateBiomarkerFilename(
          biomarker,
          categoryIndex >= 0 ? categoryIndex : undefined
        );

        await fs.writeFile(
          path.join(outputDir, biomarkerFilename),
          biomarkerMarkdown
        );
        biomarkerCount++;
      }

      // Generate report for biomarkers without categories
      const uncategorizedResults = this.biomarkerResults.filter(
        (result) => !result.categories || result.categories.length === 0
      );

      if (uncategorizedResults.length > 0) {
        const uncategorizedMarkdown = `# Uncategorized Biomarkers

These biomarkers don't have assigned categories and may need manual review.

## Summary
- **Total uncategorized biomarkers:** ${uncategorizedResults.length}

${uncategorizedResults
  .map(
    (result) => `### ${result.biomarker.name}

**Current Result:** ${result.currentResult.displayResult} ${result.units}  
**Reference Range:** ${result.rangeString}  
**Status:** ${
      result.currentResult.inRange
        ? "✅ NORMAL"
        : result.outOfRangeType === "above"
        ? "🔴 HIGH"
        : result.outOfRangeType === "below"
        ? "🔵 LOW"
        : "⚠️ OUT OF RANGE"
    }  
**Test Date:** ${new Date(
      result.currentResult.dateOfService
    ).toLocaleDateString()}  

${
  result.biomarker.oneLineDescription
    ? `**About this biomarker:** ${result.biomarker.oneLineDescription}`
    : ""
}

---
`
  )
  .join("\n")}
`;
        await fs.writeFile(
          path.join(outputDir, "99-uncategorized.md"),
          uncategorizedMarkdown
        );
      }

      this.logger.succeedSpinner(
        "Comprehensive markdown reports generated successfully!"
      );

      // Enhanced summary output
      this.logger.divider("MARKDOWN EXPORT SUMMARY");
      this.logger.info(
        `📊 Processed ${summary.totalBiomarkers} biomarker results`
      );
      this.logger.info(
        `📁 Created ${categoryCount} category reports + 1 overview`
      );
      this.logger.info(
        `🔬 Created ${biomarkerCount} individual biomarker files`
      );
      this.logger.info(`📄 Files saved to: ${outputDir}/`);
      this.logger.info(`✅ ${summary.inRange} biomarkers in normal range`);
      this.logger.info(`⚠️  ${summary.outOfRange} biomarkers need attention`);
      this.logger.info(
        `📈 ${summary.improving} biomarkers showing improvement`
      );
    } catch (error) {
      this.logger.failSpinner("Markdown generation failed");
      throw error;
    }
  }
}
