import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Wallet, Clock, User, CreditCard, Filter, UserCircle } from 'lucide-react';
import { Card, ResponsiveTable } from '@/components/ui';
import { CaisseTransaction, SessionCaisse } from '@/types/finance';

interface CashJournalProps {
  sessions: SessionCaisse[];
  transactions: CaisseTransaction[];
  loading?: boolean;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

interface JournalEntry {
  id: string;
  date: Date;
  type: 'OUVERTURE' | 'OPERATION' | 'FERMETURE';
  operationType?: string;
  description: string;
  reference?: string;
  client?: string | null; // null = no client expected, undefined = client unknown
  caissier?: string; // For internal operations
  montant: number;
  sens: 'ENTREE' | 'SORTIE' | 'NEUTRE';
  soldeProgressif: number;
  sessionId: string;
  modePaiement?: string;
}

type FilterType = 'all' | 'entrees' | 'sorties';

export function CashJournal({
  sessions,
  transactions,
  loading = false,
  currentPage,
  itemsPerPage,
  onPageChange,
}: CashJournalProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  // Construire le journal avec solde progressif
  const journalEntries = useMemo(() => {
    const entries: JournalEntry[] = [];
    let soldeProgressif = 0;

    // Trier les sessions par date d'ouverture ASC pour le calcul du solde progressif
    const sortedSessions = [...sessions].sort((a, b) => {
      const dateA = new Date(a.openedAt || '');
      const dateB = new Date(b.openedAt || '');
      return dateA.getTime() - dateB.getTime();
    });

    for (const session of sortedSessions) {
      const sessionOpenDate = new Date(session.openedAt || '');
      const soldeInitial = Number(session.soldeInitial || session.montantOuverture || 0);
      const caissierName = session.caissierNom || 'Caissier';

      // Entrée d'ouverture de session
      soldeProgressif = soldeInitial;
      entries.push({
        id: `open-${session.id}`,
        date: sessionOpenDate,
        type: 'OUVERTURE',
        description: 'Ouverture de session',
        montant: soldeInitial,
        sens: 'NEUTRE',
        soldeProgressif,
        sessionId: session.id,
        caissier: caissierName,
        client: null, // No client for internal operations
      });

      // Récupérer les transactions de cette session, triées par date ASC pour le calcul
      const sessionTransactions = transactions
        .filter((t) => t.sessionId === session.id)
        .sort((a, b) => {
          const dateA = new Date(a.createdAt || '');
          const dateB = new Date(b.createdAt || '');
          return dateA.getTime() - dateB.getTime();
        });

      // Ajouter chaque transaction
      for (const tx of sessionTransactions) {
        const montant = Number(tx.montant);
        const typeOp = tx.typeOperation || '';
        const isEntree = isEntreeOperation(typeOp);

        if (isEntree) {
          soldeProgressif += montant;
        } else {
          soldeProgressif -= montant;
        }

        // Récupérer le nom du client - seulement si disponible
        const hasClient = tx.clientNom || tx.clientPrenom;
        const clientName = hasClient
          ? `${tx.clientPrenom || ''} ${tx.clientNom || ''}`.trim()
          : undefined; // undefined = client not found/unknown

        entries.push({
          id: tx.id,
          date: new Date(tx.createdAt || ''),
          type: 'OPERATION',
          operationType: typeOp,
          description: tx.description || getOperationLabel(typeOp),
          reference: tx.reference,
          client: clientName,
          montant,
          sens: isEntree ? 'ENTREE' : 'SORTIE',
          soldeProgressif,
          sessionId: session.id,
          modePaiement: tx.modePaiement,
        });
      }

      // Entrée de fermeture si la session est fermée
      const sessionStatus = session.computedStatus || session.statut;
      if (sessionStatus === 'CLOSED' && session.closedAt) {
        const soldeFinal = Number(session.soldeReel || soldeProgressif);
        entries.push({
          id: `close-${session.id}`,
          date: new Date(session.closedAt || ''),
          type: 'FERMETURE',
          description: 'Fermeture de session',
          montant: soldeFinal,
          sens: 'NEUTRE',
          soldeProgressif: soldeFinal,
          sessionId: session.id,
          caissier: caissierName,
          client: null, // No client for internal operations
        });
      }
    }

    // Trier DESC (plus récent en premier) pour l'affichage
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sessions, transactions]);

  // Filtrage
  const filteredEntries = useMemo(() => {
    if (filter === 'all') return journalEntries;
    if (filter === 'entrees') return journalEntries.filter((e) => e.sens === 'ENTREE' || e.type !== 'OPERATION');
    if (filter === 'sorties') return journalEntries.filter((e) => e.sens === 'SORTIE' || e.type !== 'OPERATION');
    return journalEntries;
  }, [journalEntries, filter]);

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Totaux
  const totaux = useMemo(() => {
    const ops = journalEntries.filter((e) => e.type === 'OPERATION');
    return {
      entrees: ops.filter((e) => e.sens === 'ENTREE').reduce((sum, e) => sum + e.montant, 0),
      sorties: ops.filter((e) => e.sens === 'SORTIE').reduce((sum, e) => sum + e.montant, 0),
      nbOperations: ops.length,
    };
  }, [journalEntries]);

  // Définition des colonnes ResponsiveTable
  const columns = useMemo(() => [
        {
          key: 'date',
          label: 'Date & Heure',
          primary: true,
          format: (_: any, entry: JournalEntry) => (
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-content-muted" />
              <div>
                <p className="text-content-secondary font-medium text-xs">
                  {entry.date.toLocaleDateString('fr-FR')}
                </p>
                <p className="text-content-muted text-[10px] leading-none">
                  {entry.date.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ),
          mobileFormat: (_: any, entry: JournalEntry) => (
             <div className="flex items-center gap-1.5 text-xs text-content-muted">
                <Clock size={12} />
                <span>{entry.date.toLocaleDateString('fr-FR')} {entry.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
             </div>
          )
        },
        {
          key: 'operation',
          label: 'Opération',
          format: (_: any, entry: JournalEntry) => (
             <div>
                <div className="flex items-center gap-1.5 mb-1">
                   {entry.type === 'OUVERTURE' && (
                    <span className="px-1.5 py-0.5 bg-status-info-bg text-status-info text-[10px] font-bold rounded border border-status-info/20">
                      OUVERTURE
                    </span>
                   )}
                   {entry.type === 'FERMETURE' && (
                    <span className="px-1.5 py-0.5 bg-status-info-bg text-status-info text-[10px] font-bold rounded border border-status-info/20">
                      FERMETURE
                    </span>
                   )}
                   {entry.type === 'OPERATION' && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${
                        entry.sens === 'ENTREE'
                          ? 'bg-status-success-bg text-status-success border-status-success/20'
                          : 'bg-status-danger/10 text-status-danger border-status-danger/20'
                      }`}
                    >
                      {entry.sens === 'ENTREE' ? '↓' : '↑'} {getOperationLabel(entry.operationType)}
                    </span>
                   )}
                </div>
                {entry.description && entry.type === 'OPERATION' && (
                  <p className="text-content-muted text-[10px] truncate max-w-[180px]">
                    {entry.description}
                  </p>
                )}
             </div>
          ),
          mobileClassName: 'font-medium text-content-primary mb-1'
        },
        {
          key: 'tier',
          label: 'Client / Caissier',
          format: (_: any, entry: JournalEntry) => renderClientOrCaissier(entry),
          mobileFormat: (_: any, entry: JournalEntry) => renderClientOrCaissier(entry)
        },
        {
          key: 'reference',
          label: 'Référence',
          format: (val: string) => val ? <span className="text-content-muted text-xs font-mono">{val}</span> : <span className="text-content-muted text-xs">—</span>,
          hideOnMobile: true
        },
        {
          key: 'entree',
          label: 'Entrée',
          align: 'right' as const,
          format: (_: any, entry: JournalEntry) => (
             entry.sens === 'ENTREE' ? (
                <span className="text-status-success font-bold font-mono">+{entry.montant.toLocaleString('fr-FR')}</span>
             ) : entry.type === 'OUVERTURE' ? (
                <span className="text-status-info font-medium font-mono">+{entry.montant.toLocaleString('fr-FR')}</span>
             ) : <span className="text-content-muted">—</span>
          ),
          hideOnMobile: true
        },
        {
          key: 'sortie',
          label: 'Sortie',
          align: 'right' as const,
          format: (_: any, entry: JournalEntry) => (
             entry.sens === 'SORTIE' ? (
                <span className="text-status-danger font-bold font-mono">-{entry.montant.toLocaleString('fr-FR')}</span>
             ) : <span className="text-content-muted">—</span>
          ),
          hideOnMobile: true
        },
        {
            key: 'solde',
            label: 'Solde',
            align: 'right' as const,
            format: (val: number, entry: JournalEntry) => (
                <span className="text-content-primary font-bold font-mono bg-surface/50 px-2 py-1 rounded text-xs">
                    {entry.soldeProgressif.toLocaleString('fr-FR')}
                </span>
            ),
            mobileFormat: (val: number, entry: JournalEntry) => (
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-edge/50">
                    <div className="text-lg font-bold">
                        {entry.sens === 'ENTREE' && <span className="text-status-success">+{entry.montant.toLocaleString('fr-FR')}</span>}
                        {entry.sens === 'SORTIE' && <span className="text-status-danger">-{entry.montant.toLocaleString('fr-FR')}</span>}
                        {entry.sens === 'NEUTRE' && <span className="text-status-info">{entry.montant.toLocaleString('fr-FR')}</span>}
                    </div>
                    <div>
                         <span className="text-[10px] text-content-muted mr-2">Solde</span>
                         <span className="text-content-primary font-mono font-bold">{entry.soldeProgressif.toLocaleString('fr-FR')}</span>
                    </div>
                </div>
            )
        }
  ], []);

  if (loading && journalEntries.length === 0) {
    return (
      <Card className="bg-surface-base/80 border-edge p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
          <span className="text-content-muted">Chargement du journal...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-2">
      {/* Résumé rapide - Compact inline stats */}
      <div className="grid grid-cols-3 gap-2 shrink-0">
        <div className="bg-status-success/5 border border-status-success/20 rounded-lg p-2 flex items-center gap-2">
          <ArrowDownLeft size={14} className="text-status-success shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-status-success/70 font-medium">Entrées</p>
            <p className="text-sm font-bold text-status-success truncate">+{totaux.entrees.toLocaleString('fr-FR')}</p>
          </div>
        </div>
        <div className="bg-status-danger/5 border border-status-danger/20 rounded-lg p-2 flex items-center gap-2">
          <ArrowUpRight size={14} className="text-status-danger shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-status-danger/70 font-medium">Sorties</p>
            <p className="text-sm font-bold text-status-danger truncate">-{totaux.sorties.toLocaleString('fr-FR')}</p>
          </div>
        </div>
        <div className="bg-status-info/5 border border-status-info/20 rounded-lg p-2 flex items-center gap-2">
          <CreditCard size={14} className="text-status-info shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-status-info/70 font-medium">Opérations</p>
            <p className="text-sm font-bold text-status-info">{totaux.nbOperations}</p>
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-none">
        <Filter size={16} className="text-content-muted shrink-0" />
        <button
          onClick={() => { setFilter('all'); onPageChange(1); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            filter === 'all'
              ? 'bg-accent/10 text-accent ring-1 ring-accent/30'
              : 'bg-surface/50 text-content-muted hover:bg-surface-elevated/50'
          }`}
        >
          Toutes ({journalEntries.filter((e) => e.type === 'OPERATION').length})
        </button>
        <button
          onClick={() => { setFilter('entrees'); onPageChange(1); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            filter === 'entrees'
              ? 'bg-status-success-bg text-status-success ring-1 ring-status-success/30'
              : 'bg-surface/50 text-content-muted hover:bg-surface-elevated/50'
          }`}
        >
          Entrées ({journalEntries.filter((e) => e.sens === 'ENTREE').length})
        </button>
        <button
          onClick={() => { setFilter('sorties'); onPageChange(1); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            filter === 'sorties'
              ? 'bg-status-danger-bg text-status-danger ring-1 ring-status-danger/30'
              : 'bg-surface/50 text-content-muted hover:bg-surface-elevated/50'
          }`}
        >
          Sorties ({journalEntries.filter((e) => e.sens === 'SORTIE').length})
        </button>
      </div>

      {/* Journal - Responsive Table */}
      <div className="flex-1 min-h-0 border border-edge rounded-xl bg-surface-base/50 overflow-hidden flex flex-col">
         <ResponsiveTable
            data={paginatedEntries}
            columns={columns}
            loading={loading && journalEntries.length === 0}
            emptyMessage="Aucune opération trouvée"
            density="compact"
            className="flex-1 overflow-auto"
            headerClassName="sticky top-0 z-10 bg-surface-base border-b border-edge"
            pagination={{
                page: currentPage,
                totalPages: totalPages,
                onPageChange: onPageChange
            }}
         />
      </div>
    </div>
  );
}

// Helper to render client or caissier based on entry type
function renderClientOrCaissier(entry: JournalEntry) {
  // Internal operations: show caissier
  if (entry.type === 'OUVERTURE' || entry.type === 'FERMETURE') {
    return (
      <div className="flex items-center gap-2">
        <UserCircle size={12} className="text-status-info" />
        <span className="text-status-info text-xs font-medium">{entry.caissier || 'Caissier'}</span>
      </div>
    );
  }

  // Client operations: show client if available
  if (entry.client) {
    return (
      <div className="flex items-center gap-2">
        <User size={12} className="text-content-muted" />
        <span className="text-content-secondary text-xs">{entry.client}</span>
      </div>
    );
  }

  // No client info available
  return <span className="text-content-muted text-xs">—</span>;
}

// Helper functions (unchanged)
function isEntreeOperation(type: string): boolean {
  const entreeTypes = [
    'DEPOSIT',
    'ENCAISSEMENT',
    'LOAN_REPAYMENT',
    'REMBOURSEMENT_PRET',
    'CREDIT_REPAYMENT',
    'TONTINE_COTISATION',
    'TONTINE_CONTRIBUTION',
    'COTISATION_TONTINE',
    'CONTRIBUTION_TONTINE',
    'SAVINGS_DEPOSIT',
    'DEPOT_EPARGNE',
    'APPROVISIONNEMENT',
    'TRANSFER_IN',
    'BLOCKED_DEPOSIT',
    'VERSEMENT_COMPTE_BLOQUE',
    'ENGAGEMENT_FEE', // Frais de dossier crédit
    'MISC_COLLECTION', // Encaissement divers
  ];
  return entreeTypes.some((t) => type.toUpperCase().includes(t));
}

function getOperationLabel(type?: string): string {
  if (!type) return 'Opération';

  const labels: Record<string, string> = {
    DEPOSIT: 'Dépôt',
    WITHDRAWAL: 'Retrait',
    ENCAISSEMENT: 'Encaissement',
    DECAISSEMENT: 'Décaissement',
    LOAN_REPAYMENT: 'Remb. Prêt',
    CREDIT_REPAYMENT: 'Remb. Crédit',
    CREDIT_DISBURSEMENT: 'Décais. Crédit',
    ENGAGEMENT_FEE: 'Frais Dossier',
    TONTINE_COTISATION: 'Cotis. Tontine',
    TONTINE_CONTRIBUTION: 'Cotis. Tontine',
    TONTINE_DISTRIBUTION: 'Distrib. Tontine',
    SAVINGS_DEPOSIT: 'Dépôt Épargne',
    SAVINGS_WITHDRAWAL: 'Retrait Épargne',
    BLOCKED_DEPOSIT: 'Vers. Compte Bloqué',
    BLOCKED_WITHDRAWAL: 'Retr. Compte Bloqué',
    VERSEMENT_COMPTE_BLOQUE: 'Vers. Compte Bloqué',
    RETRAIT_COMPTE_BLOQUE: 'Retr. Compte Bloqué',
    APPROVISIONNEMENT: 'Approv. Coffre',
    VERSEMENT: 'Vers. Coffre',
    TRANSFER_IN: 'Transfert Entrant',
    TRANSFER_OUT: 'Transfert Sortant',
    MISC_COLLECTION: 'Encaissement Divers',
    MISC_DISBURSEMENT: 'Décaissement Divers',
  };

  // Recherche partielle
  for (const [key, label] of Object.entries(labels)) {
    if (type.toUpperCase().includes(key)) {
      return label;
    }
  }

  return type.replace(/_/g, ' ');
}
