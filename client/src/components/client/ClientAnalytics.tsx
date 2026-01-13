import type { Client } from '@shared/schema';
import React, { useState, useEffect } from 'react';
import { DollarSign, Target, Award, CreditCard, Wallet, Users, Activity } from 'lucide-react';
import ClientTags from './ClientTags';
import { Card, Badge } from '../ui';

interface ClientActivity {
  id: string;
  client_id: string;
  activity_type: string;
  activity_description: string;
  created_at: string;
  metadata?: any;
}

interface ClientAnalyticsProps {
  client: Client;
}

export default function ClientAnalytics({ client }: ClientAnalyticsProps) {
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, [client.id]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/client-activities?client_id=${client.id}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur chargement');
      const data = await response.json();
      setActivities(data || []);
    } catch (error) {
      console.error('Erreur chargement activités:', error);
    } finally {
      setLoading(false);
    }
  };

  const creditTotal = Number(client.creditTotal) || 0;
  const epargneTotal = Number(client.epargneTotal) || 0;
  const tauxRemboursement = client.tauxRemboursement !== null ? Number(client.tauxRemboursement) : 0;
  const pointsFidelite = typeof client.pointsFidelite === 'number' ? client.pointsFidelite : (client.pointsFidelite ? Number(client.pointsFidelite) : 0);

  const stats = {
    creditTotal,
    epargneTotal,
    tauxRemboursement,
    pointsFidelite,
    anciennete: client.dateInscription
      ? Math.floor((new Date().getTime() - new Date(client.dateInscription).getTime()) / (1000 * 60 * 60 * 24))
      : 0
  };

  const activityCounts = {
    credits: activities.filter(a => a.activity_type === 'credit').length,
    epargnes: activities.filter(a => a.activity_type === 'epargne').length,
    tontines: activities.filter(a => a.activity_type === 'tontine').length,
    payments: activities.filter(a => a.activity_type === 'payment').length
  };

  return (
    <div className="space-y-4">
      {/* 1. Segment & Fidélité Card - Unified Pro View */}
      <Card variant="elevated" className="relative overflow-hidden border-blue-500/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

        <div className="relative z-10 flex flex-col sm:flex-row gap-6">
            {/* Points Fidélité Area */}
            <div className="flex-1 flex items-center justify-center sm:justify-start gap-4">
                <div className="relative w-20 h-20 flex items-center justify-center bg-cyan-500/10 rounded-full border border-cyan-500/30">
                    <Award size={32} className="text-cyan-400" />
                </div>
                <div>
                     <p className="text-xs text-slate-500 uppercase font-semibold">Points Fidélité</p>
                     <p className="text-2xl font-bold text-cyan-400">{stats.pointsFidelite.toLocaleString()}</p>
                     <p className="text-xs text-slate-400 mt-1">Membre depuis {stats.anciennete}j</p>
                </div>
            </div>

            {/* Segment & Tags */}
            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-slate-700/50 pt-4 sm:pt-0 sm:pl-6 flex flex-col justify-center">
                 <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500 uppercase font-semibold">Segment Client</p>
                    <Badge value={client.segment} variant={client.segment === 'VIP' ? 'warning' : 'neutral'} />
                 </div>
                 <div className="mt-auto">
                    <ClientTags clientId={client.id} compact={true} />
                 </div>
            </div>
        </div>
      </Card>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
          {/* Taux Remboursement */}
          <Card variant="default" padding="sm" className="bg-slate-800/30">
             <div className="flex items-start justify-between mb-2">
                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                    <Target size={18} />
                </div>
                <span className={`text-xl font-bold ${stats.tauxRemboursement >= 90 ? 'text-emerald-400' : stats.tauxRemboursement >= 80 ? 'text-cyan-400' : 'text-amber-400'}`}>
                    {stats.tauxRemboursement}%
                </span>
             </div>
             <p className="text-xs text-slate-500 font-medium uppercase truncate">Taux de Remboursement</p>
          </Card>

           {/* Points Fidelité */}
          <Card variant="default" padding="sm" className="bg-slate-800/30">
             <div className="flex items-start justify-between mb-2">
                <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
                    <Award size={18} />
                </div>
                <span className="text-xl font-bold text-cyan-400">
                    {stats.pointsFidelite}
                </span>
             </div>
             <p className="text-xs text-slate-500 font-medium uppercase truncate">Points Fidélité</p>
          </Card>
      </div>

      {/* 3. Finances Breakdown */}
      <Card variant="default" padding="md">
        <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-cyan-400" />
            Répartition Financière
        </h4>
        
        <div className="space-y-4">
            {/* Credit Progress */}
            <div>
                 <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Crédits en cours</span>
                    <span className="text-white font-mono font-medium">{stats.creditTotal.toLocaleString()} FC</span>
                 </div>
                 <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '70%' }}></div>
                 </div>
            </div>

            {/* Savings Progress */}
            <div>
                 <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-400">Épargne totale</span>
                    <span className="text-white font-mono font-medium">{stats.epargneTotal.toLocaleString()} FC</span>
                 </div>
                 <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '45%' }}></div>
                 </div>
            </div>
        </div>
      </Card>
      
      {/* 4. Activity Stats */}
      <div className="grid grid-cols-4 gap-2">
         <Card variant="default" padding="sm" className="text-center py-3 bg-slate-800/20">
            <CreditCard size={16} className="mx-auto mb-1 text-blue-400" />
            <p className="text-lg font-bold text-white">{activityCounts.credits}</p>
            <p className="text-[10px] text-slate-500 uppercase">Crédits</p>
         </Card>
         <Card variant="default" padding="sm" className="text-center py-3 bg-slate-800/20">
            <Wallet size={16} className="mx-auto mb-1 text-emerald-400" />
            <p className="text-lg font-bold text-white">{activityCounts.epargnes}</p>
            <p className="text-[10px] text-slate-500 uppercase">Épargnes</p>
         </Card>
         <Card variant="default" padding="sm" className="text-center py-3 bg-slate-800/20">
            <Users size={16} className="mx-auto mb-1 text-amber-400" />
            <p className="text-lg font-bold text-white">{activityCounts.tontines}</p>
            <p className="text-[10px] text-slate-500 uppercase">Tontines</p>
         </Card>
         <Card variant="default" padding="sm" className="text-center py-3 bg-slate-800/20">
            <Activity size={16} className="mx-auto mb-1 text-purple-400" />
            <p className="text-lg font-bold text-white">{activityCounts.payments}</p>
            <p className="text-[10px] text-slate-500 uppercase">Ops</p>
         </Card>
      </div>
    </div>
  );
}
