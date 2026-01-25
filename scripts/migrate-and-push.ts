#!/usr/bin/env tsx
/**
 * Script to run pending SQL migrations before db:push
 * This ensures data cleanup happens before schema constraints are applied
 */

import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration(filePath: string) {
  console.log(`\n📝 Running migration: ${path.basename(filePath)}`);

  try {
    const migrationSQL = await fs.readFile(filePath, 'utf-8');
    await db.execute(sql.raw(migrationSQL));
    console.log(`✅ Migration completed: ${path.basename(filePath)}`);
  } catch (error: any) {
    console.error(`❌ Migration failed: ${path.basename(filePath)}`);
    console.error(error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting migration and push process...\n');

  try {
    // Run migration 0029 to fix empty reference_externe
    const migrationPath = path.join(__dirname, '../migrations/0029_fix_empty_reference_externe.sql');

    try {
      await runMigration(migrationPath);
    } catch (error: any) {
      if (error.message?.includes('does not exist')) {
        console.log('⚠️  Tables/constraints not yet created, skipping cleanup migration');
      } else {
        throw error;
      }
    }

    // Now run db:push to synchronize schema
    console.log('\n🔄 Running db:push to synchronize schema...\n');
    execSync('npm run db:push', { stdio: 'inherit' });

    console.log('\n✅ Migration and push completed successfully!');
  } catch (error) {
    console.error('\n❌ Process failed:', error);
    process.exit(1);
  }
}

main();
