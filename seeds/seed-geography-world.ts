/**
 * MICROFLEX — Seed Géographique Mondial
 *
 * Phases couvertes :
 *   3. Seed regions (ADM1) + migration Congo + seed departements (ADM2) + cleanup legacy
 *   4. Staging allCountries.txt via streaming batch INSERT
 *   5. Enrichissement SQL (lat/lng/pop) + insertion villes mondiales
 *
 * Prérequis :
 *   - seeds/admin1CodesASCII.txt (GeoNames ADM1)
 *   - seeds/admin2Codes.txt (GeoNames ADM2)
 *   - seeds/allCountries.txt (GeoNames ~12M lignes) — pour enrichissement
 *   - Table `pays` déjà seedée
 *   - Tables `regions`, `departements`, `villes`, `geonames_staging` créées via db:push
 *
 * Usage (Docker) :
 *   docker compose exec app node --env-file=.env --import tsx seeds/seed-geography-world.ts
 *   docker compose exec app node --env-file=.env --import tsx seeds/seed-geography-world.ts --enrich-only
 *   docker compose exec app node --env-file=.env --import tsx seeds/seed-geography-world.ts --dry-run
 */

import { db, pool } from '../apps/api/db';
import { eq, and, isNull, isNotNull, count, sql } from 'drizzle-orm';
import { createLogger } from '../apps/api/lib/logger';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';

import { pays } from '@shared/schema/pays';
import { regions, geonamesStaging } from '@shared/schema/geography';
import { departements, villes } from '@shared/schema/operations';

const logger = createLogger('SeedGeoWorld');

// ============================================================================
// CONFIG
// ============================================================================

const SEEDS_DIR = resolve(process.cwd(), 'seeds');
const MIN_POPULATION = 1000; // Seuil population pour insertion villes

// Géographie OPÉRATIONNELLE scopée aux pays d'exploitation. Le lieu de naissance
// mondial des employés est géré séparément par `villes_reference` (cities5000).
// Élargir cet ensemble (+ télécharger les fichiers GeoNames pays correspondants)
// pour couvrir d'autres pays d'exploitation.
const OPERATING_COUNTRIES = new Set(['CG']);

const DRY_RUN = process.argv.includes('--dry-run');
const ENRICH_ONLY = process.argv.includes('--enrich-only');

// Mapping nom département Congo existant → code GeoNames admin1
const CONGO_DEPT_TO_ADMIN1: Record<string, string> = {
  'Bouenza': 'CG.01',
  'Cuvette': 'CG.13',
  'Cuvette-Ouest': 'CG.14',
  'Kouilou': 'CG.04',
  'Lékoumou': 'CG.05',
  'Likouala': 'CG.06',
  'Niari': 'CG.07',
  'Plateaux': 'CG.08',
  'Pool': 'CG.11',
  'Sangha': 'CG.10',
  'Brazzaville': 'CG.12',
  'Pointe-Noire': 'CG.15',
};

// ============================================================================
// HELPERS
// ============================================================================

interface StepResult {
  step: string;
  action: string;
  count: number;
  details?: string;
}

function logStep(result: StepResult) {
  logger.info({ ...result }, `${result.step}: ${result.action} ${result.count} rows`);
}

// ============================================================================
// PHASE 3.1 — Seed Regions (ADM1) depuis admin1CodesASCII.txt
// ============================================================================

async function seedRegions(): Promise<StepResult> {
  const filePath = resolve(SEEDS_DIR, 'admin1CodesASCII.txt');
  if (!existsSync(filePath)) {
    return { step: 'seedRegions', action: 'error', count: 0, details: `File not found: ${filePath}` };
  }

  // Check if already seeded
  const [{ value: existingCount }] = await db.select({ value: count() }).from(regions);
  if (existingCount > 0) {
    return { step: 'seedRegions', action: 'skipped', count: Number(existingCount), details: 'regions already seeded' };
  }

  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');

  // Lookup pays.iso2 → uuid
  const allPays = await db.select({ id: pays.id, iso2: pays.iso2 }).from(pays);
  const paysMap = Object.fromEntries(allPays.map(p => [p.iso2, p.id]));

  const rows: Array<{
    code: string;
    nom: string;
    nomAscii: string;
    geonameId: number;
    paysId: string;
  }> = [];
  let skipped = 0;

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 4) continue;
    const [code, name, nameAscii, geonameIdStr] = parts;
    const cc = code.split('.')[0];
    if (!OPERATING_COUNTRIES.has(cc) || !paysMap[cc]) { skipped++; continue; }

    rows.push({
      code,
      nom: name,
      nomAscii: nameAscii,
      geonameId: parseInt(geonameIdStr, 10),
      paysId: paysMap[cc],
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(regions).values(rows.slice(i, i + 500))
        .onConflictDoNothing({ target: regions.geonameId });
    }
  }

  return { step: 'seedRegions', action: DRY_RUN ? 'dry-run' : 'created', count: rows.length, details: `${skipped} skipped (pays inconnu)` };
}

