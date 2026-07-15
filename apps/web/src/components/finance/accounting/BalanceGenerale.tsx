import React, { useState, useCallback, useMemo } from 'react';
import { Download, Printer, BarChart3, RefreshCw } from 'lucide-react';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';
import { useBalanceGenerale, useAccountingWebSocket } from '../../../hooks/accounting/useAccounting';
// Interface moved to exports file, or keep it. Let's keep it but just import the export functions.
import { exportBalanceGeneraleExcel, exportBalanceGeneralePDF, BalanceCompteExport } from './exports/balanceGeneraleExports';

interface BalanceCompte extends BalanceCompteExport {}

export default function BalanceGenerale() {
  const branding = useDocumentBranding();
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

  const handleExportExcel = useCallback(async () => {
    await exportBalanceGeneraleExcel(filteredBalance, totaux);
  }, [filteredBalance, totaux]);

  const handleExportPDF = useCallback(async () => {
    await exportBalanceGeneralePDF(
      filteredBalance,
      totaux,
      dateDebut,
      dateFin,
      isEquilibre,
      branding,
      formatMontant
    );
  }, [filteredBalance, totaux, dateDebut, dateFin, isEquilibre, branding, formatMontant]);

  return (
    <div className="space-y-3">
      {/* Header compact - UNE SEULE LIGNE */}
      <div className="bg-gradient-to-r from-status-success to-status-success rounded-xl p-3">
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
                <div className="text-base font-bold text-white leading-none">
                  {formatCompact(totaux.solde_debiteur)}
                </div>
                <div className="text-[9px] text-white/70">Solde D.</div>
              </div>
            </div>
            <div className="bg-white/15 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div>
                <div className="text-base font-bold text-white leading-none">
                  {formatCompact(totaux.solde_crediteur)}
                </div>
                <div className="text-[9px] text-white/70">Solde C.</div>
              </div>
            </div>
          </div>

          {/* Indicateur équilibre */}
          <div className="px-2 py-1 rounded-full text-[10px] font-bold flex-shrink-0 bg-white/25 text-white">
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
      <div className="bg-surface rounded-xl p-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Date Début */}
          <div className="flex-1 min-w-[140px] max-w-[180px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1">Date Début</label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full bg-surface-elevated text-content-primary text-xs px-3 py-2 rounded-lg border border-edge-strong focus:outline-none focus:ring-1 focus:ring-status-success"
            />
          </div>

          {/* Date Fin */}
          <div className="flex-1 min-w-[140px] max-w-[180px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1">Date Fin</label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full bg-surface-elevated text-content-primary text-xs px-3 py-2 rounded-lg border border-edge-strong focus:outline-none focus:ring-1 focus:ring-status-success"
            />
          </div>

          {/* Classe */}
          <div className="flex-1 min-w-[160px] max-w-[200px]">
            <label className="block text-[10px] font-medium text-content-muted mb-1">Classe</label>
            <select
              value={filtreClasse}
              onChange={(e) => setFiltreClasse(e.target.value)}
              className="w-full bg-surface-elevated text-content-primary text-xs px-3 py-2 rounded-lg border border-edge-strong focus:outline-none focus:ring-1 focus:ring-status-success"
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
            className="px-4 py-2 bg-status-success hover:bg-status-success disabled:opacity-50 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="bg-surface rounded-xl overflow-hidden">
        {loading ? (
          <div className="animate-pulse">
            {/* Table header skeleton */}
            <div className="h-10 bg-surface-elevated/50 rounded-t-lg" />
            {/* Table rows skeleton */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-edge/20">
                <div className="h-3 bg-surface-elevated rounded w-16" />
                <div className="h-3 bg-surface-elevated rounded flex-1" />
                <div className="h-3 bg-surface-elevated rounded w-24" />
                <div className="h-3 bg-surface-elevated rounded w-24" />
                <div className="h-3 bg-surface-elevated rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Message d'équilibre/déséquilibre compact */}
            {!isEquilibre && (
              <div className="bg-status-danger-bg border-b border-status-danger/30 px-4 py-2 flex items-center gap-2">
                <BarChart3 className="text-status-danger w-4 h-4" />
                <span className="text-xs font-medium text-status-danger">
                  Balance Déséquilibrée • Écart: {Math.abs(totaux.debit - totaux.credit).toLocaleString()} FCFA
                </span>
              </div>
            )}

            {/* Tableau */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-elevated/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-content-muted">N° Compte</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-content-muted">Intitulé</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-content-muted hidden md:table-cell">Type</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-content-muted">Débit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-content-muted">Crédit</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-content-muted hidden lg:table-cell">Solde D.</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-content-muted hidden lg:table-cell">Solde C.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/50">
                  {filteredBalance.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-content-muted text-sm">
                        Aucune écriture validée pour cette période
                      </td>
                    </tr>
                  ) : (
                    filteredBalance.map((compte) => {
                      return (
                        <tr key={compte.compteId || compte.numeroCompte} className="hover:bg-surface-elevated/30 transition-colors">
                          <td className="px-3 py-2">
                            <span className="text-accent font-mono text-xs font-medium">{compte.numeroCompte}</span>
                          </td>
                          <td className="px-3 py-2 text-content-primary text-xs truncate max-w-[200px]">{compte.intitule}</td>
                          <td className="px-3 py-2 hidden md:table-cell">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              compte.typeCompte === 'Actif' ? 'bg-status-success-bg text-status-success' :
                              compte.typeCompte === 'Passif' ? 'bg-status-info-bg text-status-info' :
                              compte.typeCompte === 'Charge' ? 'bg-status-danger-bg text-status-danger' :
                              compte.typeCompte === 'Produit' ? 'bg-status-info-bg text-status-info' :
                              'bg-surface-subtle/40 text-content-muted'
                            }`}>
                              {compte.typeCompte}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-content-primary text-xs font-mono">
                            {compte.totalDebit > 0 ? compte.totalDebit.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-content-primary text-xs font-mono">
                            {compte.totalCredit > 0 ? compte.totalCredit.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-status-success text-xs font-mono font-medium hidden lg:table-cell">
                            {compte.soldeDebiteur > 0 ? compte.soldeDebiteur.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 text-right text-accent text-xs font-mono font-medium hidden lg:table-cell">
                            {compte.soldeCrediteur > 0 ? compte.soldeCrediteur.toLocaleString() : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-surface-elevated">
                  <tr className="font-bold">
                    <td colSpan={3} className="px-3 py-2 text-content-primary text-sm">TOTAUX</td>
                    <td className="px-3 py-2 text-right text-status-info text-sm font-mono">
                      {totaux.debit.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-status-info text-sm font-mono">
                      {totaux.credit.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-status-success text-sm font-mono hidden lg:table-cell">
                      {totaux.solde_debiteur.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-accent text-sm font-mono hidden lg:table-cell">
                      {totaux.solde_crediteur.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Message équilibre en bas */}
            {isEquilibre && filteredBalance.length > 0 && (
              <div className="bg-status-success-bg border-t border-status-success/30 px-4 py-2 flex items-center gap-2">
                <BarChart3 className="text-status-success w-4 h-4" />
                <span className="text-xs font-medium text-status-success">
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