import React, { useState, useMemo } from 'react';
import {
  TrendingUp, Download,
  ArrowUpRight, ArrowDownRight, Activity, ArrowRight,
  PieChart as PieChartIcon, BarChart3, Printer, RefreshCw
} from 'lucide-react';
import { Card, Button, Badge, ResponsiveTable } from '../../ui';
import { useCompteResultat } from '../../../hooks/accounting/useAccounting';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries, loadExcelLibrary } from '@/lib/lazy-export';
import { useBranding } from '@/contexts/BrandingContext';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts';

interface CompteResultatLine {
  numeroCompte: string;
  intitule: string;
  montant: number;
}

interface CompteResultatData {
  exercice: string;
  charges: CompteResultatLine[];
  produits: CompteResultatLine[];
  totalCharges: number;
  totalProduits: number;
  resultatNet: number;
  margeNette: number;
  type: 'benefice' | 'perte';
}

export default function CompteResultat() {
  const { branding } = useBranding();
  const [viewMode, setViewMode] = useState<'synthese' | 'charges' | 'produits'>('synthese');
  const [exercice, setExercice] = useState(String(new Date().getFullYear()));

  const { data, isLoading: loading, refetch } = useCompteResultat(exercice);
  const result = data as CompteResultatData | undefined;

  const charges = useMemo(() => result?.charges || [], [result]);
  const produits = useMemo(() => result?.produits || [], [result]);

  const totalCharges = result?.totalCharges || 0;
  const totalProduits = result?.totalProduits || 0;
  const resultatNet = result?.resultatNet || 0;
  const rentabilite = result?.margeNette || 0;

  const formatMoney = (amount: number) => (amount || 0).toLocaleString() + ' FCFA';

  const handleExportExcel = async () => {
    try {
      // P4.1: Lazy-load Excel library
      const XLSX = await loadExcelLibrary();

      // Feuille Charges
      const chargesData = charges.map(c => ({
        'N° Compte': c.numeroCompte,
        'Intitulé': c.intitule,
        'Montant': c.montant
      }));
      chargesData.push({ 'N° Compte': 'TOTAL CHARGES', 'Intitulé': '', 'Montant': totalCharges });

      // Feuille Produits
      const produitsData = produits.map(c => ({
        'N° Compte': c.numeroCompte,
        'Intitulé': c.intitule,
        'Montant': c.montant
      }));
      produitsData.push({ 'N° Compte': 'TOTAL PRODUITS', 'Intitulé': '', 'Montant': totalProduits });

      // Feuille Synthèse
      const syntheseData = [
        { 'Élément': 'Total Produits', 'Montant': totalProduits },
        { 'Élément': 'Total Charges', 'Montant': totalCharges },
        { 'Élément': 'RESULTAT NET', 'Montant': resultatNet },
        { 'Élément': 'Marge nette (%)', 'Montant': rentabilite.toFixed(2) }
      ];

      const wb = XLSX.utils.book_new();

      const wsCharges = XLSX.utils.json_to_sheet(chargesData);
      XLSX.utils.book_append_sheet(wb, wsCharges, 'Charges');

      const wsProduits = XLSX.utils.json_to_sheet(produitsData);
      XLSX.utils.book_append_sheet(wb, wsProduits, 'Produits');

      const wsSynthese = XLSX.utils.json_to_sheet(syntheseData);
      XLSX.utils.book_append_sheet(wb, wsSynthese, 'Synthèse');

      XLSX.writeFile(wb, `Compte_Resultat_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Erreur export Excel:', error);
    }
  };

  const handleExportPDF = async () => {
    try {
      // P4.1: Lazy-load PDF library
      const { jsPDF } = await loadPDFLibraries();
      const doc = new jsPDF('portrait');

      // Header
      doc.setFontSize(20);
      doc.setTextColor(30, 58, 138);
      doc.text('COMPTE DE RESULTAT', 105, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`${branding.appName} - Système Comptable OHADA`, 105, 30, { align: 'center' });
      doc.text(`Exercice: ${exercice}`, 105, 38, { align: 'center' });

      doc.setDrawColor(30, 58, 138);
      doc.line(20, 44, 190, 44);

      let y = 55;

      // Section Produits
      doc.setFontSize(12);
      doc.setTextColor(34, 197, 94);
      doc.text('PRODUITS', 20, y);
      y += 8;

      doc.setFontSize(9);
      doc.setTextColor(0);
      produits.slice(0, 10).forEach((p) => {
        doc.text(p.numeroCompte, 25, y);
        doc.text(p.intitule.substring(0, 50), 45, y);
        doc.text((p.montant || 0).toLocaleString('fr-FR'), 160, y, { align: 'right' });
        y += 6;
      });

      doc.setFillColor(34, 197, 94);
      doc.rect(20, y, 170, 8, 'F');
      doc.setTextColor(255);
      doc.setFontSize(10);
      doc.text('TOTAL PRODUITS', 25, y + 6);
      doc.text(totalProduits.toLocaleString('fr-FR') + ' FCFA', 160, y + 6, { align: 'right' });
      y += 15;

      // Section Charges
      doc.setFontSize(12);
      doc.setTextColor(239, 68, 68);
      doc.text('CHARGES', 20, y);
      y += 8;

      doc.setFontSize(9);
      doc.setTextColor(0);
      charges.slice(0, 10).forEach((c) => {
        doc.text(c.numeroCompte, 25, y);
        doc.text(c.intitule.substring(0, 50), 45, y);
        doc.text((c.montant || 0).toLocaleString('fr-FR'), 160, y, { align: 'right' });
        y += 6;
      });

      doc.setFillColor(239, 68, 68);
      doc.rect(20, y, 170, 8, 'F');
      doc.setTextColor(255);
      doc.setFontSize(10);
      doc.text('TOTAL CHARGES', 25, y + 6);
      doc.text(totalCharges.toLocaleString('fr-FR') + ' FCFA', 160, y + 6, { align: 'right' });
      y += 20;

      // Résultat Net
      const bgColor = resultatNet >= 0 ? [34, 197, 94] : [239, 68, 68];
      doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
      doc.rect(20, y, 170, 12, 'F');
      doc.setTextColor(255);
      doc.setFontSize(14);
      doc.text('RESULTAT NET', 25, y + 9);
      doc.text((resultatNet >= 0 ? '+' : '') + resultatNet.toLocaleString('fr-FR') + ' FCFA', 160, y + 9, { align: 'right' });

      y += 20;
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Marge nette: ${rentabilite.toFixed(2)}%`, 20, y);
      doc.text(resultatNet >= 0 ? 'Bénéfice' : 'Perte', 160, y, { align: 'right' });

      doc.save(`Compte_Resultat_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erreur export PDF:', error);
    }
  };

  const columns = [
    { 
      key: 'numeroCompte',
      label: 'Compte', 
      primary: true,
      format: (val: string) => <span className="font-mono text-xs text-accent font-bold">{val}</span>
    },
    { 
      key: 'intitule', 
      label: 'Intitulé', 
      format: (val: string) => <span className="text-content-secondary text-xs font-medium">{val}</span> 
    },
    {
      key: 'montant',
      label: 'Montant',
      format: (val: number) => <span className="font-bold text-content-primary text-xs">{(val || 0).toLocaleString()}</span>
    }
  ];

  return (
    <div className="space-y-4">
      {/* Header Compact */}
      <div className="flex justify-between items-center">
         <div>
            <h2 className="text-sm font-bold text-content-primary">Compte de Résultat</h2>
            <p className="text-[10px] text-content-muted">Analyse de la performance</p>
         </div>
         <div className="flex gap-2">
            <select
              value={exercice}
              onChange={(e) => setExercice(e.target.value)}
              className="h-8 text-xs bg-surface border border-edge rounded-lg px-2 text-content-primary"
            >
              {Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i)).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" icon={RefreshCw} className="h-8 text-xs" onClick={() => refetch()}>
              {loading ? '...' : ''}
            </Button>
            <Button variant="outline" size="sm" icon={Download} className="h-8 text-xs" onClick={handleExportExcel}>Excel</Button>
            <Button variant="primary" size="sm" icon={Printer} className="h-8 text-xs" onClick={handleExportPDF}>PDF</Button>
         </div>
      </div>

      {loading && !result ? (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-surface rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="h-48 bg-surface rounded-xl" />
            <div className="h-48 bg-surface rounded-xl" />
          </div>
          <div className="h-64 bg-surface rounded-xl" />
        </div>
      ) : (
      <>
      {/* Top Cards - Dashboard Style */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Charges Card */}
        <Card 
          variant="default" 
          padding="sm" 
          onClick={() => setViewMode('charges')}
          className={`cursor-pointer transition-all hover:scale-[1.01] ${viewMode === 'charges' ? 'ring-1 ring-status-danger bg-status-danger/5' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-status-danger-bg rounded-lg">
              <ArrowDownRight className="text-status-danger" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-content-primary truncate">Charges</h3>
              <p className="text-content-muted text-[9px]">Dépenses totales</p>
            </div>
          </div>
          <p className="text-lg font-bold text-content-primary mb-1">{formatMoney(totalCharges)}</p>
          <div className="flex items-center gap-1">
             <Badge value={`${charges.length} postes`} variant="neutral" size="sm" className="text-[9px] px-1.5 h-4" />
             {viewMode === 'charges' && <ArrowRight size={12} className="text-status-danger ml-auto" />}
          </div>
        </Card>

        {/* Produits Card */}
        <Card 
           variant="default" 
           padding="sm"
           onClick={() => setViewMode('produits')}
           className={`cursor-pointer transition-all hover:scale-[1.01] ${viewMode === 'produits' ? 'ring-1 ring-status-success bg-status-success/5' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-status-success-bg rounded-lg">
              <ArrowUpRight className="text-status-success" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-content-primary truncate">Produits</h3>
              <p className="text-content-muted text-[9px]">Revenus totaux</p>
            </div>
          </div>
          <p className="text-lg font-bold text-content-primary mb-1">{formatMoney(totalProduits)}</p>
          <div className="flex items-center gap-1">
             <Badge value={`${produits.length} postes`} variant="neutral" size="sm" className="text-[9px] px-1.5 h-4" />
             {viewMode === 'produits' && <ArrowRight size={12} className="text-status-success ml-auto" />}
          </div>
        </Card>

        {/* Resultat Card */}
        <Card 
           variant="default" 
           padding="sm"
           onClick={() => setViewMode('synthese')}
           className={`cursor-pointer transition-all hover:scale-[1.01] ${viewMode === 'synthese' ? 'ring-1 ring-status-info bg-status-info/5' : ''}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-status-info-bg rounded-lg">
              <Activity className="text-status-info" size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-content-primary truncate">Résultat Net</h3>
              <p className="text-content-muted text-[9px]">{resultatNet >= 0 ? 'Bénéfice' : 'Perte'}</p>
            </div>
          </div>
          <p className={`text-lg font-bold mb-1 ${resultatNet >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
             {resultatNet > 0 && '+'}{formatMoney(resultatNet)}
          </p>
          <div className="flex items-center gap-1">
             <Badge value={`${rentabilite.toFixed(1)}% marge`} variant={resultatNet >= 0 ? 'success' : 'danger'} size="sm" className="text-[9px] px-1.5 h-4" />
             {viewMode === 'synthese' && <ArrowRight size={12} className="text-status-info ml-auto" />}
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
         {viewMode === 'synthese' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               {/* Analyse de Rentabilité */}
               <Card variant="default" padding="sm" className="space-y-3">
                  <div className="flex items-center gap-2">
                     <div className="p-1 bg-status-info-bg rounded">
                        <PieChartIcon size={14} className="text-status-info" />
                     </div>
                     <h3 className="text-xs font-bold text-content-primary">Analyse de Rentabilité</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                     <div className="bg-surface/50 p-2 rounded-lg border border-edge-subtle">
                        <span className="text-[10px] text-content-muted block mb-1">Marge Nette</span>
                        <div className="flex items-end gap-1">
                           <span className={`text-sm font-bold ${rentabilite >= 20 ? 'text-status-success' : 'text-status-warning'}`}>
                              {rentabilite.toFixed(1)}%
                           </span>
                           <TrendingUp size={12} className="text-status-success mb-1" />
                        </div>
                     </div>
                     <div className="bg-surface/50 p-2 rounded-lg border border-edge-subtle">
                        <span className="text-[10px] text-content-muted block mb-1">Couverture</span>
                        <div className="flex items-end gap-1">
                           <span className="text-sm font-bold text-status-info">
                              {totalCharges > 0 ? ((totalProduits / totalCharges) * 100).toFixed(0) : 0}%
                           </span>
                           <Activity size={12} className="text-status-info mb-1" />
                        </div>
                     </div>
                  </div>

                  <div className="w-full bg-surface rounded-full h-1.5 mt-2">
                     <div 
                        className={`h-1.5 rounded-full ${resultatNet >= 0 ? 'bg-gradient-to-r from-status-success to-status-success' : 'bg-status-danger'}`} 
                        style={{ width: `${Math.min(Math.max(rentabilite, 0), 100)}%` }}
                     ></div>
                  </div>
                  <p className="text-[10px] text-content-muted italic">
                     {resultatNet >= 0 
                        ? "Situation financière saine. Les produits couvrent les charges." 
                        : "Attention : Les charges dépassent les produits."}
                  </p>
               </Card>

               {/* Charts */}
               <Card variant="default" padding="sm" className="space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                     <div className="p-1 bg-status-info-bg rounded">
                        <BarChart3 size={14} className="text-status-info" />
                     </div>
                     <h3 className="text-xs font-bold text-content-primary">Répartition</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     {/* Donut Chart: Charges vs Produits */}
                     <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={140}>
                           <PieChart>
                              <Pie
                                 data={[
                                    { name: 'Charges', value: totalCharges },
                                    { name: 'Produits', value: totalProduits },
                                 ]}
                                 cx="50%"
                                 cy="50%"
                                 innerRadius={35}
                                 outerRadius={55}
                                 paddingAngle={4}
                                 dataKey="value"
                                 stroke="none"
                              >
                                 <Cell fill="var(--color-danger)" />
                                 <Cell fill="var(--color-success)" />
                              </Pie>
                              <Tooltip
                                 formatter={(value) => `${Number(value).toLocaleString()} FCFA`}
                                 contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 11 }}
                                 itemStyle={{ color: 'var(--text-primary)' }}
                              />
                           </PieChart>
                        </ResponsiveContainer>
                        <div className="flex gap-3 text-[10px] mt-1">
                           <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-danger" />Charges</span>
                           <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-success" />Produits</span>
                        </div>
                     </div>

                     {/* Bar Chart: Top 5 postes */}
                     <div>
                        <ResponsiveContainer width="100%" height={160}>
                           <BarChart
                              layout="vertical"
                              data={[
                                 ...charges.slice(0, 3).map(c => ({ name: c.numeroCompte, montant: c.montant, fill: 'var(--color-danger)' })),
                                 ...produits.slice(0, 3).map(c => ({ name: c.numeroCompte, montant: c.montant, fill: 'var(--color-success)' })),
                              ].sort((a, b) => b.montant - a.montant).slice(0, 5)}
                              margin={{ left: 5, right: 5 }}
                           >
                              <XAxis type="number" hide />
                              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={45} />
                              <Tooltip
                                 formatter={(value) => `${Number(value).toLocaleString()} FCFA`}
                                 contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 11 }}
                                 itemStyle={{ color: 'var(--text-primary)' }}
                              />
                              <Bar dataKey="montant" radius={[0, 4, 4, 0]}>
                                 {[
                                    ...charges.slice(0, 3).map(c => ({ name: c.numeroCompte, montant: c.montant, fill: 'var(--color-danger)' })),
                                    ...produits.slice(0, 3).map(c => ({ name: c.numeroCompte, montant: c.montant, fill: 'var(--color-success)' })),
                                 ].sort((a, b) => b.montant - a.montant).slice(0, 5).map((entry, i) => (
                                    <Cell key={i} fill={entry.fill} />
                                 ))}
                              </Bar>
                           </BarChart>
                        </ResponsiveContainer>
                     </div>
                  </div>
               </Card>
            </div>
         )}

         {viewMode !== 'synthese' && (
            <Card variant="default" padding="sm" className="overflow-hidden">
               <div className="p-2 border-b border-edge bg-surface/50 flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-content-primary uppercase flex items-center gap-1">
                     {viewMode === 'charges' ? <ArrowDownRight size={14} className="text-status-danger" /> : <ArrowUpRight size={14} className="text-status-success" />}
                     Détail {viewMode}
                  </span>
                  <Badge value={viewMode === 'charges' ? charges.length : produits.length} variant="neutral" size="sm" />
               </div>
               <ResponsiveTable
                  data={viewMode === 'charges' ? charges : produits}
                  columns={columns}
                  loading={loading}
                  emptyMessage={`Aucun compte de ${viewMode}`}
                  onRowClick={() => {}}
               />
            </Card>
         )}
      </div>
      </>
      )}
    </div>
  );
}
