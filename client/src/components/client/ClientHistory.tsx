import React, { useState, useEffect } from 'react';
import { Clock, FileText, Phone, Mail, MessageSquare, CheckCircle, TrendingUp, Users, Filter, ArrowUpRight, Printer } from 'lucide-react';
import { Badge } from '../ui';
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
        const res = await fetch(`/api/clients/${clientId}`, { credentials: 'include' });
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
      const response = await fetch(`/api/client-activities?clientId=${clientId}`, { credentials: 'include' });
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

  // Show limited activities for compact view
  const displayedActivities = filteredActivities.slice(0, 5);
  const hasMore = filteredActivities.length > 5;

  return (
    <div className="space-y-2">
      {/* Hidden Receipt Template */}
      {printData && (
        <div aria-hidden="true" style={{ position: 'fixed', left: '-10000px', top: '0', width: '210mm', background: 'white', zIndex: -1 }}>
          <ReceiptTemplate ref={componentRef} data={printData} />
        </div>
      )}

      {/* Stats Row - Ultra Compact */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/50 flex items-center justify-between">
          <p className="text-[9px] text-slate-500 uppercase font-semibold">Total</p>
          <p className="text-lg font-bold text-white">{activities.length}</p>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/50 flex items-center justify-between">
          <p className="text-[9px] text-slate-500 uppercase font-semibold">Ce mois</p>
          <p className="text-lg font-bold text-cyan-400">{activitiesThisMonth}</p>
        </div>
        <div className="bg-slate-800/40 rounded-lg p-2 border border-slate-700/50 flex items-center justify-between">
          <p className="text-[9px] text-slate-500 uppercase font-semibold">Semaine</p>
          <p className="text-lg font-bold text-emerald-400">{activitiesThisWeek}</p>
        </div>
      </div>

      {/* Timeline - Compact */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-2.5">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-semibold text-slate-200">Timeline</h3>
          </div>
          <div className="relative">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}
              className="appearance-none bg-slate-700/50 text-slate-300 pl-2 pr-6 py-1 rounded border border-slate-600 text-[10px] font-medium focus:outline-none cursor-pointer">
              <option value="all">Tout</option>
              {activityTypes.map(type => <option key={type} value={type}>{getActivityLabel(type)}</option>)}
            </select>
            <Filter size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-500"></div>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500">
            <Clock size={20} className="opacity-40 mb-1" />
            <p className="text-[10px]">Aucune activité trouvée</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayedActivities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-2 p-1.5 rounded hover:bg-slate-700/30 transition-colors group">
                {/* Dot */}
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  activity.activity_type === 'credit' ? 'bg-blue-500' :
                  activity.activity_type === 'epargne' ? 'bg-emerald-500' :
                  activity.activity_type === 'payment' ? 'bg-green-500' :
                  activity.activity_type === 'tontine' ? 'bg-amber-500' : 'bg-slate-500'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge value={getActivityLabel(activity.activity_type)} size="sm" variant={getActivityVariant(activity.activity_type)} icon={getActivityIcon(activity.activity_type)} />
                      {activity.amount && activity.amount > 0 && (
                        <span className={`text-[11px] font-bold font-mono ${['payment', 'epargne'].includes(activity.activity_type) ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {activity.amount.toLocaleString()} F
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-slate-500">
                        {new Date(activity.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </span>
                      {activity.amount && activity.amount > 0 && ['payment', 'epargne', 'tontine', 'credit'].includes(activity.activity_type) && (
                        <button onClick={() => handleReprint(activity)} className="p-0.5 hover:bg-slate-600 rounded text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition" title="Imprimer" disabled={isPrinting}>
                          <Printer size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{activity.activity_description}</p>
                </div>
              </div>
            ))}

            {/* Show more indicator */}
            {hasMore && (
              <div className="text-center pt-1 border-t border-slate-700/30">
                <span className="text-[9px] text-slate-500">+{filteredActivities.length - 5} autres activités</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