// ============================================================================
// PHASE 3.2 — Migrer les 12 départements Congo existants → regions
// ============================================================================

async function migrateCongoDeptsToRegions(): Promise<StepResult> {
  // Check if old Congo departements exist (ceux sans geonameId)
  const oldDepts = await db.select().from(departements).where(isNull(departements.geonameId));
  if (oldDepts.length === 0) {
    return { step: 'migrateCongoDeptsToRegions', action: 'skipped', count: 0, details: 'no legacy departements to migrate' };
  }

  // Check if villes still has the legacy departement_id column (dropped after db:push)
  const colCheckResult = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'villes' AND column_name = 'departement_id'
  `);
  if (colCheckResult.rows.length === 0) {
    return { step: 'migrateCongoDeptsToRegions', action: 'skipped', count: 0, details: 'departement_id column already dropped — migration not needed' };
  }

  // Lookup regions par code
  const allRegions = await db.select({ id: regions.id, code: regions.code }).from(regions);
  const regionByCode = Object.fromEntries(allRegions.map(r => [r.code, r.id]));

  let updated = 0;
  if (!DRY_RUN) {
    for (const dept of oldDepts) {
      const adminCode = CONGO_DEPT_TO_ADMIN1[dept.nom];
      if (!adminCode || !regionByCode[adminCode]) {
        logger.warn({ nom: dept.nom }, 'No matching region for old departement');
        continue;
      }
      const regionId = regionByCode[adminCode];

      await db.execute(sql`
        UPDATE villes SET region_id = ${regionId}
        WHERE departement_id = ${dept.id} AND region_id IS NULL
      `);
      updated++;
    }
  }

  return { step: 'migrateCongoDeptsToRegions', action: DRY_RUN ? 'dry-run' : 'updated', count: updated, details: `${oldDepts.length} old depts → villes.regionId backfilled` };
}

// ============================================================================
// PHASE 3.3 — Seed Departements ADM2 depuis admin2Codes.txt
// ============================================================================

async function seedDepartementsADM2(): Promise<StepResult> {
  const filePath = resolve(SEEDS_DIR, 'admin2Codes.txt');
  if (!existsSync(filePath)) {
    return { step: 'seedDepartementsADM2', action: 'error', count: 0, details: `File not found: ${filePath}` };
  }

  // Check if ADM2 already seeded (departements avec geonameId renseigné)
  const [{ value: adm2Count }] = await db.select({ value: count() }).from(departements).where(isNotNull(departements.geonameId));
  if (Number(adm2Count) > 1000) {
    return { step: 'seedDepartementsADM2', action: 'skipped', count: Number(adm2Count), details: 'ADM2 already seeded' };
  }

  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');

  const allPays = await db.select({ id: pays.id, iso2: pays.iso2 }).from(pays);
  const paysMap = Object.fromEntries(allPays.map(p => [p.iso2, p.id]));

  const allRegions = await db.select({ id: regions.id, code: regions.code }).from(regions);
  const regionMap = Object.fromEntries(allRegions.map(r => [r.code, r.id]));

  const rows: Array<{
    code: string;
    nom: string;
    nomAscii: string;
    geonameId: number;
    paysId: string;
    regionId: string;
  }> = [];
  let skipped = 0;

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 4) continue;
    const [code, name, nameAscii, geonameIdStr] = parts;
    const codeParts = code.split('.');
    const cc = codeParts[0];
    const regionCode = `${codeParts[0]}.${codeParts[1]}`;

    if (!OPERATING_COUNTRIES.has(cc) || !paysMap[cc] || !regionMap[regionCode]) { skipped++; continue; }

    rows.push({
      code,
      nom: name,
      nomAscii: nameAscii,
      geonameId: parseInt(geonameIdStr, 10),
      paysId: paysMap[cc],
      regionId: regionMap[regionCode],
    });
  }

  if (!DRY_RUN) {
    for (let i = 0; i < rows.length; i += 500) {
      await db.insert(departements).values(rows.slice(i, i + 500))
        .onConflictDoNothing({ target: departements.geonameId });
    }
  }

  return { step: 'seedDepartementsADM2', action: DRY_RUN ? 'dry-run' : 'created', count: rows.length, details: `${skipped} skipped (pays/region inconnu)` };
}

// ============================================================================
// PHASE 3.4 — Nettoyage des 12 anciens départements Congo (legacy ADM1)
// ============================================================================

async function cleanupLegacyDepts(): Promise<StepResult> {
  // Legacy = rows sans geonameId (insérés avant l'ajout de la colonne)
  const oldDepts = await db.select({ id: departements.id, nom: departements.nom })
    .from(departements)
    .where(isNull(departements.geonameId));

  if (oldDepts.length === 0) {
    return { step: 'cleanupLegacyDepts', action: 'skipped', count: 0, details: 'no legacy rows to clean' };
  }

  if (!DRY_RUN) {
    // 1. Clear legacy departement_id FK on villes if column still exists
    const colCheckResult2 = await db.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'villes' AND column_name = 'departement_id'
    `);
    if (colCheckResult2.rows.length > 0) {
      await db.execute(sql`
        UPDATE villes SET departement_id = NULL
        WHERE departement_id IS NOT NULL
      `);
      logger.info('Cleared departement_id on all villes (legacy FK)');
    }

    // 2. Supprimer les anciens rows
    for (const dept of oldDepts) {
      try {
        await db.delete(departements).where(eq(departements.id, dept.id));
      } catch (err: any) {
        logger.warn({ nom: dept.nom, err: err.message }, 'Could not delete legacy dept (may still have FK refs)');
      }
    }
  }

  return { step: 'cleanupLegacyDepts', action: DRY_RUN ? 'dry-run' : 'deleted', count: oldDepts.length, details: 'removed old Congo ADM1 rows from departements' };
}

