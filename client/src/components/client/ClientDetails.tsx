import React from 'react';
import type { Client } from '@shared/schema';
import { BarChart3, TrendingUp, DollarSign, Target, Award, MapPin, Phone, Mail, User } from 'lucide-react';
import Card from '../ui/Card';
import ClientTags from './ClientTags';

interface ClientDetailsProps {
    client: Client;
}

export default function ClientDetails({ client }: ClientDetailsProps) {
  
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 70) return 'Excellent';
    if (score >= 40) return 'Moyen';
    return 'Risque Élevé';
  };

  const stats = {
      score: client.score || 0,
      creditTotal: parseFloat(client.creditTotal as any) || 0,
      epargneTotal: parseFloat(client.epargneTotal as any) || 0,
      tauxRemboursement: parseFloat(client.tauxRemboursement as any) || 0,
      pointsFidelite: client.pointsFidelite || 0
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      
      {/* 1. Score & Segment Card - Mobile First Compact */}
      <Card variant="default" padding="sm" className="relative overflow-hidden border-slate-700/50 bg-slate-900/50">
         {/* Background Accent */}
         <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

         <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4 relative z-10">
             <BarChart3 size={16} className="text-slate-400" /> Score & Segment
         </h3>

         <div className="grid grid-cols-2 gap-3 relative z-10">
             {/* Score Box */}
             <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                 <p className="text-[10px] text-slate-500 uppercase tracking-tighter mb-1">Score Actuel</p>
                 <div className="flex items-baseline gap-1">
                     <span className={`text-3xl font-bold ${getScoreColor(stats.score)}`}>
                         {stats.score}
                     </span>
                     <span className="text-xs text-slate-500">/100</span>
                 </div>
                 <div className="mt-1 text-xs font-medium text-slate-400">
                     {getScoreLabel(stats.score)}
                 </div>
             </div>

             {/* Segment Box */}
             <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50 flex flex-col justify-between">
                 <div>
                     <p className="text-[10px] text-slate-500 uppercase tracking-tighter mb-1">Segment</p>
                     <p className="text-lg font-bold text-white tracking-tight">{client.segment}</p>
                 </div>
                 <div className="mt-2">
                    <ClientTags clientId={client.id} compact={true} />
                 </div>
             </div>
         </div>
      </Card>

      {/* 2. Finances Card - Compact */}
      <Card variant="default" padding="sm" className="flex flex-col border-slate-700/50 bg-slate-900/50">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
            <DollarSign size={16} className="text-slate-400" /> Finances
        </h3>

        <div className="space-y-3 flex-1">
            {/* Credits */}
            <div className="bg-slate-800/30 rounded-lg p-3 flex items-center justify-between border border-slate-700/30">
                <div>
                    <p className="text-[10px] uppercase text-slate-500 mb-0.5">Crédits En Cours</p>
                    <p className="text-base font-bold text-white">{stats.creditTotal.toLocaleString()} FCFA</p>
                </div>
            </div>

            {/* Epargnes */}
            <div className="bg-slate-800/30 rounded-lg p-3 flex items-center justify-between border border-slate-700/30">
                <div>
                     <p className="text-[10px] uppercase text-slate-500 mb-0.5">Épargne Total</p>
                     <p className="text-base font-bold text-white">{stats.epargneTotal.toLocaleString()} FCFA</p>
                </div>
            </div>
        </div>
      </Card>

      {/* 3. Contact & Info Card */}
      <Card variant="default" padding="sm" className="border-slate-700/50 bg-slate-900/50">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
              <User size={16} className="text-slate-400" /> Contact & Infos
          </h3>

          <div className="space-y-3">
               <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/30 flex items-center gap-3">
                   <div className="bg-slate-700/50 p-1.5 rounded-md">
                        <Phone size={14} className="text-cyan-400" />
                   </div>
                   <div className="overflow-hidden">
                       <p className="text-[10px] text-slate-500 uppercase">Téléphone</p>
                       <p className="text-sm font-medium text-slate-200 truncate">{client.telephone || '-'}</p>
                   </div>
               </div>

               <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/30 flex items-center gap-3">
                   <div className="bg-slate-700/50 p-1.5 rounded-md">
                        <Mail size={14} className="text-emerald-400" />
                   </div>
                   <div className="overflow-hidden">
                       <p className="text-[10px] text-slate-500 uppercase">Email</p>
                       <p className="text-sm font-medium text-slate-200 truncate">{client.email || '-'}</p>
                   </div>
               </div>
               
               {client.adresse && (
                <div className="bg-slate-800/30 rounded-lg p-2.5 border border-slate-700/30 flex items-center gap-3">
                    <div className="bg-slate-700/50 p-1.5 rounded-md">
                            <MapPin size={14} className="text-purple-400" />
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-[10px] text-slate-500 uppercase">Adresse</p>
                        <p className="text-sm font-medium text-slate-200 truncate">{client.adresse}</p>
                    </div>
                </div>
               )}
          </div>
      </Card>

    </div>
  );
}
