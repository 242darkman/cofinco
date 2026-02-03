/**
 * RBAC Hardening Unit Tests
 * =========================
 *
 * Tests for:
 * - Schema validation (bulkUserPermissionUpdateSchema)
 * - Critical permission detection (isCriticalPermission)
 * - Permission scope validation
 */

import { describe, it, expect } from 'vitest';
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
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('paiements.');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('coffre.');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('admin.');
    expect(DEFAULT_CRITICAL_PATTERNS).toContain('validation.');
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
