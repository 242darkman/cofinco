import React from 'react';
import { FileText, Shield, CheckCircle } from 'lucide-react';
import { useComplianceReports } from '../../hooks/useComplianceReports';
import ComplianceReportCard from './compliance/ComplianceReportCard';
import ComplianceStatusStats from './compliance/ComplianceStatusStats';
import SelectField from '../ui/SelectField';
import Card from '../ui/Card';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';

export default function ComplianceReports() {
  const branding = useDocumentBranding();
  const {
    loading,
    selectedPeriod,
    setSelectedPeriod,
    generateOHADAReport,
    generateDGIReport,
    generateAuditTrailReport
  } = useComplianceReports();

  const reports = [
    {
      id: 'ohada',
      title: 'Rapport de Conformité OHADA',
      description: 'Conforme aux normes comptables SYSCOHADA révisé',
      icon: Shield,
      color: 'from-status-info to-accent',
      action: generateOHADAReport,
      items: [
        'Plan comptable OHADA complet',
        'Traçabilité des écritures',
        'Conservation des pièces',
        'Séparation des exercices',
        'Journaux auxiliaires',
        'Piste d\'audit fiable'
      ]
    },
    {
      id: 'dgi',
      title: 'Rapport Fiscal DGI Congo',
      description: 'Conforme aux exigences de la Direction Générale des Impôts',
      icon: FileText,
      color: 'from-status-success to-status-success',
      action: generateDGIReport,
      items: [
        'Déclarations TVA (18.9%)',
        'Traçabilité fiscale',
        'Conservation 10 ans',
        'Piste d\'audit fiscale',
        'Justificatifs horodatés',
        'Signature électronique'
      ]
    },
    {
      id: 'audit_trail',
      title: 'Piste d\'Audit Complète',
      description: 'Export complet de tous les événements système',
      icon: CheckCircle,
      color: 'from-status-success to-accent',
      action: generateAuditTrailReport,
      items: [
        'Tous les événements',
        'Horodatage précis',
        'Checksums MD5',
        'Utilisateurs tracés',
        'Modifications détaillées',
        'Format Excel/PDF'
      ]
    }
  ];

  const periodOptions = [
    { value: 'current_month', label: 'Mois en cours' },
    { value: 'current_year', label: 'Année en cours' },
    { value: 'last_quarter', label: 'Dernier trimestre' },
    { value: 'custom', label: 'Période personnalisée' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 md:pb-0">
      
      {/* Header Section */}
      <Card className="bg-surface-base border-edge p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-status-info/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-status-info-bg rounded-xl">
               <Shield className="w-8 h-8 text-status-info" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-content-primary tracking-tight">Rapports de Compliance</h2>
              <p className="text-content-muted mt-1">Conformité OHADA, DGI et Piste d'Audit réglementaire</p>
            </div>
          </div>

          <div className="w-full md:w-64">
             <SelectField
               name="period"
               label="Période"
               value={selectedPeriod}
               onChange={(e) => setSelectedPeriod(e.target.value)}
               options={periodOptions}
             />
          </div>
        </div>
      </Card>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <ComplianceReportCard
            key={report.id}
            {...report}
            loading={loading}
          />
        ))}
      </div>

      {/* Status Section */}
      <ComplianceStatusStats />

      {/* Certification Footer */}
      <Card className="bg-gradient-to-br from-status-info/10 to-status-success/10 border-edge p-8">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
          <div className="p-4 bg-surface-base/50 rounded-full border border-edge-subtle shadow-xl">
            <Shield className="w-12 h-12 text-status-success" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-content-primary mb-3">Certification de Conformité</h3>
            <p className="text-content-secondary mb-6 leading-relaxed max-w-3xl">
              Le système {branding.appName} Platform est entièrement conforme aux normes <strong className="text-content-primary">SYSCOHADA révisé</strong> et aux
              exigences de la <strong className="text-content-primary">Direction Générale des Impôts</strong> de la République du Congo.
              Toutes les transactions sont sécurisées, horodatées et immuables.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
               {[
                 'Traçabilité complète',
                 'Intégrité (Checksums MD5)',
                 'Archivage automatique',
                 'Piste d\'audit immuable'
               ].map((cert, idx) => (
                 <div key={idx} className="flex items-center gap-2 text-sm text-content-muted bg-surface-base/30 px-3 py-2 rounded-lg">
                   <CheckCircle size={14} className="text-status-success" />
                   {cert}
                 </div>
               ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
