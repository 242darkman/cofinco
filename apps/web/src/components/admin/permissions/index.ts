/**
 * Admin Permissions Components
 * ===========================
 *
 * Export all permission-related admin components.
 */

// Core managers
export { default as RolesPermissionsManager } from './RolesPermissionsManager';
export { default as UserCustomPermissionsManager } from './UserCustomPermissionsManager';
export { default as ModulePermissionsView } from './ModulePermissionsView';
export { default as TemporaryPermissionsManager } from './TemporaryPermissionsManager';
export { default as PermissionAnalyticsDashboard } from './PermissionAnalyticsDashboard';

// Enhanced RBAC components
export { default as PermissionSourceBadge } from './PermissionSourceBadge';
export type { PermissionSource, PermissionSourceBadgeProps } from './PermissionSourceBadge';
export { PERMISSION_SOURCE_LABELS, PERMISSION_SOURCE_COLORS } from './PermissionSourceBadge';

export { default as PermissionExplanationModal } from './PermissionExplanationModal';
export { default as CriticalPermissionReasonDialog } from './CriticalPermissionReasonDialog';
export { default as EnhancedPermissionRow } from './EnhancedPermissionRow';
export type { EnhancedPermissionData } from './EnhancedPermissionRow';

export { default as RbacAuditHistoryViewer } from './RbacAuditHistoryViewer';
export { default as RoleHierarchyTree } from './RoleHierarchyTree';
export { default as CriticalPatternsManager } from './CriticalPatternsManager';
export { default as ConditionTemplatesManager } from './ConditionTemplatesManager';
export { default as PermissionSimulator } from './PermissionSimulator';
export { default as ModulePermissionsEditor } from './ModulePermissionsEditor';
export { default as PermissionRequestsManager } from './PermissionRequestsManager';
export { default as PermissionRequestForm } from './PermissionRequestForm';
