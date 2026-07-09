
import React, { useEffect, useState } from 'react';
import { 
  FileText, CheckCircle, XCircle, RefreshCw, 
  ArrowRight, Clock, AlertCircle, DollarSign,
  Calendar, Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import { 
  getStatusLabel, 
  ALL_STATUS_LABELS,
  ALL_STATUS_COLORS 
} from '@/lib/status-labels';

interface TimelineEvent {
  id: string;
  type: 'DEMANDE' | 'REEVALUATION' | 'ENQUETE' | 'DECISION' | 'DECAISSEMENT';
  date: string;
  titre: string;
  description: string;
  statut: string;
  details?: any;
}

interface CreditTimelineProps {
  demandeId: string;
  compact?: boolean;
}

export function CreditTimeline({ demandeId, compact = false }: CreditTimelineProps) {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [demandeInfo, setDemandeInfo] = useState<any>(null);

  useEffect(() => {
    if (!demandeId) return;

    setLoading(true);
    fetch(`/api/demandes-credit/${demandeId}/timeline`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTimeline(data.timeline);
          setDemandeInfo(data.demande);
        }
      })
      .catch(err => {
        console.error("Erreur chargement timeline:", err);
      })
      .finally(() => setLoading(false));
  }, [demandeId]);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin text-content-muted" />
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center p-8 text-content-muted">
        Aucun historique disponible
      </div>
    );
  }

  const getIcon = (type: string, statut: string) => {
    switch (type) {
      case 'DEMANDE':
        return <FileText size={18} />;
      case 'REEVALUATION':
        return <RefreshCw size={18} />;
      case 'ENQUETE':
        return <Shield size={18} />;
      case 'DECISION':
        return statut.includes('Approuv') ? <CheckCircle size={18} /> : <XCircle size={18} />;
      case 'DECAISSEMENT':
        return <DollarSign size={18} />;
      default:
        return <Clock size={18} />;
    }
  };

  const getColor = (type: string, statut: string) => {
    // Check specific timeline colors first
    const s = statut.toLowerCase();
    if (s.includes('approuv') || s.includes('décaiss')) return 'bg-status-success text-white border-status-success';
    if (s.includes('rejet') || s.includes('annul') || s.includes('supp')) return 'bg-status-danger text-white border-status-danger';
    if (s.includes('cours')) return 'bg-status-info text-white border-status-info';
    if (type === 'REEVALUATION') return 'bg-status-warning text-black border-status-warning';
    
    // Fallback to standard status colors if available
    if (ALL_STATUS_COLORS[statut as keyof typeof ALL_STATUS_COLORS]) {
      // Convert standard bg/text classes to border style used here if needed, 
      // but for dots we usually need strong backgrounds.
      // Let's keep manual overrides for the dot icons to ensure visibility
    }
    
    // Check for DELETED status (label "Supprimée" is already caught by s.includes('supp') above)
    if (statut === 'DELETED') return 'bg-status-danger text-white border-status-danger';

    return 'bg-surface-elevated text-content-secondary border-edge-strong';
  };

  return (
    <div className={`space-y-6 ${compact ? 'max-w-md' : 'w-full'}`}>
      {!compact && demandeInfo && (
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-edge">
          <div>
            <h3 className="text-lg font-bold text-content-primary">Historique du dossier</h3>
            <p className="text-sm text-content-muted">
              Dossier N° {demandeInfo.numeroDemande} • {format(new Date(), 'dd MMM yyyy', { locale: fr })}
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-surface border border-edge text-sm text-content-secondary">
            {timeline.length} événement(s)
          </div>
        </div>
      )}

      <div className="space-y-8">
        {timeline.map((event, idx) => {
          const isLast = idx === timeline.length - 1;
          const colorClass = getColor(event.type, event.statut);
          
          return (
            <div key={event.id} className="flex gap-4">
              {/* Timeline Column */}
              <div className="flex flex-col items-center relative min-w-[32px]">
                {/* Vertical Line */}
                {!isLast && (
                  <div className="absolute top-8 bottom-[-32px] w-0.5 bg-surface-elevated -z-0"></div>
                )}
                
                {/* Icon Dot */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-edge ${colorClass} z-10 shrink-0`}>
                  {getIcon(event.type, event.statut)}
                </div>
              </div>

              {/* Content Column */}
              <div className="flex-1 min-w-0">
                <div className="bg-surface/50 rounded-xl p-4 border border-edge-subtle hover:border-edge-strong transition-colors">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                    <div className="font-bold text-content-primary text-base truncate">
                      {event.titre}
                    </div>
                    <div className="text-xs text-content-muted flex items-center gap-1 bg-surface-base/50 px-2 py-1 rounded w-fit text-nowrap">
                      <Calendar size={12} />
                      {format(new Date(event.date), 'dd MMM HH:mm', { locale: fr })}
                    </div>
                  </div>

                  <p className="text-sm text-content-secondary mb-2 break-words">
                    {event.description}
                  </p>

                  {event.details && (
                    <div className="mt-3 pt-3 border-t border-edge-subtle text-sm">
                      {event.type === 'REEVALUATION' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-surface-base/30 p-2 rounded">
                            <span className="text-content-muted text-xs block">Score Initial</span>
                            <span className="text-status-danger font-mono">{event.details.scoreAvant || '-'}</span>
                          </div>
                          {event.details.scoreApres && (
                          <div className="bg-surface-base/30 p-2 rounded">
                            <span className="text-content-muted text-xs block">Nouveau Score</span>
                            <span className="text-status-success font-mono">{event.details.scoreApres}</span>
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                   <div className="mt-2 flex items-center gap-2 flex-wrap">
                     <span className={`text-xs px-2 py-0.5 rounded-full border ${
                       // Use standard colors for the badge text
                       ALL_STATUS_COLORS[event.statut as keyof typeof ALL_STATUS_COLORS] || 
                       (event.statut === 'DELETED' ? ALL_STATUS_COLORS['DELETED'] : 
                       'bg-surface-elevated/30 text-content-muted border-edge-strong')
                     }`}>
                       {getStatusLabel(event.statut, ALL_STATUS_LABELS)}
                     </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
