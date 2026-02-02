#!/usr/bin/env tsx
/**
 * Script de vérification de la complétude des règles comptables
 * Vérifie que tous les types d'opérations ont une règle comptable associée
 */

import { db } from '../server/db.ts';
import { accountingRules } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Liste des types d'événements UTILISÉS qui nécessitent une règle comptable
// Note: Cette liste contient uniquement les types réellement utilisés dans le système
// Les règles avec paymentMethod/provider spécifiques (MTN, AIRTEL) couvrent les types génériques
const REQUIRED_EVENT_TYPES = [
  // Transferts coffre-caisse (utilisés)
  'COFFRE_TO_CAISSE',
  'CAISSE_TO_COFFRE',

  // Opérations sur comptes (utilisées)
  'DEPOSIT_SAVINGS',
  'WITHDRAWAL_SAVINGS',
  'DEPOSIT_CURRENT',
  'WITHDRAWAL_CURRENT',
  'DEPOSIT_BLOCKED',      // Existe dans les règles supplémentaires
  'WITHDRAWAL_BLOCKED',   // Existe dans les règles supplémentaires

  // Crédits (utilisés)
  'CREDIT_DISBURSEMENT',
  'CREDIT_REPAYMENT',
  'CREDIT_REPAYMENT_INTEREST',  // Existe dans les règles supplémentaires
  'CREDIT_REPAYMENT_PENALTY',   // Existe dans les règles supplémentaires
  'CREDIT_FEE',                 // Existe dans les règles supplémentaires

  // Tontines (utilisées)
  'TONTINE_CONTRIBUTION',       // Existe dans les règles supplémentaires
  'TONTINE_DISTRIBUTION',       // Existe dans les règles supplémentaires
  'TONTINE_PENALTY',            // Existe dans les règles supplémentaires

  // Virements (utilisés)
  'INTERNAL_TRANSFER',

  // Opérations inter-coffres (utilisées)
  'COFFRE_TRANSIT_OUT',         // Existe dans les règles supplémentaires
  'COFFRE_TRANSIT_IN',          // Existe dans les règles supplémentaires

  // Sessions caisse (utilisées)
  'SESSION_DEFICIT',            // Existe dans les règles supplémentaires
  'SESSION_SURPLUS',            // Existe dans les règles supplémentaires

  // RH (utilisées)
  'PAYROLL_ENGAGEMENT',         // Existe dans les règles supplémentaires
  'PAYROLL_PAYMENT',            // Existe dans les règles supplémentaires

  // Opérations agent (utilisées)
  'COLLECT_CASH',               // Existe dans les règles supplémentaires
  'SETTLEMENT_CASH',            // Existe dans les règles supplémentaires
  'SAFE_SUPPLY',                // Existe dans les règles supplémentaires

  // Autres opérations (utilisées)
  'INITIAL_DEPOSIT',            // Existe dans les règles supplémentaires
  'TRANSFER_OUT',               // Existe dans les règles supplémentaires
  'TRANSFER_IN',                // Existe dans les règles supplémentaires
  'RESTITUTION',                // Existe dans les règles supplémentaires
  'OPERATOR_FEE',               // Existe dans les règles supplémentaires
  'ENGAGEMENT_FEE',             // Existe dans les règles supplémentaires
  'MISC_COLLECTION',            // Existe dans les règles supplémentaires
  'CASH_TRANSFER',              // Existe dans les règles supplémentaires
  'ENTREE_COFFRE',              // Existe dans les règles supplémentaires
  'SORTIE_COFFRE',              // Existe dans les règles supplémentaires
];

// Types NON utilisés (commentés pour référence)
// Si vous commencez à les utiliser, décommentez-les et créez les règles
const OPTIONAL_EVENT_TYPES = [
  // 'DEPOSIT_TERM',              // Comptes à terme (non implémentés)
  // 'WITHDRAWAL_TERM',           // Comptes à terme (non implémentés)
  // 'MOBILE_MONEY_DEPOSIT',      // Couvert par DEP_MTN_*, DEP_AIRTEL_*
  // 'MOBILE_MONEY_WITHDRAWAL',   // Couvert par RET_MTN_*, RET_AIRTEL_*
  // 'MOBILE_MONEY_TRANSFER',     // Non utilisé
  // 'CREDIT_INTEREST_ACCRUAL',   // Constatation intérêts (non automatisée)
  // 'CREDIT_PENALTY',            // Couvert par CREDIT_REPAYMENT_PENALTY
  // 'INTEREST_CAPITALIZATION',   // Capitalisation (non automatisée)
  // 'SAVINGS_TRANSFER',          // Couvert par INTERNAL_TRANSFER
  // 'SERVICE_FEE',               // Frais divers (non systématiques)
  // 'TRANSACTION_FEE',           // Frais transaction (non systématiques)
  // 'ACCOUNT_MAINTENANCE_FEE',   // Frais tenue compte (non automatisés)
  // 'EXTERNAL_TRANSFER',         // Virements externes (non implémentés)
  // 'REGULARISATION',            // Fait manuellement via OD
  // 'CORRECTION',                // Fait manuellement via OD
  // 'INITIAL_BALANCE',           // Fait manuellement via OD
];

