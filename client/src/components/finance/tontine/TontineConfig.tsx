import { useState, useEffect } from 'react';
import { Settings, Calendar, Shuffle, AlertTriangle, DoorOpen, Wallet, Shield, LayoutTemplate, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, Badge } from '../../ui';
import { tontineApi, tontinePlanApi } from '../../../lib/api-client';
import { currencySymbol } from '@shared/config/currency';
import {
  FREQUENCE_OPTIONS,
  DISTRIBUTION_TYPE_OPTIONS,
  FIRST_CONTRIBUTION_RULE_OPTIONS,
  CALENDAR_MODE_OPTIONS,
  SHIFT_OPTIONS,
  PAYOUT_ORDER_MODE_OPTIONS,
  PAYOUT_FREQUENCY_OPTIONS,
  PENALTY_TYPE_OPTIONS,
  PENALTY_APPLICATION_OPTIONS,
  ARREARS_POLICY_OPTIONS,
  SUSPENSION_POLICY_OPTIONS,
  DEFAULT_POLICY_OPTIONS,
  FEE_COLLECTION_MODE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  KYC_LEVEL_OPTIONS,
  WEEKDAY_LABELS,
} from '../../admin/TontinePlanWizard/constants';

interface TontineConfigProps {
  tontineId: string;
}

function findLabel(options: { value: string; label: string }[], value: string | null | undefined): string {
  if (!value) return '-';
  return options.find((o) => o.value === value)?.label ?? value;
}

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  return (
    <div className="flex justify-between items-start py-1.5">
      <span className="text-xs text-content-muted">{label}</span>
      <span className="text-xs font-medium text-content-primary text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-content-muted">{label}</span>
      <Badge variant={value ? 'success' : 'neutral'} value={value ? 'Oui' : 'Non'} size="sm" />
    </div>
  );
}

function Section({ icon: Icon, title, children, defaultOpen = false }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-edge-subtle rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-surface-subtle hover:bg-surface-subtle-elevated transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-accent" />
          <span className="text-xs font-semibold text-content-primary">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-content-muted" /> : <ChevronDown size={14} className="text-content-muted" />}
      </button>
      {open && <div className="px-3 py-2 divide-y divide-edge-subtle/50">{children}</div>}
    </div>
  );
}

function formatWeekdays(mask: number | null | undefined): string {
  if (!mask) return '-';
  return WEEKDAY_LABELS
    .filter((d) => mask & (1 << d.value))
    .map((d) => d.label)
    .join(', ') || 'Aucun';
}

