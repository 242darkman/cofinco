import React, { useState } from 'react';
import { useMyPresence, MyPresence } from '../../hooks/hr/useMonEspace';
import { Card, Badge, StatCard, ResponsiveTable } from '../ui';
import { Clock, AlertTriangle, XCircle, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

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
  const d = new Date(dateStr);
  return JOUR_NOMS[d.getDay()];
}

function formatTime(time: string | null): string {
  if (!time) return '-';
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
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

export default function MaPresenceTab() {
  const [mois, setMois] = useState(getCurrentMonth);
  const { presences, isLoading } = useMyPresence(mois);

  const handlePrevMonth = () => {
    const [year, month] = mois.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    const newYear = d.getFullYear();
    const newMonth = (d.getMonth() + 1).toString().padStart(2, '0');
    setMois(`${newYear}-${newMonth}`);
  };

  const handleNextMonth = () => {
    const [year, month] = mois.split('-').map(Number);
    const d = new Date(year, month, 1);
    const newYear = d.getFullYear();
    const newMonth = (d.getMonth() + 1).toString().padStart(2, '0');
    setMois(`${newYear}-${newMonth}`);
  };

  // Compute stats
  const stats = {
    presents: presences.filter((p) => p.statut === 'PRESENT' || p.statut === 'Present').length,
    retards: presences.filter((p) => p.statut === 'RETARD' || p.statut === 'Retard').length,
    absents: presences.filter((p) => p.statut === 'ABSENT' || p.statut === 'Absent').length,
    heures: presences.reduce((sum, p) => sum + (p.heuresTravaillees || 0), 0),
  };

  // Format month label
  const [yearStr, monthStr] = mois.split('-');
  const monthLabel = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  const columns = [
    {
      key: 'date' as keyof MyPresence,
      label: 'Date',
      primary: true,
      format: (val: any) => formatDate(val),
    },
    {
      key: 'date' as keyof MyPresence,
      label: 'Jour',
      format: (val: any) => getDayName(val),
      hideOnMobile: true,
    },
    {
      key: 'statut' as keyof MyPresence,
      label: 'Statut',
      format: (val: any) => {
        const variant = PRESENCE_VARIANTS[val] || 'neutral';
        return <Badge value={val} variant={variant} size="sm" />;
      },
    },
    {
      key: 'heureArrivee' as keyof MyPresence,
      label: 'Arrivee',
      format: (val: any) => formatTime(val),
      hideOnMobile: true,
    },
    {
      key: 'heureDepart' as keyof MyPresence,
      label: 'Depart',
      format: (val: any) => formatTime(val),
      hideOnMobile: true,
    },
    {
      key: 'heuresTravaillees' as keyof MyPresence,
      label: 'Heures',
      format: (val: any) => formatHours(val),
    },
    {
      key: 'note' as keyof MyPresence,
      label: 'Note',
      format: (val: any) => val || '-',
      hideOnMobile: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <Card padding="sm">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handlePrevMonth}
            className="p-2 rounded-lg hover:bg-surface-elevated transition-colors text-content-secondary"
            aria-label="Mois precedent"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-accent" />
            <span className="text-base font-semibold text-content-primary capitalize">
              {monthLabel}
            </span>
          </div>
          <button
            onClick={handleNextMonth}
            className="p-2 rounded-lg hover:bg-surface-elevated transition-colors text-content-secondary"
            aria-label="Mois suivant"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Jours travailles"
          value={stats.presents}
          icon={Clock}
          color="success"
        />
        <StatCard
          title="Retards"
          value={stats.retards}
          icon={AlertTriangle}
          color="warning"
        />
        <StatCard
          title="Absences"
          value={stats.absents}
          icon={XCircle}
          color="danger"
        />
        <StatCard
          title="Heures totales"
          value={formatHours(stats.heures)}
          icon={Clock}
          color="primary"
        />
      </div>

      {/* Presence table */}
      <Card padding="none">
        <ResponsiveTable
          data={presences}
          columns={columns}
          loading={isLoading}
          emptyMessage="Aucune donnee de presence pour ce mois"
          density="compact"
        />
      </Card>
    </div>
  );
}
