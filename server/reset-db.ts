
import { db, pool } from "./db";
import { sql } from "drizzle-orm";

async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log("⚠️  STARTING FULL DATABASE RESET ⚠️");
    console.log("This will delete ALL data and drop ALL tables/types.");

    // 1. Drop Drizzle migrations table
    console.log("Dropping migration history...");
    await client.query(`DROP SCHEMA IF EXISTS drizzle CASCADE;`);

    // 2. Drop all tables in public schema
    console.log("Dropping all tables...");
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
    console.log("Dropping all custom types...");
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
    console.log("Dropping all custom functions...");
    await client.query(`
        DO $$ DECLARE
            r RECORD;
        BEGIN
            FOR r IN (SELECT proname, oid FROM pg_proc WHERE pronamespace = 'public'::regnamespace) LOOP
                EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || ' CASCADE';
            END LOOP;
        END $$;
    `);

    console.log("✅ Database reset complete. Ready for clean migration.");

  } catch (err) {
    console.error("❌ Reset failed:", err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

resetDatabase();
