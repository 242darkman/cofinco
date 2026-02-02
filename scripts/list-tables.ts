/**
 * List all tables in the database
 */
import { pool } from "../server/db";

async function main() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log(`\nTables in database (${result.rows.length} total):\n`);
    result.rows.forEach((row, i) => {
      console.log(`${String(i + 1).padStart(3)}. ${row.tablename}`);
    });
    console.log();
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
