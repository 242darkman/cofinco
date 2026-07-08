/**
 * Valide chaque configuration tenant de config/tenants/*.json contre le
 * schéma partagé. Utilisé en CI pour bloquer une livraison dont la config
 * client est invalide, et exécutable localement :
 *
 *   node --import tsx scripts/validate-tenant-configs.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tenantConfigSchema } from "../packages/shared/tenant-config";

const TENANTS_DIR = join(import.meta.dirname, "../config/tenants");

let failures = 0;

for (const file of readdirSync(TENANTS_DIR).filter((f) => f.endsWith(".json"))) {
  const path = join(TENANTS_DIR, file);
  const expectedId = basename(file, ".json");

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const config = tenantConfigSchema.parse(parsed);

    if (config.id !== expectedId) {
      console.error(`✗ ${file} — l'id "${config.id}" doit correspondre au nom du fichier "${expectedId}"`);
      failures += 1;
      continue;
    }

    console.log(`✓ ${file} (${config.name})`);
  } catch (error) {
    console.error(`✗ ${file} — configuration invalide :`);
    console.error(error instanceof Error ? error.message : String(error));
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} configuration(s) tenant invalide(s).`);
  process.exit(1);
}

console.log("\nToutes les configurations tenant sont valides.");
