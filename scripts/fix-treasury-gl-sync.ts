/**
 * COFINCO - Synchronisation Grand Livre pour Trésorerie
 *
 * Crée les écritures GL de régularisation pour synchroniser
 * les soldes opérationnels avec le grand livre
 */

import { pool } from "../server/db";
import { v4 as uuidv4 } from "uuid";

const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function confirm(message: string): Promise<boolean> {
  const { createInterface } = await import("readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(`${YELLOW}${message} (yes/no): ${RESET}`, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");

  console.log(`\n${CYAN}${BOLD}${"=".repeat(70)}${RESET}`);
  console.log(`${CYAN}${BOLD}   SYNCHRONISATION GRAND LIVRE - TRÉSORERIE${RESET}`);
  console.log(`${CYAN}${"=".repeat(70)}${RESET}\n`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ========== 1. DIAGNOSTIC ==========
    console.log(`${BOLD}1️⃣  Diagnostic des écarts${RESET}\n`);

    // Soldes opérationnels
    const coffresOp = await client.query(`
      SELECT COALESCE(SUM(CAST(solde AS DECIMAL)), 0) as total
      FROM coffres_forts
    `);
    const coffresTotal = parseFloat(coffresOp.rows[0].total);

    const caissesOp = await client.query(`
      SELECT COALESCE(SUM(solde_reel), 0) as total FROM (
        SELECT DISTINCT ON (c.id)
          COALESCE(
            CAST(s.montant_fermeture_theorique AS DECIMAL),
            CAST(s.montant_ouverture AS DECIMAL),
            0
          ) as solde_reel
        FROM caisses c
        LEFT JOIN sessions_caisse s ON s.caisse_id = c.id
        ORDER BY c.id, s.closed_at DESC NULLS FIRST
      ) sub
    `);
    const caissesTotal = parseFloat(caissesOp.rows[0].total);

    // Soldes GL
    const glCaisse = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '521%'
        AND e.statut = 'POSTED'
    `);
    const glCaisseTotal = parseFloat(glCaisse.rows[0].solde);

    const glCoffre = await client.query(`
      SELECT
        COALESCE(SUM(CAST(le.debit AS DECIMAL)), 0) -
        COALESCE(SUM(CAST(le.credit AS DECIMAL)), 0) as solde
      FROM lignes_ecritures le
      INNER JOIN plan_comptable pc ON le.compte_id = pc.id
      INNER JOIN ecritures_comptables e ON le.ecriture_id = e.id
      WHERE pc.numero_compte LIKE '531%'
        AND e.statut = 'POSTED'
    `);
    const glCoffreTotal = parseFloat(glCoffre.rows[0].solde);

    console.log(`   Opérationnel:`);
    console.log(`   ├─ Coffres: ${coffresTotal.toLocaleString()} FCFA`);
    console.log(`   └─ Caisses: ${caissesTotal.toLocaleString()} FCFA\n`);

    console.log(`   Grand Livre:`);
    console.log(`   ├─ Compte 531 (Coffre): ${glCoffreTotal.toLocaleString()} FCFA`);
    console.log(`   └─ Compte 521 (Caisse): ${glCaisseTotal.toLocaleString()} FCFA\n`);

    const ecartCoffre = coffresTotal - glCoffreTotal;
    const ecartCaisse = caissesTotal - glCaisseTotal;

    console.log(`   ${BOLD}Écarts:${RESET}`);
    console.log(`   ├─ Coffre: ${ecartCoffre.toLocaleString()} FCFA`);
    console.log(`   └─ Caisse: ${ecartCaisse.toLocaleString()} FCFA\n`);

    if (Math.abs(ecartCoffre) < 100 && Math.abs(ecartCaisse) < 100) {
      console.log(`   ${GREEN}✓ Pas d'écart significatif. Aucune correction nécessaire.${RESET}\n`);
      await client.query('ROLLBACK');
      return;
    }

    // ========== 2. RÉCUPÉRATION DES COMPTES GL ==========
    console.log(`${BOLD}2️⃣  Récupération des comptes GL${RESET}\n`);

    const compteCoffre = await client.query(`
      SELECT id, numero_compte, intitule
      FROM plan_comptable
      WHERE numero_compte = '531' OR numero_compte = '5311'
      ORDER BY numero_compte
      LIMIT 1
    `);

    const compteCaisse = await client.query(`
      SELECT id, numero_compte, intitule
      FROM plan_comptable
      WHERE numero_compte = '521' OR numero_compte = '5211'
      ORDER BY numero_compte
      LIMIT 1
    `);

    if (compteCoffre.rows.length === 0 || compteCaisse.rows.length === 0) {
      console.log(`   ${RED}❌ Comptes GL de trésorerie introuvables!${RESET}\n`);
      await client.query('ROLLBACK');
      return;
    }

    const idCompteCoffre = compteCoffre.rows[0].id;
    const idCompteCaisse = compteCaisse.rows[0].id;

    console.log(`   Coffre: ${compteCoffre.rows[0].numero_compte} - ${compteCoffre.rows[0].intitule}`);
    console.log(`   Caisse: ${compteCaisse.rows[0].numero_compte} - ${compteCaisse.rows[0].intitule}\n`);

    // Compte de contrepartie (40100 - Compte d'attente régularisation)
    const compteAttente = await client.query(`
      SELECT id, numero_compte, intitule
      FROM plan_comptable
      WHERE numero_compte = '40100' OR numero_compte LIKE '401%'
      ORDER BY numero_compte
      LIMIT 1
    `);

    if (compteAttente.rows.length === 0) {
      console.log(`   ${RED}❌ Compte de régularisation introuvable!${RESET}`);
      console.log(`   ${YELLOW}Suggestion: Créer un compte 40100 "Compte d'attente régularisation"${RESET}\n`);
      await client.query('ROLLBACK');
      return;
    }

    const idCompteAttente = compteAttente.rows[0].id;
    console.log(`   Contrepartie: ${compteAttente.rows[0].numero_compte} - ${compteAttente.rows[0].intitule}\n`);

    // ========== 3. RÉCUPÉRATION JOURNAL ET EXERCICE ==========
    console.log(`${BOLD}3️⃣  Récupération journal et exercice${RESET}\n`);

    // Trouver le journal OD (Opérations Diverses)
    const journalOD = await client.query(`
      SELECT id, code, intitule
      FROM journaux_comptables
      WHERE code = 'OD' OR type_journal = 'Général'
      LIMIT 1
    `);

    if (journalOD.rows.length === 0) {
      console.log(`   ${RED}❌ Journal OD introuvable!${RESET}\n`);
      await client.query('ROLLBACK');
      return;
    }

    const journalId = journalOD.rows[0].id;
    console.log(`   Journal: ${journalOD.rows[0].code} - ${journalOD.rows[0].intitule}`);

    // Trouver l'exercice courant
    const exercice = await client.query(`
      SELECT id, code
      FROM exercices_comptables
      WHERE date_debut <= CURRENT_DATE AND date_fin >= CURRENT_DATE
      ORDER BY date_debut DESC
      LIMIT 1
    `);

    if (exercice.rows.length === 0) {
      console.log(`   ${RED}❌ Aucun exercice actif trouvé!${RESET}\n`);
      await client.query('ROLLBACK');
      return;
    }

    const exerciceId = exercice.rows[0].id;
    console.log(`   Exercice: ${exercice.rows[0].code}`);

    // Trouver une agence par défaut (nécessaire pour agenceId NOT NULL)
    const agence = await client.query(`
      SELECT id, nom FROM agences ORDER BY created_at LIMIT 1
    `);

    if (agence.rows.length === 0) {
      console.log(`   ${RED}❌ Aucune agence trouvée!${RESET}\n`);
      await client.query('ROLLBACK');
      return;
    }

    const agenceId = agence.rows[0].id;
    console.log(`   Agence: ${agence.rows[0].nom}\n`);

    // ========== 4. CONFIRMATION ==========
    if (!force) {
      console.log(`${BOLD}4️⃣  Écritures de régularisation à créer${RESET}\n`);

      if (Math.abs(ecartCoffre) > 100) {
        console.log(`   ${YELLOW}Régularisation Coffre: ${ecartCoffre.toLocaleString()} FCFA${RESET}`);
        console.log(`   ├─ Débit  531 (Coffre):       ${Math.abs(ecartCoffre).toLocaleString()} FCFA`);
        console.log(`   └─ Crédit ${compteAttente.rows[0].numero_compte} (Attente): ${Math.abs(ecartCoffre).toLocaleString()} FCFA\n`);
      }

      if (Math.abs(ecartCaisse) > 100) {
        console.log(`   ${YELLOW}Régularisation Caisse: ${ecartCaisse.toLocaleString()} FCFA${RESET}`);
        console.log(`   ├─ Débit  521 (Caisse):       ${Math.abs(ecartCaisse).toLocaleString()} FCFA`);
        console.log(`   └─ Crédit ${compteAttente.rows[0].numero_compte} (Attente): ${Math.abs(ecartCaisse).toLocaleString()} FCFA\n`);
      }

      const ok = await confirm(
        "Créer ces écritures de régularisation ?"
      );

      if (!ok) {
        console.log(`\n${YELLOW}Opération annulée.${RESET}\n`);
        await client.query('ROLLBACK');
        return;
      }
    }

    // ========== 5. CRÉATION DES ÉCRITURES ==========
    console.log(`\n${BOLD}5️⃣  Création des écritures de régularisation${RESET}\n`);

    let ecrituresCreated = 0;

    // Régularisation Coffre
    if (Math.abs(ecartCoffre) > 100) {
      const ecritureId = uuidv4();
      const dateJour = new Date().toISOString().split('T')[0];
      const reference = `REG-COFFRE-${Date.now()}`;

      await client.query(`
        INSERT INTO ecritures_comptables (
          id, exercice_id, journal_id, date_ecriture, numero_piece,
          libelle, statut, agence_id, source_type, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'POSTED', $7, 'REGULARISATION', NOW()
        )
      `, [
        ecritureId,
        exerciceId,
        journalId,
        dateJour,
        reference,
        `Régularisation solde coffre-fort (${ecartCoffre.toLocaleString()} FCFA)`,
        agenceId
      ]);

      // Ligne débit coffre
      await client.query(`
        INSERT INTO lignes_ecritures (
          id, ecriture_id, compte_id, numero_compte, debit, credit, libelle
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 0, 'Régularisation solde initial coffre-fort'
        )
      `, [ecritureId, idCompteCoffre, compteCoffre.rows[0].numero_compte, Math.abs(ecartCoffre)]);

      // Ligne crédit attente
      await client.query(`
        INSERT INTO lignes_ecritures (
          id, ecriture_id, compte_id, numero_compte, debit, credit, libelle
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 0, $4, 'Contrepartie régularisation coffre'
        )
      `, [ecritureId, idCompteAttente, compteAttente.rows[0].numero_compte, Math.abs(ecartCoffre)]);

      console.log(`   ${GREEN}✓ Écriture coffre créée: ${reference}${RESET}`);
      ecrituresCreated++;
    }

    // Régularisation Caisse
    if (Math.abs(ecartCaisse) > 100) {
      const ecritureId = uuidv4();
      const dateJour = new Date().toISOString().split('T')[0];
      const reference = `REG-CAISSE-${Date.now()}`;

      await client.query(`
        INSERT INTO ecritures_comptables (
          id, exercice_id, journal_id, date_ecriture, numero_piece,
          libelle, statut, agence_id, source_type, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'POSTED', $7, 'REGULARISATION', NOW()
        )
      `, [
        ecritureId,
        exerciceId,
        journalId,
        dateJour,
        reference,
        `Régularisation solde caisse (${ecartCaisse.toLocaleString()} FCFA)`,
        agenceId
      ]);

      // Ligne débit caisse
      await client.query(`
        INSERT INTO lignes_ecritures (
          id, ecriture_id, compte_id, numero_compte, debit, credit, libelle
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 0, 'Régularisation solde initial caisse'
        )
      `, [ecritureId, idCompteCaisse, compteCaisse.rows[0].numero_compte, Math.abs(ecartCaisse)]);

      // Ligne crédit attente
      await client.query(`
        INSERT INTO lignes_ecritures (
          id, ecriture_id, compte_id, numero_compte, debit, credit, libelle
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, 0, $4, 'Contrepartie régularisation caisse'
        )
      `, [ecritureId, idCompteAttente, compteAttente.rows[0].numero_compte, Math.abs(ecartCaisse)]);

      console.log(`   ${GREEN}✓ Écriture caisse créée: ${reference}${RESET}`);
      ecrituresCreated++;
    }

    await client.query('COMMIT');

    console.log(`\n${GREEN}${BOLD}${"=".repeat(70)}${RESET}`);
    console.log(`${GREEN}${BOLD}   ✓ SYNCHRONISATION TERMINÉE${RESET}`);
    console.log(`${GREEN}${"=".repeat(70)}${RESET}\n`);

    console.log(`   ${ecrituresCreated} écriture(s) de régularisation créée(s)\n`);
    console.log(`   ${CYAN}Prochaines étapes:${RESET}`);
    console.log(`   1. Vérifier la réconciliation: npm run audit:integrity`);
    console.log(`   2. Apurer le compte ${compteAttente.rows[0].numero_compte} si nécessaire`);
    console.log(`   3. Activer les guards pour éviter nouvelles désynchronisations\n`);

  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error(`\n${RED}${BOLD}ERREUR:${RESET}`, error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
