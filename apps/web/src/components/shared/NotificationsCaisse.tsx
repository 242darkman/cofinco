import React, { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Bell, AlertCircle, CheckCircle, Clock, X, Eye, Check, User, Phone as PhoneIcon, CreditCard } from 'lucide-react';
import { Card, Button, Modal, TabGroup, ResponsiveTable } from '../ui';
import { authService } from '../../lib/auth';

interface Notification {
  id: string;
  typeNotification: string;
  compteId: string;
  clientId: string;
  titre: string;
  message: string;
  modePaiement: string;
  montant: number;
  referenceExterne: string;
  priorite: 'Basse' | 'Normal' | 'Haute' | 'Urgente';
  statut: 'Non lue' | 'Lue' | 'Traitée' | 'Archivée';
  createdAt: string;
  clientNom?: string;
  clientPhone?: string;
  numeroCompte?: string;
  typeCompte?: string;
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
    if (!confirm(`Confirmer la réception du paiement de ${(notif.montant || 0).toLocaleString()} FCFA par ${notif.modePaiement} ?`)) return;

    try {
      // 1. Activer le compte
      await fetch(`/api/comptes-bancaires/${notif.compteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paiement_valide: true, solde: notif.montant, statut: 'ACTIVE' })
      });

      // 2. Enregistrer la transaction
      await fetch('/api/transactions-epargne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compte_id: notif.compteId,
          type_transaction: 'Dépôt',
          montant: notif.montant,
          solde_avant: 0,
          solde_apres: notif.montant,
          mode_paiement: notif.modePaiement,
          reference_paiement: notif.referenceExterne,
          description: 'Dépôt initial - Ouverture de compte',
          effectue_par: user?.id,
          statut: 'VALIDATED'
        })
      });

      await traiterNotification(notif.id, `Paiement validé - ${notif.modePaiement}`);
      alert('Paiement validé Compte actif.');
    } catch (error: any) {
      alert(`Erreur: ${error.error}`);
    }
  };

  const getPriorityColor = (priorite: string) => {
    switch (priorite) {
      case 'Urgente': return 'text-status-danger bg-status-danger-bg border-status-danger/20';
      case 'Haute': return 'text-status-warning bg-status-warning-bg border-status-warning/20';
      case 'Normal': return 'text-status-info bg-status-info-bg border-status-info/20';
      default: return 'text-content-muted bg-surface-subtle/30 border-edge-strong/20';
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
               <Bell className="text-status-info" size={20} />
               {nonLuesCount > 0 && (
                 <span className="absolute -top-1.5 -right-1.5 bg-status-danger text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                   {nonLuesCount}
                 </span>
               )}
             </div>
             <h3 className="font-bold text-content-primary">Notifications Caisse</h3>
           </div>
           {onClose && <Button variant="ghost" size="sm" onClick={onClose} icon={X} />}
        </Card.Header>
        
        <Card.Content className="space-y-2 max-h-[300px] overflow-y-auto px-1">
          {loading ? (
             <div className="text-center py-4 text-content-muted">Chargement...</div>
          ) : notifications.length === 0 ? (
             <div className="text-center py-4 text-content-muted flex flex-col items-center">
                <CheckCircle size={24} className="mb-2 opacity-50"/>
                <span className="text-sm">Aucune notification</span>
             </div>
          ) : (
             notifications.slice(0, 5).map(notif => (
               <div 
                 key={notif.id}
                 className={`p-3 rounded-lg border cursor-pointer hover:bg-surface-elevated/50 transition ${
                    notif.statut === 'Non lue' ? 'bg-surface-elevated/30 border-status-info/30' : 'bg-transparent border-edge'
                 }`}
                 onClick={() => setSelectedNotif(notif)}
               >
                 <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPriorityColor(notif.priorite)}`}>
                      {notif.priorite}
                    </span>
                    <span className="text-xs text-content-muted">{new Date(notif.createdAt).toLocaleDateString()}</span>
                 </div>
                 <p className="text-sm font-semibold text-content-primary truncate">{notif.titre}</p>
                 <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-content-muted truncate max-w-[120px]">{notif.clientNom}</span>
                    <span className="text-sm font-mono text-status-success">{(notif.montant || 0).toLocaleString()} FCFA</span>
                 </div>
               </div>
             ))
          )}
        </Card.Content>
        {notifications.length > 5 && (
           <div className="p-3 border-t border-edge text-center">
              <Button variant="ghost" size="sm" className="w-full text-status-info" onClick={onClose}>
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

      <div className="flex-1 overflow-hidden min-h-0 bg-surface-base/50 rounded-lg border border-edge flex flex-col">
         {loading ? (
            <div className="flex items-center justify-center h-full">
               <Spinner size="md" />
            </div>
         ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-content-muted">
               <CheckCircle size={48} className="mb-4 opacity-20"/>
               <p>Aucune notification</p>
            </div>
         ) : (
            <div className="overflow-y-auto p-2 space-y-2">
               {notifications.map(notif => (
                 <div 
                   key={notif.id}
                   className={`group p-4 rounded-lg border transition-all hover:bg-surface ${
                     notif.statut === 'Non lue' 
                       ? 'bg-surface/50 border-status-info/40 shadow-[inset_4px_0_0_0_#3b82f6]' 
                       : 'bg-surface-base border-edge opacity-80 hover:opacity-100'
                   }`}
                   onClick={() => setSelectedNotif(notif)}
                 >
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                             <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getPriorityColor(notif.priorite)}`}>
                               {notif.priorite}
                             </span>
                             {notif.statut === 'Non lue' && <span className="w-2 h-2 rounded-full bg-status-info animate-pulse"></span>}
                             <span className="text-xs text-content-muted flex items-center gap-1">
                                <Clock size={12}/> {new Date(notif.createdAt).toLocaleString()}
                             </span>
                          </div>
                          <h4 className="font-bold text-content-primary text-lg mb-1">{notif.titre}</h4>
                          <div className="flex flex-wrap gap-4 text-sm text-content-muted">
                             <span className="flex items-center gap-1"><User size={14}/> {notif.clientNom}</span>
                             <span className="flex items-center gap-1"><PhoneIcon size={14}/> {notif.clientPhone}</span>
                             <span className="flex items-center gap-1"><CreditCard size={14}/> {notif.numeroCompte}</span>
                          </div>
                       </div>
                       
                       <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                          <span className="text-xl font-bold text-status-success font-mono">
                             {(notif.montant || 0).toLocaleString()} <span className="text-sm text-status-success">FCFA</span>
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
           <Card className="w-full max-w-lg shadow-2xl border-edge-strong">
              <Card.Header className="flex justify-between items-center bg-surface">
                 <h3 className="font-bold text-lg">Détails Notification</h3>
                 <Button variant="ghost" size="sm" icon={X} onClick={() => setSelectedNotif(null)}/>
              </Card.Header>
              <Card.Content className="space-y-4">
                 <div className="p-3 bg-surface-elevated/50 rounded-lg">
                    <p className="text-sm__ text-content-muted mb-1">Message</p>
                    <p className="text-content-primary text-lg">{selectedNotif.message}</p>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <p className="text-xs text-content-muted uppercase">Client</p>
                       <p className="font-semibold text-content-primary">{selectedNotif.clientNom}</p>
                       <p className="text-sm text-content-muted">{selectedNotif.clientPhone}</p>
                    </div>
                    <div>
                       <p className="text-xs text-content-muted uppercase">Compte</p>
                       <p className="font-semibold text-content-primary">{selectedNotif.numeroCompte}</p>
                       <p className="text-sm text-content-muted">{selectedNotif.typeCompte}</p>
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
