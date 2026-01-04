import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, User, DollarSign, Calendar, FileText, Shield, History, TrendingUp } from 'lucide-react';
import { creditApi, clientApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { escapeHtml } from '../../../lib/sanitize';
import { SkeletonCard } from '../../ui/Skeleton';

interface Credit {
  id: string;
  clientId: string;
  montant: string | number;
  taux: string | number;
  soldeRestant: string | number;
  typeCredit?: string;
  objetCredit?: string;
  dateDebut?: string;
  duree?: number;
  echeance?: string;
  statut: string;
  observations?: string;
  garanties?: string;
}

interface Client {
  id: string;
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  score?: number;
  segment?: string;
}

interface CreditDetailModalProps {
  creditId: string;
  onClose: () => void;
}

export default function CreditDetailModal({ creditId, onClose }: CreditDetailModalProps) {
  const [credit, setCredit] = useState<Credit | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger les détails du crédit via api-client
  const loadCreditDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const creditData = await creditApi.getById(creditId);
      setCredit(creditData);

      // Charger les informations du client si disponible
      if (creditData.clientId) {
        try {
          const clientData = await clientApi.getById(creditData.clientId);
          setClient(clientData);
        } catch (clientError) {
          // Ne pas bloquer si le client n'est pas trouvé
          console.warn('Client non trouvé:', clientError);
        }
      }
    } catch (err) {
      const errorMessage = handleApiError(err, 'Erreur lors du chargement du crédit');
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [creditId]);

  useEffect(() => {
    loadCreditDetails();
  }, [loadCreditDetails]);

  // Fermer avec Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Calculs financiers mémorisés
  const financialData = useMemo(() => {
    if (!credit) return null;

    const montant = parseFloat(String(credit.montant)) || 0;
    const taux = parseFloat(String(credit.taux)) || 0;
    const soldeRestant = parseFloat(String(credit.soldeRestant)) || montant;
    const totalAvecInterets = montant * (1 + taux / 100);
    const totalPaye = Math.max(0, totalAvecInterets - soldeRestant);
    const progression = totalAvecInterets > 0 ? ((totalPaye / totalAvecInterets) * 100) : 0;

    return {
      montant,
      taux,
      soldeRestant,
      totalAvecInterets,
      totalPaye,
      progression: Math.min(progression, 100)
    };
  }, [credit]);

  // Nom complet du client mémorisé
  const clientFullName = useMemo(() => {
    if (!client) return 'Client';
    return escapeHtml(`${client.nom} ${client.prenom || ''}`.trim());
  }, [client]);

  // État de chargement avec skeleton
  if (loading) {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Chargement du dossier crédit"
      >
        <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-5xl p-6 space-y-6">
          {/* Header skeleton */}
          <div className="flex justify-between items-center">
            <div>
              <SkeletonCard className="h-8 w-48 mb-2" />
              <SkeletonCard className="h-4 w-32" />
            </div>
            <SkeletonCard className="h-8 w-8 rounded-full" />
          </div>

          {/* Cards skeleton */}
          <div className="grid md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} className="h-24 rounded-lg" />
            ))}
          </div>

          {/* Content skeleton */}
          <div className="grid md:grid-cols-2 gap-6">
            <SkeletonCard className="h-48 rounded-lg" />
            <SkeletonCard className="h-48 rounded-lg" />
          </div>

          {/* Progress skeleton */}
          <SkeletonCard className="h-32 rounded-lg" />
        </div>
      </div>
    );
  }

  // État d'erreur
  if (error || !credit) {
    return (
      <div
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        role="alertdialog"
        aria-modal="true"
        aria-label="Erreur de chargement"
      >
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center max-w-md">
          <p className="text-red-400 mb-4" role="alert">{error || 'Crédit non trouvé'}</p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            aria-label="Fermer la boîte de dialogue"
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  const { montant, taux, soldeRestant, totalAvecInterets, totalPaye, progression } = financialData!;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-detail-title"
    >
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <header className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex justify-between items-center">
          <div>
            <h2 id="credit-detail-title" className="text-2xl font-bold text-white">
              Dossier Crédit
            </h2>
            <p className="text-slate-400 text-sm mt-1">{clientFullName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-700"
            aria-label="Fermer le dossier crédit"
            data-testid="button-close-credit-modal"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        <div className="p-6 space-y-6">
          {/* Cartes de résumé financier */}
          <section aria-label="Résumé financier">
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/50 rounded-lg p-4">
                <div className="text-blue-400 text-sm mb-1">Montant Initial</div>
                <div className="text-2xl font-bold text-white break-words">
                  {formatMoney(montant)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-500/50 rounded-lg p-4">
                <div className="text-emerald-400 text-sm mb-1">Solde Restant</div>
                <div className="text-2xl font-bold text-white break-words">
                  {formatMoney(soldeRestant)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/50 rounded-lg p-4">
                <div className="text-green-400 text-sm mb-1">Total Payé</div>
                <div className="text-2xl font-bold text-white break-words">
                  {formatMoney(totalPaye)}
                </div>
              </div>

              <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 border border-cyan-500/50 rounded-lg p-4">
                <div className="text-cyan-400 text-sm mb-1">Taux d'intérêt</div>
                <div className="text-2xl font-bold text-white break-words">{taux}%</div>
              </div>
            </div>
          </section>

          {/* Informations détaillées */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Section Client */}
            {client && (
              <section
                className="bg-slate-700/50 rounded-lg p-6"
                aria-labelledby="client-section-title"
              >
                <div className="flex items-center gap-2 mb-4">
                  <User className="text-cyan-400" size={20} aria-hidden="true" />
                  <h3 id="client-section-title" className="text-lg font-bold text-white">
                    Client
                  </h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Nom:</dt>
                    <dd className="text-white font-semibold">{clientFullName}</dd>
                  </div>
                  {client.email && (
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Email:</dt>
                      <dd className="text-white">{escapeHtml(client.email)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Téléphone:</dt>
                    <dd className="text-white">{escapeHtml(client.telephone || '-')}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Score:</dt>
                    <dd className="text-green-400 font-bold">{client.score || 50}/100</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Segment:</dt>
                    <dd className="text-cyan-400">{escapeHtml(client.segment || 'Standard')}</dd>
                  </div>
                </dl>
              </section>
            )}

            {/* Section Détails du Crédit */}
            <section
              className="bg-slate-700/50 rounded-lg p-6"
              aria-labelledby="credit-details-title"
            >
              <div className="flex items-center gap-2 mb-4">
                <FileText className="text-blue-400" size={20} aria-hidden="true" />
                <h3 id="credit-details-title" className="text-lg font-bold text-white">
                  Détails du Crédit
                </h3>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Type:</dt>
                  <dd className="text-white">{escapeHtml(credit.typeCredit || 'Personnel')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Objet:</dt>
                  <dd className="text-white">{escapeHtml(credit.objetCredit || '-')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Date début:</dt>
                  <dd className="text-white">
                    {credit.dateDebut
                      ? new Date(credit.dateDebut).toLocaleDateString('fr-FR')
                      : '-'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Durée:</dt>
                  <dd className="text-white">{credit.duree || 0} mois</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Échéance:</dt>
                  <dd className="text-white">{escapeHtml(credit.echeance || 'Mensuel')}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Statut:</dt>
                  <dd className={`font-bold ${
                    credit.statut === 'Soldé' ? 'text-green-400' :
                    credit.statut === 'Approuvé' || credit.statut === 'Actif' ? 'text-cyan-400' :
                    credit.statut === 'En attente' ? 'text-yellow-400' :
                    credit.statut === 'En retard' ? 'text-red-400' :
                    'text-blue-400'
                  }`}>
                    {escapeHtml(credit.statut)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          {/* Section Progression */}
          <section
            className="bg-slate-700/50 rounded-lg p-6"
            aria-labelledby="progression-title"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="text-emerald-400" size={20} aria-hidden="true" />
              <h3 id="progression-title" className="text-lg font-bold text-white">
                Progression du Remboursement
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">Avancement</span>
                  <span className="text-white font-semibold">{progression.toFixed(1)}%</span>
                </div>
                <div
                  className="w-full bg-slate-600 rounded-full h-3"
                  role="progressbar"
                  aria-valuenow={progression}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progression du remboursement: ${progression.toFixed(1)}%`}
                >
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progression}%` }}
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4 mt-4">
                <div className="bg-slate-600/50 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs">Montant Total</p>
                  <p className="text-white font-bold">{formatMoney(totalAvecInterets)}</p>
                </div>
                <div className="bg-slate-600/50 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs">Déjà Remboursé</p>
                  <p className="text-green-400 font-bold">{formatMoney(totalPaye)}</p>
                </div>
                <div className="bg-slate-600/50 rounded-lg p-3 text-center">
                  <p className="text-slate-400 text-xs">Reste à Payer</p>
                  <p className="text-yellow-400 font-bold">{formatMoney(soldeRestant)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section Observations */}
          {credit.observations && (
            <section
              className="bg-slate-700/50 rounded-lg p-6"
              aria-labelledby="observations-title"
            >
              <div className="flex items-center gap-2 mb-4">
                <FileText className="text-blue-400" size={20} aria-hidden="true" />
                <h3 id="observations-title" className="text-lg font-bold text-white">
                  Observations
                </h3>
              </div>
              <p className="text-slate-300 whitespace-pre-wrap">
                {escapeHtml(credit.observations)}
              </p>
            </section>
          )}

          {/* Section Garanties */}
          {credit.garanties && (
            <section
              className="bg-slate-700/50 rounded-lg p-6"
              aria-labelledby="garanties-title"
            >
              <div className="flex items-center gap-2 mb-4">
                <Shield className="text-cyan-400" size={20} aria-hidden="true" />
                <h3 id="garanties-title" className="text-lg font-bold text-white">
                  Garanties
                </h3>
              </div>
              <p className="text-slate-300 whitespace-pre-wrap">
                {escapeHtml(credit.garanties)}
              </p>
            </section>
          )}
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 bg-slate-800 border-t border-slate-700 p-6">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
            data-testid="button-close-credit-detail"
            aria-label="Fermer le dossier crédit"
          >
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
}
