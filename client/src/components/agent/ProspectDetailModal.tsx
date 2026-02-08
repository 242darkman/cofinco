import React, { useState, useEffect } from 'react';
import { Loader2, UserCheck, ArrowRight, Phone, MapPin, Briefcase, AlertTriangle, Activity, FileText, DollarSign, User } from 'lucide-react';
import { prospectionApi } from '../../lib/api-client';
import { toast } from 'sonner';
import {
  STATUT_PROSPECTION_LABELS,
  PROSPECTION_STATUS_TRANSITIONS,
  StatutProspection,
} from '@shared/enum/status-constants';
import type { StatutProspectionType } from '@shared/enum/status-constants';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';

interface ProspectDetailModalProps {
  prospectId: string;
  onClose: () => void;
  onUpdate: () => void;
  canConvert?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  INTERESTED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  REFUSED: 'bg-red-500/10 text-red-500 border-red-500/20',
  TO_FOLLOW_UP: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  CONVERTED_TO_CLIENT: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

const TRANSITION_BUTTON_COLORS: Record<string, string> = {
  INTERESTED: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20',
  REFUSED: 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20',
  TO_FOLLOW_UP: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/20',
};

export default function ProspectDetailSheet({ prospectId, onClose, onUpdate, canConvert }: ProspectDetailModalProps) {
  const [prospect, setProspect] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);

  useEffect(() => {
    setLoading(true);
    prospectionApi.getById(prospectId)
      .then(setProspect)
      .catch(() => toast.error('Erreur chargement prospect'))
      .finally(() => setLoading(false));
  }, [prospectId]);

