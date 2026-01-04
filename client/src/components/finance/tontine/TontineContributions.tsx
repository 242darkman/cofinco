import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, DollarSign, Calendar, CheckCircle, X, Smartphone, Banknote, FileCheck, Building, Search } from 'lucide-react';
import { Card, Button, IconButton } from '../../ui';
import { Pagination } from '../../ui/Pagination';
import { SkeletonContributionCard } from '../../ui/Skeleton';
import PaymentValidationModal from '../operations/PaymentValidationModal';
import { usePermissions } from '../../auth/ProtectedFeature';
import { contributionTontineApi, tontineMembreApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { formatMoney, formatDate } from '../../../lib/format';
import { usePagination } from '../../../hooks/usePagination';

const MOBILE_OPERATORS = [
  { id: 'mtn', name: 'MTN Mobile Money', color: 'bg-yellow-500', prefix: '+242 05/06' },
  { id: 'airtel', name: 'Airtel Money', color: 'bg-red-500', prefix: '+242 04' },
];

const PAYMENT_MODES = ['Cash', 'Mobile Money', 'Virement', 'Chèque'] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number];

interface TontineContribution {
  id: string;
  tontine_id: string;
  membre_id: string;
  client_id: string;
  montant: number;
  tour_numero: number;
  date_contribution: string;
  mode_paiement: PaymentMode;
  reference_paiement: string | null;
  statut: 'Validée' | 'En attente' | 'Rejetée';
  notes: string | null;
  tontine_membres: {
    clients: {
      nom: string;
      prenom?: string;
    };
  };
}

