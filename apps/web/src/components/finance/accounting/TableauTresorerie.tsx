import React, { useState, useEffect, memo } from 'react';
import {
  DollarSign, Download, Printer, ArrowUpRight, ArrowDownRight,
  TrendingUp, Wallet, RefreshCw
} from 'lucide-react';
import { Card, Button } from '../../ui';


import {
  exportTableauTresorerieExcel,
  exportTableauTresoreriePDF,
  FluxTresorerieExport,
  TresorerieDataExport
} from './exports/tableauTresorerieExports';

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

interface FluxTresorerie extends FluxTresorerieExport {}
interface TresorerieData extends TresorerieDataExport {}

const calcTotal = (flux: FluxTresorerie[]) => {
  return flux.reduce((sum, f) => sum + (f.type === 'entree' ? f.montant : -f.montant), 0);
};

const FluxSection = memo(function FluxSection({
  title,
  flux,
  total,
  colorClass,
  icon
}: {
  title: string;
  flux: FluxTresorerie[];
  total: number;
  colorClass: string;
  icon: React.ReactNode;
}) {
  return (
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
      <div className="space-y-1">
        {flux.map((f, i) => (
          <FluxRow key={i} libelle={f.libelle} montant={f.montant} type={f.type} />
        ))}
      </div>
    </Card>
  );
});

const SyntheseCards = memo(function SyntheseCards({
  totalExploitation,
  totalInvestissement,
  totalFinancement,
  variationTresorerie
}: {
  totalExploitation: number;
  totalInvestissement: number;
  totalFinancement: number;
  variationTresorerie: number;
}) {
  return (
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
  );
});

export default function TableauTresorerie() {
  const [data, setData] = useState<TresorerieData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateDebut, setDateDebut] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);

  // Use useCallback to keep reference stable for useEffect
  const fetchTresorerie = React.useCallback(async () => {
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
  }, [dateDebut, dateFin]);

  useEffect(() => {
    fetchTresorerie();
  }, [fetchTresorerie]);

  const totalExploitation = data ? calcTotal(data.exploitation) : 0;
  const totalInvestissement = data ? calcTotal(data.investissement) : 0;
  const totalFinancement = data ? calcTotal(data.financement) : 0;
  const variationTresorerie = totalExploitation + totalInvestissement + totalFinancement;

  const handleExportExcel = async () => {
    if (!data) return;
    await exportTableauTresorerieExcel(
      data,
      totalExploitation,
      totalInvestissement,
      totalFinancement,
      variationTresorerie,
      dateDebut,
      dateFin
    );
  };

  const handleExportPDF = async () => {
    if (!data) return;
    await exportTableauTresoreriePDF(
      data,
      totalExploitation,
      totalInvestissement,
      totalFinancement,
      variationTresorerie,
      dateDebut,
      dateFin
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-linear-to-r from-accent to-status-info rounded-xl p-3">
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

      {loading && (
        <div className="text-center py-12">
          <RefreshCw className="animate-spin w-8 h-8 text-accent mx-auto mb-3" />
          <p className="text-content-muted text-sm">Calcul des flux...</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Synthèse */}
          <SyntheseCards 
            totalExploitation={totalExploitation}
            totalInvestissement={totalInvestissement}
            totalFinancement={totalFinancement}
            variationTresorerie={variationTresorerie}
          />

          {/* Détails par section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <FluxSection 
              title="A - Exploitation"
              flux={data.exploitation}
              total={totalExploitation}
              colorClass="bg-linear-to-r from-status-success to-status-success"
              icon={<TrendingUp size={14} className="text-white" />}
            />
            <FluxSection 
              title="B - Investissement"
              flux={data.investissement}
              total={totalInvestissement}
              colorClass="bg-linear-to-r from-status-info to-status-info"
              icon={<Wallet size={14} className="text-white" />}
            />
            <FluxSection 
              title="C - Financement"
              flux={data.financement}
              total={totalFinancement}
              colorClass="bg-linear-to-r from-status-info to-status-info"
              icon={<DollarSign size={14} className="text-white" />}
            />
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
      )}

      {!loading && !data && (
        <Card variant="default" padding="lg" className="text-center">
          <Wallet className="w-12 h-12 mx-auto mb-3 text-content-muted" />
          <p className="text-content-muted">Aucune donnée de trésorerie disponible</p>
        </Card>
      )}
    </div>
  );
}
