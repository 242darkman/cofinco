import React from 'react';
import { History, UserCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { STATUT_REEVALUATION_LABELS } from '@shared/enum/status-constants';
import type { AuditLog } from '../types';
import { translateAction } from '../types';

interface AuditHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditLogs: AuditLog[];
}

function translateStatut(statut: string): string {
  return STATUT_REEVALUATION_LABELS[statut as keyof typeof STATUT_REEVALUATION_LABELS] || statut;
}

export function AuditHistoryDrawer({ open, onOpenChange, auditLogs }: AuditHistoryDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-surface-base overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-edge sticky top-0 bg-surface-base z-10">
          <SheetTitle className="flex items-center gap-2 text-content-primary">
            <History size={18} className="text-accent" />
            Historique complet
          </SheetTitle>
          <SheetDescription className="text-content-muted">
            {auditLogs.length} action{auditLogs.length > 1 ? 's' : ''} enregistrée{auditLogs.length > 1 ? 's' : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="divide-y divide-edge/30">
          {auditLogs.map((log) => (
            <div key={log.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3 mb-1">
                <span className="text-sm font-medium text-content-primary">
                  {translateAction(log.action)}
                </span>
                <span className="text-xs text-content-muted whitespace-nowrap shrink-0">
                  {new Date(log.timestamp).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  {new Date(log.timestamp).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
                {log.statutAvant && log.statutApres && (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-content-secondary">{translateStatut(log.statutAvant)}</span>
                    <span>→</span>
                    <span className="text-content-secondary">{translateStatut(log.statutApres)}</span>
                  </span>
                )}
                {(log.userName || log.roleUtilisateur) && (
                  <span className="inline-flex items-center gap-1">
                    <UserCheck size={10} />
                    {log.userName || log.roleUtilisateur}
                    {log.userName && log.roleUtilisateur ? ` · ${log.roleUtilisateur}` : ''}
                  </span>
                )}
              </div>

              {log.details?.description && (
                <p className="text-xs text-content-muted mt-1.5 bg-surface-subtle/50 px-2.5 py-1.5 rounded">
                  {log.details.description}
                </p>
              )}
            </div>
          ))}

          {auditLogs.length === 0 && (
            <div className="px-5 py-10 text-center text-content-muted text-sm">
              Aucune action enregistrée
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
