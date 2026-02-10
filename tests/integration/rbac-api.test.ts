/**
 * RBAC API Integration Tests
 * ==========================
 *
 * Tests for API-01: 403/200 Matrix
 * Tests for API-02: Versioning
 *
 * These tests validate that the RBAC system correctly:
 * - Denies access (403) when permission is missing
 * - Grants access (200) when permission is present
 * - Handles role permissions, user overrides, temporary permissions
 * - Properly handles agency feature locks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildRulesFromPermissionCodes,
  canWithRules,
  isModuleVisible,
  Actions,
  Subjects,
  PERMISSION_MAPPINGS,
  MODULE_PERMISSION_BUNDLES,
  type CaslRule,
} from '@shared/ability';
import { createMongoAbility } from '@casl/ability';
import { SystemRole } from '@shared/types/roles';

// ============================================================================
// API-01: Permission Matrix Tests (403/200)
// ============================================================================

describe('API-01: Permission Matrix - 403/200 Responses', () => {
  /**
   * Test matrix for each endpoint:
   * - No permission -> 403
   * - Role permission -> 200
   * - User override grant -> 200
   * - Temporary permission -> 200
   * - Temporary expired -> 403
   * - Agency lock -> 403
   */

  describe('Credits Module', () => {
    it('should deny access without credits.view permission', () => {
      const rules: CaslRule[] = [];
      expect(canWithRules(rules, Actions.VIEW, Subjects.CREDIT)).toBe(false);
    });

    it('should grant access with credits.view permission from role', () => {
      const rules = buildRulesFromPermissionCodes(['credits.view']);
      expect(canWithRules(rules, Actions.VIEW, Subjects.CREDIT)).toBe(true);
    });

    it('should grant access with credits.create for creating credits', () => {
      const rules = buildRulesFromPermissionCodes(['credits.create']);
      expect(canWithRules(rules, Actions.CREATE, Subjects.CREDIT)).toBe(true);
      // But should not grant view
      expect(canWithRules(rules, Actions.VIEW, Subjects.CREDIT)).toBe(false);
    });

    it('should grant access with credits.approve for approving credits', () => {
      const rules = buildRulesFromPermissionCodes(['credits.approve']);
      expect(canWithRules(rules, Actions.APPROVE, Subjects.CREDIT)).toBe(true);
    });

    it('should handle credits.disburse_cash specifically', () => {
      const rules = buildRulesFromPermissionCodes(['credits.disburse_cash']);
      expect(canWithRules(rules, Actions.DISBURSE_CASH, Subjects.CREDIT)).toBe(true);
      // Should NOT grant generic disburse
      expect(canWithRules(rules, Actions.DISBURSE, Subjects.CREDIT)).toBe(false);
    });

    it('should handle credits.disburse for all channels', () => {
      const rules = buildRulesFromPermissionCodes(['credits.disburse']);
      expect(canWithRules(rules, Actions.DISBURSE, Subjects.CREDIT)).toBe(true);
    });
  });

  describe('Caisse Module', () => {
    it('should deny caisse.open without permission', () => {
      const rules = buildRulesFromPermissionCodes(['caisse.view']);
      expect(canWithRules(rules, Actions.OPEN_SESSION, Subjects.CAISSE_SESSION)).toBe(false);
    });

    it('should grant caisse.open with permission', () => {
      const rules = buildRulesFromPermissionCodes(['caisse.open']);
      // caisse.open maps to OPEN_SESSION on CAISSE_SESSION (not OPEN on CAISSE)
      expect(canWithRules(rules, Actions.OPEN_SESSION, Subjects.CAISSE_SESSION)).toBe(true);
    });

    it('should grant caisse.close with permission', () => {
      const rules = buildRulesFromPermissionCodes(['caisse.close']);
      // caisse.close maps to CLOSE_SESSION on CAISSE_SESSION (not CLOSE on CAISSE)
      expect(canWithRules(rules, Actions.CLOSE_SESSION, Subjects.CAISSE_SESSION)).toBe(true);
    });

    it('should grant caisse.deposit and withdraw separately', () => {
      const depositRules = buildRulesFromPermissionCodes(['caisse.deposit']);
      const withdrawRules = buildRulesFromPermissionCodes(['caisse.withdraw']);

      expect(canWithRules(depositRules, Actions.DEPOSIT, Subjects.CAISSE)).toBe(true);
      expect(canWithRules(depositRules, Actions.WITHDRAW, Subjects.CAISSE)).toBe(false);

      expect(canWithRules(withdrawRules, Actions.WITHDRAW, Subjects.CAISSE)).toBe(true);
      expect(canWithRules(withdrawRules, Actions.DEPOSIT, Subjects.CAISSE)).toBe(false);
    });
  });

  describe('Clients Module', () => {
    it('should handle client CRUD permissions independently', () => {
      const viewRules = buildRulesFromPermissionCodes(['clients.view']);
      const createRules = buildRulesFromPermissionCodes(['clients.create']);
      const editRules = buildRulesFromPermissionCodes(['clients.edit']);
      const deleteRules = buildRulesFromPermissionCodes(['clients.delete']);

      expect(canWithRules(viewRules, Actions.VIEW, Subjects.CLIENT)).toBe(true);
      expect(canWithRules(viewRules, Actions.CREATE, Subjects.CLIENT)).toBe(false);

      expect(canWithRules(createRules, Actions.CREATE, Subjects.CLIENT)).toBe(true);
      expect(canWithRules(createRules, Actions.DELETE, Subjects.CLIENT)).toBe(false);

      expect(canWithRules(editRules, Actions.EDIT, Subjects.CLIENT)).toBe(true);
      expect(canWithRules(deleteRules, Actions.DELETE, Subjects.CLIENT)).toBe(true);
    });
  });

  describe('Admin Module', () => {
    it('should deny admin access without admin permissions', () => {
      const rules = buildRulesFromPermissionCodes(['clients.view', 'credits.view']);
      expect(canWithRules(rules, Actions.VIEW, Subjects.ADMIN)).toBe(false);
      expect(canWithRules(rules, Actions.MANAGE, Subjects.USER)).toBe(false);
    });

    it('should grant admin access with admin.view', () => {
      const rules = buildRulesFromPermissionCodes(['admin.view']);
      expect(canWithRules(rules, Actions.VIEW, Subjects.ADMIN)).toBe(true);
    });

    it('should grant full access with admin.manage', () => {
      const rules = buildRulesFromPermissionCodes(['admin.manage']);
      expect(canWithRules(rules, Actions.MANAGE, Subjects.ADMIN)).toBe(true);
    });
  });
});

