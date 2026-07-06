/**
 * KPI Risque Tab — Portfolio at Risk and credit quality indicators
 */
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  ShieldAlert,
  AlertTriangle,
  UserCheck,
  XCircle,
  Ban,
  AlertOctagon,
} from 'lucide-react';
import { fmtMoney, fmtNum, fmtPercent, deltaToTrend, deltaToTrendInverse, parColor, SectionHeader, DeltaBadgeInverse } from '../kpi-utils';
import type { KpiPayload, KpiDeltas } from '@shared/schema/kpi';

interface Props {
  payload: KpiPayload;
  deltas: KpiDeltas | null;
}

function ParGauge({ label, value, delta, description }: { label: string; value: number; delta?: any; description: string }) {
  const color = parColor(value);
  const barColor = color === 'success'
    ? 'bg-status-success'
    : color === 'warning'
      ? 'bg-status-warning'
      : 'bg-status-danger';
  const bgColor = color === 'success'
    ? 'bg-status-success-bg'
    : color === 'warning'
      ? 'bg-status-warning-bg'
      : 'bg-status-danger-bg';

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-content-primary">{label}</span>
        <div className="flex items-center gap-2">
          <Badge
            value={fmtPercent(value)}
            variant={color}
            size="sm"
          />
          {delta && <DeltaBadgeInverse delta={delta} />}
        </div>
      </div>
      <div className={`w-full h-3 rounded-full ${bgColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <p className="text-[10px] sm:text-[11px] text-content-muted mt-2 leading-relaxed">{description}</p>
    </Card>
  );
}

export default function KpiRisqueTab({ payload, deltas }: Props) {
  const { risque } = payload;
  const d = deltas?.risque;

  return (
    <div className="space-y-6">
      {/* ---- PAR Gauges ---- */}
      <section>
        <SectionHeader
          icon={ShieldAlert}
          title="Portefeuille a risque (PAR)"
          subtitle="Part de l'encours dont au moins une echeance est en retard"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <ParGauge
            label="PAR > 30 jours"
            value={risque.par30}
            delta={d?.par30}
            description="Credits avec au moins une echeance impayee depuis plus de 30 jours, rapportes au portefeuille total"
          />
          <ParGauge
            label="PAR > 60 jours"
            value={risque.par60}
            delta={d?.par60}
            description="Credits avec au moins une echeance impayee depuis plus de 60 jours"
          />
          <ParGauge
            label="PAR > 90 jours"
            value={risque.par90}
            delta={d?.par90}
            description="Credits en defaut grave : impaye depuis plus de 90 jours"
          />
        </div>
      </section>

      {/* ---- Taux ---- */}
      <section>
        <SectionHeader icon={UserCheck} title="Indicateurs de qualite" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            title="Taux de recouvrement"
            value={fmtPercent(risque.tauxRecouvrement)}
            icon={UserCheck}
            color="success"
            subtitle="Ratio remboursements effectifs / echeances dues"
            {...deltaToTrend(d?.tauxRecouvrement)}
          />
          <StatCard
            title="Taux de defaut"
            value={fmtPercent(risque.tauxDefaut)}
            icon={XCircle}
            color={risque.tauxDefaut > 5 ? 'danger' : risque.tauxDefaut > 2 ? 'warning' : 'success'}
            subtitle="Part des credits en defaut dans le portefeuille"
            {...deltaToTrendInverse(d?.tauxDefaut)}
          />
          <StatCard
            title="Taux de radiation"
            value={fmtPercent(risque.tauxRadiation)}
            icon={Ban}
            color={risque.tauxRadiation > 3 ? 'danger' : 'warning'}
            subtitle="Credits consideres comme pertes definitives"
            {...deltaToTrendInverse(d?.tauxRadiation)}
          />
        </div>
      </section>

      {/* ---- Credits en souffrance ---- */}
      <section>
        <SectionHeader
          icon={AlertTriangle}
          title="Credits en souffrance"
          subtitle="Credits presentant des retards de remboursement significatifs"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <StatCard
            title="Nombre en souffrance"
            value={fmtNum(risque.creditsEnSouffrance)}
            icon={AlertTriangle}
            color="danger"
            subtitle="Credits en retard de paiement"
            {...deltaToTrendInverse(d?.creditsEnSouffrance)}
          />
          <StatCard
            title="Montant en souffrance"
            value={fmtMoney(risque.montantEnSouffrance)}
            icon={AlertOctagon}
            color="danger"
            subtitle="Solde restant total des credits en souffrance"
            {...deltaToTrendInverse(d?.montantEnSouffrance)}
          />
        </div>
      </section>
    </div>
  );
}
