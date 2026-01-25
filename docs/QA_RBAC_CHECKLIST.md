# RBAC System - QA Checklist

## 1. Permission Catalog API

### GET /api/rbac/catalog
- [ ] Returns all permission codes organized by module
- [ ] Returns totalPermissions count
- [ ] Accessible only to users with `manage` permission on `rbac` subject
- [ ] Returns 403 for unauthorized users

### GET /api/rbac/version
- [ ] Returns current RBAC version number
- [ ] Version increments after any permission change

---

## 2. Role Permissions Management

### GET /api/rbac/roles/:role/permissions
- [ ] Returns permissions for specified role
- [ ] Returns `permissionCodes` array
- [ ] Returns `caslRules` array
- [ ] Returns `isAdmin` boolean
- [ ] Works for all SystemRole values (ADMIN, DIRECTEUR, COMPTABLE, etc.)

### PATCH /api/rbac/roles/:role/permissions
- [ ] Toggle single permission on/off for a role
- [ ] Returns new RBAC version
- [ ] Broadcasts `rbac:update` WebSocket event with scope: 'role'
- [ ] All users with that role see their UI update in real-time
- [ ] Permission persists after page refresh

### PUT /api/rbac/roles/:role/permissions/bulk
- [ ] Update multiple permissions at once
- [ ] Handles `grant: []` and `revoke: []` arrays
- [ ] Returns new RBAC version
- [ ] Broadcasts single WebSocket event (not one per permission)

---

## 3. User Permission Overrides

### GET /api/rbac/users/:userId/overrides
- [ ] Returns user's permission overrides
- [ ] Shows both `grant` and `deny` arrays
- [ ] Returns effective `permissionCodes` (role + overrides combined)
- [ ] Returns `caslRules` for the user

### PATCH /api/rbac/users/:userId/overrides
- [ ] Grant a permission to user (override role default)
- [ ] Deny a permission from user (override role grant)
- [ ] Returns new RBAC version
- [ ] Broadcasts `rbac:update` with scope: 'user' and correct userId
- [ ] Only affected user sees real-time update (not all users)

### POST /api/rbac/users/:userId/overrides/reset
- [ ] Removes all user-specific overrides
- [ ] User falls back to role permissions
- [ ] Returns count of deleted overrides
- [ ] Broadcasts update only to affected user

---

## 4. Real-Time Synchronization

### WebSocket Events
- [ ] `rbac:update` event dispatched on frontend
- [ ] Event includes `scope`, `role`, `userId`, `version`, `changed` fields
- [ ] PermissionsContext handles event and refreshes ability
- [ ] AbilityContext rebuilds CASL ability from new rules

### Cross-Tab Sync
- [ ] Opening same app in two browser tabs
- [ ] Changing permission in Tab A
- [ ] Tab B receives WebSocket event and updates
- [ ] Both tabs show consistent permissions state

### Kill Switch (User Suspension)
- [ ] When user status changed to SUSPENDED
- [ ] User receives toast "Compte suspendu"
- [ ] User is logged out after 1.5 seconds
- [ ] Session is invalidated server-side

---

## 5. Frontend UI Integration

### Permission-Based Rendering
- [ ] Components using `useCan('view', 'Credit')` render correctly
- [ ] Hidden UI elements appear when permission granted
- [ ] Visible UI elements hide when permission revoked
- [ ] No page refresh required for changes

### Role-Based Access
- [ ] Menu items filtered by user permissions
- [ ] Routes protected with `<Can>` component or hooks
- [ ] 403 page shown for unauthorized route access

