import { RotateCcw, ToggleRight, Lock } from 'lucide-react';
import Switch from '../ui/Switch';
import { TENANT_FEATURE_KIND, type TenantFeatureKey } from '@shared/tenant-config';
import { FEATURE_LABELS } from './tenantSettingsLabels';

export interface FeatureState {
  feature: TenantFeatureKey;
  effective: boolean;
  static: boolean;
  overridden: boolean;
}

function ProvenanceBadge({ overridden }: { overridden: boolean }) {
  return overridden ? (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded border text-status-warning bg-status-warning-bg border-status-warning/30">
      Surchargé en base
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded border text-content-muted bg-surface-subtle/40 border-edge-strong/30">
      Provisionné
    </span>
  );
}

interface RowHandlers {
  onToggle: (feature: TenantFeatureKey, enabled: boolean) => void;
  onReset: (feature: TenantFeatureKey) => void;
  resetPending: boolean;
}

function FeatureRow({ state, onToggle, onReset, resetPending }: { state: FeatureState } & RowHandlers) {
  const { feature, effective, static: provisioned, overridden } = state;
  const meta = FEATURE_LABELS[feature];
  const Icon = meta?.icon ?? ToggleRight;
  const isModule = TENANT_FEATURE_KIND[feature] === 'module';
  // Un module non provisionné est verrouillé : le client ne peut pas l'activer.
  const locked = isModule && !provisioned;

  return (
    <div className="flex items-center gap-3 py-3">
      <Icon size={18} className="text-content-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-content-primary">{meta?.label ?? feature}</span>
          {locked ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border text-content-muted bg-surface-subtle/40 border-edge-strong/30">
              <Lock size={10} /> Non provisionné
            </span>
          ) : (
            <ProvenanceBadge overridden={overridden} />
          )}
        </div>
        <p className="text-xs text-content-muted truncate">{meta?.description}</p>
        {overridden && !locked && (
          <p className="text-[10px] text-content-muted">
            Valeur provisionnée : {provisioned ? 'activé' : 'désactivé'}
          </p>
        )}
      </div>
      {overridden && !locked && (
        <button
          type="button"
          onClick={() => onReset(feature)}
          disabled={resetPending}
          title="Revenir à la valeur provisionnée"
          className="p-1.5 text-content-muted hover:text-content-secondary transition-colors"
        >
          <RotateCcw size={14} />
        </button>
      )}
      <Switch
        checked={effective}
        onChange={() => onToggle(feature, !effective)}
        disabled={locked}
        ariaLabel={`Basculer ${meta?.label ?? feature}`}
        data-testid={`switch-tenant-${feature}`}
      />
    </div>
  );
}

function FeaturesGroup({
  title,
  description,
  emptyLabel,
  list,
  handlers,
}: {
  title: string;
  description: string;
  emptyLabel: string;
  list: FeatureState[];
  handlers: RowHandlers;
}) {
  return (
    <div className="bg-surface/50 border border-edge rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ToggleRight size={16} className="text-accent" />
        <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
      </div>
      <p className="text-xs text-content-muted -mt-2">{description}</p>
      {list.length === 0 ? (
        <p className="text-sm text-content-muted py-4 text-center">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-edge-subtle">
          {list.map((state) => (
            <FeatureRow key={state.feature} state={state} {...handlers} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Panneau des flags tenant, séparé en deux régimes :
 * - « Modules provisionnés » : provisionnés au déploiement (plafond). On peut
 *   désactiver un module provisionné ; un module non provisionné est verrouillé.
 * - « Intégrations » : basculables librement à chaud.
 */
export function TenantModulesPanel({ features, ...handlers }: { features: FeatureState[] } & RowHandlers) {
  const modules = features.filter((f) => TENANT_FEATURE_KIND[f.feature] === 'module');
  const integrations = features.filter((f) => TENANT_FEATURE_KIND[f.feature] === 'integration');

  return (
    <>
      <FeaturesGroup
        title="Modules provisionnés"
        description="Provisionnés au déploiement (fichier client). Vous pouvez désactiver un module provisionné ; un module non provisionné ne peut pas être activé ici. Désactiver un module coupe aussi ses routes API. Chaque changement est motivé et audité."
        emptyLabel="Aucun module."
        list={modules}
        handlers={handlers}
      />
      <FeaturesGroup
        title="Intégrations"
        description="Intégrations opérationnelles, activables/désactivables à chaud. Chaque changement est audité."
        emptyLabel="Aucune intégration."
        list={integrations}
        handlers={handlers}
      />
    </>
  );
}
