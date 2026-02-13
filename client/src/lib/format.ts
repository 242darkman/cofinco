/**
 * Formatting Utilities for COFIN Platform
 * Centralized formatting functions for consistency
 *
 * Currency formatting is delegated to shared/config/currency.ts
 * which is the single source of truth for all currency display.
 */

export {
  formatMoney,
  formatMoneyShort,
  parseMoney,
  currencyLabel,
  currencyCode,
  currencySymbol,
  getActiveCurrency,
} from "@shared/config/currency";

export type SessionComputedStatus = 'OPEN' | 'CLOSED' | 'TIMED_OUT';

export function computeSessionStatus(session: {
  openedAt?: string | Date | null;
  closedAt?: string | Date | null;
  timeoutAt?: string | Date | null;
}, now: Date = new Date()): SessionComputedStatus {
  if (session.closedAt) {
    return 'CLOSED';
  }

  const openedAt = session.openedAt ? new Date(session.openedAt) : null;
  const timeoutAt = session.timeoutAt ? new Date(session.timeoutAt) : null;

  if (openedAt && timeoutAt && timeoutAt.getTime() <= now.getTime()) {
    return 'TIMED_OUT';
  }

  return 'OPEN';
}

export function getSessionStatusLabel(status: SessionComputedStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Ouverte';
    case 'TIMED_OUT':
      return 'Expirée';
    case 'CLOSED':
    default:
      return 'Fermée';
  }
}

// Date formatting
export function formatDate(
  date: string | Date | null | undefined,
  options?: {
    format?: 'short' | 'long' | 'relative' | 'datetime';
    locale?: string;
  }
): string {
  if (!date) return '-';

  const { format = 'short', locale = 'fr-FR' } = options || {};

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return '-';

  switch (format) {
    case 'long':
      return d.toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

    case 'datetime':
      return d.toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

    case 'relative':
      return formatRelativeDate(d);

    case 'short':
    default:
      return d.toLocaleDateString(locale);
  }
}

// Relative date formatting (e.g., "il y a 2 jours")
export function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
  if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;

  return `Il y a ${Math.floor(diffDays / 365)} ans`;
}

// Days remaining calculation
export function getDaysRemaining(targetDate: string | Date): {
  days: number;
  text: string;
  isOverdue: boolean;
} {
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  let text: string;
  if (days < 0) text = 'Échéance dépassée';
  else if (days === 0) text = "Aujourd'hui";
  else if (days === 1) text = 'Demain';
  else text = `${days} jours restants`;

  return { days, text, isOverdue: days < 0 };
}

// Phone number formatting
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '-';

  const cleaned = phone.replace(/\D/g, '');

  // Format for Congo numbers (9 digits) -> +242 XX XXX XX XX
  if (cleaned.length === 9) {
    return `+242 ${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 7)} ${cleaned.slice(7)}`;
  }

  // Format with country code (12 digits starting with 242) -> +242 XX XXX XX XX
  if (cleaned.length === 12 && cleaned.startsWith('242')) {
    return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10)}`;
  }

  // Fallback
  return phone;
}

// Percentage formatting
export function formatPercentage(value: number | string | null | undefined, decimals = 1): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  if (isNaN(num)) return '0%';
  return `${num.toFixed(decimals)}%`;
}

// Number formatting (generic)
export function formatNumber(
  value: number | string | null | undefined,
  options?: {
    locale?: string;
    decimals?: number;
    prefix?: string;
    suffix?: string;
  }
): string {
  const { locale = 'fr-FR', decimals = 0, prefix = '', suffix = '' } = options || {};

  const num = typeof value === 'string' ? parseFloat(value) : (value || 0);
  if (isNaN(num)) return `${prefix}0${suffix}`;

  const formatted = num.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${prefix}${formatted}${suffix}`;
}

// Account number formatting (e.g., "EP-XXXX-XXXX")
export function formatAccountNumber(accountNumber: string | null | undefined): string {
  if (!accountNumber) return '-';
  return accountNumber;
}

