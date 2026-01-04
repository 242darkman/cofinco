/**
 * Validation Utilities for COFIN Platform
 * Production-ready input validation with comprehensive rules
 */

// Constants
export const VALIDATION_LIMITS = {
  // Financial limits (in FCFA)
  MIN_AMOUNT: 100,
  MAX_AMOUNT: 100_000_000_000, // 100 milliards
  MAX_COTISATION: 50_000_000, // 50 millions pour tontine
  MAX_EPARGNE: 10_000_000_000, // 10 milliards pour épargne
  MAX_CREDIT: 50_000_000_000, // 50 milliards pour crédit

  // Text limits
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_NOTES_LENGTH: 1000,
  MAX_REFERENCE_LENGTH: 50,

  // Numeric limits
  MAX_MEMBERS: 500,
  MAX_INTEREST_RATE: 50, // 50%
  MIN_INTEREST_RATE: 0,
  MAX_PLATFORM_FEE: 20, // 20%

  // Date limits
  MAX_FUTURE_YEARS: 30,
  MIN_PAST_YEARS: 10,
} as const;

// Phone number patterns for Congo
export const PHONE_PATTERNS = {
  MTN: /^(\+?242)?\s*(05|06)\d{7}$/,
  AIRTEL: /^(\+?242)?\s*(04)\d{7}$/,
  ANY: /^(\+?242)?\s*(04|05|06)\d{7}$/,
} as const;

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ValidationErrors {
  [key: string]: string | undefined;
}

// Core validation functions
export function validateRequired(value: unknown, fieldName: string): ValidationResult {
  if (value === null || value === undefined || value === '' ||
      (typeof value === 'string' && value.trim() === '')) {
    return { isValid: false, error: `${fieldName} est requis` };
  }
  return { isValid: true };
}

