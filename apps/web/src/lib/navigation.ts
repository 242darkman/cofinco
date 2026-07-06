/**
 * Helpers de navigation centralisés.
 *
 * Toute redirection vers /login ou post-login DOIT passer par ces fonctions
 * pour garantir la cohérence (returnTo, replace, pas de boucle).
 */

/**
 * Construit l'URL de login avec un returnTo optionnel.
 * Ignore les chemins triviaux (/, /login) pour éviter un returnTo inutile.
 */
export function buildLoginUrl(returnTo?: string): string {
  if (returnTo && returnTo !== '/' && returnTo !== '/login') {
    return `/login?returnTo=${encodeURIComponent(returnTo)}`;
  }
  return '/login';
}

/**
 * Lit le paramètre returnTo du query string courant.
 * Sécurisé : refuse les URLs externes (protocole relatif, domaine absolu).
 */
export function getReturnTo(): string | null {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get('returnTo');
  if (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return returnTo;
  }
  return null;
}

/**
 * Calcule la destination post-login selon le rôle et un éventuel returnTo.
 */
export function getPostLoginDestination(role: string, returnTo?: string | null): string {
  if (returnTo && returnTo !== '/login') return returnTo;
  const normalizedRole = role?.toLowerCase() || '';
  if (normalizedRole === 'agent_terrain' || normalizedRole === 'agent') {
    return '/agent-terrain';
  }
  return '/';
}

/**
 * Redirection dure (full page reload) vers /login.
 * À utiliser UNIQUEMENT pour les cas de session expirée / force logout
 * où l'état React est potentiellement corrompu.
 *
 * Capture automatiquement l'URL courante comme returnTo.
 */
export function hardRedirectToLogin(reason?: string): void {
  const currentPath = window.location.pathname + window.location.search;
  const loginUrl = buildLoginUrl(currentPath);
  const finalUrl = reason
    ? `${loginUrl}${loginUrl.includes('?') ? '&' : '?'}reason=${encodeURIComponent(reason)}`
    : loginUrl;
  window.location.href = finalUrl;
}
