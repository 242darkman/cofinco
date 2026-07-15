import { useState, useEffect } from 'react';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';
import { addPdfLogoHeader } from '../lib/pdf-logo';
// P4.1: Lazy-load heavy export libraries
import { loadPDFLibraries } from '../lib/lazy-export';

export interface UserActivity {
  userId: string;
  userEmail: string;
  totalActions: number;
  modulesUsed: number;
  lastActivity: string;
  activityDate: string;
}

export interface ActivityStats {
  totalUsers: number;
  activeToday: number;
  totalActions: number;
  avgActionsPerUser: number;
}

export function useUserActivity() {
  const branding = useDocumentBranding();
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
        const uniqueUsers = new Set(data.map((a: { userId: string }) => a.userId)).size;
        const today = new Date().toISOString().split('T')[0];
        const activeToday = new Set(
          data.filter((a: { timestamp: string }) => a.timestamp?.startsWith(today)).map((a: { userId: string }) => a.userId)
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
    csvContent += `RAPPORT D'ACTIVITÉ UTILISATEURS - ${branding.appName}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Date d'export: ${dateExport}${separator}${separator}${separator}${separator}\n`;
    csvContent += `Utilisateurs: ${stats.totalUsers} | Actifs: ${stats.activeToday} | Actions: ${stats.totalActions}${separator}${separator}${separator}${separator}\n`;
    csvContent += `${separator}${separator}${separator}${separator}\n`;
    csvContent += `N°${separator}Utilisateur${separator}Actions${separator}Modules${separator}Dernière Activité${separator}Date\n`;
    
    activities.forEach((act, idx) => {
      csvContent += `${idx + 1}${separator}${act.userEmail || 'N/A'}${separator}${act.totalActions}${separator}${act.modulesUsed}${separator}${act.lastActivity ? new Date(act.lastActivity).toLocaleString('fr-FR') : '-'}${separator}${act.activityDate || '-'}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${branding.appName}_Activite_Utilisateurs_${new Date().toISOString().split('T')[0]}.csv`;
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
      appName: branding.appName,
    });

    const tableData = activities.slice(0, 50).map((act, idx) => [
      idx + 1,
      act.userEmail || 'N/A',
      act.totalActions,
      act.modulesUsed,
      act.activityDate || '-'
    ]);

    autoTable(doc, {
      head: [['N°', 'Utilisateur', 'Actions', 'Modules', 'Date']],
      body: tableData,
      startY,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 240, 240] }
    });

    doc.save(`${branding.appName}_Activite_Utilisateurs_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportToJSON = () => {
    const exportData = {
      titre: `Rapport d'Activité Utilisateurs ${branding.appName}`,
      dateExport: new Date().toISOString(),
      statistiques: stats,
      activites: activities.map(act => ({
        utilisateur: act.userEmail,
        actions: act.totalActions,
        modules: act.modulesUsed,
        derniereActivite: act.lastActivity,
        date: act.activityDate
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${branding.appName}_Activite_Utilisateurs_${new Date().toISOString().split('T')[0]}.json`;
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
