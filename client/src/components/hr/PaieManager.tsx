import React, { useState, useCallback, useMemo } from 'react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { usePaie, BulletinPaie } from '../../hooks/hr/usePaie';
import { Card, Button, ResponsiveTable, Badge, TabGroup } from '../ui';
import { FileText, Play, CheckCircle, Download, FileCheck, Calculator, AlertCircle, Banknote, Settings, Eye, ShieldCheck, CreditCard } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { isAdminRole } from '@shared/types/roles';
import { StatutBulletin, STATUT_BULLETIN_LABELS } from '@shared/enum/status-constants';
import SalaryAdvances from './SalaryAdvances';
import PayrollConfigPanel from './PayrollConfigPanel';
import { PayslipViewer } from './PayslipViewer';

export default function PaieManager() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGeneratePaie = hasPermission('rh', 'edit') || hasPermission('paie', 'create');
  const canViewAllPaie = hasPermission('rh', 'view') || hasPermission('paie', 'view');
  const canValidate = hasPermission('rh', 'edit') || hasPermission('paie', 'approve');
  const canPay = hasPermission('rh', 'edit') || hasPermission('paie', 'manage');

  const { user } = useUserProfile();
  const {
    myBulletins, allBulletins, generatePaie, isGenerating,
    loadingMyBulletins, validateBulletins, isValidating,
    payBulletins, isPaying,
  } = usePaie();

  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const isRH = isAdminRole(user?.role) || canViewAllPaie || canGeneratePaie;
  const [activeTab, setActiveTab] = useState('my');

  // PayslipViewer state
  const [viewerBulletinId, setViewerBulletinId] = useState<number | null>(null);

  // Multi-select state for Gestion Paie tab
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const handleGenerate = async () => {
    try {
      await generatePaie(selectedMonth);
      setSelectedIds(new Set());
    } catch (e) {
      // handled in hook
    }
  };

  // Filter bulletins for selected month in manage tab
  const bulletinsDuMois = useMemo(
    () => (allBulletins as BulletinPaie[]).filter(b => b.mois === selectedMonth),
    [allBulletins, selectedMonth]
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === bulletinsDuMois.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(bulletinsDuMois.map(b => b.id)));
    }
  }, [bulletinsDuMois, selectedIds.size]);

  // Count by status for selected
  const selectedBulletins = bulletinsDuMois.filter(b => selectedIds.has(b.id));
  const draftsSelected = selectedBulletins.filter(b => b.statut === StatutBulletin.DRAFT).length;
  const validatedSelected = selectedBulletins.filter(b => b.statut === StatutBulletin.VALIDATED).length;

  const handleValidate = async () => {
    const ids = selectedBulletins.filter(b => b.statut === StatutBulletin.DRAFT).map(b => b.id);
    if (ids.length === 0) {
      toast.warning('Sélectionnez des bulletins en Brouillon à valider');
      return;
    }
    try {
      await validateBulletins(ids);
      setSelectedIds(new Set());
    } catch (e) { /* handled */ }
  };

  const handlePay = async () => {
    const ids = selectedBulletins.filter(b => b.statut === StatutBulletin.VALIDATED).map(b => b.id);
    if (ids.length === 0) {
      toast.warning('Sélectionnez des bulletins Validés à payer');
      return;
    }
    try {
      await payBulletins({ bulletinIds: ids });
      setSelectedIds(new Set());
    } catch (e) { /* handled */ }
  };

  // Columns for "Mes Bulletins"
  const myColumns = [
    { key: 'mois', label: 'Mois', primary: true, format: (val: string) => <span className="font-mono font-medium">{val}</span> },
    { key: 'salaireNet', label: 'Net à Payer', format: (val: string) => <span className="font-bold text-emerald-600 dark:text-emerald-400">{parseInt(val).toLocaleString()} FCFA</span> },
    { key: 'statut', label: 'Statut', format: (val: string) => (
      <Badge variant={val === StatutBulletin.VALIDATED || val === StatutBulletin.PAID ? 'success' : 'warning'} value={STATUT_BULLETIN_LABELS[val as keyof typeof STATUT_BULLETIN_LABELS] || val} />
    )},
    { key: 'actions', label: '', format: (_val: any, item: BulletinPaie) => (
      <Button variant="ghost" size="sm" icon={Eye} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewerBulletinId(item.id); }}>
        Voir
      </Button>
    )},
  ];

  // Columns for "Gestion Paie" (with selection checkbox + employee name)
  const manageColumns = [
    { key: '_select', label: '', format: (_val: any, item: BulletinPaie) => (
      <input
        type="checkbox"
        checked={selectedIds.has(item.id)}
        onChange={() => toggleSelect(item.id)}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="accent-emerald-500 w-3.5 h-3.5"
      />
    )},
    { key: 'employeNom', label: 'Employé', primary: true },
    { key: 'salaireBase', label: 'Base', hideOnMobile: true, format: (val: string) => <span className="font-mono text-slate-300">{parseInt(val).toLocaleString()}</span> },
    { key: 'salaireNet', label: 'Net', format: (val: string) => <span className="font-bold text-emerald-400">{parseInt(val).toLocaleString()}</span> },
    { key: 'statut', label: 'Statut', format: (val: string) => (
      <Badge
        variant={val === StatutBulletin.PAID ? 'success' : val === StatutBulletin.VALIDATED ? 'info' : 'warning'}
        value={STATUT_BULLETIN_LABELS[val as keyof typeof STATUT_BULLETIN_LABELS] || val}
      />
    )},
    { key: 'actions', label: '', format: (_val: any, item: BulletinPaie) => (
      <Button variant="ghost" size="sm" icon={Eye} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewerBulletinId(item.id); }} />
    )},
  ];

  const handleExportComptable = useCallback(() => {
    if (!allBulletins || allBulletins.length === 0) return;
    const filtered = (allBulletins as BulletinPaie[]).filter(b => b.mois === selectedMonth);
    if (filtered.length === 0) {
      toast.warning("Aucun bulletin pour ce mois.");
      return;
    }
    const headers = ['Mois', 'Employé', 'Salaire Base', 'Salaire Net', 'Statut', 'Date Paiement'];
    const rows = filtered.map(b => [
      b.mois, `"${b.employeNom}"`, b.salaireBase, b.salaireNet, b.statut, b.datePaiement || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `paie_export_${selectedMonth}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Export CSV téléchargé');
  }, [allBulletins, selectedMonth]);

  const tabs = [
    { key: 'my', label: 'Mes Bulletins', icon: FileText },
    ...(isRH ? [
      { key: 'generate', label: 'Gestion Paie', icon: Calculator },
      { key: 'avances', label: 'Avances', icon: Banknote },
      { key: 'config', label: 'Configuration', icon: Settings },
    ] : [])
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Tab Navigation for RH */}
      {isRH && (
        <div className="shrink-0 w-full sm:w-auto mt-0.5">
          <TabGroup
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            variant="pills"
            size="sm"
            className="mb-1"
          />
        </div>
      )}

      {activeTab === 'config' && isRH ? (
        <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg overflow-y-auto">
          <PayrollConfigPanel />
        </div>
      ) : activeTab === 'avances' && isRH ? (
        <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col overflow-hidden">
          <SalaryAdvances />
        </div>
      ) : activeTab === 'generate' && isRH ? (
        <div className="flex-1 overflow-y-auto min-h-0 pl-1 pr-2 pb-2">
          <div className="space-y-3">
            {/* Generation Card */}
            <Card variant="default" padding="sm" className="relative overflow-hidden bg-slate-800/80 border-slate-700">
              <div className="absolute top-0 right-0 p-2 opacity-5">
                <Calculator size={80} />
              </div>
              <div className="relative z-10 flex flex-col md:flex-row items-center gap-4 p-2">
                <div className="flex-1 space-y-1">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Play className="text-emerald-400" size={18} />
                    Génération de la Paie
                  </h3>
                  <p className="text-xs text-slate-400">Sélectionnez le mois à traiter</p>
                  <input
                    type="month"
                    className="mt-2 w-full max-w-xs px-3 py-2 border rounded text-sm bg-slate-900 border-slate-700 text-white focus:ring-1 focus:ring-emerald-500/50 outline-none font-mono"
                    value={selectedMonth}
                    onChange={(e) => { setSelectedMonth(e.target.value); setSelectedIds(new Set()); }}
                  />
                </div>
                <div className="shrink-0">
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    variant="success"
                    size="sm"
                    className="shadow-lg shadow-emerald-500/10 h-9"
                    icon={Play}
                    isLoading={isGenerating}
                  >
                    Lancer le Traitement
                  </Button>
                </div>
              </div>
            </Card>

            {/* Bulletins table for selected month */}
            <Card padding="none" className="bg-slate-900/50 border-slate-800 flex flex-col">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCheck size={16} className="text-blue-400"/>
                    Bulletins {selectedMonth}
                  </h4>
                  {bulletinsDuMois.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      className="text-[10px] text-slate-400 hover:text-white underline"
                    >
                      {selectedIds.size === bulletinsDuMois.length ? 'Désélectionner tout' : 'Tout sélectionner'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedIds.size > 0 && (
                    <span className="text-[10px] text-slate-400">{selectedIds.size} sélectionné(s)</span>
                  )}
                  {canValidate && draftsSelected > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={ShieldCheck}
                      onClick={handleValidate}
                      isLoading={isValidating}
                      disabled={isValidating}
                      className="h-7 text-[11px] border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                    >
                      Valider ({draftsSelected})
                    </Button>
                  )}
                  {canPay && validatedSelected > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={CreditCard}
                      onClick={handlePay}
                      isLoading={isPaying}
                      disabled={isPaying}
                      className="h-7 text-[11px] border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                    >
                      Payer ({validatedSelected})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Download}
                    onClick={handleExportComptable}
                    className="h-7 text-[11px]"
                  >
                    CSV
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {bulletinsDuMois.length > 0 ? (
                  <ResponsiveTable
                    data={bulletinsDuMois}
                    columns={manageColumns}
                    emptyMessage="Aucun bulletin pour ce mois."
                    density="compact"
                    maxHeight="400px"
                    className="border-0 rounded-none"
                    headerClassName="bg-slate-900 sticky top-0"
                    onRowClick={(item: BulletinPaie) => setViewerBulletinId(item.id)}
                  />
                ) : (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    Aucun bulletin généré pour {selectedMonth}.
                  </div>
                )}
              </div>
            </Card>

            {/* Summary sidebar cards */}
            <div className="grid lg:grid-cols-2 gap-3">
              <Card variant="glass" className="bg-gradient-to-br from-blue-900/20 to-slate-900/40 border-slate-800" padding="sm">
                <div className="flex items-center gap-2 font-bold text-blue-400 text-xs uppercase tracking-wide mb-3">
                  <AlertCircle size={14} />
                  Règles de Calcul
                </div>
                <div className="space-y-2">
                  <div className="flex gap-2 text-xs text-slate-300">
                    <span className="text-blue-500 font-bold">1.</span>
                    <p>Génération <span className="text-white font-medium">crée les bulletins en Brouillon</span></p>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-300">
                    <span className="text-blue-500 font-bold">2.</span>
                    <p>Validation <span className="text-white font-medium">poste l'engagement comptable (GL)</span></p>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-300">
                    <span className="text-blue-500 font-bold">3.</span>
                    <p>Paiement <span className="text-white font-medium">marque comme payé + écriture GL</span></p>
                  </div>
                </div>
              </Card>

              <Card className="bg-emerald-900/10 border-emerald-900/20" padding="sm">
                <div className="flex items-start gap-2">
                  <Download className="text-emerald-500 mt-0.5" size={16} />
                  <div className="flex-1">
                    <h4 className="font-bold text-white text-xs">Export Comptable</h4>
                    <p className="text-[10px] text-emerald-400/70 mt-0.5 mb-2">Fichier virement bancaire pour le mois sélectionné.</p>
                    <Button size="sm" variant="outline" onClick={handleExportComptable} className="w-full border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 h-6 text-[10px] px-2">
                      Télécharger CSV
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        /* Mes Bulletins tab */
        <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col">
          <div className="shrink-0 p-2 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <h3 className="font-bold text-white flex items-center gap-2 text-xs">
              <FileText size={14} className="text-cyan-400" />
              Mes Bulletins
            </h3>
          </div>
          <div className="flex-1 overflow-hidden">
            <ResponsiveTable
              data={myBulletins || []}
              columns={myColumns}
              emptyMessage="Aucun bulletin de paie disponible."
              loading={loadingMyBulletins}
              maxHeight="100%"
              density="compact"
              className="border-0 rounded-none h-full"
              headerClassName="bg-slate-900 sticky top-0"
              onRowClick={(item: BulletinPaie) => setViewerBulletinId(item.id)}
            />
          </div>
        </div>
      )}

      {/* PayslipViewer Modal */}
      <PayslipViewer
        isOpen={viewerBulletinId !== null}
        onClose={() => setViewerBulletinId(null)}
        bulletinId={viewerBulletinId}
      />
    </div>
  );
}
