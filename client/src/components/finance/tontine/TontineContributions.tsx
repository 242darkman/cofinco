import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, DollarSign, Calendar, CheckCircle, X, Smartphone, Banknote, FileCheck, Building, Search, Info, Zap, Download, WifiOff } from 'lucide-react';
import { Card, Button, IconButton } from '../../ui';
import { Pagination } from '../../ui/Pagination';
import { SkeletonContributionCard } from '../../ui/Skeleton';
import PaymentValidationModal from '../operations/PaymentValidationModal';
import { usePermissions } from '../../auth/ProtectedFeature';
import { contributionTontineApi, tontineMembreApi, tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { formatMoney, formatDate } from '../../../lib/format';
import { ALL_STATUS_LABELS } from '../../../lib/status-labels';
import { exportToCSV, exportToPDF } from '../../../lib/exportUtils';
import { usePagination } from '../../../hooks/usePagination';
import { useNetworkStatus } from '../../../contexts/NetworkContext';
import { useUserProfile } from '../../../hooks/useUserProfile';
import { executeOfflineOperation } from '../../../lib/offline-treasury';
import {
  StatutClient,
  StatutContributionTontine,
  MethodePaiement,
  METHODE_PAIEMENT_LABELS
} from '@shared/enum/status-constants';
import mtnLogo from '@/assets/logos/mtn-logo.png';
import airtelLogo from '@/assets/logos/airtel-logo.png';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-status-warning-bg0', prefix: '+242 05/06', logo: mtnLogo },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-status-danger', prefix: '+242 04', logo: airtelLogo },
];

/** Mapping modes de paiement UI vers enum */
const PAYMENT_MODE_OPTIONS = [
  { value: MethodePaiement.CASH, label: METHODE_PAIEMENT_LABELS[MethodePaiement.CASH] },
  { value: MethodePaiement.MOBILE_MONEY, label: METHODE_PAIEMENT_LABELS[MethodePaiement.MOBILE_MONEY] },
  { value: MethodePaiement.TRANSFER, label: METHODE_PAIEMENT_LABELS[MethodePaiement.TRANSFER] },
  { value: MethodePaiement.CHECK, label: METHODE_PAIEMENT_LABELS[MethodePaiement.CHECK] },
] as const;

type PaymentMode = typeof MethodePaiement[keyof typeof MethodePaiement];

interface TontineContribution {
  id: string;
  tontineId: string;
  membreId: string;
  clientId: string;
  montant: number;
  tourNumero: number;
  dateContribution: string;
  modePaiement: PaymentMode;
  referencePaiement: string | null;
  statut: typeof StatutContributionTontine[keyof typeof StatutContributionTontine];
  statutContribution?: 'FULL' | 'PARTIAL';
  notes: string | null;
  client: {
    nom: string;
    prenom?: string;
  };
}

interface TontineMembre {
  id: string;
  clientId: string;
  positionOrdre: number;
  statut: string;
  client: {
    nom: string;
    prenom?: string;
  };
}

interface TontineContributionsProps {
  tontineId: string;
}

interface FormErrors {
  membre_id?: string;
  montant?: string;
  tour_numero?: string;
  operateur?: string;
  general?: string;
}

const ITEMS_PER_PAGE = 10;

