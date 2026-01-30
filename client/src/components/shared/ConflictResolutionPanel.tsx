/**
 * Conflict Resolution Panel
 *
 * UI for resolving data conflicts that occur during offline sync.
 * Shows local vs server data comparison and allows user to choose resolution.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  GitMerge,
  ArrowRight,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Database,
  Cloud,
  Smartphone,
  Info,
  Trash2
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { syncService, ConflictInfo } from '../../lib/syncService';
import {
  getUnresolvedConflicts,
  resolveConflict,
  ConflictRecord,
  OperationType
} from '../../lib/offline-db';
import Button from '../ui/Button';
import Card from '../ui/Card';

// ========== TYPES ==========

type Resolution = 'local' | 'server' | 'merged';

interface ConflictDisplayData {
  id: number;
  operationId: string;
  entityType: OperationType;
  entityId: string;
  localData: any;
  serverData: any;
  createdAt: number;
  differences: FieldDifference[];
}

interface FieldDifference {
  field: string;
  localValue: any;
  serverValue: any;
  type: 'added' | 'removed' | 'changed';
}

// ========== UTILITIES ==========

function getFieldDifferences(local: any, server: any): FieldDifference[] {
  const differences: FieldDifference[] = [];
  const allKeys = Array.from(new Set([...Object.keys(local || {}), ...Object.keys(server || {})]));

  for (const key of allKeys) {
    const localValue = local?.[key];
    const serverValue = server?.[key];

    if (localValue === undefined && serverValue !== undefined) {
      differences.push({ field: key, localValue, serverValue, type: 'removed' });
    } else if (localValue !== undefined && serverValue === undefined) {
      differences.push({ field: key, localValue, serverValue, type: 'added' });
    } else if (JSON.stringify(localValue) !== JSON.stringify(serverValue)) {
      differences.push({ field: key, localValue, serverValue, type: 'changed' });
    }
  }

  return differences;
}

function formatValue(value: any): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function getEntityTypeLabel(type: OperationType): string {
  const labels: Record<OperationType, string> = {
    transfer: 'Transfert',
    caisse: 'Opération Caisse',
    client: 'Client',
    payment: 'Paiement',
    epargne: 'Épargne',
    credit: 'Crédit',
    tontine: 'Tontine',
    remise: 'Remise',
    enquete: 'Enquête',
    other: 'Autre'
  };
  return labels[type] || type;
}

// ========== CONFLICT ITEM COMPONENT ==========

interface ConflictItemProps {
  conflict: ConflictDisplayData;
  onResolve: (id: number, resolution: Resolution, mergedData?: any) => Promise<void>;
  isResolving: boolean;
}

function ConflictItem({ conflict, onResolve, isResolving }: ConflictItemProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<Resolution | null>(null);
  const [mergedData, setMergedData] = useState<any>({});

  useEffect(() => {
    // Initialize merged data with server data, overlaying local changes
    setMergedData({ ...conflict.serverData, ...conflict.localData });
  }, [conflict]);

  const handleResolve = async (resolution: Resolution) => {
    setSelectedResolution(resolution);
    const dataToSend = resolution === 'merged' ? mergedData : undefined;
    await onResolve(conflict.id, resolution, dataToSend);
  };

  const toggleFieldInMerge = (field: string, useLocal: boolean) => {
    setMergedData((prev: any) => ({
      ...prev,
      [field]: useLocal ? conflict.localData[field] : conflict.serverData[field]
    }));
  };

  return (
    <Card className="mb-4 border-l-4 border-l-orange-500 bg-slate-800/50">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-orange-500/20 rounded-full">
            <AlertTriangle className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <h4 className="font-semibold text-white">{getEntityTypeLabel(conflict.entityType)}</h4>
            <p className="text-sm text-slate-400">
              ID: {conflict.entityId.slice(0, 8)}... • {conflict.differences.length} différence(s)
            </p>
            <p className="text-xs text-slate-500 mt-1">
              <Clock className="inline h-3 w-3 mr-1" />
              {new Date(conflict.createdAt).toLocaleString('fr-FR')}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          icon={expanded ? ChevronUp : ChevronDown}
        >
          {expanded ? 'Réduire' : 'Détails'}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">Champ</th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-blue-400" />
                      Local
                    </div>
                  </th>
                  <th className="text-left py-2 px-3 text-slate-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-green-400" />
                      Serveur
                    </div>
                  </th>
                  <th className="text-center py-2 px-3 text-slate-400 font-medium">Fusionner</th>
                </tr>
              </thead>
              <tbody>
                {conflict.differences.map((diff, idx) => (
                  <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                    <td className="py-2 px-3 font-medium text-white">
                      {diff.field}
                      {diff.type === 'added' && (
                        <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                          Nouveau
                        </span>
                      )}
                      {diff.type === 'removed' && (
                        <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                          Supprimé
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <code
                        className={`text-xs p-1 rounded ${
                          mergedData[diff.field] === diff.localValue
                            ? 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {formatValue(diff.localValue)}
                      </code>
                    </td>
                    <td className="py-2 px-3">
                      <code
                        className={`text-xs p-1 rounded ${
                          mergedData[diff.field] === diff.serverValue
                            ? 'bg-green-500/20 text-green-300 ring-1 ring-green-500'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {formatValue(diff.serverValue)}
                      </code>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => toggleFieldInMerge(diff.field, true)}
                          className={`p-1 rounded ${
                            mergedData[diff.field] === diff.localValue
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                          title="Utiliser valeur locale"
                        >
                          <Smartphone className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => toggleFieldInMerge(diff.field, false)}
                          className={`p-1 rounded ${
                            mergedData[diff.field] === diff.serverValue
                              ? 'bg-green-500 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                          title="Utiliser valeur serveur"
                        >
                          <Cloud className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resolution Buttons */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-700">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResolve('local')}
              disabled={isResolving}
              icon={Smartphone}
              className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
            >
              Garder local
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResolve('server')}
              disabled={isResolving}
              icon={Cloud}
              className="border-green-500/50 text-green-400 hover:bg-green-500/10"
            >
              Garder serveur
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleResolve('merged')}
              disabled={isResolving}
              icon={GitMerge}
            >
              Fusionner (sélection)
            </Button>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-slate-900/50 rounded-lg text-xs text-slate-400">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-300">Garder local</strong> : utilise vos modifications hors ligne.{' '}
              <strong className="text-slate-300">Garder serveur</strong> : utilise les données actuelles du serveur.{' '}
              <strong className="text-slate-300">Fusionner</strong> : combine les deux selon votre sélection ci-dessus.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ========== MAIN COMPONENT ==========

