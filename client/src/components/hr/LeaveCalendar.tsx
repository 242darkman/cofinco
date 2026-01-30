import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DemandeConge } from '../../hooks/hr/useConges';
import { StatutConge } from '@shared/enum/status-constants';
import { Button } from '../ui';

interface LeaveCalendarProps {
  demandes: DemandeConge[];
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const STATUS_COLORS: Record<string, string> = {
  [StatutConge.APPROVED]: 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300',
  [StatutConge.PENDING]: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
  [StatutConge.REJECTED]: 'bg-red-500/15 border-red-500/30 text-red-400',
};

export default function LeaveCalendar({ demandes }: LeaveCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const navigate = (delta: number) => {
    setCurrentDate(new Date(year, month + delta, 1));
  };

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    // Monday = 0, Sunday = 6
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const days: Array<{ date: Date; isCurrentMonth: boolean }> = [];

    // Days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month, -i),
        isCurrentMonth: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Fill remaining cells for last row (up to 42 = 6 weeks)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);

  // Map each day to the leaves active that day
  const leavesPerDay = useMemo(() => {
    const map = new Map<string, DemandeConge[]>();

    for (const demande of demandes) {
      const start = new Date(demande.dateDebut);
      const end = new Date(demande.dateFin);
      const cursor = new Date(start);

      while (cursor <= end) {
        const key = cursor.toISOString().split('T')[0];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(demande);
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return map;
  }, [demandes]);

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="h-7 w-7 p-0">
          <ChevronLeft size={16} />
        </Button>
        <h3 className="text-sm font-bold text-white">
          {MONTHS_FR[month]} {year}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => navigate(1)} className="h-7 w-7 p-0">
          <ChevronRight size={16} />
        </Button>
      </div>

      {/* Day headers */}
      <div className="shrink-0 grid grid-cols-7 border-b border-slate-800">
        {DAYS_FR.map((day) => (
          <div key={day} className="text-center py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 overflow-hidden">
        {calendarDays.map((cell, idx) => {
          const dateKey = cell.date.toISOString().split('T')[0];
          const isToday = dateKey === today;
          const leaves = leavesPerDay.get(dateKey) || [];
          const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;

          return (
            <div
              key={idx}
              className={`relative border-b border-r border-slate-800/50 p-0.5 min-h-0 flex flex-col
                ${!cell.isCurrentMonth ? 'opacity-30' : ''}
                ${isWeekend && cell.isCurrentMonth ? 'bg-slate-900/50' : ''}
                ${isToday ? 'bg-cyan-950/30' : ''}
              `}
            >
              <span className={`text-[10px] font-medium px-1 ${
                isToday
                  ? 'text-cyan-400 font-bold'
                  : cell.isCurrentMonth
                    ? 'text-slate-400'
                    : 'text-slate-600'
              }`}>
                {cell.date.getDate()}
              </span>

              {/* Leave indicators (max 2 visible + overflow count) */}
              <div className="flex-1 min-h-0 overflow-hidden space-y-px mt-px">
                {leaves.slice(0, 2).map((leave, li) => (
                  <div
                    key={`${leave.id}-${li}`}
                    className={`text-[8px] leading-tight truncate px-1 py-px rounded border ${STATUS_COLORS[leave.statut] || 'bg-slate-700 border-slate-600 text-slate-300'}`}
                    title={`${leave.employeNom} - ${leave.type} (${leave.statut})`}
                  >
                    {leave.employeNom?.split(' ')[0]}
                  </div>
                ))}
                {leaves.length > 2 && (
                  <div className="text-[8px] text-slate-500 px-1">
                    +{leaves.length - 2}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="shrink-0 flex items-center gap-4 px-3 py-1.5 border-t border-slate-800 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-emerald-500/50" /> Approuvé
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-amber-500/50" /> En attente
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-red-500/30" /> Refusé
        </span>
      </div>
    </div>
  );
}
