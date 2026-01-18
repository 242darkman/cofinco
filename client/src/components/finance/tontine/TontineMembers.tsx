import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, UserPlus, Trash2, CheckCircle, X, Gift, User, Search, TrendingUp, AlertCircle, Clock, Settings, Wallet, Check, CheckCheck, AlertTriangle } from 'lucide-react';
import { Card, Button, IconButton } from '../../ui';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { Pagination } from '../../ui/Pagination';
import { SkeletonMemberCard } from '../../ui/Skeleton';
import { tontineMembreApi, tontineApi, clientApi, compteEpargneApi } from '../../../lib/api-client';
import { formatMoney } from '../../../lib/format';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { usePagination } from '../../../hooks/usePagination';
import { useConfirmDialog } from '../../../hooks/useConfirmDialog';
import { formatClientName } from '../../../lib/format';

interface Client {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  phone?: string;
  photoUrl?: string;
  status?: string;
}

interface TontineMembre {
  id: string;
  tontine_id: string;
  client_id: string;
  position_ordre: number;
  position?: number;
  status: 'Actif' | 'Inactif' | 'Exclu';
  statut?: 'Actif' | 'Inactif' | 'Exclu';
  montant_total_contribue: number;
  totalCotisations?: string;
  a_recu_benefice: boolean;
  aRecuBenefice?: boolean;
  date_benefice: string | null;
  dateBenefice?: string | null;
  date_adhesion: string;
  dateAdhesion?: string;
  client: Client;
  // Nouvelles stats calculées par le backend
  toursPayes?: number;
  toursRestants?: number;
  montantRestant?: number;
  estAJour?: boolean;
  nombreContributions?: number;
  tourActuel?: number;
  montantCotisation?: number;
  cotisationAutomatique?: boolean;
  cotisationCompteId?: string;
}

interface TontineMembersProps {
  tontineId: string;
  maxMembres: number;
  onUpdate: () => void;
}

const ITEMS_PER_PAGE = 10;

// Composant Status Badge Mobile-First
const MemberStatusBadge = ({ membre, tourActuel }: { membre: TontineMembre; tourActuel: number }) => {
  const toursPayes = membre.toursPayes || 0;

  if (toursPayes > tourActuel) {
    // En avance
    const avance = toursPayes - tourActuel;
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold whitespace-nowrap">
        <CheckCheck size={12} /> +{avance} tour{avance > 1 ? 's' : ''}
      </span>
    );
  } else if (toursPayes >= tourActuel) {
    // À jour
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-bold whitespace-nowrap">
        <Check size={12} /> À jour
      </span>
    );
  } else {
    // En retard
    const retard = tourActuel - toursPayes;
    const dette = retard * (membre.montantCotisation || 0);
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold whitespace-nowrap">
        <AlertTriangle size={12} /> -{retard} ({dette.toLocaleString('fr-FR')} F)
      </span>
    );
  }
};

