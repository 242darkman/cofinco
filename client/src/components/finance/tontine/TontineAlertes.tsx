import React, { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, X, Clock, Check } from 'lucide-react';
import { Card, Badge, IconButton, TabGroup } from '../../ui';
import { alerteTontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import {
  PrioriteAlerteTontine,
  PrioriteAlerteTontineType,
  PRIORITE_ALERTE_TONTINE_LABELS,
  StatutAlerteTontine,
  StatutAlerteTontineType,
  STATUT_ALERTE_TONTINE_LABELS,
  TypeAlerteTontine,
  TypeAlerteTontineType,
  TYPE_ALERTE_TONTINE_LABELS,
} from '@shared/enum/status-constants';

interface TontineAlerte {
  id: string;
  tontine_id: string;
  membre_id: string | null;
  type_alerte: string;
  priorite: string;
  message: string;
  statut: string;
  created_at: string;
  tontine_membres?: {
    clients: {
      nom: string;
    };
  } | null;
}

interface TontineAlertesProps {
  tontineId: string;
}


export default function TontineAlertes({ tontineId }: TontineAlertesProps) {
  const [alertes, setAlertes] = useState<TontineAlerte[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | StatutAlerteTontineType>(StatutAlerteTontine.ACTIVE);

  const fetchAlertes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await alerteTontineApi.getByTontine(tontineId, {
        statut: filter === 'all' ? undefined : filter
      });
      setAlertes(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur chargement alertes'));
    } finally {
      setLoading(false);
    }
  }, [tontineId, filter]);

  useEffect(() => {
    fetchAlertes();
  }, [fetchAlertes]);

  const handleResolveAlerte = async (alerteId: string) => {
    try {
      await alerteTontineApi.resolve(alerteId);
      toast.success('Alerte résolue');
      fetchAlertes();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur résolution alerte'));
    }
  };

  const handleIgnoreAlerte = async (alerteId: string) => {
    try {
      await alerteTontineApi.ignore(alerteId);
      toast.success('Alerte ignorée');
      fetchAlertes();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur ignorer alerte'));
    }
  };

  const getPrioriteVariant = (priorite: string): 'danger' | 'warning' | 'info' | 'neutral' => {
    switch (priorite as PrioriteAlerteTontineType) {
      case PrioriteAlerteTontine.URGENT: return 'danger';
      case PrioriteAlerteTontine.HIGH: return 'warning';
      case PrioriteAlerteTontine.NORMAL: return 'info';
      default: return 'neutral';
    }
  };

  const getPrioriteLabel = (priorite: string): string => {
    return PRIORITE_ALERTE_TONTINE_LABELS[priorite as PrioriteAlerteTontineType] || priorite;
  };

  const getTypeIcon = (type: string) => {
    switch (type as TypeAlerteTontineType) {
      case TypeAlerteTontine.PAYMENT_LATE: return <AlertTriangle size={18} />;
      case TypeAlerteTontine.DEADLINE_NEAR: return <Clock size={18} />;
      case TypeAlerteTontine.DISTRIBUTION_DUE: return <Bell size={18} />;
      case TypeAlerteTontine.CYCLE_COMPLETE: return <CheckCircle size={18} />;
      case TypeAlerteTontine.MEMBER_DROPOUT: return <Info size={18} />;
      default: return <Bell size={18} />;
    }
  };

  const getTypeLabel = (type: string): string => {
    return TYPE_ALERTE_TONTINE_LABELS[type as TypeAlerteTontineType] || type;
  };

  const getStatutLabel = (statut: string): string => {
    return STATUT_ALERTE_TONTINE_LABELS[statut as StatutAlerteTontineType] || statut;
  };

  const isAlertActive = (statut: string): boolean => {
    return statut === StatutAlerteTontine.ACTIVE;
  };

  const isAlertResolved = (statut: string): boolean => {
    return statut === StatutAlerteTontine.RESOLVED;
  };

  const isAlertUrgent = (priorite: string): boolean => {
    return priorite === PrioriteAlerteTontine.URGENT;
  };

  const isAlertHigh = (priorite: string): boolean => {
    return priorite === PrioriteAlerteTontine.HIGH;
  };

  const alertesActives = alertes.filter(a => isAlertActive(a.statut));
  const alertesUrgentes = alertesActives.filter(a => isAlertUrgent(a.priorite));

  // Tabs avec labels FR
  const filterTabs = [
    { key: 'all', label: 'Toutes' },
    { key: StatutAlerteTontine.ACTIVE, label: STATUT_ALERTE_TONTINE_LABELS[StatutAlerteTontine.ACTIVE] },
    { key: StatutAlerteTontine.RESOLVED, label: STATUT_ALERTE_TONTINE_LABELS[StatutAlerteTontine.RESOLVED] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Bell size={20} className="text-cyan-400" />
            Alertes
            {alertesUrgentes.length > 0 && (
               <Badge variant="danger" value={`${alertesUrgentes.length} urgentes`} />
            )}
          </h3>
        </div>

        <TabGroup
            tabs={filterTabs}
            activeTab={filter}
            onTabChange={(id) => setFilter(id as any)}
            variant="pills"
            size="sm"
        />
      </div>

      {loading && alertes.length === 0 ? (
        <div className="text-center py-12 text-slate-400">Chargement...</div>
      ) : alertes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 border-dashed border-slate-700 bg-slate-800/30">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <CheckCircle className="text-emerald-500" size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Aucune alerte</h3>
          <p className="text-slate-400 text-sm">Tout est en ordre pour le moment</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {alertes.map((alerte) => (
            <Card
              key={alerte.id}
              className={`
                 p-4 border-l-4 transition-all
                 ${isAlertUrgent(alerte.priorite) ? 'border-l-red-500 bg-red-900/10' :
                   isAlertHigh(alerte.priorite) ? 'border-l-amber-500 bg-amber-900/10' :
                   'border-l-cyan-500/50 bg-slate-800/50'}
                 ${isAlertResolved(alerte.statut) ? 'opacity-60 grayscale' : ''}
              `}
            >
              <div className="flex gap-4">
                <div className={`
                    shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                    ${isAlertUrgent(alerte.priorite) ? 'bg-red-500/20 text-red-400' :
                      isAlertHigh(alerte.priorite) ? 'bg-amber-500/20 text-amber-400' :
                      'bg-cyan-500/20 text-cyan-400'}
                `}>
                  {getTypeIcon(alerte.type_alerte)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                        <div className="flex items-center gap-2">
                             <span className="font-bold text-white text-sm">{getTypeLabel(alerte.type_alerte)}</span>
                             <Badge variant={getPrioriteVariant(alerte.priorite)} value={getPrioriteLabel(alerte.priorite)} className="text-[10px] py-0" />
                        </div>
                        <p className="text-sm text-slate-300 mt-1">{alerte.message}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                       {new Date(alerte.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>

                  {alerte.tontine_membres && (
                    <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                        <span>Membre:</span>
                        <span className="text-slate-300 font-medium">{alerte.tontine_membres.clients.nom}</span>
                    </div>
                  )}

                  {isAlertActive(alerte.statut) && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/50 justify-end">
                         <IconButton
                            icon={Check}
                            onClick={() => handleResolveAlerte(alerte.id)}
                            size="sm"
                            className="bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            aria-label="Résoudre"
                         />
                         <IconButton
                            icon={X}
                            onClick={() => handleIgnoreAlerte(alerte.id)}
                            size="sm"
                            className="bg-slate-700/50 text-slate-400 hover:bg-slate-700"
                            aria-label="Ignorer"
                         />
                      </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
