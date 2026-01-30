import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, TrendingUp, TrendingDown, Download,
  ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertCircle,
  Coffee, Loader2
} from 'lucide-react';
import { Button, Badge, Card, SelectField } from '../ui';
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

export default function AttendanceAnalytics({ employeId, employeNom }: AttendanceAnalyticsProps) {
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
        // Create downloadable CSV
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
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  // Generate calendar grid for current month
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    const days: Array<{ date: number; dayData?: DayData }> = [];

    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ date: 0 });
    }

    // Add days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayData = dailyData.find(dd => dd.date === dateStr);
      days.push({ date: d, dayData });
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

  return (
    <div className="space-y-4">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={goToPreviousMonth}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-white"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center min-w-[150px]">
            <h3 className="text-lg font-bold text-white">{MONTHS_FR[month - 1]} {year}</h3>
            {employeNom && <p className="text-xs text-slate-500">{employeNom}</p>}
          </div>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-white"
            disabled={year === currentDate.getFullYear() && month >= currentDate.getMonth() + 1}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? <Loader2 size={14} className="animate-spin mr-2" /> : <Download size={14} className="mr-2" />}
          Exporter
        </Button>
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
            <CheckCircle size={20} className="mx-auto text-green-400 mb-1" />
            <p className="text-xl font-bold text-white">{stats.totalPresents}</p>
            <p className="text-[10px] text-slate-400">Jours présents</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
            <XCircle size={20} className="mx-auto text-red-400 mb-1" />
            <p className="text-xl font-bold text-white">{stats.totalAbsents}</p>
            <p className="text-[10px] text-slate-400">Absences</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center">
            <AlertCircle size={20} className="mx-auto text-amber-400 mb-1" />
            <p className="text-xl font-bold text-white">{stats.totalRetards}</p>
            <p className="text-[10px] text-slate-400">Retards</p>
          </div>
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 text-center">
            <TrendingUp size={20} className="mx-auto text-indigo-400 mb-1" />
            <p className="text-xl font-bold text-white">{stats.tauxPresence.toFixed(0)}%</p>
            <p className="text-[10px] text-slate-400">Taux présence</p>
          </div>
        </div>
      )}

      {/* Calendar heatmap */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
            <div key={day} className="text-center text-[10px] text-slate-500 font-medium py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            if (day.date === 0) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const style = getStatusStyle(day.dayData?.statut);
            const Icon = style.icon;

            return (
              <div
                key={day.date}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center ${style.bg} transition hover:ring-1 hover:ring-slate-600 cursor-default group relative`}
                title={day.dayData?.statut || 'Weekend/Férié'}
              >
                <span className={`text-xs font-medium ${day.dayData?.statut ? style.text : 'text-slate-500'}`}>
                  {day.date}
                </span>
                {day.dayData?.statut && (
                  <Icon size={10} className={style.text} />
                )}
                {day.dayData?.heureArrivee && (
                  <span className="text-[8px] text-slate-500">
                    {day.dayData.heureArrivee.substring(0, 5)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-slate-800">
          {Object.entries(STATUS_COLORS).filter(([k]) => k !== 'WEEKEND').map(([status, style]) => {
            const Icon = style.icon;
            return (
              <div key={status} className="flex items-center gap-1.5">
                <div className={`w-4 h-4 rounded ${style.bg} flex items-center justify-center`}>
                  <Icon size={10} className={style.text} />
                </div>
                <span className="text-[10px] text-slate-400">
                  {status === 'PRESENT' ? 'Présent' :
                   status === 'ABSENT' ? 'Absent' :
                   status === 'RETARD' ? 'Retard' : 'Congé'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly breakdown table */}
      {monthlyData.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              Récapitulatif annuel {year}
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Mois</th>
                  <th className="px-3 py-2 text-center text-slate-400 font-medium">Présents</th>
                  <th className="px-3 py-2 text-center text-slate-400 font-medium">Absents</th>
                  <th className="px-3 py-2 text-center text-slate-400 font-medium">Retards</th>
                  <th className="px-3 py-2 text-center text-slate-400 font-medium">Congés</th>
                  <th className="px-3 py-2 text-center text-slate-400 font-medium">Taux</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m) => (
                  <tr key={m.mois} className="border-t border-slate-800 hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-slate-300 font-medium">{MONTHS_FR[m.mois - 1]}</td>
                    <td className="px-3 py-2 text-center text-green-400">{m.joursPresents}</td>
                    <td className="px-3 py-2 text-center text-red-400">{m.joursAbsents}</td>
                    <td className="px-3 py-2 text-center text-amber-400">{m.retards}</td>
                    <td className="px-3 py-2 text-center text-blue-400">{m.joursConges}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant={m.tauxPresence >= 90 ? 'success' : m.tauxPresence >= 70 ? 'warning' : 'danger'}
                        value={`${m.tauxPresence.toFixed(0)}%`}
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
