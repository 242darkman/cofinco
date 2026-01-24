import React from 'react';
import { X, User, DollarSign, Briefcase, FileText, CheckCircle, XCircle, TrendingDown, Eye } from 'lucide-react';
import { EnqueteCredit } from '../../../hooks/credits/useEnquetes';
import { Badge } from '../../ui';

interface EnqueteDetailModalProps {
  enquete: EnqueteCredit & {
    description_activite?: string;
    anciennete_activite?: number;
    revenu_mensuel_declare?: number;
    charges_mensuelles?: number;
    garanties_proposees?: any[];
    photos_activite?: string[];
    evaluateur_id?: string;
    commentaire_evaluateur?: string;
    viabilite_activite?: string;
    risque_estime?: string;
    recommandation_evaluateur?: string;
    montant_recommande?: number;
    type_revenu?: string;
    revenu_journalier?: number;
    jours_travail_mois?: number;
    motif_rejet?: string;
  };
  onClose: () => void;
}

export default function EnqueteDetailModal({ enquete, onClose }: EnqueteDetailModalProps) {
  const chargesMensuelles = enquete.charges_mensuelles || 0;
  const revenuMensuel = enquete.revenu_mensuel_declare || enquete.revenus_mensuels || 0;
  const capaciteRemboursement = (revenuMensuel - chargesMensuelles) * 0.4;
  
  const getRisqueColor = (risque?: string) => {
    switch (risque) {
      case 'tres_faible': return 'text-green-400 bg-green-500/20';
      case 'faible': return 'text-blue-400 bg-blue-500/20';
      case 'moyen': return 'text-cyan-400 bg-cyan-500/20';
      case 'eleve': return 'text-emerald-400 bg-emerald-500/20';
      case 'tres_eleve': return 'text-blue-400 bg-blue-500/20';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getViabiliteColor = (viabilite?: string) => {
    switch (viabilite) {
      case 'excellente': return 'text-green-400';
      case 'bonne': return 'text-blue-400';
      case 'moyenne': return 'text-cyan-400';
      case 'faible': return 'text-emerald-400';
      case 'tres_faible': return 'text-blue-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <FileText className="text-cyan-400" />
              Détails Enquête Crédit
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
          {/* Status Banner */}
          <div className="flex items-center justify-between bg-slate-800/50 p-4 rounded-lg border border-slate-700">
             <div>
                <span className="text-slate-400 text-sm block">Statut Actuel</span>
                <Badge variant={
                    enquete.statut === 'APPROVED' ? 'success' :
                    enquete.statut === 'REJECTED' ? 'danger' :
                    enquete.statut === 'REDUCED' ? 'warning' : 'neutral'
                }
                value={enquete.statut}
                />
             </div>
          </div>

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
                {enquete.montant_approuve && (
                    <div className="flex justify-between items-center p-2 bg-green-500/10 rounded border border-green-500/30">
                      <span className="text-green-300 font-semibold">Montant approuvé:</span>
                      <span className="text-green-400 font-bold text-lg">{(enquete.montant_approuve || 0).toLocaleString()} FCFA</span>
                    </div>
                )}
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
                <div className="flex justify-between items-center p-2 bg-blue-500/10 rounded border border-blue-500/30">
                  <span className="text-blue-300 font-semibold">Capacité remboursement:</span>
                  <span className="text-blue-400 font-bold">{capaciteRemboursement.toLocaleString()} FCFA/mois</span>
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
                  <p className="text-slate-300 mt-1 text-xs leading-relaxed">{enquete.description_activite || 'Aucune description'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Ancienneté:</span>
                  <p className="text-white font-medium mt-1">{enquete.anciennete_activite ? `${enquete.anciennete_activite} mois` : 'Non renseignée'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Évaluation Terrain */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileText size={20} className="text-cyan-400" />
                Évaluation Agent Terrain
              </h3>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <span className="text-slate-400 text-sm">Viabilité activité:</span>
                  <p className={`font-bold mt-1 ${getViabiliteColor(enquete.viabilite_activite)}`}>
                    {enquete.viabilite_activite?.toUpperCase().replace('_', ' ') || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Risque estimé:</span>
                  <p className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-1 ${getRisqueColor(enquete.risque_estime)}`}>
                    {enquete.risque_estime?.toUpperCase().replace('_', ' ') || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-sm">Recommandation Agent:</span>
                  <p className="text-white font-bold mt-1">{enquete.recommandation_evaluateur?.toUpperCase() || '-'}</p>
                </div>
              </div>
              
              {enquete.commentaire_evaluateur && (
                <div className="bg-slate-900/50 rounded p-3 mb-4">
                    <span className="text-slate-400 text-sm">Commentaire Agent:</span>
                    <p className="text-slate-300 mt-2 text-sm leading-relaxed">{enquete.commentaire_evaluateur}</p>
                </div>
              )}

              {enquete.recommandation && (
                <div className="bg-slate-900/50 rounded p-3 border-l-4 border-cyan-500">
                    <span className="text-cyan-400 text-sm font-semibold">Note / Décision Finale:</span>
                    <p className="text-white mt-1 text-sm">{enquete.recommandation}</p>
                </div>
              )}
          </div>

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
        </div>
      </div>
    </div>
  );
}