interface TontineMembre {
  id: string;
  client_id: string;
  position_ordre: number;
  status: string;
  clients: {
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

const ITEMS_PER_PAGE = 15;

export default function TontineContributions({ tontineId }: TontineContributionsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateContributions = hasPermission('tontines', 'create') || hasPermission('tontines', 'edit');

  const [contributions, setContributions] = useState<TontineContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [membres, setMembres] = useState<TontineMembre[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalType, setPaymentModalType] = useState<'mobile_money' | 'especes'>('especes');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    membre_id: '',
    montant: 0,
    tour_numero: 1,
    mode_paiement: 'Cash' as PaymentMode,
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
      const membresActifs = data?.filter((m: TontineMembre) => m.status === 'Actif') || [];
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

    if (formData.mode_paiement === 'Mobile Money' && !selectedOperator) {
      newErrors.operateur = 'Veuillez sélectionner un opérateur';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, selectedOperator]);

  const handleAddContribution = useCallback(async () => {
    if (!validateForm()) return;

    if (formData.mode_paiement === 'Mobile Money') {
      setPaymentModalType('mobile_money');
      setShowPaymentModal(true);
      return;
    } else if (formData.mode_paiement === 'Cash') {
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
        await contributionTontineApi.create({
          tontine_id: tontineId,
          membre_id: formData.membre_id,
          client_id: membre.client_id,
          montant: formData.montant,
          tour_numero: formData.tour_numero,
          mode_paiement: formData.mode_paiement,
          reference_paiement: paymentRef || formData.reference_paiement || null,
          operateur_mobile: operator || selectedOperator || null,
          notes: sanitizeInput(formData.notes) || null,
        });

        setShowAddForm(false);
        setShowPaymentModal(false);
        resetForm();
        fetchContributions();
        fetchMembres();

        toast.success('Contribution enregistrée avec succès');
      } catch (error) {
        toast.error(handleApiError(error, "Erreur lors de l'ajout de la contribution"));
      } finally {
        setSubmitting(false);
      }
    },
    [formData, membres, tontineId, selectedOperator, fetchContributions, fetchMembres]
  );

  const resetForm = useCallback(() => {
    setFormData({
      membre_id: '',
      montant: 0,
      tour_numero: 1,
      mode_paiement: 'Cash',
      reference_paiement: '',
      notes: '',
    });
    setSelectedOperator('');
    setErrors({});
  }, []);

  const handlePaymentValidation = useCallback(
    (paymentRef: string, operator?: string) => {
      processContribution(paymentRef, operator);
    },
    [processContribution]
  );

  // Memoized filtered contributions
  const filteredContributions = useMemo(() => {
    let filtered = contributions;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.statut === statusFilter);
    }

    if (searchQuery) {
      const query = sanitizeInput(searchQuery).toLowerCase();
      filtered = filtered.filter((c) => {
        const memberName = `${c.tontine_membres?.clients?.nom || ''} ${c.tontine_membres?.clients?.prenom || ''}`.toLowerCase();
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
    switch (statut) {
      case 'Validée':
        return 'text-green-400 bg-green-500/20';
      case 'En attente':
        return 'text-cyan-400 bg-cyan-500/20';
      case 'Rejetée':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  }, []);

  const getModeIcon = useCallback((mode: string) => {
    switch (mode) {
      case 'Cash':
        return <Banknote size={14} className="inline text-green-400" aria-hidden="true" />;
      case 'Mobile Money':
        return <Smartphone size={14} className="inline text-cyan-400" aria-hidden="true" />;
      case 'Virement':
        return <Building size={14} className="inline text-blue-400" aria-hidden="true" />;
      case 'Chèque':
        return <FileCheck size={14} className="inline text-purple-400" aria-hidden="true" />;
      default:
        return <DollarSign size={14} className="inline text-slate-400" aria-hidden="true" />;
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowAddForm(false);
    resetForm();
  }, [resetForm]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div>
          <h3 className="text-lg font-bold text-white" id="contributions-heading">
            Contributions
          </h3>
          <p className="text-sm text-slate-400">
            Total: <span className="text-green-400 font-bold">{formatMoney(totalContributions)}</span>
          </p>
        </div>
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

      {/* Filters */}
      {contributions.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
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
              className="w-full bg-slate-800/50 text-white pl-10 pr-4 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 text-sm"
              aria-label="Rechercher une contribution"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              pagination.reset();
            }}
            className="bg-slate-800/50 text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-cyan-500 text-sm"
            aria-label="Filtrer par statut"
          >
            <option value="all">Tous les statuts</option>
            <option value="Validée">Validée</option>
            <option value="En attente">En attente</option>
            <option value="Rejetée">Rejetée</option>
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
          className="text-center py-12 border border-dashed border-slate-700 rounded-lg"
          role="status"
        >
          <DollarSign className="mx-auto text-slate-500 mb-3" size={48} aria-hidden="true" />
          <p className="text-slate-400 font-medium">
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
                className="bg-slate-800/40 border-slate-700/50 p-3 hover:border-slate-600 transition-colors"
                role="listitem"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="font-bold text-white text-sm truncate">
                        {escapeHtml(contribution.tontine_membres?.clients?.nom || 'Inconnu')}{' '}
                        {escapeHtml(contribution.tontine_membres?.clients?.prenom || '')}
                      </h4>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${getStatutColor(contribution.statut)}`}
                      >
                        {contribution.statut}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mb-2 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} aria-hidden="true" />
                        {formatDate(contribution.date_contribution)}
                      </span>
                      <span className="flex items-center gap-1 text-slate-300">
                        {getModeIcon(contribution.mode_paiement)}
                        {contribution.mode_paiement}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                      <span className="bg-slate-700/50 px-1.5 py-0.5 rounded text-white font-medium">
                        Tour #{contribution.tour_numero}
                      </span>
                      {contribution.reference_paiement && (
                        <span
                          className="font-mono text-[10px] px-1 bg-slate-800 rounded text-cyan-500/80 truncate max-w-[100px]"
                          title={contribution.reference_paiement}
                        >
                          {escapeHtml(contribution.reference_paiement)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-green-400 text-sm sm:text-base">
                      {formatMoney(contribution.montant)}
                    </div>
                    {contribution.notes && (
                      <div
                        className="text-[10px] text-slate-500 mt-1 max-w-[100px] truncate"
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
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between shrink-0">
              <h2 id="add-contribution-title" className="text-lg font-bold text-white">
                Nouvelle Contribution
              </h2>
              <IconButton icon={X} onClick={handleCloseModal} size="sm" aria-label="Fermer" />
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Error banner */}
              {errors.general && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm" role="alert">
                  {errors.general}
                </div>
              )}

              {/* Member selection */}
              <div>
                <label htmlFor="membre-select" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Membre *
                </label>
                <select
                  id="membre-select"
                  value={formData.membre_id}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, membre_id: e.target.value }));
                    if (errors.membre_id) setErrors((prev) => ({ ...prev, membre_id: undefined }));
                  }}
                  className={`w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border focus:outline-none focus:border-emerald-500 text-sm ${
                    errors.membre_id ? 'border-red-500' : 'border-slate-800'
                  }`}
                  aria-invalid={!!errors.membre_id}
                  aria-describedby={errors.membre_id ? 'membre-error' : undefined}
                >
                  <option value="">Sélectionner...</option>
                  {membres.map((membre) => (
                    <option key={membre.id} value={membre.id}>
                      {escapeHtml(membre.clients?.nom || 'Inconnu')} (Pos. #{membre.position_ordre})
                    </option>
                  ))}
                </select>
                {errors.membre_id && (
                  <p id="membre-error" className="text-red-400 text-xs mt-1" role="alert">
                    {errors.membre_id}
                  </p>
                )}
              </div>

              {/* Amount and Tour */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="montant-input" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Montant (FCFA) *
                  </label>
                  <input
                    id="montant-input"
                    type="number"
                    min="100"
                    max={VALIDATION_LIMITS.MAX_COTISATION}
                    value={formData.montant || ''}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, montant: Number(e.target.value) }));
                      if (errors.montant) setErrors((prev) => ({ ...prev, montant: undefined }));
                    }}
                    className={`w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border focus:outline-none focus:border-emerald-500 text-sm ${
                      errors.montant ? 'border-red-500' : 'border-slate-800'
                    }`}
                    aria-invalid={!!errors.montant}
                    aria-describedby={errors.montant ? 'montant-error' : undefined}
                  />
                  {errors.montant && (
                    <p id="montant-error" className="text-red-400 text-xs mt-1" role="alert">
                      {errors.montant}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="tour-input" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Tour *
                  </label>
                  <input
                    id="tour-input"
                    type="number"
                    min="1"
                    value={formData.tour_numero}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tour_numero: Number(e.target.value) }))}
                    className="w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 text-sm"
                  />
                </div>
              </div>

              {/* Payment mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Mode de paiement *
                </label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Mode de paiement">
                  {PAYMENT_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={formData.mode_paiement === mode}
                      onClick={() => setFormData((prev) => ({ ...prev, mode_paiement: mode }))}
                      className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-medium transition ${
                        formData.mode_paiement === mode
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {getModeIcon(mode)} {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile Money Operator */}
              {formData.mode_paiement === 'Mobile Money' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
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
                            ? `${op.color} border-transparent text-white`
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {op.name}
                      </button>
                    ))}
                  </div>
                  {errors.operateur && (
                    <p className="text-red-400 text-xs mt-1" role="alert">
                      {errors.operateur}
                    </p>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label htmlFor="notes-input" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Notes (optionnel)
                </label>
                <textarea
                  id="notes-input"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-slate-950 text-white px-3 py-2.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 text-sm resize-none"
                  rows={2}
                  maxLength={500}
                  placeholder="Remarques ou informations supplémentaires..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-900/50 shrink-0 flex gap-3">
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
    </div>
  );
}