### Agency Scoping
- [ ] `agenceIdActive` correctly populated in AbilityContext
- [ ] Agency-scoped permissions respected (e.g., can only view own agency's clients)

---

## 6. Backend Authorization

### requireAbility Middleware
- [ ] Routes protected with `requireAbility('create', 'Credit')` work
- [ ] Returns 403 with French error message for unauthorized
- [ ] Returns 401 for unauthenticated requests
- [ ] Works with `requireAnyAbility` for OR logic
- [ ] Works with `requireAllAbilities` for AND logic

### hasAbility Helper
- [ ] Conditional logic in handlers using `hasAbility(req, action, subject)`
- [ ] Returns correct boolean without blocking request

### Channel-Specific Disbursement
- [ ] `requireDisbursement()` checks channel-specific permissions
- [ ] Falls back to generic `disburse` permission if specific not found
- [ ] Cash, Account, Mobile Money channels all respected

---

## 7. Version Tracking & Cache

### Database Triggers
- [ ] `rbac_versions` table exists and initialized
- [ ] Version auto-increments on `role_permissions` changes
- [ ] Version auto-increments on `user_permissions` changes
- [ ] `last_change_type` and `last_change_entity` populated correctly

### Client-Side Version Check
- [ ] `rbacServerVersion` tracked in PermissionsContext
- [ ] Client detects when server version is ahead
- [ ] Forces refresh if version mismatch detected

---

## 8. Migration & Backwards Compatibility

### Legacy Event Support
- [ ] Both `rbac:update` (new) and `rbac-update` (legacy) events dispatched
- [ ] Old components using legacy event name still work
- [ ] No breaking changes for existing code

### requireRole Still Works
- [ ] Existing routes using `requireRole(['ADMIN'])` still function
- [ ] Admin bypass logic preserved
- [ ] Progressive migration path available

---

## 9. Edge Cases

### No Permissions
- [ ] User with no permissions sees empty/restricted UI
- [ ] No errors thrown, graceful degradation

### Admin Override
- [ ] SUPER_ADMIN bypasses all permission checks
- [ ] Admin with `manage: all` has full access

### Invalid Permission Codes
- [ ] Unknown permission codes ignored (no crash)
- [ ] Console warning logged for unknown codes

### Concurrent Updates
- [ ] Two admins editing same role simultaneously
- [ ] Version tracking prevents conflicts
- [ ] Last write wins, but all clients sync

### Session Expiry During RBAC Update
- [ ] If session expires during permission change
- [ ] User sees auth error, not permission error
- [ ] Redirect to login with appropriate message

---

## 10. Performance

### Initial Load
- [ ] `/api/my-permissions` returns in < 200ms
- [ ] AbilityContext builds ability in < 50ms

### Bulk Operations
- [ ] Bulk permission update (20+ permissions) completes in < 500ms
- [ ] Single WebSocket broadcast (not per-permission)

### Memory
- [ ] No memory leaks in PermissionsContext event listeners
- [ ] Cleanup on component unmount verified

---

## Test Scenarios

### Scenario 1: Grant Permission to Role
1. Login as SUPER_ADMIN
2. Navigate to "Gestion des accès" > "Par rôle"
3. Select role "CAISSIER"
4. Toggle permission "credits.disburse" ON
5. In another browser, login as a CAISSIER
6. Verify CAISSIER now sees disbursement button (no refresh)

### Scenario 2: User Exception
1. Login as SUPER_ADMIN
2. Navigate to "Gestion des accès" > "Exceptions"
3. Select a specific user with role COMPTABLE
4. Grant "tontines.manage" (not in COMPTABLE role by default)
5. Verify that specific user gains access to Tontines management
6. Verify other COMPTABLE users don't have access

### Scenario 3: Revoke Permission Live
1. Have two browser windows open
2. Window A: Login as DIRECTEUR
3. Window B: Login as SUPER_ADMIN
4. In Window B, revoke "reports.export" from DIRECTEUR role
5. Verify Window A's export button disappears without refresh
6. Verify toast notification appears for the DIRECTEUR

### Scenario 4: Suspend User
1. Login as SUPER_ADMIN in Admin panel
2. Have another browser logged in as target user
3. Change target user's status to SUSPENDED
4. Verify target user sees "Compte suspendu" toast
5. Verify target user is logged out
6. Verify target user cannot login again

---

## Sign-Off

| Tester | Date | Environment | Status |
|--------|------|-------------|--------|
|        |      |             |        |
|        |      |             |        |

## Notes

_Add any observations, bugs found, or suggestions here._
