import React, { useState, useEffect, memo, useCallback } from 'react';
import {
  DollarSign, Download, Printer, ArrowUpRight, ArrowDownRight,
  TrendingUp, TrendingDown, Wallet, RefreshCw, Calendar
} from 'lucide-react';
import { Card, Button, Badge } from '../../ui';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '@/lib/lazy-export';

// P3.3: Memoized flux row component to prevent unnecessary re-renders
interface FluxRowProps {
  libelle: string;
  montant: number;
  type: 'entree' | 'sortie';
}

const FluxRow = memo(function FluxRow({ libelle, montant, type }: FluxRowProps) {
  const isEntree = type === 'entree';
  return (
    <div className="flex justify-between items-center py-1.5 px-2 hover:bg-surface-elevated/30 rounded text-xs">
      <div className="flex items-center gap-2">
        {isEntree ? (
          <ArrowUpRight size={12} className="text-status-success" />
        ) : (
          <ArrowDownRight size={12} className="text-status-danger" />
        )}
        <span className="text-content-secondary">{libelle}</span>
      </div>
      <span className={`font-mono ${isEntree ? 'text-status-success' : 'text-status-danger'}`}>
        {isEntree ? '+' : '-'}{Math.abs(montant).toLocaleString()}
      </span>
    </div>
  );
});

interface FluxTresorerie {
  categorie: string;
  libelle: string;
  montant: number;
  type: 'entree' | 'sortie';
}

interface TresorerieData {
  exploitation: FluxTresorerie[];
  investissement: FluxTresorerie[];
  financement: FluxTresorerie[];
  soldeDebut: number;
  soldeFin: number;
}

