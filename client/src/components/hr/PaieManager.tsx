import React, { useState, useCallback } from 'react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { usePaie, BulletinPaie } from '../../hooks/hr/usePaie';
import { Card, Button, ResponsiveTable, Badge, TabGroup } from '../ui';
import { FileText, Play, CheckCircle, Download, FileCheck, Calculator, AlertCircle } from 'lucide-react';
import { usePermissions } from '../auth/ProtectedFeature';
import { toast } from '../../lib/toast';
import { isAdminRole } from '@shared/types/roles';
import { StatutBulletin, STATUT_BULLETIN_LABELS } from '@shared/enum/status-constants';

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
    { key: 'mois', label: 'Mois', primary: true, render: (val: string) => <span className="font-mono font-medium">{val}</span> },
    { key: 'employeNom', label: 'Employé', hideOnMobile: true },
    { key: 'salaireNet', label: 'Net à Payer', render: (val: string) => <span className="font-bold text-emerald-600 dark:text-emerald-400">{parseInt(val).toLocaleString()} FCFA</span> },
    { key: 'statut', label: 'Statut', badge: true, render: (val: string) => (
        <Badge variant={val === StatutBulletin.VALIDATED || val === StatutBulletin.PAID ? 'success' : 'warning'} value={STATUT_BULLETIN_LABELS[val as keyof typeof STATUT_BULLETIN_LABELS] || val} />
    )},
    { key: 'actions', label: 'Actions', render: (val: any, item: BulletinPaie) => (
        <Button variant="ghost" size="sm" icon={Download} onClick={(e) => { e.stopPropagation(); handleDownload(item); }} />
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
    ...(isRH ? [{ key: 'generate', label: 'Gestion Paie', icon: Calculator }] : [])
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab Navigation for RH */}
      {isRH && (
        <div className="w-full sm:w-auto">
          <TabGroup 
            tabs={tabs} 
            activeTab={activeTab} 
            onTabChange={setActiveTab} 
            variant="pills"
            className="mb-4"
          />
        </div>
      )}

      {activeTab === 'generate' && isRH ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card variant="default" padding="md" className="relative overflow-hidden">
               <div className="absolute top-0 right-0 p-3 opacity-10">
                  <Calculator size={120} />
               </div>
               <Card.Header className="relative z-10">
                  <div className="text-lg font-bold text-white flex items-center gap-2">
                    <Play className="text-emerald-400" size={20} />
                    Génération de la Paie
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    Lancez le calcul des salaires pour la période sélectionnée.
                  </p>
               </Card.Header>
               
               <Card.Content className="relative z-10 pt-4">
                  <div className="flex flex-col sm:flex-row items-end gap-4 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                      <div className="w-full sm:flex-1">
                          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Période de Paie</label>
                          <input 
                              type="month" 
                              className="w-full px-4 py-3 border rounded-lg bg-slate-900 border-slate-700 text-white focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all font-mono"
                              value={selectedMonth}
                              onChange={(e) => setSelectedMonth(e.target.value)}
                          />
                      </div>
                      <Button 
                          onClick={handleGenerate} 
                          disabled={isGenerating}
                          variant="success"
                          size="lg"
                          className="w-full sm:w-auto shadow-lg shadow-emerald-500/20"
                          icon={Play}
                          isLoading={isGenerating}
                      >
                          Lancer le Traitement
                      </Button>
                  </div>
               </Card.Content>
            </Card>

            <Card padding="sm">
                <Card.Header>
                    <div className="text-base font-bold text-white flex items-center gap-2">
                        <FileCheck size={18} className="text-blue-400"/>
                        Derniers Traitements
                    </div>
                </Card.Header>
                <Card.Content>
                    <div className="space-y-3">
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
                                <div key={mois} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700/50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                                            <CheckCircle size={16} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-white">
                                                {new Date(mois).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^\w/, (c: string) => c.toUpperCase())}
                                            </div>
                                            <div className="text-xs text-slate-500">{count} bulletins générés</div>
                                        </div>
                                    </div>
                                    <Badge value="Terminé" variant="success" />
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 text-slate-500 text-sm">
                                Aucun historique disponible.
                            </div>
                        )}
                    </div>
                </Card.Content>
            </Card>
          </div>

          <div className="space-y-6">
             <Card variant="glass" className="bg-gradient-to-br from-blue-900/40 to-slate-900/40">
                <Card.Header>
                    <div className="flex items-center gap-2 font-bold text-blue-400 text-sm uppercase tracking-wide">
                        <AlertCircle size={16} />
                        Règles de Calcul
                    </div>
                </Card.Header>
                <Card.Content className="space-y-3">
                    <div className="flex gap-3 text-sm text-slate-300">
                        <span className="text-blue-500 font-bold">•</span>
                        <p>Calcul basé sur le <span className="text-white font-medium">salaire de base</span> profil.</p>
                    </div>
                    <div className="flex gap-3 text-sm text-slate-300">
                        <span className="text-blue-500 font-bold">•</span>
                        <p>Déduction automatique <span className="text-white font-medium">IPR & CNSS</span>.</p>
                    </div>
                    <div className="flex gap-3 text-sm text-slate-300">
                        <span className="text-blue-500 font-bold">•</span>
                        <p>Primes (Transport, Logement) incluses.</p>
                    </div>
                    <div className="flex gap-3 text-sm text-slate-300">
                        <span className="text-blue-500 font-bold">•</span>
                        <p>Absences non justifiées déduites.</p>
                    </div>
                </Card.Content>
             </Card>

             <Card className="bg-emerald-900/10 border-emerald-900/30">
                <div className="p-4 flex items-start gap-3">
                    <Download className="text-emerald-500 mt-1" size={20} />
                    <div>
                        <h4 className="font-bold text-white text-sm">Export Comptable</h4>
                        <p className="text-xs text-emerald-400/80 mt-1 mb-3">Télécharger le fichier de virement bancaire.</p>
                        <Button size="sm" variant="outline" onClick={handleExportComptable} className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 h-7 text-xs px-2">Télécharger CSV</Button>
                    </div>
                </div>
             </Card>
          </div>
        </div>
      ) : (
        <Card padding="none" className="overflow-hidden bg-transparent sm:bg-slate-800 border-none sm:border border-slate-700">
            <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center rounded-xl sm:rounded-none mb-3 sm:mb-0 border sm:border-0">
                <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                    <FileText size={20} className="text-cyan-400" />
                    Mes Bulletins
                </h3>
            </div>
            <div className="p-0">
                <ResponsiveTable
                    data={myBulletins || []}
                    columns={columns.filter(c => c.key !== 'employeNom')} 
                    emptyMessage="Aucun bulletin de paie disponible."
                    loading={loadingMyBulletins}
                />
            </div>
        </Card>
      )}
    </div>
  );
}
