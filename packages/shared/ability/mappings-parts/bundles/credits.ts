/**
 * Fragment de bundles de permissions par module — domaine « credits ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleCredits: Record<string, string[]> = {
  // === FINANCE - CRÉDITS ===
  'Crédits': [
    'credits.view',
    'credits.create',
    'credits.edit',
    'credits.delete',
    'credits.approve',
    'credits.reject',
    'credits.disburse',
    'credits.disburse_cash',
    'credits.disburse_account',
    'credits.disburse_momo',
    'credits.collect',
    'credits.export',
    'credits.close',
    // Demandes de crédit
    'demandes.view',
    'demandes.create',
    'demandes.edit',
    'demandes.approve',
    'demandes.reject',
    // Réévaluations
    'reevaluations.view',
    'reevaluations.create',
    'reevaluations.approve',
    'credits.reevaluations.view',
    'credits.reevaluations.create',
    'credits.reevaluations.approve',
    'credits.reevaluations.validate',
    'credits.reevaluations.decide',
  ],

  'Remboursements': [
    'remboursements.view',
    'remboursements.create',
  ],
};
