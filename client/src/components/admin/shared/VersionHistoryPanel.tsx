/**
 * Version History Panel Component
 * Shows version history with restore capability
 */

import React, { useState } from 'react';
import {
  History,
  RotateCcw,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { SettingsVersion } from '../../../hooks/admin/useAuditTrail';

export interface VersionHistoryPanelProps {
  versions: SettingsVersion[];
  loading?: boolean;
  onRestore: (version: number) => Promise<boolean>;
  showDiff?: boolean;
  maxHeight?: string;
}

export default function VersionHistoryPanel({
  versions,
  loading = false,
  onRestore,
  showDiff = true,
  maxHeight = '400px',
}: VersionHistoryPanelProps) {
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);

  const handleRestore = async (version: number) => {
    setRestoringVersion(version);
    const success = await onRestore(version);
    setRestoringVersion(null);
    setConfirmRestore(null);
    if (success) {
      setExpandedVersion(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getChangedFields = (current: Record<string, any>, previous?: Record<string, any>) => {
    if (!previous) return Object.keys(current);
    const changed: string[] = [];
    const allKeys = new Set([...Object.keys(current), ...Object.keys(previous)]);
    allKeys.forEach((key) => {
      if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) {
        changed.push(key);
      }
    });
    return changed;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <History size={48} className="mx-auto mb-4 opacity-50" />
        <p>Aucun historique de version disponible</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex items-center gap-3">
        <div className="p-2 bg-purple-500/20 rounded-lg">
          <History className="text-purple-400" size={20} />
        </div>
        <div>
          <h3 className="font-semibold text-white">Historique des versions</h3>
          <p className="text-sm text-slate-400">{versions.length} version(s)</p>
        </div>
      </div>

      <div className="overflow-auto" style={{ maxHeight }}>
        <div className="divide-y divide-slate-700/50">
          {versions.map((version, index) => {
            const previousVersion = versions[index + 1];
            const changedFields = showDiff
              ? getChangedFields(version.snapshot, previousVersion?.snapshot)
              : [];

            return (
              <div
                key={version.id}
                className={`p-4 transition ${version.isCurrent ? 'bg-indigo-500/10' : 'hover:bg-slate-700/30'}`}
              >
                {/* Version Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2.5 py-1 bg-slate-700 rounded-lg text-sm font-semibold text-white">
                        v{version.version}
                      </span>

                      {version.isCurrent && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-xs">
                          <Check size={12} />
                          Actuelle
                        </span>
                      )}

                      {showDiff && changedFields.length > 0 && !version.isCurrent && (
                        <span className="text-xs text-slate-400">
                          {changedFields.length} champ(s) modifié(s)
                        </span>
                      )}
                    </div>

                    {/* Change Reason */}
                    {version.changeReason && (
                      <p className="text-sm text-slate-300 mb-2">{version.changeReason}</p>
                    )}

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatDate(version.changedAt)}
                      </span>

                      {version.changerName && (
                        <span className="flex items-center gap-1">
                          <User size={12} />
                          {version.changerName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!version.isCurrent && (
                      <>
                        {confirmRestore === version.version ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRestore(version.version)}
                              disabled={restoringVersion !== null}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs transition disabled:opacity-50"
                            >
                              {restoringVersion === version.version ? (
                                <Loader2 className="animate-spin" size={14} />
                              ) : (
                                'Confirmer'
                              )}
                            </button>
                            <button
                              onClick={() => setConfirmRestore(null)}
                              className="px-3 py-1.5 text-slate-400 hover:text-white text-xs transition"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmRestore(version.version)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-amber-400 hover:bg-amber-500/20 rounded-lg text-xs transition"
                          >
                            <RotateCcw size={14} />
                            Restaurer
                          </button>
                        )}
                      </>
                    )}

                    <button
                      onClick={() =>
                        setExpandedVersion(expandedVersion === version.version ? null : version.version)
                      }
                      className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition"
                    >
                      {expandedVersion === version.version ? (
                        <ChevronUp size={18} />
                      ) : (
                        <ChevronDown size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedVersion === version.version && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <h4 className="text-sm font-medium text-white mb-3">Contenu de la version</h4>

                    {showDiff && previousVersion && changedFields.length > 0 ? (
                      <div className="space-y-3">
                        {changedFields.map((field) => (
                          <div key={field} className="text-sm">
                            <span className="font-medium text-slate-300">{field}:</span>
                            <div className="mt-1 grid grid-cols-2 gap-2">
                              <div className="p-2 bg-red-500/10 rounded text-red-400 text-xs">
                                <span className="text-slate-500">Avant: </span>
                                {JSON.stringify(previousVersion.snapshot[field]) ?? 'null'}
                              </div>
                              <div className="p-2 bg-emerald-500/10 rounded text-emerald-400 text-xs">
                                <span className="text-slate-500">Après: </span>
                                {JSON.stringify(version.snapshot[field]) ?? 'null'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap text-xs bg-slate-900/50 p-3 rounded-lg overflow-auto max-h-48 text-slate-300">
                        {JSON.stringify(version.snapshot, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
