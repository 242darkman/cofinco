import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, UserPlus, Trash2, CheckCircle, X, Gift, User, Search, TrendingUp, AlertCircle, Clock, Settings, Wallet, Check, CheckCheck, AlertTriangle, Download, LogOut, UserMinus, RefreshCw, UserRoundPlus, CreditCard, Ban, RotateCcw } from 'lucide-react';
import { Card, Button, IconButton } from '../../ui';
import { TontineTimelineHorizontal } from './TontineTimeline';
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
import { exportToCSV, exportToPDF } from '../../../lib/exportUtils';
import {
  StatutClient,
  StatutMembreTontine,
  STATUT_MEMBRE_TONTINE_LABELS,
  TypeCompte
} from '@shared/enum/status-constants';
import { currencySymbol } from '@shared/config/currency';

interface Client {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  photoProfile?: string;
  status?: string;
}

type StatutMembreTontineValue = typeof StatutMembreTontine[keyof typeof StatutMembreTontine];

interface TontineMembre {
  id: string;
  tontineId: string;
  clientId: string;
  positionOrdre: number;
  position?: number;
  status: StatutMembreTontineValue | string;
  statut?: StatutMembreTontineValue | string;
  montantTotalContribue: number;
  totalCotisations?: string;
  aRecuBenefice: boolean;
  dateBenefice: string | null;
  dateAdhesion: string;
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
  groupRole?: string | null;
  exitRequestedAt?: string | null;
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
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-info-bg text-status-info text-[10px] font-bold whitespace-nowrap">
        <CheckCheck size={12} /> +{avance} tour{avance > 1 ? 's' : ''}
      </span>
    );
  } else if (toursPayes >= tourActuel) {
    // À jour
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-success-bg text-status-success text-[10px] font-bold whitespace-nowrap">
        <Check size={12} /> À jour
      </span>
    );
  } else {
    // En retard
    const retard = tourActuel - toursPayes;
    const dette = retard * (membre.montantCotisation || 0);
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-danger-bg text-status-danger text-[10px] font-bold whitespace-nowrap">
        <AlertTriangle size={12} /> -{retard} ({dette.toLocaleString('fr-FR')} F)
      </span>
    );
  }
};