export function validateAmount(
  value: number | string,
  options: {
    min?: number;
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult {
  const {
    min = VALIDATION_LIMITS.MIN_AMOUNT,
    max = VALIDATION_LIMITS.MAX_AMOUNT,
    fieldName = 'Montant'
  } = options;

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return { isValid: false, error: `${fieldName} doit être un nombre valide` };
  }

  if (numValue < min) {
    return { isValid: false, error: `${fieldName} minimum: ${min.toLocaleString()} FCFA` };
  }

  if (numValue > max) {
    return { isValid: false, error: `${fieldName} maximum: ${max.toLocaleString()} FCFA` };
  }

  // Check for too many decimal places
  const decimalPlaces = (numValue.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    return { isValid: false, error: `${fieldName} ne peut avoir que 2 décimales` };
  }

  return { isValid: true };
}

export function validatePercentage(
  value: number | string,
  options: {
    min?: number;
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult {
  const {
    min = 0,
    max = 100,
    fieldName = 'Pourcentage'
  } = options;

  const numValue = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return { isValid: false, error: `${fieldName} doit être un nombre valide` };
  }

  if (numValue < min || numValue > max) {
    return { isValid: false, error: `${fieldName} doit être entre ${min}% et ${max}%` };
  }

  return { isValid: true };
}

export function validatePhoneNumber(
  value: string,
  operator?: 'MTN' | 'AIRTEL'
): ValidationResult {
  if (!value || value.trim() === '') {
    return { isValid: false, error: 'Numéro de téléphone requis' };
  }

  // Remove spaces and format
  const cleaned = value.replace(/\s/g, '');

  const pattern = operator ? PHONE_PATTERNS[operator] : PHONE_PATTERNS.ANY;

  if (!pattern.test(cleaned)) {
    if (operator === 'MTN') {
      return { isValid: false, error: 'Numéro MTN invalide (05/06 + 7 chiffres)' };
    }
    if (operator === 'AIRTEL') {
      return { isValid: false, error: 'Numéro Airtel invalide (04 + 7 chiffres)' };
    }
    return { isValid: false, error: 'Format de numéro invalide' };
  }

  return { isValid: true };
}

export function validateDate(
  value: string | Date,
  options: {
    minDate?: Date;
    maxDate?: Date;
    mustBeFuture?: boolean;
    mustBePast?: boolean;
    fieldName?: string;
  } = {}
): ValidationResult {
  const { fieldName = 'Date', mustBeFuture, mustBePast, minDate, maxDate } = options;

  const date = typeof value === 'string' ? new Date(value) : value;

  if (isNaN(date.getTime())) {
    return { isValid: false, error: `${fieldName} invalide` };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (mustBeFuture && date <= now) {
    return { isValid: false, error: `${fieldName} doit être dans le futur` };
  }

  if (mustBePast && date >= now) {
    return { isValid: false, error: `${fieldName} doit être dans le passé` };
  }

  if (minDate && date < minDate) {
    return { isValid: false, error: `${fieldName} trop ancienne` };
  }

  if (maxDate && date > maxDate) {
    return { isValid: false, error: `${fieldName} trop éloignée` };
  }

  // Check reasonable range
  const maxFuture = new Date();
  maxFuture.setFullYear(maxFuture.getFullYear() + VALIDATION_LIMITS.MAX_FUTURE_YEARS);

  if (date > maxFuture) {
    return { isValid: false, error: `${fieldName} ne peut pas dépasser ${VALIDATION_LIMITS.MAX_FUTURE_YEARS} ans` };
  }

  return { isValid: true };
}

export function validateTextLength(
  value: string,
  options: {
    min?: number;
    max?: number;
    fieldName?: string;
  } = {}
): ValidationResult {
  const { min = 0, max = VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH, fieldName = 'Texte' } = options;

  if (value.length < min) {
    return { isValid: false, error: `${fieldName} doit contenir au moins ${min} caractères` };
  }

  if (value.length > max) {
    return { isValid: false, error: `${fieldName} ne peut pas dépasser ${max} caractères` };
  }

  return { isValid: true };
}

export function validateEmail(value: string): ValidationResult {
  if (!value || value.trim() === '') {
    return { isValid: false, error: 'Email requis' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return { isValid: false, error: 'Format email invalide' };
  }

  return { isValid: true };
}

// Form validation helper
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  rules: {
    [K in keyof T]?: (value: T[K]) => ValidationResult;
  }
): { isValid: boolean; errors: ValidationErrors } {
  const errors: ValidationErrors = {};
  let isValid = true;

  for (const [field, validator] of Object.entries(rules)) {
    if (validator) {
      const result = validator(data[field as keyof T]);
      if (!result.isValid) {
        errors[field] = result.error;
        isValid = false;
      }
    }
  }

  return { isValid, errors };
}

// Specific validators for tontine module
export const tontineValidators = {
  montantCotisation: (value: number | string) =>
    validateAmount(value, {
      min: 1000,
      max: VALIDATION_LIMITS.MAX_COTISATION,
      fieldName: 'Montant de cotisation'
    }),

  tauxPlateforme: (value: number | string) =>
    validatePercentage(value, {
      min: 0,
      max: VALIDATION_LIMITS.MAX_PLATFORM_FEE,
      fieldName: 'Taux plateforme'
    }),

  nombreMembres: (value: number | string) => {
    const numValue = typeof value === 'string' ? parseInt(value) : value;
    if (isNaN(numValue) || numValue < 2) {
      return { isValid: false, error: 'Minimum 2 membres requis' };
    }
    if (numValue > VALIDATION_LIMITS.MAX_MEMBERS) {
      return { isValid: false, error: `Maximum ${VALIDATION_LIMITS.MAX_MEMBERS} membres` };
    }
    return { isValid: true };
  },

  dateDebut: (value: string | Date) =>
    validateDate(value, { fieldName: 'Date de début' }),

  dateFin: (value: string | Date) =>
    validateDate(value, { mustBeFuture: true, fieldName: 'Date de fin' }),
};

// Specific validators for épargne module
export const epargneValidators = {
  soldeInitial: (value: number | string) =>
    validateAmount(value, {
      min: 0,
      max: VALIDATION_LIMITS.MAX_EPARGNE,
      fieldName: 'Solde initial'
    }),

  montantTransaction: (value: number | string) =>
    validateAmount(value, {
      min: 100,
      max: VALIDATION_LIMITS.MAX_EPARGNE,
      fieldName: 'Montant'
    }),

  tauxInteret: (value: number | string) =>
    validatePercentage(value, {
      min: VALIDATION_LIMITS.MIN_INTEREST_RATE,
      max: VALIDATION_LIMITS.MAX_INTEREST_RATE,
      fieldName: "Taux d'intérêt"
    }),

  montantObjectif: (value: number | string) =>
    validateAmount(value, {
      min: 1000,
      max: VALIDATION_LIMITS.MAX_EPARGNE,
      fieldName: 'Montant cible'
    }),

  dateCibleObjectif: (value: string | Date) =>
    validateDate(value, {
      mustBeFuture: true,
      fieldName: 'Date cible'
    }),
};