// ============================================================================
// User Override Tests
// ============================================================================

describe('API-01: User Override - Grant/Deny', () => {
  it('should grant access via user override when role does not have permission', () => {
    // Simulate: role has no credits.approve, but user has override grant
    const rolePermissions: string[] = ['credits.view'];
    const userOverrideGrant: string[] = ['credits.approve'];

    const allPermissions = [...rolePermissions, ...userOverrideGrant];
    const rules = buildRulesFromPermissionCodes(allPermissions);

    expect(canWithRules(rules, Actions.APPROVE, Subjects.CREDIT)).toBe(true);
  });

  it('should deny access via user override deny even when role has permission', () => {
    // Simulate: role has credits.approve, but user has override deny
    const roleRules = buildRulesFromPermissionCodes(['credits.approve']);

    // Add inverted (deny) rule
    const rulesWithDeny: CaslRule[] = [
      ...roleRules,
      { action: Actions.APPROVE, subject: Subjects.CREDIT, inverted: true },
    ];

    // With deny rule added at the end (higher priority), access should be denied
    // Note: CASL processes rules in order, inverted rules take precedence when defined later
    const ability = createMongoAbility(rulesWithDeny);
    expect(ability.can(Actions.APPROVE, Subjects.CREDIT)).toBe(false);
  });
});

