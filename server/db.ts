import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Ensures custom SQL functions exist in the database.
 * Called on application startup to handle cases where db:push was used
 * instead of migrations (db:push only syncs tables, not functions).
 */
export async function ensureCustomFunctions(): Promise<void> {
  // get_next_piece_number: Generates sequential piece numbers for GL entries
  // This function is essential for the accounting module
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION get_next_piece_number(p_agence_id uuid, p_journal_code text, p_year integer)
    RETURNS text AS $$
    DECLARE
        v_next_number integer;
        v_piece_number text;
    BEGIN
        -- Lock and increment sequence atomically
        INSERT INTO gl_sequences (agence_id, journal_code, year, last_number)
        VALUES (p_agence_id, p_journal_code, p_year, 1)
        ON CONFLICT (agence_id, journal_code, year)
        DO UPDATE SET
            last_number = gl_sequences.last_number + 1,
            updated_at = now()
        RETURNING last_number INTO v_next_number;

        -- Format: JOURNAL-YYYY-NNNNNN (e.g., CAI-2025-000001)
        v_piece_number := p_journal_code || '-' || p_year || '-' || LPAD(v_next_number::text, 6, '0');

        RETURN v_piece_number;
    END;
    $$ LANGUAGE plpgsql;
  `);
}
