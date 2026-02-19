import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw, AlertTriangle, Users, Wallet, CreditCard, Calculator,
  Award, Activity, Smartphone, UserCheck, PiggyBank, TrendingUp,
  Bell, Truck, MessageSquare, WifiOff, ShieldAlert, Settings,
  CheckCircle2, Loader2, ShieldX, Info, Trash2
} from 'lucide-react';
import { Button, ConfirmDialog, LoadingSpinner, SelectField } from '../ui';
import { agenceApi, adminApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

interface PreviewCategory {
  label: string;
  icon: string;
  count: number;
}

interface PreviewData {
  agenceId: string;
  agenceName: string;
  agenceCode: string;
  categories: PreviewCategory[];
  totalRows: number;
  clientsDeleted: number;
  employeesCount: number;
  configReseeded: string[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  Users, Wallet, CreditCard, Calculator, Award, Activity,
  Smartphone, UserCheck, PiggyBank, TrendingUp, Bell, Truck,
  MessageSquare, WifiOff, ShieldAlert, Settings,
};

export default function AdminAgencyReset() {
  const [agences, setAgences] = useState<any[]>([]);
  const [selectedAgenceId, setSelectedAgenceId] = useState('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingAgences, setLoadingAgences] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [deleteEmployees, setDeleteEmployees] = useState(false);

  // Load agencies list
  useEffect(() => {
    (async () => {
      try {
        const data = await agenceApi.getAll();
        setAgences(data);
      } catch (err) {
        handleApiError(err, 'Erreur chargement agences');
      } finally {
        setLoadingAgences(false);
      }
    })();
  }, []);

  // Load preview when agency changes
  const loadPreview = useCallback(async (agenceId: string) => {
    if (!agenceId) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    setResetSuccess(false);
    setConfirmCode('');
    setDeleteEmployees(false);
    try {
      const data = await adminApi.previewResetAgence(agenceId);
      setPreview(data);
    } catch (err) {
      handleApiError(err, 'Erreur chargement preview');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (selectedAgenceId) {
      loadPreview(selectedAgenceId);
    } else {
      setPreview(null);
    }
  }, [selectedAgenceId, loadPreview]);

  const handleReset = async () => {
    if (!preview) return;
    setShowConfirmDialog(false);
    setResetting(true);
    try {
      await adminApi.resetAgence(selectedAgenceId, { confirmation: confirmCode, deleteEmployees });
      setResetSuccess(true);
      setConfirmCode('');
      toast.success(`Agence "${preview.agenceName}" réinitialisée`);
      // Reload preview to show zeroed counts
      setTimeout(() => loadPreview(selectedAgenceId), 1000);
    } catch (err) {
      handleApiError(err, 'Erreur réinitialisation');
    } finally {
      setResetting(false);
    }
  };

  const isCodeValid = preview && confirmCode === preview.agenceCode;

  const formatNumber = (n: number) => n.toLocaleString('fr-FR');

  const getCategoryIcon = (iconName: string) => {
    return ICON_MAP[iconName] || Activity;
  };

  if (loadingAgences) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      {/* Header Warning */}
      <div className="bg-status-danger-bg/60 border border-status-danger/20 rounded-xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-status-danger/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-status-danger" size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-content-primary">Réinitialisation d'Agence</h3>
            <p className="text-sm text-content-secondary mt-1">
              Supprime <strong>toutes les données transactionnelles</strong> d'une agence et reconfigure
              son infrastructure opérationnelle (caisse, coffre-fort, écarts). Option disponible pour
              supprimer définitivement les employés et leurs comptes utilisateurs.
            </p>
          </div>
        </div>
      </div>

      {/* Agency Selector */}
      <div className="bg-surface rounded-xl border border-edge p-4 sm:p-5">
        <label className="block text-sm font-semibold text-content-primary mb-3">
          Sélectionner l'agence à réinitialiser
        </label>
        <SelectField
          label=""
          name="agence"
          value={selectedAgenceId}
          onChange={(e) => setSelectedAgenceId(e.target.value)}
          options={[
            { value: '', label: '-- Choisir une agence --' },
            ...agences.map(a => ({
              value: a.id,
              label: `${a.nom} (${a.codeAgence || a.code_agence})`
            }))
          ]}
        />
      </div>

      {/* Loading Preview */}
      {loadingPreview && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto" />
            <p className="text-sm text-content-muted">Analyse des données en cours...</p>
          </div>
        </div>
      )}

      {/* Success State */}
      {resetSuccess && (
        <div className="bg-status-success-bg/60 border border-status-success/20 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-status-success shrink-0" size={24} />
            <div>
              <p className="font-semibold text-status-success">Réinitialisation terminée</p>
              <p className="text-sm text-content-secondary mt-0.5">
                L'agence a été nettoyée et sa configuration opérationnelle recréée.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preview Data */}
      {preview && !loadingPreview && (
        <>
          {/* Impact Grid */}
          <div className="bg-surface rounded-xl border border-edge overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-edge flex items-center justify-between">
              <h4 className="text-sm font-bold text-content-primary">Impact de la réinitialisation</h4>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-status-danger-bg text-status-danger">
                {formatNumber(preview.totalRows)} enregistrements
              </span>
            </div>

            {preview.categories.length > 0 ? (
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {preview.categories.map((cat) => {
                    const Icon = getCategoryIcon(cat.icon);
                    return (
                      <div
                        key={cat.label}
                        className="bg-surface-subtle rounded-lg p-3 border border-edge-subtle hover:border-edge transition-colors"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={14} className="text-content-muted shrink-0" />
                          <span className="text-[11px] text-content-muted font-medium truncate">{cat.label}</span>
                        </div>
                        <div className="text-xl font-bold text-content-primary">{formatNumber(cat.count)}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary Stats */}
                {preview.clientsDeleted > 0 && (
                  <div className="mt-4 pt-4 border-t border-edge-subtle flex flex-wrap gap-x-6 gap-y-2 text-xs text-content-secondary">
                    <div className="flex items-center gap-1.5">
                      <UserCheck size={13} className="text-status-danger" />
                      <span><strong>{preview.clientsDeleted}</strong> client{preview.clientsDeleted > 1 ? 's' : ''} supprimé{preview.clientsDeleted > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto text-status-success mb-2" size={28} />
                <p className="text-sm text-content-muted">Aucune donnée transactionnelle pour cette agence</p>
              </div>
            )}
          </div>

          {/* Re-seed Info */}
          {preview.configReseeded.length > 0 && (
            <div className="bg-status-info-bg/40 border border-status-info/15 rounded-xl p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Info className="text-status-info shrink-0 mt-0.5" size={16} />
                <div>
                  <p className="text-sm font-medium text-content-primary">Configuration recréée après purge</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {preview.configReseeded.map(item => (
                      <span key={item} className="inline-flex items-center gap-1 px-2.5 py-1 bg-status-info/10 text-status-info text-xs rounded-md font-medium">
                        <CheckCircle2 size={11} />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Employee Hard Delete Option */}
          {preview.employeesCount > 0 && (
            <div className="bg-surface rounded-xl border border-edge overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 border-b border-edge">
                <div className="flex items-center gap-2">
                  <Trash2 size={16} className="text-status-danger" />
                  <h4 className="text-sm font-bold text-content-primary">Suppression des employés</h4>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5">
                    <input
                      type="checkbox"
                      checked={deleteEmployees}
                      onChange={(e) => setDeleteEmployees(e.target.checked)}
                      className="sr-only peer"
                      disabled={resetting}
                    />
                    <div className="w-5 h-5 rounded border-2 border-edge-subtle bg-surface peer-checked:bg-status-danger peer-checked:border-status-danger transition-colors flex items-center justify-center group-hover:border-content-muted">
                      {deleteEmployees && <CheckCircle2 size={13} className="text-white" />}
                    </div>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-content-primary">
                      Supprimer aussi les {preview.employeesCount} employé{preview.employeesCount > 1 ? 's' : ''} et leurs comptes utilisateurs
                    </span>
                    <p className="text-xs text-content-muted mt-1">
                      Supprime définitivement les fiches employés, historiques RH (congés, paie, sanctions, présences),
                      agents terrain associés, et les comptes de connexion. <strong className="text-status-danger">Irréversible.</strong>
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Confirmation Zone */}
          {preview.totalRows > 0 && (
            <div className="bg-surface rounded-xl border-2 border-status-danger/30 overflow-hidden">
              <div className="px-4 sm:px-5 py-3.5 bg-status-danger-bg/40 border-b border-status-danger/20">
                <div className="flex items-center gap-2">
                  <ShieldX size={16} className="text-status-danger" />
                  <h4 className="text-sm font-bold text-content-primary">Zone de confirmation</h4>
                </div>
              </div>
              <div className="p-4 sm:p-5 space-y-4">
                <p className="text-sm text-content-secondary">
                  Pour confirmer la réinitialisation, tapez le code de l'agence : <strong className="text-content-primary font-mono bg-surface-subtle px-1.5 py-0.5 rounded">{preview.agenceCode}</strong>
                </p>
                <input
                  type="text"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value.toUpperCase())}
                  placeholder={`Tapez ${preview.agenceCode}`}
                  className="w-full sm:w-72 px-3 py-2.5 bg-input border border-input-border rounded-lg text-sm font-mono text-content-primary placeholder:text-content-muted focus:outline-none focus:border-input-focus focus:ring-1 focus:ring-input-focus transition-colors"
                  disabled={resetting}
                />
                <div>
                  <Button
                    variant="danger"
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={!isCodeValid || resetting}
                    className="w-full sm:w-auto"
                  >
                    {resetting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="animate-spin" size={16} />
                        Réinitialisation en cours...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <RotateCcw size={16} />
                        Réinitialiser l'agence
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Final Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleReset}
        title="Confirmer la réinitialisation"
        message={
          preview
            ? `Vous êtes sur le point de supprimer ${formatNumber(preview.totalRows)} enregistrements de l'agence "${preview.agenceName}".${deleteEmployees ? ` Les ${preview.employeesCount} employé(s) et leurs comptes utilisateurs seront également supprimés.` : ''} Cette action est irréversible.`
            : ''
        }
        confirmLabel="Oui, réinitialiser"
        variant="danger"
      />
    </div>
  );
}
