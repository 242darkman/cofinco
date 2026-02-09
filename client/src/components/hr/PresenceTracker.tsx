import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Clock, XCircle, UserCheck, MapPin, Loader2, BarChart3, Calendar } from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes';
import { Card, StatCard, Badge, Button, ResponsiveTable } from '../ui';
import { useUserProfile } from '../../hooks/useUserProfile';
import { hrPresenceApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useGeolocation } from '../../hooks/useGeolocation';
import AttendanceAnalytics from './AttendanceAnalytics';

// Interfaces typées pour remplacer les `any`
interface PresenceRecord {
  id: number;
  employeId: string;
  nom?: string;
  prenom?: string;
  poste?: string;
  statut: string;
  heureArrivee: string | null;
  heureDepart: string | null;
  pauseDebut: string | null;
  pauseFin: string | null;
}

interface PresenceStats {
  totalEmployes: number;
  presents: number;
  retards: number;
  absents: number;
  tauxPresence: number;
  liste: PresenceRecord[];
}

interface EmployePresenceData extends Employe {
  presenceStatus: string;
  presenceColor: 'success' | 'warning' | 'danger' | 'neutral';
  arrivalTime: string;
}

interface PresenceTrackerProps {
  employes: Employe[];
}

export default function PresenceTracker({ employes }: PresenceTrackerProps) {
  const { user } = useUserProfile();
  const [stats, setStats] = useState<PresenceStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [modalEmployees, setModalEmployees] = useState<PresenceRecord[]>([]);
  const [userPresence, setUserPresence] = useState<PresenceRecord | null>(null);

  // View mode: 'daily' or 'analytics'
  const [viewMode, setViewMode] = useState<'daily' | 'analytics'>('daily');
  const [selectedEmployeeForAnalytics, setSelectedEmployeeForAnalytics] = useState<Employe | null>(null);

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
        const data = await hrPresenceApi.getToday() as PresenceStats;
        setStats(data);
        // Find current user's presence using authenticated user ID
        const myPresence = data.liste?.find((p: PresenceRecord) => p.employeId === user?.id);
        setUserPresence(myPresence || null);
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du chargement des présences'));
    } finally {
        setLoading(false);
    }
  }, [user?.id]);

  const geo = useGeolocation({ desiredAccuracy: 50, maxWait: 15000 });
  const [isCapturingGps, setIsCapturingGps] = useState(false);

  const handleCheckIn = useCallback(async () => {
    // Try to capture GPS before check-in
    setIsCapturingGps(true);
    try {
        let gpsData: { latitude?: number | null; longitude?: number | null; accuracy?: number | null; gpsSource?: string } | undefined;

        if (geo.isSupported) {
            try {
                const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0,
                    });
                });
                gpsData = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    gpsSource: "gps",
                };
            } catch {
                // GPS failed — proceed without it
                console.warn("[Presence] GPS capture failed, proceeding without location");
            }
        }

        await hrPresenceApi.checkIn(gpsData);
        toast.success(gpsData ? 'Arrivée enregistrée (avec localisation)' : 'Arrivée enregistrée');
        fetchPresenceStats();
    } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du pointage'));
    } finally {
        setIsCapturingGps(false);
    }
  }, [fetchPresenceStats, geo.isSupported]);

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

  const getPresenceStatus = (empId: string): { status: string; color: 'success' | 'warning' | 'danger' | 'neutral'; time: string } => {
      const record = stats?.liste?.find((p: PresenceRecord) => p.employeId === empId);
      if (!record) return { status: 'Non pointé', color: 'neutral', time: '-' };
      return {
          status: record.statut,
          color: record.statut === 'Présent' ? 'success' : record.statut === 'Retard' ? 'warning' : 'danger',
          time: record.heureArrivee ? new Date(record.heureArrivee).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}) : '-'
      };
  };

  // Merge employees with presence data
  const presenceData: EmployePresenceData[] = employes.map(emp => {
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
          format: (val: string, item: EmployePresenceData) => (
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
          format: (val: string, item: EmployePresenceData) => (
              <Badge variant={item.presenceColor} value={val} size="sm" />
          )
      }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Header with tabs */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-800/50 rounded-lg p-0.5">
            <button
              onClick={() => { setViewMode('daily'); setSelectedEmployeeForAnalytics(null); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${
                viewMode === 'daily' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock size={12} />
              Journalier
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${
                viewMode === 'analytics' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 size={12} />
              Historique
            </button>
          </div>
        </div>
        {viewMode === 'analytics' && !selectedEmployeeForAnalytics && (
          <span className="text-xs text-slate-500">Sélectionnez un employé pour voir son historique</span>
        )}
      </div>

      {viewMode === 'daily' ? (
        <>
          {/* Stats Cards - Compact */}
          <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatCard
              title="Présents"
              value={`${stats.presents}/${stats.totalEmployes}`}
              subtitle={`${stats.tauxPresence}%`}
              icon={CheckCircle}
              color="success"
              onClick={() => handleShowEmployees('Présent')}
              className="cursor-pointer hover:scale-[1.02] transition-transform p-3"
            />

            <StatCard
              title="Retards"
              value={stats.retards}
              icon={Clock}
              color="warning"
              onClick={() => handleShowEmployees('Retard')}
              className="cursor-pointer hover:scale-[1.02] transition-transform p-3"
            />

        <StatCard
          title="Absents"
          value={stats.absents}
          icon={XCircle}
          color="danger"
          onClick={() => handleShowEmployees('Absent')}
          className="cursor-pointer hover:scale-[1.02] transition-transform p-3"
        />

        <div className="bg-slate-800/50 rounded-xl p-2 border border-slate-700/50 flex flex-col justify-center items-center gap-1.5 h-full">
            <h4 className="text-white text-[10px] font-bold uppercase tracking-wider">Pointage</h4>
            {!userPresence?.heureArrivee && (
              <Button
                variant="primary"
                size="sm"
                fullWidth
                icon={isCapturingGps ? Loader2 : UserCheck}
                onClick={handleCheckIn}
                disabled={isCapturingGps}
                className={`h-8 text-xs ${isCapturingGps ? '[&_svg]:animate-spin' : ''}`}
              >
                {isCapturingGps ? 'Localisation...' : 'Pointer Arrivée'}
              </Button>
            )}
            {userPresence?.heureArrivee && !userPresence?.pauseDebut && !userPresence?.heureDepart && (
              <div className="grid grid-cols-2 gap-1 w-full">
                <Button variant="secondary" size="sm" onClick={handleStartBreak} className="h-8 text-xs px-1">
                  Pause
                </Button>
                <Button variant="danger" size="sm" onClick={handleCheckOut} className="h-8 text-xs px-1">
                  Fin
                </Button>
              </div>
            )}
            {userPresence?.pauseDebut && !userPresence?.pauseFin && (
              <Button variant="success" size="sm" fullWidth onClick={handleEndBreak} className="h-8 text-xs">
                Retour Pause
              </Button>
            )}
            {userPresence?.pauseFin && !userPresence?.heureDepart && (
              <Button variant="danger" size="sm" fullWidth onClick={handleCheckOut} className="h-8 text-xs">
                Fin de Journée
              </Button>
            )}
            {userPresence?.heureDepart && (
              <div className="text-xs text-green-400 text-center font-bold">Terminé ✅</div>
            )}
        </div>
      </div>

      {/* Table Section - Flex Grow */}
      <div className="flex-1 min-h-0 bg-slate-900/50 border border-slate-800 rounded-lg flex flex-col">
        <div className="shrink-0 flex items-center justify-between p-2 border-b border-slate-800 bg-slate-900/50">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Clock size={14} className="text-cyan-400" />
                Feuille de Présence - {new Date().toLocaleDateString('fr-FR')}
            </h3>
            <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {presenceData.length} employés
            </span>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <ResponsiveTable
              data={paginatedPresenceData}
              columns={columns}
              loading={loading}
              mobileBreakpoint="sm"
              maxHeight="100%"
              pagination={{
                page: currentPage,
                totalPages,
                onPageChange: setCurrentPage
              }}
              density="compact"
              className="border-0 rounded-none h-full"
              headerClassName="bg-slate-900 sticky top-0"
              onRowClick={(emp: EmployePresenceData) => {
                setSelectedEmployeeForAnalytics(emp);
                setViewMode('analytics');
              }}
          />
        </div>
      </div>
        </>
      ) : (
        /* Analytics View */
        <div className="flex-1 min-h-0 flex flex-col">
          {selectedEmployeeForAnalytics ? (
              <AttendanceAnalytics
                employeId={selectedEmployeeForAnalytics.id}
                employeNom={`${selectedEmployeeForAnalytics.nom} ${selectedEmployeeForAnalytics.prenom}`}
                employePoste={selectedEmployeeForAnalytics.poste}
                employeInitials={`${selectedEmployeeForAnalytics.nom?.charAt(0) || ''}${selectedEmployeeForAnalytics.prenom?.charAt(0) || ''}`}
                onChangeEmployee={() => setSelectedEmployeeForAnalytics(null)}
              />
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 h-full overflow-y-auto">
              <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Calendar size={14} className="text-slate-400" />
                Sélectionner un employé
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {employes.map(emp => (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedEmployeeForAnalytics(emp)}
                    className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                      {emp.nom?.charAt(0)}{emp.prenom?.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{emp.nom} {emp.prenom}</p>
                      <p className="text-[10px] text-slate-400 truncate">{emp.poste}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
