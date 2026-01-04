import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, Info, CheckCircle, X, Clock, Check } from 'lucide-react';
import { Card, Badge, IconButton, Button, TabGroup } from '../../ui';

interface TontineAlerte {
  id: string;
  tontine_id: string;
  membre_id: string | null;
  type_alerte: 'retard_paiement' | 'echeance_proche' | 'distribution_due' | 'tour_complet' | 'membre_inactif';
  priorite: 'Basse' | 'Normale' | 'Haute' | 'Urgente';
  message: string;
  statut: 'Active' | 'Résolue' | 'Ignorée';
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
  const [filter, setFilter] = useState<'all' | 'Active' | 'Résolue'>('Active');

  useEffect(() => {
    fetchAlertes();
  }, [tontineId, filter]);

  const fetchAlertes = async () => {
    setLoading(true);
    try {
      const url = `/api/tontines/${tontineId}/alertes${filter !== 'all' ? `?status=${filter}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement alertes');
      
      const data = await res.json();
      setAlertes(data || []);
    } catch (error) {
      console.error('Erreur chargement alertes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlerte = async (alerteId: string) => {
    try {
      const res = await fetch(`/api/tontine-alertes/${alerteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'Résolue' }),
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Erreur résolution alerte');
      
      fetchAlertes();
    } catch (error) {
      console.error('Erreur résolution alerte:', error);
    }
  };

  const handleIgnoreAlerte = async (alerteId: string) => {
    try {
      const res = await fetch(`/api/tontine-alertes/${alerteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'Ignorée' }),
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error('Erreur ignorer alerte');
      
      fetchAlertes();
    } catch (error) {
      console.error('Erreur ignorer alerte:', error);
    }
  };

  const getPrioriteVariant = (priorite: string): 'danger' | 'warning' | 'info' | 'neutral' => {
    switch (priorite) {
      case 'Urgente': return 'danger';
      case 'Haute': return 'warning';
      case 'Normale': return 'info';
      default: return 'neutral';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'retard_paiement': return <AlertTriangle size={18} />;
      case 'echeance_proche': return <Clock size={18} />;
      case 'distribution_due': return <Bell size={18} />;
      case 'tour_complet': return <CheckCircle size={18} />;
      case 'membre_inactif': return <Info size={18} />;
      default: return <Bell size={18} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'retard_paiement': return 'Retard de paiement';
      case 'echeance_proche': return 'Échéance proche';
      case 'distribution_due': return 'Distribution requise';
      case 'tour_complet': return 'Tour complété';
      case 'membre_inactif': return 'Membre inactif';
      default: return type;
    }
  };

  const alertesActives = alertes.filter(a => a.statut === 'Active');
  const alertesUrgentes = alertesActives.filter(a => a.priorite === 'Urgente');

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
            tabs={[
                { key: 'all', label: 'Toutes' },
                { key: 'Active', label: 'Actives' },
                { key: 'Résolue', label: 'Résolues' }
            ]}
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
                 ${alerte.priorite === 'Urgente' ? 'border-l-red-500 bg-red-900/10' : 
                   alerte.priorite === 'Haute' ? 'border-l-amber-500 bg-amber-900/10' : 
                   'border-l-cyan-500/50 bg-slate-800/50'}
                 ${alerte.statut === 'Résolue' ? 'opacity-60 grayscale' : ''}
              `}
            >
              <div className="flex gap-4">
                <div className={`
                    shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                    ${alerte.priorite === 'Urgente' ? 'bg-red-500/20 text-red-400' :
                      alerte.priorite === 'Haute' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-cyan-500/20 text-cyan-400'}
                `}>
                  {getTypeIcon(alerte.type_alerte)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                        <div className="flex items-center gap-2">
                             <span className="font-bold text-white text-sm">{getTypeLabel(alerte.type_alerte)}</span>
                             <Badge variant={getPrioriteVariant(alerte.priorite)} value={alerte.priorite} className="text-[10px] py-0" />
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

                  {alerte.statut === 'Active' && (
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
