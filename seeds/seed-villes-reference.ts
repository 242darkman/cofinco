/**
 * MICROFLEX — Seed du référentiel MONDIAL de villes (lieu de naissance)
 *
 * Alimente la table `villes_reference` depuis `seeds/cities5000.txt` (GeoNames,
 * villes de plus de 5000 habitants, ~68k lignes). Utilisé UNIQUEMENT pour
 * l'autocomplétion du lieu de naissance des employés, filtrée par pays.
 *
 * Distinct de la géographie opérationnelle (`villes`, scopée Congo).
 *
 * Idempotent : rejouable sans effet (garde par comptage + onConflictDoNothing
 * sur geoname_id). Prérequis : table `pays` déjà seedée (mapping ISO2 → paysId).
 *
 * Usage standalone :
 *   node --env-file=.env --import tsx seeds/seed-villes-reference.ts
 *   node --env-file=.env --import tsx seeds/seed-villes-reference.ts --dry-run
 */

import { db, pool } from "../apps/api/db";
import { count } from "drizzle-orm";
import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { resolve } from "path";
import { createLogger } from "../apps/api/lib/logger";
import { pays } from "@shared/schema/pays";
import { villesReference } from "@shared/schema/villes-reference";
import { mapCityLine } from "./geonames-parse";

const logger = createLogger("SeedVillesReference");

const SEEDS_DIR = resolve(process.cwd(), "seeds");
const SOURCE_FILE = "cities5000.txt";
const BATCH_SIZE = 5000;
/** Au-delà, on considère le référentiel déjà chargé (skip du re-stream). */
const ALREADY_LOADED_THRESHOLD = 50_000;

export interface SeedVillesReferenceResult {
  action: "created" | "skipped" | "error" | "dry-run";
  count: number;
  details?: string;
}

/**
 * Stream `cities5000.txt` → INSERT batch dans `villes_reference`.
 * Le pays est résolu via la table `pays` (ISO2 → id).
 */
export async function seedVillesReference(
  dryRun = false,
): Promise<SeedVillesReferenceResult> {
  const filePath = resolve(SEEDS_DIR, SOURCE_FILE);
  if (!existsSync(filePath)) {
    return {
      action: "error",
      count: 0,
      details: `Fichier introuvable : ${filePath}. Télécharger via scripts/download-geonames.sh cities5000`,
    };
  }

  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(villesReference);
  if (Number(existing) >= ALREADY_LOADED_THRESHOLD) {
    return {
      action: "skipped",
      count: Number(existing),
      details: "référentiel villes déjà chargé",
    };
  }

  if (dryRun) {
    return { action: "dry-run", count: 0, details: `chargerait ${SOURCE_FILE}` };
  }

  // Mapping ISO2 → paysId (pays doit être seedé au préalable)
  const allPays = await db.select({ id: pays.id, iso2: pays.iso2 }).from(pays);
  const paysByIso2 = new Map(allPays.map((p) => [p.iso2, p.id]));
  if (paysByIso2.size === 0) {
    return {
      action: "error",
      count: 0,
      details: "table `pays` vide — seeder les pays avant le référentiel villes",
    };
  }

  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let batch: (typeof villesReference.$inferInsert)[] = [];
  let inserted = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await db.insert(villesReference).values(batch).onConflictDoNothing();
    inserted += batch.length;
    batch = [];
    if (inserted % 20_000 === 0) logger.info(`  … ${inserted} villes traitées`);
  };

  try {
    for await (const line of rl) {
      const row = mapCityLine(line.split("\t"), paysByIso2);
      if (!row) continue;
      batch.push(row);
      if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();

    const [{ value: final }] = await db
      .select({ value: count() })
      .from(villesReference);
    return {
      action: "created",
      count: Number(final),
      details: `${inserted} lignes streamées depuis ${SOURCE_FILE}`,
    };
  } catch (err) {
    logger.error({ err }, "Erreur lors du seed du référentiel villes");
    return {
      action: "error",
      count: 0,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

// Runner autonome
const isMainModule = process.argv[1]?.includes("seed-villes-reference");
if (isMainModule) {
  const dryRun = process.argv.includes("--dry-run");
  seedVillesReference(dryRun)
    .then(async (r) => {
      logger.info({ ...r }, `Référentiel villes : ${r.action} (${r.count})`);
      await pool.end();
      process.exit(r.action === "error" ? 1 : 0);
    })
    .catch(async (err) => {
      logger.error({ err }, "Échec fatal");
      await pool.end();
      process.exit(1);
    });
}
