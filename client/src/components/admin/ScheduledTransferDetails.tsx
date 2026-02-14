import React, { useState, useEffect } from 'react';
import { Drawer } from 'vaul';
import {
    X,
    Play,
    Edit2,
    Code,
    Clock,
    ArrowRight,
    Loader2
} from 'lucide-react';
import { Button, Badge, IconButton, Switch } from '../ui';
import { formatDate, formatMoney } from '../../lib/format';
import { compteEpargneApi } from '../../lib/api-client';
import { authService } from '../../lib/auth';

// --- Types ---

// Reusing the type from AdminVirementsProgrammes or defining a shared one would be better, 
// but for now I'll define a satisfying interface locally or import if I refactor types later.
export type ScheduledTransfer = {
  id: string;
  compteSourceId?: string;
  compteDestId?: string;
  montant?: string | number;
  frequence?: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'once' | 'daily' | 'weekly' | 'monthly';
  prochaineExecution?: string | Date | null;
  actif?: boolean;
  dernierExecution?: string | Date | null;
  statutDernier?: string | null;
  erreurDerniere?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  createdBy?: string | null;
  // Technical configuration
  timezone?: string;
  jourExecution?: number | null;
  retryCount?: number;
  maxRetries?: number;
  libelle?: string | null;
  // Source account info
  sourceNumero?: string;
  sourceType?: string;
  sourceAgenceId?: string;
  sourceUserNom?: string;
  sourceUserPrenom?: string;
  // Legacy fields (for compatibility)
  sourceClientNom?: string;
  sourceClientPrenom?: string;
  // Destination account info
  destNumero?: string;
  destType?: string;
  destAgenceId?: string;
  destUserNom?: string;
  destUserPrenom?: string;
  // Legacy fields (for compatibility)
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

interface HistoryItem {
    id: string;
    status: string;
    createdAt: string;
    errorMessage?: string | null;
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
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const isAdmin = authService.isAdmin();

    // Fetch real execution history
    useEffect(() => {
        if (!transfer?.id || !isOpen) return;

        const fetchHistory = async () => {
            setLoadingHistory(true);
            try {
                const result = await compteEpargneApi.getScheduledTransferHistory(transfer.id, { limit: 10 });
                setHistory(result?.data || []);
            } catch (err) {
                console.error('Error fetching transfer history:', err);
                setHistory([]);
            } finally {
                setLoadingHistory(false);
            }
        };

        fetchHistory();
    }, [transfer?.id, isOpen]);

    if (!transfer && !isOpen) return null;

    const Content = () => {
        if (!transfer) return null;

        // Helper to get source owner name (API returns sourceUserNom/sourceUserPrenom)
        const getSourceName = () => {
            const prenom = transfer.sourceUserPrenom || transfer.sourceClientPrenom || '';
            const nom = transfer.sourceUserNom || transfer.sourceClientNom || '';
            return `${prenom} ${nom}`.trim() || null;
        };

        // Helper to get dest owner name
        const getDestName = () => {
            const prenom = transfer.destUserPrenom || transfer.destClientPrenom || '';
            const nom = transfer.destUserNom || transfer.destClientNom || '';
            return `${prenom} ${nom}`.trim() || null;
        };

        // Get initials from name
        const getInitial = (name: string | null) => name?.[0]?.toUpperCase() || '?';

        // Format frequency for display
        const formatFrequence = (freq: string | undefined) => {
            if (!freq) return null;
            const map: Record<string, string> = {
                'ONCE': 'Une fois',
                'DAILY': 'Quotidien',
                'WEEKLY': 'Hebdomadaire',
                'MONTHLY': 'Mensuel',
                'once': 'Une fois',
                'daily': 'Quotidien',
                'weekly': 'Hebdomadaire',
                'monthly': 'Mensuel',
            };
            return map[freq] || freq;
        };

        const sourceName = getSourceName();
        const destName = getDestName();

        return (
            <div className="flex flex-col h-full bg-surface md:rounded-l-[16px] overflow-hidden relative border-l border-edge">

                {/* Header */}
                <div className="p-6 bg-surface-muted/50 border-b border-edge">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                             <h2 className="text-xl font-bold text-content-primary">Détails du Virement</h2>
                             <p className="text-sm text-content-muted font-mono mt-1">ID: {transfer.id}</p>
                        </div>
                        {isDesktop && (
                            <button onClick={onClose} className="text-content-muted hover:text-content-muted">
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-4 bg-surface p-3 rounded-xl border border-edge shadow-sm">
                        <div className="flex-1">
                            <span className="text-xs text-content-muted uppercase tracking-wider font-bold">Montant</span>
                            <div className="text-2xl font-bold text-content-primary">
                                {formatMoney(transfer.montant)}
                            </div>
                        </div>
                        <div className="text-right">
                             <span className="text-xs text-content-muted uppercase tracking-wider font-bold">Fréquence</span>
                             <div className="flex justify-end mt-1">
                                {transfer.frequence ? (
                                    <Badge value={formatFrequence(transfer.frequence)} variant="info" />
                                ) : (
                                    <span className="text-sm text-content-muted">-</span>
                                )}
                             </div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    
                    {/* Source / Dest Visualization */}
                    <section>
                        <h3 className="text-sm font-bold text-content-primary mb-4 flex items-center gap-2">
                            <ArrowRight size={16} /> Flux Financier
                        </h3>
                        <div className="flex flex-col gap-4 relative">
                             {/* Source */}
                             <div className="flex items-center gap-3 p-3 rounded-lg border border-edge bg-surface-muted/30">
                                 <div className="w-10 h-10 rounded-full bg-status-info-bg flex items-center justify-center text-status-info font-bold">
                                     {getInitial(sourceName)}
                                 </div>
                                 <div>
                                     <div className="font-medium text-content-primary">
                                         {sourceName || <span className="text-content-muted italic">Non renseigné</span>}
                                     </div>
                                     <div className="text-xs text-content-muted font-mono">
                                         {transfer.sourceNumero || '-'}
                                     </div>
                                 </div>
                             </div>

                             {/* Arrow Connector */}
                             <div className="absolute left-5 top-12 bottom-12 w-0.5 bg-surface-subtle-elevated -z-10" />

                             {/* Dest */}
                             <div className="flex items-center gap-3 p-3 rounded-lg border border-edge bg-surface-muted/30 mt-2">
                                 <div className="w-10 h-10 rounded-full bg-status-success-bg flex items-center justify-center text-status-success font-bold">
                                     {getInitial(destName)}
                                 </div>
                                 <div>
                                     <div className="font-medium text-content-primary">
                                         {destName || <span className="text-content-muted italic">Non renseigné</span>}
                                     </div>
                                     <div className="text-xs text-content-muted font-mono">
                                         {transfer.destNumero || '-'}
                                     </div>
                                 </div>
                             </div>
                        </div>
                    </section>

                    {/* Execution History */}
                    <section>
                        <h3 className="text-sm font-bold text-content-primary mb-4 flex items-center gap-2">
                            <Clock size={16} /> Historique d'exécution
                        </h3>
                        {loadingHistory ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-content-muted" />
                            </div>
                        ) : history.length === 0 ? (
                            <p className="text-sm text-content-muted text-center py-4">Aucune exécution enregistrée</p>
                        ) : (
                            <div className="space-y-4 border-l-2 border-edge-subtle pl-4 ml-2">
                                {history.map((event) => (
                                    <div key={event.id} className="relative">
                                        <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${
                                            event.status === 'SUCCESS' ? 'bg-status-success ring-4 ring-status-success/20' :
                                            event.status === 'FAILED' ? 'bg-status-danger ring-4 ring-status-danger/20' : 'bg-content-muted'
                                        }`} />
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-sm font-medium text-content-primary">
                                                    {event.status === 'SUCCESS' ? 'Exécution réussie' : event.errorMessage || 'Échec'}
                                                </p>
                                                <p className="text-xs text-content-muted">
                                                    {event.status === 'SUCCESS' ? 'Succès' : 'Échec'}
                                                </p>
                                            </div>
                                            <span className="text-xs text-content-muted whitespace-nowrap">
                                                {formatDate(event.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                    
                    {/* JSON Technical - Admin only */}
                    {isAdmin && (
                        <section>
                            <h3 className="text-sm font-bold text-content-primary mb-4 flex items-center gap-2">
                                <Code size={16} /> Configuration Technique
                            </h3>
                            <div className="bg-surface-base rounded-lg p-4 overflow-x-auto">
                                <pre className="text-xs font-mono text-status-success">
                                    {JSON.stringify({
                                        id: transfer.id,
                                        frequence: transfer.frequence,
                                        timezone: transfer.timezone,
                                        jour_execution: transfer.jourExecution,
                                        prochaine_execution: transfer.prochaineExecution,
                                        derniere_execution: transfer.dernierExecution,
                                        statut_dernier: transfer.statutDernier,
                                        retry_count: transfer.retryCount,
                                        max_retries: transfer.maxRetries,
                                        libelle: transfer.libelle,
                                        created_at: transfer.createdAt,
                                        created_by: transfer.createdBy,
                                    }, null, 2)}
                                </pre>
                            </div>
                        </section>
                    )}

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-edge bg-surface">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 mr-auto">
                             <Switch 
                                checked={Boolean(transfer.actif)} 
                                onChange={(checked) => onToggleActive && onToggleActive(transfer, checked)}
                            />
                            <span className="text-sm font-medium text-content-secondary">
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
                            className="bg-status-success hover:bg-status-success text-white"
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
                <div className="relative w-full max-w-md h-full bg-surface shadow-2xl animate-in slide-in-from-right flex flex-col">
                    <Content />
                </div>
             </div>
        );
    }

    return (
        <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
                <Drawer.Content className="bg-surface flex flex-col rounded-t-[20px] h-[90vh] fixed bottom-0 left-0 right-0 z-50 outline-none">
                     <div className="p-4 bg-surface rounded-t-[20px] flex justify-center shrink-0">
                         <div className="w-12 h-1.5 bg-surface-subtle-elevated rounded-full" />
                    </div>
                    <div className="flex-1 overflow-hidden flex flex-col bg-surface">
                        <Content />
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
