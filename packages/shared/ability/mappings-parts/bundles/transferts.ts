/**
 * Fragment de bundles de permissions par module — domaine « transferts ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleTransferts: Record<string, string[]> = {
  // === OPÉRATIONS - TRANSFERTS ===
  'Transferts': [
    'transferts.view',
    'transferts.send',
    'transferts.receive',
  ],

  'Virements Programmes': [
    'virements_programmes.view',
    'virements_programmes.edit',
  ],
};
