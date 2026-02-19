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
  REGISTERED: 'bg-status-info-bg text-status-info border-status-info/20',
  INTERESTED: 'bg-status-success-bg text-status-success border-status-success/20',
  REFUSED: 'bg-status-danger-bg text-status-danger border-status-danger/20',
  TO_FOLLOW_UP: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  CONVERTED_TO_CLIENT: 'bg-status-info-bg text-status-info border-status-info/20',
};

const TRANSITION_BUTTON_COLORS: Record<string, string> = {
  INTERESTED: 'bg-status-success hover:bg-status-success text-white shadow-status-success/20',
  REFUSED: 'bg-status-danger hover:bg-status-danger text-white shadow-status-danger/20',
  TO_FOLLOW_UP: 'bg-status-warning hover:bg-status-warning text-white shadow-status-warning/20',
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
      toast.success('Prospect converti en client');
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
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto scrollbar-thin bg-surface-base border-l-edge p-0">
        <SheetHeader className="px-6 py-4 border-b border-edge bg-surface-base/50 backdrop-blur sticky top-0 z-10">
          <SheetTitle className="text-content-primary">Détail du Prospect</SheetTitle>
          <SheetDescription className="text-content-muted">
            Informations complètes et actions
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={32} className="animate-spin text-accent" />
            <p className="text-sm text-content-muted">Chargement des informations...</p>
          </div>
        ) : !prospect ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
             <AlertTriangle className="text-status-warning" size={32} />
             <p className="text-content-muted">Prospect introuvable</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Identity Card */}
            <div className="bg-surface-base/50 border border-edge rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-content-primary leading-tight">
                  {[prospect.nom_prospect || prospect.nomProspect, prospect.prenom_prospect || prospect.prenomProspect].filter(Boolean).join(' ')}
                </h3>
                <div className={`shrink-0 px-2.5 py-1 rounded-md text-[10px] uppercase font-bold border tracking-wide ${STATUS_COLORS[prospect.statut] || 'bg-surface-subtle/40 text-content-muted border-edge-strong/30'}`}>
                   {STATUT_PROSPECTION_LABELS[prospect.statut as StatutProspectionType] || prospect.statut}
                </div>
              </div>

               <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center gap-2 text-content-secondary bg-surface-base/50 p-2 rounded-lg border border-edge/50">
                    <Phone size={14} className="text-accent shrink-0" />
                    <span className="text-xs font-mono">{prospect.telephoneProspect || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-content-secondary bg-surface-base/50 p-2 rounded-lg border border-edge/50">
                    <Briefcase size={14} className="text-status-info shrink-0" />
                    <span className="text-xs break-words">{prospect.typeActivite || prospect.activitePrincipale || '-'}</span>
                  </div>
               </div>
               {prospect.adresseProspect && (
                 <div className="flex items-center gap-2 text-content-muted text-xs pt-1">
                   <MapPin size={12} className="shrink-0" />
                   <span>{prospect.adresseProspect}</span>
                 </div>
               )}
            </div>

            {/* Informations Personnelles */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                <User size={12} /> Informations Personnelles
              </h4>
              <div className="grid grid-cols-2 gap-3">
                 {prospect.sexe && <InfoCard label="Sexe" value={prospect.sexe === 'M' ? 'Homme' : 'Femme'} />}
                 <InfoCard label="Créé le" value={prospect.createdAt ? new Date(prospect.createdAt).toLocaleDateString('fr-FR') : '-'} />
              </div>
            </div>

            {/* Localisation */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                <MapPin size={12} /> Localisation
              </h4>
              <div className="grid grid-cols-2 gap-3">
                 <InfoCard label="Arrondissement" value={prospect.arrondissementNom} />
                 <InfoCard label="Marché" value={prospect.marcheNom} />
              </div>
            </div>

            {/* Activité */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                <Activity size={12} /> Activité
              </h4>
              <div className="grid grid-cols-2 gap-3">
                 <InfoCard label="Type d'activité" value={prospect.typeActivite || prospect.activitePrincipale} />
                 <InfoCard label="Ancienneté" value={prospect.ancienneteActivite} />
              </div>
              {prospect.descriptionActivite && (
                <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
                  <div className="text-[10px] font-medium text-content-muted uppercase mb-0.5">Description</div>
                  <div className="text-sm text-content-secondary leading-relaxed">{prospect.descriptionActivite}</div>
                </div>
              )}
            </div>

            {/* Données Financières */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
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
                 <h4 className="text-xs font-bold text-content-muted uppercase flex items-center gap-2">
                    <FileText size={12} /> Notes
                 </h4>
                 {prospect.observations && (
                   <div className="bg-surface-base/50 border border-edge rounded-lg p-3 space-y-1">
                     <div className="text-[10px] font-medium text-content-muted uppercase">Observations</div>
                     <div className="text-sm text-content-secondary leading-relaxed italic">"{prospect.observations}"</div>
                   </div>
                 )}
                 {prospect.commentairesAgent && (
                   <div className="bg-surface-base/50 border border-edge rounded-lg p-3 space-y-1">
                     <div className="text-[10px] font-medium text-content-muted uppercase">Commentaires Agent</div>
                     <div className="text-sm text-content-secondary leading-relaxed">{prospect.commentairesAgent}</div>
                   </div>
                 )}
              </div>
            )}

            {/* Actions Section */}
            <div className="space-y-4 pt-4 border-t border-edge/50">
                {/* Status Transitions */}
                {allowedTransitions.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-content-muted">Modifier le statut pour avancer</p>
                    <div className="flex flex-wrap gap-2">
                      {allowedTransitions.map((targetStatut) => (
                        <button
                          key={targetStatut}
                          onClick={() => handleStatusChange(targetStatut)}
                          disabled={actionLoading}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 ${TRANSITION_BUTTON_COLORS[targetStatut] || 'bg-surface-elevated hover:bg-surface-subtle text-content-primary'}`}
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
                        className="w-full py-3 bg-gradient-to-r from-status-info to-accent hover:from-status-info hover:to-accent text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-status-info/20 hover:shadow-status-info/20 disabled:opacity-50"
                      >
                        <UserCheck size={16} />
                        Convertir en Client
                      </button>
                      <p className="text-[10px] text-center text-content-muted mt-2">
                        Cela créera un compte client et archivera la prospection.
                      </p>
                   </div>
                )}
                
                {/* Conversion Confirmation */}
                {showConvertConfirm && (
                  <div className="p-4 bg-status-info-bg border border-status-info/30 rounded-xl space-y-3 animate-in slide-in-from-bottom-2 fade-in">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-status-info-bg rounded-lg shrink-0">
                         <UserCheck size={18} className="text-status-info" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-status-info-text">Confirmer la conversion ?</p>
                        <p className="text-xs text-status-info-text/70 mt-1 leading-relaxed">
                          Vous allez créer un client pour <strong>{[prospect.nom_prospect || prospect.nomProspect, prospect.prenom_prospect || prospect.prenomProspect].filter(Boolean).join(' ')}</strong>.
                          Une prime sera générée si éligible.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowConvertConfirm(false)}
                        className="flex-1 py-2 bg-surface hover:bg-surface-elevated text-content-secondary rounded-lg text-xs font-medium transition"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleConvert}
                        disabled={actionLoading}
                        className="flex-1 py-2 bg-status-info hover:bg-status-info text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
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
    <div className="p-2.5 bg-surface-base rounded-lg border border-edge">
      <div className="text-[10px] font-medium text-content-muted uppercase mb-0.5">{label}</div>
      <div className="text-sm text-content-secondary font-medium break-words">{value || '-'}</div>
    </div>
  );
}
