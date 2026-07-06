/**
 * Playwright Global Setup — E2E Test Database Isolation
 *
 * Creates a dedicated `microflex_test` database before the test run.
 * The schema is pushed and reference data seeded automatically by
 * the `db-init-test` Docker service (see docker-compose.override.yml).
 *
 * This setup only handles per-run cleanup: truncating transactional
 * tables so each `docker compose --profile test run test-e2e` starts
 * from a clean state (reference/seed data is preserved).
 */

import pg from 'pg';

const { Client } = pg;

/**
 * Tables containing reference/seed data that should NOT be truncated.
 * These are populated once by seed-prod.ts and remain constant.
 */
const PRESERVED_TABLES = new Set([
  // Reference data (seeds)
  'agences',
  'job_positions',
  'departments',
  'produits_epargne',
  'types_credit',
  'plan_comptable',
  'parametres_systeme',
  'settings',
  'roles',
  'permissions',
  'role_permissions',
  'feature_flags',
  'notification_templates',
  'penalty_rules',
  // System tables
  'session',
  'drizzle_migrations',
  // Offline device/limits (populated per-device, not test data)
  'device_keys',
]);

export default async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required for E2E global setup');
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Get all user tables (exclude system tables)
    const { rows: tables } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    // Build list of tables to truncate
    const toTruncate = tables
      .map((r: { tablename: string }) => r.tablename)
      .filter((t: string) => !PRESERVED_TABLES.has(t));

    if (toTruncate.length > 0) {
      // Truncate all transactional tables in one statement (CASCADE handles FKs)
      const tableList = toTruncate.map((t: string) => `"${t}"`).join(', ');
      await client.query(`TRUNCATE ${tableList} CASCADE`);
      console.log(`[E2E Setup] Truncated ${toTruncate.length} tables`);
    } else {
      console.log('[E2E Setup] No tables to truncate');
    }
  } finally {
    await client.end();
  }
}
