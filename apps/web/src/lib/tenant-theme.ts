/**
 * Charte graphique dynamique dérivée du branding tenant.
 *
 * À partir de la couleur primaire (et secondaire) du tenant — fichier client
 * ou surcharge en base — on dérive une palette cohérente (hover, fonds actifs,
 * focus, halo) et on l'injecte via une feuille de style scindée `:root` /
 * `.dark`, afin de respecter les deux thèmes sans écraser les tokens
 * sémantiques (succès, danger, statut...) qui restent la charte par défaut.
 */
import type { TenantConfig } from '@shared/tenant-config';

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Parse une couleur CSS (hex 3/6, rgb(a), hsl(a)) vers HSL. */
export function parseColor(css: string): Hsl | undefined {
  const value = css.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    let raw = hex[1];
    if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('');
    const r = parseInt(raw.slice(0, 2), 16) / 255;
    const g = parseInt(raw.slice(2, 4), 16) / 255;
    const b = parseInt(raw.slice(4, 6), 16) / 255;
    return rgbToHsl(r, g, b);
  }

  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(value);
  if (rgb) {
    return rgbToHsl(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255);
  }

  const hsl = /^hsla?\(\s*(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)%\s*,\s*(\d{1,3}(?:\.\d+)?)%/i.exec(value);
  if (hsl) {
    return { h: Number(hsl[1]), s: Number(hsl[2]), l: Number(hsl[3]) };
  }

  return undefined;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

export const hsl = (c: Hsl): string => `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
export const hsla = (c: Hsl, a: number): string => `hsla(${c.h}, ${c.s}%, ${c.l}%, ${a})`;
export const withLightness = (c: Hsl, l: number): Hsl => ({ ...c, l: clamp(l) });
export const shiftLightness = (c: Hsl, delta: number): Hsl => ({ ...c, l: clamp(c.l + delta) });

interface ThemeVariables {
  root: Record<string, string>;
  dark: Record<string, string>;
}

/**
 * Dérive les variables de charte des deux thèmes à partir du branding.
 * Retourne undefined si aucune couleur primaire exploitable n'est définie.
 */
export function computeTenantThemeVariables(config: TenantConfig): ThemeVariables | undefined {
  const primary = parseColor(config.theme.primaryColor);
  if (!primary) return undefined;

  // Thème clair : couleur telle quelle, assombrie au survol,
  // teintes très claires pour les fonds actifs.
  const root: Record<string, string> = {
    '--accent-primary': hsl(primary),
    '--accent-primary-hover': hsl(shiftLightness(primary, -8)),
    '--input-focus': hsl(primary),
    '--sidebar-text-active': hsl(primary),
    '--sidebar-item-active': hsl(withLightness({ ...primary, s: clamp(primary.s, 0, 60) }, 95)),
    '--login-accent-glow': hsla(primary, 0.25),
  };

  // Thème sombre : version éclaircie pour préserver le contraste sur fond
  // sombre (l ≥ 60), fond actif translucide.
  const darkPrimary = withLightness(primary, Math.max(primary.l, 60));
  const dark: Record<string, string> = {
    '--accent-primary': hsl(darkPrimary),
    '--accent-primary-hover': hsl(shiftLightness(darkPrimary, 8)),
    '--input-focus': hsl(darkPrimary),
    '--sidebar-text-active': hsl(shiftLightness(darkPrimary, 8)),
    '--sidebar-item-active': hsla(darkPrimary, 0.15),
    '--login-accent-glow': hsla(darkPrimary, 0.2),
  };

  // Secondaire : explicite si fourni, sinon dérivé de la primaire (ton plus
  // clair du même hue) afin que les dégradés de marque (avatar, onglets)
  // restent cohérents sur tous les tenants.
  const explicitSecondary = config.theme.secondaryColor ? parseColor(config.theme.secondaryColor) : undefined;
  const secondary = explicitSecondary ?? withLightness(primary, clamp(primary.l + 14));
  root['--accent-secondary'] = hsl(secondary);
  root['--accent-secondary-hover'] = hsl(shiftLightness(secondary, -8));
  const darkSecondary = withLightness(secondary, Math.max(secondary.l, 60));
  dark['--accent-secondary'] = hsl(darkSecondary);
  dark['--accent-secondary-hover'] = hsl(shiftLightness(darkSecondary, 8));

  // Tons du loader applicatif : trois teintes harmonieuses dérivées de la
  // marque (base, secondaire, contre-ton). Le contre-ton s'éclaircit ou
  // s'assombrit à l'opposé de la primaire pour rester distinct quel que soit
  // le branding, tout en conservant un rendu premium.
  // Base claire → contre-ton plus sombre ; base sombre → contre-ton plus clair.
  const counterTone = shiftLightness(primary, primary.l >= 50 ? -22 : 22);
  root['--loader-ring-1'] = hsl(primary);
  root['--loader-ring-2'] = hsl(secondary);
  root['--loader-ring-3'] = hsl(counterTone);
  const darkCounter = withLightness(darkPrimary, clamp(darkPrimary.l - 18));
  dark['--loader-ring-1'] = hsl(darkPrimary);
  dark['--loader-ring-2'] = hsl(darkSecondary);
  dark['--loader-ring-3'] = hsl(darkCounter);

  return { root, dark };
}

const STYLE_ELEMENT_ID = 'tenant-theme';

function serialize(selector: string, variables: Record<string, string>): string {
  const body = Object.entries(variables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
}

/**
 * Injecte (ou met à jour) la feuille de style de charte tenant.
 * Sans couleur primaire exploitable, la charte par défaut reste intacte.
 */
export function applyTenantTheme(config: TenantConfig): void {
  const variables = computeTenantThemeVariables(config);
  const existing = document.getElementById(STYLE_ELEMENT_ID);

  if (!variables) {
    existing?.remove();
    return;
  }

  const css = `${serialize(':root', variables.root)}\n${serialize('.dark', variables.dark)}`;
  if (existing) {
    existing.textContent = css;
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = css;
  document.head.appendChild(style);
}
