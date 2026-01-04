import React from 'react';
import { GitCompare } from 'lucide-react';
import { DataChange } from '../../../hooks/useDataChanges';
import Badge from '../../ui/Badge';
import Card from '../../ui/Card';
import LoadingSpinner from '../../ui/LoadingSpinner';

interface DataChangesListProps {
  changes: DataChange[];
  loading: boolean;
  onSelect: (change: DataChange) => void;
  formatTimestamp: (timestamp?: string) => string;
}

export default function DataChangesList({ changes, loading, onSelect, formatTimestamp }: DataChangesListProps) {
  const getOperationVariant = (operation: string) => {
    switch (operation) {
      case 'INSERT': return 'success';
      case 'UPDATE': return 'info';
      case 'DELETE': return 'danger';
      case 'LOGIN': return 'success';
      case 'LOGOUT': return 'neutral';
      default: return 'neutral';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="flex justify-center mb-4">
          <LoadingSpinner size="lg" />
        </div>
        <p className="text-slate-400">Chargement des modifications...</p>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        Aucune modification trouvée
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {changes.map((change) => (
        <Card
          key={change.id}
          onClick={() => onSelect(change)}
          className="bg-slate-800 hover:bg-slate-700 border-slate-700 cursor-pointer transition-colors"
        >
          <div className="p-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <Badge 
                  value={change.operation} 
                  variant={getOperationVariant(change.operation)}
                />
                <span className="text-cyan-400 font-semibold truncate">{change.table_name}</span>
                <span className="text-slate-400 text-sm whitespace-nowrap">
                  {formatTimestamp(change.timestamp)}
                </span>
              </div>
              <div className="text-slate-300 text-sm truncate">
                Par: <span className="text-white font-semibold">{change.user_email || 'Système'}</span>
              </div>
              <div className="text-slate-500 text-xs font-mono truncate">
                ID: {change.record_id || '—'}
              </div>
            </div>
            <GitCompare className="text-slate-500 ml-4 flex-shrink-0" size={20} />
          </div>
        </Card>
      ))}
    </div>
  );
}
