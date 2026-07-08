/**
 * XSS Sanitization Utilities for MicroFlex Platform
 * Production-ready HTML/text sanitization
 */

// HTML entities to escape
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS attacks
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize user input by removing potentially dangerous characters
 */
export function sanitizeInput(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';

  return String(input)
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ');
}

/**
 * Sanitize text for display (escapes HTML but preserves newlines)
 */
export function sanitizeForDisplay(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';

  return escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/  /g, '&nbsp;&nbsp;');
}

/**
 * Sanitize a URL to prevent javascript: and other dangerous protocols
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (url === null || url === undefined) return '';

  const sanitized = String(url).trim().toLowerCase();

  // List of allowed protocols
  const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];

  try {
    const parsed = new URL(url, window.location.origin);
    if (!allowedProtocols.includes(parsed.protocol)) {
      return '';
    }
    return url;
  } catch {
    // If not a valid URL, return as relative path if it starts with /
    if (url.startsWith('/') && !url.startsWith('//')) {
      return url;
    }
    return '';
  }
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string | null | undefined): string {
  if (filename === null || filename === undefined) return '';

  return String(filename)
    // Remove path separators
    .replace(/[/\\]/g, '')
    // Remove special characters that could be problematic
    .replace(/[<>:"|?*\x00-\x1F]/g, '')
    // Remove leading dots (hidden files)
    .replace(/^\.+/, '')
    // Limit length
    .substring(0, 255);
}

/**
 * Sanitize phone number (keep only digits and +)
 */
export function sanitizePhoneNumber(phone: string | null | undefined): string {
  if (phone === null || phone === undefined) return '';

  return String(phone)
    .replace(/[^\d+\s-]/g, '')
    .trim();
}

/**
 * Sanitize numeric input (parse to number, return 0 if invalid)
 */
export function sanitizeNumber(value: unknown, defaultValue = 0): number {
  if (value === null || value === undefined) return defaultValue;

  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Sanitize ID (alphanumeric and hyphens only)
 */
export function sanitizeId(id: string | null | undefined): string {
  if (id === null || id === undefined) return '';

  return String(id)
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .substring(0, 100);
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Create a safe text renderer component
 */
export function createSafeText(text: string | null | undefined): string {
  return escapeHtml(sanitizeInput(text));
}

/**
 * Sanitize object values recursively (for API responses)
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : typeof item === 'string'
          ? sanitizeInput(item)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

// React-safe text wrapper (for use in components)
export const SafeText: React.FC<{ children: string | null | undefined }> = ({ children }) => {
  return <>{escapeHtml(children)}</>;
};