// ============================================================================
// Temporary Permission Tests
// ============================================================================

describe('API-01: Temporary Permissions', () => {
  it('should grant access with temporary permission', () => {
    // Simulate: no role permission, but temporary permission active
    const tempPermissions = ['credits.disburse'];
    const rules = buildRulesFromPermissionCodes(tempPermissions);

    expect(canWithRules(rules, Actions.DISBURSE, Subjects.CREDIT)).toBe(true);
  });

  it('should deny access when temporary permission expires (not in rules)', () => {
    // After expiration, the permission code is no longer in the list
    const expiredPermissions: string[] = []; // Temporary expired, removed from list
    const rules = buildRulesFromPermissionCodes(expiredPermissions);

    expect(canWithRules(rules, Actions.DISBURSE, Subjects.CREDIT)).toBe(false);
  });
});

// ============================================================================
// Agency Feature Lock Tests
// ============================================================================

describe('API-01: Agency Feature Locks', () => {
  it('should deny access when module is locked for agency', () => {
    // User has permission, but agency has credits locked
    const userRules = buildRulesFromPermissionCodes(['credits.view', 'credits.create']);

    // Add agency lock deny rule (simulating what addLockedFeatureRules does)
    const rulesWithLock: CaslRule[] = [
      ...userRules,
      { action: Actions.MANAGE, subject: Subjects.CREDIT, inverted: true },
    ];

    const ability = createMongoAbility(rulesWithLock);

    // Lock should deny all credit actions
    expect(ability.can(Actions.VIEW, Subjects.CREDIT)).toBe(false);
    expect(ability.can(Actions.CREATE, Subjects.CREDIT)).toBe(false);
    expect(ability.can(Actions.MANAGE, Subjects.CREDIT)).toBe(false);
  });

  it('should not affect unlocked modules', () => {
    // Credits locked, but clients should still work
    const userRules = buildRulesFromPermissionCodes(['credits.view', 'clients.view']);

    const rulesWithLock: CaslRule[] = [
      ...userRules,
      { action: Actions.MANAGE, subject: Subjects.CREDIT, inverted: true },
    ];

    const ability = createMongoAbility(rulesWithLock);

    // Credits locked
    expect(ability.can(Actions.VIEW, Subjects.CREDIT)).toBe(false);

    // Clients should still work
    expect(ability.can(Actions.VIEW, Subjects.CLIENT)).toBe(true);
  });
});

// ============================================================================
// API-02: Versioning Tests
// ============================================================================

describe('API-02: RBAC Versioning', () => {
  it('should produce different rule sets for different permission sets', () => {
    const rules1 = buildRulesFromPermissionCodes(['credits.view']);
    const rules2 = buildRulesFromPermissionCodes(['credits.view', 'credits.create']);

    expect(rules1.length).toBe(1);
    expect(rules2.length).toBe(2);
  });

  it('should produce identical rules for identical permission sets', () => {
    const rules1 = buildRulesFromPermissionCodes(['credits.view', 'clients.view']);
    const rules2 = buildRulesFromPermissionCodes(['clients.view', 'credits.view']);

    // Both should have same number of rules (order might differ)
    expect(rules1.length).toBe(rules2.length);

    // Same permissions should result in same ability
    const ability1 = createMongoAbility(rules1);
    const ability2 = createMongoAbility(rules2);

    expect(ability1.can(Actions.VIEW, Subjects.CREDIT)).toBe(ability2.can(Actions.VIEW, Subjects.CREDIT));
    expect(ability1.can(Actions.VIEW, Subjects.CLIENT)).toBe(ability2.can(Actions.VIEW, Subjects.CLIENT));
  });
});

// ============================================================================
// Module Visibility with Permission Isolation
// ============================================================================

