import React from 'react';
import { History } from 'lucide-react';
import type { AuditLog } from '../types';
import { translateAction } from '../types';

interface RecentActionsProps {
  auditLogs: AuditLog[];
  maxVisible?: number;
  onShowFullHistory: () => void;
}

export function RecentActions({ auditLogs, maxVisible = 3, onShowFullHistory }: RecentActionsProps) {
  if (auditLogs.length === 0) return null;

  const visibleLogs = auditLogs.slice(0, maxVisible);

  return (
    <div className="bg-surface rounded-xl border border-edge overflow-hidden">
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-edge/30">
        <div className="flex items-center gap-1.5">
          <History size={13} className="text-content-muted" />
          <span className="text-[11px] font-bold text-content-muted uppercase tracking-wider">Dernières actions</span>
        </div>
        <button
          onClick={onShowFullHistory}
          className="text-[10px] font-bold text-accent uppercase tracking-wider hover:underline"
        >
          Voir historique
        </button>
      </div>

      <div className="divide-y divide-edge/30">
        {visibleLogs.map(log => (
          <div key={log.id} className="px-3 py-2.5 flex items-start gap-2.5">
            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-content-primary leading-tight">
                {translateAction(log.action)}
              </p>
              <p className="text-[11px] text-content-muted mt-0.5">
                {new Date(log.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })},{' '}
                {new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                {(log.userName || log.roleUtilisateur) && (
                  <> · {log.userName || log.roleUtilisateur}</>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
