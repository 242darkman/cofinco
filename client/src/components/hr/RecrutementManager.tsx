import React, { useState } from 'react';
import { Briefcase, Users, Globe } from 'lucide-react';
import { TabGroup } from '../ui';
import { usePositionManager } from '../../hooks/hr/usePositionManager';
import CandidaturesTab from './CandidaturesTab';
import JobOffersTab from './JobOffersTab';
import InternalPortalTab from './InternalPortalTab';

interface Candidat {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  posteVise: string;
  experience?: string;
  datePostulation: string;
  statut: string;
  cvUrl?: string;
  notes?: string;
  dateEntretien?: string;
  approvalStatus?: string;
  currentApprovalLevel?: number;
  finalApprovedAt?: string;
}

interface RecrutementManagerProps {
  candidats: Candidat[];
  agenceId?: string;
  onCreate: (data: {
    nom: string;
    prenom: string;
    email: string;
    telephone?: string;
    posteVise: string;
    experience?: string;
  }) => Promise<boolean>;
  onUpdateStatus: (id: number, statut: string) => Promise<boolean>;
  onUploadCv?: (id: number, file: File) => Promise<any>;
  onGetCvUrl?: (id: number) => Promise<string | null>;
  onUpdateCandidature?: (id: number, data: { statut?: string; notes?: string; dateEntretien?: string }) => Promise<boolean>;
  onRefresh?: () => void;
}

const SUB_TABS = [
  { key: 'offres', label: 'Offres d\'emploi', icon: Briefcase },
  { key: 'candidatures', label: 'Candidatures', icon: Users },
  { key: 'portail', label: 'Portail interne', icon: Globe },
];

export default function RecrutementManager({
  candidats,
  agenceId,
  onCreate,
  onUpdateStatus,
  onUploadCv,
  onGetCvUrl,
  onUpdateCandidature,
  onRefresh
}: RecrutementManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState('candidatures');

  const { departments, positions } = usePositionManager();

  // Map positions/departments to the format JobOffersTab expects
  const positionsForOffers = (positions || []).map((p: any) => ({
    id: p.id,
    nom: p.name,
    code: p.code,
    departmentId: p.departmentId,
  }));

  const departmentsForOffers = (departments || []).map((d: any) => ({
    id: d.id,
    nom: d.name,
  }));

  return (
    <div className="flex flex-col h-full space-y-2">
      <div className="shrink-0">
        <TabGroup
          tabs={SUB_TABS}
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
          variant="pills"
          size="sm"
        />
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeSubTab === 'offres' && (
          <JobOffersTab positions={positionsForOffers} departments={departmentsForOffers} />
        )}

        {activeSubTab === 'candidatures' && (
          <CandidaturesTab
            candidats={candidats}
            agenceId={agenceId}
            onCreate={onCreate}
            onUpdateStatus={onUpdateStatus}
            onUploadCv={onUploadCv}
            onGetCvUrl={onGetCvUrl}
            onUpdateCandidature={onUpdateCandidature}
            onRefresh={onRefresh}
          />
        )}

        {activeSubTab === 'portail' && (
          <InternalPortalTab />
        )}
      </div>
    </div>
  );
}