export default function TableauTresorerie() {
  const [data, setData] = useState<TresorerieData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateDebut, setDateDebut] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchTresorerie();
  }, [dateDebut, dateFin]);

  const fetchTresorerie = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comptabilite/tableau-tresorerie?dateDebut=${dateDebut}&dateFin=${dateFin}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        // Données par défaut si API non disponible
        setData({
          exploitation: [
            { categorie: 'Exploitation', libelle: 'Encaissements clients', montant: 0, type: 'entree' },
            { categorie: 'Exploitation', libelle: 'Décaissements fournisseurs', montant: 0, type: 'sortie' },
            { categorie: 'Exploitation', libelle: 'Charges de personnel', montant: 0, type: 'sortie' },
            { categorie: 'Exploitation', libelle: 'Impôts et taxes', montant: 0, type: 'sortie' },
          ],
          investissement: [
            { categorie: 'Investissement', libelle: 'Acquisitions immobilisations', montant: 0, type: 'sortie' },
            { categorie: 'Investissement', libelle: 'Cessions immobilisations', montant: 0, type: 'entree' },
          ],
          financement: [
            { categorie: 'Financement', libelle: 'Augmentation capital', montant: 0, type: 'entree' },
            { categorie: 'Financement', libelle: 'Emprunts', montant: 0, type: 'entree' },
            { categorie: 'Financement', libelle: 'Remboursement emprunts', montant: 0, type: 'sortie' },
            { categorie: 'Financement', libelle: 'Dividendes versés', montant: 0, type: 'sortie' },
          ],
          soldeDebut: 0,
          soldeFin: 0
        });
      }
    } catch (error) {
      console.error('Erreur:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const calcTotal = (flux: FluxTresorerie[]) => {
    return flux.reduce((sum, f) => sum + (f.type === 'entree' ? f.montant : -f.montant), 0);
  };

  const totalExploitation = data ? calcTotal(data.exploitation) : 0;
  const totalInvestissement = data ? calcTotal(data.investissement) : 0;
  const totalFinancement = data ? calcTotal(data.financement) : 0;
  const variationTresorerie = totalExploitation + totalInvestissement + totalFinancement;

  const handleExportExcel = async () => {
    if (!data) return;

    try {
      const { downloadWorkbook } = await import('@/lib/excel-export');
      const allFlux = [
        ...data.exploitation.map(f => ({ ...f, Section: 'Exploitation' })),
        { Section: 'TOTAL EXPLOITATION', libelle: '', montant: totalExploitation, type: '', categorie: '' },
        ...data.investissement.map(f => ({ ...f, Section: 'Investissement' })),
        { Section: 'TOTAL INVESTISSEMENT', libelle: '', montant: totalInvestissement, type: '', categorie: '' },
        ...data.financement.map(f => ({ ...f, Section: 'Financement' })),
        { Section: 'TOTAL FINANCEMENT', libelle: '', montant: totalFinancement, type: '', categorie: '' },
        { Section: '', libelle: '', montant: 0, type: '', categorie: '' },
        { Section: 'VARIATION TRESORERIE', libelle: '', montant: variationTresorerie, type: '', categorie: '' },
        { Section: 'Trésorerie début', libelle: '', montant: data.soldeDebut, type: '', categorie: '' },
        { Section: 'Trésorerie fin', libelle: '', montant: data.soldeFin, type: '', categorie: '' },
      ];

      const exportData = allFlux.map(f => ({
        'Section': f.Section || f.categorie,
        'Libellé': f.libelle,
        'Type': f.type === 'entree' ? 'Entrée' : f.type === 'sortie' ? 'Sortie' : '',
        'Montant': f.montant
      }));

      await downloadWorkbook(`Tableau_Tresorerie_OHADA_${new Date().toISOString().split('T')[0]}.xlsx`, [{
        name: 'Flux Trésorerie',
        titleRows: [
          ['TABLEAU DES FLUX DE TRESORERIE - OHADA'],
          [`Période: ${dateDebut} au ${dateFin}`],
          [],
        ],
        rows: exportData,
      }]);
    } catch (error) {
      console.error('Erreur export Excel:', error);
    }
  };

  const handleExportPDF = async () => {
    if (!data) return;

    try {
      // P4.1: Lazy-load PDF library
      const { jsPDF } = await loadPDFLibraries();
      const doc = new jsPDF('portrait');

      // Header
      doc.setFontSize(18);
      doc.setTextColor(30, 58, 138);
      doc.text('TABLEAU DES FLUX DE TRESORERIE', 105, 20, { align: 'center' });

      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text('Méthode directe - Normes OHADA', 105, 28, { align: 'center' });
      doc.text(`Période: ${dateDebut} au ${dateFin}`, 105, 35, { align: 'center' });

      doc.setDrawColor(30, 58, 138);
      doc.line(20, 40, 190, 40);

      let y = 50;

      const renderSection = (title: string, flux: FluxTresorerie[], total: number, color: number[]) => {
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(20, y, 170, 8, 'F');
        doc.setTextColor(255);
        doc.setFontSize(10);
        doc.text(title, 25, y + 6);
        y += 12;

        doc.setTextColor(0);
        doc.setFontSize(9);
        flux.forEach(f => {
          const sign = f.type === 'entree' ? '+' : '-';
          doc.text(f.libelle, 30, y);
          doc.text(`${sign} ${Math.abs(f.montant).toLocaleString('fr-FR')}`, 170, y, { align: 'right' });
          y += 6;
        });

        doc.setFontSize(10);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(`Total: ${total >= 0 ? '+' : ''}${total.toLocaleString('fr-FR')} FCFA`, 170, y, { align: 'right' });
        y += 12;
      };

      renderSection('A - FLUX DE TRESORERIE LIES A L\'EXPLOITATION', data.exploitation, totalExploitation, [34, 197, 94]);
      renderSection('B - FLUX DE TRESORERIE LIES A L\'INVESTISSEMENT', data.investissement, totalInvestissement, [59, 130, 246]);
      renderSection('C - FLUX DE TRESORERIE LIES AU FINANCEMENT', data.financement, totalFinancement, [168, 85, 247]);

      // Variation
      y += 5;
      const varColor = variationTresorerie >= 0 ? [34, 197, 94] : [239, 68, 68];
      doc.setFillColor(varColor[0], varColor[1], varColor[2]);
      doc.rect(20, y, 170, 12, 'F');
      doc.setTextColor(255);
      doc.setFontSize(12);
      doc.text('VARIATION DE TRESORERIE (A+B+C)', 25, y + 8);
      doc.text(`${variationTresorerie >= 0 ? '+' : ''}${variationTresorerie.toLocaleString('fr-FR')} FCFA`, 170, y + 8, { align: 'right' });

      y += 20;
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text(`Trésorerie début de période: ${data.soldeDebut.toLocaleString('fr-FR')} FCFA`, 25, y);
      y += 7;
      doc.text(`Trésorerie fin de période: ${data.soldeFin.toLocaleString('fr-FR')} FCFA`, 25, y);

      doc.save(`Tableau_Tresorerie_OHADA_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erreur export PDF:', error);
    }
  };

  const renderFluxSection = (
    title: string,
    flux: FluxTresorerie[],
    total: number,
    colorClass: string,
    icon: React.ReactNode
  ) => (
    <Card variant="default" padding="sm" className="space-y-2">
      <div className={`flex items-center justify-between p-2 rounded-lg ${colorClass}`}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-bold text-white">{title}</span>
        </div>
        <span className={`text-sm font-bold ${total >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
          {total >= 0 ? '+' : ''}{total.toLocaleString()} FCFA
        </span>
      </div>
      {/* P3.3: Use memoized FluxRow component */}
      <div className="space-y-1">
        {flux.map((f, i) => (
          <FluxRow key={i} libelle={f.libelle} montant={f.montant} type={f.type} />
        ))}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-accent to-status-info rounded-xl p-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white">Tableau des Flux de Trésorerie</h2>
              <p className="text-[10px] text-white/80">Méthode directe - OHADA</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportExcel} className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button onClick={handleExportPDF} className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
              <Printer className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[140px] max-w-[180px]">
          <label className="block text-[10px] font-medium text-content-muted mb-1">Date Début</label>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="w-full bg-surface text-content-primary text-xs px-3 py-2 rounded-lg border border-edge focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex-1 min-w-[140px] max-w-[180px]">
          <label className="block text-[10px] font-medium text-content-muted mb-1">Date Fin</label>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="w-full bg-surface text-content-primary text-xs px-3 py-2 rounded-lg border border-edge focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <Button variant="primary" size="sm" icon={RefreshCw} onClick={fetchTresorerie} disabled={loading}>
          {loading ? 'Chargement...' : 'Actualiser'}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="animate-spin w-8 h-8 text-accent mx-auto mb-3" />
          <p className="text-content-muted text-sm">Calcul des flux...</p>
        </div>
      ) : data ? (
        <>
          {/* Synthèse */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card variant="default" padding="sm" className="bg-status-success-bg border-status-success/30">
              <div className="text-[10px] text-content-muted mb-1">Flux Exploitation</div>
              <div className={`text-lg font-bold ${totalExploitation >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                {totalExploitation >= 0 ? '+' : ''}{totalExploitation.toLocaleString()}
              </div>
            </Card>
            <Card variant="default" padding="sm" className="bg-status-info-bg border-status-info/30">
              <div className="text-[10px] text-content-muted mb-1">Flux Investissement</div>
              <div className={`text-lg font-bold ${totalInvestissement >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                {totalInvestissement >= 0 ? '+' : ''}{totalInvestissement.toLocaleString()}
              </div>
            </Card>
            <Card variant="default" padding="sm" className="bg-status-info-bg border-status-info/30">
              <div className="text-[10px] text-content-muted mb-1">Flux Financement</div>
              <div className={`text-lg font-bold ${totalFinancement >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                {totalFinancement >= 0 ? '+' : ''}{totalFinancement.toLocaleString()}
              </div>
            </Card>
            <Card variant="default" padding="sm" className={variationTresorerie >= 0 ? 'bg-status-success-bg border-status-success/50' : 'bg-status-danger-bg border-status-danger/50'}>
              <div className="text-[10px] text-content-muted mb-1">Variation Totale</div>
              <div className={`text-lg font-bold ${variationTresorerie >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
                {variationTresorerie >= 0 ? '+' : ''}{variationTresorerie.toLocaleString()}
              </div>
            </Card>
          </div>

          {/* Détails par section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {renderFluxSection(
              'A - Exploitation',
              data.exploitation,
              totalExploitation,
              'bg-gradient-to-r from-status-success to-status-success',
              <TrendingUp size={14} className="text-white" />
            )}
            {renderFluxSection(
              'B - Investissement',
              data.investissement,
              totalInvestissement,
              'bg-gradient-to-r from-status-info to-status-info',
              <Wallet size={14} className="text-white" />
            )}
            {renderFluxSection(
              'C - Financement',
              data.financement,
              totalFinancement,
              'bg-gradient-to-r from-status-info to-status-info',
              <DollarSign size={14} className="text-white" />
            )}
          </div>

          {/* Soldes */}
          <Card variant="default" padding="sm">
            <div className="flex justify-between items-center py-2 border-b border-edge">
              <span className="text-sm text-content-muted">Trésorerie début de période</span>
              <span className="text-sm font-bold text-content-primary">{data.soldeDebut.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-content-muted">Trésorerie fin de période</span>
              <span className="text-sm font-bold text-accent">{data.soldeFin.toLocaleString()} FCFA</span>
            </div>
          </Card>
        </>
      ) : (
        <Card variant="default" padding="lg" className="text-center">
          <Wallet className="w-12 h-12 mx-auto mb-3 text-content-muted" />
          <p className="text-content-muted">Aucune donnée de trésorerie disponible</p>
        </Card>
      )}
    </div>
  );
}