export default function TontineMembers({ tontineId, maxMembres, onUpdate }: TontineMembersProps) {
  const [membres, setMembres] = useState<TontineMembre[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [configMember, setConfigMember] = useState<TontineMembre | null>(null);
  const [memberAccounts, setMemberAccounts] = useState<any[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [updatingConfig, setUpdatingConfig] = useState(false);

  // Confirmation dialog hook
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  // Pagination hook
  const pagination = usePagination({
    totalItems: membres.length,
    itemsPerPage: ITEMS_PER_PAGE,
  });

  // Fetch data on mount
  useEffect(() => {
    if (tontineId) {
      fetchMembres();
      fetchClients();
    }
  }, [tontineId]);

  // Reset pagination when membres change
  useEffect(() => {
    pagination.reset();
  }, [membres.length]);

  const fetchMembres = useCallback(async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      const data = await tontineMembreApi.getByTontine(tontineId);
      setMembres(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des membres'));
      setMembres([]);
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  const fetchClients = useCallback(async () => {
    try {
      const data = await clientApi.getAllList();
      setClients(data?.filter((c: Client) => c.status === 'Actif') || []);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
    }
  }, []);

  const handleAddMembre = useCallback(async () => {
    if (!selectedClientId) {
      toast.warning('Veuillez sélectionner un client');
      return;
    }

    setSubmitting(true);
    try {
      const nextOrdre = membres.length + 1;

      await tontineMembreApi.add(tontineId, {
        client_id: selectedClientId,
        position_ordre: nextOrdre,
      });

      // Update tontine member count
      await tontineApi.update(tontineId, { nombre_membres: nextOrdre });

      // Récupérer le nom du client pour le feedback
      const addedClient = clients.find(c => c.id === selectedClientId);
      const clientNom = addedClient?.nom || 'Nouveau membre';

      setShowAddForm(false);
      setSelectedClientId('');
      setSearchQuery('');
      fetchMembres();
      onUpdate();

      toast.success(`${clientNom} a été ajouté à la tontine (Position #${nextOrdre})`);
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'ajout du membre"));
    } finally {
      setSubmitting(false);
    }
  }, [selectedClientId, membres.length, tontineId, fetchMembres, onUpdate]);

  const handleRemoveMembre = useCallback(
    (membre: TontineMembre) => {
      const memberName = membre.client?.nom || 'ce membre';

      openConfirm({
        title: 'Retirer le membre',
        message: `Êtes-vous sûr de vouloir retirer ${escapeHtml(memberName)} de la tontine ? Cette action est irréversible.`,
        variant: 'danger',
        confirmText: 'Retirer',
        onConfirm: async () => {
          try {
            await tontineMembreApi.remove(tontineId, membre.id);
            await tontineApi.update(tontineId, { nombre_membres: membres.length - 1 });

            fetchMembres();
            onUpdate();
            toast.success('Membre retiré avec succès');
          } catch (error) {
            toast.error(handleApiError(error, 'Erreur lors de la suppression'));
          }
        },
      });
    },
    [tontineId, membres.length, fetchMembres, onUpdate, openConfirm]
  );

  // Memoized filtered clients (excludes already added members)
  const filteredClients = useMemo(() => {
    const query = sanitizeInput(searchQuery).toLowerCase();
    return clients.filter((client) => {
      const alreadyMember = membres.some((m) => m.client_id === client.id);
      if (alreadyMember) return false;

      if (!query) return true;

      const name = (client.nom || '').toLowerCase();
      const email = (client.email || '').toLowerCase();
      const phone = (client.telephone || client.phone || '').toLowerCase();

      return name.includes(query) || email.includes(query) || phone.includes(query);
    });
  }, [clients, membres, searchQuery]);

  // Memoized paginated membres
  const paginatedMembres = useMemo(
    () => pagination.paginateArray(membres),
    [membres, pagination.currentPage, pagination.itemsPerPage]
  );

  const getStatutColor = useCallback((statut: string) => {
    switch (statut) {
      case 'Actif':
        return 'text-green-400 bg-green-500/20';
      case 'Inactif':
        return 'text-cyan-400 bg-cyan-500/20';
      case 'Exclu':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowAddForm(false);
    setSelectedClientId('');
    setSearchQuery('');
  }, []);

  const handleOpenConfig = async (membre: TontineMembre) => {
     setConfigMember(membre);
     setLoadingAccounts(true);
     try {
         const accounts = await compteEpargneApi.getByClient(membre.client_id);
         setMemberAccounts(accounts || []);
     } catch(e) {
         console.error("Error loading accounts", e);
         toast.error("Impossible de charger les comptes du membre");
     } finally {
         setLoadingAccounts(false);
     }
  };

  const handleUpdateConfig = async (enabled: boolean, accountId?: string) => {
      if (!configMember) return;
      setUpdatingConfig(true);
      try {
          await tontineMembreApi.update(tontineId, configMember.id, {
              cotisationAutomatique: enabled,
              cotisationCompteId: enabled ? accountId : null
          });
          
          toast.success("Configuration mise à jour");
          
          // Local update
          setMembres(prev => prev.map(m => m.id === configMember.id ? { ...m, cotisationAutomatique: enabled, cotisationCompteId: enabled ? accountId : undefined } : m));
          setConfigMember(prev => prev ? { ...prev, cotisationAutomatique: enabled, cotisationCompteId: enabled ? accountId : undefined } : null);
          
      } catch (e) {
          toast.error(handleApiError(e, "Erreur mise à jour"));
      } finally {
          setUpdatingConfig(false);
      }
  };

  const isFull = membres.length >= maxMembres;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-white" id="membres-heading">
            Membres de la tontine
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${isFull ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                {membres.length} / {maxMembres}
            </span>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          variant="success"
          size="sm"
          icon={UserPlus}
          disabled={isFull}
          title={isFull ? "La tontine est complète" : "Ajouter un membre"}
          className={isFull ? "opacity-50 cursor-not-allowed" : ""}
          aria-describedby="membres-heading"
        >
          {isFull ? 'Complet' : 'Ajouter'}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Chargement des membres">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonMemberCard key={i} />
          ))}
        </div>
      ) : membres.length === 0 ? (
        <div
          className="text-center py-12 border border-dashed border-slate-700 rounded-lg"
          role="status"
        >
          <User className="mx-auto text-slate-500 mb-3" size={48} aria-hidden="true" />
          <p className="text-slate-400 font-medium">Aucun membre pour le moment</p>
          <p className="text-slate-500 text-sm mt-1">Commencez par ajouter des participants</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3" role="list" aria-label="Liste des membres">
            {paginatedMembres.map((membre) => (
              <Card
                key={membre.id}
                className="bg-slate-800/40 border-slate-700/50 p-3 hover:border-slate-600 transition-colors group"
                role="listitem"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar / Position */}
                  <div className="shrink-0 relative">
                    <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300 font-bold border border-slate-600">
                      {membre.client?.photoUrl ? (
                        <img
                          src={membre.client.photoUrl}
                          alt=""
                          className="w-full h-full object-cover rounded-lg"
                          loading="lazy"
                        />
                      ) : (
                        <span aria-label={`Position ${membre.position_ordre}`}>
                          #{membre.position_ordre}
                        </span>
                      )}
                    </div>
                    {membre.a_recu_benefice && (
                      <div
                        className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white p-0.5 rounded-full border border-slate-800"
                        title="A reçu le bénéfice"
                        aria-label="A reçu le bénéfice"
                      >
                        <Gift size={10} aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-sm truncate leading-tight">
                          {escapeHtml(membre.client?.nom) || 'Inconnu'}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] mt-0.5">
                          <span
                            className={`px-1.5 py-0.5 rounded font-medium ${getStatutColor(membre.status || membre.statut || 'Actif')} bg-opacity-10`}
                          >
                            {membre.status || membre.statut}
                          </span>
                          <span className="text-slate-500">
                            {new Date(membre.date_adhesion || membre.dateAdhesion || '').toLocaleDateString('fr-FR')}
                          </span>
                          {/* Status Badge Mobile-First */}
                          <MemberStatusBadge membre={membre} tourActuel={membre.tourActuel || 1} />
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveMembre(membre)}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
                        aria-label={`Retirer ${escapeHtml(membre.client?.nom || 'ce membre')}`}
                        type="button"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                        <button 
                            onClick={() => handleOpenConfig(membre)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                                membre.cotisationAutomatique 
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20' 
                                : 'bg-slate-700/30 text-slate-500 border-slate-700 hover:bg-slate-700/50 hover:text-slate-300'
                            }`}
                        >
                            <Settings size={10} />
                            {membre.cotisationAutomatique ? 'Auto ON' : 'Auto OFF'}
                        </button>
                    </div>

                    {/* Stats de cotisations */}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs border-t border-slate-700/50 pt-2">
                      <div className="flex flex-col">
                        <span className="text-slate-500">Total cotisé</span>
                        <span className="font-bold text-green-400">
                          {Number(membre.totalCotisations || membre.montant_total_contribue || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-slate-500">Restant</span>
                        <span className={`font-bold ${(membre.montantRestant || 0) > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                          {(membre.montantRestant || 0).toLocaleString('fr-FR')} FCFA
                        </span>
                      </div>
                    </div>

                    {/* Progression des tours */}
                    {membre.toursPayes !== undefined && (
                      <div className="mt-2 flex items-center gap-2 text-[10px]">
                        <Clock size={12} className="text-slate-500" />
                        <span className="text-slate-400">
                          Tours payés: <span className="text-cyan-400 font-bold">{membre.toursPayes}</span>
                          {' / '}
                          <span className="text-slate-500">{maxMembres}</span>
                        </span>
                        <span className="text-slate-600">|</span>
                        <span className="text-slate-400">
                          Restants: <span className={`font-bold ${(membre.toursRestants || 0) > 0 ? 'text-amber-400' : 'text-green-400'}`}>{membre.toursRestants || 0}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {membres.length > ITEMS_PER_PAGE && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={pagination.goToPage}
              canGoNext={pagination.canGoNext}
              canGoPrevious={pagination.canGoPrevious}
              itemsPerPage={pagination.itemsPerPage}
              totalItems={membres.length}
            />
          )}
        </>
      )}

      {/* Add Member Modal */}
      {showAddForm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-member-title"
          onClick={(e) => e.target === e.currentTarget && handleCloseModal()}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
              <div>
                <h2 id="add-member-title" className="text-lg font-bold text-white">
                  Nouveau Membre
                </h2>
                <div className="text-xs text-emerald-400 font-mono mt-0.5">
                  Position #{membres.length + 1}
                </div>
              </div>
              <IconButton
                icon={X}
                onClick={handleCloseModal}
                size="sm"
                aria-label="Fermer"
              />
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <label
                htmlFor="search-client"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2"
              >
                Rechercher un client
              </label>
              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  size={16}
                  aria-hidden="true"
                />
                <input
                  id="search-client"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 text-white pl-10 pr-4 py-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
                  placeholder="Nom, téléphone ou email..."
                  autoFocus
                  autoComplete="off"
                  aria-describedby="search-results-count"
                />
              </div>

              <div
                id="search-results-count"
                className="sr-only"
                aria-live="polite"
              >
                {filteredClients.length} clients trouvés
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto" role="listbox" aria-label="Sélectionner un client">
                {filteredClients.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Aucun client trouvé
                  </div>
                ) : (
                  filteredClients.slice(0, 50).map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      role="option"
                      aria-selected={selectedClientId === client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group ${
                        selectedClientId === client.id
                          ? 'border-emerald-500 bg-emerald-500/10'
                          : 'border-slate-800 hover:border-slate-600 bg-slate-800/30'
                      }`}
                    >
                      <div>
                        <div
                          className={`font-semibold text-sm ${
                            selectedClientId === client.id ? 'text-emerald-400' : 'text-slate-200'
                          }`}
                        >
                          {formatClientName(client.nom, client.prenom)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {escapeHtml(client.telephone || client.phone || client.email || '')}
                        </div>
                      </div>
                      {selectedClientId === client.id && (
                        <CheckCircle size={16} className="text-emerald-500" aria-hidden="true" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50 shrink-0 flex gap-3">
              <Button variant="ghost" fullWidth onClick={handleCloseModal} disabled={submitting}>
                Annuler
              </Button>
              <Button
                variant="success"
                fullWidth
                onClick={handleAddMembre}
                disabled={!selectedClientId || submitting}
                isLoading={submitting}
                icon={CheckCircle}
              >
                Ajouter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />

      {/* Configuration Modal */}
      {configMember && (
         <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setConfigMember(null)}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200">
             <div className="flex justify-between items-start">
                 <div>
                    <h3 className="font-bold text-white text-lg">Configuration Membre</h3>
                    <p className="text-slate-400 text-xs">{formatClientName(configMember.client?.nom, configMember.client?.prenom)}</p>
                 </div>
                 <IconButton icon={X} onClick={() => setConfigMember(null)} size="sm" aria-label="Fermer" />
             </div>

             <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 space-y-4">
                 <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                         <Settings size={14} className="text-purple-400" />
                         Cotisation Auto
                     </span>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={!!configMember.cotisationAutomatique} 
                            onChange={(e) => handleUpdateConfig(e.target.checked, configMember.cotisationCompteId || memberAccounts.find(a => a.typeCompte === 'Courant')?.id)}
                            className="sr-only peer"
                            disabled={updatingConfig}
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                     </label>
                 </div>

                 {configMember.cotisationAutomatique && (
                     <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                         <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">Compte Source</span>
                         {loadingAccounts ? (
                             <div className="h-9 bg-slate-700/50 rounded animate-pulse" />
                         ) : (
                             <select 
                                value={configMember.cotisationCompteId || ''}
                                onChange={(e) => handleUpdateConfig(true, e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                                disabled={updatingConfig}
                             >
                                <option value="" disabled>Choisir un compte</option>
                                {memberAccounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                       {acc.typeCompte} - {formatMoney(acc.soldeCourant || 0)}
                                    </option>
                                ))}
                             </select>
                         )}
                         <div className="flex gap-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-md mt-2">
                             <Wallet size={12} className="text-blue-400 mt-0.5" />
                             <p className="text-[10px] text-blue-300 leading-tight">
                                La cotisation sera prélevée automatiquement à chaque début de tour si le solde est suffisant.
                             </p>
                         </div>
                     </div>
                 )}
             </div>

             <Button fullWidth onClick={() => setConfigMember(null)}>
                 Fermer
             </Button>
          </div>
        </div>
      )}
    </div>
  );
}
