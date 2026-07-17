/**
 * Fragment de bundles de permissions par module — domaine « clients ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleClients: Record<string, string[]> = {
  // === FINANCE - CLIENTS ===
  'Clients': [
    'clients.view',
    'clients.create',
    'clients.edit',
    'clients.delete',
    'clients.export',
    'clients.import',
  ],
};
