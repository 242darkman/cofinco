import { pool } from "../server/db";

async function verify() {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT code, name, event_type
      FROM accounting_rules
      WHERE code IN ('ENTREE_COFFRE', 'SORTIE_COFFRE')
      ORDER BY code
    `);

    console.log(`\n✓ Found ${result.rows.length} rules:\n`);
    for (const row of result.rows) {
      console.log(`  ${row.code}: ${row.name} (event: ${row.event_type})`);
    }

    if (result.rows.length === 2) {
      console.log('\n✓ Both ENTREE_COFFRE and SORTIE_COFFRE rules exist!\n');
    } else {
      console.log('\n✗ Missing rules!\n');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

verify().catch(console.error);
