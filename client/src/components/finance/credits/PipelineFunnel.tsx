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
    <div className="w-full grid grid-cols-5 gap-3 mb-6">
      {funnelSteps.map((step, index) => (
        <div 
          key={step.id} 
          className={`relative flex flex-col p-4 bg-slate-800 rounded-xl border transition-colors cursor-default group overflow-hidden ${
             step.count > 0 ? step.borderColor : 'border-slate-700 hover:border-slate-600'
          } ${step.overdue ? 'shadow-[0_0_10px_rgba(249,115,22,0.1)] border-orange-500/50' : ''}`}
        >
          {/* Connecteur (Chevron) sauf pour le dernier */}
          {index < funnelSteps.length - 1 && (
            <div className="absolute -right-5 top-1/2 -translate-y-1/2 z-20 text-slate-600 pointer-events-none">
              <ChevronRight size={24} strokeWidth={3} />
            </div>
          )}
          
          {/* Icone & Titre */}
          <div className={`flex items-center gap-2 mb-3 ${step.count > 0 ? 'opacity-100' : 'opacity-60'} transition-opacity`}>
            {step.overdue ? <AlertTriangle size={16} className="text-orange-500 animate-pulse" /> : <step.icon size={16} className={step.color} />}
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{step.label}</span>
          </div>
          
          {/* Chiffres Clés */}
          <div className="mt-auto z-10">
            <div className="text-2xl font-black text-white leading-none mb-1">{step.count}</div>
            <div className="text-xs text-slate-400 font-mono font-medium">
              {formatAmount(step.amount)} <span className="text-[10px] opacity-60">FCFA</span>
            </div>
          </div>
          
          {/* Barre de progression visuelle en bas de carte */}
          <div className={`absolute bottom-0 left-0 h-1 w-full ${step.count > 0 ? step.bgColor : 'bg-transparent'}`} />
        </div>
      ))}
    </div>
  );
}
