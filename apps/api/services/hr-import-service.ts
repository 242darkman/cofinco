import { db } from "../db";
import { users } from "@shared/schema/auth";
import { employes } from "@shared/schema/employes";
import { hashPassword } from "../auth";
import { normalizePhone } from "@shared/utils/phone";

// ============================================================================
// CSV EMPLOYEE IMPORT SERVICE
// ============================================================================

export interface CsvRow {
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  sexe?: string;
  dateNaissance?: string;
  matricule?: string;
  typeContrat?: string;
  dateEmbauche?: string;
  salaireBase?: string;
  agenceId?: string;
}

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

const REQUIRED_FIELDS = ["nom"];
const VALID_SEXE = ["M", "F"];
const VALID_CONTRACT_TYPES = ["CDI", "CDD", "Stage", "Intérim"];

/**
 * Parse a CSV string into an array of rows.
 * Supports comma and semicolon separators.
 */
export function parseCsv(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Detect separator (comma or semicolon)
  const separator = lines[0].includes(";") ? ";" : ",";

  const headers = lines[0].split(separator).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Validate a single CSV row.
 */
function validateRow(row: Record<string, string>, rowIndex: number): { data: CsvRow; errors: ImportResult["errors"] } {
  const errors: ImportResult["errors"] = [];

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!row[field]?.trim()) {
      errors.push({ row: rowIndex, field, message: `Champ obligatoire "${field}" manquant` });
    }
  }

  // Validate sexe
  if (row.sexe && !VALID_SEXE.includes(row.sexe.toUpperCase())) {
    errors.push({ row: rowIndex, field: "sexe", message: `Sexe invalide "${row.sexe}" (attendu: M ou F)` });
  }

  // Validate typeContrat
  if (row.typecontrat && !VALID_CONTRACT_TYPES.includes(row.typecontrat)) {
    errors.push({ row: rowIndex, field: "typeContrat", message: `Type contrat invalide "${row.typecontrat}"` });
  }

  // Validate salaireBase is numeric
  if (row.salairebase && isNaN(parseInt(row.salairebase))) {
    errors.push({ row: rowIndex, field: "salaireBase", message: `Salaire de base doit être numérique` });
  }

  // Validate date formats
  for (const dateField of ["datenaissance", "dateembauche"]) {
    if (row[dateField] && isNaN(Date.parse(row[dateField]))) {
      errors.push({ row: rowIndex, field: dateField, message: `Date invalide "${row[dateField]}"` });
    }
  }

  const data: CsvRow = {
    nom: row.nom?.trim() || "",
    prenom: row.prenom?.trim(),
    email: row.email?.trim(),
    telephone: row.telephone?.trim(),
    sexe: row.sexe?.toUpperCase(),
    dateNaissance: row.datenaissance?.trim(),
    matricule: row.matricule?.trim(),
    typeContrat: row.typecontrat?.trim(),
    dateEmbauche: row.dateembauche?.trim(),
    salaireBase: row.salairebase?.trim(),
    agenceId: row.agenceid?.trim(),
  };

  return { data, errors };
}

/**
 * Import employees from parsed CSV data.
 * Creates user + employee records in a transaction.
 */
export async function importEmployees(
  csvContent: string,
  defaultAgenceId?: string
): Promise<ImportResult> {
  const { rows } = parseCsv(csvContent);

  const result: ImportResult = {
    total: rows.length,
    created: 0,
    skipped: 0,
    errors: [],
  };

  if (rows.length === 0) {
    result.errors.push({ row: 0, message: "Fichier CSV vide ou invalide" });
    return result;
  }

  // Default password for new employees (must be changed on first login)
  const defaultPassword = await hashPassword("MicroFlex2024!");

  for (let i = 0; i < rows.length; i++) {
    const rowIndex = i + 2; // Row 1 is header, so data starts at row 2
    const { data, errors } = validateRow(rows[i], rowIndex);

    if (errors.length > 0) {
      result.errors.push(...errors);
      result.skipped++;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        // 1. Create user
        const username = generateUsername(data.nom, data.prenom);

        const [newUser] = await tx
          .insert(users)
          .values({
            nom: data.nom,
            prenom: data.prenom || null,
            email: data.email || null,
            telephone: normalizePhone(data.telephone) || null,
            sexe: data.sexe || null,
            dateNaissance: data.dateNaissance || null,
            username,
            password: defaultPassword,
            typeCompte: "employe",
            canLogin: true,
            statut: "ACTIVE",
            mustChangePassword: true,
          } as any)
          .returning();

        // 2. Create employee
        await tx.insert(employes).values({
          userId: newUser.id,
          matricule: data.matricule || null,
          typeContrat: data.typeContrat || "CDI",
          dateEmbauche: data.dateEmbauche || new Date().toISOString().split("T")[0],
          salaireBase: data.salaireBase ? parseInt(data.salaireBase) : 0,
          agenceId: data.agenceId || defaultAgenceId || null,
          statut: "ACTIVE",
        });
      });

      result.created++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      // Check for duplicate key violations
      if (message.includes("unique") || message.includes("duplicate")) {
        result.errors.push({ row: rowIndex, message: `Doublon détecté (email, telephone ou matricule déjà existant)` });
      } else {
        result.errors.push({ row: rowIndex, message });
      }
      result.skipped++;
    }
  }

  return result;
}

/**
 * Generate a unique username from nom + prenom.
 */
function generateUsername(nom: string, prenom?: string): string {
  const base = prenom
    ? `${prenom.charAt(0)}${nom}`.toLowerCase().replace(/[^a-z0-9]/g, "")
    : nom.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Add random suffix to ensure uniqueness
  const { randomInt } = require('crypto');
  const suffix = randomInt(1000, 10000);
  return `${base}${suffix}`;
}
