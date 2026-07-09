/**
 * Garde « cliquet » sur la taille des fichiers (AGENTS.md §7 et §8 : 400 lignes max).
 *
 * L'existant dépassant déjà la limite est figé dans docs/audit/lines-baseline.json.
 * Règles appliquées (échec CI sinon) :
 *   1. tout fichier HORS baseline doit rester ≤ 400 lignes (les nouveaux fichiers
 *      ne peuvent pas naître au-dessus de la limite) ;
 *   2. un fichier de la baseline ne doit pas GROSSIR au-delà de sa valeur figée ;
 *   3. si un fichier de la baseline redescend, exécuter avec --update pour
 *      resserrer le cliquet (la baseline ne peut que diminuer) ;
 *   4. un fichier de la baseline repassé sous la limite en sort définitivement.
 *
 * Usage :
 *   node --import tsx scripts/check-file-sizes.ts            # vérification (CI)
 *   node --import tsx scripts/check-file-sizes.ts --update   # resserrer la baseline
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BASELINE_PATH = join(ROOT, "docs/audit/lines-baseline.json");
const MAX_LINES = 400;

/** Périmètre de la règle : composants/pages web, routes/services/storage API. */
const SCOPES = [
  "apps/web/src/components",
  "apps/web/src/pages",
  "apps/api/routes",
  "apps/api/services",
  "apps/api/storage",
];

const EXTENSIONS = new Set([".ts", ".tsx"]);
const UPDATE = process.argv.includes("--update");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

function countLines(path: string): number {
  const content = readFileSync(path, "utf8");
  return content.length === 0 ? 0 : content.split("\n").length;
}

const baseline: Record<string, number> = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

const current = new Map<string, number>();
for (const scope of SCOPES) {
  for (const file of listFiles(join(ROOT, scope))) {
    current.set(relative(ROOT, file), countLines(file));
  }
}

const violations: string[] = [];
const improvements: string[] = [];
const nextBaseline: Record<string, number> = {};

for (const [file, lines] of [...current.entries()].sort()) {
  const frozen = baseline[file];

  if (frozen === undefined) {
    // Fichier hors baseline : la limite s'applique pleinement
    if (lines > MAX_LINES) {
      violations.push(`${file} — ${lines} lignes (> ${MAX_LINES}, hors baseline)`);
    }
    continue;
  }

  if (lines > frozen) {
    violations.push(`${file} — ${lines} lignes (baseline ${frozen} : un fichier hérité ne doit pas grossir)`);
    nextBaseline[file] = frozen;
  } else if (lines > MAX_LINES) {
    if (lines < frozen) improvements.push(`${file} — ${frozen} → ${lines}`);
    nextBaseline[file] = lines;
  } else if (lines <= MAX_LINES) {
    improvements.push(`${file} — sorti de la baseline (${frozen} → ${lines})`);
  }
}

// Fichiers de la baseline supprimés ou déplacés : ils sortent naturellement.

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(nextBaseline, null, 2) + "\n");
  console.log(`Baseline resserrée : ${Object.keys(nextBaseline).length} fichiers hérités restants.`);
  process.exit(0);
}

if (improvements.length > 0) {
  console.log(`ℹ ${improvements.length} amélioration(s) détectée(s) — exécuter avec --update pour resserrer la baseline :`);
  for (const i of improvements.slice(0, 10)) console.log(`  ${i}`);
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} violation(s) de la règle des ${MAX_LINES} lignes (AGENTS.md §7/§8) :`);
  for (const v of violations) console.error(`  ${v}`);
  console.error("\nDécouper par responsabilité (sous-composants, hooks, sous-routeurs, services) avant de committer.");
  process.exit(1);
}

console.log(`✓ Taille des fichiers conforme (${current.size} fichiers vérifiés, ${Object.keys(baseline).length} hérités figés).`);