export default function TontineConfig({ tontineId }: TontineConfigProps) {
  const sym = currencySymbol();
  const [tontine, setTontine] = useState<any>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tontineId) return;
    setLoading(true);
    tontineApi.getById(tontineId)
      .then((data) => {
        setTontine(data);
        if (data?.planId) {
          tontinePlanApi.getById(data.planId)
            .then((plan) => setPlanName(plan?.nom || null))
            .catch(() => setPlanName(null));
        }
      })
      .catch(() => setTontine(null))
      .finally(() => setLoading(false));
  }, [tontineId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-surface/50 rounded-lg" />)}
      </div>
    );
  }

  if (!tontine) {
    return <div className="text-center py-8 text-content-muted text-sm">Configuration non disponible</div>;
  }

  return (
    <div className="space-y-3">
      {/* Plan source */}
      {tontine.planId && (
        <Card className="p-3 bg-accent/5 border-accent/20">
          <div className="flex items-center gap-2">
            <LayoutTemplate size={14} className="text-accent" />
            <span className="text-xs text-content-muted">Basee sur le modele :</span>
            <span className="text-xs font-semibold text-accent">{planName || tontine.planId}</span>
          </div>
        </Card>
      )}

      {/* General */}
      <Section icon={Settings} title="General" defaultOpen>
        <ConfigRow label="Distribution" value={findLabel(DISTRIBUTION_TYPE_OPTIONS, tontine.distributionType)} />
        <ConfigRow label="Frequence" value={findLabel(FREQUENCE_OPTIONS, tontine.frequence)} />
        {tontine.intervalleCotisation > 1 && (
          <ConfigRow label="Intervalle" value={`x${tontine.intervalleCotisation}`} />
        )}
        <ConfigRow label={`Cotisation (${sym})`} value={Number(tontine.montantCotisation || 0).toLocaleString()} />
        <ConfigRow label="Membres" value={tontine.nombreMembres} />
        <ConfigRow label={`Commission plateforme`} value={tontine.tauxPlateforme ? `${tontine.tauxPlateforme}%` : null} />
      </Section>

      {/* Calendar */}
      <Section icon={Calendar} title="Calendrier & Cotisations">
        <ConfigRow label="Premiere cotisation" value={findLabel(FIRST_CONTRIBUTION_RULE_OPTIONS, tontine.firstContributionRule)} />
        <ConfigRow label="Grace (jours)" value={tontine.gracePeriodContribution > 0 ? tontine.gracePeriodContribution : null} />
        <ConfigRow label="Mode calendrier" value={findLabel(CALENDAR_MODE_OPTIONS, tontine.collectionCalendarMode)} />
        <ConfigRow label="Jours actifs" value={formatWeekdays(tontine.weekdaysMask)} />
        <ConfigRow label="Jour ferie" value={findLabel(SHIFT_OPTIONS, tontine.shiftNonWorkingDay)} />
        <ConfigRow label="Fuseau horaire" value={tontine.timezone} />
      </Section>

      {/* Distribution */}
      <Section icon={Shuffle} title="Distribution & Tours">
        <ConfigRow label="Frequence distribution" value={findLabel(PAYOUT_FREQUENCY_OPTIONS, tontine.payoutFrequency)} />
        <ConfigRow label="Ordre des tours" value={findLabel(PAYOUT_ORDER_MODE_OPTIONS, tontine.payoutOrderMode)} />
        <BoolRow label="Echange d'ordre autorise" value={tontine.allowSwapPayoutOrder} />
        {tontine.allowSwapPayoutOrder && (
          <BoolRow label="Echange requiert approbation" value={tontine.swapRequiresApproval} />
        )}
        <BoolRow label="Cotisation payee requise pour distribution" value={tontine.payoutRequiresContribPaid} />
        <BoolRow label="Distribution partielle" value={tontine.allowPartialDistribution} />
        {tontine.distributionMinThresholdPct && Number(tontine.distributionMinThresholdPct) > 0 && (
          <ConfigRow label="Seuil minimum" value={`${tontine.distributionMinThresholdPct}%`} />
        )}
      </Section>

      {/* Penalties */}
      <Section icon={AlertTriangle} title="Penalites & Retards">
        <BoolRow label="Penalites actives" value={tontine.penaltyEnabled} />
        {tontine.penaltyEnabled && (
          <>
            <ConfigRow label="Type" value={findLabel(PENALTY_TYPE_OPTIONS, tontine.penaltyType)} />
            <ConfigRow label="Valeur" value={
              tontine.penaltyType === 'PERCENT'
                ? `${tontine.penaltyValue}%`
                : `${Number(tontine.penaltyValue || 0).toLocaleString()} ${sym}`
            } />
            <ConfigRow label="Application" value={findLabel(PENALTY_APPLICATION_OPTIONS, tontine.penaltyApplication)} />
            {tontine.penaltyCap && <ConfigRow label="Plafond" value={`${Number(tontine.penaltyCap).toLocaleString()} ${sym}`} />}
            <ConfigRow label="Grace retard (jours)" value={tontine.lateGracePeriodDays > 0 ? tontine.lateGracePeriodDays : null} />
            <ConfigRow label="Max cotisations ratees" value={tontine.maxMissedContributions > 0 ? tontine.maxMissedContributions : null} />
            <ConfigRow label="Politique arrieres" value={findLabel(ARREARS_POLICY_OPTIONS, tontine.arrearsPolicy)} />
            <ConfigRow label="Politique suspension" value={findLabel(SUSPENSION_POLICY_OPTIONS, tontine.suspensionPolicy)} />
            <ConfigRow label="Politique defaut" value={findLabel(DEFAULT_POLICY_OPTIONS, tontine.defaultPolicy)} />
            <BoolRow label="Deduite du paiement" value={tontine.penaltyDeductedFromPayout} />
            <BoolRow label="Penalite comme revenu" value={tontine.penaltyAsRevenue} />
          </>
        )}
      </Section>

      {/* Entry/Exit */}
      <Section icon={DoorOpen} title="Adhesion & Sortie">
        <BoolRow label="Frais d'adhesion" value={tontine.joinFeeEnabled} />
        {tontine.joinFeeEnabled && (
          <ConfigRow label="Montant adhesion" value={`${Number(tontine.joinFeeAmount || 0).toLocaleString()} ${sym}`} />
        )}
        <BoolRow label="Sortie autorisee" value={tontine.exitAllowed} />
        {tontine.exitAllowed && tontine.exitFeePercent > 0 && (
          <ConfigRow label="Frais de sortie" value={`${tontine.exitFeePercent}%`} />
        )}
        {tontine.exitNoticePeriods > 0 && (
          <ConfigRow label="Preavis (periodes)" value={tontine.exitNoticePeriods} />
        )}
        <BoolRow label="Remplacement autorise" value={tontine.replacementAllowed} />
        <BoolRow label="Adhesion en cours de cycle" value={tontine.allowMidCycleJoin} />
      </Section>

      {/* Payment */}
      <Section icon={Wallet} title="Paiement & Tresorerie">
        <ConfigRow label="Methodes autorisees" value={
          (tontine.allowedPaymentMethods || [])
            .map((m: string) => findLabel(PAYMENT_METHOD_OPTIONS, m))
            .join(', ')
        } />
        <ConfigRow label="Methode par defaut" value={findLabel(PAYMENT_METHOD_OPTIONS, tontine.defaultPaymentMethod)} />
        <BoolRow label="Cash vers caisse" value={tontine.cashMustGoToCaisse} />
        <ConfigRow label="Collecte frais" value={findLabel(FEE_COLLECTION_MODE_OPTIONS, tontine.feeCollectionMode)} />
        {tontine.maxAdvanceTours > 0 && (
          <ConfigRow label="Max tours d'avance" value={tontine.maxAdvanceTours} />
        )}
      </Section>

      {/* Governance */}
      <Section icon={Shield} title="Gouvernance">
        <BoolRow label="Roles actifs" value={tontine.rolesEnabled} />
        {tontine.rolesEnabled && tontine.groupRoles?.length > 0 && (
          <ConfigRow label="Roles" value={tontine.groupRoles.join(', ')} />
        )}
        {tontine.approvalsRequiredFor?.length > 0 && (
          <ConfigRow label="Approbations requises" value={tontine.approvalsRequiredFor.join(', ')} />
        )}
        <ConfigRow label="KYC minimum" value={findLabel(KYC_LEVEL_OPTIONS, tontine.minKycLevel)} />
        {tontine.minSegmentRequired && (
          <ConfigRow label="Segment minimum" value={tontine.minSegmentRequired} />
        )}
      </Section>
    </div>
  );
}
