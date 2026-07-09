/**
 * KPI Rentabilité Tab — P&L indicators
 */
import StatCard from '@/components/ui/StatCard';
import {
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  Receipt,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react';
import { fmtMoney, fmtPercent, deltaToTrend, deltaToTrendInverse, SectionHeader, HeroMetric } from '../kpi-utils';
import type { KpiPayload, KpiDeltas } from '@shared/schema/kpi';

interface Props {
  payload: KpiPayload;
  deltas: KpiDeltas | null;
}

export default function KpiRentabiliteTab({ payload, deltas }: Props) {
  const { rentabilite } = payload;
  const d = deltas?.rentabilite;

  const isProfit = rentabilite.resultatNet >= 0;

  return (
    <div className="space-y-6">
      {/* ---- Hero metrics ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <HeroMetric
          label="Resultat net"
          value={fmtMoney(rentabilite.resultatNet)}
          icon={isProfit ? TrendingUp : TrendingDown}
          color={isProfit ? 'success' : 'danger'}
          delta={d?.resultatNet}
          description="Difference entre les revenus totaux et les charges totales sur la periode"
        />
        <HeroMetric
          label="Total revenus"
          value={fmtMoney(rentabilite.totalRevenus)}
          icon={ArrowUpRight}
          color="success"
          delta={d?.totalRevenus}
          description="Somme de tous les produits : interets, frais, commissions et revenus tontines"
        />
        <HeroMetric
          label="Total charges"
          value={fmtMoney(rentabilite.charges)}
          icon={TrendingDown}
          color="danger"
          delta={d?.charges}
          description="Ensemble des depenses operationnelles de la periode"
        />
      </div>

      {/* ---- Détail revenus ---- */}
      <section>
        <SectionHeader
          icon={CircleDollarSign}
          title="Detail des revenus"
          subtitle="Ventilation des sources de produits financiers"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            title="Interets percus"
            value={fmtMoney(rentabilite.interetsPercus)}
            icon={CircleDollarSign}
            color="success"
            subtitle="Interets encaisses sur les credits rembourses"
            {...deltaToTrend(d?.interetsPercus)}
          />
          <StatCard
            title="Frais & commissions"
            value={fmtMoney(rentabilite.fraisCommissions)}
            icon={Receipt}
            color="neutral"
            subtitle="Frais de dossier, ouverture de compte et commissions diverses"
            {...deltaToTrend(d?.fraisCommissions)}
          />
          <StatCard
            title="Revenus tontines"
            value={fmtMoney(rentabilite.revenusTontines)}
            icon={CircleDollarSign}
            color="neutral"
            subtitle="Produits generes par l'activite de tontine"
            {...deltaToTrend(d?.revenusTontines)}
          />
        </div>
      </section>

      {/* ---- Ratios ---- */}
      <section>
        <SectionHeader
          icon={BarChart3}
          title="Ratio d'efficience"
          subtitle="Mesure de la maitrise des couts par rapport au portefeuille"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            title="Ratio charges / encours"
            value={fmtPercent(rentabilite.ratioChargesEncours)}
            icon={BarChart3}
            color={rentabilite.ratioChargesEncours > 15 ? 'danger' : rentabilite.ratioChargesEncours > 10 ? 'warning' : 'success'}
            subtitle="Part des charges dans l'encours total — plus ce ratio est bas, plus l'institution est efficiente"
            {...deltaToTrendInverse(d?.ratioChargesEncours)}
          />
        </div>
      </section>
    </div>
  );
}