// Composant Smart Feedback - Prévisualisation du paiement
const PaymentPreview = ({
  montant,
  montantCotisation,
  penalitesImpayees = 0,
  selectedMembre,
  contributions
}: {
  montant: number;
  montantCotisation: number;
  penalitesImpayees?: number;
  selectedMembre?: TontineMembre;
  contributions: TontineContribution[];
}) => {
  if (montant <= 0 || montantCotisation <= 0) return null;

  let remaining = montant;
  const breakdown: { label: string; amount: number; type: 'penalty' | 'full' | 'partial' }[] = [];

  // 1. Pénalités
  if (penalitesImpayees > 0 && remaining >= penalitesImpayees) {
    breakdown.push({
      label: 'Pénalités',
      amount: penalitesImpayees,
      type: 'penalty'
    });
    remaining -= penalitesImpayees;
  }

  // 2. Calculer les tours déjà payés par ce membre
  let toursDejaPayes = 0;
  if (selectedMembre) {
    const memberContribs = contributions.filter(
      c => c.clientId === selectedMembre.clientId && c.statut === StatutContributionTontine.VALIDATED
    );
    toursDejaPayes = memberContribs.reduce((max, c) => Math.max(max, c.tourNumero), 0);
  }

  // 3. Tours complets et partiels
  if (remaining > 0) {
    const toursComplets = Math.floor(remaining / montantCotisation);
    const partiel = remaining % montantCotisation;

    if (toursComplets > 0) {
      const startTour = toursDejaPayes + 1;
      const endTour = startTour + toursComplets - 1;
      breakdown.push({
        label: toursComplets === 1
          ? `Tour ${startTour}`
          : `Tours ${startTour} à ${endTour}`,
        amount: toursComplets * montantCotisation,
        type: 'full'
      });
    }

    if (partiel > 0) {
      const partialTour = toursDejaPayes + toursComplets + 1;
      breakdown.push({
        label: `Tour ${partialTour} (partiel)`,
        amount: partiel,
        type: 'partial'
      });
    }
  }

  if (breakdown.length === 0) return null;

  return (
    <div className="mt-3 p-3 bg-gradient-to-r from-accent/10 to-accent-secondary/10 border border-accent/30 rounded-xl animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-start gap-2">
        <div className="p-1.5 rounded-lg bg-accent/10">
          <Zap size={14} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-accent mb-2">
            Ce montant paiera :
          </div>
          <div className="space-y-1.5">
            {breakdown.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className={`flex items-center gap-1.5 ${
                  item.type === 'penalty' ? 'text-status-danger' :
                  item.type === 'partial' ? 'text-status-warning' :
                  'text-accent'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    item.type === 'penalty' ? 'bg-status-danger' :
                    item.type === 'partial' ? 'bg-status-warning' :
                    'bg-accent'
                  }`} />
                  {item.label}
                </span>
                <span className="font-mono font-bold text-content-primary">
                  {item.amount.toLocaleString('fr-FR')} F
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Modal de détails de contribution
const ContributionDetailsModal = ({ contribution, onClose }: { contribution: TontineContribution; onClose: () => void }) => {
  if (!contribution) return null;

  const getModeLabel = (mode: string) => {
    // Use enum labels when available, fallback to mode value
    const enumMode = Object.values(MethodePaiement).find(v => v === mode);
    if (enumMode) {
      return METHODE_PAIEMENT_LABELS[enumMode as PaymentMode];
    }
    // Legacy support for old French values
    switch (mode) {
      case 'Cash': return METHODE_PAIEMENT_LABELS[MethodePaiement.CASH];
      case 'Mobile Money': return METHODE_PAIEMENT_LABELS[MethodePaiement.MOBILE_MONEY];
      case 'Virement': return METHODE_PAIEMENT_LABELS[MethodePaiement.TRANSFER];
      case 'Chèque': return METHODE_PAIEMENT_LABELS[MethodePaiement.CHECK];
      default: return mode;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-base border border-edge rounded-xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-edge flex items-center justify-between bg-surface/50">
          <h3 className="font-bold text-content-primary flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-status-success-bg text-status-success">
              <Banknote size={18} />
            </span>
            Détails de la contribution
          </h3>
          <IconButton icon={X} onClick={onClose} size="sm" aria-label="Fermer" />
        </div>
        
        <div className="p-6 space-y-6">
          <div className="text-center">
             <div className="text-content-muted text-xs uppercase tracking-wider mb-1">Montant versé</div>
             <div className="text-3xl font-bold text-status-success">{formatMoney(contribution.montant)}</div>
             <div className="text-sm text-content-muted mt-1">Tour #{contribution.tourNumero}</div>
          </div>

          <div className="bg-surface/50 rounded-xl p-4 space-y-3 border border-edge-subtle">
             <div className="flex justify-between items-center py-1 border-b border-edge-subtle last:border-0 last:pb-0">
                <span className="text-content-muted text-sm">Membre</span>
                <span className="text-content-primary font-medium text-right">
                  {contribution.client?.nom} {contribution.client?.prenom}
                </span>
             </div>
             
             <div className="flex justify-between items-center py-1 border-b border-edge-subtle last:border-0 last:pb-0">
                <span className="text-content-muted text-sm">Date</span>
                <span className="text-content-primary font-medium text-right">
                  {new Date(contribution.dateContribution).toLocaleDateString('fr-FR', { 
                    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
             </div>

             <div className="flex justify-between items-center py-1 border-b border-edge-subtle last:border-0 last:pb-0">
                <span className="text-content-muted text-sm">Mode</span>
                <span className="text-content-primary font-medium text-right flex items-center gap-2">
                  {getModeLabel(contribution.modePaiement)}
                </span>
             </div>

             {/* Afficher l'opérateur uniquement si Mobile Money */}
             {contribution.modePaiement === MethodePaiement.MOBILE_MONEY && (
                // Note: Si l'opérateur n'est pas stocké explicitement dans le type TontineContribution actuel, 
                // on pourrait avoir besoin de modifier le type ou le backend. 
                // Mais s'il est dans 'notes' ou un champ dédié que j'aurais manqué...
                // Pour l'instant on suppose qu'il n'est pas là ou qu'on l'affiche s'il existe.
                 <div className="flex justify-between items-center py-1 border-b border-edge-subtle last:border-0 last:pb-0">
                    <span className="text-content-muted text-sm">Référence</span>
                    <span className="text-accent font-mono text-sm text-right break-all max-w-[150px]">
                      {contribution.referencePaiement || 'N/A'}
                    </span>
                 </div>
             )}
             
             {contribution.referencePaiement && contribution.modePaiement !== MethodePaiement.MOBILE_MONEY && (
                <div className="flex justify-between items-center py-1 border-b border-edge-subtle last:border-0 last:pb-0">
                  <span className="text-content-muted text-sm">Référence</span>
                  <span className="text-content-secondary font-mono text-sm text-right">
                    {contribution.referencePaiement}
                  </span>
                </div>
             )}
          </div>
          
          {contribution.notes && (
            <div className="bg-surface/30 rounded-lg p-3 text-sm text-content-secondary italic border border-edge-subtle">
              "{contribution.notes}"
            </div>
          )}

          <div className="flex justify-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
              contribution.statut === 'VALIDATED' ? 'bg-status-success-bg text-status-success' :
              contribution.statut === 'PENDING' ? 'bg-status-warning-bg text-status-warning' :
              'bg-status-danger-bg text-status-danger'
            }`}>
              {ALL_STATUS_LABELS[contribution.statut] || contribution.statut}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
              contribution.statutContribution === 'PARTIAL'
                ? 'bg-status-warning-bg text-status-warning'
                : 'bg-status-success-bg text-status-success'
            }`}>
              {contribution.statutContribution === 'PARTIAL' ? 'Partiel' : 'Complet'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function TontineContributions({ tontineId }: TontineContributionsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateContributions = hasPermission('tontines', 'create') || hasPermission('tontines', 'edit');

  // Offline support
  const networkStatus = useNetworkStatus();
  const { user } = useUserProfile();
  const isOffline = networkStatus === 'offline';

  const [contributions, setContributions] = useState<TontineContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [membres, setMembres] = useState<TontineMembre[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalType, setPaymentModalType] = useState<'mobile_money' | 'especes'>('especes');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [selectedContribution, setSelectedContribution] = useState<TontineContribution | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tontine, setTontine] = useState<any>(null);

  const [formData, setFormData] = useState({
    membre_id: '',
    montant: 0,
    tour_numero: 1,
    mode_paiement: MethodePaiement.CASH as PaymentMode,
    reference_paiement: '',
    notes: '',
  });

  // Pagination
  const pagination = usePagination({
    totalItems: contributions.length,
    itemsPerPage: ITEMS_PER_PAGE,
  });

  // Fetch data on mount
  useEffect(() => {
    if (tontineId) {
      fetchContributions();
      fetchMembres();
      fetchTontine();
    }
  }, [tontineId]);

  const fetchTontine = useCallback(async () => {
    try {
        const data = await tontineApi.getById(tontineId);
        setTontine(data);
    } catch (error) {
        console.error("Erreur chargement tontine", error);
    }
  }, [tontineId]);

  const fetchContributions = useCallback(async () => {
    if (!tontineId) return;
    setLoading(true);
    try {
      const data = await contributionTontineApi.getByTontine(tontineId);
      setContributions(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des contributions'));
      setContributions([]);
    } finally {
      setLoading(false);
    }
  }, [tontineId]);

  const fetchMembres = useCallback(async () => {
    if (!tontineId) return;
    try {
      const data = await tontineMembreApi.getByTontine(tontineId);
      const membresActifs = data?.filter((m: any) => (m.statut === StatutClient.ACTIVE || m.status === StatutClient.ACTIVE)) || [];
      setMembres(membresActifs);
    } catch (error) {
      console.error('Erreur chargement membres:', error);
    }
  }, [tontineId]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.membre_id) {
      newErrors.membre_id = 'Veuillez sélectionner un membre';
    }

    const amountValidation = validateAmount(formData.montant, {
      min: 100,
      max: VALIDATION_LIMITS.MAX_COTISATION,
      fieldName: 'Montant',
    });
    if (!amountValidation.isValid) {
      newErrors.montant = amountValidation.error;
    }

    if (formData.tour_numero < 1) {
      newErrors.tour_numero = 'Le numéro de tour doit être supérieur à 0';
    }

    if (formData.mode_paiement === MethodePaiement.MOBILE_MONEY && !selectedOperator) {
      newErrors.operateur = 'Veuillez sélectionner un opérateur';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, selectedOperator]);

  const resetForm = useCallback(() => {
    setFormData({
      membre_id: '',
      montant: 0,
      tour_numero: 1,
      mode_paiement: MethodePaiement.CASH,
      reference_paiement: '',
      notes: '',
    });
    setSelectedOperator('');
    setErrors({});
  }, []);

  const handleAddContribution = useCallback(async () => {
    if (!validateForm()) return;

    if (formData.mode_paiement === MethodePaiement.MOBILE_MONEY) {
      setPaymentModalType('mobile_money');
      setShowPaymentModal(true);
      return;
    } else if (formData.mode_paiement === MethodePaiement.CASH) {
      setPaymentModalType('especes');
      setShowPaymentModal(true);
      return;
    }

    await processContribution();
  }, [formData, validateForm]);

  const processContribution = useCallback(
    async (paymentRef?: string, operator?: string) => {
      if (!formData.membre_id) return;

      const membre = membres.find((m) => m.id === formData.membre_id);
      if (!membre) {
        toast.error('Membre non trouvé');
        return;
      }

      setSubmitting(true);
      try {
        // Offline path: route through journal for Cash payments when offline
        if (isOffline && formData.mode_paiement === MethodePaiement.CASH && user?.id) {
          const result = await executeOfflineOperation({
            type: 'TONTINE_CONTRIBUTION',
            amount: formData.montant,
            agentId: user.id.toString(),
            agenceId: user.agenceId || '',
            payload: {
              tontineId,
              clientId: membre.clientId,
              montant: formData.montant,
              tourNumero: formData.tour_numero,
              methodePaiement: MethodePaiement.CASH,
              observations: sanitizeInput(formData.notes) || undefined,
            },
          });

          setShowAddForm(false);
          setShowPaymentModal(false);
          resetForm();

          const membreNom = membre.client?.nom || 'Membre';
          toast.success(`Cotisation de ${formData.montant.toLocaleString()} FCFA pour ${membreNom} enregistrée hors ligne (réf: ${result.operationRef})`);
          return;
        }

        const providerName = operator ? operator.toUpperCase() : undefined;
        await contributionTontineApi.create({
          tontineId: tontineId,
          clientId: membre.clientId,
          typeOperation: 'Versement',
          montant: String(formData.montant),
          tourNumero: formData.tour_numero,
          methodePaiement: formData.mode_paiement,
          reference: paymentRef || formData.reference_paiement || `REF-${Date.now()}`,
          observations: sanitizeInput(formData.notes) || undefined,
          idempotencyKey: crypto.randomUUID(),
          ...(formData.mode_paiement === MethodePaiement.MOBILE_MONEY && providerName
            ? { provider: providerName }
            : {}),
        });

        setShowAddForm(false);
        setShowPaymentModal(false);
        resetForm();
        fetchContributions();
        fetchMembres();

        // Feedback plus détaillé
        const membreNom = membre.client?.nom || 'Membre';
        toast.success(`Contribution de ${formData.montant.toLocaleString()} FCFA enregistrée pour ${membreNom} (Tour #${formData.tour_numero})`);
      } catch (error) {
        toast.error(handleApiError(error, "Erreur lors de l'ajout de la contribution"));
      } finally {
        setSubmitting(false);
      }
    },
    [formData, membres, tontineId, selectedOperator, fetchContributions, fetchMembres, isOffline, user, resetForm]
  );

  const handlePaymentValidation = useCallback(
    (paymentRef: string, operator?: string) => {
      processContribution(paymentRef, operator);
    },
    [processContribution]
  );

  // Memoized filtered contributions
  const filteredContributions = useMemo(() => {
    let filtered = contributions;

    if (statusFilter === 'PARTIAL') {
      filtered = filtered.filter((c) => c.statutContribution === 'PARTIAL');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.statut === statusFilter);
    }

    if (searchQuery) {
      const query = sanitizeInput(searchQuery).toLowerCase();
      filtered = filtered.filter((c) => {
        const memberName = `${c.client?.nom || ''} ${c.client?.prenom || ''}`.toLowerCase();
        return memberName.includes(query);
      });
    }

    return filtered;
  }, [contributions, statusFilter, searchQuery]);

  const paginatedContributions = useMemo(
    () => pagination.paginateArray(filteredContributions),
    [filteredContributions, pagination.currentPage, pagination.itemsPerPage]
  );

  // Stats
  const totalContributions = useMemo(
    () => contributions.reduce((sum, c) => sum + Number(c.montant), 0),
    [contributions]
  );

  const getStatutColor = useCallback((statut: string) => {
    if (statut === StatutContributionTontine.VALIDATED) {
      return 'text-status-success bg-status-success-bg';
    }
    if (statut === StatutContributionTontine.PENDING) {
      return 'text-accent bg-accent/10';
    }
    if (statut === StatutContributionTontine.REJECTED) {
      return 'text-status-danger bg-status-danger-bg';
    }
    if (statut === StatutContributionTontine.LATE) {
      return 'text-status-warning bg-status-warning-bg';
    }
    return 'text-content-muted bg-surface-subtle/40';
  }, []);

  const getModeIcon = useCallback((mode: string) => {
    switch (mode) {
      case MethodePaiement.CASH:
      case 'Cash': // Legacy support
        return <Banknote size={14} className="inline text-status-success" aria-hidden="true" />;
      case MethodePaiement.MOBILE_MONEY:
      case 'Mobile Money': // Legacy support
        return <Smartphone size={14} className="inline text-accent" aria-hidden="true" />;
      case MethodePaiement.TRANSFER:
      case 'Virement': // Legacy support
        return <Building size={14} className="inline text-status-info" aria-hidden="true" />;
      case MethodePaiement.CHECK:
      case 'Chèque': // Legacy support
        return <FileCheck size={14} className="inline text-status-info" aria-hidden="true" />;
      default:
        return <DollarSign size={14} className="inline text-content-muted" aria-hidden="true" />;
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowAddForm(false);
    resetForm();
  }, [resetForm]);

  // Export contributions data
  const buildContributionExportData = useCallback(() => {
    return contributions.map((c) => ({
      'Date': new Date(c.dateContribution).toLocaleDateString('fr-FR'),
      'Membre': c.client ? `${c.client.nom}${c.client.prenom ? ' ' + c.client.prenom : ''}` : '-',
      'Tour': c.tourNumero,
      'Montant (FCFA)': c.montant,
      'Mode paiement': METHODE_PAIEMENT_LABELS[c.modePaiement as keyof typeof METHODE_PAIEMENT_LABELS] || c.modePaiement,
      'Statut': ALL_STATUS_LABELS[c.statut] || c.statut,
      'Référence': c.referencePaiement || '-',
    }));
  }, [contributions]);

  const handleExportContributionsCSV = useCallback(() => {
    const data = buildContributionExportData();
    const date = new Date().toISOString().slice(0, 10);
    exportToCSV(data, `tontine-contributions-${date}`);
  }, [buildContributionExportData]);

  const handleExportContributionsPDF = useCallback(() => {
    const data = buildContributionExportData();
    const date = new Date().toISOString().slice(0, 10);
    exportToPDF(data, `tontine-contributions-${date}`, `Historique des contributions`);
  }, [buildContributionExportData]);

  return (
    <div className="space-y-4">
      {/* Offline Indicator */}
      {isOffline && (
        <div className="flex items-center gap-2 px-4 py-2 bg-status-warning-bg border border-status-warning/30 rounded-lg text-status-warning text-sm">
          <WifiOff size={16} />
          <span>Mode hors ligne — Seules les cotisations en espèces sont disponibles.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div>
          <h3 className="text-lg font-bold text-content-primary" id="contributions-heading">
            Contributions
          </h3>
          <p className="text-sm text-content-muted">
            Total: <span className="text-status-success font-bold">{formatMoney(totalContributions)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {contributions.length > 0 && (
            <>
              <IconButton
                icon={Download}
                size="sm"
                onClick={handleExportContributionsCSV}
                aria-label="Exporter en CSV"
                title="Exporter CSV"
              />
              <IconButton
                icon={Download}
                size="sm"
                onClick={handleExportContributionsPDF}
                aria-label="Exporter en PDF"
                title="Exporter PDF"
                className="text-accent"
              />
            </>
          )}
          {canCreateContributions && (
            <Button
              onClick={() => setShowAddForm(true)}
              variant="success"
              size="sm"
              icon={Plus}
              aria-describedby="contributions-heading"
            >
              Nouvelle
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      {contributions.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted"
              size={16}
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                pagination.reset();
              }}
              placeholder="Rechercher un membre..."
              className="w-full bg-surface/50 text-content-primary pl-10 pr-4 py-2 rounded-lg border border-edge focus:outline-none focus:border-accent text-sm"
              aria-label="Rechercher une contribution"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              pagination.reset();
            }}
            className="bg-surface/50 text-content-primary px-3 py-2 rounded-lg border border-edge focus:outline-none focus:border-accent text-sm"
            aria-label="Filtrer par statut"
          >
            <option value="all">Tous les statuts</option>
            <option value={StatutContributionTontine.VALIDATED}>Validée</option>
            <option value={StatutContributionTontine.PENDING}>En attente</option>
            <option value={StatutContributionTontine.REJECTED}>Rejetée</option>
            <option value={StatutContributionTontine.LATE}>En retard</option>
            <option value="PARTIAL">Partielles</option>
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3" role="status" aria-label="Chargement des contributions">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonContributionCard key={i} />
          ))}
        </div>
      ) : filteredContributions.length === 0 ? (
        <div
          className="text-center py-12 border border-dashed border-edge rounded-lg"
          role="status"
        >
          <DollarSign className="mx-auto text-content-muted mb-3" size={48} aria-hidden="true" />
          <p className="text-content-muted font-medium">
            {searchQuery || statusFilter !== 'all' ? 'Aucune contribution trouvée' : 'Aucune contribution'}
          </p>
          {canCreateContributions && !searchQuery && statusFilter === 'all' && (
            <Button onClick={() => setShowAddForm(true)} variant="outline" className="mt-2" size="sm">
              Commencer
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3" role="list" aria-label="Liste des contributions">
            {paginatedContributions.map((contribution) => (
              <Card
                key={contribution.id}
                className="bg-surface/40 border-edge-subtle p-4 hover:border-accent/50 hover:bg-surface/60 transition-all cursor-pointer group relative overflow-hidden"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedContribution(contribution)}
              >
                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-surface-elevated/80 p-1.5 rounded-lg text-xs text-content-secondary font-medium">
                        Voir détails
                    </div>
                </div>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-bold text-content-primary text-sm truncate">
                        {escapeHtml(contribution.client?.nom || 'Inconnu')}{' '}
                        {escapeHtml(contribution.client?.prenom || '')}
                      </h4>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${getStatutColor(contribution.statut)}`}
                      >
                        {ALL_STATUS_LABELS[contribution.statut] || contribution.statut}
                      </span>
                      {contribution.statutContribution === 'PARTIAL' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase text-status-warning bg-status-warning-bg">
                          Partiel
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-content-muted mb-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} aria-hidden="true" />
                        {formatDate(contribution.dateContribution)}
                      </span>
                      <span className="flex items-center gap-1 text-content-secondary">
                        {getModeIcon(contribution.modePaiement)}
                        {contribution.modePaiement}
                      </span>
                    </div>

                    <div className="text-xs text-content-muted flex items-center gap-2 flex-wrap">
                      <span className="bg-surface-elevated/50 px-1.5 py-0.5 rounded text-content-primary font-medium">
                        Tour #{contribution.tourNumero}
                      </span>
                      {contribution.referencePaiement && (
                        <span
                          className="font-mono text-[10px] px-1 bg-surface rounded text-accent/80 truncate max-w-[100px]"
                          title={contribution.referencePaiement}
                        >
                          {escapeHtml(contribution.referencePaiement)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-status-success text-sm sm:text-base">
                      {formatMoney(contribution.montant)}
                    </div>
                    {contribution.notes && (
                      <div
                        className="text-[10px] text-content-muted mt-1 max-w-[100px] truncate"
                        title={contribution.notes}
                      >
                        {escapeHtml(contribution.notes)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {filteredContributions.length > ITEMS_PER_PAGE && (
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={pagination.goToPage}
              canGoNext={pagination.canGoNext}
              canGoPrevious={pagination.canGoPrevious}
              itemsPerPage={pagination.itemsPerPage}
              totalItems={filteredContributions.length}
            />
          )}
        </>
      )}

      {/* Add Contribution Modal */}
      {showAddForm && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-contribution-title"
          onClick={(e) => e.target === e.currentTarget && handleCloseModal()}
        >
          <div className="bg-surface-base border border-edge rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-edge flex items-center justify-between shrink-0">
              <h2 id="add-contribution-title" className="text-lg font-bold text-content-primary">
                Nouvelle Contribution
              </h2>
              <IconButton icon={X} onClick={handleCloseModal} size="sm" aria-label="Fermer" />
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Error banner */}
              {errors.general && (
                <div className="p-3 bg-status-danger-bg border border-status-danger/50 rounded-lg text-status-danger text-sm" role="alert">
                  {errors.general}
                </div>
              )}

              {/* Member selection */}
              <div>
                <label htmlFor="membre-select" className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                  Membre *
                </label>
                <select
                  id="membre-select"
                  value={formData.membre_id}
                  onChange={(e) => {
                    const newMembreId = e.target.value;
                    let newTour = 1;
                    
                    // Auto-calculate next tour
                    if (newMembreId) {
                        const memberContribs = contributions.filter(c => c.membreId === newMembreId && c.statut === StatutContributionTontine.VALIDATED);
                        const maxTour = memberContribs.length > 0 ? Math.max(...memberContribs.map(c => c.tourNumero)) : 0;
                        newTour = maxTour + 1;
                    }

                    setFormData((prev) => ({ 
                        ...prev, 
                        membre_id: newMembreId,
                        tour_numero: newTour
                    }));
                    if (errors.membre_id) setErrors((prev) => ({ ...prev, membre_id: undefined }));
                  }}
                  className={`w-full bg-surface-base text-content-primary px-3 py-2.5 rounded-lg border focus:outline-none focus:border-accent text-sm ${
                    errors.membre_id ? 'border-status-danger' : 'border-edge'
                  }`}
                  aria-invalid={!!errors.membre_id}
                  aria-describedby={errors.membre_id ? 'membre-error' : undefined}
                >
                  <option value="">Sélectionner...</option>
                  {membres.map((membre) => (
                    <option key={membre.id} value={membre.id}>
                      {escapeHtml(membre.client?.nom || 'Inconnu')} (Pos. #{membre.positionOrdre})
                    </option>
                  ))}
                </select>
                {errors.membre_id && (
                  <p id="membre-error" className="text-status-danger text-xs mt-1" role="alert">
                    {errors.membre_id}
                  </p>
                )}
              </div>

              {/* Amount and Tour */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="montant-input" className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                    Montant (FCFA) *
                  </label>
                  <input
                    id="montant-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.montant || ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      setFormData((prev) => ({ ...prev, montant: v ? Number(v) : 0 }));
                      if (errors.montant) setErrors((prev) => ({ ...prev, montant: undefined }));
                    }}
                    className={`w-full bg-surface-base text-content-primary px-3 py-2.5 rounded-lg border focus:outline-none focus:border-accent text-sm ${
                      errors.montant ? 'border-status-danger' : 'border-edge'
                    }`}
                    aria-invalid={!!errors.montant}
                    aria-describedby={errors.montant ? 'montant-error' : undefined}
                  />
                  {/* Smart Payment Preview */}
                  {formData.montant > 0 && tontine && (
                    <PaymentPreview
                      montant={formData.montant}
                      montantCotisation={Number(tontine.montantCotisation)}
                      selectedMembre={membres.find(m => m.id === formData.membre_id)}
                      contributions={contributions}
                    />
                  )}
                  {errors.montant && (
                    <p id="montant-error" className="text-status-danger text-xs mt-1" role="alert">
                      {errors.montant}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="tour-input" className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                    Tour *
                  </label>
                  <input
                    id="tour-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={formData.tour_numero}
                    onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData((prev) => ({ ...prev, tour_numero: v ? Number(v) : 0 })); }}
                    className="w-full bg-surface-base text-content-primary px-3 py-2.5 rounded-lg border border-edge focus:outline-none focus:border-accent text-sm"
                  />
                </div>
              </div>

              {/* Payment mode */}
              <div>
                <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                  Mode de paiement *
                </label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode de paiement">
                  {PAYMENT_MODE_OPTIONS.map((option) => {
                    const modeDisabled = isOffline
                      ? option.value !== MethodePaiement.CASH
                      : (option.value !== MethodePaiement.CASH && option.value !== MethodePaiement.MOBILE_MONEY);
                    return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={formData.mode_paiement === option.value}
                      onClick={() => !modeDisabled && setFormData((prev) => ({ ...prev, mode_paiement: option.value }))}
                      className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition ${
                        formData.mode_paiement === option.value
                          ? 'bg-accent border-accent text-white'
                          : modeDisabled
                            ? 'bg-surface/50 border-edge text-content-muted cursor-not-allowed opacity-50'
                            : 'bg-surface border-edge text-content-secondary hover:bg-surface-elevated'
                      }`}
                      disabled={modeDisabled}
                    >
                      {getModeIcon(option.value)} {option.label}
                    </button>
                    );
                  })}
                  <div className="col-span-2 text-[10px] text-content-muted italic text-center mt-1">
                    {isOffline ? '* Mode hors ligne — espèces uniquement' : '* Virement et Chèque bientôt disponibles'}
                  </div>

                </div>
              </div>

              {/* Mobile Money Operator */}
              {formData.mode_paiement === MethodePaiement.MOBILE_MONEY && (
                <div>
                  <label className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                    Opérateur *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {MOBILE_OPERATORS.map((op) => (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => {
                          setSelectedOperator(op.id);
                          if (errors.operateur) setErrors((prev) => ({ ...prev, operateur: undefined }));
                        }}
                        className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition ${
                          selectedOperator === op.id
                            ? `${op.color} border-transparent text-content-primary`
                            : 'bg-surface border-edge text-content-secondary hover:bg-surface-elevated'
                        }`}
                      >
                        <img src={op.logo} alt={op.name} className="w-5 h-5 rounded-full object-contain" />
                        {op.name}
                      </button>
                    ))}
                  </div>
                  {errors.operateur && (
                    <p className="text-status-danger text-xs mt-1" role="alert">
                      {errors.operateur}
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label htmlFor="notes-input" className="block text-xs font-semibold text-content-muted uppercase tracking-wider mb-2">
                  Notes (optionnel)
                </label>
                <textarea
                  id="notes-input"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-surface-base text-content-primary px-3 py-2.5 rounded-lg border border-edge focus:outline-none focus:border-accent text-sm resize-none"
                  rows={2}
                  maxLength={500}
                  placeholder="Remarques ou informations supplémentaires..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-edge bg-surface-base/50 shrink-0 flex gap-3">
              <Button variant="ghost" fullWidth onClick={handleCloseModal} disabled={submitting}>
                Annuler
              </Button>
              <Button
                variant="success"
                fullWidth
                onClick={handleAddContribution}
                disabled={!formData.membre_id || formData.montant <= 0 || submitting}
                isLoading={submitting}
                icon={CheckCircle}
              >
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <PaymentValidationModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onValidate={handlePaymentValidation}
        montant={formData.montant}
        type={paymentModalType}
        loading={submitting}
        initialOperator={selectedOperator}
      />

      {/* Details Modal */}
      {selectedContribution && (
        <ContributionDetailsModal 
          contribution={selectedContribution} 
          onClose={() => setSelectedContribution(null)} 
        />
      )}
    </div>
  );
}
