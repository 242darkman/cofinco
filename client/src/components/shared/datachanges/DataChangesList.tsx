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
        <p className="text-content-muted">Chargement des modifications...</p>
      </div>
    );
  }

  if (changes.length === 0) {
    return (
      <div className="text-center py-12 text-content-muted">
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
          className="bg-surface hover:bg-surface-elevated border-edge cursor-pointer transition-colors"
        >
          <div className="p-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <Badge 
                  value={change.operation} 
                  variant={getOperationVariant(change.operation)}
                />
                <span className="text-accent font-semibold truncate">{change.tableName}</span>
                <span className="text-content-muted text-sm whitespace-nowrap">
                  {formatTimestamp(change.timestamp)}
                </span>
              </div>
              <div className="text-content-secondary text-sm truncate">
                Par: <span className="text-content-primary font-semibold">{change.userEmail || 'Système'}</span>
              </div>
              <div className="text-content-muted text-xs font-mono truncate">
                ID: {change.recordId || '—'}
              </div>
            </div>
            <GitCompare className="text-content-muted ml-4 flex-shrink-0" size={20} />
          </div>
        </Card>
      ))}
    </div>
  );
}
