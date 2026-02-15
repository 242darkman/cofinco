/**
 * Utility formatting functions for mobile.
 * Currency formatting is delegated to @shared/config/currency.
 */

/**
 * Format a date relative to now (e.g. "Il y a 5 min", "Hier", "12 janv.")
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return "A l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

/**
 * Format a full date for detail screens (e.g. "12 janvier 2024 a 14:30")
 */
export function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Truncate an account number for display (e.g. "****1234")
 */
export function maskAccountNumber(numero: string): string {
  if (numero.length <= 4) return numero;
  return `****${numero.slice(-4)}`;
}