// ============================================================================
// PHASE 4 — Staging allCountries.txt via client-side streaming
// ============================================================================

async function loadGeonamesStaging(): Promise<StepResult> {
  // Scope opérationnel : on lit le fichier GeoNames PAR PAYS (CG.txt, quelques Mo)
  // au lieu d'allCountries.txt (1.77 Go). Fallback vers allCountries.txt si présent
  // (legacy / bascule multi-pays) — le filtre OPERATING_COUNTRIES borne alors le staging.
  const scopedFile = resolve(SEEDS_DIR, 'CG.txt');
  const filePath = existsSync(scopedFile) ? scopedFile : resolve(SEEDS_DIR, 'allCountries.txt');
  if (!existsSync(filePath)) {
    return { step: 'loadGeonamesStaging', action: 'error', count: 0, details: `File not found: ${filePath}. Télécharger via scripts/download-geonames.sh CG` };
  }

  // Check if staging already loaded
  const [{ value: stagingCount }] = await db.select({ value: count() }).from(geonamesStaging);
  if (Number(stagingCount) > 100000) {
    return { step: 'loadGeonamesStaging', action: 'skipped', count: Number(stagingCount), details: 'staging already loaded' };
  }

  if (DRY_RUN) {
    return { step: 'loadGeonamesStaging', action: 'dry-run', count: 0, details: `would load ${filePath}` };
  }

  try {
    logger.info('Truncating geonames_staging...');
    await db.execute(sql`TRUNCATE geonames_staging`);

    // Stream allCountries.txt line-by-line (client-side), filter relevant rows,
    // and batch INSERT into geonames_staging. This avoids PG server-side COPY
    // which fails in Docker when app and db are separate containers.
    logger.info(`Streaming ${filePath} → filtering featureClass A/P + PCLI (pays: ${[...OPERATING_COUNTRIES].join(',')}) → batch INSERT...`);
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

    let batch: (typeof geonamesStaging.$inferInsert)[] = [];
    let inserted = 0;
    const BATCH_SIZE = 5000;

    for await (const line of rl) {
      const f = line.split('\t');
      if (f.length < 18) continue;

      const featureClass = f[6];
      const featureCode = f[7];
      if (featureClass !== 'A' && featureClass !== 'P' && featureCode !== 'PCLI') continue;
      if (!OPERATING_COUNTRIES.has(f[8])) continue; // borne le staging aux pays d'exploitation

      const geonameId = parseInt(f[0]);
      if (isNaN(geonameId)) continue;

      batch.push({
        geonameId,
        name: f[1] || 'unknown',
        latitude: f[4] || null,
        longitude: f[5] || null,
        featureClass,
        featureCode,
        countryCode: f[8] || null,
        admin1Code: f[10] || null,
        admin2Code: f[11] || null,
        population: Math.min(parseInt(f[14]) || 0, 2147483647),
        timezone: f[17] || null,
      });

      if (batch.length >= BATCH_SIZE) {
        await db.insert(geonamesStaging).values(batch).onConflictDoNothing();
        inserted += batch.length;
        batch = [];
        if (inserted % 100000 === 0) {
          logger.info(`  … ${inserted} rows inserted`);
        }
      }
    }

    if (batch.length > 0) {
      await db.insert(geonamesStaging).values(batch).onConflictDoNothing();
      inserted += batch.length;
    }

    logger.info(`Streaming complete — ${inserted} rows inserted`);
    const [{ value: finalCount }] = await db.select({ value: count() }).from(geonamesStaging);
    return { step: 'loadGeonamesStaging', action: 'created', count: Number(finalCount), details: `filtered featureClass A/P + PCLI (${inserted} rows streamed)` };
  } catch (err: any) {
    logger.error({ err }, 'Error loading GeoNames staging');
    return { step: 'loadGeonamesStaging', action: 'error', count: 0, details: `Error: ${err.message}` };
  }
}

