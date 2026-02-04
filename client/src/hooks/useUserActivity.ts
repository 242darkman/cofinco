import { useState, useEffect } from 'react';
import { addPdfLogoHeader } from '../lib/pdf-logo';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '../lib/lazy-export';

export interface UserActivity {
  user_id: string;
  user_email: string;
  total_actions: number;
  modules_used: number;
  last_activity: string;
  activity_date: string;
}

export interface ActivityStats {
  totalUsers: number;
  activeToday: number;
  totalActions: number;
  avgActionsPerUser: number;
}

export function useUserActivity() {
  const [activities, setActivities] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [stats, setStats] = useState<ActivityStats>({
    totalUsers: 0,
    activeToday: 0,
    totalActions: 0,
    avgActionsPerUser: 0
  });

  useEffect(() => {
    fetchActivities();
    fetchStats();
  }, [dateDebut, dateFin]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateDebut) {
        params.append('dateDebut', dateDebut);
      }
      if (dateFin) {
        params.append('dateFin', dateFin);
      }
      params.append('limit', '50');

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error('Erreur chargement activités');
      const data = await res.json();
      setActivities(data || []);
    } catch (error) {
      console.error('Erreur chargement activités:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      if (!res.ok) throw new Error('Erreur chargement stats');
      const data = await res.json();

      if (data) {
        const uniqueUsers = new Set(data.map((a: { user_id: string }) => a.user_id)).size;
        const today = new Date().toISOString().split('T')[0];
        const activeToday = new Set(
          data.filter((a: { timestamp: string }) => a.timestamp?.startsWith(today)).map((a: { user_id: string }) => a.user_id)
        ).size;

        setStats({
          totalUsers: uniqueUsers,
          activeToday: activeToday,
          totalActions: data.length,
          avgActionsPerUser: uniqueUsers > 0 ? Math.round(data.length / uniqueUsers) : 0
        });
      }
    } catch (error) {
      console.error('Erreur stats:', error);
    }
  };

  const exportToCSV = () => {
    const dateExport = new Date().toLocaleDateString('fr-FR');
    const BOM = '\uFEFF';
    const separator = ';';
    
    let csvContent = BOM;
    csvContent += `RAPPORT D'ACTIVITÉ UTILISATEURS - COFIN${separator}${separator}${separator}${separator}\n`;
    csvContent += `Date d'export: ${dateExport}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Utilisateurs: ${stats.totalUsers} | Actifs: ${stats.activeToday} | Actions: ${stats.totalActions}${separator}${separator}${separator}${separator}\n`;
    csvContent += `${separator}${separator}${separator}${separator}\n`;
    csvContent += `N°${separator}Utilisateur${separator}Actions${separator}Modules${separator}Dernière Activité${separator}Date\n`;
    
    activities.forEach((act, idx) => {
      csvContent += `${idx + 1}${separator}${act.user_email || 'N/A'}${separator}${act.total_actions}${separator}${act.modules_used}${separator}${act.last_activity ? new Date(act.last_activity).toLocaleString('fr-FR') : '-'}${separator}${act.activity_date || '-'}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Activite_Utilisateurs_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToPDF = async () => {
    // P4.1: Lazy-load PDF library
    const { jsPDF, autoTable } = await loadPDFLibraries();
    const doc = new jsPDF();
    const dateExport = new Date().toLocaleDateString('fr-FR');

    const startY = addPdfLogoHeader(doc, {
      title: "RAPPORT D'ACTIVITÉ UTILISATEURS",
      subtitle: `Utilisateurs: ${stats.totalUsers} | Actifs aujourd'hui: ${stats.activeToday} | Total actions: ${stats.totalActions}`,
      dateRight: `Export: ${dateExport}`,
    });

    const tableData = activities.slice(0, 50).map((act, idx) => [
      idx + 1,
      act.user_email || 'N/A',
      act.total_actions,
      act.modules_used,
      act.activity_date || '-'
    ]);

    autoTable(doc, {
      head: [['N°', 'Utilisateur', 'Actions', 'Modules', 'Date']],
      body: tableData,
      startY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });

    doc.save(`COFIN_Activite_Utilisateurs_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: "Rapport d'Activité Utilisateurs COFIN",
      dateExport: new Date().toISOString(),
      statistiques: stats,
      activites: activities.map(act => ({
        utilisateur: act.user_email,
        actions: act.total_actions,
        modules: act.modules_used,
        derniereActivite: act.last_activity,
        date: act.activity_date
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `COFIN_Activite_Utilisateurs_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    activities,
    loading,
    dateDebut,
    setDateDebut,
    dateFin,
    setDateFin,
    stats,
    exportToCSV,
    exportToPDF,
    exportToJSON,
    fetchActivities
  };
}
