/**
 * Fragment de bundles de permissions par module — domaine « communications ».
 * Assemblé dans ../../mappings.ts (façade).
 */
export const bundleCommunications: Record<string, string[]> = {
  // === COMMUNICATIONS ===
  'Communications': [
    'communications.view',
    'communications.create',
    'communications.edit',
    'communications.delete',
    'communications.send',
    'communications.broadcast',
    'communications.schedule',
    'communications.archive',
  ],

  'Messages': [
    'messages.view',
    'messages.send',
  ],
  // === NOTIFICATIONS ===
  'Notifications': [
    'notifications.view',
    'notifications.create',
    'notifications.edit',
    'notifications.manage',
  ],
  // === AUTRES MODULES ===
  'Fidélité': [
    'loyalty.view',
    'loyalty.create',
    'loyalty.edit',
    'loyalty.delete',
    'loyalty.manage',
    'loyalty.redeem',
    'loyalty.award',
    'loyalty.adjust',
    'loyalty.expire',
  ],

  'Régularisation': [
    'regularisation.view',
    'regularisation.create',
    'regularisation.approve',
    'regularisation.reject',
    'regularisation.manage',
  ],

  'Bourse': [
    'bourse.view',
    'bourse.trade',
  ],

  'Loge': [
    'loge.view',
    'loge.upload',
    'loge.delete',
  ],
};
