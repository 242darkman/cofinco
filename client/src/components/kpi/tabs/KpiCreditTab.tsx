/**
 * KPI Credit Tab — Detailed credit portfolio indicators
 */
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import {
  Briefcase,
  CircleDollarSign,
  ArrowUpRight,
  CheckCircle,
  BarChart3,
  Hash,
} from 'lucide-react';
import { fmtMoney, fmtNum, fmtPercent, deltaToTrend, SectionHeader, HeroMetric } from '../kpi-utils';
import type { KpiPayload, KpiDeltas } from '@shared/schema/kpi';

interface Props {
  payload: KpiPayload;
  deltas: KpiDeltas | null;
}

type PlanRow = { planId: string; planNom: string; count: number; montant: number; encours: number };

const planColumns = [
  {
    key: 'planNom' as keyof PlanRow,
    label: 'Plan de credit',
    primary: true,
  },
  {
    key: 'count' as keyof PlanRow,
    label: 'Nombre',
    align: 'right' as const,
    format: (v: number) => fmtNum(v),
  },
  {
    key: 'montant' as keyof PlanRow,
    label: 'Montant decaisse',
    align: 'right' as const,
    hideOnMobile: true,
    format: (v: number) => fmtMoney(v),
  },
  {
    key: 'encours' as keyof PlanRow,
    label: 'Encours',
    align: 'right' as const,
    format: (v: number) => fmtMoney(v),
  },
];

export default function KpiCreditTab({ payload, deltas }: Props) {
  const { credit } = payload;
  const d = deltas?.credit;

  return (
    <div className="space-y-6">
      {/* ---- Hero metrics ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <HeroMetric
          label="Encours total actif"
          value={fmtMoney(credit.encoursTotalActif)}
          icon={Briefcase}
          color="accent"
          delta={d?.encoursTotalActif}
          description="Somme des soldes restants de tous les credits en cours"
        />
        <HeroMetric
          label="Decaissements periode"
          value={fmtMoney(credit.decaissementsPeriode)}
          icon={ArrowUpRight}
          color="success"
          delta={d?.decaissementsPeriode}
          description="Total des montants decaisses sur cette periode"
        />
        <HeroMetric
          label="Taux d'approbation"
          value={fmtPercent(credit.tauxApprobation)}
          icon={CheckCircle}
          color="success"
          delta={d?.tauxApprobation}
          description="Part des demandes de credit approuvees"
        />
      </div>

      {/* ---- Detail Stats ---- */}
      <section>
        <SectionHeader icon={BarChart3} title="Detail portefeuille" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            title="Credits actifs"
            value={fmtNum(credit.nombreCreditsActifs)}
            icon={CircleDollarSign}
            color="neutral"
            subtitle="Nombre de credits en cours"
            {...deltaToTrend(d?.nombreCreditsActifs)}
          />
          <StatCard
            title="Nombre decaissements"
            value={fmtNum(credit.nombreDecaissements)}
            icon={Hash}
            color="neutral"
            subtitle="Credits decaisses sur la periode"
            {...deltaToTrend(d?.nombreDecaissements)}
          />
          <StatCard
            title="Panier moyen"
            value={fmtMoney(credit.panierMoyen)}
            icon={BarChart3}
            color="neutral"
            subtitle="Montant moyen par credit decaisse"
            {...deltaToTrend(d?.panierMoyen)}
          />
        </div>
      </section>

      {/* ---- Répartition par plan ---- */}
      {credit.repartitionParPlan && credit.repartitionParPlan.length > 0 && (
        <section>
          <SectionHeader
            icon={Briefcase}
            title="Repartition par plan de credit"
            subtitle="Ventilation du portefeuille par type de produit"
          />
          <Card padding="none">
            <ResponsiveTable<PlanRow>
              data={credit.repartitionParPlan}
              columns={planColumns}
              density="compact"
              emptyMessage="Aucune donnee disponible"
            />
          </Card>
        </section>
      )}
    </div>
  );
}