export function ConflictResolutionPanel() {
  const { t } = useLanguage();
  const [conflicts, setConflicts] = useState<ConflictDisplayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [recentConflict, setRecentConflict] = useState<ConflictInfo | null>(null);

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    try {
      const records = await getUnresolvedConflicts();
      const displayData: ConflictDisplayData[] = records.map((record) => {
        const localData = JSON.parse(record.localData);
        const serverData = JSON.parse(record.serverData);
        return {
          id: record.id!,
          operationId: record.operationId,
          entityType: record.entityType,
          entityId: record.entityId,
          localData,
          serverData,
          createdAt: record.createdAt,
          differences: getFieldDifferences(localData, serverData)
        };
      });
      setConflicts(displayData);
    } catch (error) {
      console.error('Error loading conflicts:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConflicts();

    // Subscribe to new conflicts
    const unsubscribe = syncService.subscribeToConflicts((conflict) => {
      setRecentConflict(conflict);
      loadConflicts();
    });

    return unsubscribe;
  }, [loadConflicts]);

  const handleResolve = async (id: number, resolution: Resolution, mergedData?: any) => {
    setResolving(id);
    try {
      const userId = localStorage.getItem('userId') || undefined;
      await resolveConflict(id, resolution, userId, mergedData);

      // If using local or merged, we need to re-queue the operation
      if (resolution === 'local' || resolution === 'merged') {
        const conflict = conflicts.find((c) => c.id === id);
        if (conflict) {
          const dataToSync = resolution === 'merged' ? mergedData : conflict.localData;
          // Re-add to sync queue with updated data
          // This will be handled by the sync service
        }
      }

      // Reload conflicts
      await loadConflicts();
    } catch (error) {
      console.error('Error resolving conflict:', error);
    }
    setResolving(null);
  };

  const handleResolveAll = async (resolution: 'local' | 'server') => {
    for (const conflict of conflicts) {
      await handleResolve(conflict.id, resolution);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-cyan-400" />
        <span className="ml-2 text-slate-400">Chargement des conflits...</span>
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <Card className="text-center py-8">
        <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-3" />
        <h3 className="text-lg font-semibold text-white mb-1">Aucun conflit</h3>
        <p className="text-slate-400">Toutes vos données sont synchronisées.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-full">
            <AlertTriangle className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Conflits de synchronisation</h2>
            <p className="text-sm text-slate-400">{conflicts.length} conflit(s) à résoudre</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handleResolveAll('server')} icon={Cloud}>
            Tout garder serveur
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleResolveAll('local')} icon={Smartphone}>
            Tout garder local
          </Button>
        </div>
      </div>

      {/* Recent conflict notification */}
      {recentConflict && (
        <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg animate-pulse">
          <AlertTriangle className="h-5 w-5 text-orange-400" />
          <p className="text-sm text-orange-200">
            Nouveau conflit détecté : {getEntityTypeLabel(recentConflict.entityType)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRecentConflict(null)}
            icon={XCircle}
            className="ml-auto"
          />
        </div>
      )}

      {/* Conflict List */}
      <div className="space-y-4">
        {conflicts.map((conflict) => (
          <ConflictItem
            key={conflict.id}
            conflict={conflict}
            onResolve={handleResolve}
            isResolving={resolving === conflict.id}
          />
        ))}
      </div>

      {/* Help Text */}
      <Card className="bg-slate-900/50 border-slate-700">
        <div className="flex items-start gap-3">
          <Database className="h-5 w-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-slate-300 mb-2">
              <strong>Pourquoi ces conflits ?</strong>
            </p>
            <p className="text-slate-400">
              Des conflits surviennent lorsque vous modifiez des données en mode hors ligne qui ont également été
              modifiées sur le serveur. Vous devez décider quelle version conserver ou fusionner les deux.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default ConflictResolutionPanel;
