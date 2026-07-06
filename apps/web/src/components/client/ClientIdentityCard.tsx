import React from 'react';
import type { ClientWithIdentity } from '@shared/schema';
import { Edit2, Trash2, Phone, Mail, User, Calendar, MapPin, Globe, BarChart3 } from 'lucide-react';
import { Card, Badge, Button } from '../ui';
import { usePermissions, ProtectedFeature } from '../auth/ProtectedFeature';
import { Actions, Subjects } from '../../lib/casl';
import { formatClientName, resolveStorageUrl, iso2ToFlag, formatPhoneNumber } from '../../lib/format';
import { StatutClient, STATUT_CLIENT_LABELS } from '@shared/enum/status-constants';
import { getStatusLabel, getStatusColor, CLIENT_SEGMENT_LABELS, CLIENT_SEGMENT_COLORS } from '../../lib/status-labels';

interface ClientIdentityCardProps {
  client: ClientWithIdentity;
  onEdit: () => void;
  onDelete: () => void;
}

function getAge(dateNaissance: string | Date | null | undefined): number | null {
  if (!dateNaissance) return null;
  const birth = new Date(dateNaissance);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function formatBirthPlace(client: ClientWithIdentity): string | null {
  const parts: string[] = [];
  if (client.lieuNaissance) parts.push(client.lieuNaissance);
  if (client.paysNaissanceNom) {
    const flag = iso2ToFlag(client.paysNaissanceIso2);
    parts.push(flag ? `${flag} ${client.paysNaissanceNom}` : client.paysNaissanceNom);
  }

  if (parts.length === 0) return null;

  let result = parts.join(', ');
  // N'afficher la nationalité que si elle diffère du pays de naissance
  if (client.nationaliteNom && client.nationaliteNom !== client.paysNaissanceNom) {
    const natFlag = iso2ToFlag(client.nationaliteIso2);
    result += ` (${natFlag ? `${natFlag} ` : ''}${client.nationaliteNom})`;
  }
  return result;
}

export default function ClientIdentityCard({ client, onEdit, onDelete }: ClientIdentityCardProps) {
  const photoUrl = resolveStorageUrl(client.photoProfile || '');
  const age = getAge(client.dateNaissance);

  return (
    <Card variant="default" padding="none" className="overflow-hidden">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-accent via-status-info to-accent" />

      <div className="p-5">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center text-center mb-5">
          {/* Avatar with status ring */}
          <div className="relative mb-3">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={client.nom || ''}
                className={`w-24 h-24 rounded-full object-cover ring-4 shadow-lg ${
                  client.statut === StatutClient.ACTIVE
                    ? 'ring-status-success/40'
                    : 'ring-edge'
                }`}
              />
            ) : (
              <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-accent/20 to-status-info/20 flex items-center justify-center ring-4 shadow-lg ${
                client.statut === StatutClient.ACTIVE
                  ? 'ring-status-success/40'
                  : 'ring-edge'
              }`}>
                <span className="text-3xl font-bold text-accent">
                  {client.prenom?.charAt(0)}{client.nom?.charAt(0)}
                </span>
              </div>
            )}
          </div>

          {/* Name */}
          <h1 className="text-lg font-bold text-content-primary tracking-tight">
            {formatClientName(client.nom, client.prenom)}
          </h1>

          {/* Badges */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1.5">
            <Badge
              value={client.statut === StatutClient.ACTIVE ? 'Actif' : (STATUT_CLIENT_LABELS[client.statut as keyof typeof STATUT_CLIENT_LABELS] || client.statut)}
              size="sm"
            />
            <Badge
              value={getStatusLabel(client.segment, CLIENT_SEGMENT_LABELS)}
              className={getStatusColor(client.segment, CLIENT_SEGMENT_COLORS)}
              size="sm"
            />
          </div>

          {/* Score indicator */}
          {client.score != null && (
            <div className="flex items-center gap-1.5 mt-2">
              <BarChart3 size={12} className="text-content-muted" />
              <span className={`text-sm font-bold tabular-nums ${
                client.score >= 80 ? 'text-status-success' :
                client.score >= 65 ? 'text-status-info' :
                client.score >= 40 ? 'text-status-warning' :
                'text-status-danger'
              }`}>
                {client.score}
              </span>
              <span className="text-[10px] text-content-muted">/ 100</span>
            </div>
          )}

          {/* Code client */}
          {(client as any).codeClient && (
            <p className="text-[10px] text-content-muted mt-1.5 font-mono">
              Ref. {(client as any).codeClient}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mb-5">
          <ProtectedFeature requiredAbility={{ action: Actions.EDIT, subject: Subjects.CLIENT }}>
            <Button
              variant="secondary"
              size="sm"
              icon={Edit2}
              onClick={onEdit}
              className="flex-1"
            >
              Modifier
            </Button>
          </ProtectedFeature>
          <ProtectedFeature requiredAbility={{ action: Actions.DELETE, subject: Subjects.CLIENT }}>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              className="text-status-danger hover:bg-status-danger-bg hover:border-status-danger/30"
              onClick={onDelete}
            />
          </ProtectedFeature>
        </div>

        {/* Vital Info */}
        <div className="space-y-1.5">
          <SidebarInfoRow
            icon={<User size={13} />}
            label="Sexe"
            value={client.sexe === 'M' ? 'Masculin' : client.sexe === 'F' ? 'Feminin' : null}
          />
          <SidebarInfoRow
            icon={<Calendar size={13} />}
            label="Naissance"
            value={client.dateNaissance
              ? `${new Date(client.dateNaissance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}${age != null ? ` (${age} ans)` : ''}`
              : null
            }
          />
          <SidebarInfoRow
            icon={<MapPin size={13} />}
            label="Lieu naissance"
            value={formatBirthPlace(client)}
          />
          <SidebarInfoRow
            icon={<Globe size={13} />}
            label="Nationalité"
            value={client.nationaliteNom
              ? `${iso2ToFlag(client.nationaliteIso2)} ${client.nationaliteNom}`.trim()
              : null
            }
          />

          {/* Separator */}
          <div className="border-t border-edge-subtle my-2" />

          {/* Phone - clickable */}
          {client.telephone && (
            <a href={`tel:${client.telephone}`} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-subtle/50 transition-colors group">
              <div className="p-1 rounded-md bg-accent/10 shrink-0">
                <Phone size={13} className="text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-content-muted uppercase leading-tight">Telephone</p>
                <p className="text-xs font-medium text-content-primary truncate">{formatPhoneNumber(client.telephone)}</p>
              </div>
            </a>
          )}

          {/* Email - clickable */}
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-surface-subtle/50 transition-colors group">
              <div className="p-1 rounded-md bg-status-success/10 shrink-0">
                <Mail size={13} className="text-status-success" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] text-content-muted uppercase leading-tight">Email</p>
                <p className="text-xs font-medium text-content-primary truncate">{client.email}</p>
              </div>
            </a>
          )}

        </div>
      </div>
    </Card>
  );
}

function SidebarInfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 p-2 rounded-lg">
      <div className="p-1 rounded-md bg-surface-subtle shrink-0 text-content-muted mt-0.5">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] text-content-muted uppercase leading-tight">{label}</p>
        <p className="text-xs font-medium text-content-secondary break-words">{value}</p>
      </div>
    </div>
  );
}
