import React from 'react';
import { GitCompare, X } from 'lucide-react';
import { DataChange } from '../../../hooks/useDataChanges';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';

interface DataChangesDetailModalProps {
  change: DataChange | null;
  onClose: () => void;
  formatTimestamp: (timestamp?: string) => string;
}

export default function DataChangesDetailModal({ change, onClose, formatTimestamp }: DataChangesDetailModalProps) {
  if (!change) return null;

  const getOperationVariant = (operation: string) => {
     switch (operation) {
       case 'INSERT': return 'success';
       case 'UPDATE': return 'info';
       case 'DELETE': return 'danger';
       default: return 'neutral';
     }
  };

  const renderDiff = (oldData: any, newData: any, changedFields: any) => {
    if (!oldData && !newData) return null;

    const fields = changedFields?.changes ? Object.keys(changedFields.changes) : [];

    if (fields.length === 0 && oldData && newData) {
      const allFields = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
      return Array.from(allFields).map(field => {
        const oldValue = oldData[field];
        const newValue = newData[field];
        if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return null;

        return (
          <div key={field} className="bg-slate-800 rounded-lg p-3 mb-2 border border-slate-700">
            <div className="font-semibold text-cyan-400 mb-2">{field}</div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
                <div className="text-xs text-blue-400 mb-1">Avant</div>
                <div className="text-white text-sm break-all font-mono">
                  {oldValue !== null && oldValue !== undefined ? String(oldValue) : '-'}
                </div>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
                <div className="text-xs text-green-400 mb-1">Après</div>
                <div className="text-white text-sm break-all font-mono">
                  {newValue !== null && newValue !== undefined ? String(newValue) : '-'}
                </div>
              </div>
            </div>
          </div>
        );
      });
    }

    return fields.map(field => {
      const changeDetail = changedFields.changes[field];
      return (
        <div key={field} className="bg-slate-800 rounded-lg p-3 mb-2 border border-slate-700">
          <div className="font-semibold text-cyan-400 mb-2">{field}</div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded p-2">
              <div className="text-xs text-blue-400 mb-1">Avant</div>
              <div className="text-white text-sm break-all font-mono">
                {JSON.stringify(changeDetail?.old, null, 2) || '-'}
              </div>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded p-2">
              <div className="text-xs text-green-400 mb-1">Après</div>
              <div className="text-white text-sm break-all font-mono">
                {JSON.stringify(changeDetail?.new, null, 2) || '-'}
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <Modal
       isOpen={!!change}
       onClose={onClose}
       title={`Détails: ${change.operation} sur ${change.table_name}`}
       size="xl"
    >
        <div className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <div className="text-sm text-slate-400 mb-1">Opération</div>
              <Badge value={change.operation} variant={getOperationVariant(change.operation)} size="lg" />
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <div className="text-sm text-slate-400 mb-1">Table</div>
              <div className="text-white font-semibold">{change.table_name}</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <div className="text-sm text-slate-400 mb-1">Date</div>
              <div className="text-white">{formatTimestamp(change.timestamp)}</div>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="text-sm text-slate-400 mb-2">Utilisateur</div>
            <div className="text-white font-semibold">{change.user_email || 'Système'}</div>
          </div>

          <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center gap-2 mb-4">
              <GitCompare className="text-emerald-400" size={24} />
              <h3 className="text-lg font-bold text-white">Comparaison des Données</h3>
            </div>
            {change.operation === 'DELETE' ? (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="text-blue-400 font-semibold mb-2">Données supprimées</div>
                <pre className="text-white text-sm bg-slate-950 p-3 rounded overflow-x-auto border border-slate-800">
                  {JSON.stringify(change.old_data, null, 2)}
                </pre>
              </div>
            ) : change.operation === 'INSERT' ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                <div className="text-green-400 font-semibold mb-2">Données créées</div>
                <pre className="text-white text-sm bg-slate-950 p-3 rounded overflow-x-auto border border-slate-800">
                  {JSON.stringify(change.new_data, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto pr-2">
                {renderDiff(change.old_data, change.new_data, change.changed_fields)}
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
             <Button onClick={onClose} variant="secondary">Fermer</Button>
        </div>
    </Modal>
  );
}
