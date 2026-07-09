import React, { useState, useCallback } from 'react';
import { Download, Printer, FileText, BookOpen, ClipboardList, RefreshCw } from 'lucide-react';
import { useBranding } from '../../../contexts/BrandingContext';
import {
  useJournalCentralisateur,
  useBilanOHADA,
  useCompteResultatOHADA,
  useLivreInventaire,
  useAccountingWebSocket,
} from '../../../hooks/accounting/useAccounting';

import {
  exportJCExcel,
  exportJCPDF,
  exportBilanExcel,
  exportBilanPDF,
  exportCRExcel,
  exportCRPDF,
  exportLIExcel,
  exportLIPDF,
  JournalCentralisateurEntryExport,
  JournalCentralisateurDataExport,
  BilanSectionExport,
  BilanDataExport,
  CompteResultatSectionExport,
  CompteResultatDataExport,
  LivreInventaireLineExport,
  LivreInventaireDataExport
} from './exports/rapportsOHADAExports';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror server-side gl-reporting-service types)
// ─────────────────────────────────────────────────────────────────────────────

interface JournalCentralisateurEntry extends JournalCentralisateurEntryExport {}
interface JournalCentralisateurData extends JournalCentralisateurDataExport {}
interface BilanSection extends BilanSectionExport {}
interface BilanData extends BilanDataExport {}
interface CompteResultatSection extends CompteResultatSectionExport {}
interface CompteResultatData extends CompteResultatDataExport {}
interface LivreInventaireLine extends LivreInventaireLineExport {}
interface LivreInventaireData extends LivreInventaireDataExport {}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) => (n || 0).toLocaleString('fr-FR');
const fmtFCFA = (n: number) => fmt(n) + ' FCFA';

