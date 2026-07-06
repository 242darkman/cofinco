/**
 * Device Fingerprinting pour la sécurité des sessions
 *
 * Génère une empreinte unique basée sur les caractéristiques du navigateur/appareil.
 * Cette empreinte est utilisée pour détecter si un cookie de session est utilisé
 * depuis un appareil différent (potentiellement volé).
 *
 * Caractéristiques collectées:
 * - User Agent
 * - Langue du navigateur
 * - Fuseau horaire
 * - Résolution d'écran
 * - Profondeur de couleur
 * - Platform
 * - Nombre de processeurs
 * - Canvas fingerprint (hash)
 * - WebGL vendor/renderer
 * - Plugins installés (basique)
 *
 * Note: Ce n'est PAS du tracking publicitaire. C'est une mesure de sécurité
 * pour protéger les comptes utilisateurs contre le vol de session.
 */

interface FingerprintComponents {
  userAgent: string;
  language: string;
  languages: string;
  timezone: string;
  timezoneOffset: number;
  screenResolution: string;
  colorDepth: number;
  platform: string;
  hardwareConcurrency: number;
  canvasHash: string;
  webglVendor: string;
  webglRenderer: string;
  touchSupport: boolean;
  cookieEnabled: boolean;
  doNotTrack: string;
}

/**
 * Génère un hash simple à partir d'une chaîne
 * Utilise FNV-1a pour sa rapidité et bonne distribution
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Génère un hash du canvas pour identifier le GPU/navigateur
 */
function getCanvasHash(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    canvas.width = 200;
    canvas.height = 50;

    // Texte avec différentes polices pour créer une empreinte unique
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('MICROFLEX fingerprint', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('MICROFLEX fingerprint', 4, 17);

    // Ajouter des formes géométriques
    ctx.beginPath();
    ctx.arc(50, 25, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#808080';
    ctx.fill();

    const dataUrl = canvas.toDataURL();
    return fnv1aHash(dataUrl);
  } catch {
    return 'canvas-error';
  }
}

/**
 * Récupère les informations WebGL (vendor et renderer)
 */
function getWebglInfo(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { vendor: 'no-webgl', renderer: 'no-webgl' };

    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return { vendor: 'unknown', renderer: 'unknown' };

    return {
      vendor: (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown',
      renderer: (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown',
    };
  } catch {
    return { vendor: 'error', renderer: 'error' };
  }
}

/**
 * Collecte toutes les composantes de l'empreinte
 */
function collectComponents(): FingerprintComponents {
  const webgl = getWebglInfo();

  return {
    userAgent: navigator.userAgent || '',
    language: navigator.language || '',
    languages: (navigator.languages || []).join(','),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    timezoneOffset: new Date().getTimezoneOffset(),
    screenResolution: `${screen.width}x${screen.height}x${screen.availWidth}x${screen.availHeight}`,
    colorDepth: screen.colorDepth || 0,
    platform: navigator.platform || '',
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    canvasHash: getCanvasHash(),
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    cookieEnabled: navigator.cookieEnabled || false,
    doNotTrack: navigator.doNotTrack || 'unset',
  };
}

/**
 * Génère l'empreinte complète de l'appareil
 * @returns Hash unique représentant l'appareil
 */
export function generateDeviceFingerprint(): string {
  try {
    const components = collectComponents();

    // Créer une chaîne à partir des composantes les plus stables
    // On exclut les éléments qui peuvent changer (comme la résolution si multi-écran)
    const stableString = [
      components.userAgent,
      components.language,
      components.timezone,
      components.timezoneOffset,
      components.platform,
      components.hardwareConcurrency,
      components.canvasHash,
      components.webglVendor,
      components.webglRenderer,
      components.colorDepth,
      components.touchSupport,
    ].join('|');

    return fnv1aHash(stableString);
  } catch (error) {
    console.error('Error generating device fingerprint:', error);
    return 'error-' + Date.now();
  }
}

/**
 * Génère un fingerprint partiel (moins strict)
 * Utilisé pour la comparaison tolérante
 */
export function generatePartialFingerprint(): string {
  try {
    const components = collectComponents();

    // Composantes très stables seulement
    const partialString = [
      components.platform,
      components.hardwareConcurrency,
      components.canvasHash,
      components.webglVendor,
      components.timezone,
    ].join('|');

    return fnv1aHash(partialString);
  } catch {
    return 'partial-error';
  }
}

/**
 * Récupère l'empreinte stockée ou en génère une nouvelle
 * L'empreinte est stockée en sessionStorage pour cohérence pendant la session
 */
export function getOrCreateFingerprint(): { full: string; partial: string } {
  const storageKey = 'microflex_device_fp';

  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored);
    }

    const fingerprint = {
      full: generateDeviceFingerprint(),
      partial: generatePartialFingerprint(),
    };

    sessionStorage.setItem(storageKey, JSON.stringify(fingerprint));
    return fingerprint;
  } catch {
    return {
      full: generateDeviceFingerprint(),
      partial: generatePartialFingerprint(),
    };
  }
}

/**
 * Efface l'empreinte stockée (utile lors de la déconnexion)
 */
export function clearStoredFingerprint(): void {
  try {
    sessionStorage.removeItem('microflex_device_fp');
  } catch {
    // Ignore errors
  }
}

export default {
  generate: generateDeviceFingerprint,
  generatePartial: generatePartialFingerprint,
  getOrCreate: getOrCreateFingerprint,
  clear: clearStoredFingerprint,
};