// Truncate text with ellipsis
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength - 3)}...`;
}

// Name formatting (capitalize)
export function formatName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format client name according to business rules:
 * - Nom (last name): UPPERCASE
 * - Prénom (first name): Title Case, handling compound names (Jean-Pierre, Marie Claire)
 */
export function formatClientName(nom: string | null | undefined, prenom?: string | null): string {
  // Format last name: UPPERCASE
  const formattedNom = (nom || '').trim().toUpperCase();
  
  if (!prenom) {
    return formattedNom;
  }
  
  // Format first name: Title Case with support for:
  // - Simple names: "jean" -> "Jean"
  // - Compound names with hyphen: "jean-pierre" -> "Jean-Pierre"
  // - Multiple first names: "marie claire" -> "Marie Claire"
  const formatPrenom = (p: string): string => {
    return p
      .trim()
      .split(/(\s+|-)/) // Split on spaces and hyphens, keeping delimiters
      .map(part => {
        if (part === ' ' || part === '-') return part;
        if (!part) return '';
        // Handle each word: lowercase then capitalize first letter
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join('');
  };
  
  const formattedPrenom = formatPrenom(prenom);
  
  return formattedPrenom ? `${formattedNom} ${formattedPrenom}` : formattedNom;
}

// File size formatting
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ============================================
// STORAGE URL UTILITIES
// ============================================

// Variable d'environnement pour l'URL de stockage (optionnel)
const STORAGE_API_BASE = '/api/storage/files';

// Patterns pour détecter les URLs MinIO
const MINIO_URL_PATTERNS = [
  /^https?:\/\/[^/]+\/public-assets\//,
  /^https?:\/\/[^/]+\/secure-docs\//,
];

// Pattern pour double-prefix
const DOUBLE_PREFIX_PATTERN = /^(https?:\/\/[^/]+\/[^/]+\/)(https?:\/\/.+)$/;

/**
 * Extrait l'object key d'une URL ou chemin potentiellement malformé.
 * Fonction utilitaire côté client, miroir de StorageService.extractKeyFromUrl
 */
export function extractStorageKey(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Data URIs: retourner tels quels
  if (trimmed.startsWith('data:')) return trimmed;

  // URLs OAuth externes: retourner telles quelles
  if (trimmed.startsWith('https://lh3.googleusercontent.com')) return trimmed;
  if (trimmed.startsWith('https://graph.facebook.com')) return trimmed;

  // Corriger les double-prefixes
  const doubleMatch = trimmed.match(DOUBLE_PREFIX_PATTERN);
  if (doubleMatch) {
    return extractStorageKey(doubleMatch[2]);
  }

  // Si c'est une URL MinIO, extraire le chemin après le bucket
  for (const pattern of MINIO_URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      const cleaned = trimmed.replace(pattern, '');
      return cleaned.replace(/\/+/g, '/').replace(/^\//, '') || null;
    }
  }

  // Si c'est une autre URL HTTP
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const pathParts = url.pathname.split('/').filter(Boolean);

      // Vérifier si c'est un bucket connu
      if (pathParts[0] === 'public-assets' || pathParts[0] === 'secure-docs') {
        return pathParts.slice(1).join('/').replace(/\/+/g, '/') || null;
      }

      // URL externe inconnue (OAuth etc.), retourner telle quelle
      return trimmed;
    } catch {
      return null;
    }
  }

  // C'est déjà un chemin relatif, nettoyer
  let cleaned = trimmed.replace(/\/+/g, '/').replace(/^\//, '');

  // Supprimer le préfixe bucket si présent
  if (cleaned.startsWith('public-assets/')) {
    cleaned = cleaned.slice('public-assets/'.length);
  } else if (cleaned.startsWith('secure-docs/')) {
    cleaned = cleaned.slice('secure-docs/'.length);
  }

  return cleaned || null;
}

/**
 * Résout l'URL complète pour afficher une photo/fichier.
 *
 * Règles:
 * - Si null/undefined/vide → retourne chaîne vide
 * - Si data URI → retourne tel quel
 * - Si URL externe (Google, Facebook OAuth) → retourne tel quel
 * - Si déjà une URL API (/api/) → retourne tel quel
 * - Sinon → extrait l'object key et préfixe avec l'API storage
 */
export function resolveStorageUrl(path: string | null | undefined): string {
  if (!path) return '';

  const trimmed = path.trim();
  if (!trimmed) return '';

  // Data URIs: retourner tels quels
  if (trimmed.startsWith('data:')) return trimmed;

  // URLs déjà formatées pour l'API
  if (trimmed.startsWith('/api/')) return trimmed;

  // URLs externes (OAuth): retourner telles quelles
  if (trimmed.startsWith('https://lh3.googleusercontent.com')) return trimmed;
  if (trimmed.startsWith('https://graph.facebook.com')) return trimmed;

  // Extraire la clé propre
  const key = extractStorageKey(trimmed);
  if (!key) return '';

  // Si c'est une URL externe après extraction, retourner telle quelle
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }

  // Construire l'URL via l'API storage
  return `${STORAGE_API_BASE}/${key}`;
}

/**
 * Alias pour rétro-compatibilité - utilise resolveStorageUrl
 * @deprecated Utiliser resolveStorageUrl à la place
 */
export function resolveClientPhotoUrl(url: string | null | undefined): string {
  return resolveStorageUrl(url);
}
