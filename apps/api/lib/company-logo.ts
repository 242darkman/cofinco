import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createLogger } from './logger';
import { getTenantConfig } from '../config/tenant-config';

const logger = createLogger('CompanyLogo');

/** Racine des assets statiques servis par le frontend. */
const PUBLIC_DIR = 'apps/web/public';
/** Logo par défaut du cœur si la config tenant n'en fournit pas. */
const DEFAULT_LOGO_URL = '/brand/microflex/logo.png';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

let _logoBuffer: Buffer | null | undefined;
let _logoBase64: string | null | undefined;
let _logoMime: string | null | undefined;

/** Convertit une URL de logo statique (`/brand/...`) en chemin disque, ou null si distante. */
function publicPathFromUrl(url: string): string | null {
  if (!url.startsWith('/')) return null; // URL distante : non résolue côté serveur
  return resolve(process.cwd(), PUBLIC_DIR, `.${url}`);
}

/**
 * Charge le logo de la société (source unique : config tenant effective au boot).
 * Le résultat est mis en cache module ; un déploiement = un tenant.
 */
function loadLogo(): void {
  if (_logoBuffer !== undefined) return; // Déjà chargé (ou échec)

  const logoUrl = getTenantConfig().theme.logoUrl ?? DEFAULT_LOGO_URL;
  const candidates = [publicPathFromUrl(logoUrl), publicPathFromUrl(DEFAULT_LOGO_URL)]
    .filter((p): p is string => p !== null);

  for (const path of candidates) {
    try {
      _logoBuffer = readFileSync(path);
      _logoMime = MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream';
      _logoBase64 = `data:${_logoMime};base64,${_logoBuffer.toString('base64')}`;
      return;
    } catch {
      // Essaie le candidat suivant (logo tenant → logo cœur par défaut)
    }
  }

  logger.warn({ logoUrl }, 'Logo société introuvable sous apps/web/public');
  _logoBuffer = null;
  _logoBase64 = null;
  _logoMime = null;
}

/** Buffer PNG/JPEG/… du logo, ou null si indisponible. */
export function getLogoBuffer(): Buffer | null {
  loadLogo();
  return _logoBuffer ?? null;
}

/** Logo en data URI base64 (pour jsPDF), ou null si indisponible. */
export function getLogoBase64(): string | null {
  loadLogo();
  return _logoBase64 ?? null;
}

/** Type MIME du logo chargé, ou null si indisponible. */
export function getLogoMime(): string | null {
  loadLogo();
  return _logoMime ?? null;
}

/** Nom de fichier suggéré pour une pièce jointe (extension cohérente avec le MIME). */
export function getLogoFilename(): string {
  loadLogo();
  const ext =
    _logoMime === 'image/jpeg' ? '.jpg'
    : _logoMime === 'image/webp' ? '.webp'
    : _logoMime === 'image/svg+xml' ? '.svg'
    : '.png';
  return `logo${ext}`;
}

/** Réinitialise le cache (tests). */
export function resetCompanyLogoCacheForTests(): void {
  _logoBuffer = undefined;
  _logoBase64 = undefined;
  _logoMime = undefined;
}
