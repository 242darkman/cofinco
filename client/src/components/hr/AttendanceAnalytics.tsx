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
  PRESENT: { bg: 'bg-green-500/20', text: 'text-green-400', icon: CheckCircle },
  ABSENT: { bg: 'bg-red-500/20', text: 'text-red-400', icon: XCircle },
  RETARD: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: AlertCircle },
  CONGE: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: Coffee },
  WEEKEND: { bg: 'bg-slate-800/50', text: 'text-slate-500', icon: Calendar },
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
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
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
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-[10px] shrink-0">
              {employeInitials}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{employeNom}</h3>
            {employePoste && <p className="text-[10px] text-slate-500 truncate">{employePoste}</p>}
          </div>
          {onChangeEmployee && (
            <button
              onClick={onChangeEmployee}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium shrink-0 ml-1"
            >
              Changer
            </button>
          )}
        </div>

        {/* Month nav + export */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={goToPreviousMonth}
            className="p-1 hover:bg-slate-800 rounded transition text-slate-400 hover:text-white"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-center min-w-[110px]">
            <span className="text-xs font-bold text-white">{MONTHS_FR[month - 1]} {year}</span>
          </div>
          <button
            onClick={goToNextMonth}
            className="p-1 hover:bg-slate-800 rounded transition text-slate-400 hover:text-white"
            disabled={year === currentDate.getFullYear() && month >= currentDate.getMonth() + 1}
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-white disabled:opacity-50 ml-1"
            title="Exporter"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          </button>
        </div>
      </div>

      {/* ── Row 2: Inline stats ── */}
      {stats && (
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-lg px-2.5 py-1.5">
            <CheckCircle size={12} className="text-green-400" />
            <span className="text-xs font-bold text-white">{stats.totalPresents}</span>
            <span className="text-[9px] text-slate-500 hidden sm:inline">Présents</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5">
            <XCircle size={12} className="text-red-400" />
            <span className="text-xs font-bold text-white">{stats.totalAbsents}</span>
            <span className="text-[9px] text-slate-500 hidden sm:inline">Absences</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
            <AlertCircle size={12} className="text-amber-400" />
            <span className="text-xs font-bold text-white">{stats.totalRetards}</span>
            <span className="text-[9px] text-slate-500 hidden sm:inline">Retards</span>
          </div>
          <div className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-2.5 py-1.5">
            <TrendingUp size={12} className="text-indigo-400" />
            <span className="text-xs font-bold text-white">{tauxPresence.toFixed(0)}%</span>
            <span className="text-[9px] text-slate-500 hidden sm:inline">Taux</span>
          </div>
        </div>
      )}

      {/* ── Row 3: Calendar (fills remaining space) ── */}
      <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 p-2 sm:p-3 flex flex-col">
          {/* Day headers */}
          <div className="shrink-0 grid grid-cols-7 gap-0.5 mb-1">
            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((day, i) => (
              <div key={i} className="text-center text-[9px] text-slate-600 font-bold py-0.5">
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
                    isToday ? 'ring-1 ring-cyan-500/50' : ''
                  }`}
                  title={day.dayData?.statut || 'Weekend/Férié'}
                >
                  <span className={`text-[11px] font-semibold leading-none ${day.dayData?.statut ? style.text : 'text-slate-600'}`}>
                    {day.date}
                  </span>
                  {day.dayData?.heureArrivee && (
                    <span className="text-[7px] text-slate-500 leading-none mt-0.5">
                      {day.dayData.heureArrivee.substring(0, 5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend — compact, inside the calendar card */}
        <div className="shrink-0 flex items-center justify-center gap-3 px-2 py-1.5 border-t border-slate-800 bg-slate-900/80">
          {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'WEEKEND').map(([status, style]) => {
            const Icon = style.icon;
            return (
              <div key={status} className="flex items-center gap-1">
                <Icon size={8} className={style.text} />
                <span className="text-[8px] text-slate-500">
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
        <div className="shrink-0 hidden lg:block bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="px-2 py-1.5 text-left text-slate-500 font-medium">Mois</th>
                  <th className="px-2 py-1.5 text-center text-slate-500 font-medium">Prés.</th>
                  <th className="px-2 py-1.5 text-center text-slate-500 font-medium">Abs.</th>
                  <th className="px-2 py-1.5 text-center text-slate-500 font-medium">Ret.</th>
                  <th className="px-2 py-1.5 text-center text-slate-500 font-medium">Congés</th>
                  <th className="px-2 py-1.5 text-center text-slate-500 font-medium">Taux</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.mois} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-2 py-1 text-slate-300 font-medium">{MONTHS_FR[m.mois - 1]}</td>
                    <td className="px-2 py-1 text-center text-green-400">{m.joursPresents}</td>
                    <td className="px-2 py-1 text-center text-red-400">{m.joursAbsents}</td>
                    <td className="px-2 py-1 text-center text-amber-400">{m.retards}</td>
                    <td className="px-2 py-1 text-center text-blue-400">{m.joursConges}</td>
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
