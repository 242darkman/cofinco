/**
 * KPI Overview Tab — Executive dashboard with hero metrics and sectioned KPIs
 */
import StatCard from '@/components/ui/StatCard';
import {
  Briefcase,
  ShieldAlert,
  PiggyBank,
  TrendingUp,
  Wallet,
  Users,
  UserCheck,
  AlertTriangle,
  CircleDollarSign,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Landmark,
} from 'lucide-react';
import {
  fmtMoney,
  fmtMoneyShort,
  fmtNum,
  fmtPercent,
  deltaToTrend,
  deltaToTrendInverse,
  parColor,
  SectionHeader,
  HeroMetric,
} from '../kpi-utils';
import type { KpiPayload, KpiDeltas } from '@shared/schema/kpi';

interface Props {
  payload: KpiPayload;
  deltas: KpiDeltas | null;
}

export default function KpiOverviewTab({ payload, deltas }: Props) {
  const { credit, risque, tontinesEpargne, rentabilite, tresorerie, clients, rhProductivite } = payload;

  const isProfit = rentabilite.resultatNet >= 0;
  const totalLiquidite = tresorerie.soldeCaisses + tresorerie.soldeCoffres + tresorerie.soldeBanque + tresorerie.soldeMobileMoney;

  return (
    <div className="space-y-6">
      {/* ---- Hero metrics (4 key figures) ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <HeroMetric
          label="Encours credit"
          value={fmtMoneyShort(credit.encoursTotalActif)}
          icon={Briefcase}
          color="accent"
          delta={deltas?.credit?.encoursTotalActif}
          description="Solde total des credits actifs en cours"
        />
        <HeroMetric
          label="Resultat net"
          value={fmtMoneyShort(rentabilite.resultatNet)}
          icon={TrendingUp}
          color={isProfit ? 'success' : 'danger'}
          delta={deltas?.rentabilite?.resultatNet}
          description="Revenus moins charges sur la periode"
        />
        <HeroMetric
          label="PAR > 30 jours"
          value={fmtPercent(risque.par30)}
          icon={ShieldAlert}
          color={parColor(risque.par30) as any}
          delta={deltas?.risque?.par30}
          description="Part du portefeuille en retard de plus de 30 jours"
        />
        <HeroMetric
          label="Clients actifs"
          value={fmtNum(clients.totalClientsActifs)}
          icon={Users}
          color="accent"
          delta={deltas?.clients?.totalClientsActifs}
          description="Clients avec un compte actif"
        />
      </div>

      {/* ---- Activité crédit ---- */}
      <section>
        <SectionHeader
          icon={Briefcase}
          title="Activite credit"
          subtitle="Performance des decaissements et du portefeuille"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Decaissements periode"
            value={fmtMoney(credit.decaissementsPeriode)}
            icon={ArrowUpRight}
            color="success"
            subtitle="Montant total decaisse"
            {...deltaToTrend(deltas?.credit?.decaissementsPeriode)}
          />
          <StatCard
            title="Nombre de credits"
            value={fmtNum(credit.nombreCreditsActifs)}
            icon={CircleDollarSign}
            color="neutral"
            subtitle="Credits actifs en portefeuille"
            {...deltaToTrend(deltas?.credit?.nombreCreditsActifs)}
          />
          <StatCard
            title="Panier moyen"
            value={fmtMoney(credit.panierMoyen)}
            icon={BarChart3}
            color="neutral"
            subtitle="Montant moyen par credit"
            {...deltaToTrend(deltas?.credit?.panierMoyen)}
          />
          <StatCard
            title="Taux recouvrement"
            value={fmtPercent(risque.tauxRecouvrement)}
            icon={UserCheck}
            color="success"
            subtitle="Echeances remboursees / dues"
            {...deltaToTrend(deltas?.risque?.tauxRecouvrement)}
          />
        </div>
      </section>

      {/* ---- Trésorerie ---- */}
      <section>
        <SectionHeader
          icon={Wallet}
          title="Tresorerie"
          subtitle="Disponibilites et mouvements de fonds"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Liquidite totale"
            value={fmtMoney(totalLiquidite)}
            icon={Landmark}
            color="primary"
            subtitle="Caisses + coffres + banque + mobile money"
          />
          <StatCard
            title="Flux entrants"
            value={fmtMoney(tresorerie.fluxEntrants)}
            icon={ArrowDownRight}
            color="success"
            subtitle="Total des encaissements"
            {...deltaToTrend(deltas?.tresorerie?.fluxEntrants)}
          />
          <StatCard
            title="Flux sortants"
            value={fmtMoney(tresorerie.fluxSortants)}
            icon={ArrowUpRight}
            color="warning"
            subtitle="Total des decaissements"
            {...deltaToTrendInverse(deltas?.tresorerie?.fluxSortants)}
          />
          <StatCard
            title="Ecarts de caisse"
            value={fmtMoney(tresorerie.ecartsCaisses)}
            icon={AlertTriangle}
            color={Math.abs(tresorerie.ecartsCaisses) > 0 ? 'danger' : 'success'}
            subtitle="Difference theorique / reel"
            {...deltaToTrendInverse(deltas?.tresorerie?.ecartsCaisses)}
          />
        </div>
      </section>

      {/* ---- Épargne & Clients ---- */}
      <section>
        <SectionHeader icon={PiggyBank} title="Epargne & Clients" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Encours epargne"
            value={fmtMoney(tontinesEpargne.encoursEpargne)}
            icon={PiggyBank}
            color="primary"
            subtitle="Total des depots d'epargne"
            {...deltaToTrend(deltas?.tontinesEpargne?.encoursEpargne)}
          />
          <StatCard
            title="Tontines actives"
            value={fmtNum(tontinesEpargne.tontinesActives)}
            icon={CircleDollarSign}
            color="neutral"
            subtitle="Groupes de tontine en cours"
            {...deltaToTrend(deltas?.tontinesEpargne?.tontinesActives)}
          />
          <StatCard
            title="Nouveaux clients"
            value={fmtNum(clients.nouveauxClients)}
            icon={UserCheck}
            color="success"
            subtitle="Inscrits durant la periode"
            {...deltaToTrend(deltas?.clients?.nouveauxClients)}
          />
          <StatCard
            title="Taux retention"
            value={fmtPercent(clients.tauxRetention)}
            icon={Users}
            color="primary"
            subtitle="Clients restes actifs"
            {...deltaToTrend(deltas?.clients?.tauxRetention)}
          />
        </div>
      </section>

      {/* ---- RH ---- */}
      <section>
        <SectionHeader icon={Users} title="Ressources humaines" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            title="Agents actifs"
            value={fmtNum(rhProductivite.agentsActifs)}
            icon={Users}
            color="neutral"
            subtitle="Employes en activite"
            {...deltaToTrend(deltas?.rhProductivite?.agentsActifs)}
          />
          <StatCard
            title="Clients / agent"
            value={fmtNum(rhProductivite.clientsParAgent)}
            icon={Users}
            color="primary"
            subtitle="Ratio moyen"
            {...deltaToTrend(deltas?.rhProductivite?.clientsParAgent)}
          />
          <StatCard
            title="Encours / agent"
            value={fmtMoneyShort(rhProductivite.encoursParAgent)}
            icon={Wallet}
            color="primary"
            subtitle="Portefeuille moyen gere"
            {...deltaToTrend(deltas?.rhProductivite?.encoursParAgent)}
          />
          <StatCard
            title="Masse salariale"
            value={fmtMoney(rhProductivite.masseSalariale)}
            icon={Briefcase}
            color="neutral"
            subtitle="Salaires nets verses"
            {...deltaToTrendInverse(deltas?.rhProductivite?.masseSalariale)}
          />
        </div>
      </section>
    </div>
  );
}
