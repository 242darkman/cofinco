/**
 * KPI Tontines & Epargne Tab
 */
import StatCard from '@/components/ui/StatCard';
import {
  PiggyBank,
  Wallet,
  CircleDollarSign,
  Users,
  ArrowDownRight,
  ArrowUpRight,
  Coins,
} from 'lucide-react';
import { fmtMoney, fmtNum, deltaToTrend, SectionHeader, HeroMetric } from '../kpi-utils';
import type { KpiPayload, KpiDeltas } from '@shared/schema/kpi';

interface Props {
  payload: KpiPayload;
  deltas: KpiDeltas | null;
}

export default function KpiTontinesTab({ payload, deltas }: Props) {
  const { tontinesEpargne } = payload;
  const d = deltas?.tontinesEpargne;

  return (
    <div className="space-y-6">
      {/* ---- Hero metrics ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <HeroMetric
          label="Encours epargne"
          value={fmtMoney(tontinesEpargne.encoursEpargne)}
          icon={PiggyBank}
          color="accent"
          delta={d?.encoursEpargne}
          description="Total des soldes de tous les comptes d'epargne"
        />
        <HeroMetric
          label="Comptes courants"
          value={fmtMoney(tontinesEpargne.encoursComptesCourants)}
          icon={Wallet}
          color="accent"
          delta={d?.encoursComptesCourants}
          description="Total des soldes des comptes courants"
        />
        <HeroMetric
          label="Cotisations tontines"
          value={fmtMoney(tontinesEpargne.cotisationsTontines)}
          icon={Coins}
          color="success"
          delta={d?.cotisationsTontines}
          description="Volume total des cotisations versees dans les tontines"
        />
      </div>

      {/* ---- Tontines ---- */}
      <section>
        <SectionHeader icon={CircleDollarSign} title="Tontines" subtitle="Activite des groupes de tontine" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            title="Tontines actives"
            value={fmtNum(tontinesEpargne.tontinesActives)}
            icon={CircleDollarSign}
            color="success"
            subtitle="Nombre de groupes de tontine en cours"
            {...deltaToTrend(d?.tontinesActives)}
          />
          <StatCard
            title="Membres tontines"
            value={fmtNum(tontinesEpargne.membresTontines)}
            icon={Users}
            color="neutral"
            subtitle="Nombre total de participants aux tontines"
            {...deltaToTrend(d?.membresTontines)}
          />
        </div>
      </section>

      {/* ---- Flux ---- */}
      <section>
        <SectionHeader
          icon={ArrowDownRight}
          title="Flux periode"
          subtitle="Mouvements de collecte et de retrait sur la periode"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            title="Volumes collectes"
            value={fmtMoney(tontinesEpargne.volumesCollectes)}
            icon={ArrowDownRight}
            color="success"
            subtitle="Total des depots et cotisations recus"
            {...deltaToTrend(d?.volumesCollectes)}
          />
          <StatCard
            title="Volumes retires"
            value={fmtMoney(tontinesEpargne.volumesRetires)}
            icon={ArrowUpRight}
            color="warning"
            subtitle="Total des retraits effectues"
            {...deltaToTrend(d?.volumesRetires)}
          />
        </div>
      </section>
    </div>
  );
}
