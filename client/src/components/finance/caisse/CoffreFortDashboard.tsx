
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ArrowRightLeft, 
  Wallet, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Shield,
  AlertTriangle,
  Settings
} from "lucide-react";
import { toast } from 'sonner';

import { Card, Button, Badge, StatCard, ResponsiveTable, TabGroup } from "@/components/ui";
import { coffreApi } from "@/lib/api-client";
import { SkeletonCard } from '@/components/ui/Skeleton';
import { CoffreAdminPanel } from './CoffreAdminPanel';
import { usePermissions } from '../../auth/ProtectedFeature';

interface CoffreFortDashboardProps {
  agenceId: string;
}

export function CoffreFortDashboard({ agenceId }: CoffreFortDashboardProps) {
  const { data: transfertsData, isLoading, refetch } = useQuery({
    queryKey: ["transferts-coffre", agenceId],
    queryFn: () => coffreApi.listTransferts({ agenceId, limit: 10 }),
  });

  const { hasPermission } = usePermissions();
  // Permissions defined in seed-demo.ts: 'coffre.transfert.validate', 'coffre.transfert.execute', 'coffre.config.view'
  const canValidate = hasPermission('coffre', 'transfert.validate'); 
  const canExecute = hasPermission('coffre', 'transfert.execute');
  const canConfigure = hasPermission('coffre', 'config.view') || hasPermission('coffre', 'config.edit');

  const [activeTab, setActiveTab] = useState('operations');

  const transferts = transfertsData?.data || [];
  const stats = transfertsData?.meta?.stats || {}; // Assuming API returns stats or we verify logic later

  // Simple hardcoded stats for visual fallback if API doesn't provide them yet
  const pendingCount = transferts.filter((t: any) => t.statut === 'Demandé' || t.statut === 'En attente').length;
  const todayVolume = transferts
    .filter((t: any) => new Date(t.createdAt).toDateString() === new Date().toDateString())
    .reduce((acc: number, t: any) => acc + Number(t.montant), 0);

  const handleValidate = async (id: string, approved: boolean) => {
    try {
      await coffreApi.validateTransfert(id, approved);
      toast.success(approved ? "Transfert validé" : "Transfert rejeté", {
        description: `Le transfert a été ${approved ? "validé" : "rejeté"} avec succès.`
      });
      refetch();
    } catch (e: any) {
      toast.error("Erreur", {
        description: e.message || "Impossible de traiter la demande."
      });
    }
  };

  const handleExecute = async (id: string) => {
    try {
      await coffreApi.executeTransfert(id);
      toast.success("Transfert exécuté", {
        description: "Les fonds ont été déplacés avec succès."
      });
      refetch();
    } catch (e: any) {
       toast.error("Erreur d'exécution", {
        description: e.message || "Impossible d'exécuter le transfert."
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
           {[1, 2, 3].map(i => <SkeletonCard key={i} className="h-24" />)}
        </div>
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  const columns = [
    { 
      key: 'date', 
      label: 'Date', 
      render: (row: any) => (
        <span className="text-sm text-slate-300">
           {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm", { locale: fr })}
        </span>
      )
    },
    { 
      key: 'type', 
      label: 'Type',
      render: (row: any) => (
        <div className="flex items-center gap-2">
            {row.typeTransfert === "COFFRE_VERS_CAISSE" ? (
                <Badge variant="warning" size="sm" icon={<ArrowDownRight size={12} />} value="Sortie" />
            ) : (
                <Badge variant="success" size="sm" icon={<ArrowUpRight size={12} />} value="Entrée" />
            )}
            <span className="text-xs text-slate-400 hidden sm:inline">
                {row.typeTransfert === "COFFRE_VERS_CAISSE" ? "Vers Caisse" : "De Caisse"}
            </span>
        </div>
      )
    },
    { 
      key: 'trajet', 
      label: 'Caisse Concernée',
      render: (row: any) => (
        <span className="font-medium text-white">
          {row.typeTransfert === "COFFRE_VERS_CAISSE" ? row.caisseDestinationNom : row.caisseSourceNom}
        </span>
      )
    },
    { 
      key: 'montant', 
      label: 'Montant',
      align: 'right' as const,
      render: (row: any) => (
        <span className="font-bold font-mono text-white">
            {Number(row.montant).toLocaleString()} FCFA
        </span>
      )
    },
    { 
      key: 'initiateur', 
      label: 'Initié par',
      render: (row: any) => (
        <span className="text-sm text-slate-400">
            {row.requestedByNom} {row.requestedByPrenom?.charAt(0)}.
        </span>
      )
    },
    { 
      key: 'statut', 
      label: 'Statut',
      render: (row: any) => {
        let variant: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';
        if (row.statut === 'Validé' || row.statut === 'Exécuté') variant = 'success';
        if (row.statut === 'Demandé' || row.statut === 'En attente') variant = 'warning';
        if (row.statut === 'Rejeté' || row.statut === 'Annulé') variant = 'danger';

        return <Badge variant={variant} value={row.statut} />;
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right' as const,
      render: (row: any) => {
        if (row.statut === 'Demandé' || row.statut === 'En attente') {
            return (
                <div className="flex justify-end gap-1">
                    {canValidate && (
                    <>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 w-8 p-0 rounded-full"
                        onClick={() => handleValidate(row.id, true)}
                        title="Valider"
                    >
                        <CheckCircle2 size={16} />
                    </Button>
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0 rounded-full"
                        onClick={() => handleValidate(row.id, false)}
                        title="Rejeter"
                    >
                        <XCircle size={16} />
                    </Button>
                    </>
                    )}
                </div>
            );
        }
        if (row.statut === 'Validé') {
            return canExecute ? (
                <Button 
                    size="sm" 
                    variant="primary"
                    className="h-7 text-xs"
                    onClick={() => handleExecute(row.id)}
                >
                    Exécuter
                </Button>
            ) : <span className="text-slate-500 text-xs">En attente d'exécution</span>;
        }
        return <span className="text-slate-600">-</span>;
      }
    }
  ];



  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Coffre-Fort</h2>
        
        {/* Simple Tab Switcher if TabGroup not suitable or for quick toggle */}
        <div className="flex space-x-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
           <button
             onClick={() => setActiveTab('operations')}
             className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'operations' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
           >
             <div className="flex items-center gap-2">
               <Wallet size={16} />
               Opérations
             </div>
           </button>
           {canConfigure && (
           <button
             onClick={() => setActiveTab('admin')}
             className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'admin' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'}`}
           >
             <div className="flex items-center gap-2">
               <Settings size={16} />
               Administration
             </div>
           </button>
           )}
        </div>
      </div>

      {activeTab === 'admin' ? (
        <CoffreAdminPanel agenceId={agenceId} />
      ) : (
        <>
        {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard 
            title="Solde Coffre"
            value="--- FCFA"
            icon={Wallet}
            color="primary"
        />
        <StatCard 
            title="En Attente"
            value={pendingCount}
            variant="default"
            color="warning"
            icon={Clock}
        />
        <StatCard 
            title="Mouvements J"
            value={todayVolume}
            variant="default"
            color="primary" // Changed from info to primary
            icon={ArrowRightLeft}
        />
      </div>

      <Card className="overflow-hidden bg-slate-900/50 backdrop-blur border-slate-800">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
             <div>
                <h3 className="font-bold text-white text-lg">Demandes de Transfert</h3>
                <p className="text-slate-400 text-sm">Gestion des mouvements de fonds agence</p>
             </div>
             <Button variant="outline" size="sm" onClick={() => refetch()}>
                <Loader2 size={14} className="mr-2" />
                Actualiser
             </Button>
        </div>
        
        <ResponsiveTable 
            data={transferts}
            columns={columns}
            emptyMessage="Aucune demande de transfert en cours."
        />
      </Card>
      </>
      )}
    </div>
  );
}
