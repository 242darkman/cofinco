import React from 'react';
import { XCircle, Clock, History, UserCheck } from 'lucide-react';
import type { AuditLog } from '../types';
import type { StepDefinition } from './StatusStepper';

interface StepDetailModalProps {
  step: StepDefinition;
  logs: AuditLog[];
  onClose: () => void;
}

const STEP_ACTIONS: Record<string, string[]> = {
  request: ['REEVALUATION_CREEE', 'ELIGIBILITE_VERIFIEE'],
  authorized: ['ELIGIBILITE_VERIFIEE', 'ENQUETE_LANCEE'],
  committee: ['SOUMIS_COMITE'],
  decision: ['DECISION_ENREGISTREE', 'ANNULATION', 'REFUS_ELIGIBILITE'],
};

export function StepDetailModal({ step, logs, onClose }: StepDetailModalProps) {
  const actions = STEP_ACTIONS[step.id] || [];
  const relevantLogs = logs
    .filter(log => {
      if (!actions.includes(log.action)) return false;
      if (step.id === 'authorized' && log.statutApres === 'Refusée') return false;
      return true;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-base border border-edge rounded-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-edge flex justify-between items-center bg-surface/50">
          <h3 className="font-bold text-content-primary flex items-center gap-2">
            <History size={16} className="text-accent" />
            Historique: {step.label}
          </h3>
          <button onClick={onClose} className="text-content-muted hover:text-content-primary" aria-label="Fermer">
            <XCircle size={20} />
          </button>
        </div>
        <div className="p-0 max-h-[60vh] overflow-y-auto">
          {relevantLogs.length === 0 ? (
            <div className="p-8 text-center text-content-muted">
              <Clock size={32} className="mx-auto mb-2 opacity-50" />
              <p>Aucune activité enregistrée pour cette étape</p>
            </div>
          ) : (
            <div className="divide-y divide-edge">
              {relevantLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-surface/50 transition">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-accent">
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-content-muted">
                      {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {log.details?.description && (
                    <p className="text-sm text-content-secondary mb-2">{log.details.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-content-muted">
                    <UserCheck size={12} />
                    <span>
                      {log.userName || log.roleUtilisateur || 'Système'}
                      {log.userName && log.roleUtilisateur ? ` · ${log.roleUtilisateur}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
