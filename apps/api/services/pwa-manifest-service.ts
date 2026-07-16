/**
 * Construction du manifeste PWA à partir de la configuration tenant effective.
 *
 * Les icônes sont résolues par tenant (`/brand/<id>/icons/…`) lorsqu'elles ont
 * été générées (voir `scripts/generate-tenant-icons.ts`), avec repli sur les
 * icônes globales `/icons/…` sinon. Les raccourcis sont filtrés selon les
 * feature flags actifs du tenant.
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TenantConfig, TenantFeatureFlags } from "@shared/tenant-config";
// TenantConfig inclut déjà `features` (schéma partagé) ; TenantFeatureFlags
// n'est utilisé que pour typer les helpers de raccourcis.

/** Tailles d'icônes exposées dans le manifeste. */
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

/**
 * Racines publiques candidates (prod : dist/public ; dev : apps/web/public).
 * Utilisées uniquement pour détecter la présence des icônes générées.
 */
const PUBLIC_ROOTS = [resolve(process.cwd(), "dist/public"), resolve(process.cwd(), "apps/web/public")];

/** Cache de résolution du chemin d'icônes par tenant (évite les stat() répétés). */
const iconBaseCache = new Map<string, { base: string; maskable: boolean }>();

/** Détermine le préfixe d'icônes du tenant et s'il dispose de variantes maskable. */
function resolveIconBase(tenantId: string): { base: string; maskable: boolean } {
  const cached = iconBaseCache.get(tenantId);
  if (cached) return cached;

  const rel = `brand/${tenantId}/icons`;
  const hasIcons = PUBLIC_ROOTS.some((root) => existsSync(join(root, rel, "icon-512x512.png")));
  const hasMaskable = hasIcons && PUBLIC_ROOTS.some((root) => existsSync(join(root, rel, "icon-512-maskable.png")));

  const result = hasIcons
    ? { base: `/${rel}`, maskable: hasMaskable }
    : { base: "/icons", maskable: false }; // repli global
  iconBaseCache.set(tenantId, result);
  return result;
}

/** Construit le tableau `icons` du manifeste. */
function buildIcons(tenantId: string) {
  const { base, maskable } = resolveIconBase(tenantId);

  // Sans variantes maskable dédiées, on conserve « maskable any » sur les icônes
  // classiques (comportement historique du jeu d'icônes global).
  const purpose = maskable ? "any" : "maskable any";
  const icons = ICON_SIZES.map((size) => ({
    src: `${base}/icon-${size}x${size}.png`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  }));

  if (maskable) {
    for (const size of [192, 512]) {
      icons.push({
        src: `${base}/icon-${size}-maskable.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose: "maskable",
      });
    }
  }
  return icons;
}

/** Définition d'un raccourci et de la feature qui conditionne son affichage. */
interface ShortcutDef {
  name: string;
  description: string;
  url: string;
  icon: string;
  /** Feature requise pour proposer le raccourci ; absente = toujours proposé. */
  feature?: keyof TenantFeatureFlags;
}

const SHORTCUTS: ShortcutDef[] = [
  { name: "Caisse", description: "Accéder à la gestion de caisse", url: "/caisse", icon: "shortcut-caisse", feature: "enableCaisse" },
  { name: "Clients", description: "Gérer les clients", url: "/clients", icon: "shortcut-clients" },
  { name: "Terrain", description: "Mode agent terrain", url: "/agent-terrain", icon: "shortcut-terrain", feature: "enableFieldAgents" },
];

/** Construit les raccourcis actifs (glyphes fonctionnels partagés, filtrés par feature). */
function buildShortcuts(features: TenantFeatureFlags) {
  return SHORTCUTS.filter((s) => !s.feature || features[s.feature] === true).map((s) => ({
    name: s.name,
    short_name: s.name,
    description: s.description,
    url: s.url,
    icons: [{ src: `/icons/${s.icon}.png`, sizes: "96x96" }],
  }));
}

/**
 * Assemble le manifeste PWA complet pour un tenant donné.
 * `theme_color` reflète la couleur de marque du tenant (valeur CSS valide).
 */
export function buildPwaManifest(config: TenantConfig) {
  return {
    name: `${config.name} - Plateforme Microfinance`,
    short_name: config.name,
    description: "Application de gestion microfinance - Caisse, Epargne, Crédit, Tontine",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: config.theme.primaryColor || "#0ea5e9",
    orientation: "portrait-primary",
    scope: "/",
    lang: "fr",
    dir: "ltr",
    categories: ["finance", "business"],
    icons: buildIcons(config.id),
    shortcuts: buildShortcuts(config.features),
    screenshots: [
      { src: "/screenshots/dashboard.png", sizes: "1280x720", type: "image/png", form_factor: "wide", label: "Tableau de bord principal" },
      { src: "/screenshots/mobile-caisse.png", sizes: "390x844", type: "image/png", form_factor: "narrow", label: "Gestion de caisse mobile" },
    ],
    related_applications: [],
    prefer_related_applications: false,
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "documents", accept: ["application/pdf", "image/*"] }],
      },
    },
  };
}