// ============================================================================
// PHASE 5 — Enrichissement via SQL JOINs sur staging
// ============================================================================

async function enrichFromStaging(): Promise<StepResult[]> {
  const results: StepResult[] = [];

  // Check staging has data
  const [{ value: stagingCount }] = await db.select({ value: count() }).from(geonamesStaging);
  if (Number(stagingCount) === 0) {
    return [{ step: 'enrichFromStaging', action: 'error', count: 0, details: 'geonames_staging is empty — run loadGeonamesStaging first' }];
  }

  if (DRY_RUN) {
    return [{ step: 'enrichFromStaging', action: 'dry-run', count: 0, details: 'would enrich regions/departements/pays and insert villes' }];
  }

  // 1. Enrichir regions (lat/lng/pop)
  const r1 = await db.execute(sql`
    UPDATE regions r
    SET latitude = gs.latitude, longitude = gs.longitude, population = gs.population
    FROM geonames_staging gs
    WHERE r.geoname_id = gs.geoname_id
      AND r.latitude IS NULL
  `);
  results.push({ step: 'enrichRegions', action: 'updated', count: Number(r1.rowCount ?? 0), details: 'lat/lng/pop from staging' });

  // 2. Enrichir departements ADM2 (lat/lng/pop)
  const r2 = await db.execute(sql`
    UPDATE departements d
    SET latitude = gs.latitude, longitude = gs.longitude, population = gs.population
    FROM geonames_staging gs
    WHERE d.geoname_id = gs.geoname_id
      AND d.latitude IS NULL
  `);
  results.push({ step: 'enrichDepartements', action: 'updated', count: Number(r2.rowCount ?? 0), details: 'lat/lng/pop from staging' });

  // 3. Enrichir pays (lat/lng via featureCode=PCLI)
  const r3 = await db.execute(sql`
    UPDATE pays p
    SET latitude = gs.latitude, longitude = gs.longitude, population = gs.population, geoname_id = gs.geoname_id
    FROM geonames_staging gs
    WHERE gs.country_code = p.iso2
      AND gs.feature_code = 'PCLI'
      AND p.latitude IS NULL
  `);
  results.push({ step: 'enrichPays', action: 'updated', count: Number(r3.rowCount ?? 0), details: 'lat/lng/pop from PCLI entries' });

  // 4. Backfill villes Congo existantes (enrichir avec geonameId)
  const r4 = await db.execute(sql`
    UPDATE villes v
    SET
      geoname_id = gs.geoname_id,
      population = gs.population,
      feature_code = gs.feature_code,
      timezone = gs.timezone,
      nom_ascii = gs.name
    FROM geonames_staging gs
    JOIN pays p ON p.iso2 = 'CG'
    WHERE p.id = v.pays_id
      AND gs.country_code = 'CG'
      AND gs.feature_class = 'P'
      AND LOWER(gs.name) = LOWER(v.nom)
      AND v.geoname_id IS NULL
  `);
  results.push({ step: 'backfillCongoVilles', action: 'updated', count: Number(r4.rowCount ?? 0), details: 'enriched existing Congo villes with geonameId' });

  // 5. Insérer villes mondiales (featureClass='P', population >= seuil)
  const r5 = await db.execute(sql`
    INSERT INTO villes (nom, nom_ascii, geoname_id, latitude, longitude, population, feature_code, timezone, region_id, pays_id, is_chef_lieu, actif)
    SELECT
      gs.name,
      gs.name,
      gs.geoname_id,
      gs.latitude,
      gs.longitude,
      gs.population,
      gs.feature_code,
      gs.timezone,
      r.id,
      p.id,
      gs.feature_code IN ('PPLC', 'PPLA', 'PPLA2'),
      true
    FROM geonames_staging gs
    JOIN pays p ON p.iso2 = gs.country_code
    LEFT JOIN regions r ON r.code = gs.country_code || '.' || gs.admin1_code
    WHERE gs.feature_class = 'P'
      AND gs.population >= ${MIN_POPULATION}
    ON CONFLICT (geoname_id) DO UPDATE SET
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      population = EXCLUDED.population,
      feature_code = EXCLUDED.feature_code,
      timezone = EXCLUDED.timezone,
      region_id = COALESCE(EXCLUDED.region_id, villes.region_id)
  `);
  results.push({ step: 'insertWorldVilles', action: 'created', count: Number(r5.rowCount ?? 0), details: `population >= ${MIN_POPULATION}` });

  return results;
}

