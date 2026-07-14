/**
 * KPI COBAC Tab — ratios prudentiels réglementaires avec statut de conformité.
 *
 * Source : module comptabilité (/api/comptabilite/cobac). Les ratios sont
 * calculés PAR AGENCE (exigence réglementaire) : la vue consolidée invite
 * à sélectionner une agence.
 */
import { Landmark, ShieldCheck, AlertTriangle, Building2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { SkeletonStatCard } from '@/components/ui/Skeleton';
import { useCobacRatios, useCobacSeuils, CobacAccessError } from '@/hooks/use-cobac';
import { fmtPercent, SectionHeader } from '../kpi-utils';
import {
  COBAC_RATIO_DEFINITIONS,
  evaluateRatioStatut,
  statutDisplay,
  summarizeStatuts,
  type CobacRatiosApi,
  type CobacSeuilApi,
} from '../kpi-cobac-utils';

interface Props {
  /** Agence sélectionnée (admin) ; undefined = vue consolidée ou agence implicite */
  agencyId: string | undefined;
  /** true si l'utilisateur est admin (la vue consolidée le concerne) */
  isAdmin: boolean;
}

function RatioCard({ def, ratios, seuil }: {
  def: (typeof COBAC_RATIO_DEFINITIONS)[number];
  ratios: CobacRatiosApi;
  seuil: CobacSeuilApi | undefined;
}) {
  const rawValue = ratios[def.field] as string | null;
  const statut = evaluateRatioStatut(rawValue, seuil);
  const display = statutDisplay(statut);
  const value = rawValue === null || rawValue === undefined ? null : Number(rawValue);

  const seuilLabel = seuil?.seuilMinimum
    ? `Seuil ≥ ${fmtPercent(Number(seuil.seuilMinimum))}`
    : seuil?.seuilMaximum
      ? `Seuil ≤ ${fmtPercent(Number(seuil.seuilMaximum))}`
      : 'Seuil non configuré';

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-content-primary">{def.label}</span>
        <Badge value={display.label} variant={display.variant} size="sm" />
      </div>
      <div className="text-2xl font-semibold text-content-primary">
        {value !== null && Number.isFinite(value) ? fmtPercent(value) : 'N/D'}
      </div>
      <p className="text-[11px] text-content-muted mt-1 leading-relaxed">{def.description}</p>
      <p className="text-[11px] text-content-secondary mt-1">{seuilLabel}</p>
    </Card>
  );
}

function CenteredMessage({ icon: Icon, title, message }: { icon: typeof Landmark; title: string; message: string }) {
  return (
    <Card className="text-center">
      <div className="flex flex-col items-center gap-3 py-10">
        <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center">
          <Icon size={28} className="text-content-muted" />
        </div>
        <h2 className="text-base font-semibold text-content-primary">{title}</h2>
        <p className="text-sm text-content-secondary max-w-sm">{message}</p>
      </div>
    </Card>
  );
}

export default function KpiCobacTab({ agencyId, isAdmin }: Props) {
  // Un admin en vue consolidée doit choisir une agence : les ratios
  // prudentiels sont réglementairement calculés par agence.
  const needsAgencySelection = isAdmin && !agencyId;

  const ratiosQuery = useCobacRatios(agencyId, { enabled: !needsAgencySelection });
  const seuilsQuery = useCobacSeuils({ enabled: !needsAgencySelection });

  if (needsAgencySelection) {
    return (
      <CenteredMessage
        icon={Building2}
        title="Sélectionner une agence"
        message="Les ratios prudentiels COBAC sont calculés par agence. Choisissez une agence dans le sélecteur ci-dessus pour afficher sa conformité."
      />
    );
  }

  if (ratiosQuery.isLoading || seuilsQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>
    );
  }

  if (ratiosQuery.error instanceof CobacAccessError || seuilsQuery.error instanceof CobacAccessError) {
    return (
      <CenteredMessage
        icon={ShieldCheck}
        title="Accès restreint"
        message="La consultation des ratios prudentiels nécessite la permission de visualisation comptable. Contactez votre administrateur."
      />
    );
  }

  if (ratiosQuery.isError || seuilsQuery.isError) {
    return (
      <CenteredMessage
        icon={AlertTriangle}
        title="Erreur de chargement"
        message="Impossible de charger les ratios COBAC. Veuillez réessayer."
      />
    );
  }

  const ratios = ratiosQuery.data;
  const seuils = seuilsQuery.data ?? [];

  if (!ratios) {
    return (
      <CenteredMessage
        icon={Landmark}
        title="Aucun ratio calculé"
        message="Aucun calcul COBAC n'a encore été effectué pour cette agence. Le calcul est planifié mensuellement, ou peut être déclenché depuis le module Comptabilité."
      />
    );
  }

  const seuilByCode = new Map(seuils.map((s) => [s.ratioCode, s]));
  const summary = summarizeStatuts(ratios, seuils);
  const periodeLabel = ratios.periodeDate
    ? new Date(ratios.periodeDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader
          icon={Landmark}
          title="Ratios prudentiels COBAC"
          subtitle={periodeLabel ? `Situation au ${periodeLabel}` : undefined}
        />

        <div className="flex flex-wrap items-center gap-2 mb-4" role="status">
          <Badge value={`${summary.CONFORME} conforme(s)`} variant="success" size="sm" />
          {summary.ALERTE > 0 && <Badge value={`${summary.ALERTE} en alerte`} variant="warning" size="sm" />}
          {summary.NON_CONFORME > 0 && (
            <Badge value={`${summary.NON_CONFORME} non conforme(s)`} variant="danger" size="sm" />
          )}
          {summary.INCONNU > 0 && <Badge value={`${summary.INCONNU} sans seuil`} variant="neutral" size="sm" />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {COBAC_RATIO_DEFINITIONS.map((def) => (
            <RatioCard key={def.code} def={def} ratios={ratios} seuil={seuilByCode.get(def.code)} />
          ))}
        </div>
      </section>
    </div>
  );
}
