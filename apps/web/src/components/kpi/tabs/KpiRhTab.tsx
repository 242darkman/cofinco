/**
 * KPI RH & Productivité Tab — HR metrics and agent performance
 */
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import ResponsiveTable from '@/components/ui/ResponsiveTable';
import {
  Users,
  UserCheck,
  Briefcase,
  CircleDollarSign,
  ArrowUpRight,
  Trophy,
  AlertTriangle,
} from 'lucide-react';
import { fmtMoney, fmtMoneyShort, fmtNum, deltaToTrend, deltaToTrendInverse, SectionHeader, HeroMetric } from '../kpi-utils';
import type { KpiPayload, KpiDeltas, KpiRhProductivitePayload } from '@shared/schema/kpi';

interface Props {
  payload: KpiPayload;
  deltas: KpiDeltas | null;
}

type AgentRow = KpiRhProductivitePayload['topAgents'][number];

const agentColumns = [
  {
    key: 'nom' as keyof AgentRow,
    label: 'Agent',
    primary: true,
    format: (_: string, item: AgentRow) => `${item.prenom} ${item.nom}`,
  },
  {
    key: 'clients' as keyof AgentRow,
    label: 'Clients',
    align: 'right' as const,
    format: (v: number) => fmtNum(v),
  },
  {
    key: 'decaissements' as keyof AgentRow,
    label: 'Decaiss.',
    align: 'right' as const,
    format: (v: number) => fmtNum(v),
  },
  {
    key: 'montant' as keyof AgentRow,
    label: 'Montant',
    align: 'right' as const,
    hideOnMobile: true,
    format: (v: number) => fmtMoney(v),
  },
];

export default function KpiRhTab({ payload, deltas }: Props) {
  const { rhProductivite } = payload;
  const d = deltas?.rhProductivite;

  return (
    <div className="space-y-6">
      {/* ---- Hero metrics ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <HeroMetric
          label="Agents actifs"
          value={fmtNum(rhProductivite.agentsActifs)}
          icon={Users}
          color="accent"
          delta={d?.agentsActifs}
          description="Nombre d'employes actuellement en activite"
        />
        <HeroMetric
          label="Encours / agent"
          value={fmtMoneyShort(rhProductivite.encoursParAgent)}
          icon={Briefcase}
          color="success"
          delta={d?.encoursParAgent}
          description="Portefeuille moyen gere par chaque agent de credit"
        />
        <HeroMetric
          label="Masse salariale"
          value={fmtMoney(rhProductivite.masseSalariale)}
          icon={CircleDollarSign}
          color="warning"
          delta={d?.masseSalariale}
          description="Total des salaires nets verses sur la periode"
        />
      </div>

      {/* ---- Productivité ---- */}
      <section>
        <SectionHeader
          icon={UserCheck}
          title="Ratios de productivite"
          subtitle="Indicateurs d'efficacite des ressources humaines"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            title="Clients / agent"
            value={fmtNum(rhProductivite.clientsParAgent)}
            icon={UserCheck}
            color="success"
            subtitle="Nombre moyen de clients suivis par agent"
            {...deltaToTrend(d?.clientsParAgent)}
          />
          <StatCard
            title="Decaissements / agent"
            value={fmtNum(rhProductivite.decaissementsParAgent)}
            icon={ArrowUpRight}
            color="neutral"
            subtitle="Nombre moyen de credits decaisses par agent"
            {...deltaToTrend(d?.decaissementsParAgent)}
          />
          <StatCard
            title="Masse salariale"
            value={fmtMoney(rhProductivite.masseSalariale)}
            icon={CircleDollarSign}
            color="neutral"
            subtitle="Charge salariale — hausse a surveiller vs productivite"
            {...deltaToTrendInverse(d?.masseSalariale)}
          />
        </div>
      </section>

      {/* ---- Top & Bottom Agents ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top agents */}
        {rhProductivite.topAgents && rhProductivite.topAgents.length > 0 && (
          <section>
            <SectionHeader
              icon={Trophy}
              title="Top agents"
              subtitle="Meilleurs performeurs de la periode"
            />
            <Card padding="none">
              <div className="flex items-center gap-2 px-3 sm:px-4 pt-3 pb-2">
                <Trophy size={16} className="text-status-success" />
                <span className="text-xs font-medium text-status-success">Meilleure performance</span>
              </div>
              <ResponsiveTable<AgentRow>
                data={rhProductivite.topAgents}
                columns={agentColumns}
                density="compact"
                emptyMessage="Aucun agent"
              />
            </Card>
          </section>
        )}

        {/* Bottom agents */}
        {rhProductivite.bottomAgents && rhProductivite.bottomAgents.length > 0 && (
          <section>
            <SectionHeader
              icon={AlertTriangle}
              title="Agents a accompagner"
              subtitle="Agents avec la plus faible activite — a soutenir par du coaching ou de la formation"
            />
            <Card padding="none">
              <div className="flex items-center gap-2 px-3 sm:px-4 pt-3 pb-2">
                <AlertTriangle size={16} className="text-status-warning" />
                <span className="text-xs font-medium text-status-warning">Besoin d'accompagnement</span>
              </div>
              <ResponsiveTable<AgentRow>
                data={rhProductivite.bottomAgents}
                columns={agentColumns}
                density="compact"
                emptyMessage="Aucun agent"
              />
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
