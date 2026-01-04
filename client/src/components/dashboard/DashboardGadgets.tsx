import React, { useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Target,
  Zap,
  Users,
  CreditCard,
  Wallet,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Calendar
} from 'lucide-react';
import { Card, Badge, ProgressBar } from '../ui';


export interface AlertItem {
  id: number;
  type: 'warning' | 'info' | 'success';
  message: string;
  time: string;
}

interface AlertsWidgetProps {
  alerts?: AlertItem[];
}

export function AlertsWidget({ alerts = [] }: AlertsWidgetProps) {
  const typeConfig: Record<string, { icon: React.ReactNode; bgColor: string; textColor: string }> = {
    warning: { 
      icon: <AlertCircle className="text-amber-400" size={10} />, 
      bgColor: 'bg-amber-500/10', 
      textColor: 'text-amber-400' 
    },
    info: { 
      icon: <Bell className="text-blue-400" size={10} />, 
      bgColor: 'bg-blue-500/10', 
      textColor: 'text-blue-400' 
    },
    success: { 
      icon: <CheckCircle2 className="text-emerald-400" size={10} />, 
      bgColor: 'bg-emerald-500/10', 
      textColor: 'text-emerald-400' 
    }
  };

  return (
    <Card variant="default" padding="sm" className="h-full min-w-0 flex flex-col" data-testid="gadget-alerts">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="p-1 bg-amber-500/20 rounded">
            <Bell className="text-amber-400" size={12} />
          </div>
          <span className="text-slate-300 text-xs font-medium">Alertes</span>
        </div>
        {alerts.length > 0 && (
          <Badge variant="danger" size="sm" className="text-[9px] px-1.5 py-0" value={alerts.length} />
        )}
      </div>

      {/* Alert List */}
      <div className="space-y-1 max-h-32 sm:max-h-40 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex items-center justify-center py-3">
            <CheckCircle2 className="text-emerald-400 mr-1.5" size={12} />
            <span className="text-slate-500 text-xs">Aucune alerte</span>
          </div>
        ) : (
          alerts.map((alert) => {
            const config = typeConfig[alert.type] || typeConfig.info;
            return (
              <div 
                key={alert.id} 
                className={`flex items-center gap-2 p-1.5 sm:p-2 rounded ${config.bgColor}`}
              >
                <div className="flex-shrink-0">{config.icon}</div>
                <p className="text-white text-[11px] sm:text-xs font-medium flex-1 truncate">{alert.message}</p>
                <span className="text-[9px] text-slate-500 flex-shrink-0">{alert.time}</span>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

export function PerformanceGauge({ value = 75, label = 'Taux de Recouvrement' }: { value?: number; label?: string }) {
  const getColor = (val: number) => {
    if (val >= 80) return 'text-emerald-400';
    if (val >= 60) return 'text-cyan-400';
    if (val >= 40) return 'text-amber-400';
    return 'text-red-400';
  };

  const getBgColor = (val: number) => {
    if (val >= 80) return 'stroke-emerald-500';
    if (val >= 60) return 'stroke-cyan-500';
    if (val >= 40) return 'stroke-amber-500';
    return 'stroke-red-500';
  };

  return (
    <Card variant="default" padding="sm" className="h-full min-w-0 flex flex-col" data-testid="gadget-performance">
      {/* Compact Header */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <div className="p-1 bg-cyan-500/20 rounded">
          <Target className="text-cyan-400" size={12} />
        </div>
        <span className="text-slate-300 text-xs font-medium">{label}</span>
      </div>
      
      {/* Compact Gauge */}
      <div className="flex items-center justify-center py-2">
        <div className="relative">
          <svg className="w-16 h-16 sm:w-20 sm:h-20 transform -rotate-90">
            <circle 
              cx="50%" cy="50%" r="35%" 
              strokeWidth="6" 
              fill="none" 
              className="stroke-slate-700" 
            />
            <circle
              cx="50%" cy="50%" r="35%"
              strokeWidth="6" 
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${value * 2.2} 220`}
              className={getBgColor(value)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm sm:text-base font-bold ${getColor(value)}`}>{value}%</span>
          </div>
        </div>
      </div>

      {/* Status Label */}
      <div className="text-center">
        <span className={`text-[9px] sm:text-[10px] ${getColor(value)}`}>
          {value >= 80 ? 'Excellent' : value >= 60 ? 'Bon' : value >= 40 ? 'Moyen' : 'Faible'}
        </span>
      </div>
    </Card>
  );
}

interface QuickStatsProps {
  stats?: Array<{
    icon: any;
    label: string;
    value: string;
    trend: string;
    up: boolean;
  }>;
}

export function QuickStats({ stats }: QuickStatsProps) {
  const defaultStats = [
    { icon: Users, label: 'actifs', value: '-', trend: '+2', up: true },
    { icon: CreditCard, label: 'crédits actifs', value: '-', trend: '+1', up: true },
    { icon: Wallet, label: 'Épargnes', value: '-', trend: '+0%', up: true },
    { icon: Activity, label: 'transactions', value: '-', trend: '+0%', up: false }
  ];

  const displayStats = stats || defaultStats;

  return (
    <Card variant="default" padding="sm" className="h-full min-w-0 flex flex-col" data-testid="gadget-quick-stats">
      {/* Compact Header */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <div className="p-1 bg-yellow-500/20 rounded">
          <Zap className="text-yellow-400" size={12} />
        </div>
        <span className="text-slate-300 text-xs font-medium">Stats Rapides</span>
      </div>

      {/* Stats List - Compact with aligned columns */}
      <div className="space-y-1 flex-grow">
        {displayStats.map((stat, idx) => (
          <div key={idx} className="flex items-center p-1 sm:p-1.5 rounded bg-slate-700/20">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <stat.icon className="text-slate-500 flex-shrink-0" size={10} />
              <span className="text-slate-400 text-[9px] sm:text-[10px] truncate">{stat.label}</span>
            </div>
            <span className="text-white font-bold text-[10px] sm:text-xs w-6 text-right">{stat.value}</span>
            <span className={`text-[8px] sm:text-[9px] flex items-center w-8 justify-end ${stat.up ? 'text-emerald-400' : 'text-red-400'}`}>
              {stat.up ? <ArrowUpRight size={8} /> : <ArrowDownRight size={8} />}
              {stat.trend}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface PaymentItem {
  client: string;
  amount: number;
  date: string;
  status: string;
}

interface UpcomingPaymentsProps {
  payments?: PaymentItem[];
}

export function UpcomingPayments({ payments = [] }: UpcomingPaymentsProps) {
  return (
    <Card variant="default" padding="sm" className="h-full min-w-0 flex flex-col" data-testid="gadget-payments">
      {/* Compact Header */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <div className="p-1 bg-blue-500/20 rounded">
          <Calendar className="text-blue-400" size={12} />
        </div>
        <span className="text-slate-300 text-xs font-medium">Échéances Proches</span>
      </div>

      {/* Payments List */}
      <div className="space-y-1 max-h-32 sm:max-h-40 overflow-y-auto">
        {payments.length === 0 ? (
          <div className="flex items-center justify-center py-3">
            <CheckCircle2 className="text-emerald-400 mr-1.5" size={12} />
            <span className="text-slate-500 text-xs">Aucune échéance proche</span>
          </div>
        ) : (
          payments.map((payment, idx) => (
            <div 
              key={idx} 
              className={`flex items-center justify-between p-1.5 sm:p-2 rounded ${payment.status === 'due' ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-white text-[11px] sm:text-xs font-medium truncate">{payment.client}</p>
                <p className="text-slate-500 text-[9px] sm:text-[10px]">{payment.date}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-bold text-[11px] sm:text-xs ${payment.status === 'due' ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {payment.amount.toLocaleString()} F
                </p>
                <span className={`text-[8px] sm:text-[9px] ${payment.status === 'due' ? 'text-amber-500' : 'text-blue-400'}`}>
                  {payment.status === 'due' ? 'Dû' : 'À venir'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export function ObjectivesWidget({ objectif = 80, actuel = 65 }: { objectif?: number; actuel?: number }) {
  const progress = Math.min((actuel / objectif) * 100, 100);
  const remaining = objectif - actuel;

  return (
    <Card variant="default" padding="sm" className="h-full min-w-0 flex flex-col" data-testid="gadget-objectives">
      {/* Compact Header */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <div className="p-1 bg-emerald-500/20 rounded">
          <Target className="text-emerald-400" size={12} />
        </div>
        <span className="text-slate-300 text-xs font-medium">Objectif Mensuel</span>
      </div>

      {/* Progress Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-slate-400 text-[10px]">Progression</span>
          <span className="text-white font-bold text-[11px] sm:text-xs">{actuel}/{objectif} crédits</span>
        </div>
        
        <ProgressBar 
          value={progress} 
          max={100} 
          size="sm" 
          color={progress >= 100 ? 'success' : progress >= 75 ? 'primary' : progress >= 50 ? 'warning' : 'danger'} 
        />
        
        <div className="flex justify-between text-[9px] sm:text-[10px]">
          <span className={progress >= 100 ? 'text-emerald-400' : 'text-slate-500'}>
            {progress.toFixed(0)}% atteint
          </span>
          <span className="text-slate-500">
            {remaining > 0 ? `${remaining} restants` : '✅ Atteint!'}
          </span>
        </div>
      </div>
    </Card>
  );
}

interface ActivityItem {
  action: string;
  user: string;
  time: string;
  type: string;
}

interface LiveActivityFeedProps {
  activities?: ActivityItem[];
}

export function LiveActivityFeed({ activities: initialActivities = [] }: LiveActivityFeedProps) {
  // Utilise les activités WebSocket temps réel via événement custom
  const [liveActivities, setLiveActivities] = React.useState<ActivityItem[]>(initialActivities);
  const [isLive, setIsLive] = React.useState(true);

  // Écouter l'événement custom émis par useWebSocket
  React.useEffect(() => {
    const handleLiveActivity = (event: CustomEvent) => {
      const activity = event.detail;
      if (!activity) return;

      const activityDate = new Date(activity.timestamp || Date.now());
      const today = new Date();
      
      // Vérifier si c'est aujourd'hui
      const isToday = activityDate.getDate() === today.getDate() &&
                      activityDate.getMonth() === today.getMonth() &&
                      activityDate.getFullYear() === today.getFullYear();
      
      if (isToday) {
        const now = new Date();
        const diffMs = now.getTime() - activityDate.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        
        let timeStr = activityDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        if (diffMin < 1) timeStr = 'À l\'instant';
        else if (diffMin < 60) timeStr = `${diffMin}min`;
        
        const newActivity: ActivityItem = {
          action: activity.action || 'Action',
          user: activity.user || 'Système',
          time: timeStr,
          type: activity.type || 'client'
        };
        
        setLiveActivities(prev => {
          // Éviter les doublons et limiter à 10 éléments
          const filtered = prev.filter(a => 
            !(a.action === newActivity.action && a.user === newActivity.user && a.time === newActivity.time)
          );
          return [newActivity, ...filtered].slice(0, 10);
        });
        
        // Indicateur temps réel actif
        setIsLive(true);
      }
    };

    // Écouter l'événement custom
    window.addEventListener('live-activity', handleLiveActivity as EventListener);
    
    // Timeout pour afficher "hors ligne" si pas d'activité pendant un moment
    const checkInterval = setInterval(() => {
      // Simplement garder l'état indiquant que le listener est actif
    }, 30000);

    return () => {
      window.removeEventListener('live-activity', handleLiveActivity as EventListener);
      clearInterval(checkInterval);
    };
  }, []);

  // Combiner activités initiales et live (live en premier)
  const displayActivities = liveActivities.length > 0 ? liveActivities : initialActivities;

  const typeConfig: Record<string, { color: string; bgColor: string; label: string }> = {
    credit: { color: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', label: '💳' },
    savings: { color: 'bg-blue-500', bgColor: 'bg-blue-500/10', label: '💰' },
    client: { color: 'bg-purple-500', bgColor: 'bg-purple-500/10', label: '👤' },
    payment: { color: 'bg-cyan-500', bgColor: 'bg-cyan-500/10', label: '📥' },
    login: { color: 'bg-green-500', bgColor: 'bg-green-500/10', label: '🔐' },
    caisse: { color: 'bg-amber-500', bgColor: 'bg-amber-500/10', label: '💵' },
    tontine: { color: 'bg-pink-500', bgColor: 'bg-pink-500/10', label: '🤝' }
  };

  return (
    <Card variant="default" padding="sm" className="h-full min-w-0 flex flex-col" data-testid="gadget-activity">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="p-1 bg-purple-500/20 rounded">
            <Activity className="text-purple-400" size={12} />
          </div>
          <span className="text-slate-300 text-xs font-medium">Activité en Direct</span>
        </div>
        <span className="flex h-2 w-2 relative" title={isLive ? 'Connecté en temps réel' : 'Hors ligne'}>
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isLive ? 'bg-emerald-400' : 'bg-red-400'} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isLive ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
        </span>
      </div>

      {/* Activity List - Compact */}
      <div className="space-y-1 max-h-36 sm:max-h-44 overflow-y-auto">
        {displayActivities.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-3">Aucune activité aujourd'hui</p>
        ) : (
          displayActivities.map((activity, idx) => {
            const config = typeConfig[activity.type] || typeConfig.client;
            return (
              <div 
                key={`${activity.action}-${activity.time}-${idx}`} 
                className={`flex items-center gap-2 p-1.5 sm:p-2 rounded ${config.bgColor} transition-all ${idx === 0 ? 'animate-pulse' : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${config.color} flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] sm:text-xs font-medium truncate">{activity.action}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[9px] sm:text-[10px] text-slate-500">{activity.user}</span>
                  <span className="text-[9px] sm:text-[10px] text-slate-600 ml-1">{activity.time}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

interface ClientItem {
  name: string;
  credits: number;
  total: number;
}

interface TopClientsWidgetProps {
  clients?: ClientItem[];
}

export function TopClientsWidget({ clients = [] }: TopClientsWidgetProps) {
  const rankColors = [
    { bg: 'bg-yellow-500', text: 'text-black' },   // 1st - Gold
    { bg: 'bg-slate-400', text: 'text-black' },    // 2nd - Silver  
    { bg: 'bg-amber-700', text: 'text-white' }     // 3rd - Bronze
  ];

  return (
    <Card variant="default" padding="sm" className="h-full min-w-0 flex flex-col" data-testid="gadget-top-clients">
      {/* Compact Header */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <div className="p-1 bg-blue-500/20 rounded">
          <Users className="text-blue-400" size={12} />
        </div>
        <span className="text-slate-300 text-xs font-medium">Top Clients</span>
      </div>

      {/* Client List */}
      <div className="space-y-1 max-h-32 sm:max-h-40 overflow-y-auto">
        {clients.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-3">Aucun client</p>
        ) : (
          clients.map((client, idx) => {
            const colors = rankColors[idx] || { bg: 'bg-slate-600', text: 'text-white' };
            return (
              <div 
                key={idx} 
                className="flex items-center gap-2 p-1.5 sm:p-2 rounded bg-slate-700/30"
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${colors.bg} ${colors.text}`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] sm:text-xs font-medium truncate">{client.name}</p>
                  <p className="text-slate-500 text-[9px] sm:text-[10px]">{client.credits} crédit{client.credits > 1 ? 's' : ''}</p>
                </div>
                <div className="text-emerald-400 text-[11px] sm:text-xs font-bold flex-shrink-0">
                  {client.total >= 1000000 ? `${(client.total / 1000000).toFixed(1)}M` : `${(client.total / 1000).toFixed(0)}K`}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
