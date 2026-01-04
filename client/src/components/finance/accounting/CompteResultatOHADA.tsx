import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Download, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { comptabiliteApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface CompteResultat {
  chargesExploitation: number;
  chargesFinancieres: number;
  chargesExceptionnelles: number;
  totalCharges: number;
  produitsExploitation: number;
  produitsFinanciers: number;
  produitsExceptionnels: number;
  totalProduits: number;
  resultatExploitation: number;
  resultatFinancier: number;
  resultatExceptionnel: number;
  resultatNet: number;
}

const DEFAULT_RESULTAT: CompteResultat = {
  chargesExploitation: 0,
  chargesFinancieres: 0,
  chargesExceptionnelles: 0,
  totalCharges: 0,
  produitsExploitation: 0,
  produitsFinanciers: 0,
  produitsExceptionnels: 0,
  totalProduits: 0,
  resultatExploitation: 0,
  resultatFinancier: 0,
  resultatExceptionnel: 0,
  resultatNet: 0
};

export default function CompteResultatOHADA() {
  const [resultat, setResultat] = useState<CompteResultat | null>(null);
  const [loading, setLoading] = useState(false);
  const [exercice, setExercice] = useState('2024');

  const fetchResultat = useCallback(async () => {
    setLoading(true);
    try {
      const data = await comptabiliteApi.getCompteResultat(exercice);
      setResultat(data || DEFAULT_RESULTAT);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement du compte de résultat'));
      setResultat(DEFAULT_RESULTAT);
    } finally {
      setLoading(false);
    }
  }, [exercice]);

  useEffect(() => {
    fetchResultat();
  }, [fetchResultat]);

  const handleExportExcel = useCallback(() => {
    if (!resultat) {
      toast.warning('Aucune donnée à exporter');
      return;
    }
    try {
      const data = [
        { 'Catégorie': 'PRODUITS', 'Description': '', 'Montant (FCFA)': '' },
        { 'Catégorie': 'Exploitation (70-75)', 'Description': 'Ventes et services', 'Montant (FCFA)': resultat.produitsExploitation },
        { 'Catégorie': 'Financiers (77)', 'Description': 'Intérêts et dividendes', 'Montant (FCFA)': resultat.produitsFinanciers },
        { 'Catégorie': 'Exceptionnels (78)', 'Description': 'Produits HAO', 'Montant (FCFA)': resultat.produitsExceptionnels },
        { 'Catégorie': 'TOTAL PRODUITS', 'Description': '', 'Montant (FCFA)': resultat.totalProduits },
        { 'Catégorie': '', 'Description': '', 'Montant (FCFA)': '' },
        { 'Catégorie': 'CHARGES', 'Description': '', 'Montant (FCFA)': '' },
        { 'Catégorie': 'Exploitation (60-65)', 'Description': 'Achats et services', 'Montant (FCFA)': resultat.chargesExploitation },
        { 'Catégorie': 'Financières (67)', 'Description': 'Intérêts et frais', 'Montant (FCFA)': resultat.chargesFinancieres },
        { 'Catégorie': 'Exceptionnelles (68)', 'Description': 'Charges HAO', 'Montant (FCFA)': resultat.chargesExceptionnelles },
        { 'Catégorie': 'TOTAL CHARGES', 'Description': '', 'Montant (FCFA)': resultat.totalCharges },
        { 'Catégorie': '', 'Description': '', 'Montant (FCFA)': '' },
        { 'Catégorie': 'RESULTATS', 'Description': '', 'Montant (FCFA)': '' },
        { 'Catégorie': 'Résultat Exploitation', 'Description': '', 'Montant (FCFA)': resultat.resultatExploitation },
        { 'Catégorie': 'Résultat Financier', 'Description': '', 'Montant (FCFA)': resultat.resultatFinancier },
        { 'Catégorie': 'Résultat Exceptionnel', 'Description': '', 'Montant (FCFA)': resultat.resultatExceptionnel },
        { 'Catégorie': 'RESULTAT NET', 'Description': '', 'Montant (FCFA)': resultat.resultatNet }
      ];

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Compte Résultat');
      XLSX.writeFile(wb, `Compte_Resultat_OHADA_${exercice}.xlsx`);
      toast.success('Export Excel réussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export Excel"));
    }
  }, [resultat, exercice]);

  const handleExportPDF = useCallback(() => {
    if (!resultat) {
      toast.warning('Aucune donnée à exporter');
      return;
    }
    try {
      const doc = new jsPDF();

      doc.setFontSize(22);
      doc.setTextColor(30, 58, 138);
      doc.text('COMPTE DE RESULTAT OHADA', 105, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text('COFIN&CO-M - Systeme Comptable OHADA', 105, 30, { align: 'center' });
      doc.text(`Exercice ${exercice}`, 105, 38, { align: 'center' });

      doc.setDrawColor(30, 58, 138);
      doc.line(20, 45, 190, 45);

      doc.setFontSize(14);
      doc.setTextColor(0, 128, 0);
      doc.text('PRODUITS (Classe 7)', 20, 55);

      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Produits Exploitation (70-75)', 25, 65);
      doc.text(resultat.produitsExploitation.toLocaleString('fr-FR') + ' FCFA', 170, 65, { align: 'right' });
      doc.text('Produits Financiers (77)', 25, 73);
      doc.text(resultat.produitsFinanciers.toLocaleString('fr-FR') + ' FCFA', 170, 73, { align: 'right' });
      doc.text('Produits Exceptionnels (78)', 25, 81);
      doc.text(resultat.produitsExceptionnels.toLocaleString('fr-FR') + ' FCFA', 170, 81, { align: 'right' });

      doc.setFontSize(12);
      doc.setTextColor(0, 128, 0);
      doc.text('TOTAL PRODUITS', 25, 92);
      doc.text(resultat.totalProduits.toLocaleString('fr-FR') + ' FCFA', 170, 92, { align: 'right' });

      doc.setFontSize(14);
      doc.setTextColor(220, 38, 38);
      doc.text('CHARGES (Classe 6)', 20, 108);

      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Charges Exploitation (60-65)', 25, 118);
      doc.text(resultat.chargesExploitation.toLocaleString('fr-FR') + ' FCFA', 170, 118, { align: 'right' });
      doc.text('Charges Financieres (67)', 25, 126);
      doc.text(resultat.chargesFinancieres.toLocaleString('fr-FR') + ' FCFA', 170, 126, { align: 'right' });
      doc.text('Charges Exceptionnelles (68)', 25, 134);
      doc.text(resultat.chargesExceptionnelles.toLocaleString('fr-FR') + ' FCFA', 170, 134, { align: 'right' });

      doc.setFontSize(12);
      doc.setTextColor(220, 38, 38);
      doc.text('TOTAL CHARGES', 25, 145);
      doc.text(resultat.totalCharges.toLocaleString('fr-FR') + ' FCFA', 170, 145, { align: 'right' });

      doc.setDrawColor(30, 58, 138);
      doc.line(20, 155, 190, 155);

      const isProfit = resultat.resultatNet >= 0;
      doc.setFontSize(16);
      if (isProfit) {
        doc.setTextColor(0, 128, 0);
        doc.setFillColor(34, 197, 94);
      } else {
        doc.setTextColor(220, 38, 38);
        doc.setFillColor(239, 68, 68);
      }
      doc.rect(20, 162, 170, 15, 'F');
      doc.setTextColor(255);
      doc.text('RESULTAT NET:', 25, 172);
      doc.text(resultat.resultatNet.toLocaleString('fr-FR') + ' FCFA', 170, 172, { align: 'right' });

      doc.setFontSize(10);
      doc.setTextColor(128);
      doc.text('Document genere par COFIN&CO-M', 105, 195, { align: 'center' });

      doc.save(`Compte_Resultat_OHADA_${exercice}.pdf`);
      toast.success('Export PDF réussi');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'export PDF"));
    }
  }, [resultat, exercice]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-emerald-600 to-blue-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Compte de Résultat OHADA</h2>
            <p className="text-emerald-100">Analyse des performances financières</p>
          </div>
          <div className="flex gap-3">
            <select
              value={exercice}
              onChange={(e) => setExercice(e.target.value)}
              className="px-4 py-2 bg-white/20 text-white rounded-xl border border-white/30"
            >
              <option value="2024">Exercice 2024</option>
              <option value="2023">Exercice 2023</option>
              <option value="2025">Exercice 2025</option>
            </select>
            <button 
              onClick={handleExportExcel}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl transition flex items-center gap-2"
              data-testid="button-export-resultat-excel"
            >
              <Download size={18} />
              Excel
            </button>
            <button 
              onClick={handleExportPDF}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl transition flex items-center gap-2"
              data-testid="button-export-resultat-pdf"
            >
              <Printer size={18} />
              PDF
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-slate-800 rounded-2xl p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto"></div>
          <p className="text-slate-400 mt-4">Calcul du résultat...</p>
        </div>
      ) : resultat ? (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-blue-400 mb-6 flex items-center gap-2">
                <TrendingUp className="w-6 h-6" />
                PRODUITS (Classe 7)
              </h3>
              <div className="space-y-4">
                <div className="bg-slate-700 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-2">Produits d'Exploitation (70-75)</div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold">Ventes et services</span>
                    <span className="text-2xl font-bold text-blue-400">
                      {resultat.produitsExploitation.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div className="bg-slate-700 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-2">Produits Financiers (77)</div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold">Intérêts et dividendes</span>
                    <span className="text-2xl font-bold text-blue-400">
                      {resultat.produitsFinanciers.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div className="bg-slate-700 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-2">Produits Exceptionnels (78)</div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold">Produits HAO</span>
                    <span className="text-2xl font-bold text-blue-400">
                      {resultat.produitsExceptionnels.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold text-lg">TOTAL PRODUITS</span>
                    <span className="text-3xl font-bold text-white">
                      {resultat.totalProduits.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-emerald-400 mb-6 flex items-center gap-2">
                <TrendingDown className="w-6 h-6" />
                CHARGES (Classe 6)
              </h3>
              <div className="space-y-4">
                <div className="bg-slate-700 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-2">Charges d'Exploitation (60-65)</div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold">Achats et services</span>
                    <span className="text-2xl font-bold text-emerald-400">
                      {resultat.chargesExploitation.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div className="bg-slate-700 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-2">Charges Financières (67)</div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold">Intérêts et frais</span>
                    <span className="text-2xl font-bold text-emerald-400">
                      {resultat.chargesFinancieres.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div className="bg-slate-700 rounded-xl p-4">
                  <div className="text-sm text-slate-400 mb-2">Charges Exceptionnelles (68)</div>
                  <div className="flex justify-between items-center">
                    <span className="text-white font-semibold">Charges HAO</span>
                    <span className="text-2xl font-bold text-emerald-400">
                      {resultat.chargesExceptionnelles.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-white font-bold text-lg">TOTAL CHARGES</span>
                    <span className="text-3xl font-bold text-white">
                      {resultat.totalCharges.toLocaleString()} FCFA
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-6">Résultats Intermédiaires</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className={`rounded-xl p-4 ${resultat.resultatExploitation >= 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                <div className="text-sm text-slate-400 mb-2">Résultat d'Exploitation</div>
                <div className={`text-2xl font-bold ${resultat.resultatExploitation >= 0 ? 'text-green-400' : 'text-blue-400'}`}>
                  {resultat.resultatExploitation >= 0 ? '+' : ''}{resultat.resultatExploitation.toLocaleString()} FCFA
                </div>
              </div>
              <div className={`rounded-xl p-4 ${resultat.resultatFinancier >= 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                <div className="text-sm text-slate-400 mb-2">Résultat Financier</div>
                <div className={`text-2xl font-bold ${resultat.resultatFinancier >= 0 ? 'text-green-400' : 'text-blue-400'}`}>
                  {resultat.resultatFinancier >= 0 ? '+' : ''}{resultat.resultatFinancier.toLocaleString()} FCFA
                </div>
              </div>
              <div className={`rounded-xl p-4 ${resultat.resultatExceptionnel >= 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-blue-500/10 border border-blue-500/30'}`}>
                <div className="text-sm text-slate-400 mb-2">Résultat Exceptionnel</div>
                <div className={`text-2xl font-bold ${resultat.resultatExceptionnel >= 0 ? 'text-green-400' : 'text-blue-400'}`}>
                  {resultat.resultatExceptionnel >= 0 ? '+' : ''}{resultat.resultatExceptionnel.toLocaleString()} FCFA
                </div>
              </div>
            </div>
          </div>

          <div className={`bg-gradient-to-br ${resultat.resultatNet >= 0 ? 'from-green-600 to-emerald-600' : 'from-blue-600 to-cyan-600'} rounded-2xl p-8 text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm opacity-90 mb-2">RÉSULTAT NET DE L'EXERCICE {exercice}</div>
                <div className="text-5xl font-bold">
                  {resultat.resultatNet >= 0 ? 'BÉNÉFICE' : 'PERTE'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-6xl font-bold">
                  {resultat.resultatNet >= 0 ? '+' : ''}{resultat.resultatNet.toLocaleString()}
                </div>
                <div className="text-2xl opacity-90">FCFA</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Ratios de Performance</h3>
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-slate-700 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Marge Brute</div>
                <div className="text-2xl font-bold text-blue-400">
                  {resultat.produitsExploitation > 0 ? ((resultat.resultatExploitation / resultat.produitsExploitation) * 100).toFixed(1) : 0}%
                </div>
              </div>
              <div className="bg-slate-700 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Rentabilité Nette</div>
                <div className="text-2xl font-bold text-green-400">
                  {resultat.totalProduits > 0 ? ((resultat.resultatNet / resultat.totalProduits) * 100).toFixed(1) : 0}%
                </div>
              </div>
              <div className="bg-slate-700 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Taux de Charges</div>
                <div className="text-2xl font-bold text-emerald-400">
                  {resultat.totalProduits > 0 ? ((resultat.totalCharges / resultat.totalProduits) * 100).toFixed(1) : 0}%
                </div>
              </div>
              <div className="bg-slate-700 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Résultat / CA</div>
                <div className={`text-2xl font-bold ${resultat.resultatNet >= 0 ? 'text-green-400' : 'text-blue-400'}`}>
                  {resultat.produitsExploitation > 0 ? ((resultat.resultatNet / resultat.produitsExploitation) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