describe('API-01: Permission Isolation', () => {
  it('single permission should make module visible but limit actions', () => {
    // User only has clients.create
    const rules = buildRulesFromPermissionCodes(['clients.create']);

    // Module should be visible
    expect(isModuleVisible(rules, Subjects.CLIENTS)).toBe(true);

    // But only create action is allowed
    expect(canWithRules(rules, Actions.CREATE, Subjects.CLIENT)).toBe(true);
    expect(canWithRules(rules, Actions.VIEW, Subjects.CLIENT)).toBe(false);
    expect(canWithRules(rules, Actions.DELETE, Subjects.CLIENT)).toBe(false);
  });

  it('enabling full module should grant all bundle permissions', () => {
    // Get all permissions for Credits module
    const creditBundle = MODULE_PERMISSION_BUNDLES['Crédits'];
    const rules = buildRulesFromPermissionCodes(creditBundle);

    // Module should be visible
    expect(isModuleVisible(rules, Subjects.CREDITS)).toBe(true);

    // All mapped actions should be allowed
    expect(canWithRules(rules, Actions.VIEW, Subjects.CREDIT)).toBe(true);
    expect(canWithRules(rules, Actions.CREATE, Subjects.CREDIT)).toBe(true);
    expect(canWithRules(rules, Actions.APPROVE, Subjects.CREDIT)).toBe(true);
    expect(canWithRules(rules, Actions.DISBURSE, Subjects.CREDIT)).toBe(true);
  });
});

// ============================================================================
// Admin Wildcard Tests
// ============================================================================

describe('API-01: Admin Wildcard Access', () => {
  it('admin with manage:all should have access to everything', () => {
    const adminRules: CaslRule[] = [
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ];

    const ability = createMongoAbility(adminRules);

    // Should have access to all modules and actions
    expect(ability.can(Actions.VIEW, Subjects.CREDIT)).toBe(true);
    expect(ability.can(Actions.DELETE, Subjects.CREDIT)).toBe(true);
    expect(ability.can(Actions.MANAGE, Subjects.ADMIN)).toBe(true);
    expect(ability.can(Actions.VIEW, Subjects.COFFRE)).toBe(true);
    expect(ability.can(Actions.DISBURSE_CASH, Subjects.CREDIT)).toBe(true);
  });

  it('all modules should be visible for admin', () => {
    const adminRules: CaslRule[] = [
      { action: Actions.MANAGE, subject: Subjects.ALL },
    ];

    expect(isModuleVisible(adminRules, Subjects.CREDITS)).toBe(true);
    expect(isModuleVisible(adminRules, Subjects.CLIENTS)).toBe(true);
    expect(isModuleVisible(adminRules, Subjects.CAISSE)).toBe(true);
    expect(isModuleVisible(adminRules, Subjects.ADMIN)).toBe(true);
    expect(isModuleVisible(adminRules, Subjects.COFFRE)).toBe(true);
    expect(isModuleVisible(adminRules, Subjects.COMPTABILITE)).toBe(true);
  });
});

// ============================================================================
// Critical Permission Pattern Tests
// ============================================================================

describe('API-01: Critical Permissions', () => {
  it('coffre permissions should require explicit grant', () => {
    const basicRules = buildRulesFromPermissionCodes(['clients.view', 'credits.view']);

    expect(canWithRules(basicRules, Actions.VIEW, Subjects.COFFRE)).toBe(false);
    expect(canWithRules(basicRules, Actions.MANAGE, Subjects.COFFRE)).toBe(false);
  });

  it('coffre.view should only grant view, not manage', () => {
    const rules = buildRulesFromPermissionCodes(['coffre.view']);

    expect(canWithRules(rules, Actions.VIEW, Subjects.COFFRE)).toBe(true);
    expect(canWithRules(rules, Actions.MANAGE, Subjects.COFFRE)).toBe(false);
  });

  it('paiements permissions should require explicit grant', () => {
    const basicRules = buildRulesFromPermissionCodes(['caisse.view']);

    // Paiements are separate from caisse
    expect(canWithRules(basicRules, Actions.VIEW, Subjects.PAIEMENT_TERRAIN)).toBe(false);
  });
});
