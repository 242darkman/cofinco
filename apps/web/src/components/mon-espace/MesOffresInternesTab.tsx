import React, { useState } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Briefcase, MapPin, Clock, Send } from 'lucide-react';
import { Card, Modal, TextareaField } from '../ui';
import { useInternalOffers } from '../../hooks/hr/useJobOffers';

const TYPE_CONTRAT_LABEL: Record<string, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  STAGE: 'Stage',
  INTERIM: 'Intérim',
};

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
}

export default function MesOffresInternesTab() {
  const { offers, isLoading, applyInternal, isApplying } = useInternalOffers();
  const [applyOfferId, setApplyOfferId] = useState<number | null>(null);
  const [motivation, setMotivation] = useState('');

  const handleApply = async () => {
    if (!applyOfferId) return;
    try {
      await applyInternal({ offerId: applyOfferId, experience: motivation });
      setApplyOfferId(null);
      setMotivation('');
    } catch {
      // error handled by hook toast
    }
  };

  const applyOffer = offers.find(o => o.offer.id === applyOfferId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Briefcase className="h-10 w-10 text-content-muted mb-3" />
        <p className="text-content-secondary font-medium">Aucune offre disponible</p>
        <p className="text-sm text-content-muted mt-1">
          Les offres internes apparaitront ici lorsqu'elles seront publiees
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-accent/10 rounded-lg">
          <Briefcase size={15} className="text-accent" />
        </div>
        <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
          {offers.length} offre{offers.length > 1 ? 's' : ''} disponible{offers.length > 1 ? 's' : ''}
        </h3>
      </div>

      {/* Offer list */}
      <Card padding="sm">
        <div className="divide-y divide-edge-subtle">
          {offers.map(({ offer, positionName, departmentName }) => {
            const deadline = formatDate(offer.dateLimite);
            const skills = offer.competencesRequises ?? [];

            return (
              <div
                key={offer.id}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Briefcase size={14} className="text-accent" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-content-primary truncate">
                      {offer.titre}
                    </p>
                    {offer.typeContrat && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-status-info-bg text-status-info shrink-0">
                        {TYPE_CONTRAT_LABEL[offer.typeContrat] || offer.typeContrat}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-content-muted mt-0.5">
                    {departmentName}
                    {offer.qualificationMinimum && <> &middot; {offer.qualificationMinimum}</>}
                    {offer.experienceMinAnnees > 0 && <> &middot; {offer.experienceMinAnnees} an{offer.experienceMinAnnees > 1 ? 's' : ''} min.</>}
                  </p>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* Skills tags */}
                    {skills.slice(0, 3).map(skill => (
                      <span
                        key={skill}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-surface-subtle text-content-secondary font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                    {skills.length > 3 && (
                      <span className="text-[9px] text-content-muted">+{skills.length - 3}</span>
                    )}

                    {/* Location */}
                    {offer.lieu && (
                      <span className="text-[10px] text-content-muted flex items-center gap-0.5">
                        <MapPin size={9} />
                        {offer.lieu}
                      </span>
                    )}

                    {/* Deadline */}
                    {deadline && (
                      <span className="text-[10px] text-content-muted flex items-center gap-0.5">
                        <Clock size={9} />
                        {deadline}
                      </span>
                    )}
                  </div>
                </div>

                {/* Apply button */}
                <button
                  onClick={() => { setApplyOfferId(offer.id); setMotivation(''); }}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-accent/10 text-accent hover:bg-accent hover:text-white transition-colors"
                >
                  <Send size={10} />
                  Postuler
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Apply modal */}
      <Modal
        isOpen={applyOfferId !== null}
        onClose={() => setApplyOfferId(null)}
        title={applyOffer ? `Postuler — ${applyOffer.offer.titre}` : 'Postuler'}
        size="md"
      >
        <div className="space-y-4">
          {applyOffer && (
            <div className="text-xs text-content-muted space-y-1">
              <p><span className="font-medium text-content-secondary">Poste :</span> {applyOffer.positionName}</p>
              <p><span className="font-medium text-content-secondary">Departement :</span> {applyOffer.departmentName}</p>
              {applyOffer.offer.lieu && (
                <p><span className="font-medium text-content-secondary">Lieu :</span> {applyOffer.offer.lieu}</p>
              )}
            </div>
          )}

          <TextareaField
            label="Motivation / Experience pertinente"
            name="motivation"
            value={motivation}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMotivation(e.target.value)}
            placeholder="Decrivez votre motivation et votre experience pertinente pour ce poste..."
            rows={4}
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setApplyOfferId(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-content-muted hover:text-content-primary transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {isApplying ? <Spinner size="xs" tone="current" /> : <Send size={12} />}
              Envoyer ma candidature
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
