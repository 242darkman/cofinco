import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, FileText, Phone, Mail, MessageSquare, CheckCircle, TrendingUp, Users, Filter, Calendar, ArrowUpRight, ArrowDownLeft, Printer } from 'lucide-react';
import { Card, Badge, Button } from '../ui';
import { usePrinter } from '../../hooks/useReceiptPrinter';
import { ReceiptTemplate } from '../ui/printable/ReceiptTemplate';

interface ClientActivity {
  id: number;
  client_id: string;
  activity_type: string;
  activity_description: string;
  amount?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface ClientHistoryProps {
  clientId: string;
}

export default function ClientHistory({ clientId }: ClientHistoryProps) {
  const [activities, setActivities] = useState<ClientActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [clientDetails, setClientDetails] = useState<any>(null);

  const { componentRef, printData, print, isPrinting } = usePrinter();

  useEffect(() => {
    fetchActivities();
    fetchClientDetails();
  }, [clientId]);

  const fetchClientDetails = async () => {
    try {
        const res = await fetch(`/api/clients/${clientId}`);
        if (res.ok) {
            const data = await res.json();
            setClientDetails(data);
        }
    } catch (error) {
        console.error("Error fetching client details:", error);
    }
  };

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/client-activities?clientId=${clientId}`);
      if (!response.ok) throw new Error('Erreur réseau');
      const data = await response.json();
      setActivities(data || []);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'credit': return <ArrowUpRight size={14} />;
      case 'epargne': return <TrendingUp size={14} />;
      case 'tontine': return <Users size={14} />;
      case 'payment': return <CheckCircle size={14} />;
      case 'note': return <FileText size={14} />;
      case 'call': return <Phone size={14} />;
      case 'sms': return <MessageSquare size={14} />;
      case 'email': return <Mail size={14} />;
      case 'document': return <FileText size={14} />;
      default: return <Clock size={14} />;
    }
  };

  const getActivityVariant = (type: string) => {
    switch (type) {
      case 'credit': return 'info';
      case 'epargne': return 'success';
      case 'tontine': return 'warning';
      case 'payment': return 'success';
      case 'note': return 'neutral';
      case 'call': return 'info';
      case 'sms': return 'info';
      case 'email': return 'info';
      case 'document': return 'warning';
      default: return 'neutral';
    }
  };

  const getActivityLabel = (type: string) => {
    switch (type) {
      case 'credit': return 'Crédit';
      case 'epargne': return 'Épargne';
      case 'tontine': return 'Tontine';
      case 'payment': return 'Paiement';
      case 'note': return 'Note';
      case 'call': return 'Appel';
      case 'sms': return 'SMS';
      case 'email': return 'Email';
      case 'document': return 'Document';
      case 'status_change': return 'Statut';
      default: return 'Autre';
    }
  };

  const handleReprint = (activity: ClientActivity) => {
      const isPayment = ['payment', 'epargne', 'tontine', 'credit'].includes(activity.activity_type);
      if (!isPayment || !activity.amount || !clientDetails) return;

      print({
          title: `REÇU - ${getActivityLabel(activity.activity_type).toUpperCase()}`,
          reference: (activity.metadata?.reference as string) || `ACT-${activity.id}`,
          date: new Date(activity.created_at),
          type: activity.activity_type.charAt(0).toUpperCase() + activity.activity_type.slice(1),
          client: {
              nom: clientDetails.nom,
              prenom: clientDetails.prenom,
              email: clientDetails.email,
              telephone: clientDetails.phone || clientDetails.telephone,
              numeroCompte: clientDetails.numero_compte
          },
          agent: {
              nom: 'Agent', // Activity log might not have agent name readily available without extra fetch
              prenom: 'Guichet'
          },
          items: [{
              description: activity.activity_description,
              details: (activity.metadata?.notes as string) || '',
              montant: activity.amount,
              quantite: 1
          }],
          total: activity.amount,
          modePaiement: (activity.metadata?.mode_paiement as string) || 'Espèces' // Fallback
      });
  };

  const filteredActivities = filter === 'all'
    ? activities
    : activities.filter(a => a.activity_type === filter);

  const activityTypes = Array.from(new Set(activities.map(a => a.activity_type)));

  // Calculate Stats
  const now = new Date();
  const activitiesThisMonth = activities.filter(a => {
      const date = new Date(a.created_at);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;
  
  const activitiesThisWeek = activities.filter(a => {
      const date = new Date(a.created_at);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return date >= weekAgo;
  }).length;

  return (
    <div className="space-y-4">
      {/* Hidden Receipt Template */}
      {printData && <div style={{ display: "none" }}><ReceiptTemplate ref={componentRef} data={printData} /></div>}

      {/* 1. Header & Stats - Compact Mobile First */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
         <Card variant="default" padding="sm" className="bg-slate-800/30 text-center">
             <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total</p>
             <p className="text-xl sm:text-2xl font-bold text-white leading-none">{activities.length}</p>
         </Card>
         <Card variant="default" padding="sm" className="bg-slate-800/30 text-center">
             <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Ce Mois</p>
             <p className="text-xl sm:text-2xl font-bold text-cyan-400 leading-none">{activitiesThisMonth}</p>
         </Card>
         <Card variant="default" padding="sm" className="bg-slate-800/30 text-center">
             <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Cette Semaine</p>
             <p className="text-xl sm:text-2xl font-bold text-emerald-400 leading-none">{activitiesThisWeek}</p>
         </Card>
      </div>

      {/* 2. Controls & List */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 shadow-sm min-h-[400px]">
        {/* Header with Filter */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-200">Timeline</h3>
          </div>
          
           <div className="relative">
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="appearance-none bg-slate-800 text-slate-300 pl-3 pr-8 py-1.5 rounded-lg border border-slate-700 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer hover:bg-slate-700 transition-colors"
                >
                    <option value="all">Tout voir</option>
                    {activityTypes.map(type => (
                    <option key={type} value={type}>{getActivityLabel(type)}</option>
                    ))}
                </select>
                <Filter size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {loading ? (
           <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <div className="w-12 h-12 bg-slate-800/50 rounded-full flex items-center justify-center mb-3">
                 <Clock size={24} className="opacity-50" />
            </div>
            <p className="text-sm">Aucune activité trouvée</p>
          </div>
        ) : (
          <div className="relative pl-4 space-y-6">
            {/* Timeline Vertical Line */}
            <div className="absolute top-2 bottom-2 left-[19px] w-px bg-slate-800 z-0"></div>

            {filteredActivities.map((activity, idx) => (
              <div key={activity.id} className="relative z-10 grid grid-cols-[auto,1fr] gap-4">
                {/* Timeline Dot */}
                <div className="pt-1">
                     <div className={`w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                         activity.activity_type === 'credit' ? 'bg-blue-500' :
                         activity.activity_type === 'epargne' ? 'bg-emerald-500' :
                         activity.activity_type === 'payment' ? 'bg-green-500' :
                         activity.activity_type === 'tontine' ? 'bg-amber-500' : 'bg-slate-500'
                     } shadow-[0_0_0_4px_rgba(30,41,59,1)]`}></div>
                </div>

                {/* Content Card */}
                <Card variant="default" padding="sm" className="bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-600 transition-all group">
                     {/* Header: Type, Time */}
                     <div className="flex items-start justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                            <Badge 
                                value={getActivityLabel(activity.activity_type)} 
                                size="sm" 
                                variant={getActivityVariant(activity.activity_type)}
                                icon={getActivityIcon(activity.activity_type)}
                            />
                            {activity.amount && activity.amount > 0 && (
                                <span className={`text-sm font-bold font-mono tracking-tight ${
                                    ['payment', 'epargne'].includes(activity.activity_type) ? 'text-emerald-400' : 'text-slate-300'
                                }`}>
                                    {activity.amount.toLocaleString()} FC
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-medium">
                                {new Date(activity.created_at).toLocaleDateString('fr-FR', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                            </span>
                            
                            {/* Reprint Button */}
                            {activity.amount && activity.amount > 0 && ['payment', 'epargne', 'tontine', 'credit'].includes(activity.activity_type) && (
                                <button
                                    onClick={() => handleReprint(activity)}
                                    className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-cyan-400 transition"
                                    title="Imprimer Reçu"
                                    disabled={isPrinting}
                                >
                                    <Printer size={14} />
                                </button>
                            )}
                        </div>
                     </div>

                     {/* Description */}
                     <p className="text-sm text-slate-300 leading-relaxed">
                        {activity.activity_description}
                     </p>

                     {/* Metadata Expansion (Optional/Compact) */}
                     {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                         <div className="mt-2 pt-2 border-t border-slate-700/30">
                             <div className="flex flex-wrap gap-1">
                                 {Object.entries(activity.metadata).map(([key, val]) => (
                                     <span key={key} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-900/50 text-[10px] text-slate-400 border border-slate-700/50 font-mono">
                                         <span className="opacity-50 mr-1">{key}:</span>
                                         <span className="text-slate-300 truncate max-w-[100px]">{String(val)}</span>
                                     </span>
                                 ))}
                             </div>
                         </div>
                     )}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
