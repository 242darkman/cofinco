/**
 * Fragment de bundles de permissions par module — domaine « coffre ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleCoffre: Record<string, string[]> = {
  // === OPÉRATIONS - COFFRE-FORT ===
  'Coffre-Fort': [
    'coffre.view',
    'coffre.create',
    'coffre.edit',
    'coffre.approve',
    'coffre.transfer',
    'coffre.transferts.view',
    'coffre.transferts.create',
    'coffre.transferts.approve',
    'coffre.transfert.init',
    'coffre.transfert.validate',
    'coffre.transfert.execute',
    'coffre.config.view',
    'coffre.config.edit',
    'coffre.supervision.view',
    // Evacuation
    'coffre.evacuation.view',
    'coffre.evacuation.create',
    'coffre.evacuation.approve',
    'coffre.evacuation.prepare',
    'coffre.evacuation.dispatch',
    'coffre.evacuation.deposit',
    'coffre.evacuation.reconcile',
    'coffre.evacuation.config',
  ],
};
