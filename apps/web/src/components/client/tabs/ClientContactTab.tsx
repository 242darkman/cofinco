import React from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { Phone, Mail, MapPin, Home, MessageSquare, ExternalLink } from 'lucide-react';
import { Card } from '../../ui';
import { InfoRow } from '../shared/ClientBadges';
import { STATUT_LOGEMENT_LABELS } from '@shared/enum/status-constants';
import { iso2ToFlag } from '../../../lib/format';

interface ClientContactTabProps {
  client: ClientWithIdentity;
}

export default function ClientContactTab({ client }: ClientContactTabProps) {
  return (
    <div className="grid md:grid-cols-2 gap-4 animate-in fade-in duration-500">

      {/* Contact */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-accent/20 to-status-success/20 rounded-lg">
              <Phone size={16} className="text-accent" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Contact</h3>
          </div>

          <div className="space-y-3">
            {/* Telephone */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-edge-subtle bg-surface-subtle/30 group">
              <div className="p-2 rounded-lg bg-accent/10 shrink-0">
                <Phone size={14} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-content-muted uppercase">Telephone</p>
                <p className="text-sm font-medium text-content-primary truncate">{client.telephone || '-'}</p>
              </div>
              {client.telephone && (
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`tel:${client.telephone}`}
                    className="p-1.5 rounded-md hover:bg-accent/10 transition-colors"
                    title="Appeler"
                  >
                    <Phone size={14} className="text-accent" />
                  </a>
                  <a
                    href={`sms:${client.telephone}`}
                    className="p-1.5 rounded-md hover:bg-status-info/10 transition-colors"
                    title="Envoyer SMS"
                  >
                    <MessageSquare size={14} className="text-status-info" />
                  </a>
                </div>
              )}
            </div>

            {/* Email */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-edge-subtle bg-surface-subtle/30 group">
              <div className="p-2 rounded-lg bg-status-success/10 shrink-0">
                <Mail size={14} className="text-status-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-content-muted uppercase">Email</p>
                <p className="text-sm font-medium text-content-primary truncate">{client.email || '-'}</p>
              </div>
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="p-1.5 rounded-md hover:bg-status-success/10 transition-colors shrink-0"
                  title="Envoyer email"
                >
                  <ExternalLink size={14} className="text-status-success" />
                </a>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Adresse & Residence */}
      <Card variant="default" padding="none" className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gradient-to-br from-status-info/20 to-accent/20 rounded-lg">
              <MapPin size={16} className="text-status-info" />
            </div>
            <h3 className="text-sm font-bold text-content-primary tracking-tight">Adresse & Residence</h3>
          </div>

          <div className="space-y-2">
            <InfoRow label="Adresse domicile" value={client.adresseDomicile} icon={<Home size={10} />} />
            <InfoRow label="Lieu d'activite" value={client.lieuActivite} icon={<MapPin size={10} />} />
            <InfoRow label="Ville" value={client.villeNom} />
            <InfoRow label="Pays de résidence" value={client.paysResidenceNom
              ? `${iso2ToFlag(client.paysResidenceIso2)} ${client.paysResidenceNom}`.trim()
              : null
            } />
            <InfoRow
              label="Logement"
              value={client.statutLogement ? (STATUT_LOGEMENT_LABELS as any)[client.statutLogement] || client.statutLogement : null}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
