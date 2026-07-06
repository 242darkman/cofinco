import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Lock, Unlock, AlertTriangle, CheckCircle, Shield, Power, RefreshCw,
  Search, Grid3X3, List, ChevronDown, ChevronUp, LockOpen,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight
} from 'lucide-react';
import { usePagination } from '../../hooks/usePagination';
import { Card, Button, Badge, LoadingSpinner } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { maintenanceApi, authApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { cn } from '../../lib/utils';

interface MaintenanceModule {
  id: string;
  moduleName: string;
  isLocked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  reason: string | null;
  platformWide: boolean;
  updatedAt: string;
}

type ViewMode = 'grid' | 'list';

const AdminMaintenanceMode: React.FC = () => {
  const [modules, setModules] = useState<MaintenanceModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [platformModule, setPlatformModule] = useState<MaintenanceModule | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [lockReason, setLockReason] = useState('');
  const [pendingModuleId, setPendingModuleId] = useState<string | null>(null);
  const [pendingModuleName, setPendingModuleName] = useState<string>('');
  const [pendingLockStatus, setPendingLockStatus] = useState(false);

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showLocked, setShowLocked] = useState(true);
  const [showActive, setShowActive] = useState(true);

  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const getCurrentUser = useCallback(async () => {
    try {
      const data = await authApi.me();
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    } catch (error) {
      // Silent fail
    }
  }, []);

  const loadMaintenanceStatus = useCallback(async () => {
    try {
      const data = await maintenanceApi.getStatus();
      if (data) {
        const platform = data.find((m: MaintenanceModule) => m.moduleName === 'PLATFORM');
        const otherModules = data.filter((m: MaintenanceModule) => m.moduleName !== 'PLATFORM');
        setPlatformModule(platform || null);
        setModules(otherModules);
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement du statut de maintenance'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaintenanceStatus();
    getCurrentUser();

    const handleMaintenanceUpdate = () => loadMaintenanceStatus();
    window.addEventListener('maintenance-update', handleMaintenanceUpdate);
    return () => window.removeEventListener('maintenance-update', handleMaintenanceUpdate);
  }, [loadMaintenanceStatus, getCurrentUser]);

  // Filtered modules
  const filteredModules = useMemo(() => {
    return modules.filter(m => {
      const matchesSearch = m.moduleName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = (m.isLocked && showLocked) || (!m.isLocked && showActive);
      return matchesSearch && matchesStatus;
    });
  }, [modules, searchQuery, showLocked, showActive]);

  const lockedModules = useMemo(() => filteredModules.filter(m => m.isLocked), [filteredModules]);
  const activeModules = useMemo(() => filteredModules.filter(m => !m.isLocked), [filteredModules]);

  const lockedCount = modules.filter(m => m.isLocked).length;
  const activeCount = modules.filter(m => !m.isLocked).length;

  // Pagination
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const { currentPage, totalPages, goToPage, paginateArray } = usePagination({
    totalItems: filteredModules.length,
    itemsPerPage,
    initialPage: 1
  });

  const paginatedModules = paginateArray(filteredModules);

  const executeModuleLock = useCallback(async (moduleId: string, newStatus: boolean, moduleName: string, reason: string | null) => {
    setSaving(true);
    try {
      await maintenanceApi.toggleModule(moduleId, { is_locked: newStatus, reason });
      await loadMaintenanceStatus();
      toast.success(`${moduleName} ${newStatus ? 'verrouillé' : 'déverrouillé'}`);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur'));
    } finally {
      setSaving(false);
      setPendingModuleId(null);
      setLockReason('');
    }
  }, [loadMaintenanceStatus]);

  const toggleModuleLock = useCallback((moduleId: string, currentStatus: boolean, moduleName: string) => {
    const newStatus = !currentStatus;
    if (newStatus) {
      setPendingModuleId(moduleId);
      setPendingModuleName(moduleName);
      setPendingLockStatus(newStatus);
      openConfirm({
        title: `Verrouiller ${moduleName} ?`,
        message: 'Indiquez une raison pour le verrouillage.',
        variant: 'warning',
        confirmText: 'Verrouiller',
        onConfirm: () => {
          if (lockReason) {
            executeModuleLock(moduleId, newStatus, moduleName, lockReason);
          } else {
            toast.warning('Raison requise');
          }
        },
      });
    } else {
      executeModuleLock(moduleId, newStatus, moduleName, null);
    }
  }, [openConfirm, executeModuleLock, lockReason]);

  // Bulk actions
  const bulkLockAll = useCallback(() => {
    openConfirm({
      title: 'Verrouiller tous les modules ?',
      message: `${activeCount} modules seront verrouillés.`,
      variant: 'danger',
      confirmText: 'Tout verrouiller',
      onConfirm: async () => {
        if (!lockReason) {
          toast.warning('Raison requise');
          return;
        }
        setSaving(true);
        try {
          for (const mod of modules.filter(m => !m.isLocked)) {
            await maintenanceApi.toggleModule(mod.id, { is_locked: true, reason: lockReason });
          }
          await loadMaintenanceStatus();
          toast.success('Tous les modules verrouillés');
          setLockReason('');
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur'));
        } finally {
          setSaving(false);
        }
      },
    });
  }, [activeCount, modules, lockReason, openConfirm, loadMaintenanceStatus]);

  const bulkUnlockAll = useCallback(() => {
    openConfirm({
      title: 'Déverrouiller tous les modules ?',
      message: `${lockedCount} modules seront déverrouillés.`,
      variant: 'warning',
      confirmText: 'Tout déverrouiller',
      onConfirm: async () => {
        setSaving(true);
        try {
          for (const mod of modules.filter(m => m.isLocked)) {
            await maintenanceApi.toggleModule(mod.id, { is_locked: false, reason: null });
          }
          await loadMaintenanceStatus();
          toast.success('Tous les modules déverrouillés');
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur'));
        } finally {
          setSaving(false);
        }
      },
    });
  }, [lockedCount, modules, openConfirm, loadMaintenanceStatus]);

  const togglePlatformLock = useCallback(() => {
    if (!platformModule) return;
    const newStatus = !platformModule.isLocked;

    openConfirm({
      title: newStatus ? 'Verrouiller TOUTE la plateforme ?' : 'Déverrouiller la plateforme ?',
      message: newStatus
        ? 'ATTENTION: Tous les utilisateurs seront bloqués.'
        : 'La plateforme sera accessible.',
      variant: newStatus ? 'danger' : 'warning',
      confirmText: newStatus ? 'Verrouiller Tout' : 'Déverrouiller',
      onConfirm: async () => {
        if (newStatus && !lockReason) {
          toast.warning('Raison requise');
          return;
        }
        setSaving(true);
        try {
          await maintenanceApi.togglePlatform(platformModule.id, {
            action: newStatus ? 'lock' : 'unlock',
            user_id: currentUserId,
            reason: newStatus ? lockReason : null
          });
          await loadMaintenanceStatus();
          toast.success(`Plateforme ${newStatus ? 'verrouillée' : 'déverrouillée'}`);
          setLockReason('');
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur'));
        } finally {
          setSaving(false);
        }
      },
    });
  }, [platformModule, currentUserId, lockReason, openConfirm, loadMaintenanceStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Module Card Component
  const ModuleCard = ({ module }: { module: MaintenanceModule }) => (
    <div
      className={cn(
        "group relative p-2 rounded-lg border transition-all cursor-pointer",
        module.isLocked
          ? "bg-status-warning/5 border-status-warning/20 hover:border-status-warning/40"
          : "bg-surface/30 border-edge-subtle hover:border-status-success/40"
      )}
      onClick={() => toggleModuleLock(module.id, module.isLocked, module.moduleName)}
    >
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-6 h-6 rounded flex items-center justify-center shrink-0",
          module.isLocked ? "bg-status-warning-bg" : "bg-status-success-bg"
        )}>
          {module.isLocked ? (
            <Lock size={12} className="text-status-warning" />
          ) : (
            <CheckCircle size={12} className="text-status-success" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-content-primary truncate">{module.moduleName}</p>
          <p className={cn(
            "text-[9px] -mt-0.5",
            module.isLocked ? "text-status-warning/70" : "text-status-success/70"
          )}>
            {module.isLocked ? 'Verrouillé' : 'Actif'}
          </p>
        </div>
        <div className={cn(
          "w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
          module.isLocked ? "bg-status-success-bg" : "bg-status-warning-bg"
        )}>
          {module.isLocked ? (
            <Unlock size={10} className="text-status-success" />
          ) : (
            <Lock size={10} className="text-status-warning" />
          )}
        </div>
      </div>
      {module.isLocked && module.reason && (
        <p className="text-[9px] text-content-muted mt-1 truncate pl-8">{module.reason}</p>
      )}
    </div>
  );

  // Module List Item Component - Compact
  const ModuleListItem = ({ module }: { module: MaintenanceModule }) => (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border transition-all",
        module.isLocked
          ? "bg-status-warning/5 border-status-warning/20"
          : "bg-surface/30 border-edge-subtle"
      )}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className={cn(
          "w-6 h-6 rounded flex items-center justify-center shrink-0",
          module.isLocked ? "bg-status-warning-bg" : "bg-status-success-bg"
        )}>
          {module.isLocked ? (
            <Lock size={10} className="text-status-warning" />
          ) : (
            <CheckCircle size={10} className="text-status-success" />
          )}
        </div>
        <span className="text-xs font-medium text-content-primary truncate">{module.moduleName}</span>
        {module.reason && (
          <span className="text-[10px] text-content-muted truncate hidden sm:inline">- {module.reason}</span>
        )}
      </div>
      <button
        onClick={() => toggleModuleLock(module.id, module.isLocked, module.moduleName)}
        disabled={saving || platformModule?.isLocked}
        className={cn(
          "px-2 py-1 text-[10px] font-medium rounded-md border transition-all flex items-center gap-1.5",
          module.isLocked
            ? "bg-status-success-bg border-status-success/30 text-status-success hover:bg-status-success-bg"
            : "bg-status-warning-bg border-status-warning/30 text-status-warning hover:bg-status-warning-bg",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {module.isLocked ? <Unlock size={10} /> : <Lock size={10} />}
        {module.isLocked ? 'Déverr.' : 'Verr.'}
      </button>
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Compact Header with Stats */}
      <div className="bg-linear-to-r from-status-info to-status-success rounded-lg p-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-white/20 rounded-md">
              <Shield size={16} className="text-content-primary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-content-primary leading-none">Maintenance</h2>
              <p className="text-[10px] text-status-info-text leading-tight mt-0.5">Gestion des accès</p>
            </div>
          </div>

          {/* Inline Stats */}
          <div className="flex items-center gap-3 bg-black/10 px-3 py-1 rounded-full backdrop-blur-sm">
            <div className="text-center">
              <span className="text-sm font-bold text-content-primary">{modules.length}</span>
              <span className="text-[9px] text-status-info-text ml-1">Total</span>
            </div>
            <div className="w-px h-3 bg-white/20" />
            <div className="text-center">
              <span className="text-sm font-bold text-status-warning">{lockedCount}</span>
              <span className="text-[9px] text-status-warning-text/80 ml-1">Lock</span>
            </div>
            <div className="w-px h-3 bg-white/20" />
            <div className="text-center">
              <span className="text-sm font-bold text-status-success">{activeCount}</span>
              <span className="text-[9px] text-status-success-text/80 ml-1">Actifs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Lock Control - Compact */}
      {platformModule && (
        <Card className={cn(
          "p-2 border",
          platformModule.isLocked
            ? "bg-status-danger-bg border-status-danger/30"
            : "bg-surface-base/50 border-edge-subtle"
        )}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                "p-1.5 rounded-md",
                platformModule.isLocked ? "bg-status-danger-bg" : "bg-status-success-bg"
              )}>
                <Power size={14} className={platformModule.isLocked ? "text-status-danger" : "text-status-success"} />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
                <h3 className="text-xs font-bold text-content-primary">
                  {platformModule.isLocked ? 'PLATEFORME VERROUILLÉE' : 'Plateforme Opérationnelle'}
                </h3>
                {platformModule.isLocked && platformModule.reason && (
                  <span className="text-[10px] text-status-danger/70">{platformModule.reason}</span>
                )}
              </div>
            </div>
            <Button
              variant={platformModule.isLocked ? 'success' : 'danger'}
              size="sm"
              onClick={togglePlatformLock}
              disabled={saving}
              className="h-7 px-2.5 text-[10px]"
            >
              {platformModule.isLocked ? (
                <><Unlock size={12} className="mr-1.5" /> Débloquer</>
              ) : (
                <><Lock size={12} className="mr-1.5" /> Bloquer Tout</>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Toolbar: Search + Actions + View Toggle */}
      <div className="flex flex-col sm:flex-row gap-2 shrink-0">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="w-full h-8 pl-8 pr-3 bg-surface/50 border border-edge rounded-md text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Filter Chips - Compact */}
        <div className="flex items-center gap-1.5 bg-surface/30 p-1 rounded-md border border-edge-subtle">
          <button
            onClick={() => setShowLocked(!showLocked)}
            className={cn(
              "h-6 px-2 flex items-center gap-1 text-[10px] font-medium rounded transition-colors",
              showLocked
                ? "bg-status-warning-bg text-status-warning"
                : "text-content-muted hover:text-content-secondary"
            )}
          >
            <Lock size={10} />
            {lockedCount}
          </button>
          <button
            onClick={() => setShowActive(!showActive)}
            className={cn(
              "h-6 px-2 flex items-center gap-1 text-[10px] font-medium rounded transition-colors",
              showActive
                ? "bg-status-success-bg text-status-success"
                : "text-content-muted hover:text-content-secondary"
            )}
          >
            <CheckCircle size={10} />
            {activeCount}
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-surface/50 border border-edge rounded-md p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded transition-colors",
              viewMode === 'grid' ? "bg-accent text-white" : "text-content-muted hover:text-white"
            )}
          >
            <Grid3X3 size={12} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded transition-colors",
              viewMode === 'list' ? "bg-accent text-white" : "text-content-muted hover:text-white"
            )}
          >
            <List size={12} />
          </button>
        </div>

        {/* Bulk Actions Dropdown Trigger (Simplified for compactness if needed, or keep buttons) */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={bulkUnlockAll}
            disabled={saving || lockedCount === 0}
            className="h-8 w-8 flex items-center justify-center bg-status-success-bg border border-status-success/30 text-status-success rounded-md hover:bg-status-success-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Tout débloquer"
          >
            <LockOpen size={14} />
          </button>
          <button
            onClick={bulkLockAll}
            disabled={saving || activeCount === 0}
            className="h-8 w-8 flex items-center justify-center bg-status-warning-bg border border-status-warning/30 text-status-warning rounded-md hover:bg-status-warning-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Tout bloquer"
          >
            <Lock size={14} />
          </button>
        </div>
      </div>

      {/* Modules Display */}
      {filteredModules.length === 0 ? (
        <Card className="bg-surface-base/50 border-edge p-8">
          <div className="text-center text-content-muted">
            <Shield size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun module trouvé</p>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 flex-1 min-h-0 overflow-y-auto">
          {paginatedModules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {paginatedModules.map((module) => (
            <ModuleListItem key={module.id} module={module} />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-2 border-t border-edge bg-surface/30 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-b-lg">
          <div className="flex items-center gap-3 text-xs text-content-muted">
            <span className="hidden sm:inline">
              {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredModules.length)} sur {filteredModules.length}
            </span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                goToPage(1);
              }}
              className="px-2 py-1 bg-surface-base border border-edge rounded text-[10px] text-content-secondary focus:border-accent outline-none"
            >
              <option value={8}>8 / page</option>
              <option value={12}>12 / page</option>
              <option value={24}>24 / page</option>
              <option value={48}>48 / page</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-content-muted font-medium px-2">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-surface-elevated text-content-muted hover:text-content-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Important Note - Compact Footer */}
      <div className="flex items-center gap-2 p-2.5 bg-status-warning/5 border border-status-warning/20 rounded-lg">
        <AlertTriangle size={14} className="text-status-warning shrink-0" />
        <p className="text-[10px] text-status-warning/80">
          Le verrouillage empêche l'accès aux utilisateurs non-admin.
        </p>
      </div>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      >
        {(pendingModuleId || (platformModule && !platformModule.isLocked) || activeCount > 0) && confirmState.isOpen && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-content-muted mb-1.5">
              Raison du verrouillage
            </label>
            <input
              type="text"
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="Ex: Maintenance planifiée..."
              className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent outline-none"
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default AdminMaintenanceMode;
