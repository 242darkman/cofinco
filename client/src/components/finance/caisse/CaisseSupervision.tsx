import React, { useState, useEffect } from 'react';
import { ShieldCheck, Wallet, User, Lock, ExternalLink, RefreshCw, AlertTriangle, AlertOctagon, TrendingUp, Clock, Info, CheckCircle, Smartphone } from 'lucide-react';
import Button from '../../ui/Button';
import Card from '../../ui/Card';
import StatCard from '../../ui/StatCard';
import TabGroup from '../../ui/TabGroup';
import Modal from '../../ui/Modal';
import { sessionCaisseApi, authApi, userApi } from '../../../lib/api-client';

export default function CaisseSupervision({ onTakeControl }: { onTakeControl?: (session: any) => void }) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'caissiers' | 'alertes'>('sessions');
  const [sessions, setSessions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    
    // Écoute des événements WebSocket
    const handleRealTimeUpdate = () => {
        fetchData();
    };

    window.addEventListener('caisse-update', handleRealTimeUpdate);
    return () => window.removeEventListener('caisse-update', handleRealTimeUpdate);
  }, []);

  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isClosingOpen, setIsClosingOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // User Management State
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sessionsData, usersData] = await Promise.all([
        sessionCaisseApi.getAll(),
        authApi.getUsers().catch(() => [])
      ]);
      setSessions(sessionsData || []);
      setUsers(usersData || []);
    } catch (error) {
      console.error("Erreur chargement supervision", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (session: any) => {
    try {
      setLoading(true);
      const details = await sessionCaisseApi.get(session.id);
      setSelectedSession(details);
      setIsDetailsOpen(true);
    } catch (error) {
      console.error("Erreur chargement détails session", error);
    } finally {
      setLoading(false);
    }
  };

  const handleForceClose = async () => {
    if (!selectedSession) return;
    
    setSubmitting(true);
    try {
      // Force closure with current theoretical balance as real balance
      await sessionCaisseApi.close(selectedSession.id, {
        solde_reel: selectedSession.solde_theorique,
        ecart: "0",
        billetage_fermeture: {},
        observations: "Fermeture forcée par l'administrateur depuis la supervision."
      });
      setIsClosingOpen(false);
      setSelectedSession(null);
      fetchData();
    } catch (error) {
      console.error("Erreur lors de la fermeture forcée", error);
    } finally {
      setSubmitting(false);
    }
  };

  const activeSessions = sessions.filter(s => ['ouverte', 'ouvert'].includes(s.statut?.toLowerCase()));
  const closedSessions = sessions.filter(s => ['fermée', 'fermé', 'ferme'].includes(s.statut?.toLowerCase()));
  const totalEspeces = activeSessions.reduce((acc, s) => acc + (Number(s.solde_theorique) || 0), 0);

  const tabs = [
    { key: 'sessions', label: 'Caisses Ouvertes', icon: Wallet, badge: activeSessions.length },
    { key: 'caissiers', label: 'Caissiers', icon: User },
    // { key: 'alertes', label: 'Anomalies', icon: AlertTriangle, badge: 0 }
  ];

  const handleManageUser = async (user: any) => {
    setSelectedUser(user);
    setIsUserManagementOpen(true);
    setLoadingHistory(true);
    try {
      const history = await sessionCaisseApi.getByCaissier(user.id);
      setUserHistory(history || []);
    } catch (error) {
      console.error("Erreur chargement historique utilisateur", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleToggleUserStatus = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const newStatus = selectedUser.statut === 'Actif' ? 'Inactif' : 'Actif';
      await userApi.update(selectedUser.id, { statut: newStatus });
      
      // Update local state
      setUsers((prev: any[]) => prev.map(u => u.id === selectedUser.id ? { ...u, statut: newStatus } : u));
      setSelectedUser((prev: any) => ({ ...prev, statut: newStatus }));
      
      // Refresh global data to ensure consistency (e.g. if status affects session eligibility)
      fetchData();
    } catch (error) {
      console.error("Erreur modification statut utilisateur", error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(amount);
  };

  const formatTimeAgo = (date: string) => {
    if (!date) return '-';
    const diff = (new Date().getTime() - new Date(date).getTime()) / 1000 / 60; // minutes
    if (diff < 60) return `${Math.floor(diff)} min`;
    const hours = Math.floor(diff / 60);
    return `${hours}h ${Math.floor(diff % 60)}min`;
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      
      {/* KPI Supervision */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          title="Fonds en Caisse"
          value={formatMoney(totalEspeces)}
          icon={Wallet}
          color="primary"
          trend={`${activeSessions.length} caisses`}
          className="col-span-2 bg-slate-900/50 backdrop-blur-md border-slate-800/60"
        />
        <StatCard
          title="Caissiers Actifs"
          value={activeSessions.length}
          icon={User}
          color="success"
          trend="En ligne"
          className="bg-slate-900/50 backdrop-blur-md border-slate-800/60"
        />
        <StatCard
          title="Fermées Auj."
          value={closedSessions.filter(s => new Date(s.date_fermeture || s.date_ouverture).toDateString() === new Date().toDateString()).length}
          icon={Lock}
          color="neutral"
          trend="Clôturées"
          className="bg-slate-900/50 backdrop-blur-md border-slate-800/60"
        />
      </div>

      <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-800 shadow-xl overflow-hidden min-h-[500px]">
        
        {/* Navigation */}
        <div className="p-2 border-b border-slate-800 bg-slate-950/30 sticky top-0 z-10">
           <TabGroup
              activeTab={activeTab}
              onTabChange={(key) => setActiveTab(key as any)}
              tabs={tabs}
              variant="pills"
              size="sm"
              scrollable
           />
        </div>

        <div className="p-4 sm:p-6">
          
          {/* VUE SESSIONS */}
          {activeTab === 'sessions' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wallet size={20} className="text-emerald-400" />
                  Caisses en cours
                </h3>
                <Button size="sm" variant="ghost" onClick={fetchData} icon={RefreshCw} />
              </div>

              {activeSessions.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                   <div className="bg-slate-800/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                     <Lock size={32} className="opacity-50" />
                   </div>
                   <p>Aucune caisse ouverte actuellement.</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {activeSessions.map(session => (
                    <Card key={session.id} variant="glass" padding="md" className="border-l-4 border-l-emerald-500 group relative overflow-hidden">
                       <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 font-bold text-slate-300">
                                {session.caissier_nom?.[0] || 'C'}
                             </div>
                             <div>
                                <h4 className="font-bold text-white">{session.caissier_nom || 'Caissier Inconnu'}</h4>
                                <div className="text-xs text-emerald-400 flex items-center gap-1">
                                   <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                   Ouverte il y a {formatTimeAgo(session.date_ouverture)}
                                </div>
                             </div>
                          </div>
                          <div className="text-right">
                             <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Solde Théorique</div>
                             <div className="text-lg font-mono font-bold text-white">{formatMoney(Number(session.solde_theorique))}</div>
                          </div>
                       </div>
                       
                           <div className="flex items-center gap-2 pt-3 border-t border-slate-800/50">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="flex-1 text-xs border-slate-700 hover:bg-slate-800"
                                onClick={() => handleViewDetails(session)}
                              >
                                 Voir Détails
                              </Button>
                              
                              {/* Admin Only: Take Control */}
                              {onTakeControl && (
                                <Button 
                                  variant="primary" 
                                  size="sm" 
                                  className="flex-1 text-xs"
                                  onClick={() => onTakeControl(session)}
                                >
                                   Prendre la main
                                </Button>
                              )}

                              <Button 
                            variant="danger" 
                            size="sm" 
                            className="px-3" 
                            title="Forcer la fermeture"
                            onClick={() => {
                              setSelectedSession(session);
                              setIsClosingOpen(true);
                            }}
                          >
                             <Lock size={14} />
                          </Button>
                       </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VUE CAISSIERS */}
          {activeTab === 'caissiers' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <User size={20} className="text-cyan-400" />
                        Gestion des Caissiers
                    </h3>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800">
                   <table className="w-full text-sm text-left">
                      <thead className="bg-slate-900/80 text-xs font-bold uppercase text-slate-500 tracking-wider">
                         <tr>
                            <th className="p-4">Caissier</th>
                            <th className="p-4">Statut</th>
                            <th className="p-4 text-right">Actions</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                         {users.filter(u => ['Agent Caisse', 'Caissier', 'Administrateur', 'Superviseur'].includes(u.role)).map(user => (
                            <tr key={user.id} className="hover:bg-slate-800/30">
                               <td className="p-4 font-medium text-white">
                                  {user.nom} {user.prenom}
                                  <div className="text-xs text-slate-500 font-normal">{user.email}</div>
                               </td>
                               <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                      selectedUser?.statut === 'Actif' || user.statut === 'Actif' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                                      'bg-red-500/10 text-red-400 border-red-500/20'
                                  }`}>
                                     {user.statut === 'Actif' ? 'Actif' : 'Inactif'}
                                  </span>
                               </td>
                               <td className="p-4 text-right">
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-slate-400 hover:text-white"
                                    onClick={() => handleManageUser(user)}
                                  >
                                    Gérer
                                  </Button>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

        </div>
      </Card>

      {/* MODAL DÉTAILS SESSION */}
      <Modal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title="Détails de la Session"
        subtitle={selectedSession ? `Caissier: ${selectedSession.caissier_nom}` : ""}
        size="lg"
      >
        {selectedSession && (
          <div className="flex flex-col h-[70vh] sm:h-[500px] -m-2">
            {/* KPI grid - Fixed height part */}
            <div className="p-2 border-b border-slate-800/50 mb-4 bg-surface-base z-10">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold mb-1">Ouverture</div>
                  <div className="text-white text-xs sm:text-sm font-medium">
                    {selectedSession.date_ouverture ? new Date(selectedSession.date_ouverture).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold mb-1">Solde Initial</div>
                  <div className="text-white text-xs sm:text-sm font-mono font-bold">{formatMoney(Number(selectedSession.solde_initial || 0))}</div>
                </div>
                <div className="p-2 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 col-span-2 sm:col-span-1">
                  <div className="text-[10px] sm:text-xs text-slate-500 uppercase font-bold mb-1">Solde Actuel</div>
                  <div className="text-emerald-400 text-xs sm:text-sm font-mono font-bold">{formatMoney(Number(selectedSession.solde_theorique || 0))}</div>
                </div>
              </div>
            </div>

            {/* Operations - Scrollable part */}
            <div className="flex-1 flex flex-col min-h-0 px-2 space-y-3">
              <h4 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={14} className="sm:size-4" />
                Dernières Opérations
              </h4>
              <div className="flex-1 overflow-auto rounded-xl border border-slate-800 bg-slate-900/50 custom-scrollbar">
                {selectedSession.operations?.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center text-slate-500 italic">Aucune opération enregistrée</div>
                ) : (
                  <div className="min-w-full inline-block align-middle">
                    <table className="w-full text-xs sm:text-sm text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-950 z-10 text-[10px] sm:text-xs font-bold uppercase text-slate-500 tracking-wider">
                        <tr>
                          <th className="p-2 sm:p-3 border-b border-slate-800">Heure</th>
                          <th className="p-2 sm:p-3 border-b border-slate-800">Type</th>
                          <th className="p-2 sm:p-3 border-b border-slate-800 text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {selectedSession.operations?.map((op: any) => (
                          <tr key={op.id} className="hover:bg-slate-800/20 active:bg-slate-800/30 transition-colors">
                            <td className="p-2 sm:p-3 text-slate-400 font-mono text-[10px] sm:text-xs whitespace-nowrap">
                              {op.created_at ? new Date(op.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                            </td>
                            <td className="p-2 sm:p-3">
                              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase whitespace-nowrap ${
                                (op.type_operation || '').toLowerCase().includes('retrait') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                {op.type_operation || 'Inconnu'}
                              </span>
                            </td>
                            <td className={`p-2 sm:p-3 text-right font-mono font-bold whitespace-nowrap text-[10px] sm:text-xs ${
                              (op.type_operation || '').toLowerCase().includes('retrait') ? 'text-red-400' : 'text-emerald-400'
                            }`}>
                              {(op.type_operation || '').toLowerCase().includes('retrait') ? '-' : '+'}{formatMoney(Number(op.montant || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 mt-auto border-t border-edge px-2">
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fermer</Button>
              <Button 
                variant="danger" 
                icon={Lock}
                onClick={() => {
                  setIsDetailsOpen(false);
                  setIsClosingOpen(true);
                }}
              >
                Clôturer la Caisse
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL FERMETURE FORCÉE */}
      <Modal
        isOpen={isClosingOpen}
        onClose={() => setIsClosingOpen(false)}
        title="Fermeture Forcée"
        variant="danger"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsClosingOpen(false)} disabled={submitting}>Annuler</Button>
            <Button variant="danger" onClick={handleForceClose} isLoading={submitting}>Confirmer la Fermeture</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 text-red-500">
            <AlertTriangle className="shrink-0" size={24} />
            <div>
              <p className="font-bold">Action irréversible</p>
              <p className="text-sm opacity-80">
                Vous êtes sur le point de forcer la clôture de la caisse de <strong>{selectedSession?.caissier_nom}</strong>.
              </p>
            </div>
          </div>
          
          <div className="p-4 bg-slate-800/50 rounded-xl space-y-3">
             <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Solde théorique final :</span>
                <span className="text-white font-mono font-bold">{formatMoney(Number(selectedSession?.solde_theorique))}</span>
             </div>
             <p className="text-xs text-slate-500 leading-relaxed italic border-t border-slate-700/50 pt-2">
               Note: La session sera fermée avec le solde théorique actuel comme solde réel. Un écart de 0 sera enregistré.
             </p>
          </div>
        </div>
      </Modal>

      {/* MODAL GESTION CAISSIER */}
      <Modal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        title="Gestion du Caissier"
        subtitle={selectedUser ? `${selectedUser.nom} ${selectedUser.prenom} (${selectedUser.role})` : ""}
        size="lg"
      >
        {selectedUser && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-xl space-y-3">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Info size={16} />
                  Informations Compte
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Email:</span>
                    <span className="text-white">{selectedUser.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Statut:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        selectedUser.statut === 'Actif' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                        'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                       {selectedUser.statut === 'Actif' ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
                <div className="pt-2">
                  <Button 
                    variant={selectedUser.statut === 'Actif' ? "outline" : "primary"}
                    size="sm" 
                    className="w-full"
                    onClick={handleToggleUserStatus}
                    isLoading={submitting}
                  >
                    {selectedUser.statut === 'Actif' ? "Désactiver le compte" : "Activer le compte"}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-xl space-y-3">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={16} />
                  Dernière Activité
                </h4>
                <div className="text-center py-4">
                  <p className="text-xs text-slate-500 italic">
                    {userHistory.length > 0 ? 
                      `Dernière session le ${new Date(userHistory[0].date_ouverture).toLocaleDateString()}` : 
                      'Aucune activité récente enregistrée'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <RefreshCw size={16} className={loadingHistory ? 'animate-spin' : ''} />
                Historique des Sessions
              </h4>
              <div className="overflow-auto rounded-xl border border-slate-800 bg-slate-900/50 max-h-[300px] custom-scrollbar">
                {loadingHistory ? (
                  <div className="p-8 text-center text-slate-500">Chargement de l'historique...</div>
                ) : userHistory.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 italic">Aucune session trouvée</div>
                ) : (
                  <div className="min-w-full inline-block align-middle">
                    <table className="w-full text-xs sm:text-sm text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-950 z-10 text-[10px] sm:text-xs font-bold uppercase text-slate-500 tracking-wider">
                        <tr>
                          <th className="p-2 sm:p-3 border-b border-slate-800 whitespace-nowrap">Date</th>
                          <th className="p-2 sm:p-3 border-b border-slate-800 whitespace-nowrap">Caisse</th>
                          <th className="p-2 sm:p-3 border-b border-slate-800 whitespace-nowrap">Statut</th>
                          <th className="p-2 sm:p-3 border-b border-slate-800 text-right whitespace-nowrap">Solde Final</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {userHistory.map((session: any) => (
                          <tr key={session.id} className="hover:bg-slate-800/20 active:bg-slate-800/30 transition-colors">
                            <td className="p-2 sm:p-3 text-slate-400 font-mono text-[10px] sm:text-xs">
                              {new Date(session.date_ouverture).toLocaleDateString()}
                            </td>
                            <td className="p-2 sm:p-3 text-white font-medium text-[10px] sm:text-xs whitespace-nowrap">#{session.caisse_id?.substring(0, 8) || 'N/A'}</td>
                            <td className="p-2 sm:p-3">
                              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase whitespace-nowrap ${
                                session.statut === 'Fermée' ? 'bg-slate-500/10 text-slate-400' : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                                {session.statut}
                              </span>
                            </td>
                            <td className="p-2 sm:p-3 text-right font-mono font-bold text-slate-300 text-[10px] sm:text-xs whitespace-nowrap">
                              {formatMoney(Number(session.solde_reel || session.solde_theorique || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-edge">
              <Button variant="outline" onClick={() => setIsUserManagementOpen(false)}>Fermer</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
