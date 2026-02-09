import React, { useState, useCallback } from 'react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { usePaie, BulletinPaie } from '../../hooks/hr/usePaie';
import { Card, Button, ResponsiveTable, Badge, TabGroup } from '../ui';
import { FileText, Play, CheckCircle, Download, FileCheck, Calculator, AlertCircle, Banknote, Settings } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { isAdminRole } from '@shared/types/roles';
import { StatutBulletin, STATUT_BULLETIN_LABELS } from '@shared/enum/status-constants';
import SalaryAdvances from './SalaryAdvances';
import PayrollConfigPanel from './PayrollConfigPanel';

export default function PaieManager() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGeneratePaie = hasPermission('rh', 'edit') || hasPermission('paie', 'create');
  const canViewAllPaie = hasPermission('rh', 'view') || hasPermission('paie', 'view');

  const { user } = useUserProfile();
  const { myBulletins, allBulletins, generatePaie, isGenerating, loadingMyBulletins } = usePaie();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const isRH = isAdminRole(user?.role) || canViewAllPaie || canGeneratePaie;
  const [activeTab, setActiveTab] = useState('my');

  const handleGenerate = async () => {
    try {
        await generatePaie(selectedMonth);
    } catch (e) {
        // handled in hook
    }
  };

  const columns = [
    { key: 'mois', label: 'Mois', primary: true, format: (val: string) => <span className="font-mono font-medium">{val}</span> },
    { key: 'employeNom', label: 'Employé', hideOnMobile: true },
    { key: 'salaireNet', label: 'Net à Payer', format: (val: string) => <span className="font-bold text-emerald-600 dark:text-emerald-400">{parseInt(val).toLocaleString()} FCFA</span> },
    { key: 'statut', label: 'Statut', format: (val: string) => (
        <Badge variant={val === StatutBulletin.VALIDATED || val === StatutBulletin.PAID ? 'success' : 'warning'} value={STATUT_BULLETIN_LABELS[val as keyof typeof STATUT_BULLETIN_LABELS] || val} />
    )},
    { key: 'actions', label: 'Actions', format: (_val: any, item: BulletinPaie) => (
        <Button variant="ghost" size="sm" icon={Download} onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDownload(item); }} />
    )}
  ];

  const handleDownload = useCallback((item: BulletinPaie) => {
    if (item.pdfUrl) {
        window.open(item.pdfUrl, '_blank');
    } else {
        toast.warning("Le fichier PDF n'a pas encore été généré pour ce bulletin.");
    }
  }, []);

  const handleExportComptable = useCallback(() => {
    if (!allBulletins || allBulletins.length === 0) return;

    // Filter for selected month
    const bulletinsDuMois = (allBulletins as BulletinPaie[]).filter(b => b.mois === selectedMonth);

    if (bulletinsDuMois.length === 0) {
        toast.warning("Aucun bulletin validé pour ce mois.");
        return;
    }

    // Generate CSV
    const headers = ['Mois', 'Employé', 'Salaire Base', 'Salaire Net', 'Statut', 'Date Paiement'];
    const rows = bulletinsDuMois.map(b => [
        b.mois,
        `"${b.employeNom}"`,
        b.salaireBase,
        b.salaireNet,
        b.statut,
        b.datePaiement || ''
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `paie_export_${selectedMonth}.csv`);
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
          <div className="grid lg:grid-cols-3 gap-3">
             {/* Left Column (2/3) */}
             <div className="lg:col-span-2 space-y-3">
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
                        <p className="text-xs text-slate-400">
                          Sélectionnez le mois à traiter
                        </p>
                        <input 
                            type="month" 
                            className="mt-2 w-full max-w-xs px-3 py-2 border rounded text-sm bg-slate-900 border-slate-700 text-white focus:ring-1 focus:ring-emerald-500/50 outline-none font-mono"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
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

               {/* History Card */}
               <Card padding="none" className="bg-slate-900/50 border-slate-800 flex flex-col">
                   <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                       <div className="text-sm font-bold text-white flex items-center gap-2">
                           <FileCheck size={16} className="text-blue-400"/>
                           Derniers Traitements
                       </div>
                   </div>
                   <div className="p-2 space-y-2">
                       {isRH && allBulletins.length > 0 ? (
                           Object.entries(
                               (allBulletins as BulletinPaie[]).reduce((acc: any, b) => {
                                   acc[b.mois] = (acc[b.mois] || 0) + 1;
                                   return acc;
                               }, {})
                           )
                           .sort((a: any, b: any) => b[0].localeCompare(a[0]))
                           .slice(0, 5)
                           .map(([mois, count]: any) => (
                               <div key={mois} className="flex items-center justify-between p-2 bg-slate-800/60 rounded border border-slate-700/50">
                                   <div className="flex items-center gap-2">
                                       <div className="p-1.5 bg-green-500/10 rounded text-green-400">
                                           <CheckCircle size={12} />
                                       </div>
                                       <div>
                                           <div className="text-xs font-semibold text-white capitalize">
                                               {new Date(mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                                           </div>
                                           <div className="text-[10px] text-slate-500">{count} bulletins</div>
                                       </div>
                                   </div>
                                   <Badge value="Terminé" variant="success" size="sm" className="text-[9px] px-1.5 py-0" />
                               </div>
                           ))
                       ) : (
                           <div className="text-center py-4 text-slate-500 text-xs">
                               Aucun historique disponible.
                           </div>
                       )}
                   </div>
               </Card>
             </div>

             {/* Right Column (1/3) */}
             <div className="space-y-3">
                <Card variant="glass" className="bg-gradient-to-br from-blue-900/20 to-slate-900/40 border-slate-800" padding="sm">
                    <div className="flex items-center gap-2 font-bold text-blue-400 text-xs uppercase tracking-wide mb-3">
                        <AlertCircle size={14} />
                        Règles de Calcul
                    </div>
                    <div className="space-y-2">
                        <div className="flex gap-2 text-xs text-slate-300">
                            <span className="text-blue-500 font-bold">•</span>
                            <p>Basé sur <span className="text-white font-medium">salaire profil</span>.</p>
                        </div>
                        <div className="flex gap-2 text-xs text-slate-300">
                            <span className="text-blue-500 font-bold">•</span>
                            <p>Déduction <span className="text-white font-medium">IPR & CNSS</span>.</p>
                        </div>
                        <div className="flex gap-2 text-xs text-slate-300">
                            <span className="text-blue-500 font-bold">•</span>
                            <p>Primes incluses.</p>
                        </div>
                        <div className="flex gap-2 text-xs text-slate-300">
                            <span className="text-blue-500 font-bold">•</span>
                            <p>Absences déduites.</p>
                        </div>
                    </div>
                </Card>

                <Card className="bg-emerald-900/10 border-emerald-900/20" padding="sm">
                    <div className="flex items-start gap-2">
                        <Download className="text-emerald-500 mt-0.5" size={16} />
                        <div className="flex-1">
                            <h4 className="font-bold text-white text-xs">Export Comptable</h4>
                            <p className="text-[10px] text-emerald-400/70 mt-0.5 mb-2">Fichier virement bancaire.</p>
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
                    columns={columns.filter(c => c.key !== 'employeNom')} 
                    emptyMessage="Aucun bulletin de paie disponible."
                    loading={loadingMyBulletins}
                    maxHeight="100%"
                    density="compact"
                    className="border-0 rounded-none h-full"
                    headerClassName="bg-slate-900 sticky top-0"
                />
            </div>
        </div>
      )}
    </div>
  );
}
