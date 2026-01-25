import React from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Banknote, 
  Search, 
  Users, 
  DollarSign, 
  ChevronRight,
  AlertTriangle 
} from 'lucide-react';

interface FunnelStepProps {
  label: string;
  count: number;
  amount: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  isOverdue?: boolean;
}

interface PipelineFunnelProps {
  steps: {
    demandes: { count: number; amount: number };
    frais: { count: number; amount: number };
    enquetes: { count: number; amount: number; overdue: number };
    comite: { count: number; amount: number };
    decaissement: { count: number; amount: number };
  };
}

export function PipelineFunnel({ steps }: PipelineFunnelProps) {
  
  const funnelSteps = [
    {
      id: 'demande',
      label: 'Demande',
      count: steps.demandes.count,
      amount: steps.demandes.amount,
      icon: FileText,
      color: 'text-slate-400',
      bgColor: 'bg-slate-500',
      borderColor: 'border-slate-500' // Gris
    },
    {
      id: 'frais',
      label: 'Frais',
      count: steps.frais.count,
      amount: steps.frais.amount,
      icon: Banknote,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500',
      borderColor: 'border-blue-500' // Bleu
    },
    {
      id: 'enquete',
      label: 'Enquête',
      count: steps.enquetes.count,
      amount: steps.enquetes.amount,
      icon: Search,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500',
      borderColor: 'border-indigo-500', // Violet
      overdue: steps.enquetes.overdue > 0
    },
    {
      id: 'comite',
      label: 'Comité',
      count: steps.comite.count,
      amount: steps.comite.amount,
      icon: Users,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500',
      borderColor: 'border-purple-500' // Violet Foncé
    },
    {
      id: 'decaissement',
      label: 'Décaissement',
      count: steps.decaissement.count,
      amount: steps.decaissement.amount,
      icon: DollarSign,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500',
      borderColor: 'border-emerald-500' // Vert
    }
  ];

  const formatAmount = (amount: number) => {
    if (amount >= 1000000000) return (amount / 1000000000).toFixed(1) + ' Md';
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + ' M';
    if (amount >= 1000) return (amount / 1000).toFixed(0) + ' k';
    return amount.toString();
  };

  return (
    <div className="w-full grid grid-cols-5 gap-2 mb-4 bg-slate-900/50 p-2 rounded-xl border border-slate-800/50">
      {funnelSteps.map((step, index) => (
        <div 
          key={step.id} 
          className={`relative flex items-center justify-between p-2 lg:p-3 bg-slate-800/50 rounded-lg border transition-all cursor-default group overflow-hidden ${
             step.count > 0 ? 'border-slate-700/50 hover:bg-slate-800 hover:border-slate-600' : 'border-transparent opacity-70 hover:opacity-100'
          } ${step.overdue ? 'shadow-[0_0_10px_rgba(249,115,22,0.1)] border-orange-500/50' : ''}`}
        >
          {/* Connector arrow visually managed by Grid gap usually, but could be absolute if needed. 
              In compact mode, simple gap is cleaner. */}
          
          <div className="flex flex-col min-w-0">
             <div className="flex items-center gap-1.5 mb-0.5">
                {step.overdue ? <AlertTriangle size={12} className="text-orange-500 animate-pulse" /> : <step.icon size={12} className={step.color} />}
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate">{step.label}</span>
             </div>
             <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-white leading-none">{step.count}</span>
                {step.amount > 0 && <span className="text-[10px] text-slate-400 font-mono hidden xl:inline-block">{formatAmount(step.amount)}</span>}
             </div>
          </div>

          <div className={`w-1 h-6 rounded-full opacity-30 ${step.bgColor}`}></div>
        </div>
      ))}
    </div>
  );
}
