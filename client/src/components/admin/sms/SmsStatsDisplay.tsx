import React from 'react';
import { Send, CheckCircle, Clock, XCircle } from 'lucide-react';
import StatCard from '../../ui/StatCard';

interface SmsStatsProps {
  stats: {
    total: number;
    sent: number;
    pending: number;
    failed: number;
  };
}

export default function SmsStatsDisplay({ stats }: SmsStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
       <StatCard 
         title="Total SMS" 
         value={stats.total} 
         icon={Send} 
         color="primary" 
         trend="Historique" 
       />
       <StatCard 
         title="Envoyés" 
         value={stats.sent} 
         icon={CheckCircle} 
         color="success" 
         trend={`${stats.total > 0 ? ((stats.sent/stats.total)*100).toFixed(1) : 0}%`} 
       />
       <StatCard 
         title="En attente" 
         value={stats.pending} 
         icon={Clock} 
         color="warning" 
         trend="File d'attente" 
       />
       <StatCard 
         title="Échecs" 
         value={stats.failed} 
         icon={XCircle} 
         color="danger" 
         trend="Erreurs" 
       />
    </div>
  );
}
