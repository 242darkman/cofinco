import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Wallet, Clock, User, CreditCard, Filter, UserCircle } from 'lucide-react';
import { Card, Pagination } from '@/components/ui';
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
      const dateA = new Date(a.openedAt || a.opened_at || '');
      const dateB = new Date(b.openedAt || b.opened_at || '');
      return dateA.getTime() - dateB.getTime();
    });

    for (const session of sortedSessions) {
      const sessionOpenDate = new Date(session.openedAt || session.opened_at || '');
      const soldeInitial = Number(session.solde_initial || session.soldeInitial || session.montant_ouverture || session.montantOuverture || 0);
      const caissierName = session.caissier_nom || 'Caissier';

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
        .filter((t) => t.session_id === session.id || t.sessionId === session.id)
        .sort((a, b) => {
          const dateA = new Date(a.created_at || a.createdAt || '');
          const dateB = new Date(b.created_at || b.createdAt || '');
          return dateA.getTime() - dateB.getTime();
        });

      // Ajouter chaque transaction
      for (const tx of sessionTransactions) {
        const montant = Number(tx.montant);
        const typeOp = tx.type_operation || tx.typeOperation || '';
        const isEntree = isEntreeOperation(typeOp);

        if (isEntree) {
          soldeProgressif += montant;
        } else {
          soldeProgressif -= montant;
        }

        // Récupérer le nom du client - seulement si disponible
        const hasClient = tx.client_nom || tx.client_prenom;
        const clientName = hasClient
          ? `${tx.client_prenom || ''} ${tx.client_nom || ''}`.trim()
          : undefined; // undefined = client not found/unknown

        entries.push({
          id: tx.id,
          date: new Date(tx.created_at || tx.createdAt || ''),
          type: 'OPERATION',
          operationType: typeOp,
          description: tx.description || getOperationLabel(typeOp),
          reference: tx.reference,
          client: clientName,
          montant,
          sens: isEntree ? 'ENTREE' : 'SORTIE',
          soldeProgressif,
          sessionId: session.id,
          modePaiement: tx.mode_paiement || tx.modePaiement,
        });
      }

      // Entrée de fermeture si la session est fermée
      const sessionStatus = session.computedStatus || session.statut;
      if (sessionStatus === 'CLOSED' && (session.closedAt || session.closed_at)) {
        const soldeFinal = Number(session.solde_reel || session.soldeReel || soldeProgressif);
        entries.push({
          id: `close-${session.id}`,
          date: new Date(session.closedAt || session.closed_at || ''),
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

  if (loading) {
    return (
      <Card className="bg-slate-900/80 border-slate-800 p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full" />
          <span className="text-slate-400">Chargement du journal...</span>
        </div>
      </Card>
    );
  }

  if (journalEntries.length === 0) {
    return (
      <Card className="bg-slate-900/80 border-slate-800 p-12 text-center">
        <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
          <Wallet size={32} className="text-slate-600" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">Aucune opération</h3>
        <p className="text-slate-500 text-sm">Aucune opération trouvée pour cette période.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      {/* Résumé rapide - Cards responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg shrink-0">
              <ArrowDownLeft size={18} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-emerald-400/70 font-medium">Entrées</p>
              <p className="text-base sm:text-lg font-bold text-emerald-400 truncate">
                +{totaux.entrees.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border-rose-500/20 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 rounded-lg shrink-0">
              <ArrowUpRight size={18} className="text-rose-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-rose-400/70 font-medium">Sorties</p>
              <p className="text-base sm:text-lg font-bold text-rose-400 truncate">
                -{totaux.sorties.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
              <CreditCard size={18} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-blue-400/70 font-medium">Opérations</p>
              <p className="text-base sm:text-lg font-bold text-blue-400">{totaux.nbOperations}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Pills - Horizontal scroll on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-none">
        <Filter size={16} className="text-slate-500 shrink-0" />
        <button
          onClick={() => { setFilter('all'); onPageChange(1); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            filter === 'all'
              ? 'bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
          }`}
        >
          Toutes ({journalEntries.filter((e) => e.type === 'OPERATION').length})
        </button>
        <button
          onClick={() => { setFilter('entrees'); onPageChange(1); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            filter === 'entrees'
              ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
          }`}
        >
          Entrées ({journalEntries.filter((e) => e.sens === 'ENTREE').length})
        </button>
        <button
          onClick={() => { setFilter('sorties'); onPageChange(1); }}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
            filter === 'sorties'
              ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
          }`}
        >
          Sorties ({journalEntries.filter((e) => e.sens === 'SORTIE').length})
        </button>
      </div>

      {/* Journal - Cards on mobile, Table on desktop */}
      <Card className="bg-slate-900/80 border-slate-800 flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Mobile: Cards View */}
        <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-2">
          {paginatedEntries.map((entry) => (
            <JournalCard key={entry.id} entry={entry} />
          ))}
        </div>

        {/* Desktop: Table View */}
        <div className="hidden md:flex flex-1 flex-col min-h-0">
          <div className="overflow-x-auto flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-950/50 text-slate-400 uppercase text-[10px] font-bold tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left">Date & Heure</th>
                  <th className="px-4 py-3 text-left">Opération</th>
                  <th className="px-4 py-3 text-left">Client / Caissier</th>
                  <th className="px-4 py-3 text-left">Référence</th>
                  <th className="px-4 py-3 text-right">Entrée</th>
                  <th className="px-4 py-3 text-right">Sortie</th>
                  <th className="px-4 py-3 text-right">Solde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {paginatedEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`transition-colors ${
                      entry.type === 'OUVERTURE' || entry.type === 'FERMETURE'
                        ? 'bg-slate-800/30'
                        : 'hover:bg-slate-800/20'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Clock size={12} className="text-slate-500" />
                        <div>
                          <p className="text-slate-300 font-medium text-xs">
                            {entry.date.toLocaleDateString('fr-FR')}
                          </p>
                          <p className="text-slate-500 text-[10px]">
                            {entry.date.toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {entry.type === 'OUVERTURE' && (
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded">
                            OUVERTURE
                          </span>
                        )}
                        {entry.type === 'FERMETURE' && (
                          <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-bold rounded">
                            FERMETURE
                          </span>
                        )}
                        {entry.type === 'OPERATION' && (
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              entry.sens === 'ENTREE'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {entry.sens === 'ENTREE' ? '↓' : '↑'} {getOperationLabel(entry.operationType)}
                          </span>
                        )}
                      </div>
                      {entry.description && entry.type === 'OPERATION' && (
                        <p className="text-slate-500 text-[10px] mt-1 truncate max-w-[200px]">
                          {entry.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {renderClientOrCaissier(entry)}
                    </td>
                    <td className="px-4 py-3">
                      {entry.reference ? (
                        <span className="text-slate-400 text-xs font-mono">{entry.reference}</span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.sens === 'ENTREE' ? (
                        <span className="text-emerald-400 font-bold font-mono">
                          +{entry.montant.toLocaleString('fr-FR')}
                        </span>
                      ) : entry.type === 'OUVERTURE' ? (
                        <span className="text-blue-400 font-medium font-mono">
                          {entry.montant.toLocaleString('fr-FR')}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.sens === 'SORTIE' ? (
                        <span className="text-rose-400 font-bold font-mono">
                          -{entry.montant.toLocaleString('fr-FR')}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white font-bold font-mono bg-slate-800/50 px-2 py-1 rounded">
                        {entry.soldeProgressif.toLocaleString('fr-FR')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {filteredEntries.length > itemsPerPage && (
          <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/30 shrink-0">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
              itemsPerPage={itemsPerPage}
              totalItems={filteredEntries.length}
              canGoNext={currentPage < totalPages}
              canGoPrevious={currentPage > 1}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

// Helper to render client or caissier based on entry type
function renderClientOrCaissier(entry: JournalEntry) {
  // Internal operations: show caissier
  if (entry.type === 'OUVERTURE' || entry.type === 'FERMETURE') {
    return (
      <div className="flex items-center gap-2">
        <UserCircle size={12} className="text-blue-400" />
        <span className="text-blue-300 text-xs font-medium">{entry.caissier || 'Caissier'}</span>
      </div>
    );
  }

  // Client operations: show client if available
  if (entry.client) {
    return (
      <div className="flex items-center gap-2">
        <User size={12} className="text-slate-500" />
        <span className="text-slate-300 text-xs">{entry.client}</span>
      </div>
    );
  }

  // No client info available
  return <span className="text-slate-600 text-xs">—</span>;
}

// Mobile Card Component
function JournalCard({ entry }: { entry: JournalEntry }) {
  const isSession = entry.type === 'OUVERTURE' || entry.type === 'FERMETURE';

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        isSession
          ? 'bg-slate-800/40 border-slate-700/50'
          : entry.sens === 'ENTREE'
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-rose-500/5 border-rose-500/20'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {entry.type === 'OUVERTURE' && (
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded">
              OUVERTURE
            </span>
          )}
          {entry.type === 'FERMETURE' && (
            <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-bold rounded">
              FERMETURE
            </span>
          )}
          {entry.type === 'OPERATION' && (
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                entry.sens === 'ENTREE'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-rose-500/10 text-rose-400'
              }`}
            >
              {entry.sens === 'ENTREE' ? '↓' : '↑'} {getOperationLabel(entry.operationType)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-slate-500 text-[10px]">
          <Clock size={10} />
          {entry.date.toLocaleDateString('fr-FR')} {entry.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Person info (Client or Caissier) */}
      <div className="flex items-center gap-3 mb-2 text-xs">
        {isSession ? (
          // Internal operation: show caissier
          <div className="flex items-center gap-1 text-blue-400">
            <UserCircle size={12} />
            <span>{entry.caissier || 'Caissier'}</span>
          </div>
        ) : entry.client ? (
          // Client operation with client name
          <div className="flex items-center gap-1 text-slate-400">
            <User size={12} />
            <span>{entry.client}</span>
          </div>
        ) : (
          // Client operation without client name
          <div className="flex items-center gap-1 text-slate-500">
            <User size={12} />
            <span className="italic">Non renseigné</span>
          </div>
        )}
        {entry.reference && (
          <span className="text-slate-500 font-mono text-[10px]">{entry.reference}</span>
        )}
      </div>

      {/* Amount & Balance */}
      <div className="flex items-center justify-between">
        <div>
          {entry.sens === 'ENTREE' && (
            <span className="text-emerald-400 font-bold text-lg">
              +{entry.montant.toLocaleString('fr-FR')}
            </span>
          )}
          {entry.sens === 'SORTIE' && (
            <span className="text-rose-400 font-bold text-lg">
              -{entry.montant.toLocaleString('fr-FR')}
            </span>
          )}
          {entry.sens === 'NEUTRE' && (
            <span className="text-blue-400 font-medium text-lg">
              {entry.montant.toLocaleString('fr-FR')}
            </span>
          )}
          <span className="text-slate-500 text-xs ml-1">F CFA</span>
        </div>
        <div className="text-right">
          <p className="text-slate-500 text-[10px]">Solde</p>
          <p className="text-white font-bold font-mono">
            {entry.soldeProgressif.toLocaleString('fr-FR')}
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function isEntreeOperation(type: string): boolean {
  const entreeTypes = [
    'DEPOSIT',
    'ENCAISSEMENT',
    'LOAN_REPAYMENT',
    'REMBOURSEMENT_PRET',
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
    CREDIT_DISBURSEMENT: 'Décais. Crédit',
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
  };

  // Recherche partielle
  for (const [key, label] of Object.entries(labels)) {
    if (type.toUpperCase().includes(key)) {
      return label;
    }
  }

  return type.replace(/_/g, ' ');
}