export default function TontineMembers({ tontineId, maxMembres, onUpdate }: TontineMembersProps) {
  const sym = currencySymbol();
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

  // Tontine config for mid-cycle join & join fee
  const [tontineConfig, setTontineConfig] = useState<any>(null);
  const [payingJoinFee, setPayingJoinFee] = useState<string | null>(null);

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
      tontineApi.getById(tontineId).then(setTontineConfig).catch(() => {});
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
      setClients(data?.filter((c: Client) => c.status === StatutClient.ACTIVE) || []);
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

  // Mid-cycle join
  const handleMidCycleJoin = useCallback(async () => {
    if (!selectedClientId) {
      toast.warning('Veuillez selectionner un client');
      return;
    }
    setSubmitting(true);
    try {
      await tontineApi.midCycleJoin(tontineId, selectedClientId);
      const addedClient = clients.find(c => c.id === selectedClientId);
      toast.success(`${addedClient?.nom || 'Membre'} ajouté en cours de cycle`);
      setShowAddForm(false);
      setSelectedClientId('');
      setSearchQuery('');
      fetchMembres();
      onUpdate();
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors de l'adhesion en cours de cycle"));
    } finally {
      setSubmitting(false);
    }
  }, [selectedClientId, tontineId, clients, fetchMembres, onUpdate]);

  // Pay join fee
  const handlePayJoinFee = useCallback((membre: TontineMembre) => {
    const memberName = formatClientName(membre.client?.nom, membre.client?.prenom);
    openConfirm({
      title: "Payer les frais d'adhesion",
      message: `Confirmer le paiement des frais d'adhesion de ${Number(tontineConfig?.joinFeeAmount || 0).toLocaleString()} ${sym} pour ${memberName} ?`,
      variant: 'info',
      confirmText: 'Payer',
      onConfirm: async () => {
        setPayingJoinFee(membre.id);
        try {
          await tontineApi.payJoinFee(tontineId, membre.id);
          toast.success("Frais d'adhesion payes");
          fetchMembres();
          onUpdate();
        } catch (error) {
          toast.error(handleApiError(error, "Erreur lors du paiement des frais"));
        } finally {
          setPayingJoinFee(null);
        }
      },
    });
  }, [tontineId, tontineConfig, sym, openConfirm, fetchMembres, onUpdate]);

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

            fetchMembres();
            onUpdate();
            toast.success('Membre retiré');
          } catch (error) {
            toast.error(handleApiError(error, 'Erreur lors du retrait du membre'));
          }
        },
      });
    },
    [tontineId, membres.length, fetchMembres, onUpdate, openConfirm]
  );

  const handleRoleChange = useCallback(async (membre: TontineMembre, newRole: string | null) => {
    try {
      await tontineApi.assignMemberRole(tontineId, membre.id, newRole);
      fetchMembres();
      toast.success(newRole ? `Role ${newRole} attribue` : 'Role retire');
    } catch (error) {
      toast.error(handleApiError(error, "Erreur lors du changement de role"));
    }
  }, [tontineId, fetchMembres]);

  // Exit request
  const handleRequestExit = useCallback((membre: TontineMembre) => {
    const memberName = formatClientName(membre.client?.nom, membre.client?.prenom);
    openConfirm({
      title: 'Demander la sortie',
      message: `Soumettre une demande de sortie pour ${escapeHtml(memberName)} ?`,
      variant: 'warning',
      confirmText: 'Demander sortie',
      onConfirm: async () => {
        try {
          await tontineApi.requestMemberExit(tontineId, membre.id);
          toast.success('Demande de sortie soumise');
          fetchMembres();
          onUpdate();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la demande de sortie'));
        }
      },
    });
  }, [tontineId, openConfirm, fetchMembres, onUpdate]);

  // Approve exit
  const handleApproveExit = useCallback((membre: TontineMembre) => {
    const memberName = formatClientName(membre.client?.nom, membre.client?.prenom);
    openConfirm({
      title: 'Approuver la sortie',
      message: `Confirmer la sortie de ${escapeHtml(memberName)} de la tontine ? Cette action est irréversible.`,
      variant: 'danger',
      confirmText: 'Approuver sortie',
      onConfirm: async () => {
        try {
          await tontineApi.approveMemberExit(tontineId, membre.id);
          toast.success('Sortie approuvée');
          fetchMembres();
          onUpdate();
        } catch (error) {
          toast.error(handleApiError(error, "Erreur lors de l'approbation"));
        }
      },
    });
  }, [tontineId, openConfirm, fetchMembres, onUpdate]);

  // Suspend member
  const handleSuspendMember = useCallback((membre: TontineMembre) => {
    const memberName = formatClientName(membre.client?.nom, membre.client?.prenom);
    openConfirm({
      title: 'Suspendre le membre',
      message: `Suspendre ${escapeHtml(memberName)} ? Le membre ne pourra plus cotiser ni recevoir de benefice tant qu'il est suspendu.`,
      variant: 'warning',
      confirmText: 'Suspendre',
      onConfirm: async () => {
        try {
          await tontineApi.suspendMember(tontineId, membre.id, 'Suspension manuelle');
          toast.success('Membre suspendu');
          fetchMembres();
          onUpdate();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suspension'));
        }
      },
    });
  }, [tontineId, openConfirm, fetchMembres, onUpdate]);

  // Reinstate member
  const handleReinstateMember = useCallback((membre: TontineMembre) => {
    const memberName = formatClientName(membre.client?.nom, membre.client?.prenom);
    openConfirm({
      title: 'Reintegrer le membre',
      message: `Reintegrer ${escapeHtml(memberName)} ? Le membre pourra de nouveau cotiser et recevoir des benefices.`,
      variant: 'info',
      confirmText: 'Reintegrer',
      onConfirm: async () => {
        try {
          await tontineApi.reinstateMember(tontineId, membre.id);
          toast.success('Membre reintegre');
          fetchMembres();
          onUpdate();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la reintegration'));
        }
      },
    });
  }, [tontineId, openConfirm, fetchMembres, onUpdate]);

  // Replace member
  const [replacingMemberId, setReplacingMemberId] = useState<string | null>(null);
  const [replacementClientId, setReplacementClientId] = useState('');
  const [replacementSearch, setReplacementSearch] = useState('');

  const replacementCandidates = useMemo(() => {
    const query = sanitizeInput(replacementSearch).toLowerCase();
    return clients.filter((client) => {
      if (membres.some((m) => m.clientId === client.id)) return false;
      if (!query) return true;
      return (client.nom || '').toLowerCase().includes(query) || (client.telephone || '').toLowerCase().includes(query);
    });
  }, [clients, membres, replacementSearch]);

  const handleReplaceMember = useCallback(async () => {
    if (!replacingMemberId || !replacementClientId) return;
    setSubmitting(true);
    try {
      await tontineApi.replaceMember(tontineId, replacingMemberId, replacementClientId);
      toast.success('Membre remplacé avec succès');
      setReplacingMemberId(null);
      setReplacementClientId('');
      setReplacementSearch('');
      fetchMembres();
      onUpdate();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du remplacement'));
    } finally {
      setSubmitting(false);
    }
  }, [tontineId, replacingMemberId, replacementClientId, fetchMembres, onUpdate]);

  // Memoized filtered clients (excludes already added members)
  const filteredClients = useMemo(() => {
    const query = sanitizeInput(searchQuery).toLowerCase();
    return clients.filter((client) => {
      const alreadyMember = membres.some((m) => m.clientId === client.id);
      if (alreadyMember) return false;

      if (!query) return true;

      const name = (client.nom || '').toLowerCase();
      const email = (client.email || '').toLowerCase();
      const phone = (client.telephone || '').toLowerCase();

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
      case StatutMembreTontine.ACTIVE:
        return 'text-status-success bg-status-success-bg';
      case StatutMembreTontine.INACTIVE:
        return 'text-accent bg-accent/10';
      case StatutMembreTontine.EXCLUDED:
        return 'text-status-danger bg-status-danger-bg';
      default:
        return 'text-content-muted bg-surface-subtle/40';
    }
  }, []);

  // Helper to get label for member status
  const getStatutLabel = useCallback((statut: string) => {
    return STATUT_MEMBRE_TONTINE_LABELS[statut as StatutMembreTontineValue] || statut;
  }, []);

  // Export members data
  const buildExportData = useCallback(() => {
    return membres.map((m) => ({
      'Position': m.positionOrdre,
      'Nom': formatClientName(m.client?.nom, m.client?.prenom),
      'Statut': getStatutLabel(m.status || m.statut || StatutMembreTontine.ACTIVE),
      [`Total cotisé (${sym})`]: Number(m.totalCotisations || m.montantTotalContribue || 0),
      'Tours payés': m.toursPayes ?? '-',
      'Tours restants': m.toursRestants ?? '-',
      [`Restant (${sym})`]: m.montantRestant ?? 0,
      'Bénéfice reçu': m.aRecuBenefice ? 'Oui' : 'Non',
      "Date d'adhésion": new Date(m.dateAdhesion || '').toLocaleDateString('fr-FR'),
    }));
  }, [membres, getStatutLabel]);

  const handleExportCSV = useCallback(() => {
    const data = buildExportData();
    const date = new Date().toISOString().slice(0, 10);
    exportToCSV(data, `tontine-membres-${date}`);
  }, [buildExportData]);

  const handleExportPDF = useCallback(() => {
    const data = buildExportData();
    const date = new Date().toISOString().slice(0, 10);
    exportToPDF(data, `tontine-membres-${date}`, `Liste des membres de la tontine`);
  }, [buildExportData]);

  const handleCloseModal = useCallback(() => {
    setShowAddForm(false);
    setSelectedClientId('');
    setSearchQuery('');
  }, []);

  const handleOpenConfig = async (membre: TontineMembre) => {
     setConfigMember(membre);
     setLoadingAccounts(true);
     try {
         const accounts = await compteEpargneApi.getByClient(membre.clientId);
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
            <h3 className="text-lg font-bold text-content-primary" id="membres-heading">
            Membres de la tontine
            </h3>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${isFull ? 'bg-status-danger-bg border-status-danger/30 text-status-danger' : 'bg-surface-elevated border-edge-strong text-content-secondary'}`}>
                {membres.length} / {maxMembres}
            </span>
        </div>
        <div className="flex items-center gap-2">
          {membres.length > 0 && (
            <>
              <IconButton
                icon={Download}
                size="sm"
                onClick={handleExportCSV}
                aria-label="Exporter en CSV"
                title="Exporter CSV"
              />
              <IconButton
                icon={Download}
                size="sm"
                onClick={handleExportPDF}
                aria-label="Exporter en PDF"
                title="Exporter PDF"
                className="text-accent"
              />
            </>
          )}
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
          {tontineConfig?.allowMidCycleJoin && tontineConfig?.statut === 'ACTIVE' && !isFull && (
            <Button
              onClick={() => setShowAddForm(true)}
              variant="outline"
              size="sm"
              icon={UserRoundPlus}
              title="Adhesion en cours de cycle"
            >
              Mi-cycle
            </Button>
          )}
        </div>
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
          className="text-center py-12 border border-dashed border-edge rounded-lg"
          role="status"
        >
          <User className="mx-auto text-content-muted mb-3" size={48} aria-hidden="true" />
          <p className="text-content-muted font-medium">Aucun membre pour le moment</p>
          <p className="text-content-muted text-sm mt-1">Commencez par ajouter des participants</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3" role="list" aria-label="Liste des membres">
            {paginatedMembres.map((membre) => (
              <Card
                key={membre.id}
                className="bg-surface/40 border-edge-subtle p-3 hover:border-edge-strong transition-colors group"
                role="listitem"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar / Position */}
                  <div className="shrink-0 relative">
                    <div className="w-10 h-10 rounded-lg bg-surface-elevated flex items-center justify-center text-content-secondary font-bold border border-edge-strong">
                      {membre.client?.photoProfile ? (
                        <img
                          src={membre.client.photoProfile}
                          alt=""
                          className="w-full h-full object-cover rounded-lg"
                          loading="lazy"
                        />
                      ) : (
                        <span aria-label={`Position ${membre.positionOrdre}`}>
                          #{membre.positionOrdre}
                        </span>
                      )}
                    </div>
                    {membre.aRecuBenefice && (
                      <div
                        className="absolute -top-1.5 -right-1.5 bg-status-info text-white p-0.5 rounded-full border border-edge"
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
                        <h4 className="font-bold text-content-primary text-sm truncate leading-tight">
                          {escapeHtml(membre.client?.nom) || 'Inconnu'}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] mt-0.5">
                          <span
                            className={`px-1.5 py-0.5 rounded font-medium ${getStatutColor(membre.status || membre.statut || StatutMembreTontine.ACTIVE)} bg-opacity-10`}
                          >
                            {getStatutLabel(membre.status || membre.statut || StatutMembreTontine.ACTIVE)}
                          </span>
                          <span className="text-content-muted">
                            {new Date(membre.dateAdhesion || '').toLocaleDateString('fr-FR')}
                          </span>
                          {/* Status Badge Mobile-First */}
                          <MemberStatusBadge membre={membre} tourActuel={membre.tourActuel || 1} />
                          {membre.groupRole && (
                            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-bold">
                              {membre.groupRole}
                            </span>
                          )}
                          {membre.exitRequestedAt && !membre.dateBenefice && (
                            <span className="px-1.5 py-0.5 rounded bg-status-warning-bg text-status-warning text-[10px] font-bold">
                              Sortie demandee
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {/* Join fee payment */}
                        {tontineConfig?.joinFeeEnabled && !(membre as any).joinFeePaidAt && (membre.status || membre.statut) === StatutMembreTontine.ACTIVE && (
                          <button
                            onClick={() => handlePayJoinFee(membre)}
                            disabled={payingJoinFee === membre.id}
                            className="text-content-muted hover:text-accent transition-colors p-1 rounded-lg hover:bg-accent/10"
                            title={`Payer frais d'adhesion (${Number(tontineConfig?.joinFeeAmount || 0).toLocaleString()} ${sym})`}
                            type="button"
                          >
                            <CreditCard size={14} />
                          </button>
                        )}
                        {/* Suspend / Reinstate */}
                        {(membre.status || membre.statut) === StatutMembreTontine.ACTIVE && !membre.exitRequestedAt && (
                          <button
                            onClick={() => handleSuspendMember(membre)}
                            className="text-content-muted hover:text-status-danger transition-colors p-1 rounded-lg hover:bg-status-danger-bg"
                            title="Suspendre"
                            type="button"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                        {(membre.status || membre.statut) === 'SUSPENDED' && (
                          <button
                            onClick={() => handleReinstateMember(membre)}
                            className="text-content-muted hover:text-status-success transition-colors p-1 rounded-lg hover:bg-status-success-bg"
                            title="Reintegrer"
                            type="button"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                        {/* Exit request / approve */}
                        {!membre.exitRequestedAt && (membre.status || membre.statut) === StatutMembreTontine.ACTIVE && (
                          <button
                            onClick={() => handleRequestExit(membre)}
                            className="text-content-muted hover:text-status-warning transition-colors p-1 rounded-lg hover:bg-status-warning-bg"
                            title="Demander sortie"
                            type="button"
                          >
                            <LogOut size={14} />
                          </button>
                        )}
                        {membre.exitRequestedAt && (
                          <button
                            onClick={() => handleApproveExit(membre)}
                            className="text-content-muted hover:text-status-success transition-colors p-1 rounded-lg hover:bg-status-success-bg"
                            title="Approuver sortie"
                            type="button"
                          >
                            <CheckCircle size={14} />
                          </button>
                        )}
                        {/* Replace member */}
                        {(membre.status || membre.statut) === StatutMembreTontine.ACTIVE && (
                          <button
                            onClick={() => { setReplacingMemberId(membre.id); setReplacementClientId(''); setReplacementSearch(''); }}
                            className="text-content-muted hover:text-accent transition-colors p-1 rounded-lg hover:bg-accent/10"
                            title="Remplacer"
                            type="button"
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        {/* Remove */}
                        <button
                          onClick={() => handleRemoveMembre(membre)}
                          className="text-content-muted hover:text-status-danger transition-colors p-1 rounded-lg hover:bg-status-danger-bg"
                          aria-label={`Retirer ${escapeHtml(membre.client?.nom || 'ce membre')}`}
                          type="button"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                        <button
                            onClick={() => handleOpenConfig(membre)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider border transition-colors ${
                                membre.cotisationAutomatique
                                ? 'bg-status-info-bg text-status-info border-status-info/30 hover:bg-status-info-bg/80'
                                : 'bg-surface-elevated/30 text-content-muted border-edge hover:bg-surface-elevated/50 hover:text-content-secondary'
                            }`}
                        >
                            <Settings size={10} />
                            {membre.cotisationAutomatique ? 'Auto ON' : 'Auto OFF'}
                        </button>
                        <select
                          value={membre.groupRole || ''}
                          onChange={(e) => handleRoleChange(membre, e.target.value || null)}
                          className="px-1.5 py-1 text-[10px] bg-input border border-input-border rounded-md text-content-secondary focus:border-input-focus focus:outline-none"
                          title="Role du membre"
                        >
                          <option value="">Membre</option>
                          <option value="PRESIDENT">President</option>
                          <option value="TRESORIER">Tresorier</option>
                          <option value="SECRETAIRE">Secretaire</option>
                        </select>
                    </div>

                    {/* Stats de cotisations */}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs border-t border-edge-subtle pt-2">
                      <div className="flex flex-col">
                        <span className="text-content-muted">Total cotisé</span>
                        <span className="font-bold text-status-success">
                          {Number(membre.totalCotisations || membre.montantTotalContribue || 0).toLocaleString('fr-FR')} {sym}
                        </span>
                      </div>
                      <div className="flex flex-col text-right">
                        <span className="text-content-muted">Restant</span>
                        <span className={`font-bold ${(membre.montantRestant || 0) > 0 ? 'text-status-warning' : 'text-status-success'}`}>
                          {(membre.montantRestant || 0).toLocaleString('fr-FR')} {sym}
                        </span>
                      </div>
                    </div>

                    {/* Progression des tours avec timeline visuelle */}
                    {membre.toursPayes !== undefined && (
                      <div className="mt-2 space-y-1.5">
                        <TontineTimelineHorizontal
                          tourActuel={membre.tourActuel || 1}
                          toursPayes={membre.toursPayes || 0}
                          nombreMembres={maxMembres}
                        />
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-content-muted">
                            Tours payés: <span className="text-accent font-bold">{membre.toursPayes}</span>
                            {' / '}
                            <span className="text-content-muted">{maxMembres}</span>
                          </span>
                          <span className="text-content-muted">|</span>
                          <span className="text-content-muted">
                            Restants: <span className={`font-bold ${(membre.toursRestants || 0) > 0 ? 'text-status-warning' : 'text-status-success'}`}>{membre.toursRestants || 0}</span>
                          </span>
                        </div>
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
          <div className="bg-surface-base border border-edge rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex items-center justify-between shrink-0">
              <div>
                <h2 id="add-member-title" className="text-lg font-bold text-content-primary">
                  Nouveau Membre
                </h2>
                <div className="text-xs text-status-success font-mono mt-0.5">
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
                className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2"
              >
                Rechercher un client
              </label>
              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
                  size={16}
                  aria-hidden="true"
                />
                <input
                  id="search-client"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-base text-content-primary pl-10 pr-4 py-2.5 rounded-lg border border-edge focus:outline-none focus:border-accent transition-colors text-sm"
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
                  <div className="text-center py-8 text-content-muted text-sm">
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
                          ? 'border-accent bg-accent/10'
                          : 'border-edge hover:border-edge-strong bg-surface/30'
                      }`}
                    >
                      <div>
                        <div
                          className={`font-semibold text-sm ${
                            selectedClientId === client.id ? 'text-accent' : 'text-content-secondary'
                          }`}
                        >
                          {formatClientName(client.nom, client.prenom)}
                        </div>
                        <div className="text-xs text-content-muted mt-0.5">
                          {escapeHtml(client.telephone || client.email || '')}
                        </div>
                      </div>
                      {selectedClientId === client.id && (
                        <CheckCircle size={16} className="text-accent" aria-hidden="true" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-edge bg-surface-base/50 shrink-0 flex gap-3">
              <Button variant="ghost" fullWidth onClick={handleCloseModal} disabled={submitting}>
                Annuler
              </Button>
              {tontineConfig?.allowMidCycleJoin && tontineConfig?.statut === 'ACTIVE' && (
                <Button
                  variant="outline"
                  fullWidth
                  onClick={handleMidCycleJoin}
                  disabled={!selectedClientId || submitting}
                  isLoading={submitting}
                  icon={UserRoundPlus}
                >
                  Mi-cycle
                </Button>
              )}
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

      {/* Replace Member Modal */}
      {replacingMemberId && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setReplacingMemberId(null)}
        >
          <div className="bg-surface-base border border-edge rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-bold text-content-primary">Remplacer le membre</h2>
                <p className="text-xs text-content-muted mt-0.5">
                  {(() => {
                    const m = membres.find(m => m.id === replacingMemberId);
                    return m ? formatClientName(m.client?.nom, m.client?.prenom) : '';
                  })()}
                </p>
              </div>
              <IconButton icon={X} onClick={() => setReplacingMemberId(null)} size="sm" aria-label="Fermer" />
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                Nouveau membre
              </label>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={16} />
                <input
                  type="text"
                  value={replacementSearch}
                  onChange={(e) => setReplacementSearch(e.target.value)}
                  className="w-full bg-surface-base text-content-primary pl-10 pr-4 py-2.5 rounded-lg border border-edge focus:outline-none focus:border-accent transition-colors text-sm"
                  placeholder="Rechercher un client..."
                  autoFocus
                />
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto" role="listbox">
                {replacementCandidates.length === 0 ? (
                  <div className="text-center py-8 text-content-muted text-sm">Aucun client trouvé</div>
                ) : (
                  replacementCandidates.slice(0, 50).map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      role="option"
                      aria-selected={replacementClientId === client.id}
                      onClick={() => setReplacementClientId(client.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                        replacementClientId === client.id
                          ? 'border-accent bg-accent/10'
                          : 'border-edge hover:border-edge-strong bg-surface/30'
                      }`}
                    >
                      <div>
                        <div className={`font-semibold text-sm ${replacementClientId === client.id ? 'text-accent' : 'text-content-secondary'}`}>
                          {formatClientName(client.nom, client.prenom)}
                        </div>
                        <div className="text-xs text-content-muted mt-0.5">{client.telephone || ''}</div>
                      </div>
                      {replacementClientId === client.id && <CheckCircle size={16} className="text-accent" />}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-edge bg-surface-base/50 shrink-0 flex gap-3">
              <Button variant="ghost" fullWidth onClick={() => setReplacingMemberId(null)} disabled={submitting}>
                Annuler
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleReplaceMember}
                disabled={!replacementClientId || submitting}
                isLoading={submitting}
                icon={RefreshCw}
              >
                Remplacer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {configMember && (
         <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setConfigMember(null)}
        >
          <div className="bg-surface-base border border-edge rounded-xl w-full max-w-sm shadow-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-200">
             <div className="flex justify-between items-start">
                 <div>
                    <h3 className="font-bold text-content-primary text-lg">Configuration Membre</h3>
                    <p className="text-content-muted text-xs">{formatClientName(configMember.client?.nom, configMember.client?.prenom)}</p>
                 </div>
                 <IconButton icon={X} onClick={() => setConfigMember(null)} size="sm" aria-label="Fermer" />
             </div>

             <div className="bg-surface/50 rounded-lg p-3 border border-edge-subtle space-y-4">
                 <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-content-secondary flex items-center gap-2">
                         <Settings size={14} className="text-status-info" />
                         Cotisation Auto
                     </span>
                     <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={!!configMember.cotisationAutomatique} 
                            onChange={(e) => handleUpdateConfig(e.target.checked, configMember.cotisationCompteId || memberAccounts.find(a => a.typeCompte === TypeCompte.CURRENT)?.id)}
                            className="sr-only peer"
                            disabled={updatingConfig}
                        />
                        <div className="w-9 h-5 bg-edge-strong peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:shadow-md after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                     </label>
                 </div>

                 {configMember.cotisationAutomatique && (
                     <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1">
                         <span className="text-xs text-content-muted font-bold uppercase tracking-wider block">Compte Source</span>
                         {loadingAccounts ? (
                             <div className="h-9 bg-surface-elevated/50 rounded animate-pulse" />
                         ) : (
                             <select 
                                value={configMember.cotisationCompteId || ''}
                                onChange={(e) => handleUpdateConfig(true, e.target.value)}
                                className="w-full bg-surface-base border border-edge rounded-lg px-3 py-2 text-xs text-content-primary focus:outline-none focus:border-accent"
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
                         <div className="flex gap-2 p-2 bg-status-info-bg border border-status-info/20 rounded-md mt-2">
                             <Wallet size={12} className="text-status-info mt-0.5" />
                             <p className="text-[10px] text-status-info leading-tight">
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
