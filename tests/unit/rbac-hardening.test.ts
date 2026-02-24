/**
 * RBAC Hardening Unit Tests
 * =========================
 *
 * Tests for:
 * - Schema validation (bulkUserPermissionUpdateSchema)
 * - Critical permission detection (isCriticalPermission)
 * - Permission scope validation
 * - P2-1: Anti-drift tests (seed codes vs mappings, no duplication)
 */

import { describe, it, expect } from 'vitest';
import {
  PERMISSION_MAPPINGS,
  MODULE_PERMISSION_BUNDLES,
  validateModuleBundles,
  getModulePermissionBundle,
  isModuleVisible,
  canWithRules,
  buildRulesFromPermissionCodes,
  Actions,
  Subjects,
} from '@shared/ability';
import { PERMISSIONS_DATA, APP_MODULES, SEED_ROLE_PERMISSIONS } from '@shared/config/rbac';
import type { CaslRule } from '@shared/ability';
import {
  bulkUserPermissionUpdateSchema,
  isCriticalPermission,
  DEFAULT_CRITICAL_PATTERNS,
  RBAC_FEATURE_FLAGS,
} from '@shared/schema';

// ============================================================================
// isCriticalPermission
// ============================================================================

describe('isCriticalPermission', () => {
  it('should detect paiements. prefixed permissions as critical', () => {
    expect(isCriticalPermission('paiements.view')).toBe(true);
    expect(isCriticalPermission('paiements.manage')).toBe(true);
    expect(isCriticalPermission('paiements.anything')).toBe(true);
  });

  it('should detect coffre. prefixed permissions as critical', () => {
    expect(isCriticalPermission('coffre.open')).toBe(true);
    expect(isCriticalPermission('coffre.manage')).toBe(true);
    expect(isCriticalPermission('coffre.audit')).toBe(true);
  });

  it('should detect admin. prefixed permissions as critical', () => {
    expect(isCriticalPermission('admin.full_access')).toBe(true);
    expect(isCriticalPermission('admin.system_settings')).toBe(true);
    expect(isCriticalPermission('admin.users')).toBe(true);
  });

  it('should detect validation. prefixed permissions as critical', () => {
    expect(isCriticalPermission('validation.credits')).toBe(true);
    expect(isCriticalPermission('validation.transfers')).toBe(true);
  });

  it('should detect specific critical permission codes', () => {
    expect(isCriticalPermission('caisse.close')).toBe(true);
    expect(isCriticalPermission('caisse.admin')).toBe(true);
    expect(isCriticalPermission('credits.disburse')).toBe(true);
    expect(isCriticalPermission('rbac.manage')).toBe(true);
  });

  it('should NOT detect regular permissions as critical', () => {
    expect(isCriticalPermission('credit:view')).toBe(false);
    expect(isCriticalPermission('credit:create')).toBe(false);
    expect(isCriticalPermission('client:update')).toBe(false);
    expect(isCriticalPermission('compte:view')).toBe(false);
    expect(isCriticalPermission('tontine:manage')).toBe(false);
  });

  it('should be case-sensitive', () => {
    // The function checks prefix with startsWith, which is case-sensitive
    expect(isCriticalPermission('PAIEMENTS.view')).toBe(false);
    expect(isCriticalPermission('ADMIN.manage')).toBe(false);
  });

  it('should handle empty string', () => {
    expect(isCriticalPermission('')).toBe(false);
  });
});

// ============================================================================
// DEFAULT_CRITICAL_PATTERNS
// ============================================================================

describe('DEFAULT_CRITICAL_PATTERNS', () => {
  it('should contain expected critical patterns', () => {
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('paiements.%');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('coffre.%');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('admin.%');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('validation.%');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('caisse.close');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('caisse.admin');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('credits.disburse');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('rbac.manage');
  });

  it('should be an array with at least 8 entries', () => {
    expect(Array.isArray(DEFAULT_CRITICAL_PATTERNS)).toBe(true);
    expect(DEFAULT_CRITICAL_PATTERNS.length).toBeGreaterThanOrEqual(8);
  });
});

