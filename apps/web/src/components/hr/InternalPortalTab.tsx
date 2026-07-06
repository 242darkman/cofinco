import React, { useState } from 'react';
import { Briefcase, MapPin, Calendar, Users, Send, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Card, Button, Modal, Badge, TextareaField } from '../ui';
import { useInternalOffers } from '../../hooks/hr/useJobOffers';

const QUALIFICATION_LABELS: Record<string, string> = {
  OUVRIER: 'Ouvrier',
  EMPLOYE: 'Employé',
  AGENT_MAITRISE: 'Agent de maîtrise',
  CADRE: 'Cadre',
  CADRE_SUPERIEUR: 'Cadre supérieur',
};

export default function InternalPortalTab() {
  const { offers, isLoading, applyInternal, isApplying } = useInternalOffers();
  const [applyingOffer, setApplyingOffer] = useState<any | null>(null);
  const [motivation, setMotivation] = useState('');

  const handleApply = async () => {
    if (!applyingOffer) return;
    try {
      await applyInternal({ offerId: applyingOffer.offer.id, experience: motivation || undefined });
      setApplyingOffer(null);
      setMotivation('');
    } catch {
      // handled by hook
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Briefcase size={32} className="mx-auto mb-3 text-content-muted" />
        <h3 className="text-sm font-medium text-content-primary mb-1">Aucune offre disponible</h3>
        <p className="text-xs text-content-muted">Il n'y a pas d'offre d'emploi interne actuellement.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-content-primary">Offres d'emploi internes</h3>
          <p className="text-xs text-content-muted">{offers.length} offre(s) disponible(s)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {offers.map((item: any) => {
          const offer = item.offer || item;
          const positionName = item.positionName || '';
          const departmentName = item.departmentName || '';

          return (
            <Card key={offer.id} className="p-4 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 rounded-lg bg-accent/10 text-accent shrink-0">
                  <Briefcase size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm text-content-primary truncate">{offer.titre}</h4>
                  <p className="text-xs text-content-muted">{departmentName} · {positionName}</p>
                </div>
              </div>

              {offer.description && (
                <p className="text-xs text-content-secondary mb-3 line-clamp-3">{offer.description}</p>
              )}

              <div className="space-y-1.5 mb-3 text-xs text-content-muted">
                {offer.typeContrat && (
                  <div className="flex items-center gap-1.5">
                    <Briefcase size={12} /> {offer.typeContrat}
                  </div>
                )}
                {offer.lieu && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={12} /> {offer.lieu}
                  </div>
                )}
                {offer.dateLimite && (
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} /> Limite: {offer.dateLimite}
                  </div>
                )}
                {offer.salairePropose && (
                  <div className="flex items-center gap-1.5">
                    <Users size={12} /> {offer.salairePropose}
                  </div>
                )}
              </div>

              {offer.competencesRequises && offer.competencesRequises.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {offer.competencesRequises.slice(0, 4).map((c: string, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 bg-accent/10 text-accent text-[10px] rounded-full">{c}</span>
                  ))}
                  {offer.competencesRequises.length > 4 && (
                    <span className="px-1.5 py-0.5 bg-surface-subtle text-content-muted text-[10px] rounded-full">
                      +{offer.competencesRequises.length - 4}
                    </span>
                  )}
                </div>
              )}

              {offer.qualificationMinimum && (
                <div className="text-xs text-content-muted mb-3">
                  Qualification: {QUALIFICATION_LABELS[offer.qualificationMinimum] || offer.qualificationMinimum}
                  {offer.experienceMinAnnees > 0 && ` · ${offer.experienceMinAnnees} an(s) min.`}
                </div>
              )}

              <div className="mt-auto pt-2 border-t border-edge">
                <Button size="sm" className="w-full" onClick={() => setApplyingOffer(item)}>
                  <Send size={14} className="mr-1" /> Postuler
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Apply Modal */}
      <Modal isOpen={!!applyingOffer} onClose={() => { setApplyingOffer(null); setMotivation(''); }}
        title={`Postuler: ${applyingOffer?.offer?.titre || ''}`} size="md">
        <div className="p-4 space-y-4">
          <p className="text-sm text-content-secondary">
            Votre candidature sera pré-remplie avec les informations de votre profil employé.
            Vous pouvez ajouter une note de motivation ci-dessous.
          </p>

          <TextareaField label="Motivation / Expérience pertinente" name="motivation" value={motivation}
            onChange={e => setMotivation(e.target.value)} rows={4}
            placeholder="Décrivez votre motivation et votre expérience pertinente pour ce poste..." />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setApplyingOffer(null); setMotivation(''); }}>Annuler</Button>
            <Button onClick={handleApply} disabled={isApplying}>
              {isApplying ? <Loader2 size={14} className="animate-spin mr-1" /> : <Send size={14} className="mr-1" />}
              Envoyer ma candidature
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
