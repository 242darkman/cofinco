/**
 * Enhanced Permission Row Component
 * ==================================
 *
 * A permission row with:
 * - Visual toggle for granted/denied state
 * - Source badge (ROLE, OVERRIDE+, OVERRIDE-, TEMPORARY)
 * - "Why?" button for explanation
 * - Critical permission handling with reason dialog
 */

import React, { useState, useCallback } from 'react';
import { HelpCircle, Loader2, Sparkles, RotateCcw, AlertTriangle } from 'lucide-react';
import PermissionSourceBadge, { type PermissionSource } from './PermissionSourceBadge';
import PermissionExplanationModal from './PermissionExplanationModal';
import CriticalPermissionReasonDialog from './CriticalPermissionReasonDialog';
import { useTogglePermissionWithReason, useCriticalPermissionCheck } from '@/hooks/admin/useRbacAudit';
import { toast } from '@/lib/toast';

export interface EnhancedPermissionData {
  id: string;
  code: string;
  name: string;
  description?: string;
  granted: boolean;
  source: PermissionSource;
  sourceRole?: string;
  sourceAgenceId?: string | null;
}

interface EnhancedPermissionRowProps {
  permission: EnhancedPermissionData;
  userId: string;
  userName: string;
  agenceId?: string;
  onToggle?: () => void; // Called after successful toggle
  disabled?: boolean;
}

