import React from 'react';
import { useUserActivity } from '../../hooks/useUserActivity';
import ActivityHeader from './activity/ActivityHeader';
import ActivityStatsCards from './activity/ActivityStatsCards';
import ActivityCharts from './activity/ActivityCharts';
import ActivityList from './activity/ActivityList';

export default function UserActivityMonitor() {
  const {
    activities,
    loading,
    dateDebut,
    setDateDebut,
    dateFin,
    setDateFin,
    stats,
    exportToCSV,
    exportToPDF,
    exportToJSON
  } = useUserActivity();

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
      <ActivityHeader 
        onExportCSV={exportToCSV}
        onExportPDF={exportToPDF}
        onExportJSON={exportToJSON}
      />

      <ActivityStatsCards stats={stats} />

      <ActivityCharts />

      <ActivityList 
        activities={activities}
        loading={loading}
        dateDebut={dateDebut}
        setDateDebut={setDateDebut}
        dateFin={dateFin}
        setDateFin={setDateFin}
      />
    </div>
  );
}
