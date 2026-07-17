import { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, Paintbrush, AlertTriangle } from 'lucide-react';
import type { TenantBrandingKey, TenantFeatureKey } from '@shared/tenant-config';
import { FEATURE_LABELS, BRANDING_LABELS } from './tenantSettingsLabels';
import { TenantModulesPanel, type FeatureState } from './TenantModulesPanel';

/**
 * Administration du tenant courant : feature flags et branding dynamiques.
 *
 * Pilote les surcharges en base (tenant_feature_overrides,
 * tenant_branding_overrides) via l'API admin. Chaque changement est motivé
 * et audité côté serveur ; « Réinitialiser » revient à la configuration
 * statique du livrable (fichier client).
 */

interface BrandingState {
  key: TenantBrandingKey;
  effective: string | undefined;
  static: string | undefined;
  overridden: boolean;
}

function ProvenanceBadge({ overridden }: { overridden: boolean }) {
  return overridden ? (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded border text-status-warning bg-status-warning-bg border-status-warning/30">
      Surchargé en base
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded border text-content-muted bg-surface-subtle/40 border-edge-strong/30">
      Configuration statique
    </span>
  );
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.code || `Erreur ${res.status}`);
  }
  return res.json();
}

export default function AdminTenantSettings() {
  const queryClient = useQueryClient();
  const [pendingFeature, setPendingFeature] = useState<{ feature: TenantFeatureKey; enabled: boolean } | null>(null);
  const [pendingBranding, setPendingBranding] = useState<{ key: TenantBrandingKey; value: string } | null>(null);
  const [reason, setReason] = useState('');

  const featuresQuery = useQuery<{ features: FeatureState[] }>({
    queryKey: ['/api/admin/tenant-features'],
    queryFn: () => jsonFetch('/api/admin/tenant-features'),
  });

  const brandingQuery = useQuery<{ branding: BrandingState[] }>({
    queryKey: ['/api/admin/tenant-branding'],
    queryFn: () => jsonFetch('/api/admin/tenant-branding'),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/tenant-features'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/tenant-branding'] });
    // Recharger la config publique : thème, logo et flags appliqués en direct
    queryClient.invalidateQueries({ queryKey: ['/api/tenant/config'] });
  };

  const featureMutation = useMutation({
    mutationFn: ({ feature, enabled, reason }: { feature: TenantFeatureKey; enabled: boolean; reason: string }) =>
      jsonFetch(`/api/admin/tenant-features/${feature}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled, reason }),
      }),
    onSuccess: () => {
      toast.success('Module mis à jour (prise en compte ≤ 30 s)');
      invalidateAll();
    },
    onError: (e: Error) => toast.error(`Échec de la mise à jour : ${e.message}`),
  });

  const featureResetMutation = useMutation({
    mutationFn: (feature: TenantFeatureKey) =>
      jsonFetch(`/api/admin/tenant-features/${feature}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Module réinitialisé sur la configuration statique');
      invalidateAll();
    },
    onError: (e: Error) => toast.error(`Échec de la réinitialisation : ${e.message}`),
  });

  const brandingMutation = useMutation({
    mutationFn: ({ key, value, reason }: { key: TenantBrandingKey; value: string; reason: string }) =>
      jsonFetch(`/api/admin/tenant-branding/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value, reason }),
      }),
    onSuccess: () => {
      toast.success('Branding mis à jour (prise en compte ≤ 30 s)');
      invalidateAll();
    },
    onError: (e: Error) => toast.error(`Échec de la mise à jour : ${e.message}`),
  });

  const brandingResetMutation = useMutation({
    mutationFn: (key: TenantBrandingKey) =>
      jsonFetch(`/api/admin/tenant-branding/${key}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Branding réinitialisé sur la configuration statique');
      invalidateAll();
    },
    onError: (e: Error) => toast.error(`Échec de la réinitialisation : ${e.message}`),
  });

  const confirmWithReason = () => {
    if (reason.trim().length < 3) {
      toast.error('Un motif d’au moins 3 caractères est requis (audit)');
      return;
    }
    if (pendingFeature) {
      featureMutation.mutate({ ...pendingFeature, reason: reason.trim() });
      setPendingFeature(null);
    }
    if (pendingBranding) {
      brandingMutation.mutate({ ...pendingBranding, reason: reason.trim() });
      setPendingBranding(null);
    }
    setReason('');
  };

  const cancelPending = () => {
    setPendingFeature(null);
    setPendingBranding(null);
    setReason('');
  };

  if (featuresQuery.isLoading || brandingQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" tone="accent" />
      </div>
    );
  }

  if (featuresQuery.isError || brandingQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-content-muted">
        <AlertTriangle className="text-status-danger" size={28} />
        <p className="text-sm">Impossible de charger la configuration tenant.</p>
        <button
          type="button"
          onClick={() => { featuresQuery.refetch(); brandingQuery.refetch(); }}
          className="px-3 py-1.5 text-xs font-medium text-accent bg-accent-bg border border-accent/30 rounded-lg"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const features = featuresQuery.data?.features ?? [];
  const branding = brandingQuery.data?.branding ?? [];
  const pendingLabel = pendingFeature
    ? `${FEATURE_LABELS[pendingFeature.feature].label} → ${pendingFeature.enabled ? 'activé' : 'désactivé'}`
    : pendingBranding
      ? `${BRANDING_LABELS[pendingBranding.key].label} → « ${pendingBranding.value} »`
      : null;

  return (
    <div className="space-y-6">
      {/* Modules provisionnés & intégrations (feature flags) */}
      <TenantModulesPanel
        features={features}
        onToggle={(feature, enabled) => setPendingFeature({ feature, enabled })}
        onReset={(feature) => featureResetMutation.mutate(feature)}
        resetPending={featureResetMutation.isPending}
      />

      {/* Branding */}
      <div className="bg-surface/50 border border-edge rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Paintbrush size={16} className="text-accent" />
          <h3 className="text-sm font-semibold text-content-primary">Branding du tenant</h3>
        </div>
        <p className="text-xs text-content-muted -mt-2">
          Nom, couleurs et logos surchargent la configuration du livrable sans redéploiement.
          La charte graphique (thèmes clair et sombre) est dérivée automatiquement des couleurs.
        </p>

        <div className="space-y-3">
          {branding.map(({ key, effective, static: staticValue, overridden }) => {
            const meta = BRANDING_LABELS[key];
            return (
              <BrandingRow
                key={key}
                brandingKey={key}
                label={meta?.label ?? key}
                placeholder={meta?.placeholder ?? ''}
                effective={effective}
                staticValue={staticValue}
                overridden={overridden}
                onSubmit={(value) => setPendingBranding({ key, value })}
                onReset={() => brandingResetMutation.mutate(key)}
                resetting={brandingResetMutation.isPending}
              />
            );
          })}
        </div>
      </div>

      {/* Dialogue de motif (audit) */}
      {pendingLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface-elevated border border-edge rounded-xl p-5 w-full max-w-md space-y-4 shadow-2xl">
            <h4 className="text-sm font-semibold text-content-primary">Confirmer le changement</h4>
            <p className="text-xs text-content-muted">{pendingLabel}</p>
            <div className="space-y-1">
              <label htmlFor="tenant-change-reason" className="text-xs text-content-muted">
                Motif (journalisé dans l'audit)
              </label>
              <input
                id="tenant-change-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmWithReason()}
                placeholder="Ex : demande du client du 08/07, ticket #123"
                maxLength={500}
                autoFocus
                className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPending}
                className="px-4 py-2 text-sm text-content-muted hover:text-content-secondary transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmWithReason}
                disabled={reason.trim().length < 3}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-40 transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BrandingRowProps {
  brandingKey: TenantBrandingKey;
  label: string;
  placeholder: string;
  effective: string | undefined;
  staticValue: string | undefined;
  overridden: boolean;
  onSubmit: (value: string) => void;
  onReset: () => void;
  resetting: boolean;
}

function BrandingRow({
  brandingKey,
  label,
  placeholder,
  effective,
  staticValue,
  overridden,
  onSubmit,
  onReset,
  resetting,
}: Readonly<BrandingRowProps>) {
  const [value, setValue] = useState(effective ?? '');
  const isColor = brandingKey === 'primaryColor' || brandingKey === 'secondaryColor';
  const dirty = value.trim() !== (effective ?? '') && value.trim().length > 0;

  return (
    <div className="flex items-center gap-3">
      <div className="w-44 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-content-secondary">{label}</span>
        </div>
        <div className="mt-0.5">
          <ProvenanceBadge overridden={overridden} />
        </div>
        {overridden && staticValue && (
          <p className="text-[10px] text-content-muted mt-0.5 truncate" title={staticValue}>
            Statique : {staticValue}
          </p>
        )}
      </div>
      {isColor && (
        <span
          aria-hidden
          className="w-8 h-8 rounded-lg border border-edge shrink-0"
          style={{ backgroundColor: value || effective || 'transparent' }}
        />
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && dirty && onSubmit(value.trim())}
        placeholder={placeholder}
        maxLength={512}
        aria-label={label}
        className="flex-1 px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm font-mono text-content-primary placeholder-content-muted focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onSubmit(value.trim())}
        disabled={!dirty}
        className="px-3 py-2 text-xs font-medium text-accent bg-accent-bg border border-accent/30 rounded-lg hover:bg-accent/20 transition-colors disabled:opacity-40"
      >
        Appliquer
      </button>
      {overridden && (
        <button
          type="button"
          onClick={onReset}
          disabled={resetting}
          title="Revenir à la configuration statique"
          className="p-2 text-content-muted hover:text-content-secondary transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
}
