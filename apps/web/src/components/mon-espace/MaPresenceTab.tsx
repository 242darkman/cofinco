import React, { useState, useCallback, useEffect } from 'react';
import { useMyPresence, MyPresence } from '../../hooks/hr/useMonEspace';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useGeolocation } from '../../hooks/useGeolocation';
import { hrPresenceApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { Card, Badge, Button, StatCard, ResponsiveTable } from '../ui';
import {
  Clock, AlertTriangle, XCircle, ChevronLeft, ChevronRight, CalendarDays,
  UserCheck, Coffee, LogOut, Play, Loader2, CheckCircle,
} from 'lucide-react';

const JOUR_NOMS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const PRESENCE_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'primary'> = {
  'PRESENT': 'success',
  'RETARD': 'warning',
  'ABSENT': 'danger',
  'CONGE': 'info',
  'MISSION': 'primary',
  'Present': 'success',
  'Retard': 'warning',
  'Absent': 'danger',
  'Conge': 'info',
  'Mission': 'primary',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function getDayName(dateStr: string): string {
  return JOUR_NOMS[new Date(dateStr).getDay()];
}

function formatTime(time: string | null): string {
  if (!time) return '-';
  if (time.includes('T')) {
    return new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return time.substring(0, 5);
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0 && m === 0) return '-';
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
}

interface TodayPresence {
  heureArrivee?: string | null;
  pauseDebut?: string | null;
  pauseFin?: string | null;
  heureDepart?: string | null;
}

export default function MaPresenceTab() {
  const [mois, setMois] = useState(getCurrentMonth);
  const { presences, isLoading } = useMyPresence(mois);
  const { user } = useUserProfile();
  const geo = useGeolocation({ desiredAccuracy: 50, maxWait: 15000 });

  // Pointage state
  const [todayPresence, setTodayPresence] = useState<TodayPresence | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [loadingToday, setLoadingToday] = useState(true);

  const fetchTodayPresence = useCallback(async () => {
    try {
      const data = await hrPresenceApi.getToday();
      const myPresence = data.liste?.find((p: any) => p.employeId === user?.id);
      setTodayPresence(myPresence || null);
    } catch {
      // Silently fail
    } finally {
      setLoadingToday(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchTodayPresence();
  }, [user?.id, fetchTodayPresence]);

  const handleCheckIn = useCallback(async () => {
    setIsCapturingGps(true);
    try {
      let gpsData: { latitude?: number | null; longitude?: number | null; accuracy?: number | null; gpsSource?: string } | undefined;
      if (geo.isSupported) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
            });
          });
          gpsData = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            gpsSource: 'gps',
          };
        } catch {
          // GPS failed — proceed without
        }
      }
      await hrPresenceApi.checkIn(gpsData);
      toast.success(gpsData ? 'Arrivée enregistrée (avec localisation)' : 'Arrivée enregistrée');
      fetchTodayPresence();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du pointage'));
    } finally {
      setIsCapturingGps(false);
    }
  }, [fetchTodayPresence, geo.isSupported]);

  const handleCheckOut = useCallback(async () => {
    try {
      await hrPresenceApi.checkOut();
      toast.success('Fin de journée enregistrée');
      fetchTodayPresence();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du pointage'));
    }
  }, [fetchTodayPresence]);

  const handleStartBreak = useCallback(async () => {
    try {
      await hrPresenceApi.startBreak();
      toast.success('Pause démarrée');
      fetchTodayPresence();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du pointage'));
    }
  }, [fetchTodayPresence]);

  const handleEndBreak = useCallback(async () => {
    try {
      await hrPresenceApi.endBreak();
      toast.success('Retour de pause enregistré');
      fetchTodayPresence();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du pointage'));
    }
  }, [fetchTodayPresence]);

  const handlePrevMonth = () => {
    const [year, month] = mois.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    setMois(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [year, month] = mois.split('-').map(Number);
    const d = new Date(year, month, 1);
    setMois(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  };

  const stats = {
    presents: presences.filter((p) => p.statut === 'PRESENT' || p.statut === 'Present').length,
    retards: presences.filter((p) => p.statut === 'RETARD' || p.statut === 'Retard').length,
    absents: presences.filter((p) => p.statut === 'ABSENT' || p.statut === 'Absent').length,
    heures: presences.reduce((sum, p) => sum + (p.heuresTravaillees || 0), 0),
  };

  const [yearStr, monthStr] = mois.split('-');
  const monthLabel = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric',
  });

  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const columns = [
    { key: 'date' as keyof MyPresence, label: 'Date', primary: true, format: (val: any) => formatDate(val) },
    { key: 'date' as keyof MyPresence, label: 'Jour', format: (val: any) => getDayName(val), hideOnMobile: true },
    { key: 'statut' as keyof MyPresence, label: 'Statut', format: (val: any) => <Badge value={val} variant={PRESENCE_VARIANTS[val] || 'neutral'} size="sm" /> },
    { key: 'heureArrivee' as keyof MyPresence, label: 'Arrivée', format: (val: any) => formatTime(val), hideOnMobile: true },
    { key: 'heureDepart' as keyof MyPresence, label: 'Départ', format: (val: any) => formatTime(val), hideOnMobile: true },
    { key: 'heuresTravaillees' as keyof MyPresence, label: 'Heures', format: (val: any) => formatHours(val) },
    { key: 'note' as keyof MyPresence, label: 'Note', format: (val: any) => val || '-', hideOnMobile: true },
  ];

  // Pointage state machine
  const isCheckedIn = !!todayPresence?.heureArrivee;
  const isOnBreak = !!todayPresence?.pauseDebut && !todayPresence?.pauseFin;
  const isBackFromBreak = !!todayPresence?.pauseFin && !todayPresence?.heureDepart;
  const isCheckedOut = !!todayPresence?.heureDepart;
  const isWorking = isCheckedIn && !todayPresence?.pauseDebut && !todayPresence?.heureDepart;

  return (
    <div className="space-y-3">
      {/* Pointage du jour */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-accent/10">
              <UserCheck className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-content-primary">Pointage du jour</h4>
              <p className="text-xs text-content-muted capitalize">{todayLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {todayPresence?.heureArrivee && (
              <span className="text-xs text-content-secondary bg-surface-subtle px-2 py-1 rounded-md">
                Arrivée: <span className="font-semibold">{formatTime(todayPresence.heureArrivee)}</span>
              </span>
            )}

            {loadingToday ? (
              <Loader2 className="h-4 w-4 animate-spin text-content-muted" />
            ) : isCheckedOut ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-status-success bg-status-success-bg px-2.5 py-1 rounded-md">
                <CheckCircle className="h-3.5 w-3.5" />
                Journée terminée
              </span>
            ) : !isCheckedIn ? (
              <Button
                variant="primary"
                size="sm"
                icon={isCapturingGps ? Loader2 : UserCheck}
                onClick={handleCheckIn}
                disabled={isCapturingGps}
                className={isCapturingGps ? '[&_svg]:animate-spin' : ''}
              >
                {isCapturingGps ? 'Localisation...' : 'Pointer Arrivée'}
              </Button>
            ) : isWorking ? (
              <>
                <Button variant="secondary" size="sm" icon={Coffee} onClick={handleStartBreak}>Pause</Button>
                <Button variant="danger" size="sm" icon={LogOut} onClick={handleCheckOut}>Fin</Button>
              </>
            ) : isOnBreak ? (
              <Button variant="success" size="sm" icon={Play} onClick={handleEndBreak}>Retour Pause</Button>
            ) : isBackFromBreak ? (
              <Button variant="danger" size="sm" icon={LogOut} onClick={handleCheckOut}>Fin de journée</Button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Month selector */}
      <Card padding="sm">
        <div className="flex items-center justify-between gap-3">
          <button onClick={handlePrevMonth} className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-content-secondary">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold text-content-primary capitalize">{monthLabel}</span>
          </div>
          <button onClick={handleNextMonth} className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-content-secondary">
            <ChevronRight size={18} />
          </button>
        </div>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard title="Jours travaillés" value={stats.presents} icon={Clock} color="success" />
        <StatCard title="Retards" value={stats.retards} icon={AlertTriangle} color="warning" />
        <StatCard title="Absences" value={stats.absents} icon={XCircle} color="danger" />
        <StatCard title="Heures totales" value={formatHours(stats.heures)} icon={Clock} color="primary" />
      </div>

      {/* Presence table */}
      <Card padding="none">
        <ResponsiveTable
          data={presences}
          columns={columns}
          loading={isLoading}
          emptyMessage="Aucune donnée de présence pour ce mois"
          density="compact"
        />
      </Card>
    </div>
  );
}
