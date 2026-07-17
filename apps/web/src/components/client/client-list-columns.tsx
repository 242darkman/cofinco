/**
 * Colonnes du tableau de la liste des clients (extraites de ClientModule).
 * Rendu pur : identité, agence, téléphone, segment + tags, score, statut.
 */

import { BarChart3 } from 'lucide-react';
import { Badge } from '../ui';
import { formatClientName, resolveStorageUrl, formatPhoneNumber } from '../../lib/format';
import { STATUT_CLIENT_LABELS } from '@shared/enum/status-constants';
import {
  getStatusLabel,
  getStatusColor,
  CLIENT_STATUS_COLORS,
  CLIENT_SEGMENT_LABELS,
  CLIENT_SEGMENT_COLORS
} from '../../lib/status-labels';

export const getClientPhotoUrl = (client: any) => {
  const raw = client.photoProfile || '';
  return resolveStorageUrl(raw);
};

/** Colonnes ResponsiveTable de la liste des clients. */
export const CLIENT_LIST_COLUMNS = [
  {
    key: 'nom',
    label: 'Nom',
    primary: true,
    format: (_: any, item: any) => (
      <div className="flex items-center gap-2">
        {getClientPhotoUrl(item) ? (
          <img
            src={getClientPhotoUrl(item)}
            alt=""
            className="w-6 h-6 rounded-full object-cover border border-edge bg-surface-muted"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-surface-muted-elevated flex items-center justify-center border border-edge-strong text-[10px] font-bold text-content-muted">
            {`${item.prenom?.[0] || ''}${item.nom?.[0] || ''}`.toUpperCase() || '?'}
          </div>
        )}
        <span className="font-medium text-content-primary text-xs">
          {formatClientName(item.nom, item.prenom) || 'Sans nom'}
        </span>
      </div>
    )
  },
  {
    key: 'agence',
    label: 'Agence',
    hideOnMobile: true,
    headerAlign: 'center' as const,
    align: 'center' as const,
    format: (_: any, item: any) => (
      <div className="w-24 mx-auto">
        <Badge
          value={item.agenceNom || item.agence_nom || 'N/A'}
          variant="neutral"
          size="sm"
          className="w-full justify-center text-[10px] font-medium py-0 h-5"
        />
      </div>
    )
  },
  {
    key: 'telephone',
    label: 'Téléphone',
    hideOnMobile: true,
    headerAlign: 'center' as const,
    align: 'center' as const,
    format: (val: any) => <span className="text-xs font-mono text-content-muted">{formatPhoneNumber(val)}</span>
  },
  {
    key: 'segment',
    label: 'Segment',
    hideOnMobile: true,
    headerAlign: 'center' as const,
    align: 'center' as const,
    format: (_: any, item: any) => (
      <div className="flex flex-col items-center gap-0.5">
        <Badge
          value={getStatusLabel(item.segment, CLIENT_SEGMENT_LABELS)}
          className={getStatusColor(item.segment, CLIENT_SEGMENT_COLORS)}
          size="sm"
        />
        {item.tags && item.tags.length > 0 && (
          <div className="flex items-center gap-0.5 flex-wrap justify-center">
            {item.tags.slice(0, 2).map((tag: any) => (
              <span
                key={tag.id}
                className="px-1.5 py-0 rounded text-[9px] font-medium leading-relaxed"
                style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {item.tags.length > 2 && (
              <span className="text-[9px] text-content-muted font-medium">+{item.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
    )
  },
  {
    key: 'score',
    label: 'Score',
    hideOnMobile: true,
    headerAlign: 'center' as const,
    align: 'center' as const,
    format: (_: any, item: any) => {
      const score = item.score ?? 0;
      const color = score >= 80 ? 'text-status-success' : score >= 65 ? 'text-status-info' : score >= 40 ? 'text-status-warning' : 'text-status-danger';
      return (
        <div className="flex items-center justify-center gap-1">
          <BarChart3 size={12} className={color} />
          <span className={`text-xs font-bold ${color}`}>{score}</span>
        </div>
      );
    }
  },
  {
    key: 'statut',
    label: 'Statut',
    headerAlign: 'center' as const,
    align: 'center' as const,
    format: (_: any, item: any) => (
      <div className="flex justify-center">
        <Badge
          value={getStatusLabel(item.statut, STATUT_CLIENT_LABELS)}
          className={getStatusColor(item.statut, CLIENT_STATUS_COLORS)}
          size="sm"
        />
      </div>
    )
  }
];
