import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Lock, Unlock, AlertTriangle, CheckCircle, Shield, Power, RefreshCw,
  Search, Grid3X3, List, ChevronDown, ChevronUp, LockOpen
} from 'lucide-react';
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
      toast.error(handleApiError(error, 'Erreur lors du chargement'));
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
        "group relative p-3 rounded-lg border transition-all cursor-pointer",
        module.isLocked
          ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
          : "bg-slate-800/30 border-slate-700/50 hover:border-emerald-500/40"
      )}
      onClick={() => toggleModuleLock(module.id, module.isLocked, module.moduleName)}
    >
      <div className="flex items-center gap-2.5">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          module.isLocked ? "bg-amber-500/20" : "bg-emerald-500/20"
        )}>
          {module.isLocked ? (
            <Lock size={14} className="text-amber-400" />
          ) : (
            <CheckCircle size={14} className="text-emerald-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{module.moduleName}</p>
          <p className={cn(
            "text-[10px] mt-0.5",
            module.isLocked ? "text-amber-400/70" : "text-emerald-400/70"
          )}>
            {module.isLocked ? 'Verrouillé' : 'Actif'}
          </p>
        </div>
        <div className={cn(
          "w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
          module.isLocked ? "bg-emerald-500/20" : "bg-amber-500/20"
        )}>
          {module.isLocked ? (
            <Unlock size={12} className="text-emerald-400" />
          ) : (
            <Lock size={12} className="text-amber-400" />
          )}
        </div>
      </div>
      {module.isLocked && module.reason && (
        <p className="text-[10px] text-slate-500 mt-2 truncate pl-10">{module.reason}</p>
      )}
    </div>
  );

  // Module List Item Component
  const ModuleListItem = ({ module }: { module: MaintenanceModule }) => (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-all",
        module.isLocked
          ? "bg-amber-500/5 border-amber-500/20"
          : "bg-slate-800/30 border-slate-700/50"
      )}
    >
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
          module.isLocked ? "bg-amber-500/20" : "bg-emerald-500/20"
        )}>
          {module.isLocked ? (
            <Lock size={12} className="text-amber-400" />
          ) : (
            <CheckCircle size={12} className="text-emerald-400" />
          )}
        </div>
        <span className="text-xs font-medium text-white truncate">{module.moduleName}</span>
        {module.reason && (
          <span className="text-[10px] text-slate-500 truncate hidden sm:inline">- {module.reason}</span>
        )}
      </div>
      <button
        onClick={() => toggleModuleLock(module.id, module.isLocked, module.moduleName)}
        disabled={saving || platformModule?.isLocked}
        className={cn(
          "px-2.5 py-1 text-[10px] font-medium rounded-md border transition-all flex items-center gap-1.5",
          module.isLocked
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
            : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {module.isLocked ? <Unlock size={10} /> : <Lock size={10} />}
        {module.isLocked ? 'Déverr.' : 'Verr.'}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Compact Header with Stats */}
      <div className="bg-linear-to-r from-blue-600/90 to-emerald-600/90 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Mode Maintenance</h2>
              <p className="text-[11px] text-blue-100/80">Gestion des accès modules</p>
            </div>
          </div>

          {/* Inline Stats */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{modules.length}</p>
              <p className="text-[9px] text-blue-100/70 uppercase">Total</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-amber-300">{lockedCount}</p>
              <p className="text-[9px] text-blue-100/70 uppercase">Verrouillés</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-300">{activeCount}</p>
              <p className="text-[9px] text-blue-100/70 uppercase">Actifs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Lock Control - Prominent */}
      {platformModule && (
        <Card className={cn(
          "p-3 border-2",
          platformModule.isLocked
            ? "bg-red-950/30 border-red-500/40"
            : "bg-slate-900/50 border-slate-700"
        )}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                platformModule.isLocked ? "bg-red-500/20" : "bg-emerald-500/20"
              )}>
                <Power size={18} className={platformModule.isLocked ? "text-red-400" : "text-emerald-400"} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {platformModule.isLocked ? 'PLATEFORME VERROUILLÉE' : 'Plateforme Opérationnelle'}
                </h3>
                {platformModule.isLocked && platformModule.reason && (
                  <p className="text-[10px] text-red-400/70 mt-0.5">{platformModule.reason}</p>
                )}
              </div>
            </div>
            <Button
              variant={platformModule.isLocked ? 'success' : 'danger'}
              size="sm"
              onClick={togglePlatformLock}
              disabled={saving}
              className="h-8 px-3 text-xs"
            >
              {platformModule.isLocked ? (
                <><Unlock size={14} className="mr-1.5" /> Débloquer</>
              ) : (
                <><Lock size={14} className="mr-1.5" /> Bloquer Tout</>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* Toolbar: Search + Actions + View Toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un module..."
            className="w-full h-9 pl-9 pr-3 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={bulkUnlockAll}
            disabled={saving || lockedCount === 0}
            className="h-9 px-3 flex items-center gap-1.5 text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LockOpen size={12} />
            Tout débloquer
          </button>
          <button
            onClick={bulkLockAll}
            disabled={saving || activeCount === 0}
            className="h-9 px-3 flex items-center gap-1.5 text-[11px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Lock size={12} />
            Tout bloquer
          </button>
        </div>

        {/* View Toggle */}
        <div className="flex items-center bg-slate-800/50 border border-slate-700 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
              viewMode === 'grid' ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            <Grid3X3 size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
              viewMode === 'list' ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
            )}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowLocked(!showLocked)}
          className={cn(
            "h-7 px-3 flex items-center gap-1.5 text-[10px] font-medium rounded-full border transition-colors",
            showLocked
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
              : "bg-slate-800/50 border-slate-700 text-slate-500"
          )}
        >
          <Lock size={10} />
          Verrouillés ({lockedCount})
        </button>
        <button
          onClick={() => setShowActive(!showActive)}
          className={cn(
            "h-7 px-3 flex items-center gap-1.5 text-[10px] font-medium rounded-full border transition-colors",
            showActive
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
              : "bg-slate-800/50 border-slate-700 text-slate-500"
          )}
        >
          <CheckCircle size={10} />
          Actifs ({activeCount})
        </button>
        {searchQuery && (
          <span className="text-[10px] text-slate-500 ml-2">
            {filteredModules.length} résultat(s)
          </span>
        )}
      </div>

      {/* Modules Display */}
      {filteredModules.length === 0 ? (
        <Card className="bg-slate-900/50 border-slate-800 p-8">
          <div className="text-center text-slate-500">
            <Shield size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Aucun module trouvé</p>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filteredModules.map((module) => (
            <ModuleCard key={module.id} module={module} />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredModules.map((module) => (
            <ModuleListItem key={module.id} module={module} />
          ))}
        </div>
      )}

      {/* Important Note - Compact Footer */}
      <div className="flex items-center gap-2 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
        <AlertTriangle size={14} className="text-amber-400 shrink-0" />
        <p className="text-[10px] text-amber-300/80">
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Raison du verrouillage
            </label>
            <input
              type="text"
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="Ex: Maintenance planifiée..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:border-indigo-500 outline-none"
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default AdminMaintenanceMode;
