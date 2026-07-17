/**
 * Fragment de bundles de permissions par module — domaine « terrain ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleTerrain: Record<string, string[]> = {
  // === OPÉRATIONS - TERRAIN ===
  'Agent Terrain': [
    'terrain.view',
    'terrain.create',
    'terrain.edit',
    'terrain.delete',
    'terrain.export',
    'terrain.operations.view',
    'terrain.operations.approve',
    'agent.view',
    'agent.create',
    'agent.edit',
    'agent.collect',
    'agent.manage',
  ],

  'Incidents': [
    'incidents.view',
    'incidents.create',
    'incidents.edit',
    'incidents.manage',
  ],

  'Visites': [
    'visites.view',
    'visites.create',
  ],

  'Prospection': [
    'prospection.view',
    'prospection.create',
    'prospection.edit',
    'prospection.delete',
    'prospection.convert',
    'prospection.export',
    'prospection.primes.view',
    'prospection.primes.approve',
    'prospection.primes.reject',
    'prospection.primes.pay',
    'prospection.config.view',
    'prospection.config.edit',
    'prospection.supervision.view',
  ],

  'Zones Commerciales': [
    'zones.view',
    'zones.create',
    'zones.edit',
    'zones.delete',
  ],
};