const MONTH_NAMES = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function RapportsOHADA() {
  const { branding } = useBranding();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dateArret, setDateArret] = useState(now.toISOString().split('T')[0]);
  const [exercice, setExercice] = useState(String(now.getFullYear()));

  const dateDebut = `${exercice}-01-01`;
  const dateFin = `${exercice}-12-31`;
  const dateInventaire = dateArret;

  useAccountingWebSocket();

  const { data: jcData, isLoading: jcLoading, refetch: jcRefetch } =
    useJournalCentralisateur(year, month);
  const { data: bilanData, isLoading: bilanLoading, refetch: bilanRefetch } =
    useBilanOHADA(dateArret);
  const { data: crData, isLoading: crLoading, refetch: crRefetch } =
    useCompteResultatOHADA(dateDebut, dateFin);
  const { data: liData, isLoading: liLoading, refetch: liRefetch } =
    useLivreInventaire(dateInventaire);

  // ─────────────────────────────────────────────────────────────────────────
  // JOURNAL CENTRALISATEUR — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleJCExcel = useCallback(async () => {
    await exportJCExcel(jcData as JournalCentralisateurData);
  }, [jcData]);

  // ─────────────────────────────────────────────────────────────────────────
  // JOURNAL CENTRALISATEUR — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleJCPDF = useCallback(async () => {
    await exportJCPDF(jcData as JournalCentralisateurData, branding);
  }, [jcData, branding]);

  // ─────────────────────────────────────────────────────────────────────────
  // BILAN OHADA — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleBilanExcel = useCallback(async () => {
    await exportBilanExcel(bilanData as BilanData);
  }, [bilanData]);

  // ─────────────────────────────────────────────────────────────────────────
  // BILAN OHADA — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleBilanPDF = useCallback(async () => {
    await exportBilanPDF(bilanData as BilanData, branding);
  }, [bilanData, branding]);

  // ─────────────────────────────────────────────────────────────────────────
  // COMPTE DE RÉSULTAT OHADA — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleCRExcel = useCallback(async () => {
    await exportCRExcel(crData as CompteResultatData, exercice);
  }, [crData, exercice]);

  // ─────────────────────────────────────────────────────────────────────────
  // COMPTE DE RÉSULTAT OHADA — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleCRPDF = useCallback(async () => {
    await exportCRPDF(crData as CompteResultatData, exercice, branding);
  }, [crData, exercice, branding]);

  // ─────────────────────────────────────────────────────────────────────────
  // LIVRE D'INVENTAIRE — Excel
  // ─────────────────────────────────────────────────────────────────────────
  const handleLIExcel = useCallback(async () => {
    await exportLIExcel(liData as LivreInventaireData);
  }, [liData]);

  // ─────────────────────────────────────────────────────────────────────────
  // LIVRE D'INVENTAIRE — PDF
  // ─────────────────────────────────────────────────────────────────────────
  const handleLIPDF = useCallback(async () => {
    await exportLIPDF(liData as LivreInventaireData, branding);
  }, [liData, branding]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const isAnyLoading = jcLoading || bilanLoading || crLoading || liLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-status-warning to-status-danger rounded-xl p-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="flex items-center gap-2 flex-shrink-0">
            <FileText className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-sm font-bold text-white leading-tight whitespace-nowrap">États Financiers OHADA</h2>
              <p className="text-[10px] text-white/80 whitespace-nowrap">Téléchargement Excel & PDF</p>
            </div>
          </div>
          <div className="w-px h-10 bg-white/20 flex-shrink-0" />
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-white/15 rounded-lg px-3 py-1.5">
              <div className="text-base font-bold text-white leading-none">4</div>
              <div className="text-[9px] text-white/70">Rapports</div>
            </div>
          </div>
          <div className="flex-1 min-w-4" />
          <button
            onClick={() => { jcRefetch(); bilanRefetch(); crRefetch(); liRefetch(); }}
            disabled={isAnyLoading}
            className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnyLoading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 1. Journal Centralisateur */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-status-info to-accent p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Journal Centralisateur</h3>
                  <p className="text-[9px] text-white/70">Synthèse mensuelle par journal</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleJCExcel} disabled={jcLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleJCPDF} disabled={jcLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-content-muted block mb-1">Année</label>
                <select value={year} onChange={e => setYear(Number(e.target.value))} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong">
                  {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-content-muted block mb-1">Mois</label>
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong">
                  {MONTH_NAMES.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            {jcLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : (jcData as JournalCentralisateurData)?.entries?.length > 0 ? (
              <div className="text-xs text-content-secondary space-y-1">
                <div className="flex justify-between text-content-muted">
                  <span>{(jcData as JournalCentralisateurData).entries.length} journaux</span>
                  <span>Débit: {fmtFCFA((jcData as JournalCentralisateurData).grandTotalDebit)}</span>
                </div>
                <div className="flex justify-between text-content-muted">
                  <span>{(jcData as JournalCentralisateurData).periodLabel}</span>
                  <span>Crédit: {fmtFCFA((jcData as JournalCentralisateurData).grandTotalCredit)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune écriture pour cette période</p>
            )}
          </div>
        </div>

        {/* 2. Bilan OHADA */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-accent to-status-info p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Bilan OHADA</h3>
                  <p className="text-[9px] text-white/70">Situation patrimoniale</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleBilanExcel} disabled={bilanLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleBilanPDF} disabled={bilanLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Date d'arrêté</label>
              <input type="date" value={dateArret} onChange={e => setDateArret(e.target.value)} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong" />
            </div>
            {bilanLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : bilanData ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-status-info-bg border border-status-info/20 rounded-lg p-2">
                  <div className="text-status-info font-bold">{fmtFCFA((bilanData as BilanData).totalActif)}</div>
                  <div className="text-[9px] text-content-muted">Total Actif</div>
                </div>
                <div className="bg-status-info-bg border border-status-info/20 rounded-lg p-2">
                  <div className="text-status-info font-bold">{fmtFCFA((bilanData as BilanData).totalPassif)}</div>
                  <div className="text-[9px] text-content-muted">Total Passif</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune donnée</p>
            )}
          </div>
        </div>

        {/* 3. Compte de Résultat OHADA */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-status-success to-status-success p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Compte de Résultat OHADA</h3>
                  <p className="text-[9px] text-white/70">Charges & Produits</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleCRExcel} disabled={crLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleCRPDF} disabled={crLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Exercice</label>
              <select value={exercice} onChange={e => setExercice(e.target.value)} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong">
                {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {crLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : crData ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-status-success">Produits</span>
                  <span className="text-content-primary font-mono">{fmtFCFA((crData as CompteResultatData).totalProduits)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-status-danger">Charges</span>
                  <span className="text-content-primary font-mono">{fmtFCFA((crData as CompteResultatData).totalCharges)}</span>
                </div>
                <div className="border-t border-edge pt-1 flex justify-between font-bold">
                  <span className={(crData as CompteResultatData).resultatNet >= 0 ? 'text-status-success' : 'text-status-danger'}>
                    {(crData as CompteResultatData).resultatNet >= 0 ? 'Bénéfice' : 'Perte'}
                  </span>
                  <span className="text-content-primary font-mono">{fmtFCFA(Math.abs((crData as CompteResultatData).resultatNet))}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune donnée</p>
            )}
          </div>
        </div>

        {/* 4. Livre d'Inventaire */}
        <div className="bg-surface rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-status-warning to-status-warning p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-white" />
                <div>
                  <h3 className="text-xs font-bold text-white">Livre d'Inventaire</h3>
                  <p className="text-[9px] text-white/70">Inventaire comptable OHADA</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleLIExcel} disabled={liLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="Excel">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleLIPDF} disabled={liLoading} className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg transition-colors disabled:opacity-50" title="PDF">
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div>
              <label className="text-[10px] text-content-muted block mb-1">Date inventaire</label>
              <input type="date" value={dateArret} onChange={e => setDateArret(e.target.value)} className="w-full bg-surface-elevated text-content-primary text-xs px-2 py-1.5 rounded-lg border border-edge-strong" />
            </div>
            {liLoading ? (
              <div className="h-16 bg-surface-elevated/50 rounded-lg animate-pulse" />
            ) : liData ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg p-2">
                  <div className="text-status-warning font-bold">{(liData as LivreInventaireData).lignes.filter(l => l.solde !== 0).length}</div>
                  <div className="text-[9px] text-content-muted">Comptes actifs</div>
                </div>
                <div className="bg-status-warning-bg border border-status-warning/20 rounded-lg p-2">
                  <div className="text-status-warning font-bold">{fmtFCFA((liData as LivreInventaireData).totalProduits - (liData as LivreInventaireData).totalCharges)}</div>
                  <div className="text-[9px] text-content-muted">Résultat</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-content-muted text-center py-3">Aucune donnée</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
