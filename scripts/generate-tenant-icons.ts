/**
 * Génère toutes les icônes PWA d'un tenant à partir de son logo source.
 *
 * Source de vérité : un seul logo haute résolution par tenant (SVG de
 * préférence, sinon PNG/JPG). Toutes les tailles, les variantes maskable,
 * l'apple-touch-icon, les favicons et le badge en sont dérivés — jamais
 * édités à la main. Sortie propre et idempotente :
 *
 *   apps/web/public/brand/<tenant>/icons/
 *
 * `sharp` est une devDependency : la génération se fait à la demande (quand un
 * logo change) et les PNG produits sont committés comme assets statiques ; le
 * runtime et le conteneur Docker n'ont donc jamais besoin de `sharp`.
 *
 * Usage :
 *   npm run icons:generate                # tous les tenants
 *   npm run icons:generate micro-cred-sepela   # un tenant précis
 */
import { readdirSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import { tenantConfigSchema, type TenantConfig } from "../packages/shared/tenant-config";

const ROOT = join(import.meta.dirname, "..");
const TENANTS_DIR = join(ROOT, "config/tenants");
const PUBLIC_DIR = join(ROOT, "apps/web/public");
const BRAND_DIR = join(PUBLIC_DIR, "brand");

/** Tailles d'icônes PWA « any » (fond transparent conservé). */
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
/** Tailles générées aussi en variante maskable (fond opaque + zone de sécurité). */
const MASKABLE_SIZES = [192, 512];
/** Le logo occupe 80 % du canevas maskable (10 % de marge de sécurité de chaque côté). */
const MASKABLE_CONTENT_RATIO = 0.8;
/** Fond opaque des icônes maskable / Apple (la transparence y est interdite). */
const OPAQUE_BACKGROUND = "#ffffff";
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

/**
 * Localise le logo source d'un tenant : d'abord via `theme.logoUrl`, sinon le
 * premier fichier image trouvé dans `public/brand/<tenant>/`.
 */
function resolveSourceLogo(tenantId: string, logoUrl?: string): string | undefined {
  const candidates: string[] = [];
  if (logoUrl) candidates.push(join(PUBLIC_DIR, logoUrl.replace(/^\//, "")));

  const dir = join(BRAND_DIR, tenantId);
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (/\.(svg|png|jpe?g|webp)$/i.test(file)) candidates.push(join(dir, file));
    }
  }
  return candidates.find((p) => existsSync(p));
}

/** Redimensionne le logo (fond transparent) dans un carré `size`. */
function resizeContain(source: string, size: number) {
  return sharp(source).resize(size, size, { fit: "contain", background: TRANSPARENT }).png();
}

/**
 * Compose le logo centré sur un carré au fond opaque (icônes maskable / Apple),
 * le logo occupant `ratio` du canevas pour respecter la zone de sécurité.
 */
async function composeOnOpaque(source: string, size: number, ratio: number): Promise<Buffer> {
  const inner = Math.round(size * ratio);
  const logo = await resizeContain(source, inner).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: OPAQUE_BACKGROUND } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}

/** Génère l'ensemble des icônes d'un tenant. */
async function generateForTenant(tenantId: string, config: TenantConfig): Promise<boolean> {
  const source = resolveSourceLogo(tenantId, config.theme.logoUrl);
  if (!source) {
    console.warn(`⚠ ${tenantId} — aucun logo source trouvé (attendu dans public/brand/${tenantId}/)`);
    return false;
  }

  const outDir = join(BRAND_DIR, tenantId, "icons");
  mkdirSync(outDir, { recursive: true });

  // 1. Icônes « any » (transparence conservée).
  for (const size of ICON_SIZES) {
    await resizeContain(source, size).toFile(join(outDir, `icon-${size}x${size}.png`));
  }

  // 2. Icônes maskable (fond opaque + zone de sécurité).
  for (const size of MASKABLE_SIZES) {
    const buffer = await composeOnOpaque(source, size, MASKABLE_CONTENT_RATIO);
    await sharp(buffer).toFile(join(outDir, `icon-${size}-maskable.png`));
  }

  // 3. Apple touch icon (180, fond opaque — iOS ignore la transparence).
  const apple = await composeOnOpaque(source, 180, 0.9);
  await sharp(apple).toFile(join(outDir, "apple-touch-icon.png"));

  // 4. Favicons (16/32, transparence conservée).
  for (const size of [16, 32]) {
    await resizeContain(source, size).toFile(join(outDir, `favicon-${size}x${size}.png`));
  }

  // 5. Badge de notification (72, monochrome doux — logo réduit transparent).
  await resizeContain(source, 72).toFile(join(outDir, "badge-72x72.png"));

  console.log(
    `✓ ${tenantId} — ${ICON_SIZES.length + MASKABLE_SIZES.length + 4} icônes générées ` +
      `dans public/brand/${tenantId}/icons/ (source : ${basename(source)})`,
  );
  return true;
}

/** Charge et valide toutes les configs tenant. */
function loadTenantConfigs(): Array<{ id: string; config: TenantConfig }> {
  return readdirSync(TENANTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((file) => {
      const config = tenantConfigSchema.parse(JSON.parse(readFileSync(join(TENANTS_DIR, file), "utf8")));
      return { id: basename(file, ".json"), config };
    });
}

async function main(): Promise<void> {
  const target = process.argv[2];
  const tenants = loadTenantConfigs().filter((t) => !target || t.id === target);

  if (tenants.length === 0) {
    console.error(target ? `Tenant inconnu : "${target}"` : "Aucune configuration tenant trouvée.");
    process.exit(1);
  }

  let generated = 0;
  for (const { id, config } of tenants) {
    if (await generateForTenant(id, config)) generated += 1;
  }

  console.log(`\n${generated}/${tenants.length} tenant(s) traité(s).`);
}

main().catch((err) => {
  console.error("Échec de la génération des icônes :", err);
  process.exit(1);
});
