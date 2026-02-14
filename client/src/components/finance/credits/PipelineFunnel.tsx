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
      color: 'text-content-muted',
      bgColor: 'bg-surface-muted0',
      borderColor: 'border-edge-strong' // Gris
    },
    {
      id: 'frais',
      label: 'Frais',
      count: steps.frais.count,
      amount: steps.frais.amount,
      icon: Banknote,
      color: 'text-status-info',
      bgColor: 'bg-status-info',
      borderColor: 'border-status-info' // Bleu
    },
    {
      id: 'enquete',
      label: 'Enquête',
      count: steps.enquetes.count,
      amount: steps.enquetes.amount,
      icon: Search,
      color: 'text-accent',
      bgColor: 'bg-accent',
      borderColor: 'border-accent', // Violet
      overdue: steps.enquetes.overdue > 0
    },
    {
      id: 'comite',
      label: 'Comité',
      count: steps.comite.count,
      amount: steps.comite.amount,
      icon: Users,
      color: 'text-status-info',
      bgColor: 'bg-status-info',
      borderColor: 'border-status-info' // Violet Foncé
    },
    {
      id: 'decaissement',
      label: 'Décaissement',
      count: steps.decaissement.count,
      amount: steps.decaissement.amount,
      icon: DollarSign,
      color: 'text-status-success',
      bgColor: 'bg-status-success',
      borderColor: 'border-status-success' // Vert
    }
  ];

  const formatAmount = (amount: number) => {
    if (amount >= 1000000000) return (amount / 1000000000).toFixed(1) + ' Md';
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + ' M';
    if (amount >= 1000) return (amount / 1000).toFixed(0) + ' k';
    return amount.toString();
  };

  return (
    <div className="w-full grid grid-cols-5 gap-2 mb-4 bg-surface-base/50 p-2 rounded-xl border border-edge/50">
      {funnelSteps.map((step, index) => (
        <div 
          key={step.id} 
          className={`relative flex items-center justify-between p-2 lg:p-3 bg-surface/50 rounded-lg border transition-all cursor-default group overflow-hidden ${
             step.count > 0 ? 'border-edge-subtle hover:bg-surface hover:border-edge-strong' : 'border-transparent opacity-70 hover:opacity-100'
          } ${step.overdue ? 'shadow-[0_0_10px_rgba(249,115,22,0.1)] border-status-warning/50' : ''}`}
        >
          {/* Connector arrow visually managed by Grid gap usually, but could be absolute if needed. 
              In compact mode, simple gap is cleaner. */}
          
          <div className="flex flex-col min-w-0">
             <div className="flex items-center gap-1.5 mb-0.5">
                {step.overdue ? <AlertTriangle size={12} className="text-status-warning animate-pulse" /> : <step.icon size={12} className={step.color} />}
                <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted truncate">{step.label}</span>
             </div>
             <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-content-primary leading-none">{step.count}</span>
                {step.amount > 0 && <span className="text-[10px] text-content-muted font-mono hidden xl:inline-block">{formatAmount(step.amount)}</span>}
             </div>
          </div>

          <div className={`w-1 h-6 rounded-full opacity-30 ${step.bgColor}`}></div>
        </div>
      ))}
    </div>
  );
}
