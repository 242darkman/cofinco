/**
 * ReevaluationWorkflowPage - Page principale de gestion des réévaluations
 * Combine la liste et le détail en vue master-detail
 */

import React, { useState } from 'react';
import { RefreshCw, ArrowLeft, List, Eye } from 'lucide-react';
import { ReevaluationList } from './ReevaluationList';
import { ReevaluationCockpit } from './ReevaluationCockpit';

interface Reevaluation {
  id: string;
  numeroReevaluation: string;
  statut: string;
  [key: string]: any;
}

interface ReevaluationWorkflowPageProps {
  demandeId?: string; // If provided, filters to this demande only
  onClose?: () => void;
  embedded?: boolean; // If true, renders without full page wrapper
  onWorkflowChange?: () => void;
}

export function ReevaluationWorkflowPage({ demandeId, onClose, embedded = false, onWorkflowChange }: ReevaluationWorkflowPageProps) {
  const [selectedReevaluation, setSelectedReevaluation] = useState<Reevaluation | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  const handleSelect = (reevaluation: Reevaluation) => {
    setSelectedReevaluation(reevaluation);
    setViewMode('detail');
  };

  const handleBack = () => {
    setSelectedReevaluation(null);
    setViewMode('list');
  };

  const handleStatusChange = () => {
    // Refresh list when status changes
    setViewMode('list');
    setSelectedReevaluation(null);
    onWorkflowChange?.();
  };

  const content = (
    <>
      {viewMode === 'list' ? (
        <ReevaluationList
          demandeId={demandeId}
          onSelect={handleSelect}
          showFilters={!demandeId}
        />
      ) : selectedReevaluation ? (
        <ReevaluationCockpit
          reevaluationId={selectedReevaluation.id}
          onBack={handleBack}
          onStatusChange={handleStatusChange}
        />
      ) : null}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-surface-base p-6">
      <div className={`mx-auto ${viewMode === 'detail' ? 'max-w-7xl' : 'max-w-4xl'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-surface rounded-lg transition"
              >
                <ArrowLeft className="text-content-muted" size={20} />
              </button>
            )}
            <RefreshCw className="text-status-warning" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-content-primary">Gestion des Réévaluations</h1>
              <p className="text-content-muted text-sm">
                Suivez et gérez les demandes de réévaluation de crédit
              </p>
            </div>
          </div>

          {/* View toggles */}
          <div className="flex items-center gap-2 bg-surface rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition ${viewMode === 'list' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted'}`}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => selectedReevaluation && setViewMode('detail')}
              disabled={!selectedReevaluation}
              className={`p-2 rounded transition ${viewMode === 'detail' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted'} disabled:opacity-30`}
            >
              <Eye size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-surface/30 border border-edge rounded-2xl p-6">
          {content}
        </div>
      </div>
    </div>
  );
}

export default ReevaluationWorkflowPage;
