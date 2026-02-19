import React, { useState, useEffect } from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { Users, Briefcase, Building2, Calendar, User } from 'lucide-react';
import { Card } from '../../ui';
import { InfoRow } from '../shared/ClientBadges';
import {
  SITUATION_MATRIMONIALE_LABELS, NIVEAU_EDUCATION_LABELS,
  TYPE_CLIENT_LABELS, SOURCE_FONDS_LABELS, STATUT_LOGEMENT_LABELS,
} from '@shared/enum/status-constants';
import { useCurrency } from '../../../contexts/CurrencyContext';

interface ClientProfileTabProps {
  client: ClientWithIdentity;
}

function formatAnciennete(mois: number): string {
  if (mois < 1) return `< 1 mois`;
  if (mois < 12) return `${mois} mois`;
  const annees = Math.floor(mois / 12);
  const resteMois = mois % 12;
  if (resteMois === 0) return `${annees} an${annees > 1 ? 's' : ''}`;
  return `${annees} an${annees > 1 ? 's' : ''} et ${resteMois} mois`;
}

export default function ClientProfileTab({ client }: ClientProfileTabProps) {
  const { fmt } = useCurrency();
  const [agentName, setAgentName] = useState<string | null>(null);

  // Fetch agent referent name if we have an ID
  useEffect(() => {
    if (client.agentReferentId) {
      fetch(`/api/employes/${client.agentReferentId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            const nom = data.user?.nom || data.nom || '';
            const prenom = data.user?.prenom || data.prenom || '';
            setAgentName(`${prenom} ${nom}`.trim() || null);
          }
        })
        .catch(() => setAgentName(null));
    }
  }, [client.agentReferentId]);

  return (
    <div className="grid md:grid-cols-2 gap-4 animate-in fade-in duration-500">

      {/* Section Sociale */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-accent/20 to-status-success/20 rounded-lg">
              <Users size={16} className="text-accent" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Situation Sociale</h3>
          </div>
          <div className="space-y-2">
            <InfoRow
              label="Situation matrimoniale"
              value={client.situationMatrimoniale ? (SITUATION_MATRIMONIALE_LABELS as any)[client.situationMatrimoniale] || client.situationMatrimoniale : null}
            />
            <InfoRow
              label="Personnes a charge"
              value={client.nombrePersonnesCharge != null ? String(client.nombrePersonnesCharge) : null}
            />
            <InfoRow
              label="Niveau d'education"
              value={client.niveauEducation ? (NIVEAU_EDUCATION_LABELS as any)[client.niveauEducation] || client.niveauEducation : null}
            />
            <InfoRow
              label="Logement"
              value={client.statutLogement ? (STATUT_LOGEMENT_LABELS as any)[client.statutLogement] || client.statutLogement : null}
            />
          </div>
        </div>
      </Card>

      {/* Section Professionnelle */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-status-info/20 to-status-success/20 rounded-lg">
              <Briefcase size={16} className="text-status-info" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Situation Professionnelle</h3>
          </div>
          <div className="space-y-2">
            <InfoRow
              label="Type client"
              value={client.typeClient ? (TYPE_CLIENT_LABELS as any)[client.typeClient] || client.typeClient : null}
            />
            <InfoRow label="Profession" value={client.professionNom || client.professionAutreTexte} />
            <InfoRow label="Employeur" value={client.employeur} />
            <InfoRow label="Type d'activite" value={client.activityTypeNom} />
            <InfoRow
              label="Anciennete"
              value={client.ancienneteActiviteMois != null ? formatAnciennete(Number(client.ancienneteActiviteMois)) : null}
            />
            <InfoRow
              label="Source des fonds"
              value={client.sourceFonds ? (SOURCE_FONDS_LABELS as any)[client.sourceFonds] || client.sourceFonds : null}
            />
            <InfoRow
              label="Revenu mensuel"
              value={client.revenuMensuel ? fmt(client.revenuMensuel) : null}
            />
            {client.revenuJournalier && parseFloat(client.revenuJournalier) > 0 && (
              <InfoRow
                label="Revenu journalier"
                value={fmt(client.revenuJournalier)}
              />
            )}
          </div>
        </div>
      </Card>

      {/* Section Organisation */}
      <Card variant="default" padding="none" className="overflow-hidden md:col-span-2">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-status-info/20 to-accent/20 rounded-lg">
              <Building2 size={16} className="text-status-info" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Organisation</h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Agence de rattachement */}
            {(client.agenceNom || (client as any).agence_nom) && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-edge-subtle bg-surface-subtle/30">
                <div className="p-2 rounded-lg bg-status-info/10">
                  <Building2 size={14} className="text-status-info" />
                </div>
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Agence de rattachement</p>
                  <p className="text-sm font-medium text-content-primary">{client.agenceNom || (client as any).agence_nom}</p>
                </div>
              </div>
            )}

            {/* Agent Referent - Mini Card */}
            {client.agentReferentId && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-edge-subtle bg-surface-subtle/30">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent/20 to-status-info/20 flex items-center justify-center">
                  <User size={16} className="text-accent" />
                </div>
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Agent referent</p>
                  <p className="text-sm font-medium text-content-primary">
                    {agentName || 'Chargement...'}
                  </p>
                </div>
              </div>
            )}

            {/* Date d'adhesion */}
            {client.dateAdhesion && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-edge-subtle bg-surface-subtle/30">
                <div className="p-2 rounded-lg bg-accent/10">
                  <Calendar size={14} className="text-accent" />
                </div>
                <div>
                  <p className="text-[10px] text-content-muted uppercase">Date d'adhesion</p>
                  <p className="text-sm font-medium text-content-primary">
                    {new Date(client.dateAdhesion).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