  const handleStatusChange = async (newStatut: string) => {
    setActionLoading(true);
    try {
      await prospectionApi.update(prospectId, { statut: newStatut });
      toast.success(`Statut mis à jour: ${STATUT_PROSPECTION_LABELS[newStatut as StatutProspectionType] || newStatut}`);
      // Reload
      const updated = await prospectionApi.getById(prospectId);
      setProspect(updated);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise à jour du statut');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    setActionLoading(true);
    try {
      const result = await prospectionApi.convert(prospectId);
      toast.success('Prospect converti en client avec succès !');
      onUpdate();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la conversion');
    } finally {
      setActionLoading(false);
      setShowConvertConfirm(false);
    }
  };

  const currentStatut = prospect?.statut as StatutProspectionType;
  const allowedTransitions = currentStatut ? (PROSPECTION_STATUS_TRANSITIONS[currentStatut] || []) : [];
  const canConvertProspect = canConvert && (currentStatut === StatutProspection.INTERESTED || currentStatut === StatutProspection.TO_FOLLOW_UP);

  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-slate-950 border-l-slate-800 p-0">
        <SheetHeader className="px-6 py-4 border-b border-slate-800 bg-slate-950/50 backdrop-blur sticky top-0 z-10">
          <SheetTitle className="text-white">Détail du Prospect</SheetTitle>
          <SheetDescription className="text-slate-400">
            Informations complètes et actions
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={32} className="animate-spin text-cyan-500" />
            <p className="text-sm text-slate-500">Chargement des informations...</p>
          </div>
        ) : !prospect ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
             <AlertTriangle className="text-amber-500" size={32} />
             <p className="text-slate-400">Prospect introuvable</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Identity Card */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-white leading-tight">
                  {[prospect.nom_prospect || prospect.nomProspect, prospect.prenom_prospect || prospect.prenomProspect].filter(Boolean).join(' ')}
                </h3>
                <div className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] uppercase font-bold border tracking-wide ${STATUS_COLORS[prospect.statut] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                   {STATUT_PROSPECTION_LABELS[prospect.statut as StatutProspectionType] || prospect.statut}
                </div>
              </div>

               <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center gap-2 text-slate-300 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    <Phone size={14} className="text-cyan-500 shrink-0" />
                    <span className="text-xs font-mono">{prospect.telephoneProspect || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-300 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    <Briefcase size={14} className="text-purple-500 shrink-0" />
                    <span className="text-xs break-words">{prospect.typeActivite || prospect.activitePrincipale || '-'}</span>
                  </div>
               </div>
               {prospect.adresseProspect && (
                 <div className="flex items-center gap-2 text-slate-400 text-xs pt-1">
                   <MapPin size={12} className="shrink-0" />
                   <span>{prospect.adresseProspect}</span>
                 </div>
               )}
            </div>

            {/* Informations Personnelles */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <User size={12} /> Informations Personnelles
              </h4>
              <div className="grid grid-cols-2 gap-3">
                 {prospect.sexe && <InfoCard label="Sexe" value={prospect.sexe === 'M' ? 'Homme' : 'Femme'} />}
                 <InfoCard label="Créé le" value={prospect.createdAt ? new Date(prospect.createdAt).toLocaleDateString('fr-FR') : '-'} />
              </div>
            </div>

            {/* Localisation */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <MapPin size={12} /> Localisation
              </h4>
              <div className="grid grid-cols-2 gap-3">
                 <InfoCard label="Arrondissement" value={prospect.arrondissementNom} />
                 <InfoCard label="Marché" value={prospect.marcheNom} />
              </div>
            </div>

            {/* Activité */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <Activity size={12} /> Activité
              </h4>
              <div className="grid grid-cols-2 gap-3">
                 <InfoCard label="Type d'activité" value={prospect.typeActivite || prospect.activitePrincipale} />
                 <InfoCard label="Ancienneté" value={prospect.ancienneteActivite} />
              </div>
              {prospect.descriptionActivite && (
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-medium text-slate-500 uppercase mb-0.5">Description</div>
                  <div className="text-sm text-slate-200 leading-relaxed">{prospect.descriptionActivite}</div>
                </div>
              )}
            </div>

            {/* Données Financières */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <DollarSign size={12} /> Données Financières
              </h4>
              <div className="grid grid-cols-2 gap-3">
                 <InfoCard label="Revenu estimé" value={prospect.revenuEstime ? `${Number(prospect.revenuEstime).toLocaleString('fr-FR')} FCFA` : undefined} />
                 <InfoCard label="CA Mensuel" value={prospect.chiffreAffairesMensuel ? `${Number(prospect.chiffreAffairesMensuel).toLocaleString('fr-FR')} FCFA` : undefined} />
                 <InfoCard label="Type de revenu" value={prospect.typeRevenu} />
                 {prospect.revenuJournalier && <InfoCard label="Revenu journalier" value={`${Number(prospect.revenuJournalier).toLocaleString('fr-FR')} FCFA`} />}
              </div>
            </div>

            {/* Observations & Commentaires */}
            {(prospect.observations || prospect.commentairesAgent) && (
              <div className="space-y-2">
                 <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <FileText size={12} /> Notes
                 </h4>
                 {prospect.observations && (
                   <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-1">
                     <div className="text-[10px] font-medium text-slate-500 uppercase">Observations</div>
                     <div className="text-sm text-slate-300 leading-relaxed italic">"{prospect.observations}"</div>
                   </div>
                 )}
                 {prospect.commentairesAgent && (
                   <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-1">
                     <div className="text-[10px] font-medium text-slate-500 uppercase">Commentaires Agent</div>
                     <div className="text-sm text-slate-300 leading-relaxed">{prospect.commentairesAgent}</div>
                   </div>
                 )}
              </div>
            )}

            {/* Actions Section */}
            <div className="space-y-4 pt-4 border-t border-slate-800/50">
                {/* Status Transitions */}
                {allowedTransitions.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-slate-400">Modifier le statut pour avancer</p>
                    <div className="flex flex-wrap gap-2">
                      {allowedTransitions.map((targetStatut) => (
                        <button
                          key={targetStatut}
                          onClick={() => handleStatusChange(targetStatut)}
                          disabled={actionLoading}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 ${TRANSITION_BUTTON_COLORS[targetStatut] || 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                        >
                          <ArrowRight size={12} />
                          {STATUT_PROSPECTION_LABELS[targetStatut as StatutProspectionType]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Convert to Client */}
                {canConvertProspect && !showConvertConfirm && (
                   <div className="pt-2">
                      <button
                        onClick={() => setShowConvertConfirm(true)}
                        disabled={actionLoading}
                        className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/20 hover:shadow-purple-900/40 disabled:opacity-50"
                      >
                        <UserCheck size={16} />
                        Convertir en Client
                      </button>
                      <p className="text-[10px] text-center text-slate-500 mt-2">
                        Cela créera un compte client et archivera la prospection.
                      </p>
                   </div>
                )}
                
                {/* Conversion Confirmation */}
                {showConvertConfirm && (
                  <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-3 animate-in slide-in-from-bottom-2 fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-purple-500/20 rounded-lg shrink-0">
                         <UserCheck size={18} className="text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-purple-100">Confirmer la conversion ?</p>
                        <p className="text-xs text-purple-200/70 mt-1 leading-relaxed">
                          Vous allez créer un client pour <strong>{[prospect.nom_prospect || prospect.nomProspect, prospect.prenom_prospect || prospect.prenomProspect].filter(Boolean).join(' ')}</strong>.
                          Une prime sera générée si éligible.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowConvertConfirm(false)}
                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleConvert}
                        disabled={actionLoading}
                        className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                      >
                        {actionLoading ? <Loader2 size={12} className="animate-spin" /> : null}
                        Confirmer
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoCard({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
      <div className="text-[10px] font-medium text-slate-500 uppercase mb-0.5">{label}</div>
      <div className="text-sm text-slate-200 font-medium break-words">{value || '-'}</div>
    </div>
  );
}
