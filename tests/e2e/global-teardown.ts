/**
 * Playwright Global Teardown — E2E Test Database Cleanup
 *
 * Runs after all E2E tests complete (success or failure).
 * Truncates transactional tables to leave the test DB clean
 * for the next run.
 */

import pg from 'pg';

const { Client } = pg;

const PRESERVED_TABLES = new Set([
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
  'session',
  'drizzle_migrations',
  'device_keys',
]);

export default async function globalTeardown() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return; // Skip if no DB URL (shouldn't happen)

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();

    const { rows: tables } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    const toTruncate = tables
      .map((r: { tablename: string }) => r.tablename)
      .filter((t: string) => !PRESERVED_TABLES.has(t));

    if (toTruncate.length > 0) {
      const tableList = toTruncate.map((t: string) => `"${t}"`).join(', ');
      await client.query(`TRUNCATE ${tableList} CASCADE`);
      console.log(`[E2E Teardown] Truncated ${toTruncate.length} tables`);
    }
  } catch (err) {
    // Non-fatal — test results are already recorded
    console.warn('[E2E Teardown] Cleanup failed:', (err as Error).message);
  } finally {
    await client.end();
  }
}
