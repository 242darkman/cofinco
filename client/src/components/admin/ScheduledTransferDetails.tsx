import React, { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import { 
    X, 
    Play, 
    Pause, 
    Edit2, 
    History, 
    Code, 
    CheckCircle, 
    AlertCircle, 
    Clock, 
    Calendar,
    ArrowRight
} from 'lucide-react';
import { Button, Badge, IconButton, Switch } from '../ui';
import { formatDate, formatMoney } from '../../lib/format';

// --- Types ---

// Reusing the type from AdminVirementsProgrammes or defining a shared one would be better, 
// but for now I'll define a satisfying interface locally or import if I refactor types later.
export type ScheduledTransfer = {
  id: string;
  compteSourceId?: string;
  compteDestId?: string;
  montant?: string | number;
  frequence?: 'once' | 'daily' | 'weekly' | 'monthly';
  prochaineExecution?: string | Date | null;
  actif?: boolean;
  dernierExecution?: string | Date | null;
  statutDernier?: string | null;
  erreurDerniere?: string | null;
  sourceNumero?: string;
  sourceClientNom?: string;
  sourceClientPrenom?: string;
  destNumero?: string;
  destClientNom?: string;
  destClientPrenom?: string;
};

interface ScheduledTransferDetailsProps {
    transfer: ScheduledTransfer | null;
    isOpen: boolean;
    onClose: () => void;
    onToggleActive?: (transfer: ScheduledTransfer, active: boolean) => void;
    onEdit?: (transfer: ScheduledTransfer) => void;
    onRunNow?: (transfer: ScheduledTransfer) => void;
}

function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) setMatches(media.matches);
        const listener = () => setMatches(media.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, [matches, query]);
    return matches;
}

export default function ScheduledTransferDetails({ 
    transfer, 
    isOpen, 
    onClose,
    onToggleActive,
    onEdit,
    onRunNow
}: ScheduledTransferDetailsProps) {
    const isDesktop = useMediaQuery('(min-width: 768px)');

    if (!transfer && !isOpen) return null;

    // --- Mock History ---
    const history = [
         { date: new Date(), status: transfer?.statutDernier || 'success', message: transfer?.erreurDerniere || 'Exécution réussie' },
         { date: new Date(Date.now() - 86400000 * 30), status: 'success', message: 'Exécution réussie' },
         { date: new Date(Date.now() - 86400000 * 60), status: 'failed', message: 'Solde insuffisant' },
    ];

    const Content = () => {
        if (!transfer) return null;

        const getStatusColor = (status: string | null | undefined) => {
             if (status === 'success') return 'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400';
             if (status === 'failed') return 'text-red-500 bg-red-100 dark:bg-red-500/10 dark:text-red-400';
             return 'text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400';
        };

        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-900 md:rounded-l-[16px] overflow-hidden relative border-l border-slate-200 dark:border-slate-800">
                
                {/* Header */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                             <h2 className="text-xl font-bold text-slate-900 dark:text-white">Détails du Virement</h2>
                             <p className="text-sm text-slate-500 font-mono mt-1">ID: {transfer.id}</p>
                        </div>
                        {isDesktop && (
                            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-4 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <div className="flex-1">
                            <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Montant</span>
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">
                                {formatMoney(transfer.montant)}
                            </div>
                        </div>
                        <div className="text-right">
                             <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Fréquence</span>
                             <div className="flex justify-end mt-1">
                                <Badge value={transfer.frequence || 'Once'} variant="info" />
                             </div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    
                    {/* Source / Dest Visualization */}
                    <section>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <ArrowRight size={16} /> Flux Financier
                        </h3>
                        <div className="flex flex-col gap-4 relative">
                             {/* Source */}
                             <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                                 <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                                     {transfer.sourceClientPrenom?.[0] || 'S'}
                                 </div>
                                 <div>
                                     <div className="font-medium text-slate-900 dark:text-white">
                                         {transfer.sourceClientPrenom} {transfer.sourceClientNom}
                                     </div>
                                     <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                         {transfer.sourceNumero}
                                     </div>
                                 </div>
                             </div>

                             {/* Arrow Connector */}
                             <div className="absolute left-5 top-12 bottom-12 w-0.5 bg-slate-200 dark:bg-slate-700 -z-10" />
                             
                             {/* Dest */}
                             <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 mt-2">
                                 <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                                     {transfer.destClientPrenom?.[0] || 'D'}
                                 </div>
                                 <div>
                                     <div className="font-medium text-slate-900 dark:text-white">
                                         {transfer.destClientPrenom} {transfer.destClientNom}
                                     </div>
                                     <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                         {transfer.destNumero}
                                     </div>
                                 </div>
                             </div>
                        </div>
                    </section>

                    {/* Execution History */}
                    <section>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Clock size={16} /> Historique d'exécution
                        </h3>
                        <div className="space-y-4 border-l-2 border-slate-100 dark:border-slate-800 pl-4 ml-2">
                            {history.map((event, idx) => (
                                <div key={idx} className="relative">
                                    <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${
                                        event.status === 'success' ? 'bg-emerald-400 ring-4 ring-emerald-50 dark:ring-emerald-900/20' : 
                                        event.status === 'failed' ? 'bg-red-400 ring-4 ring-red-50 dark:ring-red-900/20' : 'bg-slate-300'
                                    }`} />
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">{event.message}</p>
                                            <p className="text-xs text-slate-500">{event.status === 'success' ? 'Succès' : 'Échec'}</p>
                                        </div>
                                        <span className="text-xs text-slate-400 whitespace-nowrap">
                                            {formatDate(event.date)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    
                    {/* JSON Technical */}
                    <section>
                         <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Code size={16} /> Configuration Technique
                        </h3>
                        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
                            <pre className="text-xs font-mono text-emerald-400">
                                {JSON.stringify({ 
                                    id: transfer.id, 
                                    cron: transfer.frequence === 'monthly' ? '0 0 5 * *' : 'custom',
                                    next_run: transfer.prochaineExecution,
                                    retry_policy: 'exponential_backoff'
                                }, null, 2)}
                            </pre>
                        </div>
                    </section>

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 mr-auto">
                             <Switch 
                                checked={Boolean(transfer.actif)} 
                                onChange={(checked) => onToggleActive && onToggleActive(transfer, checked)}
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                {transfer.actif ? 'Actif' : 'Pause'}
                            </span>
                        </div>
                        
                        <IconButton 
                            icon={Edit2} 
                            variant="primary" // Changed to primary to be visible
                            // color="slate" // Removed invalid prop
                            onClick={() => onEdit && onEdit(transfer)}
                            aria-label="Modifier le virement"
                        />
                        
                        <Button 
                            variant="primary" 
                            size="sm"
                            icon={Play}
                            onClick={() => onRunNow && onRunNow(transfer)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            Forcer
                        </Button>
                    </div>
                </div>

            </div>
        );
    };

    if (isDesktop) {
        if (!isOpen) return null;
        return (
             <div className="fixed inset-0 z-50 flex justify-end">
                <div className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
                <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-right flex flex-col">
                    <Content />
                </div>
             </div>
        );
    }

    return (
        <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
                <Drawer.Content className="bg-white dark:bg-slate-900 flex flex-col rounded-t-[20px] h-[90vh] fixed bottom-0 left-0 right-0 z-50 outline-none">
                     <div className="p-4 bg-white dark:bg-slate-900 rounded-t-[20px] flex justify-center shrink-0">
                         <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    </div>
                    <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-slate-900">
                        <Content />
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
