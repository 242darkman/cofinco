import React, { useState, useEffect } from 'react';
import {
  Activity, Download, Printer, RefreshCw, Layers, PlusCircle, MinusCircle
} from 'lucide-react';
import { Card } from '../../ui';

import {
  exportTAFIREExcel,
  exportTAFIREPDF,
  LigneTAFIREExport,
  TAFIREDataExport
} from './exports/tafireExports';

interface LigneTAFIRE extends LigneTAFIREExport {}

interface TAFIREData extends TAFIREDataExport {}

export default function TAFIRE() {
  const [data, setData] = useState<TAFIREData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exercice, setExercice] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchTAFIRE();
  }, [exercice]);

  const fetchTAFIRE = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comptabilite/tafire?exercice=${exercice}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        // Données TAFIRE par défaut selon le format OHADA
        setData({
          ressourcesDurables: [
            { code: 'RA', libelle: 'Capacité d\'autofinancement globale (CAFG)', montantN: 0, montantN1: 0 },
            { code: 'RB', libelle: 'Cessions d\'immobilisations incorporelles', montantN: 0, montantN1: 0 },
            { code: 'RC', libelle: 'Cessions d\'immobilisations corporelles', montantN: 0, montantN1: 0 },
            { code: 'RD', libelle: 'Cessions d\'immobilisations financières', montantN: 0, montantN1: 0 },
            { code: 'RE', libelle: 'Augmentation des capitaux propres', montantN: 0, montantN1: 0 },
            { code: 'RF', libelle: 'Augmentation des dettes financières', montantN: 0, montantN1: 0 },
          ],
          emploisDurables: [
            { code: 'EA', libelle: 'Acquisitions d\'immobilisations incorporelles', montantN: 0, montantN1: 0 },
            { code: 'EB', libelle: 'Acquisitions d\'immobilisations corporelles', montantN: 0, montantN1: 0 },
            { code: 'EC', libelle: 'Acquisitions d\'immobilisations financières', montantN: 0, montantN1: 0 },
            { code: 'ED', libelle: 'Remboursement des emprunts', montantN: 0, montantN1: 0 },
            { code: 'EE', libelle: 'Prélèvements sur le capital', montantN: 0, montantN1: 0 },
            { code: 'EF', libelle: 'Dividendes distribués', montantN: 0, montantN1: 0 },
          ],
          variationBFR: [
            { code: 'VA', libelle: 'Variation des stocks', montantN: 0, montantN1: 0 },
            { code: 'VB', libelle: 'Variation des créances', montantN: 0, montantN1: 0 },
            { code: 'VC', libelle: 'Variation des dettes circulantes', montantN: 0, montantN1: 0 },
          ],
          tresorerie: [
            { code: 'TI', libelle: 'Trésorerie nette au 1er janvier', montantN: 0, montantN1: 0 },
            { code: 'TF', libelle: 'Trésorerie nette au 31 décembre', montantN: 0, montantN1: 0 },
          ]
        });
      }
    } catch (error) {
      console.error('Erreur:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const calcTotal = (lignes: LigneTAFIRE[], field: 'montantN' | 'montantN1') => {
    return lignes.reduce((sum, l) => sum + l[field], 0);
  };

  const totalRessources = data ? calcTotal(data.ressourcesDurables, 'montantN') : 0;
  const totalEmplois = data ? calcTotal(data.emploisDurables, 'montantN') : 0;
  const excedentRessources = totalRessources - totalEmplois;
  const variationBFR = data ? calcTotal(data.variationBFR, 'montantN') : 0;
  const variationTresorerie = excedentRessources - variationBFR;

  const handleExportExcel = async () => {
    if (!data) return;
    await exportTAFIREExcel(
      data,
      exercice,
      totalRessources,
      totalEmplois,
      excedentRessources,
      variationBFR,
      variationTresorerie
    );
  };

  const handleExportPDF = async () => {
    if (!data) return;
    await exportTAFIREPDF(
      data,
      exercice,
      totalRessources,
      totalEmplois,
      excedentRessources,
      variationBFR,
      variationTresorerie
    );
  };

  const renderLignesSection = (
    title: string,
    lignes: LigneTAFIRE[],
    total: number,
    colorClass: string,
    icon: React.ReactNode,
    type: 'ressource' | 'emploi'
  ) => (
    <Card variant="default" padding="sm" className="space-y-2">
      <div className={`flex items-center justify-between p-2 rounded-lg ${colorClass}`}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-bold text-white">{title}</span>
        </div>
        <span className="text-sm font-bold text-white">
          {total.toLocaleString()} FCFA
        </span>
      </div>
      <div className="space-y-1">
        {lignes.map((l) => (
          <div key={l.code} className="flex justify-between items-center py-1.5 px-2 hover:bg-surface-elevated/30 rounded text-xs">
            <div className="flex items-center gap-2">
              <span className="text-accent font-mono text-[10px] w-6">{l.code}</span>
              <span className="text-content-secondary">{l.libelle}</span>
            </div>
            <div className="flex gap-4">
              <span className="font-mono text-content-primary w-20 text-right">{l.montantN.toLocaleString()}</span>
              <span className="font-mono text-content-muted w-20 text-right hidden md:block">{l.montantN1.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-center py-12">
          <RefreshCw className="animate-spin w-8 h-8 text-status-warning mx-auto mb-3" />
          <p className="text-content-muted text-sm">Calcul du TAFIRE...</p>
        </div>
      );
    }

    if (!data) {
      return (
        <Card variant="default" padding="lg" className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-3 text-content-muted" />
          <p className="text-content-muted">Aucune donnée TAFIRE disponible</p>
        </Card>
      );
    }

    return (
      <>
        {/* Synthèse */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card variant="default" padding="sm" className="bg-status-success-bg border-status-success/30">
            <div className="flex items-center gap-1 mb-1">
              <PlusCircle size={12} className="text-status-success" />
              <span className="text-[10px] text-content-muted">Ressources</span>
            </div>
            <div className="text-lg font-bold text-status-success">{totalRessources.toLocaleString()}</div>
          </Card>
          <Card variant="default" padding="sm" className="bg-status-danger-bg border-status-danger/30">
            <div className="flex items-center gap-1 mb-1">
              <MinusCircle size={12} className="text-status-danger" />
              <span className="text-[10px] text-content-muted">Emplois</span>
            </div>
            <div className="text-lg font-bold text-status-danger">{totalEmplois.toLocaleString()}</div>
          </Card>
          <Card variant="default" padding="sm" className="bg-status-info-bg border-status-info/30">
            <div className="flex items-center gap-1 mb-1">
              <Layers size={12} className="text-status-info" />
              <span className="text-[10px] text-content-muted">Variation BFR</span>
            </div>
            <div className={`text-lg font-bold ${variationBFR >= 0 ? 'text-status-info' : 'text-status-warning'}`}>
              {variationBFR >= 0 ? '+' : ''}{variationBFR.toLocaleString()}
            </div>
          </Card>
          <Card variant="default" padding="sm" className={excedentRessources >= 0 ? 'bg-status-success-bg border-status-success/50' : 'bg-status-danger-bg border-status-danger/50'}>
            <div className="flex items-center gap-1 mb-1">
              <Activity size={12} className={excedentRessources >= 0 ? 'text-status-success' : 'text-status-danger'} />
              <span className="text-[10px] text-content-muted">Excédent</span>
            </div>
            <div className={`text-lg font-bold ${excedentRessources >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
              {excedentRessources >= 0 ? '+' : ''}{excedentRessources.toLocaleString()}
            </div>
          </Card>
        </div>

        {/* Légende colonnes */}
        <div className="flex justify-end gap-4 text-[10px] text-content-muted px-2">
          <span>Exercice N ({exercice})</span>
          <span className="hidden md:inline">Exercice N-1 ({exercice - 1})</span>
        </div>

        {/* Détails */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {renderLignesSection(
            'I - Ressources Durables',
            data.ressourcesDurables,
            totalRessources,
            'bg-gradient-to-r from-status-success to-status-success',
            <PlusCircle size={14} className="text-white" />,
            'ressource'
          )}
          {renderLignesSection(
            'II - Emplois Durables',
            data.emploisDurables,
            totalEmplois,
            'bg-gradient-to-r from-status-danger to-status-danger',
            <MinusCircle size={14} className="text-white" />,
            'emploi'
          )}
        </div>

        {/* Excédent */}
        <Card variant="default" padding="sm" className={excedentRessources >= 0 ? 'bg-status-success-bg border-status-success/30' : 'bg-status-danger-bg border-status-danger/30'}>
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-content-primary">Excédent de Ressources (I - II)</span>
            <span className={`text-lg font-bold ${excedentRessources >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
              {excedentRessources >= 0 ? '+' : ''}{excedentRessources.toLocaleString()} FCFA
            </span>
          </div>
        </Card>

        {/* Variation BFR */}
        {renderLignesSection(
          'III - Variation du BFR',
          data.variationBFR,
          variationBFR,
          'bg-gradient-to-r from-status-info to-status-info',
          <Layers size={14} className="text-white" />,
          'ressource'
        )}

        {/* Variation Trésorerie finale */}
        <Card variant="default" padding="sm" className={variationTresorerie >= 0 ? 'bg-status-success-bg border-status-success/50' : 'bg-status-danger-bg border-status-danger/50'}>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm font-bold text-content-primary">VARIATION DE TRESORERIE</span>
            <span className={`text-xl font-bold ${variationTresorerie >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
              {variationTresorerie >= 0 ? '+' : ''}{variationTresorerie.toLocaleString()} FCFA
            </span>
          </div>
          <div className="border-t border-edge pt-2 mt-2 space-y-1">
            {data.tresorerie.map((t) => (
              <div key={t.code} className="flex justify-between text-xs">
                <span className="text-content-muted">{t.libelle}</span>
                <span className="text-content-primary font-mono">{t.montantN.toLocaleString()} FCFA</span>
              </div>
            ))}
          </div>
        </Card>
      </>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-linear-to-r from-status-warning to-status-danger rounded-xl p-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white">TAFIRE</h2>
              <p className="text-[10px] text-white/80">Tableau Financier des Ressources et Emplois - OHADA</p>
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={exercice}
              onChange={(e) => setExercice(Number.parseInt(e.target.value))}
              className="bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg border-transparent focus:outline-none"
            >
              {Array.from({ length: 5 }).map((_, i) => {
                const year = new Date().getFullYear() - i;
                return <option key={year} value={year} className="text-black">{year}</option>;
              })}
            </select>
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

      {renderContent()}
    </div>
  );
}
