/**
 * Reusable Bulk Operations Toolbar
 * Provides select all, action dropdown, and progress display
 */

import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  MinusSquare,
  ChevronDown,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export interface BulkAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'danger' | 'warning' | 'success';
  requiresConfirmation?: boolean;
  confirmMessage?: string;
}

export interface BulkOperationsToolbarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  onToggleAll: () => void;
  onClearSelection: () => void;
  actions: BulkAction[];
  onAction: (actionId: string) => void;
  isExecuting?: boolean;
  progress?: { current: number; total: number };
  results?: { successCount: number; failureCount: number };
  disabled?: boolean;
  className?: string;
}

export default function BulkOperationsToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  isPartiallySelected,
  onToggleAll,
  onClearSelection,
  actions,
  onAction,
  isExecuting = false,
  progress,
  results,
  disabled = false,
  className = '',
}: BulkOperationsToolbarProps) {
  const [showActions, setShowActions] = useState(false);
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);

  const handleActionClick = (action: BulkAction) => {
    if (action.requiresConfirmation) {
      setConfirmAction(action);
    } else {
      onAction(action.id);
    }
    setShowActions(false);
  };

  const handleConfirm = () => {
    if (confirmAction) {
      onAction(confirmAction.id);
      setConfirmAction(null);
    }
  };

  const getCheckboxIcon = () => {
    if (isAllSelected) {
      return <CheckSquare className="text-indigo-400" size={20} />;
    }
    if (isPartiallySelected) {
      return <MinusSquare className="text-indigo-400" size={20} />;
    }
    return <Square className="text-slate-400" size={20} />;
  };

  const getActionButtonClass = (variant: string = 'default') => {
    const base = 'w-full px-4 py-2 text-left hover:bg-slate-700/50 transition flex items-center gap-3 text-sm';
    switch (variant) {
      case 'danger':
        return `${base} text-red-400 hover:text-red-300`;
      case 'warning':
        return `${base} text-amber-400 hover:text-amber-300`;
      case 'success':
        return `${base} text-emerald-400 hover:text-emerald-300`;
      default:
        return `${base} text-slate-300 hover:text-white`;
    }
  };

  return (
    <div className={`flex items-center gap-4 p-3 bg-slate-800/50 rounded-xl border border-slate-700 ${className}`}>
      {/* Select All Checkbox */}
      <button
        onClick={onToggleAll}
        disabled={disabled || totalCount === 0}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-700/50 transition disabled:opacity-50"
      >
        {getCheckboxIcon()}
        <span className="text-sm text-slate-300">
          {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
        </span>
      </button>

      {/* Selection Count */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg">
        <span className="text-sm font-medium text-white">{selectedCount}</span>
        <span className="text-sm text-slate-400">/ {totalCount} sélectionné(s)</span>
      </div>

      {/* Actions Dropdown */}
      {selectedCount > 0 && !isExecuting && (
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            disabled={disabled}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition disabled:opacity-50"
          >
            Actions
            <ChevronDown size={16} className={`transition-transform ${showActions ? 'rotate-180' : ''}`} />
          </button>

          {showActions && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
              <div className="absolute left-0 top-full mt-2 w-56 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden z-50">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action)}
                    className={getActionButtonClass(action.variant)}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Clear Selection */}
      {selectedCount > 0 && !isExecuting && (
        <button
          onClick={onClearSelection}
          className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition"
        >
          Effacer la sélection
        </button>
      )}

      {/* Progress Display */}
      {isExecuting && progress && (
        <div className="flex items-center gap-3 px-4 py-2 bg-indigo-600/20 rounded-lg border border-indigo-500/30">
          <Loader2 className="animate-spin text-indigo-400" size={18} />
          <div className="text-sm">
            <span className="text-white font-medium">{progress.current}</span>
            <span className="text-slate-400"> / {progress.total}</span>
          </div>
          <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results Display */}
      {results && !isExecuting && (results.successCount > 0 || results.failureCount > 0) && (
        <div className="flex items-center gap-4 px-4 py-2 bg-slate-700/50 rounded-lg">
          {results.successCount > 0 && (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle size={16} />
              <span className="text-sm">{results.successCount} réussi(s)</span>
            </div>
          )}
          {results.failureCount > 0 && (
            <div className="flex items-center gap-2 text-red-400">
              <XCircle size={16} />
              <span className="text-sm">{results.failureCount} échoué(s)</span>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-700 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-amber-500/20 rounded-xl">
                <AlertTriangle className="text-amber-400" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-white">Confirmer l'action</h3>
            </div>

            <p className="text-slate-300 mb-6">
              {confirmAction.confirmMessage ||
                `Êtes-vous sûr de vouloir exécuter "${confirmAction.label}" sur ${selectedCount} élément(s) ?`}
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-slate-300 hover:text-white transition"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  confirmAction.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
