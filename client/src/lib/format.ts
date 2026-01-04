/**
 * Formatting Utilities for COFIN Platform
 * Centralized formatting functions for consistency
 */

// Currency formatting
export function formatMoney(amount: number | string | null | undefined, options?: {
  showCurrency?: boolean;
  compact?: boolean;
  decimals?: number;
}): string {
  const { showCurrency = true, compact = false, decimals = 0 } = options || {};

  const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);

  if (isNaN(num)) return showCurrency ? '0 FCFA' : '0';

  if (compact) {
    if (Math.abs(num) >= 1_000_000_000) {
      return `${(num / 1_000_000_000).toFixed(1)} Md${showCurrency ? ' FCFA' : ''}`;
    }
    if (Math.abs(num) >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)} M${showCurrency ? ' FCFA' : ''}`;
    }
    if (Math.abs(num) >= 1_000) {
      return `${(num / 1_000).toFixed(1)} K${showCurrency ? ' FCFA' : ''}`;
    }
  }

  const formatted = num.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return showCurrency ? `${formatted} FCFA` : formatted;
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

  // Format for Congo numbers
  if (cleaned.length === 9) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 7)} ${cleaned.slice(7)}`;
  }

  if (cleaned.length === 12 && cleaned.startsWith('242')) {
    return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10)}`;
  }

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

// File size formatting
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
