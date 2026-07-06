import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, TrendingUp, Download,
  ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle,
  Coffee, Loader2
} from 'lucide-react';
import { Button, Badge } from '../ui';
import { toast } from '../../lib/toast';
import { hrApi } from '../../lib/api-client';

interface DayData {
  date: string;
  statut: string;
  heureArrivee?: string;
  heureDepart?: string;
  pauseMinutes?: number;
  retard?: boolean;
}

interface MonthlyBreakdown {
  mois: number;
  joursOuvres: number;
  joursPresents: number;
  joursAbsents: number;
  joursConges: number;
  retards: number;
  tauxPresence: number;
}

interface AttendanceStats {
  totalJoursOuvres: number;
  totalPresents: number;
  totalAbsents: number;
  totalRetards: number;
  totalConges: number;
  tauxPresence: number;
  tempsMoyenArrivee?: string;
  tempsMoyenDepart?: string;
}

interface AttendanceAnalyticsProps {
  employeId: string;
  employeNom?: string;
  employePoste?: string;
  employeInitials?: string;
  onChangeEmployee?: () => void;
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  PRESENT: { bg: 'bg-status-success-bg', text: 'text-status-success', icon: CheckCircle },
  ABSENT: { bg: 'bg-status-danger-bg', text: 'text-status-danger', icon: XCircle },
  RETARD: { bg: 'bg-status-warning-bg', text: 'text-status-warning', icon: AlertCircle },
  CONGE: { bg: 'bg-status-info-bg', text: 'text-status-info', icon: Coffee },
  WEEKEND: { bg: 'bg-surface/50', text: 'text-content-muted', icon: Calendar },
};

