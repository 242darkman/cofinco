import React from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { Users, Phone, MapPin, Briefcase } from 'lucide-react';
import { Card, EmptyState } from '../../ui';
import { RELATION_REFERENCE_LABELS } from '@shared/enum/status-constants';

interface ClientReferencesTabProps {
  client: ClientWithIdentity;
}

interface ReferencePersonne {
  nom: string;
  prenom?: string;
  telephone: string;
  relation: string;
  adresse?: string;
  profession?: string;
}

export default function ClientReferencesTab({ client }: ClientReferencesTabProps) {
  const references: ReferencePersonne[] = (client as any).referencesPersonnes || [];

  if (references.length === 0) {
    return (
      <div className="animate-in fade-in duration-500">
        <EmptyState
          icon={<Users size={40} className="text-content-muted" />}
          title="Aucune personne de reference"
          description="Ce client n'a pas encore de personnes de reference enregistrees."
        />
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">
      {references.map((ref, idx) => (
        <Card key={idx} variant="default" padding="none" className="overflow-hidden">
          <div className="p-4 sm:p-5">
            {/* Header with name and relation */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/20 to-status-info/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-accent">
                  {ref.prenom?.charAt(0) || ''}{ref.nom?.charAt(0) || ''}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-content-primary truncate">
                  {ref.prenom ? `${ref.prenom} ${ref.nom}` : ref.nom}
                </p>
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold border bg-accent/10 text-accent border-accent/20 mt-0.5">
                  {(RELATION_REFERENCE_LABELS as any)[ref.relation] || ref.relation}
                </span>
              </div>
            </div>

            {/* Contact & Details */}
            <div className="space-y-2">
              {/* Telephone */}
              <a
                href={`tel:${ref.telephone}`}
                className="flex items-center gap-2.5 p-2 rounded-lg border border-edge-subtle hover:bg-surface-subtle/50 transition-colors group"
              >
                <div className="p-1.5 rounded-md bg-accent/10 shrink-0">
                  <Phone size={12} className="text-accent" />
                </div>
                <span className="text-xs font-medium text-content-secondary group-hover:text-content-primary truncate">
                  {ref.telephone}
                </span>
              </a>

              {/* Adresse */}
              {ref.adresse && (
                <div className="flex items-center gap-2.5 p-2 rounded-lg border border-edge-subtle">
                  <div className="p-1.5 rounded-md bg-status-info/10 shrink-0">
                    <MapPin size={12} className="text-status-info" />
                  </div>
                  <span className="text-xs text-content-secondary truncate">{ref.adresse}</span>
                </div>
              )}

              {/* Profession */}
              {ref.profession && (
                <div className="flex items-center gap-2.5 p-2 rounded-lg border border-edge-subtle">
                  <div className="p-1.5 rounded-md bg-status-success/10 shrink-0">
                    <Briefcase size={12} className="text-status-success" />
                  </div>
                  <span className="text-xs text-content-secondary truncate">{ref.profession}</span>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