// ============================================================================
// ORCHESTRATEUR
// ============================================================================

async function main() {
  logger.info('═══════════════════════════════════════════════════════════════');
  logger.info('MICROFLEX — Seed Géographique Mondial');
  logger.info('═══════════════════════════════════════════════════════════════');

  if (DRY_RUN) logger.info('MODE: DRY-RUN');
  if (ENRICH_ONLY) logger.info('MODE: ENRICH-ONLY (skip seed, go straight to staging + enrichment)');

  const allResults: StepResult[] = [];

  try {
    if (!ENRICH_ONLY) {
      // Phase 3.1 — Seed regions (ADM1)
      const r1 = await seedRegions();
      logStep(r1);
      allResults.push(r1);

      // Phase 3.2 — Migrer Congo departements → regions
      const r2 = await migrateCongoDeptsToRegions();
      logStep(r2);
      allResults.push(r2);

      // Phase 3.3 — Seed departements (ADM2)
      const r3 = await seedDepartementsADM2();
      logStep(r3);
      allResults.push(r3);

      // Phase 3.4 — Cleanup legacy departements
      const r4 = await cleanupLegacyDepts();
      logStep(r4);
      allResults.push(r4);
    }

    // Phase 4 — Load staging
    const r5 = await loadGeonamesStaging();
    logStep(r5);
    allResults.push(r5);

    if (r5.action === 'error') {
      logger.error('Staging failed — cannot proceed to enrichment');
    } else {
      // Phase 5 — Enrich + insert villes
      const enrichResults = await enrichFromStaging();
      for (const r of enrichResults) {
        logStep(r);
        allResults.push(r);
      }
    }

    // Summary
    logger.info('═══════════════════════════════════════════════════════════════');
    logger.info('RÉSUMÉ:');
    for (const r of allResults) {
      logger.info(`  ${r.step}: ${r.action} (${r.count}) ${r.details || ''}`);
    }
    logger.info('═══════════════════════════════════════════════════════════════');

    const errors = allResults.filter(r => r.action === 'error');
    if (errors.length > 0) {
      logger.error(`${errors.length} error(s) occurred`);
      await pool.end();
      process.exit(1);
    }

    logger.info('Seed géographique mondial terminé avec succès');
  } catch (err) {
    logger.error({ err }, 'Fatal error during seed');
    await pool.end();
    process.exit(1);
  }

  await pool.end();
  process.exit(0);
}

// Export functions for use from seed-prod.ts
export { seedRegions, migrateCongoDeptsToRegions, seedDepartementsADM2, cleanupLegacyDepts, loadGeonamesStaging, enrichFromStaging };

// Run standalone only when executed directly (not imported)
const isMainModule = process.argv[1]?.includes('seed-geography-world');
if (isMainModule) {
  main();
}