export default function AttendanceAnalytics({
  employeId,
  employeNom,
  employePoste,
  employeInitials,
  onChangeEmployee,
}: AttendanceAnalyticsProps) {
  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyBreakdown[]>([]);
  const [dailyData, setDailyData] = useState<DayData[]>([]);

  useEffect(() => {
    fetchAnalytics();
  }, [employeId, year, month]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const result = await hrApi.getAttendanceAnalytics(employeId, year, month);
      setStats(result.summary || null);
      setMonthlyData(result.monthlyBreakdown || []);
      setDailyData(result.dailyData || []);
    } catch (error) {
      console.error('Error fetching attendance analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await hrApi.exportAttendance(employeId, { year, month, format: 'csv' });
      if (result.url) {
        window.open(result.url, '_blank');
      } else if (result.data) {
        const blob = new Blob([result.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `presence_${employeId}_${year}_${month}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success('Export téléchargé');
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const goToPreviousMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const goToNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const days: Array<{ date: number; dayData?: DayData }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) days.push({ date: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ date: d, dayData: dailyData.find(dd => dd.date === dateStr) });
    }
    return days;
  }, [year, month, dailyData]);

  const getStatusStyle = (statut?: string) => {
    if (!statut) return STATUS_COLORS.WEEKEND;
    return STATUS_COLORS[statut] || STATUS_COLORS.WEEKEND;
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-status-warning" />
      </div>
    );
  }

  const tauxPresence = stats?.tauxPresence ?? 0;

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      {/* ── Row 1: Employee + Month nav + Export ── */}
      <div className="shrink-0 flex items-center justify-between gap-2">
        {/* Employee info */}
        <div className="flex items-center gap-2 min-w-0">
          {employeInitials && (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-status-info flex items-center justify-center text-white font-bold text-[10px] shrink-0">
              {employeInitials}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-content-primary truncate">{employeNom}</h3>
            {employePoste && <p className="text-[10px] text-content-muted truncate">{employePoste}</p>}
          </div>
          {onChangeEmployee && (
            <button
              onClick={onChangeEmployee}
              className="text-[10px] text-accent hover:text-accent font-medium shrink-0 ml-1"
            >
              Changer
            </button>
          )}
        </div>

        {/* Month nav + export */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={goToPreviousMonth}
            className="p-1 hover:bg-surface rounded transition text-content-muted hover:text-content-primary"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[110px]">
            <span className="text-xs font-bold text-content-primary">{MONTHS_FR[month - 1]} {year}</span>
          </div>
          <button
            onClick={goToNextMonth}
            className="p-1 hover:bg-surface rounded transition text-content-muted hover:text-content-primary"
            disabled={year === currentDate.getFullYear() && month >= currentDate.getMonth() + 1}
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="p-1.5 hover:bg-surface rounded-lg transition text-content-muted hover:text-content-primary disabled:opacity-50 ml-1"
            title="Exporter"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
        </div>
      </div>

      {/* ── Row 2: Inline stats ── */}
      {stats && (
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-status-success-bg border border-status-success/30 rounded-lg px-2.5 py-1.5">
            <CheckCircle size={12} className="text-status-success" />
            <span className="text-xs font-bold text-content-primary">{stats.totalPresents}</span>
            <span className="text-[9px] text-content-muted hidden sm:inline">Présents</span>
          </div>
          <div className="flex items-center gap-1.5 bg-status-danger-bg border border-status-danger/30 rounded-lg px-2.5 py-1.5">
            <XCircle size={12} className="text-status-danger" />
            <span className="text-xs font-bold text-content-primary">{stats.totalAbsents}</span>
            <span className="text-[9px] text-content-muted hidden sm:inline">Absences</span>
          </div>
          <div className="flex items-center gap-1.5 bg-status-warning-bg border border-status-warning/30 rounded-lg px-2.5 py-1.5">
            <AlertCircle size={12} className="text-status-warning" />
            <span className="text-xs font-bold text-content-primary">{stats.totalRetards}</span>
            <span className="text-[9px] text-content-muted hidden sm:inline">Retards</span>
          </div>
          <div className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 rounded-lg px-2.5 py-1.5">
            <TrendingUp size={12} className="text-accent" />
            <span className="text-xs font-bold text-content-primary">{tauxPresence.toFixed(0)}%</span>
            <span className="text-[9px] text-content-muted hidden sm:inline">Taux</span>
          </div>
        </div>
      )}

      {/* ── Row 3: Calendar (fills remaining space) ── */}
      <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 p-2 sm:p-3 flex flex-col">
          {/* Day headers */}
          <div className="shrink-0 grid grid-cols-7 gap-0.5 mb-1">
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, i) => (
              <div key={i} className="text-center text-[9px] text-content-muted font-bold py-0.5">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="flex-1 grid grid-cols-7 gap-0.5 auto-rows-fr">
            {calendarDays.map((day, index) => {
              if (day.date === 0) {
                return <div key={`empty-${index}`} />;
              }

              const style = getStatusStyle(day.dayData?.statut);
              const isToday =
                day.date === currentDate.getDate() &&
                month === currentDate.getMonth() + 1 &&
                year === currentDate.getFullYear();

              return (
                <div
                  key={day.date}
                  className={`rounded flex flex-col items-center justify-center ${style.bg} transition relative ${
                    isToday ? 'ring-1 ring-accent/50' : ''
                  }`}
                  title={day.dayData?.statut || 'Weekend/Férié'}
                >
                  <span className={`text-[11px] font-semibold leading-none ${day.dayData?.statut ? style.text : 'text-content-muted'}`}>
                    {day.date}
                  </span>
                  {day.dayData?.heureArrivee && (
                    <span className="text-[7px] text-content-muted leading-none mt-0.5">
                      {day.dayData.heureArrivee.substring(0, 5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend — compact, inside the calendar card */}
        <div className="shrink-0 flex items-center justify-center gap-3 px-2 py-1.5 border-t border-edge bg-surface-base/80">
          {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'WEEKEND').map(([status, style]) => {
            const Icon = style.icon;
            return (
              <div key={status} className="flex items-center gap-1">
                <Icon size={8} className={style.text} />
                <span className="text-[8px] text-content-muted">
                  {status === 'PRESENT' ? 'Présent' :
                   status === 'ABSENT' ? 'Absent' :
                   status === 'RETARD' ? 'Retard' : 'Congé'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Monthly breakdown — collapsible, only on larger screens ── */}
      {monthlyData.length > 0 && (
        <div className="shrink-0 hidden lg:block bg-surface-base border border-edge rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-surface/50">
                  <th className="px-2 py-1.5 text-left text-content-muted font-medium">Mois</th>
                  <th className="px-2 py-1.5 text-center text-content-muted font-medium">Prés.</th>
                  <th className="px-2 py-1.5 text-center text-content-muted font-medium">Abs.</th>
                  <th className="px-2 py-1.5 text-center text-content-muted font-medium">Ret.</th>
                  <th className="px-2 py-1.5 text-center text-content-muted font-medium">Congés</th>
                  <th className="px-2 py-1.5 text-center text-content-muted font-medium">Taux</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.mois} className="border-t border-edge/50 hover:bg-surface/30">
                    <td className="px-2 py-1 text-content-secondary font-medium">{MONTHS_FR[m.mois - 1]}</td>
                    <td className="px-2 py-1 text-center text-status-success">{m.joursPresents}</td>
                    <td className="px-2 py-1 text-center text-status-danger">{m.joursAbsents}</td>
                    <td className="px-2 py-1 text-center text-status-warning">{m.retards}</td>
                    <td className="px-2 py-1 text-center text-status-info">{m.joursConges}</td>
                    <td className="px-2 py-1 text-center">
                      <Badge
                        variant={(m.tauxPresence ?? 0) >= 90 ? 'success' : (m.tauxPresence ?? 0) >= 70 ? 'warning' : 'danger'}
                        value={`${(m.tauxPresence ?? 0).toFixed(0)}%`}
                        size="xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
