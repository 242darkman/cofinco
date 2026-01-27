import React, { useState, useCallback, useMemo } from 'react';
import { Download, Printer, Filter, Calendar, BarChart3, RefreshCw, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { toast, handleApiError } from '../../../lib/toast';
import { useBalanceGenerale, useAccountingWebSocket } from '../../../hooks/accounting/useAccounting';

interface BalanceCompte {
  compteId: string;
  numeroCompte: string;
  intitule: string;
  classe: number;
  typeCompte: string;
  sensNormal: string;
  totalDebit: number;
  totalCredit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
}

export default function BalanceGenerale() {
  const [dateDebut, setDateDebut] = useState(new Date().getFullYear() + '-01-01');
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);
  const [filtreClasse, setFiltreClasse] = useState<string>('all');

  // Real-time WebSocket invalidation
  useAccountingWebSocket();

  // React Query - replaces manual fetch + useState
  const classeParam = filtreClasse !== 'all' ? parseInt(filtreClasse) : undefined;
  const { data, isLoading: loading, refetch: fetchBalance } = useBalanceGenerale({
    dateDebut,
    dateFin,
    classe: classeParam,
  });

  const filteredBalance: BalanceCompte[] = useMemo(() => data?.entries || [], [data]);
  const totalsFromApi = data?.totals || null;

  const totaux = totalsFromApi ? {
    debit: totalsFromApi.totalDebits,
    credit: totalsFromApi.totalCredits,
    solde_debiteur: totalsFromApi.totalSoldeDebiteur,
    solde_crediteur: totalsFromApi.totalSoldeCrediteur
  } : filteredBalance.reduce((acc, compte) => ({
    debit: acc.debit + (compte.totalDebit || 0),
    credit: acc.credit + (compte.totalCredit || 0),
    solde_debiteur: acc.solde_debiteur + (compte.soldeDebiteur || 0),
    solde_crediteur: acc.solde_crediteur + (compte.soldeCrediteur || 0)
  }), { debit: 0, credit: 0, solde_debiteur: 0, solde_crediteur: 0 });

  const isEquilibre = totalsFromApi?.isBalanced ?? (
    Math.abs(totaux.debit - totaux.credit) < 0.01 &&
    Math.abs(totaux.solde_debiteur - totaux.solde_crediteur) < 0.01
  );

  const formatMontant = (montant: number) => {
    return montant.toLocaleString('fr-FR') + ' FCFA';
  };

  const formatCompact = (montant: number) => {
    if (montant >= 1000000000) return (montant / 1000000000).toFixed(1) + 'Md';
    if (montant >= 1000000) return (montant / 1000000).toFixed(1) + 'M';
    if (montant >= 1000) return (montant / 1000).toFixed(1) + 'K';
    return montant.toString();
  };

  const handleExportExcel = useCallback(() => {
    if (filteredBalance.length === 0) {
      toast.warning('Aucune donnee a exporter');
      return;
    }
    try {
      const data = filteredBalance.map(compte => ({
        'N Compte': compte.numeroCompte || '',
        'Intitule': compte.intitule,
        'Type': compte.typeCompte || '',
        'Total Debit': compte.totalDebit ?? 0,
        'Total Credit': compte.totalCredit ?? 0,
        'Solde Debiteur': compte.soldeDebiteur ?? 0,
        'Solde Crediteur': compte.soldeCrediteur ?? 0
      }));

      data.push({
        'N Compte': 'TOTAUX',
        'Intitule': '',
        'Type': '',
        'Total Debit': totaux.debit,
        'Total Credit': totaux.credit,
        'Solde Debiteur': totaux.solde_debiteur,
        'Solde Crediteur': totaux.solde_crediteur
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Balance Générale');
      XLSX.writeFile(wb, `Balance_Generale_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Export Excel réussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export Excel"));
    }
  }, [filteredBalance, totaux]);

  const handleExportPDF = useCallback(() => {
    if (filteredBalance.length === 0) {
      toast.warning('Aucune donnée à exporter');
      return;
    }
    try {
      const doc = new jsPDF('landscape');

      doc.setFontSize(22);
      doc.setTextColor(30, 58, 138);
      doc.text('BALANCE GENERALE OHADA', 148, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text('COFIN&CO-M - Systeme Comptable OHADA', 148, 30, { align: 'center' });
      doc.text(`Periode: ${dateDebut} au ${dateFin}`, 148, 38, { align: 'center' });
      doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, 148, 46, { align: 'center' });

      doc.setDrawColor(30, 58, 138);
      doc.line(20, 52, 277, 52);

      doc.setFontSize(10);
      doc.setTextColor(255);
      doc.setFillColor(30, 58, 138);
      doc.rect(20, 58, 257, 10, 'F');
      doc.text('N° Compte', 25, 65);
      doc.text('Intitule', 60, 65);
      doc.text('Type', 140, 65);
      doc.text('Debit', 175, 65);
      doc.text('Credit', 205, 65);
      doc.text('Solde D.', 235, 65);
      doc.text('Solde C.', 260, 65);

      doc.setTextColor(0);
      let y = 75;
      const maxRows = Math.min(filteredBalance.length, 20);

      filteredBalance.slice(0, maxRows).forEach((compte) => {
        doc.setFontSize(9);
        doc.text(compte.numeroCompte || '', 25, y);
        doc.text((compte.intitule || '').substring(0, 40), 60, y);
        doc.text(compte.typeCompte || '', 140, y);
        doc.text((compte.totalDebit ?? 0).toLocaleString('fr-FR'), 175, y);
        doc.text((compte.totalCredit ?? 0).toLocaleString('fr-FR'), 205, y);
        doc.text((compte.soldeDebiteur ?? 0).toLocaleString('fr-FR'), 235, y);
        doc.text((compte.soldeCrediteur ?? 0).toLocaleString('fr-FR'), 260, y);
        y += 8;
      });

      if (filteredBalance.length > maxRows) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`... et ${filteredBalance.length - maxRows} autres comptes`, 25, y);
        y += 10;
      }

      y += 5;
      doc.setFillColor(30, 58, 138);
      doc.rect(20, y - 5, 257, 12, 'F');
      doc.setFontSize(10);
      doc.setTextColor(255);
      doc.text('TOTAUX', 25, y + 3);
      doc.text(formatMontant(totaux.debit), 175, y + 3);
      doc.text(formatMontant(totaux.credit), 205, y + 3);
      doc.text(formatMontant(totaux.solde_debiteur), 235, y + 3);
      doc.text(formatMontant(totaux.solde_crediteur), 260, y + 3);

      y += 20;
      doc.setFontSize(10);
      if (isEquilibre) {
        doc.setTextColor(0);
        doc.setFillColor(34, 197, 94);
      } else {
        doc.setTextColor(255);
        doc.setFillColor(239, 68, 68);
      }
      doc.rect(20, y, 100, 12, 'F');
      doc.text(isEquilibre ? 'Balance Equilibree' : 'Balance Desequilibree', 25, y + 8);

      doc.save(`Balance_Generale_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Export PDF réussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export PDF"));
    }
  }, [filteredBalance, totaux, dateDebut, dateFin, isEquilibre, formatMontant]);

  return (
    <div className="space-y-3">
      {/* Header compact - UNE SEULE LIGNE */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          {/* Titre */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">Balance Générale OHADA</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">Synthèse des soldes</p>
            </div>
          </div>

          {/* Séparateur */}
          <div className="w-px h-10 bg-white/20 flex-shrink-0" />

          {/* Stats inline compactes */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-white leading-none">
                  {formatCompact(totaux.debit)}
                </div>
                <div className="text-[9px] text-white/70">Débits</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-white leading-none">
                  {formatCompact(totaux.credit)}
                </div>
                <div className="text-[9px] text-white/70">Crédits</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-green-300 leading-none">
                  {formatCompact(totaux.solde_debiteur)}
                </div>
                <div className="text-[9px] text-white/70">Solde D.</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-cyan-300 leading-none">
                  {formatCompact(totaux.solde_crediteur)}
                </div>
                <div className="text-[9px] text-white/70">Solde C.</div>
              </div>
            </div>
          </div>

          {/* Indicateur équilibre */}
          <div className={`px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0 ${
            isEquilibre 
              ? 'bg-green-400/30 text-green-200' 
              : 'bg-red-400/30 text-red-200'
          }`}>
            {isEquilibre ? '✓ Équilibrée' : '✗ Déséquilibrée'}
          </div>

          {/* Spacer */}
          <div className="flex-1 min-w-4" />

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <button 
              onClick={handleExportExcel}
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
            <button 
              onClick={handleExportPDF}
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filtres compacts */}
      <div className="bg-slate-800 rounded-xl p-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Date Début */}
          <div className="flex-1 min-w-[140px] max-w-[180px]">
            <label className="block text-[10px] font-medium text-slate-400 mb-1">Date Début</label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full bg-slate-700 text-white text-xs px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* Date Fin */}
          <div className="flex-1 min-w-[140px] max-w-[180px]">
            <label className="block text-[10px] font-medium text-slate-400 mb-1">Date Fin</label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full bg-slate-700 text-white text-xs px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          {/* Classe */}
          <div className="flex-1 min-w-[160px] max-w-[200px]">
            <label className="block text-[10px] font-medium text-slate-400 mb-1">Classe</label>
            <select
              value={filtreClasse}
              onChange={(e) => setFiltreClasse(e.target.value)}
              className="w-full bg-slate-700 text-white text-xs px-3 py-2 rounded-lg border border-slate-600 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="all">Toutes les classes</option>
              <option value="1">1 - Ressources Durables</option>
              <option value="2">2 - Actif Immobilisé</option>
              <option value="3">3 - Stocks</option>
              <option value="4">4 - Tiers</option>
              <option value="5">5 - Trésorerie</option>
              <option value="6">6 - Charges</option>
              <option value="7">7 - Produits</option>
              <option value="8">8 - Résultats</option>
            </select>
          </div>

          {/* Bouton Actualiser */}
          <button
            onClick={() => fetchBalance()}
            disabled={loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            {/* Table header skeleton */}
            <div className="h-10 bg-slate-700/50 rounded-t-lg" />
            {/* Table rows skeleton */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-slate-700/20">
                <div className="h-3 bg-slate-700 rounded w-16" />
                <div className="h-3 bg-slate-700 rounded flex-1" />
                <div className="h-3 bg-slate-700 rounded w-24" />
                <div className="h-3 bg-slate-700 rounded w-24" />
                <div className="h-3 bg-slate-700 rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Message d'équilibre/déséquilibre compact */}
            {!isEquilibre && (
              <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 flex items-center gap-2">
                <BarChart3 className="text-red-400 w-4 h-4" />
                <span className="text-xs font-medium text-red-400">
                  Balance Déséquilibrée • Écart: {Math.abs(totaux.debit - totaux.credit).toLocaleString()} FCFA
                </span>
              </div>
            )}

            {/* Tableau */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">N° Compte</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-400">Intitulé</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-400 hidden md:table-cell">Type</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Débit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-400">Crédit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 hidden lg:table-cell">Solde D.</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-400 hidden lg:table-cell">Solde C.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredBalance.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">
                        Aucune écriture validée pour cette période
                      </td>
                    </tr>
                  ) : (
                    filteredBalance.map((compte) => {
                      return (
                        <tr key={compte.compteId || compte.numeroCompte} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-3 py-2">
                            <span className="text-cyan-400 font-mono text-xs font-medium">{compte.numeroCompte}</span>
                          </td>
                          <td className="px-3 py-2 text-white text-xs truncate max-w-[200px]">{compte.intitule}</td>
                          <td className="px-3 py-2 hidden md:table-cell">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              compte.typeCompte === 'Actif' ? 'bg-green-500/20 text-green-400' :
                              compte.typeCompte === 'Passif' ? 'bg-blue-500/20 text-blue-400' :
                              compte.typeCompte === 'Charge' ? 'bg-red-500/20 text-red-400' :
                              compte.typeCompte === 'Produit' ? 'bg-purple-500/20 text-purple-400' :
                              'bg-slate-500/20 text-slate-400'
                            }`}>
                              {compte.typeCompte}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-white text-xs font-mono">
                            {compte.totalDebit > 0 ? compte.totalDebit.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-white text-xs font-mono">
                            {compte.totalCredit > 0 ? compte.totalCredit.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-green-400 text-xs font-mono font-medium hidden lg:table-cell">
                            {compte.soldeDebiteur > 0 ? compte.soldeDebiteur.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-cyan-400 text-xs font-mono font-medium hidden lg:table-cell">
                            {compte.soldeCrediteur > 0 ? compte.soldeCrediteur.toLocaleString() : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-700">
                  <tr className="font-bold">
                    <td colSpan={3} className="px-3 py-2 text-white text-sm">TOTAUX</td>
                    <td className="px-3 py-2 text-right text-blue-400 text-sm font-mono">
                      {totaux.debit.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-blue-400 text-sm font-mono">
                      {totaux.credit.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-green-400 text-sm font-mono hidden lg:table-cell">
                      {totaux.solde_debiteur.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-cyan-400 text-sm font-mono hidden lg:table-cell">
                      {totaux.solde_crediteur.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Message équilibre en bas */}
            {isEquilibre && filteredBalance.length > 0 && (
              <div className="bg-green-500/10 border-t border-green-500/30 px-4 py-2 flex items-center gap-2">
                <BarChart3 className="text-green-400 w-4 h-4" />
                <span className="text-xs font-medium text-green-400">
                  Balance Équilibrée ✓ • Conforme aux normes OHADA
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}