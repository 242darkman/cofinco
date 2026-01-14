import React, { useState } from 'react';
import { X, Save, CheckCircle, XCircle, AlertTriangle, DollarSign, TrendingDown, FileText, User, Phone, MapPin, Briefcase, Loader2 } from 'lucide-react';

import { EnqueteCredit } from '../../../hooks/credits/useEnquetes';

interface Enquete extends EnqueteCredit {
  // Add properties that might be missing in EnqueteCredit but used here
  description_activite?: string;
  anciennete_activite?: number;
  revenu_mensuel_declare?: number;
  charges_mensuelles?: number;
  garanties_proposees?: any[];
  photos_activite?: string[];
  // Evaluation fields
  evaluateur_id?: string;
  commentaire_evaluateur?: string;
  viabilite_activite?: string;
  risque_estime?: string;
  recommandation_evaluateur?: string;
  montant_recommande?: number;
  type_revenu?: string;
  revenu_journalier?: number;
  jours_travail_mois?: number;
}

interface EnqueteCreditValidationProps {
  enquete: Enquete;
  onClose: () => void;
  onValidate: (decision: 'approuve' | 'rejete' | 'reduit', montantApprouve?: number, commentaire?: string, raison?: string) => void;
}

export default function EnqueteCreditValidation({ enquete, onClose, onValidate }: EnqueteCreditValidationProps) {
  const [decision, setDecision] = useState<'approuve' | 'rejete' | 'reduit' | null>(null);
  const [montantApprouve, setMontantApprouve] = useState(enquete.montant_recommande || enquete.montant_demande);
  const [commentaire, setCommentaire] = useState('');
  const [raisonRefus, setRaisonRefus] = useState('');
  const [raisonReduction, setRaisonReduction] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const chargesMensuelles = enquete.charges_mensuelles || 0;
  const revenuMensuel = enquete.revenu_mensuel_declare || enquete.revenus_mensuels || 0;
  const joursTravailes = enquete.jours_travail_mois || 26;

  // Formule microfinance stricte: Capacité = 35% du revenu journalier
  // Si revenu journalier fourni, l'utiliser directement
  // Sinon, calculer depuis le revenu mensuel
  const revenuJournalier = enquete.revenu_journalier || (revenuMensuel / joursTravailes);

  // Capacité de remboursement journalière = strictement 35% du revenu journalier
  const capaciteRemboursementJournaliere = revenuJournalier * 0.35;

  // Capacité mensuelle = capacité journalière × nombre de jours travaillés
  const capaciteRemboursement = capaciteRemboursementJournaliere * joursTravailes;

  // Montant max recommandé = capacité mensuelle
  const montantMaxRecommande = capaciteRemboursement;

  const handleSubmit = async () => {
    if (!decision) return;
    if (submitting) return; // Prevent double submission
    
    setSubmitting(true);
    try {
      const montant = decision === 'approuve' ? montantApprouve : decision === 'reduit' ? montantApprouve : undefined;
      const raison = decision === 'rejete' ? raisonRefus : decision === 'reduit' ? raisonReduction : undefined;

      await onValidate(decision, montant, commentaire, raison);
    } finally {
      setSubmitting(false);
    }
  };

  const getRisqueColor = (risque?: string) => {
    switch (risque) {
      case 'tres_faible':
        return 'text-green-400 bg-green-500/20';
      case 'faible':
        return 'text-blue-400 bg-blue-500/20';
      case 'moyen':
        return 'text-cyan-400 bg-cyan-500/20';
      case 'eleve':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'tres_eleve':
        return 'text-blue-400 bg-blue-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getViabiliteColor = (viabilite?: string) => {
    switch (viabilite) {
      case 'excellente':
        return 'text-green-400';
      case 'bonne':
        return 'text-blue-400';
      case 'moyenne':
        return 'text-cyan-400';
      case 'faible':
        return 'text-emerald-400';
      case 'tres_faible':
        return 'text-blue-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-white">
              Validation Enquête Crédit
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Demande #{enquete.id.slice(0, 8)} - {enquete.clients?.nom} {enquete.clients?.prenom}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Informations Client */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <User size={20} className="text-cyan-400" />
              Informations Client
            </h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400">Nom complet:</span>
                <p className="text-white font-medium">{enquete.clients?.nom} {enquete.clients?.prenom}</p>
              </div>
              <div>
                <span className="text-slate-400">Téléphone:</span>
                <p className="text-white font-medium">{enquete.clients?.telephone}</p>
              </div>
              <div>
                <span className="text-slate-400">Adresse:</span>
                <p className="text-white font-medium">{enquete.clients?.adresse_domicile || 'Non renseignée'}</p>
              </div>
              <div>
                <span className="text-slate-400">Profession:</span>
                <p className="text-white font-medium">{enquete.clients?.profession || 'Non renseignée'}</p>
              </div>
            </div>
          </div>

          {/* Détails Demande */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <DollarSign size={20} className="text-green-400" />
                Détails Financiers
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center p-2 bg-slate-900/50 rounded">
                  <span className="text-slate-400">Montant demandé:</span>
                  <span className="text-white font-bold text-lg">{(enquete.montant_demande || 0).toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-900/50 rounded">
                  <span className="text-slate-400">Revenu mensuel:</span>
                  <div className="text-right">
                    <span className="text-green-400 font-medium">{(enquete.revenu_mensuel_declare || enquete.revenus_mensuels || 0).toLocaleString()} FCFA</span>
                    {enquete.type_revenu === 'Journalier' && (
                      <p className="text-[10px] text-green-300/60 italic">
                        {(enquete.revenu_journalier || 0).toLocaleString()} FCFA/j x {enquete.jours_travail_mois || 26}j
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-900/50 rounded">
                  <span className="text-slate-400">Charges mensuelles:</span>
                  <span className="text-blue-400 font-medium">{(enquete.charges_mensuelles || 0).toLocaleString()} FCFA</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-amber-500/10 rounded border border-amber-500/30">
                  <span className="text-amber-300 font-semibold">Capacité journalière (35%):</span>
                  <div className="text-right">
                    <span className="text-amber-400 font-bold">{Math.round(capaciteRemboursementJournaliere).toLocaleString()} FCFA/jour</span>
                    <p className="text-[10px] text-amber-300/60 italic">
                      = {Math.round(revenuJournalier).toLocaleString()} × 35%
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center p-2 bg-blue-500/10 rounded border border-blue-500/30">
                  <span className="text-blue-300 font-semibold">Capacité mensuelle:</span>
                  <span className="text-blue-400 font-bold">{Math.round(capaciteRemboursement).toLocaleString()} FCFA/mois</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-cyan-500/10 rounded border border-cyan-500/30">
                  <span className="text-cyan-300 font-semibold">Montant max recommandé:</span>
                  <span className="text-cyan-400 font-bold">{Math.round(montantMaxRecommande).toLocaleString()} FCFA</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Briefcase size={20} className="text-emerald-400" />
                Activité Économique
              </h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-slate-400">Type d'activité:</span>
                  <p className="text-white font-medium mt-1">{enquete.type_activite}</p>
                </div>
                <div>
                  <span className="text-slate-400">Description:</span>
                  <p className="text-slate-300 mt-1 text-xs leading-relaxed">{enquete.description_activite}</p>
                </div>
                <div>
                  <span className="text-slate-400">Ancienneté:</span>
                  <p className="text-white font-medium mt-1">{enquete.anciennete_activite ? `${enquete.anciennete_activite} mois` : 'Non renseignée'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Évaluation Terrain */}
          {enquete.commentaire_evaluateur && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileText size={20} className="text-cyan-400" />
                Évaluation Agent Terrain
              </h3>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <span className="text-slate-400 text-sm">Viabilité activité:</span>
                  <p className={`font-bold mt-1 ${getViabiliteColor(enquete.viabilite_activite)}`}>
                    {enquete.viabilite_activite?.toUpperCase().replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Risque estimé:</span>
                  <p className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-1 ${getRisqueColor(enquete.risque_estime)}`}>
                    {enquete.risque_estime?.toUpperCase().replace('_', ' ')}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Recommandation:</span>
                  <p className="text-white font-bold mt-1">{enquete.recommandation_evaluateur?.toUpperCase()}</p>
                </div>
              </div>
              {enquete.montant_recommande && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 mb-4">
                  <span className="text-blue-300 text-sm">Montant recommandé par l'agent:</span>
                  <p className="text-blue-400 font-bold text-lg">{(enquete.montant_recommande || 0).toLocaleString()} FCFA</p>
                </div>
              )}
              <div className="bg-slate-900/50 rounded p-3">
                <span className="text-slate-400 text-sm">Commentaire:</span>
                <p className="text-slate-300 mt-2 text-sm leading-relaxed">{enquete.commentaire_evaluateur}</p>
              </div>
            </div>
          )}

          {/* Garanties */}
          {(enquete.garanties_proposees?.length || 0) > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4">Garanties Proposées</h3>
              <div className="space-y-2">
                {enquete.garanties_proposees?.map((garantie, index) => (
                  <div key={index} className="bg-slate-900/50 rounded p-3 flex justify-between items-center">
                    <div>
                      <span className="text-white font-medium">{garantie.type}</span>
                      <p className="text-slate-400 text-sm mt-1">{garantie.description}</p>
                    </div>
                    {garantie.valeur && (
                      <span className="text-green-400 font-bold">{parseInt(garantie.valeur || '0').toLocaleString()} FCFA</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photos Activité */}
          {(enquete.photos_activite?.length || 0) > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4">Photos de l'Activité</h3>
              <div className="grid grid-cols-4 gap-4">
                {enquete.photos_activite?.map((photo, index) => (
                  <div key={index} className="aspect-square rounded-lg overflow-hidden">
                    <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Décision */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg p-6 border-2 border-cyan-500/30">
            <h3 className="text-xl font-bold text-white mb-6">Décision du Responsable Crédit</h3>

            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => setDecision('approuve')}
                className={`p-4 rounded-lg border-2 transition ${
                  decision === 'approuve'
                    ? 'border-green-500 bg-green-500/20'
                    : 'border-slate-600 bg-slate-800/50 hover:border-green-500/50'
                }`}
              >
                <CheckCircle className={`mx-auto mb-2 ${decision === 'approuve' ? 'text-green-400' : 'text-slate-400'}`} size={32} />
                <p className={`font-semibold ${decision === 'approuve' ? 'text-green-400' : 'text-slate-300'}`}>Approuver</p>
                <p className="text-xs text-slate-500 mt-1">Accorder le crédit</p>
              </button>

              <button
                onClick={() => setDecision('reduit')}
                className={`p-4 rounded-lg border-2 transition ${
                  decision === 'reduit'
                    ? 'border-cyan-500 bg-cyan-500/20'
                    : 'border-slate-600 bg-slate-800/50 hover:border-cyan-500/50'
                }`}
              >
                <TrendingDown className={`mx-auto mb-2 ${decision === 'reduit' ? 'text-cyan-400' : 'text-slate-400'}`} size={32} />
                <p className={`font-semibold ${decision === 'reduit' ? 'text-cyan-400' : 'text-slate-300'}`}>Réduire</p>
                <p className="text-xs text-slate-500 mt-1">Montant inférieur</p>
              </button>

              <button
                onClick={() => setDecision('rejete')}
                className={`p-4 rounded-lg border-2 transition ${
                  decision === 'rejete'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-slate-600 bg-slate-800/50 hover:border-blue-500/50'
                }`}
              >
                <XCircle className={`mx-auto mb-2 ${decision === 'rejete' ? 'text-blue-400' : 'text-slate-400'}`} size={32} />
                <p className={`font-semibold ${decision === 'rejete' ? 'text-blue-400' : 'text-slate-300'}`}>Rejeter</p>
                <p className="text-xs text-slate-500 mt-1">Refuser le crédit</p>
              </button>
            </div>

            {decision === 'approuve' && (
              <div className="space-y-4 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div>
                  <label className="block text-sm font-semibold text-green-300 mb-2">
                    Montant approuvé (FCFA)
                  </label>
                  <input
                    type="number"
                    value={montantApprouve}
                    onChange={(e) => setMontantApprouve(parseFloat(e.target.value))}
                    className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}

            {decision === 'reduit' && (
              <div className="space-y-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                <div>
                  <label className="block text-sm font-semibold text-cyan-300 mb-2">
                    Nouveau montant (FCFA)
                  </label>
                  <input
                    type="number"
                    value={montantApprouve}
                    onChange={(e) => setMontantApprouve(parseFloat(e.target.value))}
                    max={enquete.montant_demande}
                    className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-cyan-400 mt-1">
                    Réduction de {((enquete.montant_demande || 0) - montantApprouve).toLocaleString()} FCFA
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cyan-300 mb-2">
                    Raison de la réduction
                  </label>
                  <textarea
                    value={raisonReduction}
                    onChange={(e) => setRaisonReduction(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="Expliquez pourquoi le montant est réduit..."
                  />
                </div>
              </div>
            )}

            {decision === 'rejete' && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <label className="block text-sm font-semibold text-blue-300 mb-2">
                  Raison du refus
                </label>
                <textarea
                  value={raisonRefus}
                  onChange={(e) => setRaisonRefus(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Expliquez pourquoi le crédit est refusé..."
                />
              </div>
            )}

            {decision && (
              <div className="mt-4">
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  Commentaire additionnel
                </label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="Ajoutez des commentaires supplémentaires..."
                />
              </div>
            )}
          </div>

          {/* Boutons Actions */}
          <div className="flex gap-4 pt-4 border-t border-slate-700">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={!decision || submitting}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition ${
                decision && !submitting
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-600 hover:to-blue-600'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <><Loader2 size={20} className="animate-spin" /> Validation en cours...</>
              ) : (
                <><Save size={20} /> Valider la Décision</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