export default function EnhancedPermissionRow({
  permission,
  userId,
  userName,
  agenceId,
  onToggle,
  disabled = false,
}: EnhancedPermissionRowProps) {
  // State
  const [showExplanation, setShowExplanation] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<'grant' | 'deny' | 'reset' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [wasRecentlyToggled, setWasRecentlyToggled] = useState(false);

  // Hooks
  const { togglePermission, loading: toggleLoading } = useTogglePermissionWithReason();
  const { isCritical, requiresReason } = useCriticalPermissionCheck(permission.code);

  // Determine if this is an override
  const isOverride = permission.source === 'OVERRIDE_GLOBAL' || permission.source === 'OVERRIDE_AGENCE';
  const isTemporary = permission.source === 'TEMPORARY';
  const isFromRole = permission.source === 'ROLE';

  // Handle toggle click
  const handleToggleClick = useCallback(async () => {
    if (disabled || isLoading || toggleLoading) return;

    const newGranted = !permission.granted;
    const action = newGranted ? 'grant' : 'deny';

    // If critical and requires reason, show dialog
    if (isCritical && requiresReason) {
      setPendingAction(action);
      setShowReasonDialog(true);
      return;
    }

    // Otherwise, toggle directly
    await performToggle(newGranted, undefined);
  }, [permission.granted, isCritical, requiresReason, disabled, isLoading, toggleLoading]);

  // Handle reset to role
  const handleResetClick = useCallback(async () => {
    if (disabled || isLoading || toggleLoading) return;

    // If critical and requires reason, show dialog
    if (isCritical && requiresReason) {
      setPendingAction('reset');
      setShowReasonDialog(true);
      return;
    }

    // Otherwise, reset directly (pass null to remove override)
    await performToggle(null, undefined);
  }, [isCritical, requiresReason, disabled, isLoading, toggleLoading]);

  // Perform the actual toggle
  const performToggle = async (granted: boolean | null, reason?: string) => {
    setIsLoading(true);
    try {
      await togglePermission(userId, permission.code, granted, {
        reason,
        scope: agenceId ? 'AGENCE' : 'GLOBAL',
        agenceId,
      });

      // Success feedback
      setWasRecentlyToggled(true);
      setTimeout(() => setWasRecentlyToggled(false), 1500);

      // Call parent callback
      onToggle?.();

      // Close dialog if open
      setShowReasonDialog(false);
      setPendingAction(null);
    } catch (error) {
      // Error is already handled by the hook with toast
      console.error('Toggle error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle reason dialog confirmation
  const handleReasonConfirm = async (reason: string) => {
    if (pendingAction === 'reset') {
      await performToggle(null, reason);
    } else if (pendingAction === 'grant') {
      await performToggle(true, reason);
    } else if (pendingAction === 'deny') {
      await performToggle(false, reason);
    }
  };

  // Determine row styling based on state
  let borderColor = 'border-slate-800/50';
  let bgHover = 'hover:bg-slate-800/40';

  if (isOverride) {
    if (permission.granted) {
      borderColor = 'border-emerald-500/30';
      bgHover = 'bg-emerald-500/5 hover:bg-emerald-500/10';
    } else {
      borderColor = 'border-rose-500/30';
      bgHover = 'bg-rose-500/5 hover:bg-rose-500/10';
    }
  } else if (isTemporary) {
    borderColor = 'border-amber-500/30';
    bgHover = 'bg-amber-500/5 hover:bg-amber-500/10';
  }

  const loading = isLoading || toggleLoading;

  return (
    <>
      <div
        className={`
          flex items-center justify-between px-2 py-1.5 rounded border transition-all duration-200 group
          ${borderColor} ${bgHover}
          ${wasRecentlyToggled ? 'bg-indigo-500/10 scale-[1.01]' : ''}
          ${loading ? 'opacity-70' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {/* Left: Permission Info */}
        <div className="flex-1 min-w-0 pr-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Permission Name */}
            <span
              className={`text-[10px] font-medium transition-colors truncate ${
                permission.granted ? 'text-white' : 'text-slate-400'
              }`}
            >
              {permission.name}
            </span>

            {/* Recently Toggled Indicator */}
            {wasRecentlyToggled && (
              <Sparkles size={8} className="text-indigo-400 animate-pulse shrink-0" />
            )}

            {/* Critical Indicator */}
            {isCritical && (
              <AlertTriangle size={8} className="text-amber-400 shrink-0" title="Permission critique" />
            )}

            {/* Source Badge */}
            <PermissionSourceBadge
              source={permission.source}
              granted={permission.granted}
              sourceRole={permission.sourceRole}
              sourceAgenceId={permission.sourceAgenceId || undefined}
              compact
            />
          </div>

          {/* Permission Code */}
          <code className="text-[8px] text-slate-600 font-mono block truncate">
            {permission.code}
          </code>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Why Button */}
          <button
            onClick={() => setShowExplanation(true)}
            title="Pourquoi cette permission ?"
            className="p-0.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
          >
            <HelpCircle size={12} />
          </button>

          {/* Toggle */}
          {loading ? (
            <div className="w-7 h-4 flex items-center justify-center">
              <Loader2 size={10} className="animate-spin text-indigo-400" />
            </div>
          ) : (
            <div
              onClick={!disabled ? handleToggleClick : undefined}
              className={`
                w-7 h-3.5 rounded-full relative transition-colors
                ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
                ${isOverride || isTemporary
                  ? (permission.granted ? 'bg-amber-500' : 'bg-rose-500')
                  : (permission.granted ? 'bg-indigo-600' : 'bg-slate-600/50')
                }
              `}
            >
              <div
                className="absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all shadow-sm"
                style={{ left: permission.granted ? 'calc(100% - 12px)' : '2px' }}
              />
            </div>
          )}

          {/* Reset Button (only for overrides) */}
          {isOverride && !loading && !disabled && (
            <button
              onClick={handleResetClick}
              title="Rétablir au rôle"
              className="p-0.5 text-slate-500 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
            >
              <RotateCcw size={9} />
            </button>
          )}
        </div>
      </div>

      {/* Explanation Modal */}
      <PermissionExplanationModal
        isOpen={showExplanation}
        onClose={() => setShowExplanation(false)}
        userId={userId}
        userName={userName}
        permissionCode={permission.code}
        permissionName={permission.name}
        agenceId={agenceId}
      />

      {/* Critical Permission Reason Dialog */}
      <CriticalPermissionReasonDialog
        isOpen={showReasonDialog}
        onClose={() => {
          setShowReasonDialog(false);
          setPendingAction(null);
        }}
        onConfirm={handleReasonConfirm}
        permissionCode={permission.code}
        permissionName={permission.name}
        action={pendingAction || 'grant'}
        isSubmitting={loading}
      />
    </>
  );
}
