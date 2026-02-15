/**
 * KPI Excel Export — Multi-sheet workbook export
 *
 * Uses the global currency system for formatting monetary values.
 *
 * Sheets:
 * 1. Dashboard (vue d'ensemble — key metrics)
 * 2. Crédit (encours, décaissements, répartition par plan)
 * 3. Risque (PAR, taux recouvrement/défaut)
 * 4. Tontines & Épargne
 * 5. Rentabilité (P&L)
 * 6. Trésorerie
 * 7. RH & Productivité (+ top/bottom agents)
 * 8. Clients
 * 9. Données brutes (full JSON)
 */
import { loadExcelLibrary } from '@/lib/lazy-export';
import { formatMoney } from '@shared/config/currency';
import type { KpiPayload } from '@shared/schema/kpi';

interface ExportOptions {
  periodType: string;
  periodKey: string;
  agencyName?: string;
}

function fmtNum(n: number | null | undefined): number | string {
  if (n == null || isNaN(n)) return '';
  return n;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '';
  return `${n.toFixed(1)}%`;
}

function fmtCur(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '';
  return formatMoney(n);
}

export async function exportKpiToExcel(payload: KpiPayload, options: ExportOptions) {
  const XLSX = await loadExcelLibrary();
  const wb = XLSX.utils.book_new();

  const { periodType, periodKey, agencyName } = options;
  const periodLabel = periodType === 'monthly' ? `Mois ${periodKey}` : `Annee ${periodKey}`;
  const scope = agencyName || 'Consolide';

  // ---------------------------------------------------------------
  // 1. Dashboard
  // ---------------------------------------------------------------
  const dashboardData = [
    ['KPI & Pilotage — Vue d\'ensemble'],
    ['Periode', periodLabel],
    ['Scope', scope],
    [''],
    ['--- CREDIT ---'],
    ['Encours total actif', fmtCur(payload.credit.encoursTotalActif)],
    ['Credits actifs', fmtNum(payload.credit.nombreCreditsActifs)],
    ['Decaissements periode', fmtCur(payload.credit.decaissementsPeriode)],
    ['Panier moyen', fmtCur(payload.credit.panierMoyen)],
    ['Taux d\'approbation', fmtPct(payload.credit.tauxApprobation)],
    [''],
    ['--- RISQUE ---'],
    ['PAR > 30j', fmtPct(payload.risque.par30)],
    ['PAR > 60j', fmtPct(payload.risque.par60)],
    ['PAR > 90j', fmtPct(payload.risque.par90)],
    ['Taux recouvrement', fmtPct(payload.risque.tauxRecouvrement)],
    ['Taux defaut', fmtPct(payload.risque.tauxDefaut)],
    [''],
    ['--- RENTABILITE ---'],
    ['Total revenus', fmtCur(payload.rentabilite.totalRevenus)],
    ['Charges', fmtCur(payload.rentabilite.charges)],
    ['Resultat net', fmtCur(payload.rentabilite.resultatNet)],
    [''],
    ['--- CLIENTS ---'],
    ['Clients actifs', fmtNum(payload.clients.totalClientsActifs)],
    ['Nouveaux clients', fmtNum(payload.clients.nouveauxClients)],
    ['Taux retention', fmtPct(payload.clients.tauxRetention)],
    [''],
    ['--- RH ---'],
    ['Agents actifs', fmtNum(payload.rhProductivite.agentsActifs)],
    ['Clients / agent', fmtNum(payload.rhProductivite.clientsParAgent)],
    ['Masse salariale', fmtCur(payload.rhProductivite.masseSalariale)],
  ];
  const wsDash = XLSX.utils.aoa_to_sheet(dashboardData);
  wsDash['!cols'] = [{ wch: 25 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsDash, 'Dashboard');

  // ---------------------------------------------------------------
  // 2. Crédit
  // ---------------------------------------------------------------
  const creditData = [
    ['Credit — Detail'],
    ['Periode', periodLabel],
    [''],
    ['Indicateur', 'Valeur'],
    ['Encours total actif', fmtCur(payload.credit.encoursTotalActif)],
    ['Credits actifs', fmtNum(payload.credit.nombreCreditsActifs)],
    ['Decaissements periode', fmtCur(payload.credit.decaissementsPeriode)],
    ['Nombre decaissements', fmtNum(payload.credit.nombreDecaissements)],
    ['Taux d\'approbation', fmtPct(payload.credit.tauxApprobation)],
    ['Panier moyen', fmtCur(payload.credit.panierMoyen)],
    [''],
    ['Repartition par plan'],
    ['Plan', 'Nombre', 'Montant decaisse', 'Encours'],
    ...payload.credit.repartitionParPlan.map((p) => [
      p.planNom,
      fmtNum(p.count),
      fmtCur(p.montant),
      fmtCur(p.encours),
    ]),
  ];
  const wsCredit = XLSX.utils.aoa_to_sheet(creditData);
  wsCredit['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 22 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsCredit, 'Credit');

  // ---------------------------------------------------------------
  // 3. Risque
  // ---------------------------------------------------------------
  const risqueData = [
    ['Risque — Qualite du portefeuille'],
    ['Periode', periodLabel],
    [''],
    ['Indicateur', 'Valeur'],
    ['PAR > 30 jours', fmtPct(payload.risque.par30)],
    ['PAR > 60 jours', fmtPct(payload.risque.par60)],
    ['PAR > 90 jours', fmtPct(payload.risque.par90)],
    ['Taux de recouvrement', fmtPct(payload.risque.tauxRecouvrement)],
    ['Taux de defaut', fmtPct(payload.risque.tauxDefaut)],
    ['Taux de radiation', fmtPct(payload.risque.tauxRadiation)],
    ['Credits en souffrance', fmtNum(payload.risque.creditsEnSouffrance)],
    ['Montant en souffrance', fmtCur(payload.risque.montantEnSouffrance)],
  ];
  const wsRisque = XLSX.utils.aoa_to_sheet(risqueData);
  wsRisque['!cols'] = [{ wch: 25 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsRisque, 'Risque');

  // ---------------------------------------------------------------
  // 4. Tontines & Épargne
  // ---------------------------------------------------------------
  const tontineData = [
    ['Tontines & Epargne'],
    ['Periode', periodLabel],
    [''],
    ['Indicateur', 'Valeur'],
    ['Encours epargne', fmtCur(payload.tontinesEpargne.encoursEpargne)],
    ['Encours comptes courants', fmtCur(payload.tontinesEpargne.encoursComptesCourants)],
    ['Tontines actives', fmtNum(payload.tontinesEpargne.tontinesActives)],
    ['Membres tontines', fmtNum(payload.tontinesEpargne.membresTontines)],
    ['Volumes collectes', fmtCur(payload.tontinesEpargne.volumesCollectes)],
    ['Volumes retires', fmtCur(payload.tontinesEpargne.volumesRetires)],
    ['Cotisations tontines', fmtCur(payload.tontinesEpargne.cotisationsTontines)],
  ];
  const wsTontine = XLSX.utils.aoa_to_sheet(tontineData);
  wsTontine['!cols'] = [{ wch: 25 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsTontine, 'Tontines Epargne');

  // ---------------------------------------------------------------
  // 5. Rentabilité
  // ---------------------------------------------------------------
  const rentData = [
    ['Rentabilite — Compte de resultat'],
    ['Periode', periodLabel],
    [''],
    ['Indicateur', 'Valeur'],
    ['Interets percus', fmtCur(payload.rentabilite.interetsPercus)],
    ['Frais & commissions', fmtCur(payload.rentabilite.fraisCommissions)],
    ['Revenus tontines', fmtCur(payload.rentabilite.revenusTontines)],
    ['Total revenus', fmtCur(payload.rentabilite.totalRevenus)],
    ['Charges', fmtCur(payload.rentabilite.charges)],
    ['Resultat net', fmtCur(payload.rentabilite.resultatNet)],
    ['Ratio charges / encours', fmtPct(payload.rentabilite.ratioChargesEncours)],
  ];
  const wsRent = XLSX.utils.aoa_to_sheet(rentData);
  wsRent['!cols'] = [{ wch: 25 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsRent, 'Rentabilite');

  // ---------------------------------------------------------------
  // 6. Trésorerie
  // ---------------------------------------------------------------
  const tresoData = [
    ['Tresorerie'],
    ['Periode', periodLabel],
    [''],
    ['Indicateur', 'Valeur'],
    ['Solde caisses', fmtCur(payload.tresorerie.soldeCaisses)],
    ['Solde coffres', fmtCur(payload.tresorerie.soldeCoffres)],
    ['Solde banque', fmtCur(payload.tresorerie.soldeBanque)],
    ['Solde mobile money', fmtCur(payload.tresorerie.soldeMobileMoney)],
    ['Flux entrants', fmtCur(payload.tresorerie.fluxEntrants)],
    ['Flux sortants', fmtCur(payload.tresorerie.fluxSortants)],
    ['Ratio de liquidite', fmtPct(payload.tresorerie.ratioLiquidite)],
    ['Ecarts de caisse', fmtCur(payload.tresorerie.ecartsCaisses)],
  ];
  const wsTreso = XLSX.utils.aoa_to_sheet(tresoData);
  wsTreso['!cols'] = [{ wch: 25 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsTreso, 'Tresorerie');

  // ---------------------------------------------------------------
  // 7. RH & Productivité
  // ---------------------------------------------------------------
  const rhData = [
    ['RH & Productivite'],
    ['Periode', periodLabel],
    [''],
    ['Indicateur', 'Valeur'],
    ['Agents actifs', fmtNum(payload.rhProductivite.agentsActifs)],
    ['Clients / agent', fmtNum(payload.rhProductivite.clientsParAgent)],
    ['Encours / agent', fmtCur(payload.rhProductivite.encoursParAgent)],
    ['Decaissements / agent', fmtNum(payload.rhProductivite.decaissementsParAgent)],
    ['Masse salariale', fmtCur(payload.rhProductivite.masseSalariale)],
    [''],
    ['Top agents'],
    ['Prenom', 'Nom', 'Clients', 'Decaissements', 'Montant'],
    ...payload.rhProductivite.topAgents.map((a) => [
      a.prenom, a.nom, fmtNum(a.clients), fmtNum(a.decaissements), fmtCur(a.montant),
    ]),
    [''],
    ['Agents a accompagner'],
    ['Prenom', 'Nom', 'Clients', 'Decaissements', 'Montant'],
    ...payload.rhProductivite.bottomAgents.map((a) => [
      a.prenom, a.nom, fmtNum(a.clients), fmtNum(a.decaissements), fmtCur(a.montant),
    ]),
  ];
  const wsRh = XLSX.utils.aoa_to_sheet(rhData);
  wsRh['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsRh, 'RH Productivite');

  // ---------------------------------------------------------------
  // 8. Clients
  // ---------------------------------------------------------------
  const segmentEntries = Object.entries(payload.clients.clientsParSegment || {});
  const clientsData = [
    ['Clients'],
    ['Periode', periodLabel],
    [''],
    ['Indicateur', 'Valeur'],
    ['Total clients actifs', fmtNum(payload.clients.totalClientsActifs)],
    ['Nouveaux clients', fmtNum(payload.clients.nouveauxClients)],
    ['Taux de retention', fmtPct(payload.clients.tauxRetention)],
    [''],
    ['Clients par segment'],
    ['Segment', 'Nombre'],
    ...segmentEntries.map(([seg, count]) => [seg, fmtNum(count)]),
  ];
  const wsClients = XLSX.utils.aoa_to_sheet(clientsData);
  wsClients['!cols'] = [{ wch: 25 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsClients, 'Clients');

  // ---------------------------------------------------------------
  // 9. Données brutes (full JSON)
  // ---------------------------------------------------------------
  const rawData: (string | number)[][] = [
    ['Donnees brutes (JSON)'],
    ['Periode', periodLabel],
    ['Scope', scope],
    [''],
    ['Domaine', 'Cle', 'Valeur'],
  ];

  for (const [domain, values] of Object.entries(payload)) {
    if (domain === 'deltas') continue;
    if (typeof values === 'object' && values !== null && !Array.isArray(values)) {
      for (const [key, val] of Object.entries(values as Record<string, unknown>)) {
        if (Array.isArray(val)) {
          rawData.push([domain, key, `[${val.length} items]`]);
        } else if (typeof val === 'object' && val !== null) {
          rawData.push([domain, key, JSON.stringify(val)]);
        } else {
          rawData.push([domain, key, val as string | number]);
        }
      }
    }
  }

  const wsRaw = XLSX.utils.aoa_to_sheet(rawData);
  wsRaw['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Donnees brutes');

  // ---------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------
  const filename = `KPI_${scope.replace(/\s+/g, '_')}_${periodKey}.xlsx`;
  XLSX.writeFile(wb, filename);
}
