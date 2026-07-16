/**
 * Fragment de bundles de permissions par module — domaine « caisse ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleCaisse: Record<string, string[]> = {
  // === OPÉRATIONS - CAISSE ===
  'Caisse': [
    'caisse.view',
    'caisse.create',
    'caisse.edit',
    'caisse.export',
    'caisse.manage',
    'caisse.deposit',
    'caisse.withdraw',
    'caisse.transfer',
    'caisse.paiement',
    'caisse.sessions.view',
    'caisse.sessions.create',
    'caisse.sessions.open',
    'caisse.sessions.close',
    'caisse.open',
    'caisse.close',
  ],

  'CaisseAgent': [
    'caisseagent.view',
    'caisseagent.create',
    'caisseagent.edit',
    'caisseagent.approve',
    'caisseagent.reject',
    'caisseagent.suspend',
    'caisseagent.manage',
    'caisseagent.operations.view',
    'caisseagent.operations.create',
    'caisseagent.operations.approve',
  ],

  'Paiements Agent': [
    'paiements.view',
    'paiements.create',
  ],
};
