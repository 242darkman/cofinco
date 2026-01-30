
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { createLogger } from './lib/logger';

const logger = createLogger('ResetDB');

async function resetDatabase() {
  const client = await pool.connect();
  try {
    logger.warn("STARTING FULL DATABASE RESET");
    logger.info("This will delete ALL data and drop ALL tables/types.");

    // 1. Drop Drizzle migrations table
    logger.info("Dropping migration history...");
    await client.query(`DROP SCHEMA IF EXISTS drizzle CASCADE;`);

    // 2. Drop all tables in public schema
    logger.info("Dropping all tables...");
    await client.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);

    // 3. Drop all custom types (enums)
    logger.info("Dropping all custom types...");
    await client.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = 'public'::regnamespace) LOOP
          EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
      END $$;
    `);

    // 4. Drop all functions/procedures (optional but safer)
    logger.info("Dropping all custom functions...");
    await client.query(`
        DO $$ DECLARE
            r RECORD;
        BEGIN
            FOR r IN (SELECT proname, oid FROM pg_proc WHERE pronamespace = 'public'::regnamespace) LOOP
                EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || ' CASCADE';
            END LOOP;
        END $$;
    `);

    logger.info("Database reset complete. Ready for clean migration.");

  } catch (err) {
    logger.error({ err }, "Reset failed");
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

resetDatabase();
