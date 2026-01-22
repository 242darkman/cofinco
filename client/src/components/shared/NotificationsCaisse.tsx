import React, { useState, useEffect } from 'react';
import { Bell, AlertCircle, CheckCircle, Clock, X, Eye, Check, User, Phone as PhoneIcon, CreditCard } from 'lucide-react';
import { Card, Button, Modal, TabGroup, ResponsiveTable } from '../ui';
import { authService } from '../../lib/auth';

interface Notification {
  id: string;
  type_notification: string;
  compte_id: string;
  client_id: string;
  titre: string;
  message: string;
  mode_paiement: string;
  montant: number;
  reference_externe: string;
  priorite: 'Basse' | 'Normal' | 'Haute' | 'Urgente';
  statut: 'Non lue' | 'Lue' | 'Traitée' | 'Archivée';
  created_at: string;
  client_nom?: string;
  client_phone?: string;
  numero_compte?: string;
  type_compte?: string;
}

interface NotificationsCaisseProps {
  onClose?: () => void;
  compact?: boolean;
}

export default function NotificationsCaisse({ onClose, compact = false }: NotificationsCaisseProps) {
  const user = authService.getCurrentUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'non_lue' | 'lue'>('all');
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const loadNotifications = async () => {
    try {
      const statut = filter === 'all' ? 'Non lue,Lue' : filter === 'non_lue' ? 'Non lue' : 'Lue';
      const response = await fetch(`/api/notifications-caisse?statut=${encodeURIComponent(statut)}`);
      if (response.ok) {
        setNotifications(await response.json() || []);
      }
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const marquerCommeLue = async (notifId: string) => {
    try {
      await fetch(`/api/notifications-caisse/${notifId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: 'READ' })
      });
      loadNotifications();
    } catch (error) {
      console.error('Erreur marquage lecture:', error);
    }
  };

  const traiterNotification = async (notifId: string, notes?: string) => {
    try {
      await fetch(`/api/notifications-caisse/${notifId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'PROCESSED',
          traite_par: user?.id,
          date_traitement: new Date().toISOString(),
          notes_traitement: notes
        })
      });
      alert('Notification marquée comme traitée');
      loadNotifications();
      setSelectedNotif(null);
    } catch (error) {
      alert('Erreur lors du traitement');
    }
  };

  const validerPaiementCompte = async (notif: Notification) => {
    if (!confirm(`Confirmer la réception du paiement de ${(notif.montant || 0).toLocaleString()} FCFA par ${notif.mode_paiement} ?`)) return;

    try {
      // 1. Activer le compte
      await fetch(`/api/comptes-bancaires/${notif.compte_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paiement_valide: true, solde: notif.montant, statut: 'ACTIVE' })
      });

      // 2. Enregistrer la transaction
      await fetch('/api/transactions-epargne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compte_id: notif.compte_id,
          type_transaction: 'Dépôt',
          montant: notif.montant,
          solde_avant: 0,
          solde_apres: notif.montant,
          mode_paiement: notif.mode_paiement,
          reference_paiement: notif.reference_externe,
          description: 'Dépôt initial - Ouverture de compte',
          effectue_par: user?.id,
          statut: 'VALIDATED'
        })
      });

      await traiterNotification(notif.id, `Paiement validé - ${notif.mode_paiement}`);
      alert('Paiement validé avec succès ! Compte actif.');
    } catch (error: any) {
      alert(`Erreur: ${error.error}`);
    }
  };

  const getPriorityColor = (priorite: string) => {
    switch (priorite) {
      case 'Urgente': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'Haute': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'Normal': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const nonLuesCount = notifications.filter(n => n.statut === 'Non lue').length;

  // Widget compact pour le dashboard
  if (compact) {
    return (
      <Card className="h-full">
        <Card.Header className="flex justify-between items-center pb-2">
           <div className="flex items-center gap-2">
             <div className="relative">
               <Bell className="text-blue-400" size={20} />
               {nonLuesCount > 0 && (
                 <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                   {nonLuesCount}
                 </span>
               )}
             </div>
             <h3 className="font-bold text-white">Notifications Caisse</h3>
           </div>
           {onClose && <Button variant="ghost" size="sm" onClick={onClose} icon={X} />}
        </Card.Header>
        
        <Card.Content className="space-y-2 max-h-[300px] overflow-y-auto px-1">
          {loading ? (
             <div className="text-center py-4 text-slate-500">Chargement...</div>
          ) : notifications.length === 0 ? (
             <div className="text-center py-4 text-slate-500 flex flex-col items-center">
                <CheckCircle size={24} className="mb-2 opacity-50"/>
                <span className="text-sm">Aucune notification</span>
             </div>
          ) : (
             notifications.slice(0, 5).map(notif => (
               <div 
                 key={notif.id}
                 className={`p-3 rounded-lg border cursor-pointer hover:bg-slate-700/50 transition ${
                    notif.statut === 'Non lue' ? 'bg-slate-700/30 border-blue-500/30' : 'bg-transparent border-slate-700'
                 }`}
                 onClick={() => setSelectedNotif(notif)}
               >
                 <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityColor(notif.priorite)}`}>
                      {notif.priorite}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(notif.created_at).toLocaleDateString()}</span>
                 </div>
                 <p className="text-sm font-semibold text-white truncate">{notif.titre}</p>
                 <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-slate-400 truncate max-w-[120px]">{notif.client_nom}</span>
                    <span className="text-sm font-mono text-green-400">{(notif.montant || 0).toLocaleString()} FCFA</span>
                 </div>
               </div>
             ))
          )}
        </Card.Content>
        {notifications.length > 5 && (
           <div className="p-3 border-t border-slate-700 text-center">
              <Button variant="ghost" size="sm" className="w-full text-blue-400" onClick={onClose}>
                 Voir tout ({notifications.length})
              </Button>
           </div>
        )}
      </Card>
    );
  }

  // Vue modale complète
  const modalContent = (
    <div className="flex flex-col h-[80vh]">
      <div className="mb-4">
        <TabGroup 
          tabs={[
            { key: 'all', label: `Toutes (${notifications.length})`, icon: Bell },
            { key: 'non_lue', label: `Non lues (${nonLuesCount})`, icon: AlertCircle },
            { key: 'lue', label: 'Lues', icon: CheckCircle },
          ]}
          activeTab={filter}
          onTabChange={(k) => setFilter(k as any)}
        />
      </div>

      <div className="flex-1 overflow-hidden min-h-0 bg-slate-900/50 rounded-lg border border-slate-700 flex flex-col">
         {loading ? (
            <div className="flex items-center justify-center h-full">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
         ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
               <CheckCircle size={48} className="mb-4 opacity-20"/>
               <p>Aucune notification</p>
            </div>
         ) : (
            <div className="overflow-y-auto p-2 space-y-2">
               {notifications.map(notif => (
                 <div 
                   key={notif.id}
                   className={`group p-4 rounded-lg border transition-all hover:bg-slate-800 ${
                     notif.statut === 'Non lue' 
                       ? 'bg-slate-800/50 border-blue-500/40 shadow-[inset_4px_0_0_0_#3b82f6]' 
                       : 'bg-slate-900 border-slate-700 opacity-80 hover:opacity-100'
                   }`}
                   onClick={() => setSelectedNotif(notif)}
                 >
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                             <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getPriorityColor(notif.priorite)}`}>
                               {notif.priorite}
                             </span>
                             {notif.statut === 'Non lue' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
                             <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Clock size={12}/> {new Date(notif.created_at).toLocaleString()}
                             </span>
                          </div>
                          <h4 className="font-bold text-white text-lg mb-1">{notif.titre}</h4>
                          <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                             <span className="flex items-center gap-1"><User size={14}/> {notif.client_nom}</span>
                             <span className="flex items-center gap-1"><PhoneIcon size={14}/> {notif.client_phone}</span>
                             <span className="flex items-center gap-1"><CreditCard size={14}/> {notif.numero_compte}</span>
                          </div>
                       </div>
                       
                       <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                          <span className="text-xl font-bold text-emerald-400 font-mono">
                             {(notif.montant || 0).toLocaleString()} <span className="text-sm text-emerald-600">FCFA</span>
                          </span>
                          <div className="flex gap-2 w-full md:w-auto">
                             <Button 
                               variant="primary" 
                               size="sm" 
                               className="flex-1 md:flex-none"
                               onClick={(e) => { e.stopPropagation(); validerPaiementCompte(notif); }}
                               icon={Check}
                             >
                                Valider
                             </Button>
                             {notif.statut === 'Non lue' && (
                               <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 onClick={(e) => { e.stopPropagation(); marquerCommeLue(notif.id); }}
                                 icon={Eye}
                                 title="Marquer comme lue"
                               />
                             )}
                          </div>
                       </div>
                    </div>
                 </div>
               ))}
            </div>
         )}
      </div>
    </div>
  );

  // Si on est pas en mode compact, on rend directement si onClose n'est pas fourni (cas page dédiée)
  // Ou on rend dans la Modal si onClose est fourni (cas overlay)
  if (!onClose) {
     return <div className="p-4">{modalContent}</div>;
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Notifications Caisse"
      subtitle="Gestion des paiements et alertes"
      size="2xl"
    >
      {modalContent}

      {/* Détail Overlay (Modal sur Modal ou remplacement ?) 
          Pour mobile-first, mieux vaut remplacer le contenu ou utiliser une Drawer.
          Ici on utilise une sous-vue conditionnelle simple si selectedNotif est actif.
      */}
      {selectedNotif && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-200">
           <Card className="w-full max-w-lg shadow-2xl border-slate-600">
              <Card.Header className="flex justify-between items-center bg-slate-800">
                 <h3 className="font-bold text-lg">Détails Notification</h3>
                 <Button variant="ghost" size="sm" icon={X} onClick={() => setSelectedNotif(null)}/>
              </Card.Header>
              <Card.Content className="space-y-4">
                 <div className="p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-sm__ text-slate-400 mb-1">Message</p>
                    <p className="text-white text-lg">{selectedNotif.message}</p>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <p className="text-xs text-slate-500 uppercase">Client</p>
                       <p className="font-semibold text-white">{selectedNotif.client_nom}</p>
                       <p className="text-sm text-slate-400">{selectedNotif.client_phone}</p>
                    </div>
                    <div>
                       <p className="text-xs text-slate-500 uppercase">Compte</p>
                       <p className="font-semibold text-white">{selectedNotif.numero_compte}</p>
                       <p className="text-sm text-slate-400">{selectedNotif.type_compte}</p>
                    </div>
                 </div>

                 <div className="pt-4 flex gap-3">
                    <Button 
                      variant="primary" 
                      fullWidth 
                      onClick={() => { validerPaiementCompte(selectedNotif); setSelectedNotif(null); }}
                      icon={CheckCircle}
                    >
                       Valider Paiement
                    </Button>
                    <Button 
                      variant="secondary" 
                      fullWidth 
                      onClick={() => setSelectedNotif(null)}
                    >
                       Fermer
                    </Button>
                 </div>
              </Card.Content>
           </Card>
        </div>
      )}
    </Modal>
  );
}
