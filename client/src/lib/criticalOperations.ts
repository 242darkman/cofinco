/**
 * Critical Operations Definition
 * Defines which operations are critical (financial) and must be blocked offline
 */

// ============================================================================
// Types
// ============================================================================

export interface CriticalOperation {
  /** Regex pattern to match the endpoint */
  endpoint: RegExp;
  /** HTTP method */
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Human-readable name */
  name: string;
  /** Category for grouping */
  category: 'savings' | 'credit' | 'transfer' | 'mobile_money' | 'caisse' | 'other';
  /** Requires idempotency key */
  requiresIdempotency: boolean;
  /** Block completely offline, or allow queueing */
  offlinePolicy: 'block' | 'queue';
}

// ============================================================================
// Critical Operations Registry
// ============================================================================

export const CRITICAL_OPERATIONS: Record<string, CriticalOperation> = {
  // === Savings Account Operations ===
  depot_epargne: {
    endpoint: /\/api\/comptes-epargne\/[^/]+\/depot/,
    method: 'POST',
    name: 'Dépôt épargne',
    category: 'savings',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  retrait_epargne: {
    endpoint: /\/api\/comptes-epargne\/[^/]+\/retrait/,
    method: 'POST',
    name: 'Retrait épargne',
    category: 'savings',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },

  // === Credit Operations ===
  decaissement_credit: {
    endpoint: /\/api\/credits\/[^/]+\/decaissement/,
    method: 'POST',
    name: 'Décaissement crédit',
    category: 'credit',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  remboursement_credit: {
    endpoint: /\/api\/credits\/[^/]+\/remboursement/,
    method: 'POST',
    name: 'Remboursement crédit',
    category: 'credit',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  remboursement_anticipe: {
    endpoint: /\/api\/credits\/[^/]+\/remboursement-anticipe/,
    method: 'POST',
    name: 'Remboursement anticipé',
    category: 'credit',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },

  // === Transfer Operations ===
  virement: {
    endpoint: /\/api\/virements/,
    method: 'POST',
    name: 'Virement',
    category: 'transfer',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  transfert_coffre: {
    endpoint: /\/api\/transferts-inter-coffres/,
    method: 'POST',
    name: 'Transfert inter-coffres',
    category: 'transfer',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  approvisionnement_caisse: {
    endpoint: /\/api\/caisses\/[^/]+\/approvisionnement/,
    method: 'POST',
    name: 'Approvisionnement caisse',
    category: 'transfer',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  versement_coffre: {
    endpoint: /\/api\/caisses\/[^/]+\/versement-coffre/,
    method: 'POST',
    name: 'Versement coffre',
    category: 'transfer',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },

  // === Mobile Money ===
  mm_depot: {
    endpoint: /\/api\/payments\/deposit/,
    method: 'POST',
    name: 'Dépôt Mobile Money',
    category: 'mobile_money',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  mm_retrait: {
    endpoint: /\/api\/payments\/withdrawal/,
    method: 'POST',
    name: 'Retrait Mobile Money',
    category: 'mobile_money',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },

  // === Caisse Operations ===
  ouverture_session: {
    endpoint: /\/api\/sessions-caisse\/ouvrir/,
    method: 'POST',
    name: 'Ouverture session caisse',
    category: 'caisse',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  cloture_session: {
    endpoint: /\/api\/sessions-caisse\/[^/]+\/cloturer/,
    method: 'POST',
    name: 'Clôture session caisse',
    category: 'caisse',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },

  // === Tontine Operations ===
  cotisation_tontine: {
    endpoint: /\/api\/tontines\/[^/]+\/cotisations/,
    method: 'POST',
    name: 'Cotisation tontine',
    category: 'savings',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
  paiement_tontine: {
    endpoint: /\/api\/tontines\/[^/]+\/paiements/,
    method: 'POST',
    name: 'Paiement bénéficiaire tontine',
    category: 'savings',
    requiresIdempotency: true,
    offlinePolicy: 'block',
  },
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if an endpoint/method combination is a critical operation
 */
export function isCriticalOperation(endpoint: string, method: string): boolean {
  const upperMethod = method.toUpperCase();

  return Object.values(CRITICAL_OPERATIONS).some(
    (op) => op.endpoint.test(endpoint) && op.method === upperMethod
  );
}

/**
 * Get the critical operation definition for an endpoint
 */
export function getCriticalOperation(
  endpoint: string,
  method: string
): CriticalOperation | null {
  const upperMethod = method.toUpperCase();

  for (const op of Object.values(CRITICAL_OPERATIONS)) {
    if (op.endpoint.test(endpoint) && op.method === upperMethod) {
      return op;
    }
  }

  return null;
}

/**
 * Check if an operation requires an idempotency key
 */
export function requiresIdempotencyKey(endpoint: string, method: string): boolean {
  const op = getCriticalOperation(endpoint, method);
  return op?.requiresIdempotency ?? false;
}

/**
 * Check if an operation should be blocked offline (vs queued)
 */
export function shouldBlockOffline(endpoint: string, method: string): boolean {
  const op = getCriticalOperation(endpoint, method);
  return op?.offlinePolicy === 'block';
}

/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  const random = Array.from(array, b => b.toString(36)).join('').slice(0, 8);
  const key = `${timestamp}-${random}`;

  return prefix ? `${prefix}_${key}` : key;
}

/**
 * Get all operations by category
 */
export function getOperationsByCategory(
  category: CriticalOperation['category']
): CriticalOperation[] {
  return Object.values(CRITICAL_OPERATIONS).filter((op) => op.category === category);
}

/**
 * Check if mutation should be allowed based on network state
 */
export function canPerformMutation(
  endpoint: string,
  method: string,
  networkStatus: 'online' | 'unstable' | 'offline' | 'api_down'
): { allowed: boolean; reason?: string } {
  const operation = getCriticalOperation(endpoint, method);

  // Not a critical operation - allow
  if (!operation) {
    return { allowed: true };
  }

  // Online or unstable - allow
  if (networkStatus === 'online' || networkStatus === 'unstable') {
    return { allowed: true };
  }

  // Offline or API down
  if (operation.offlinePolicy === 'block') {
    return {
      allowed: false,
      reason: `${operation.name} nécessite une connexion active au serveur.`,
    };
  }

  // Operation can be queued
  return {
    allowed: true,
    reason: `${operation.name} sera envoyée lorsque la connexion sera rétablie.`,
  };
}
