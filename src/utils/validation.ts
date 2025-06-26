export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): boolean {
  return password.length >= 8;
}

export function validateOutputPath(path: string): boolean {
  // Basic path validation - not empty and doesn't contain invalid characters
  const invalidChars = /[<>:"|?*]/;
  return path.length > 0 && !invalidChars.test(path);
}

export function sanitizeFilename(filename: string): string {
  // Remove or replace invalid filename characters
  return filename
    .replace(/[<>:"|?*]/g, '_')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

export function validateConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.retryAttempts !== undefined) {
    if (!Number.isInteger(config.retryAttempts) || config.retryAttempts < 1 || config.retryAttempts > 10) {
      errors.push('retryAttempts must be an integer between 1 and 10');
    }
  }

  if (config.retryDelay !== undefined) {
    if (!Number.isInteger(config.retryDelay) || config.retryDelay < 100 || config.retryDelay > 10000) {
      errors.push('retryDelay must be an integer between 100 and 10000 milliseconds');
    }
  }

  if (config.rateLimit !== undefined) {
    if (!Number.isInteger(config.rateLimit) || config.rateLimit < 0 || config.rateLimit > 5000) {
      errors.push('rateLimit must be an integer between 0 and 5000 milliseconds');
    }
  }

  if (config.maxIndividualBiomarkers !== undefined) {
    if (!Number.isInteger(config.maxIndividualBiomarkers) || config.maxIndividualBiomarkers < 0 || config.maxIndividualBiomarkers > 1000) {
      errors.push('maxIndividualBiomarkers must be an integer between 0 and 1000 (0 = no limit)');
    }
  }

  if (config.outputDir !== undefined) {
    if (!validateOutputPath(config.outputDir)) {
      errors.push('outputDir contains invalid characters');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}