/**
 * ReevaluationWorkflowPage - Page principale de gestion des réévaluations
 * Combine la liste et le détail en vue master-detail
 */

import React, { useState } from 'react';
import { RefreshCw, ArrowLeft, List, Eye } from 'lucide-react';
import { ReevaluationList } from './ReevaluationList';
import { ReevaluationDetailPanel } from './ReevaluationDetailPanel';

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
        <ReevaluationDetailPanel
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
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-lg transition"
              >
                <ArrowLeft className="text-slate-400" size={20} />
              </button>
            )}
            <RefreshCw className="text-amber-400" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-white">Gestion des Réévaluations</h1>
              <p className="text-slate-400 text-sm">
                Suivez et gérez les demandes de réévaluation de crédit
              </p>
            </div>
          </div>

          {/* View toggles */}
          <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded transition ${viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
            >
              <List size={18} />
            </button>
            <button
              onClick={() => selectedReevaluation && setViewMode('detail')}
              disabled={!selectedReevaluation}
              className={`p-2 rounded transition ${viewMode === 'detail' ? 'bg-slate-700 text-white' : 'text-slate-400'} disabled:opacity-30`}
            >
              <Eye size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="bg-slate-800/30 border border-slate-700 rounded-2xl p-6">
          {content}
        </div>
      </div>
    </div>
  );
}

export default ReevaluationWorkflowPage;
