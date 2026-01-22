
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
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center p-8 text-slate-500">
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
    if (s.includes('approuv') || s.includes('décaiss')) return 'bg-emerald-500 text-white border-emerald-500';
    if (s.includes('rejet') || s.includes('annul') || s.includes('supp')) return 'bg-red-500 text-white border-red-500';
    if (s.includes('cours')) return 'bg-blue-500 text-white border-blue-500';
    if (type === 'REEVALUATION') return 'bg-amber-500 text-black border-amber-500';
    
    // Fallback to standard status colors if available
    if (ALL_STATUS_COLORS[statut as keyof typeof ALL_STATUS_COLORS]) {
      // Convert standard bg/text classes to border style used here if needed, 
      // but for dots we usually need strong backgrounds.
      // Let's keep manual overrides for the dot icons to ensure visibility
    }
    
    // Check properly for DELETED/Supprimée
    if (statut === 'DELETED' || statut === 'Supprimée') return 'bg-red-500 text-white border-red-500';

    return 'bg-slate-700 text-slate-300 border-slate-600';
  };

  return (
    <div className={`space-y-6 ${compact ? 'max-w-md' : 'w-full'}`}>
      {!compact && demandeInfo && (
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-white">Historique du dossier</h3>
            <p className="text-sm text-slate-400">
              Dossier N° {demandeInfo.numeroDemande} • {format(new Date(), 'dd MMM yyyy', { locale: fr })}
            </p>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-sm text-slate-300">
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
                  <div className="absolute top-8 bottom-[-32px] w-0.5 bg-slate-700 -z-0"></div>
                )}
                
                {/* Icon Dot */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-slate-900 ${colorClass} z-10 shrink-0`}>
                  {getIcon(event.type, event.statut)}
                </div>
              </div>

              {/* Content Column */}
              <div className="flex-1 min-w-0">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                    <div className="font-bold text-white text-base truncate">
                      {event.titre}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1 bg-slate-900/50 px-2 py-1 rounded w-fit text-nowrap">
                      <Calendar size={12} />
                      {format(new Date(event.date), 'dd MMM HH:mm', { locale: fr })}
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 mb-2 break-words">
                    {event.description}
                  </p>

                  {event.details && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50 text-sm">
                      {event.type === 'REEVALUATION' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-slate-900/30 p-2 rounded">
                            <span className="text-slate-500 text-xs block">Score Initial</span>
                            <span className="text-red-400 font-mono">{event.details.scoreAvant || '-'}</span>
                          </div>
                          {event.details.scoreApres && (
                          <div className="bg-slate-900/30 p-2 rounded">
                            <span className="text-slate-500 text-xs block">Nouveau Score</span>
                            <span className="text-emerald-400 font-mono">{event.details.scoreApres}</span>
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
                       'bg-slate-700/30 text-slate-400 border-slate-600')
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
