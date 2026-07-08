/**
 * Test de contrat — cohérence des seeds avec les features et le flow de l'app.
 *
 * Sans base de données : vérifie statiquement que les données de référence
 * seedées (règles comptables GL, RBAC) couvrent bien ce que le code émet ou
 * exige. Toute dérive (nouvel événement GL non seedé, permission utilisée mais
 * jamais accordée, code de rôle inexistant) fait échouer ce test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MODULES_DATA,
  PERMISSIONS_DATA,
  SEED_ROLE_PERMISSIONS,
} from "../../packages/shared/config/rbac";
import {
  PERMISSION_MAPPINGS,
  normalizePermissionCode,
} from "../../packages/shared/ability/mappings";
import { resolveGlEventType } from "../../apps/api/services/sync/gl-event-resolver";

const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Règles comptables GL
// ─────────────────────────────────────────────────────────────────────────────

function seededGlEventTypes(): Set<string> {
  const seed = read("seeds/seed-prod.ts");
  return new Set([...seed.matchAll(/eventType: '([A-Z_0-9]+)'/g)].map((m) => m[1]));
}

function requiredGlEventTypes(): string[] {
  const script = read("scripts/generate-gl-coverage.ts");
  const match = /REQUIRED_EVENT_TYPES\s*=\s*\[(.*?)\]\s*as const;/s.exec(script);
  if (!match) throw new Error("REQUIRED_EVENT_TYPES introuvable dans generate-gl-coverage.ts");
  return [...match[1].matchAll(/"([A-Z_0-9]+)"/g)].map((m) => m[1]);
}

describe("cohérence GL : seeds ↔ code", () => {
  const seeded = seededGlEventTypes();

  it("le seed définit un volume plausible de règles", () => {
    expect(seeded.size).toBeGreaterThan(50);
  });

  it("chaque événement requis par la matrice de couverture est seedé", () => {
    const missing = requiredGlEventTypes().filter((e) => !seeded.has(e));
    expect(
      missing,
      `Événements requis sans règle dans seeds/seed-prod.ts : ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("chaque événement seedé est déclaré requis (pas de règle fantôme)", () => {
    const required = new Set(requiredGlEventTypes());
    const phantom = [...seeded].filter((e) => !required.has(e));
    expect(
      phantom,
      `Règles seedées absentes de REQUIRED_EVENT_TYPES (generate-gl-coverage.ts) : ${phantom.join(", ")}`,
    ).toEqual([]);
  });

  it("les événements GL de la synchro offline pointent vers des règles seedées", () => {
    const syncSource = read("apps/api/routes/sync-journal.ts");
    const bases = [...syncSource.matchAll(/glEventType: '([A-Z_0-9]+)'/g)].map((m) => m[1]);
    expect(bases.length).toBeGreaterThanOrEqual(7);

    const resolved = bases.flatMap((base) =>
      base === "DEPOSIT" || base === "WITHDRAWAL"
        ? ["CURRENT", "SAVINGS", "BLOCKED"].map((t) => resolveGlEventType(base, t))
        : [resolveGlEventType(base, undefined)],
    );
    const missing = resolved.filter((e) => !seeded.has(e));
    expect(missing, `Événements sync sans règle seedée : ${missing.join(", ")}`).toEqual([]);
  });

  it("les événements dérivés par type de compte (frais, clôture) sont seedés", () => {
    const sources = [
      read("apps/api/services/maintenance-fee-scheduler.ts"),
      read("apps/api/services/compte-closure.ts"),
    ].join("\n");
    const derived = [
      ...sources.matchAll(/"((?:MAINTENANCE_FEE|CLOSING_FEE|CLOSURE_PAYOUT)_[A-Z]+)"/g),
    ].map((m) => m[1]);
    expect(derived.length).toBeGreaterThanOrEqual(9);

    const missing = [...new Set(derived)].filter((e) => !seeded.has(e));
    expect(missing, `Événements dérivés sans règle seedée : ${missing.join(", ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RBAC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codes volontairement non seedés, avec justification.
 */
const UNSEEDED_PERMISSION_EXEMPTIONS: Record<string, string> = {
  "admin.manage":
    "gating UI d'onglets réservés au super-admin (MANAGE ALL) — ne doit être accordable à aucun rôle",
};

describe("cohérence RBAC : seeds ↔ mappings ↔ usages", () => {
  const seededCodes = new Set<string>();
  for (const perms of Object.values(PERMISSIONS_DATA)) {
    for (const p of perms) seededCodes.add(p.code);
  }
  const moduleNames = new Set(MODULES_DATA.map((m) => m.name));

  it("chaque module référencé par PERMISSIONS_DATA existe dans MODULES_DATA", () => {
    const orphans = Object.keys(PERMISSIONS_DATA).filter((m) => !moduleNames.has(m));
    expect(orphans).toEqual([]);
  });

  it("chaque permission seedée a un mapping CASL", () => {
    const unmapped = [...seededCodes].filter(
      (c) => !(c in PERMISSION_MAPPINGS) && !(normalizePermissionCode(c) in PERMISSION_MAPPINGS),
    );
    expect(unmapped, `Permissions seedées sans mapping CASL : ${unmapped.join(", ")}`).toEqual([]);
  });

  it("chaque code de SEED_ROLE_PERMISSIONS correspond à une permission seedée", () => {
    const orphans: string[] = [];
    for (const [role, codes] of Object.entries(SEED_ROLE_PERMISSIONS)) {
      for (const code of codes) {
        if (code !== "*" && !seededCodes.has(code)) orphans.push(`${role}: ${code}`);
      }
    }
    expect(orphans).toEqual([]);
  });

  it("chaque code de permission utilisé par l'app est seedé (ou exempté avec justification)", () => {
    const sources = [
      read("apps/web/src/constants/admin-constants.ts"),
      read("apps/web/src/lib/routes-config.ts"),
    ].join("\n");
    const used = [
      ...sources.matchAll(/permission: '([a-z-]+\.[a-z_.-]+)'/g),
    ].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(5);

    const missing = [...new Set(used)].filter(
      (c) => !seededCodes.has(c) && !(c in UNSEEDED_PERMISSION_EXEMPTIONS),
    );
    expect(
      missing,
      `Codes utilisés dans l'app mais jamais seedés (aucun rôle ne peut les obtenir) : ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