async function verifyRulesCompleteness() {
  console.log('=== VÉRIFICATION DE LA COMPLÉTUDE DES RÈGLES COMPTABLES ===\n');

  // Récupérer toutes les règles actives
  const rules = await db
    .select()
    .from(accountingRules)
    .where(eq(accountingRules.active, true));

  // Grouper les règles par eventType
  const rulesByEvent = rules.reduce((acc, rule) => {
    if (!acc[rule.eventType]) {
      acc[rule.eventType] = [];
    }
    acc[rule.eventType].push(rule);
    return acc;
  }, {} as Record<string, typeof rules>);

  console.log(`✓ ${rules.length} règles comptables actives trouvées\n`);

  // Vérifier chaque type d'événement requis
  const missingRules: string[] = [];
  const existingRules: string[] = [];

  console.log('Vérification par type d\'événement:\n');

  for (const eventType of REQUIRED_EVENT_TYPES) {
    const eventRules = rulesByEvent[eventType];

    if (!eventRules || eventRules.length === 0) {
      console.log(`❌ ${eventType}: MANQUANT`);
      missingRules.push(eventType);
    } else {
      console.log(`✓ ${eventType}: ${eventRules.length} règle(s)`);
      existingRules.push(eventType);

      // Afficher les détails de chaque règle
      for (const rule of eventRules) {
        console.log(`    - ${rule.code}: Débit ${rule.debitAccount}, Crédit ${rule.creditAccount}`);
        if (rule.paymentMethod) {
          console.log(`      Méthode: ${rule.paymentMethod}`);
        }
        if (rule.provider) {
          console.log(`      Provider: ${rule.provider}`);
        }
      }
    }
  }

  // Règles supplémentaires (non requises mais présentes)
  const extraEventTypes = Object.keys(rulesByEvent).filter(
    et => !REQUIRED_EVENT_TYPES.includes(et)
  );

  if (extraEventTypes.length > 0) {
    console.log('\n\nRègles supplémentaires (non dans la liste requise):');
    for (const eventType of extraEventTypes) {
      const eventRules = rulesByEvent[eventType];
      console.log(`  ℹ️  ${eventType}: ${eventRules.length} règle(s)`);
    }
  }

  // Résumé
  console.log('\n\n=== RÉSUMÉ ===');
  console.log(`Types d'événements requis: ${REQUIRED_EVENT_TYPES.length}`);
  console.log(`Types avec règles:         ${existingRules.length} ✓`);
  console.log(`Types sans règles:         ${missingRules.length} ${missingRules.length > 0 ? '⚠️' : '✓'}`);

  if (missingRules.length > 0) {
    console.log('\n⚠️  ATTENTION: Règles manquantes détectées!');
    console.log('   Types manquants:', missingRules.join(', '));
    console.log('\n   En mode GL_POSTING_MODE=STRICT, les opérations suivantes seront BLOQUÉES:');
    for (const eventType of missingRules) {
      console.log(`     - ${eventType}`);
    }
    console.log('\n   ACTION REQUISE:');
    console.log('   1. Créer les règles comptables manquantes via l\'interface admin');
    console.log('   2. Ou retirer ces types de la liste REQUIRED_EVENT_TYPES si non utilisés');
    console.log('   3. Relancer ce script pour vérifier\n');

    process.exit(1); // Exit avec erreur si des règles manquent
  }

  console.log('\n✅ Toutes les règles comptables requises sont présentes!');
  console.log('   Le système peut être passé en mode GL_POSTING_MODE=STRICT en toute sécurité.\n');

  process.exit(0);
}

verifyRulesCompleteness().catch(err => {
  console.error('Erreur lors de la vérification:', err);
  process.exit(1);
});
