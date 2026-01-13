import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, AlertTriangle, CheckCircle, Shield, Power, RefreshCw } from 'lucide-react';
import { Card, Button, Badge, StatCard, LoadingSpinner } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { maintenanceApi, authApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

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

  // Confirmation dialogs
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const getCurrentUser = useCallback(async () => {
    try {
      const data = await authApi.me();
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    } catch (error) {
      // Silent fail - user context optional
    }
  }, []);

  const loadMaintenanceStatus = useCallback(async () => {
    try {
      const data = await maintenanceApi.getStatus();

      if (data) {
        // Backend returns camelCase keys as defined in maintenance.ts route response (from Drizzle select)
        // If data comes as snake_case from DB directly via raw query, we might need adapter, 
        // but maintenanceRouter uses db.select().from(maintenanceModules) which returns camelCase properties from schema definition.
        
        const platform = data.find((m: MaintenanceModule) => m.moduleName === 'PLATFORM');
        const otherModules = data.filter((m: MaintenanceModule) => m.moduleName !== 'PLATFORM');

        setPlatformModule(platform || null);
        setModules(otherModules);
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement du statut maintenance'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMaintenanceStatus();
    getCurrentUser();

    // Listen for real-time updates
    const handleMaintenanceUpdate = () => {
      loadMaintenanceStatus();
    };
    
    window.addEventListener('maintenance-update', handleMaintenanceUpdate);
    
    return () => {
      window.removeEventListener('maintenance-update', handleMaintenanceUpdate);
    };
  }, [loadMaintenanceStatus, getCurrentUser]);

  const executeModuleLock = useCallback(async (moduleId: string, newStatus: boolean, moduleName: string, reason: string | null) => {
    setSaving(true);
    try {
      await maintenanceApi.toggleModule(moduleId, {
        is_locked: newStatus,
        reason: reason
      });

      await loadMaintenanceStatus();
      toast.success(`Module ${moduleName} ${newStatus ? 'verrouillé' : 'déverrouillé'} avec succès`);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la modification'));
    } finally {
      setSaving(false);
      setPendingModuleId(null);
      setLockReason('');
    }
  }, [currentUserId, loadMaintenanceStatus]);

  const toggleModuleLock = useCallback((moduleId: string, currentStatus: boolean, moduleName: string) => {
    const newStatus = !currentStatus;

    if (newStatus) {
      // Need reason for locking
      setPendingModuleId(moduleId);
      setPendingModuleName(moduleName);
      setPendingLockStatus(newStatus);
      openConfirm({
        title: `Verrouiller ${moduleName} ?`,
        message: 'Veuillez fournir une raison pour le verrouillage de ce module.',
        variant: 'warning',
        confirmText: 'Verrouiller',
        onConfirm: () => {
          if (lockReason) {
            executeModuleLock(moduleId, newStatus, moduleName, lockReason);
          } else {
            toast.warning('Veuillez fournir une raison pour le verrouillage');
          }
        },
      });
    } else {
      // Unlock directly
      executeModuleLock(moduleId, newStatus, moduleName, null);
    }
  }, [openConfirm, executeModuleLock, lockReason]);

  const togglePlatformLock = useCallback(() => {
    if (!platformModule) return;

    const newStatus = !platformModule.isLocked;

    if (newStatus) {
      openConfirm({
        title: 'Verrouiller TOUTE la plateforme ?',
        message: 'ATTENTION : Vous allez VERROUILLER TOUTE LA PLATEFORME. Tous les utilisateurs seront bloqués.',
        variant: 'danger',
        confirmText: 'Verrouiller Tout',
        onConfirm: async () => {
          if (!lockReason) {
            toast.warning('Veuillez fournir une raison pour le verrouillage');
            return;
          }
          setSaving(true);
          try {
            await maintenanceApi.togglePlatform(platformModule.id, {
              action: 'lock',
              user_id: currentUserId,
              reason: lockReason
            });
            await loadMaintenanceStatus();
            toast.success('Plateforme verrouillée avec succès');
            setLockReason('');
          } catch (error) {
            toast.error(handleApiError(error, 'Erreur lors du verrouillage'));
          } finally {
            setSaving(false);
          }
        },
      });
    } else {
      openConfirm({
        title: 'Déverrouiller la plateforme ?',
        message: 'La plateforme sera de nouveau accessible à tous les utilisateurs.',
        variant: 'warning',
        confirmText: 'Déverrouiller',
        onConfirm: async () => {
          setSaving(true);
          try {
            await maintenanceApi.togglePlatform(platformModule.id, {
              action: 'unlock',
              user_id: currentUserId,
              reason: null
            });
            await loadMaintenanceStatus();
            toast.success('Plateforme déverrouillée avec succès');
          } catch (error) {
            toast.error(handleApiError(error, 'Erreur lors du déverrouillage'));
          } finally {
            setSaving(false);
          }
        },
      });
    }
  }, [platformModule, currentUserId, lockReason, openConfirm, loadMaintenanceStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const lockedCount = modules.filter(m => m.isLocked).length;
  const activeCount = modules.filter(m => !m.isLocked).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner - Compact on mobile */}
      <Card className="bg-gradient-to-r from-blue-600 to-emerald-600 border-0 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-white/20 rounded-xl">
            <Shield size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-white">Mode Maintenance</h2>
            <p className="text-xs sm:text-sm text-blue-100 mt-0.5">
              Gérez le verrouillage de la plateforme et des modules individuels
            </p>
          </div>
        </div>
      </Card>

      {/* Stats Row - 3 columns, compact */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          title="Modules Total"
          value={modules.length}
          icon={Shield}
          color="primary"
          className="p-3 sm:p-4"
        />
        <StatCard
          title="Verrouillés"
          value={lockedCount}
          icon={Lock}
          color="warning"
          className="p-3 sm:p-4"
        />
        <StatCard
          title="Actifs"
          value={activeCount}
          icon={CheckCircle}
          color="success"
          className="p-3 sm:p-4"
        />
      </div>

      {/* Module Management Section */}
      <Card className="bg-slate-900 border-slate-800 p-0 overflow-hidden">
        <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center gap-2">
          <Lock size={18} className="text-slate-400" />
          <h3 className="font-bold text-white text-sm sm:text-base">Gestion des Modules</h3>
        </div>

        {/* Important Note - Compact */}
        <div className="mx-3 sm:mx-4 mt-3 sm:mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/90 leading-relaxed">
            <strong>Important:</strong> Le verrouillage d'un module empêche tous les utilisateurs (sauf admins) d'y accéder.
          </p>
        </div>

        {/* Module List */}
        <div className="divide-y divide-slate-800 mt-3 sm:mt-4">
          {modules.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              Aucun module configuré
            </div>
          ) : (
            modules.map((module) => (
              <div
                key={module.id}
                className={`p-3 sm:p-4 flex items-center justify-between gap-3 transition-colors ${
                  module.isLocked ? 'bg-slate-800/30' : 'hover:bg-slate-800/20'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    module.isLocked ? 'bg-amber-500/20' : 'bg-emerald-500/20'
                  }`}>
                    {module.isLocked ? (
                      <Lock size={18} className="text-amber-400" />
                    ) : (
                      <CheckCircle size={18} className="text-emerald-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-white text-sm sm:text-base truncate">
                        {module.moduleName}
                      </h4>
                      <Badge
                        value={module.isLocked ? 'Verrouillé' : 'Actif'}
                        variant={module.isLocked ? 'warning' : 'success'}
                        size="sm"
                      />
                    </div>
                    {module.isLocked && module.reason && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {module.reason}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant={module.isLocked ? 'success' : 'secondary'}
                  size="sm"
                  onClick={() => toggleModuleLock(module.id, module.isLocked, module.moduleName)}
                  disabled={saving || (platformModule?.isLocked || false)}
                  icon={module.isLocked ? Unlock : Lock}
                  className="flex-shrink-0"
                >
                  <span className="hidden sm:inline">
                    {module.isLocked ? 'Déverrouiller' : 'Verrouiller'}
                  </span>
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Platform Lock Control - Bottom for emphasis */}
      {platformModule && (
        <Card className={`p-4 sm:p-5 border-2 ${
          platformModule.isLocked
            ? 'bg-amber-950/20 border-amber-500/30'
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 sm:p-3 rounded-xl ${
                platformModule.isLocked ? 'bg-amber-500/20' : 'bg-emerald-500/20'
              }`}>
                <Power size={22} className={platformModule.isLocked ? 'text-amber-400' : 'text-emerald-400'} />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm sm:text-lg">Plateforme Complète</h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  {platformModule.isLocked
                    ? 'PLATEFORME VERROUILLÉE'
                    : 'Plateforme opérationnelle'
                  }
                </p>
              </div>
            </div>

            <Button
              variant={platformModule.isLocked ? 'success' : 'danger'}
              onClick={togglePlatformLock}
              disabled={saving}
              icon={platformModule.isLocked ? Unlock : Lock}
              className="w-full sm:w-auto justify-center"
            >
              {platformModule.isLocked ? 'Déverrouiller' : 'Verrouiller Tout'}
            </Button>
          </div>

          {platformModule.isLocked && platformModule.reason && (
            <div className="mt-3 p-3 bg-slate-900/50 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-300">
                <strong>Raison:</strong> {platformModule.reason}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Verrouillé le: {new Date(platformModule.lockedAt!).toLocaleString('fr-FR')}
              </p>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      >
        {/* Input for lock reason when locking */}
        {(pendingModuleId || (platformModule && !platformModule.isLocked)) && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-content-secondary mb-2">
              Raison du verrouillage
            </label>
            <input
              type="text"
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="Ex: Maintenance planifiée..."
              className="w-full px-3 py-2 bg-surface-base border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-primary outline-none"
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
};

export default AdminMaintenanceMode;
