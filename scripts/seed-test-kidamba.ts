/**
 * Seed de test : Agence Kidamba
 *
 * Crée une agence complète avec employés, clients, crédits, tontines,
 * coffre-fort et caisse pour tester le reset/transfert d'agence.
 *
 * Idempotent: peut être relancé sans créer de doublons.
 *
 * Usage (Docker) :
 *   docker compose exec app node --env-file=.env --import tsx scripts/seed-test-kidamba.ts
 */

import { db, pool } from "../server/db";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";

const log = (msg: string) => console.log(`[seed-kidamba] ${msg}`);

/** Helper: SELECT or INSERT — returns the row id either way */
async function upsertReturningId(
  selectSql: ReturnType<typeof sql>,
  insertSql: ReturnType<typeof sql>,
): Promise<string> {
  const existing = await db.execute(selectSql);
  if (existing.rows.length > 0) return existing.rows[0].id as string;
  const inserted = await db.execute(insertSql);
  return inserted.rows[0].id as string;
}

async function main() {
  log("Démarrage du seed Agence Kidamba...");

  const hash = await bcrypt.hash("Test1234!", 10);

  // ──────────────────────────────────────────────
  // 1. Agence
  // ──────────────────────────────────────────────
  const villeResult = await db.execute(sql`SELECT id FROM villes WHERE nom ILIKE 'Kidamba' LIMIT 1`);
  const villeId = villeResult.rows[0]?.id as string | undefined;

  const agenceId = await upsertReturningId(
    sql`SELECT id FROM agences WHERE code_agence = 'AG-KDB'`,
    sql`INSERT INTO agences (code_agence, nom, type_agence, adresse, ville_id, telephone, statut, date_ouverture, activated_at)
        VALUES ('AG-KDB', 'Agence Kidamba', 'SECONDARY', 'Avenue Principale, Kidamba', ${villeId || null}, '+242 06 900 00 01', 'ACTIVE', CURRENT_DATE, NOW())
        RETURNING id`,
  );
  log(`Agence: ${agenceId}`);

  // ──────────────────────────────────────────────
  // 2. Coffre-fort
  // ──────────────────────────────────────────────
  const coffreId = await upsertReturningId(
    sql`SELECT id FROM coffres_forts WHERE code = 'CF-KDB'`,
    sql`INSERT INTO coffres_forts (code, nom, owner_type, owner_id, solde, plafond_encaisse, solde_minimum, statut)
        VALUES ('CF-KDB', 'Coffre Kidamba', 'AGENCE', ${agenceId}, '2500000', '10000000', '100000', 'ACTIVE')
        RETURNING id`,
  );
  log(`Coffre-fort: ${coffreId} (solde: 2 500 000 FCFA)`);

  // ──────────────────────────────────────────────
  // 3. Caisse
  // ──────────────────────────────────────────────
  const finalCaisseId = await upsertReturningId(
    sql`SELECT id FROM caisses WHERE agence_id = ${agenceId} AND nom = 'Caisse Principale Kidamba'`,
    sql`INSERT INTO caisses (nom, agence_id, type, solde, statut)
        VALUES ('Caisse Principale Kidamba', ${agenceId}, 'PHYSICAL', '750000', 'OPEN')
        RETURNING id`,
  );
  log(`Caisse: ${finalCaisseId} (solde: 750 000 FCFA)`);

  // ──────────────────────────────────────────────
  // 4. Utilisateurs + Employés
  // ──────────────────────────────────────────────
  const employees = [
    { username: "kdb_chef", nom: "MOUKOKO", prenom: "Jean-Pierre", role: "CHEF_AGENCE", matricule: "MAT-KDB-001", salaire: 450000 },
    { username: "kdb_caissier", nom: "BAKALA", prenom: "Marie", role: "CAISSIER", matricule: "MAT-KDB-002", salaire: 200000 },
    { username: "kdb_agent", nom: "NGOUBI", prenom: "Patrick", role: "AGENT_TERRAIN", matricule: "MAT-KDB-003", salaire: 180000 },
    { username: "kdb_credit", nom: "OSSETE", prenom: "Rosalie", role: "GESTIONNAIRE_CREDIT", matricule: "MAT-KDB-004", salaire: 250000 },
  ];

  const userIds: Record<string, string> = {};
  const employeIds: Record<string, string> = {};

  for (const emp of employees) {
    // Upsert user
    const userId = await upsertReturningId(
      sql`SELECT id FROM users WHERE username = ${emp.username}`,
      sql`INSERT INTO users (username, password, nom, prenom, type_compte, statut, can_login)
          VALUES (${emp.username}, ${hash}, ${emp.nom}, ${emp.prenom}, 'employe', 'ACTIVE', true)
          RETURNING id`,
    );
    userIds[emp.username] = userId;

    // Upsert role (use the actual constraint name from Drizzle)
    await db.execute(sql`
      INSERT INTO user_roles (user_id, role, agence_id, is_primary)
      VALUES (${userId}, ${sql.raw(`'${emp.role}'`)}, ${agenceId}, true)
      ON CONFLICT ON CONSTRAINT user_roles_user_id_role_agence_id_unique DO NOTHING
    `);

    // Upsert employe
    const empId = await upsertReturningId(
      sql`SELECT id FROM employes WHERE user_id = ${userId}`,
      sql`INSERT INTO employes (user_id, agence_id, matricule, date_embauche, type_contrat, statut, salaire_base)
          VALUES (${userId}, ${agenceId}, ${emp.matricule}, CURRENT_DATE - INTERVAL '6 months', 'CDI', 'ACTIVE', ${emp.salaire})
          RETURNING id`,
    );
    employeIds[emp.username] = empId;
    log(`Employé ${emp.prenom} ${emp.nom} (${emp.role})`);
  }

  // Agent terrain entry
  const agentTerrainId = await upsertReturningId(
    sql`SELECT id FROM agents_terrain WHERE employe_id = ${employeIds.kdb_agent}`,
    sql`INSERT INTO agents_terrain (employe_id, current_agence_id, zone_affectation, statut, objectif_mensuel)
        VALUES (${employeIds.kdb_agent}, ${agenceId}, 'Kidamba Centre', 'ACTIVE', '500000')
        RETURNING id`,
  );
  log(`Agent terrain: ${agentTerrainId}`);

  // Set chef as responsable
  await db.execute(sql`UPDATE agences SET responsable_id = ${userIds.kdb_chef} WHERE id = ${agenceId}`);

  // Assign users to agency (user_agences)
  for (const emp of employees) {
    await db.execute(sql`
      INSERT INTO user_agences (user_id, agence_id, is_primary, actif)
      VALUES (${userIds[emp.username]}, ${agenceId}, true, true)
      ON CONFLICT DO NOTHING
    `);
  }

  // ──────────────────────────────────────────────
  // 5. Clients (8 clients avec comptes)
  // ──────────────────────────────────────────────
  const clientsData = [
    { nom: "MBEMBA", prenom: "Aristide", tel: "+242068001001", revenu: "150000" },
    { nom: "IKAMA", prenom: "Sylvie", tel: "+242068001002", revenu: "200000" },
    { nom: "LOEMBA", prenom: "Franck", tel: "+242068001003", revenu: "85000" },
    { nom: "NDINGA", prenom: "Clarisse", tel: "+242068001004", revenu: "120000" },
    { nom: "MOUANDA", prenom: "Serge", tel: "+242068001005", revenu: "300000" },
    { nom: "BANZOUZI", prenom: "Pauline", tel: "+242068001006", revenu: "95000" },
    { nom: "OKOMBI", prenom: "Didier", tel: "+242068001007", revenu: "175000" },
    { nom: "MASSENGO", prenom: "Angèle", tel: "+242068001008", revenu: "220000" },
  ];

  const clientIds: string[] = [];
  const compteIds: string[] = [];
  let compteIdx = 1;

  for (const c of clientsData) {
    // Upsert user for client (use telephone as unique key)
    const clientUserId = await upsertReturningId(
      sql`SELECT id FROM users WHERE telephone = ${c.tel}`,
      sql`INSERT INTO users (nom, prenom, telephone, type_compte, statut, can_login)
          VALUES (${c.nom}, ${c.prenom}, ${c.tel}, 'client', 'ACTIVE', false)
          RETURNING id`,
    );

    // Upsert client record
    const clientId = await upsertReturningId(
      sql`SELECT id FROM clients WHERE user_id = ${clientUserId}`,
      sql`INSERT INTO clients (user_id, agence_id, type_client, revenu_mensuel, kyc_status, agent_referent_id)
          VALUES (${clientUserId}, ${agenceId}, 'PARTICULIER', ${c.revenu}, 'VERIFIED', ${employeIds.kdb_agent})
          RETURNING id`,
    );
    clientIds.push(clientId);

    // Upsert compte courant
    const numCompte = `KDB-${String(compteIdx++).padStart(4, "0")}`;
    const compteId = await upsertReturningId(
      sql`SELECT id FROM comptes WHERE client_id = ${clientId} AND agence_id = ${agenceId} AND type_compte = 'SAVINGS'`,
      sql`INSERT INTO comptes (client_id, agence_id, numero_compte, type_compte, statut, solde_courant, is_approved)
          VALUES (${clientId}, ${agenceId}, ${numCompte}, 'SAVINGS', 'ACTIVE', ${c.revenu}, true)
          RETURNING id`,
    );
    compteIds.push(compteId);
  }
  log(`${clientIds.length} clients + comptes`);

  // ──────────────────────────────────────────────
  // 6. Crédits (3 crédits actifs)
  // ──────────────────────────────────────────────
  const creditsData = [
    { clientIdx: 0, montant: "500000", taux: "15", duree: 30, type: "CREDIT_EXPRESS", statut: "ACTIVE", numCredit: "CR-KDB-001" },
    { clientIdx: 2, montant: "250000", taux: "12", duree: 14, type: "CREDIT_EXPRESS", statut: "ACTIVE", numCredit: "CR-KDB-002" },
    { clientIdx: 4, montant: "1000000", taux: "18", duree: 90, type: "CREDIT_CLASSIQUE", statut: "ACTIVE", numCredit: "CR-KDB-003" },
  ];

  for (const cr of creditsData) {
    const cId = clientIds[cr.clientIdx];
    if (!cId) continue;
    await upsertReturningId(
      sql`SELECT id FROM credits WHERE numero_credit = ${cr.numCredit}`,
      sql`INSERT INTO credits (client_id, agence_id, numero_credit, montant, taux, duree, type_credit, statut, date_debut, solde_restant, total_du, echeance, created_by)
          VALUES (${cId}, ${agenceId}, ${cr.numCredit}, ${cr.montant}, ${cr.taux}, ${cr.duree}, ${cr.type}, ${cr.statut},
                  CURRENT_DATE - INTERVAL '7 days', ${cr.montant}, ${cr.montant}, 'DAILY', ${userIds.kdb_credit})
          RETURNING id`,
    );
  }
  log("3 crédits actifs");

  // ──────────────────────────────────────────────
  // 7. Tontine + membres + cycle + contributions
  // ──────────────────────────────────────────────
  const tontineId = await upsertReturningId(
    sql`SELECT id FROM tontines WHERE nom = 'Tontine Kidamba Solidarité' AND agence_id = ${agenceId}`,
    sql`INSERT INTO tontines (nom, description, montant_cotisation, frequence, date_debut, nombre_membres, membres_actuels, statut, agence_id, gestionnaire_id, created_by, distribution_type)
        VALUES ('Tontine Kidamba Solidarité', 'Tontine de test pour 6 membres à Kidamba', '25000', 'DAILY',
                CURRENT_DATE - INTERVAL '14 days', 6, 6, 'ACTIVE', ${agenceId}, ${userIds.kdb_chef}, ${userIds.kdb_chef}, 'ROTATIVE_SUSU')
        RETURNING id`,
  );
  log(`Tontine: ${tontineId}`);

  // Cycle
  const cycleId = await upsertReturningId(
    sql`SELECT id FROM tontine_cycles WHERE tontine_id = ${tontineId} AND cycle_number = 1`,
    sql`INSERT INTO tontine_cycles (agence_id, tontine_id, cycle_number, start_date, status, members_count)
        VALUES (${agenceId}, ${tontineId}, 1, CURRENT_DATE - INTERVAL '14 days', 'OPEN', 6)
        RETURNING id`,
  );

  // Update current cycle
  await db.execute(sql`UPDATE tontines SET current_cycle_id = ${cycleId} WHERE id = ${tontineId}`);

  // Membres (6 premiers clients)
  const membreIds: string[] = [];
  for (let i = 0; i < 6 && i < clientIds.length; i++) {
    const membreId = await upsertReturningId(
      sql`SELECT id FROM membres_tontine WHERE tontine_id = ${tontineId} AND client_id = ${clientIds[i]}`,
      sql`INSERT INTO membres_tontine (tontine_id, client_id, statut, position, total_cotisations, a_recu_benefice)
          VALUES (${tontineId}, ${clientIds[i]}, 'ACTIVE', ${i + 1}, ${String((i + 1) * 25000)}, ${i === 0})
          RETURNING id`,
    );
    membreIds.push(membreId);
  }
  log(`${membreIds.length} membres tontine`);

  // Turn (premier tour complété)
  await upsertReturningId(
    sql`SELECT id FROM tontine_turns WHERE tontine_id = ${tontineId} AND cycle_id = ${cycleId} AND turn_number = 1`,
    sql`INSERT INTO tontine_turns (agence_id, tontine_id, cycle_id, turn_number, due_date, status, beneficiary_member_id, amount_expected, amount_paid_out)
        VALUES (${agenceId}, ${tontineId}, ${cycleId}, 1, CURRENT_DATE - INTERVAL '7 days', 'PAID_OUT', ${membreIds[0] || null}, '150000', '150000')
        RETURNING id`,
  );

  // Contributions (chaque membre a payé pour le tour 1)
  for (let i = 0; i < membreIds.length; i++) {
    const ref = `CTR-KDB-T1-${i + 1}`;
    await upsertReturningId(
      sql`SELECT id FROM contributions_tontine WHERE reference = ${ref}`,
      sql`INSERT INTO contributions_tontine (tontine_id, client_id, membre_id, agence_id, type_operation, montant, tour_numero, reference, statut_transaction, statut_contribution, created_by)
          VALUES (${tontineId}, ${clientIds[i]}, ${membreIds[i]}, ${agenceId}, 'Versement', '25000', 1, ${ref}, 'POSTED', 'FULL', ${userIds.kdb_caissier})
          RETURNING id`,
    );
  }
  log("Contributions tour 1");

  // ──────────────────────────────────────────────
  // 8. Transfert coffre → caisse
  // ──────────────────────────────────────────────
  await upsertReturningId(
    sql`SELECT id FROM transferts_coffre_caisse WHERE reference = 'TCC-KDB-INIT-001'`,
    sql`INSERT INTO transferts_coffre_caisse (agence_id, type_transfert, coffre_id, caisse_id, montant, motif, reference, statut, requested_by, validated_by, validated_at, executed_by, executed_at, verrouille)
        VALUES (${agenceId}, 'COFFRE_VERS_CAISSE', ${coffreId}, ${finalCaisseId}, '750000',
                'Approvisionnement initial caisse Kidamba', 'TCC-KDB-INIT-001',
                'EXECUTED', ${userIds.kdb_chef}, ${userIds.kdb_chef}, NOW(), ${userIds.kdb_chef}, NOW(), true)
        RETURNING id`,
  );
  log("Transfert coffre→caisse 750 000 FCFA");

  // ──────────────────────────────────────────────
  // Résumé
  // ──────────────────────────────────────────────
  log("══════════════════════════════════════════");
  log("SEED KIDAMBA TERMINÉ");
  log("══════════════════════════════════════════");
  log(`Agence:     AG-KDB (${agenceId})`);
  log(`Coffre:     CF-KDB — 2 500 000 FCFA`);
  log(`Caisse:     750 000 FCFA`);
  log(`Employés:   4 (Chef, Caissier, Agent, Gestionnaire crédit)`);
  log(`Clients:    ${clientIds.length}`);
  log(`Comptes:    ${compteIds.length}`);
  log(`Crédits:    3 actifs`);
  log(`Tontine:    1 active (6 membres, tour 1 complété)`);
  log("──────────────────────────────────────────");
  log(`Identifiants : kdb_chef / kdb_caissier / kdb_agent / kdb_credit`);
  log(`Mot de passe : Test1234!`);
  log("══════════════════════════════════════════");

  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[seed-kidamba] ERREUR:", err);
  await pool.end();
  process.exit(1);
});