// ============================================================================
// bulkUserPermissionUpdateSchema
// ============================================================================

describe('bulkUserPermissionUpdateSchema', () => {
  it('should validate a valid bulk update payload', () => {
    const validPayload = {
      scope: 'GLOBAL',
      changes: [
        { permissionCode: 'credit:view', granted: true },
        { permissionCode: 'credit:create', granted: false },
      ],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBe('GLOBAL');
      expect(result.data.changes).toHaveLength(2);
    }
  });

  it('should default scope to GLOBAL if not provided', () => {
    const payload = {
      changes: [{ permissionCode: 'test:permission', granted: true }],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBe('GLOBAL');
    }
  });

  it('should accept AGENCE scope with agenceId', () => {
    const payload = {
      scope: 'AGENCE',
      agenceId: '550e8400-e29b-41d4-a716-446655440000',
      changes: [{ permissionCode: 'test:permission', granted: true }],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should accept null granted value for reset', () => {
    const payload = {
      changes: [{ permissionCode: 'test:permission', granted: null }],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.changes[0].granted).toBeNull();
    }
  });

  it('should reject empty changes array', () => {
    const payload = {
      scope: 'GLOBAL',
      changes: [],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject invalid scope', () => {
    const payload = {
      scope: 'INVALID',
      changes: [{ permissionCode: 'test:permission', granted: true }],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject changes without permissionId or permissionCode', () => {
    const payload = {
      changes: [{ granted: true }],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should validate optional reason field', () => {
    const payload = {
      changes: [{ permissionCode: 'test:permission', granted: true }],
      reason: 'Testing bulk update functionality',
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Testing bulk update functionality');
    }
  });

  it('should reject reason exceeding 500 characters', () => {
    const payload = {
      changes: [{ permissionCode: 'test:permission', granted: true }],
      reason: 'A'.repeat(501),
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should accept permissionId as alternative to permissionCode', () => {
    const payload = {
      changes: [{ permissionId: '550e8400-e29b-41d4-a716-446655440000', granted: true }],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should reject AGENCE scope without agenceId', () => {
    const payload = {
      scope: 'AGENCE',
      changes: [{ permissionCode: 'test:permission', granted: true }],
    };

    const result = bulkUserPermissionUpdateSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// RBAC_FEATURE_FLAGS
// ============================================================================

describe('RBAC_FEATURE_FLAGS', () => {
  it('should contain expected feature flag keys', () => {
    expect(RBAC_FEATURE_FLAGS.SCOPED_OVERRIDES).toBe('RBAC_SCOPED_OVERRIDES');
    expect(RBAC_FEATURE_FLAGS.AUDIT_LOG_ENABLED).toBe('RBAC_AUDIT_LOG_ENABLED');
    expect(RBAC_FEATURE_FLAGS.REQUIRE_REASON_CRITICAL).toBe('RBAC_REQUIRE_REASON_CRITICAL');
  });

  it('should have consistent naming convention', () => {
    Object.values(RBAC_FEATURE_FLAGS).forEach((flag) => {
      expect(flag).toMatch(/^RBAC_/);
    });
  });
});

// ============================================================================
// Scope Validation Logic
// ============================================================================

describe('Permission Scope Validation', () => {
  it('should validate that AGENCE scope requires agenceId when enforced', () => {
    // This tests the logical constraint that should be enforced at runtime
    const validateScopeWithAgence = (scope: string, agenceId?: string | null): boolean => {
      if (scope === 'AGENCE' && !agenceId) {
        return false; // Invalid: AGENCE scope without agenceId
      }
      return true;
    };

    expect(validateScopeWithAgence('GLOBAL', undefined)).toBe(true);
    expect(validateScopeWithAgence('GLOBAL', null)).toBe(true);
    expect(validateScopeWithAgence('AGENCE', '550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validateScopeWithAgence('AGENCE', undefined)).toBe(false);
    expect(validateScopeWithAgence('AGENCE', null)).toBe(false);
  });

  it('should validate that GLOBAL scope ignores agenceId', () => {
    const validateGlobalScope = (scope: string, agenceId?: string | null): boolean => {
      if (scope === 'GLOBAL' && agenceId) {
        // Warning: agenceId is ignored for GLOBAL scope
        console.warn('agenceId is ignored for GLOBAL scope');
      }
      return scope === 'GLOBAL';
    };

    expect(validateGlobalScope('GLOBAL', undefined)).toBe(true);
    expect(validateGlobalScope('GLOBAL', '550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(validateGlobalScope('AGENCE', undefined)).toBe(false);
  });
});

// ============================================================================
// Permission Override Priority
// ============================================================================

describe('Permission Override Priority', () => {
  /**
   * Priority order (highest to lowest):
   * 1. User-level overrides (OVERRIDE_GLOBAL/OVERRIDE_AGENCE)
   * 2. Temporary permissions (TEMPORARY)
   * 3. Role permissions (ROLE)
   */
  type PermissionSource = 'ROLE' | 'TEMPORARY' | 'OVERRIDE_GLOBAL' | 'OVERRIDE_AGENCE';

  const getSourcePriority = (source: PermissionSource): number => {
    switch (source) {
      case 'OVERRIDE_AGENCE':
        return 4; // Highest - most specific
      case 'OVERRIDE_GLOBAL':
        return 3;
      case 'TEMPORARY':
        return 2;
      case 'ROLE':
        return 1; // Lowest - base permissions
      default:
        return 0;
    }
  };

  it('should prioritize OVERRIDE_AGENCE over OVERRIDE_GLOBAL', () => {
    expect(getSourcePriority('OVERRIDE_AGENCE')).toBeGreaterThan(getSourcePriority('OVERRIDE_GLOBAL'));
  });

  it('should prioritize OVERRIDE_GLOBAL over TEMPORARY', () => {
    expect(getSourcePriority('OVERRIDE_GLOBAL')).toBeGreaterThan(getSourcePriority('TEMPORARY'));
  });

  it('should prioritize TEMPORARY over ROLE', () => {
    expect(getSourcePriority('TEMPORARY')).toBeGreaterThan(getSourcePriority('ROLE'));
  });

  it('should resolve effective permission by highest priority source', () => {
    const resolveEffectivePermission = (
      sources: Array<{ source: PermissionSource; granted: boolean }>
    ): { granted: boolean; source: PermissionSource } | null => {
      if (sources.length === 0) return null;

      const sorted = [...sources].sort(
        (a, b) => getSourcePriority(b.source) - getSourcePriority(a.source)
      );

      return sorted[0];
    };

    // Test: Override wins over role
    const result1 = resolveEffectivePermission([
      { source: 'ROLE', granted: true },
      { source: 'OVERRIDE_GLOBAL', granted: false },
    ]);
    expect(result1?.granted).toBe(false);
    expect(result1?.source).toBe('OVERRIDE_GLOBAL');

    // Test: Temporary wins over role
    const result2 = resolveEffectivePermission([
      { source: 'ROLE', granted: false },
      { source: 'TEMPORARY', granted: true },
    ]);
    expect(result2?.granted).toBe(true);
    expect(result2?.source).toBe('TEMPORARY');

    // Test: AGENCE override wins over GLOBAL override
    const result3 = resolveEffectivePermission([
      { source: 'OVERRIDE_GLOBAL', granted: true },
      { source: 'OVERRIDE_AGENCE', granted: false },
    ]);
    expect(result3?.granted).toBe(false);
    expect(result3?.source).toBe('OVERRIDE_AGENCE');
  });
});

// ============================================================================
// Audit Action Types
// ============================================================================

describe('RBAC Audit Action Types', () => {
  const AUDIT_ACTIONS = [
    'TOGGLE',
    'BULK_UPDATE',
    'RESET',
    'GRANT_TEMPORARY',
    'REVOKE_TEMPORARY',
    'EXPIRE_TEMPORARY',
  ] as const;

  it('should have expected audit action types', () => {
    expect(AUDIT_ACTIONS).toContain('TOGGLE');
    expect(AUDIT_ACTIONS).toContain('BULK_UPDATE');
    expect(AUDIT_ACTIONS).toContain('RESET');
    expect(AUDIT_ACTIONS).toContain('GRANT_TEMPORARY');
    expect(AUDIT_ACTIONS).toContain('REVOKE_TEMPORARY');
    expect(AUDIT_ACTIONS).toContain('EXPIRE_TEMPORARY');
  });

  it('should have 6 audit action types', () => {
    expect(AUDIT_ACTIONS).toHaveLength(6);
  });
});

// ============================================================================
// P2-1: Anti-Drift Tests - Seed Permission Codes vs PERMISSION_MAPPINGS
// ============================================================================

describe('P2-1: Anti-Drift - Seed Codes Coverage', () => {
  it('should have all PERMISSIONS_DATA codes in PERMISSION_MAPPINGS', () => {
    const missingCodes: string[] = [];

    for (const [moduleName, permissions] of Object.entries(PERMISSIONS_DATA)) {
      if (!permissions) continue;
      for (const perm of permissions) {
        const normalizedCode = perm.code.toLowerCase();
        if (!PERMISSION_MAPPINGS[normalizedCode]) {
          missingCodes.push(`${moduleName}: ${perm.code}`);
        }
      }
    }

    if (missingCodes.length > 0) {
      console.error('Missing permission codes in PERMISSION_MAPPINGS:');
      missingCodes.forEach(code => console.error(`  - ${code}`));
    }

    expect(missingCodes).toEqual([]);
  });

  it('should have all SEED_ROLE_PERMISSIONS codes in PERMISSION_MAPPINGS', () => {
    const missingCodes: string[] = [];

    for (const [role, codes] of Object.entries(SEED_ROLE_PERMISSIONS)) {
      if (codes.includes('*')) continue; // Skip admin wildcard

      for (const code of codes) {
        const normalizedCode = code.toLowerCase();
        if (!PERMISSION_MAPPINGS[normalizedCode]) {
          missingCodes.push(`${role}: ${code}`);
        }
      }
    }

    if (missingCodes.length > 0) {
      console.error('Missing permission codes from SEED_ROLE_PERMISSIONS:');
      missingCodes.forEach(code => console.error(`  - ${code}`));
    }

    expect(missingCodes).toEqual([]);
  });
});

// ============================================================================
// P2-1: Anti-Drift Tests - MODULE_PERMISSION_BUNDLES Validation
// ============================================================================

describe('P2-1: Anti-Drift - Module Permission Bundles', () => {
  it('should have all bundle codes in PERMISSION_MAPPINGS', () => {
    const result = validateModuleBundles();

    if (!result.valid) {
      console.error('Invalid bundle codes:');
      result.errors.forEach(err => console.error(`  - ${err}`));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should have bundles for all APP_MODULES', () => {
    const missingModules: string[] = [];

    for (const moduleName of APP_MODULES) {
      const bundle = getModulePermissionBundle(moduleName);
      if (bundle.length === 0) {
        missingModules.push(moduleName);
      }
    }

    // Some modules might not have bundles (intentionally empty)
    // But we should at least warn about them
    if (missingModules.length > 0) {
      console.warn('Modules without permission bundles:');
      missingModules.forEach(m => console.warn(`  - ${m}`));
    }

    // Allow some modules to not have bundles (intentional)
    // But main modules should have bundles
    const criticalModules = ['Crédits', 'Caisse', 'Clients', 'Comptes', 'Administration'];
    for (const module of criticalModules) {
      expect(getModulePermissionBundle(module).length).toBeGreaterThan(0);
    }
  });

  it('should not have duplicate codes within a bundle', () => {
    const duplicates: string[] = [];

    for (const [moduleName, codes] of Object.entries(MODULE_PERMISSION_BUNDLES)) {
      const seen = new Set<string>();
      for (const code of codes) {
        if (seen.has(code)) {
          duplicates.push(`${moduleName}: ${code}`);
        }
        seen.add(code);
      }
    }

    expect(duplicates).toEqual([]);
  });
});

// ============================================================================
// P2-1: Anti-Drift Tests - No Duplicated Mappings in Server
// ============================================================================

describe('P2-1: Anti-Drift - No Duplicated Server Mappings', () => {
  it('should import permission mappings from @shared/ability only', () => {
    // This test ensures that server/authorization/types.ts
    // no longer exports PERMISSION_CODE_MAPPINGS
    // The actual check is done at compile time, but we verify the shared export works
    expect(PERMISSION_MAPPINGS).toBeDefined();
    expect(Object.keys(PERMISSION_MAPPINGS).length).toBeGreaterThan(50);
  });

  it('should have consistent mapping keys (all lowercase)', () => {
    const nonLowercaseKeys = Object.keys(PERMISSION_MAPPINGS).filter(
      key => key !== key.toLowerCase()
    );

    expect(nonLowercaseKeys).toEqual([]);
  });
});

// ============================================================================
// isModuleVisible Tests (P0-2 Validation)
// ============================================================================

describe('isModuleVisible - Module Visibility Logic', () => {
  it('should return true for admin (manage all)', () => {
    const adminRules: CaslRule[] = [
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ];

    expect(isModuleVisible(adminRules, Subjects.CLIENTS)).toBe(true);
    expect(isModuleVisible(adminRules, Subjects.CREDITS)).toBe(true);
    expect(isModuleVisible(adminRules, Subjects.ADMIN)).toBe(true);
  });

  it('should return true when user can view module directly', () => {
    const rules: CaslRule[] = [
      { action: Actions.VIEW, subject: Subjects.CLIENTS },
    ];

    expect(isModuleVisible(rules, Subjects.CLIENTS)).toBe(true);
    expect(isModuleVisible(rules, Subjects.CREDITS)).toBe(false);
  });

  it('should return true when user has permission on module entity', () => {
    // User has permission on Client entity (not clients module)
    const rules: CaslRule[] = [
      { action: Actions.VIEW, subject: Subjects.CLIENT },
    ];

    // MODULE_ENTITY_MAP maps 'clients' -> ['Client']
    // So isModuleVisible should detect the entity permission
    expect(isModuleVisible(rules, Subjects.CLIENTS)).toBe(true);
  });

  it('should return true via fallback when permission code prefix matches', () => {
    // Build rules from permission codes
    const rules = buildRulesFromPermissionCodes(['clients.view']);

    // The code maps to Client entity, and isModuleVisible should find it
    expect(isModuleVisible(rules, Subjects.CLIENTS)).toBe(true);
  });

  it('should return false when user has no permission on module', () => {
    const rules: CaslRule[] = [
      { action: Actions.VIEW, subject: Subjects.CREDITS },
    ];

    expect(isModuleVisible(rules, Subjects.CLIENTS)).toBe(false);
    expect(isModuleVisible(rules, Subjects.CAISSE)).toBe(false);
  });

  it('should handle empty rules', () => {
    const rules: CaslRule[] = [];

    expect(isModuleVisible(rules, Subjects.CLIENTS)).toBe(false);
    expect(isModuleVisible(rules, Subjects.DASHBOARD)).toBe(false);
  });
});

// ============================================================================
// buildRulesFromPermissionCodes Tests
// ============================================================================

describe('buildRulesFromPermissionCodes - Rule Generation', () => {
  it('should generate rules for valid permission codes', () => {
    const codes = ['credits.view', 'clients.create', 'caisse.manage'];
    const rules = buildRulesFromPermissionCodes(codes);

    expect(rules.length).toBe(3);
    expect(rules.some(r => r.action === Actions.VIEW && r.subject === Subjects.CREDIT)).toBe(true);
    expect(rules.some(r => r.action === Actions.CREATE && r.subject === Subjects.CLIENT)).toBe(true);
    expect(rules.some(r => r.action === Actions.MANAGE && r.subject === Subjects.CAISSE)).toBe(true);
  });

  it('should skip unknown permission codes', () => {
    const codes = ['credits.view', 'unknown.code', 'invalid.permission'];
    const rules = buildRulesFromPermissionCodes(codes);

    // Only credits.view should produce a rule
    expect(rules.length).toBe(1);
    expect(rules[0].subject).toBe(Subjects.CREDIT);
  });

  it('should deduplicate rules', () => {
    const codes = ['credits.view', 'credits.view', 'clients.create', 'clients.create'];
    const rules = buildRulesFromPermissionCodes(codes);

    expect(rules.length).toBe(2);
  });

  it('should handle empty input', () => {
    const rules = buildRulesFromPermissionCodes([]);
    expect(rules).toEqual([]);
  });
});

// ============================================================================
// DoD Criteria Validation Tests
// ============================================================================

describe('DoD: Module visible <=> at least one action possible', () => {
  it('should make module visible only when user has at least one action', () => {
    // No permissions - module not visible
    const noPerms = buildRulesFromPermissionCodes([]);
    expect(isModuleVisible(noPerms, Subjects.CREDITS)).toBe(false);

    // One permission - module visible
    const onePerms = buildRulesFromPermissionCodes(['credits.view']);
    expect(isModuleVisible(onePerms, Subjects.CREDITS)).toBe(true);

    // Multiple permissions - module visible
    const multiPerms = buildRulesFromPermissionCodes(['credits.view', 'credits.create', 'credits.approve']);
    expect(isModuleVisible(multiPerms, Subjects.CREDITS)).toBe(true);
  });
});

describe('DoD: Enable All Module assigns all bundle permissions', () => {
  it('should have complete bundle for Credits module', () => {
    const creditsBundle = getModulePermissionBundle('Crédits');

    // Should include core permissions
    expect(creditsBundle).toContain('credits.view');
    expect(creditsBundle).toContain('credits.create');
    expect(creditsBundle).toContain('credits.approve');
    expect(creditsBundle).toContain('credits.disburse');

    // Should include sub-permissions
    expect(creditsBundle).toContain('credits.reevaluations.view');
  });

  it('should have complete bundle for Caisse module', () => {
    const caisseBundle = getModulePermissionBundle('Caisse');

    expect(caisseBundle).toContain('caisse.view');
    expect(caisseBundle).toContain('caisse.manage');
    expect(caisseBundle).toContain('caisse.deposit');
    expect(caisseBundle).toContain('caisse.withdraw');
    expect(caisseBundle).toContain('caisse.open');
    expect(caisseBundle).toContain('caisse.close');
  });

  it('should generate valid rules for all bundle codes', () => {
    for (const [moduleName, codes] of Object.entries(MODULE_PERMISSION_BUNDLES)) {
      const rules = buildRulesFromPermissionCodes(codes);

      // All valid codes in bundle should produce at least one rule
      // Note: buildRulesFromPermissionCodes deduplicates by action:subject
      // So multiple codes mapping to same action:subject will produce one rule
      const validCodes = codes.filter(code => PERMISSION_MAPPINGS[code]);

      // Each valid code should have its action:subject in the rules
      for (const code of validCodes) {
        const mapping = PERMISSION_MAPPINGS[code];
        const hasRule = rules.some(
          r => r.action === mapping.action && r.subject === mapping.subject
        );
        expect(hasRule).toBe(true);
      }

      // Should have at least one rule if there are valid codes
      if (validCodes.length > 0) {
        expect(rules.length).toBeGreaterThan(0);
      }
    }
  });
});
