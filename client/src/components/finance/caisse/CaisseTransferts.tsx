import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, ArrowRight, ArrowRightLeft, Plus, CheckCircle, Clock, X, AlertTriangle, Send, Wallet } from 'lucide-react';
import { usePermissions } from '../../auth/ProtectedFeature';
import { Button, Card, Badge } from '@/components/ui';
import { caisseTransfertApi, agenceApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';

interface Transfert {
  id: string;
  reference: string;
  montant: number;
  motif: string;
  statut: string;
  dateCreation: string;
  dateReception?: string;
  observations: string;
  agenceSourceId: string;
  agenceDestId: string;
  agenceSource?: { id: string; nom: string };
  agenceDest?: { id: string; nom: string };
}

interface CaisseTransfertsProps {
  onBack: () => void;
  session: any;
  soldeActuel: number;
}

export default function CaisseTransferts({ onBack, session, soldeActuel }: CaisseTransfertsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateTransferts = hasPermission('caisse', 'create') || hasPermission('transferts', 'create');
  const canConfirmTransferts = hasPermission('caisse', 'edit') || hasPermission('transferts', 'edit') || hasPermission('caisse', 'manage');
  const canCancelTransferts = hasPermission('caisse', 'edit') || hasPermission('transferts', 'delete') || hasPermission('caisse', 'manage');

  // State
  const [transferts, setTransferts] = useState<Transfert[]>([]);
  const [agences, setAgences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'receive' | 'cancel'; transfert: Transfert } | null>(null);
  const [montantError, setMontantError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    session_id: session?.id || '',
    agence_dest_id: '',
    montant: '',
    motif: '',
    observations: ''
  });

  // Chargement initial
  useEffect(() => {
    loadInitialData();

    const handleRealTimeUpdate = () => {
      loadTransferts();
    };

    window.addEventListener('caisse-update', handleRealTimeUpdate);
    return () => window.removeEventListener('caisse-update', handleRealTimeUpdate);
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadTransferts(), loadAgences()]);
    setLoading(false);
  }, []);

  const loadAgences = useCallback(async () => {
    try {
      const data = await agenceApi.getAll();
      setAgences(data || []);
    } catch (error) {
      console.error('Error loading agences', error);
      setAgences([]);
    }
  }, []);

  const loadTransferts = useCallback(async () => {
    try {
      const data = await caisseTransfertApi.getAll();
      setTransferts(data || []);
    } catch (error) {
      console.error('Erreur:', error);
      setTransferts([]);
    }
  }, []);

  // Validation du montant
  const validateMontant = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setMontantError('Le montant doit être supérieur à 0');
      return false;
    }
    if (numValue > soldeActuel) {
      setMontantError(`Solde insuffisant (disponible: ${formatMoney(soldeActuel)})`);
      return false;
    }
    if (numValue > VALIDATION_LIMITS.MAX_AMOUNT) {
      setMontantError(`Le montant ne peut pas dépasser ${formatMoney(VALIDATION_LIMITS.MAX_AMOUNT)}`);
      return false;
    }
    setMontantError(null);
    return true;
  }, [soldeActuel]);

  // Génération de référence
  const genererReference = useCallback(() => {
    const date = new Date();
    return `TRF${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  }, []);

  // Soumission du formulaire
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session) {
      toast.error('Session fermée ou invalide');
      return;
    }

    if (!formData.agence_dest_id) {
      toast.warning('Veuillez sélectionner une agence destinataire');
      return;
    }

    if (!validateMontant(formData.montant)) {
      return;
    }

    setLoading(true);
    const loadingId = toast.loading('Création du transfert...');

    try {
      await caisseTransfertApi.create({
        sessionId: session.id,
        agenceDestId: formData.agence_dest_id,
        montant: Number(formData.montant),
        motif: sanitizeInput(formData.motif),
        observations: sanitizeInput(formData.observations),
        reference: genererReference(),
        statut: 'en_attente'
      });

      toast.dismiss(loadingId);
      toast.success('Transfert initié avec succès');
      setSuccessMsg('Transfert initié avec succès');
      setTimeout(() => setSuccessMsg(''), 3000);

      setShowForm(false);
      loadTransferts();
      setFormData(prev => ({ ...prev, montant: '', motif: '', observations: '', agence_dest_id: '' }));
      setMontantError(null);

      window.dispatchEvent(new CustomEvent('caisse-update'));
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de la création du transfert');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [session, formData, validateMontant, genererReference, loadTransferts]);

  // Préparer l'action de réception
  const prepareReception = useCallback((transfert: Transfert) => {
    setPendingAction({ type: 'receive', transfert });
    setShowConfirmDialog(true);
  }, []);

  // Préparer l'action d'annulation
  const prepareAnnulation = useCallback((transfert: Transfert) => {
    setPendingAction({ type: 'cancel', transfert });
    setShowConfirmDialog(true);
  }, []);

  // Exécuter l'action en attente
  const executeAction = useCallback(async () => {
    if (!pendingAction) return;

    setShowConfirmDialog(false);
    setLoading(true);

    const loadingId = toast.loading(
      pendingAction.type === 'receive' ? 'Confirmation de la réception...' : 'Annulation du transfert...'
    );

    try {
      if (pendingAction.type === 'receive') {
        await caisseTransfertApi.receive(pendingAction.transfert.id);
        toast.dismiss(loadingId);
        toast.success('Transfert reçu avec succès');
      } else {
        await caisseTransfertApi.cancel(pendingAction.transfert.id);
        toast.dismiss(loadingId);
        toast.success('Transfert annulé');
      }

      loadTransferts();
      window.dispatchEvent(new CustomEvent('caisse-update'));
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de l\'opération');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  }, [pendingAction, loadTransferts]);

  // Direction du transfert
  const getDirection = useCallback((t: Transfert) => {
    if (t.agenceSourceId === session?.agenceId) return 'OUT';
    if (t.agenceDestId === session?.agenceId) return 'IN';
    return 'UNKNOWN';
  }, [session?.agenceId]);

  // Statistiques mémorisées
  const stats = useMemo(() => ({
    total: transferts.length,
    enAttente: transferts.filter(t => t.statut === 'en_attente').length,
    montantTotal: transferts
      .filter(t => t.statut === 'valide')
      .reduce((sum, t) => sum + (Number(t.montant) || 0), 0)
  }), [transferts]);

  // Message de confirmation mémorisé
  const confirmationMessage = useMemo(() => {
    if (!pendingAction) return '';
    const { type, transfert } = pendingAction;
    if (type === 'receive') {
      return `Confirmer la réception de ${formatMoney(Number(transfert.montant))} de ${escapeHtml(transfert.agenceSource?.nom || 'l\'agence source')} ?`;
    }
    return `Êtes-vous sûr de vouloir annuler ce transfert de ${formatMoney(Number(transfert.montant))} ?`;
  }, [pendingAction]);

  // État de chargement
  if (loading && transferts.length === 0) {
    return (
      <div className="space-y-6" role="status" aria-label="Chargement des transferts">
        <div className="flex items-center gap-3">
          <SkeletonCard className="h-10 w-10 rounded-full" />
          <div>
            <SkeletonCard className="h-6 w-48 mb-2" />
            <SkeletonCard className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <SkeletonCard key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <SkeletonCard className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="rounded-full hover:bg-slate-800 text-slate-400 h-10 w-10 p-0"
            aria-label="Retour"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </Button>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Transferts Inter-Caisses
            </h2>
            <p className="text-sm text-slate-400">Gérez les flux entre vos agences</p>
          </div>
        </div>

        {canCreateTransferts && (
          <Button
            onClick={() => setShowForm(true)}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
            aria-label="Créer un nouveau transfert"
          >
            <Plus size={18} className="mr-2" aria-hidden="true" />
            Nouveau Transfert
          </Button>
        )}
      </header>

      {/* Success Message */}
      {successMsg && (
        <div
          className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2"
          role="status"
          aria-live="polite"
        >
          <CheckCircle size={18} aria-hidden="true" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {/* Stats Cards */}
      <section aria-label="Statistiques des transferts">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <Card className="p-4 bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <ArrowRightLeft size={18} className="text-indigo-400" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-slate-400">Total Transferts</p>
            </div>
            <p className="text-3xl font-bold text-white">{stats.total}</p>
          </Card>

          <Card className="p-4 bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Clock size={18} className="text-amber-400" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-slate-400">En Attente</p>
            </div>
            <p className="text-3xl font-bold text-amber-400">{stats.enAttente}</p>
          </Card>

          <Card className="p-4 bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Wallet size={18} className="text-emerald-400" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-slate-400">Volume Reçu</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-400 truncate">
              {formatMoney(stats.montantTotal)}
            </p>
          </Card>
        </div>
      </section>

      {/* Responsive List / Table */}
      <Card className="bg-slate-900/50 border-slate-800 overflow-hidden backdrop-blur-sm">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">Historique Récent</h3>
        </div>

        {/* Mobile View: Cards List */}
        <div className="md:hidden divide-y divide-slate-800">
          {transferts.length === 0 ? (
            <div className="p-8 text-center text-slate-500" role="status">
              <ArrowRightLeft size={32} className="mx-auto mb-2 opacity-50" aria-hidden="true" />
              <p>Aucun transfert</p>
            </div>
          ) : (
            transferts.map((t) => (
              <article key={t.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="bg-slate-800 px-2 py-1 rounded text-xs font-mono text-slate-400">
                    {escapeHtml(t.reference)}
                  </div>
                  <Badge
                    value={t.statut}
                    variant={
                      t.statut === 'valide' ? 'success' :
                      t.statut === 'en_attente' ? 'warning' : 'neutral'
                    }
                  />
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="font-medium text-slate-400">
                    {escapeHtml(t.agenceSource?.nom || 'Agence Source')}
                  </span>
                  <ArrowRight size={14} className="text-slate-600" aria-hidden="true" />
                  <span className="font-medium text-white">
                    {escapeHtml(t.agenceDest?.nom || 'Agence Dest')}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xl font-bold text-white">
                    {formatMoney(Number(t.montant))}
                  </p>
                  <time className="text-right text-xs text-slate-500" dateTime={t.dateCreation}>
                    {new Date(t.dateCreation).toLocaleDateString('fr-FR')}
                  </time>
                </div>

                {t.statut === 'en_attente' && (
                  <div className="flex gap-2 pt-2">
                    {canConfirmTransferts && getDirection(t) === 'IN' && (
                      <Button
                        size="sm"
                        onClick={() => prepareReception(t)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-9"
                        aria-label={`Confirmer la réception de ${formatMoney(Number(t.montant))}`}
                      >
                        Confirmer
                      </Button>
                    )}
                    {canCancelTransferts && getDirection(t) === 'OUT' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => prepareAnnulation(t)}
                        className="flex-1 border-slate-700 hover:bg-slate-800 text-slate-300 h-9"
                        aria-label={`Annuler le transfert de ${formatMoney(Number(t.montant))}`}
                      >
                        Annuler
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left" aria-label="Liste des transferts">
            <thead className="bg-slate-800/50 text-slate-400 font-medium border-b border-slate-700">
              <tr>
                <th scope="col" className="px-6 py-4">Référence</th>
                <th scope="col" className="px-6 py-4">Trajet</th>
                <th scope="col" className="px-6 py-4 text-right">Montant</th>
                <th scope="col" className="px-6 py-4">Date</th>
                <th scope="col" className="px-6 py-4">Statut</th>
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {transferts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Aucun transfert enregistré
                  </td>
                </tr>
              ) : (
                transferts.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-400 text-xs">
                      {escapeHtml(t.reference)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">
                          {escapeHtml(t.agenceSource?.nom || 'Agence Source')}
                        </span>
                        <ArrowRight size={14} className="text-slate-600" aria-hidden="true" />
                        <span className="text-white font-medium">
                          {escapeHtml(t.agenceDest?.nom || 'Agence Dest')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-white">
                      {formatMoney(Number(t.montant))}
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      <time dateTime={t.dateCreation}>
                        {new Date(t.dateCreation).toLocaleDateString('fr-FR')}
                      </time>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        value={t.statut}
                        variant={
                          t.statut === 'valide' ? 'success' :
                          t.statut === 'en_attente' ? 'warning' : 'neutral'
                        }
                      />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {t.statut === 'en_attente' && (
                        <div className="flex items-center justify-end gap-2">
                          {canConfirmTransferts && getDirection(t) === 'IN' && (
                            <Button
                              size="sm"
                              onClick={() => prepareReception(t)}
                              className="h-8 bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 shadow-none border border-emerald-500/20"
                              aria-label={`Confirmer la réception de ${formatMoney(Number(t.montant))}`}
                            >
                              Reçu
                            </Button>
                          )}
                          {canCancelTransferts && getDirection(t) === 'OUT' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => prepareAnnulation(t)}
                              className="h-8 w-8 p-0 flex items-center justify-center text-slate-400 hover:bg-slate-800 rounded-full"
                              aria-label={`Annuler le transfert de ${formatMoney(Number(t.montant))}`}
                            >
                              <X size={14} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Transfer Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-transfer-title"
        >
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg max-h-[90vh] sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-5">
            <header className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-10 rounded-t-2xl">
              <div>
                <h3 id="new-transfer-title" className="text-lg font-bold text-white">
                  Nouveau Transfert
                </h3>
                <p className="text-xs text-slate-400">Initier un mouvement de fonds</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setMontantError(null);
                }}
                className="rounded-full text-slate-400 hover:text-white h-10 w-10 p-0"
                aria-label="Fermer"
              >
                <X size={20} aria-hidden="true" />
              </Button>
            </header>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="agence-dest"
                    className="text-xs font-semibold text-indigo-400 uppercase"
                  >
                    Agence Destination
                  </label>
                  <select
                    id="agence-dest"
                    value={formData.agence_dest_id}
                    onChange={(e) => setFormData({ ...formData, agence_dest_id: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    required
                    aria-required="true"
                  >
                    <option value="">Sélectionner une agence...</option>
                    {agences.filter(a => a.id !== session?.agenceId).map(agence => (
                      <option key={agence.id} value={agence.id}>
                        {escapeHtml(agence.nom)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="montant-transfert"
                    className="text-xs font-semibold text-slate-400 uppercase"
                  >
                    Montant (FCFA)
                  </label>
                  <div className="relative">
                    <input
                      id="montant-transfert"
                      type="number"
                      value={formData.montant}
                      onChange={(e) => {
                        setFormData({ ...formData, montant: e.target.value });
                        if (e.target.value) validateMontant(e.target.value);
                      }}
                      className={`w-full pl-4 pr-12 py-3 bg-slate-950 border rounded-xl text-lg font-bold text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all ${
                        montantError ? 'border-red-500' : 'border-slate-700'
                      }`}
                      min="0"
                      placeholder="0"
                      required
                      aria-required="true"
                      aria-invalid={!!montantError}
                      aria-describedby={montantError ? 'montant-error' : 'solde-info'}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">
                      FCFA
                    </span>
                  </div>
                  {montantError ? (
                    <p id="montant-error" className="text-xs text-red-400" role="alert">
                      {montantError}
                    </p>
                  ) : (
                    <p id="solde-info" className="text-xs text-right text-emerald-500/80">
                      Solde dispo: {formatMoney(soldeActuel)}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="motif-transfert"
                    className="text-xs font-semibold text-slate-400 uppercase"
                  >
                    Motif
                  </label>
                  <input
                    id="motif-transfert"
                    type="text"
                    value={formData.motif}
                    onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="Ex: Approvisionnement caisse secondaire..."
                    required
                    aria-required="true"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="observations-transfert"
                    className="text-xs font-semibold text-slate-400 uppercase"
                  >
                    Observations
                  </label>
                  <textarea
                    id="observations-transfert"
                    value={formData.observations}
                    onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
                    rows={3}
                    placeholder="Notes optionnelles..."
                  />
                </div>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setMontantError(null);
                  }}
                  className="w-full border-slate-700 hover:bg-slate-800 text-slate-300"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !!montantError}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                >
                  {loading ? (
                    'Traitement...'
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Send size={18} aria-hidden="true" /> Valider
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title={pendingAction?.type === 'receive' ? 'Confirmer la réception' : 'Annuler le transfert'}
        message={confirmationMessage}
        onConfirm={executeAction}
        onClose={() => {
          setShowConfirmDialog(false);
          setPendingAction(null);
        }}
        variant={pendingAction?.type === 'cancel' ? 'danger' : 'success'}
        confirmText={pendingAction?.type === 'receive' ? 'Confirmer' : 'Annuler le transfert'}
        cancelText="Retour"
      />
    </div>
  );
}
