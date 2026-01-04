import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Clock, XCircle, UserCheck } from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes';
import { Card, StatCard, Badge, Button, ResponsiveTable } from '../ui';
import { useUserProfile } from '../../hooks/useUserProfile';
import { hrPresenceApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

interface PresenceTrackerProps {
  employes: Employe[];
}

export default function PresenceTracker({ employes }: PresenceTrackerProps) {
  const { user } = useUserProfile();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [modalEmployees, setModalEmployees] = useState<any[]>([]);
  const [userPresence, setUserPresence] = useState<any>(null); // Current user's presence state
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    fetchPresenceStats();
    
    // WebSocket listener for real-time updates
    const handlePresenceUpdate = () => {
      fetchPresenceStats();
    };
    
    window.addEventListener('PRESENCE_UPDATE', handlePresenceUpdate);
    return () => window.removeEventListener('PRESENCE_UPDATE', handlePresenceUpdate);
  }, []);

  const fetchPresenceStats = useCallback(async () => {
    setLoading(true);
    try {
        const data = await hrPresenceApi.getToday();
        setStats(data);
        // Find current user's presence using authenticated user ID
        const myPresence = data.liste?.find((p: any) => p.employeId === user?.id);
        setUserPresence(myPresence);
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du chargement des présences'));
    } finally {
        setLoading(false);
    }
  }, [user?.id]);

  const handleCheckIn = useCallback(async () => {
    try {
        await hrPresenceApi.checkIn();
        toast.success('Arrivée enregistrée');
        fetchPresenceStats();
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du pointage'));
    }
  }, [fetchPresenceStats]);

  const handleCheckOut = useCallback(async () => {
    try {
        await hrPresenceApi.checkOut();
        toast.success('Fin de journée enregistrée');
        fetchPresenceStats();
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du pointage'));
    }
  }, [fetchPresenceStats]);

  const handleStartBreak = useCallback(async () => {
    try {
        await hrPresenceApi.startBreak();
        toast.success('Pause démarrée');
        fetchPresenceStats();
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du pointage'));
    }
  }, [fetchPresenceStats]);

  const handleEndBreak = useCallback(async () => {
    try {
        await hrPresenceApi.endBreak();
        toast.success('Retour de pause enregistré');
        fetchPresenceStats();
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du pointage'));
    }
  }, [fetchPresenceStats]);

  const handleShowEmployees = useCallback(async (status: string) => {
    try {
        const data = await hrPresenceApi.getByStatus(status);
        setModalEmployees(data);
        setModalStatus(status);
        setShowModal(true);
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du chargement des employés'));
    }
  }, []);

  if(!stats) return <div className="p-4 text-center text-slate-400">Chargement des présences...</div>;

  const getPresenceStatus = (empId: string) => {
      const record = stats.liste?.find((p: any) => p.employeId === empId);
      if (!record) return { status: 'Non pointé', color: 'neutral', time: '-' };
      return { 
          status: record.statut, 
          color: record.statut === 'Présent' ? 'success' : record.statut === 'Retard' ? 'warning' : 'danger',
          time: record.heureArrivee ? new Date(record.heureArrivee).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '-'
      };
  };

  // Merge employees with presence data
  const presenceData = employes.map(emp => {
      const statusData = getPresenceStatus(emp.id);
      return {
          ...emp,
          presenceStatus: statusData.status,
          presenceColor: statusData.color,
          arrivalTime: statusData.time
      };
  });

  // Pagination logic
  const totalPages = Math.ceil(presenceData.length / ITEMS_PER_PAGE);
  const paginatedPresenceData = presenceData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const columns = [
      { 
          label: 'Employé', key: 'nom', primary: true,
          format: (val: string, item: any) => (
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                      {item.nom?.charAt(0)}{item.prenom?.charAt(0)}
                  </div>
                  <div>
                      <div className="font-medium text-white">{item.nom} {item.prenom}</div>
                      <div className="text-[10px] text-slate-400">{item.poste}</div>
                  </div>
              </div>
          )
      },
      {
          label: 'Arrivée', key: 'arrivalTime',
          format: (val: string) => <span className="font-mono text-slate-300 text-xs">{val}</span>
      },
      {
          label: 'Statut', key: 'presenceStatus',
          format: (val: string, item: any) => (
              <Badge variant={item.presenceColor as any} value={val} size="sm" />
          )
      }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Présents"
          value={`${stats.presents}/${stats.totalEmployes}`}
          subtitle={`${stats.tauxPresence}% taux`}
          icon={CheckCircle}
          color="success"
          onClick={() => handleShowEmployees('Présent')}
          className="cursor-pointer hover:scale-105 transition-transform"
        />

        <StatCard
          title="Retards"
          value={stats.retards}
          icon={Clock}
          color="warning"
          onClick={() => handleShowEmployees('Retard')}
          className="cursor-pointer hover:scale-105 transition-transform"
        />

        <StatCard
          title="Absents"
          value={stats.absents}
          icon={XCircle}
          color="danger"
          onClick={() => handleShowEmployees('Absent')}
          className="cursor-pointer hover:scale-105 transition-transform"
        />

        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 flex flex-col justify-center items-center gap-2">
            <h4 className="text-white text-xs font-bold">Pointage</h4>
            {!userPresence?.heureArrivee && (
              <Button variant="primary" size="sm" fullWidth icon={UserCheck} onClick={handleCheckIn}>
                Pointer Arrivée
              </Button>
            )}
            {userPresence?.heureArrivee && !userPresence?.pauseDebut && !userPresence?.heureDepart && (
              <>
                <Button variant="secondary" size="sm" fullWidth onClick={handleStartBreak}>
                  Départ Pause
                </Button>
                <Button variant="danger" size="sm" fullWidth onClick={handleCheckOut}>
                  Fin de Journée
                </Button>
              </>
            )}
            {userPresence?.pauseDebut && !userPresence?.pauseFin && (
              <Button variant="success" size="sm" fullWidth onClick={handleEndBreak}>
                Retour Pause
              </Button>
            )}
            {userPresence?.pauseFin && !userPresence?.heureDepart && (
              <Button variant="danger" size="sm" fullWidth onClick={handleCheckOut}>
                Fin de Journée
              </Button>
            )}
            {userPresence?.heureDepart && (
              <div className="text-xs text-green-400 text-center">Journée terminée</div>
            )}
        </div>
      </div>

      <Card padding="sm" className="bg-slate-900/50 border-slate-800">
        <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock size={16} className="text-cyan-400" />
                Feuille de Présence - {new Date().toLocaleDateString('fr-FR')}
            </h3>
            <span className="text-xs text-slate-400">
                {presenceData.length} employés
            </span>
        </div>
        
        <ResponsiveTable 
            data={paginatedPresenceData}
            columns={columns}
            loading={loading}
            mobileBreakpoint="sm"
            maxHeight="500px"
            pagination={{
              page: currentPage,
              totalPages,
              onPageChange: setCurrentPage
            }}
        />
      </Card>

      {/* Modal Liste Employés */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-slate-900 rounded-xl border border-slate-700 max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-white font-bold">Employés - {modalStatus}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {modalEmployees.length > 0 ? (
                <div className="space-y-2">
                  {modalEmployees.map(emp => (
                    <div key={emp.id} className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm">
                        {emp.nom?.charAt(0)}{emp.prenom?.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="text-white font-medium">{emp.nom} {emp.prenom}</div>
                        <div className="text-xs text-slate-400">{emp.poste}</div>
                      </div>
                      {emp.heureArrivee && (
                        <div className="text-xs text-slate-400">
                          Arrivée: {new Date(emp.heureArrivee).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">Aucun employé dans cette catégorie</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
