/**
 * KPI Trésorerie Tab — Cash flow and liquidity indicators
 */
import StatCard from '@/components/ui/StatCard';
import {
  Wallet,
  Landmark,
  Smartphone,
  Shield,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  AlertTriangle,
} from 'lucide-react';
import { fmtMoney, fmtPercent, deltaToTrend, deltaToTrendInverse, SectionHeader, HeroMetric } from '../kpi-utils';
import type { KpiPayload, KpiDeltas } from '@shared/schema/kpi';

interface Props {
  payload: KpiPayload;
  deltas: KpiDeltas | null;
}

export default function KpiTresorerieTab({ payload, deltas }: Props) {
  const { tresorerie } = payload;
  const d = deltas?.tresorerie;

  const totalLiquidite = tresorerie.soldeCaisses + tresorerie.soldeCoffres + tresorerie.soldeBanque + tresorerie.soldeMobileMoney;

  return (
    <div className="space-y-6">
      {/* ---- Hero metrics ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <HeroMetric
          label="Liquidite totale"
          value={fmtMoney(totalLiquidite)}
          icon={Landmark}
          color="accent"
          description="Somme de toutes les disponibilites : caisses, coffres, comptes bancaires et mobile money"
        />
        <HeroMetric
          label="Flux entrants"
          value={fmtMoney(tresorerie.fluxEntrants)}
          icon={ArrowDownRight}
          color="success"
          delta={d?.fluxEntrants}
          description="Total des encaissements recus sur la periode (remboursements, depots, cotisations)"
        />
        <HeroMetric
          label="Flux sortants"
          value={fmtMoney(tresorerie.fluxSortants)}
          icon={ArrowUpRight}
          color="warning"
          delta={d?.fluxSortants}
          description="Total des decaissements effectues (credits, retraits, transferts, charges)"
        />
      </div>

      {/* ---- Soldes par source ---- */}
      <section>
        <SectionHeader
          icon={Wallet}
          title="Soldes par source"
          subtitle="Repartition des disponibilites par type de support"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Solde caisses"
            value={fmtMoney(tresorerie.soldeCaisses)}
            icon={Wallet}
            color="primary"
            subtitle="Especes disponibles dans les caisses des agences"
            {...deltaToTrend(d?.soldeCaisses)}
          />
          <StatCard
            title="Solde coffres"
            value={fmtMoney(tresorerie.soldeCoffres)}
            icon={Shield}
            color="primary"
            subtitle="Montants conserves dans les coffres-forts"
            {...deltaToTrend(d?.soldeCoffres)}
          />
          <StatCard
            title="Solde banque"
            value={fmtMoney(tresorerie.soldeBanque)}
            icon={Landmark}
            color="neutral"
            subtitle="Solde des comptes bancaires de l'institution"
          />
          <StatCard
            title="Solde mobile money"
            value={fmtMoney(tresorerie.soldeMobileMoney)}
            icon={Smartphone}
            color="neutral"
            subtitle="Fonds sur les comptes mobile money"
          />
        </div>
      </section>

      {/* ---- Indicateurs de flux ---- */}
      <section>
        <SectionHeader
          icon={BarChart3}
          title="Indicateurs de gestion"
          subtitle="Ratios et alertes sur la gestion des fonds"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            title="Ratio de liquidite"
            value={fmtPercent(tresorerie.ratioLiquidite)}
            icon={BarChart3}
            color={tresorerie.ratioLiquidite > 20 ? 'success' : tresorerie.ratioLiquidite > 10 ? 'warning' : 'danger'}
            subtitle="Liquidites rapportees aux depots clients — mesure la capacite a servir les retraits"
            {...deltaToTrend(d?.ratioLiquidite)}
          />
          <StatCard
            title="Ecarts de caisse"
            value={fmtMoney(tresorerie.ecartsCaisses)}
            icon={AlertTriangle}
            color={Math.abs(tresorerie.ecartsCaisses) > 0 ? 'danger' : 'success'}
            subtitle="Difference entre le solde theorique et le solde reel des caisses — idealement a zero"
            {...deltaToTrendInverse(d?.ecartsCaisses)}
          />
        </div>
      </section>
    </div>
  );
}
