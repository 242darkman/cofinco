import React, { useState, useRef } from 'react';
import { Plus, Briefcase, Eye, Calendar, Mail, Phone, Upload, FileText, ExternalLink, Clock, MessageSquare, CheckCircle, XCircle, Users, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { Card, Button, Modal, FormField, SelectField, TextareaField, Badge, ResponsiveTable } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { StatutCandidature, STATUT_CANDIDATURE_LABELS } from '@shared/enum/status-constants';
import { toast } from '../../lib/toast';
import { hrApi } from '../../lib/api-client';
import OnboardingWizard from './OnboardingWizard';

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
  // Score fields
  scoreGlobal?: number | null;
  jobOfferId?: number | null;
  source?: string;
}

interface ApprovalHistoryItem {
  id: string;
  level: number;
  approverRole: string;
  approverNom?: string;
  approverPrenom?: string;
  statut: string;
  commentaire?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface CandidaturesTabProps {
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

export default function CandidaturesTab({
  candidats,
  agenceId,
  onCreate,
  onUpdateStatus,
  onUploadCv,
  onGetCvUrl,
  onUpdateCandidature,
  onRefresh
}: CandidaturesTabProps) {
  const { hasPermission } = usePermissions();
  const canCreateCandidats = hasPermission('rh', 'create');
  const canEditCandidats = hasPermission('rh', 'edit');
  const canApprove = hasPermission('rh', 'manage');

  const [showForm, setShowForm] = useState(false);
  const [selectedCandidat, setSelectedCandidat] = useState<Candidat | null>(null);
  const [cvDownloadUrl, setCvDownloadUrl] = useState<string | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [interviewData, setInterviewData] = useState({ dateEntretien: '', notes: '' });
  const [savingInterview, setSavingInterview] = useState(false);
  const cvFileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    posteVise: '',
    experience: '',
    datePostulation: new Date().toISOString().split('T')[0]
  });

  // Approval workflow state
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryItem[]>([]);
  const [loadingApproval, setLoadingApproval] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCandidat, setOnboardingCandidat] = useState<Candidat | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(candidats.length / ITEMS_PER_PAGE);
  const paginatedCandidats = candidats.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSelectCandidat = async (candidat: Candidat) => {
    setSelectedCandidat(candidat);
    setInterviewData({
      dateEntretien: candidat.dateEntretien || '',
      notes: candidat.notes || ''
    });
    setCvDownloadUrl(null);
    setApprovalHistory([]);
    setApprovalComment('');

    if (candidat.cvUrl && onGetCvUrl) {
      const url = await onGetCvUrl(candidat.id);
      setCvDownloadUrl(url);
    }

    if (candidat.statut === StatutCandidature.ACCEPTED && candidat.approvalStatus && candidat.approvalStatus !== 'NOT_STARTED') {
      fetchApprovalStatus(candidat.id);
    }
  };

  const fetchApprovalStatus = async (candidatureId: number) => {
    try {
      const status = await hrApi.getHiringApprovalStatus(candidatureId);
      if (status?.approvals) {
        setApprovalHistory(status.approvals);
      }
    } catch (error) {
      console.error('Error fetching approval status:', error);
    }
  };

  const handleInitializeApproval = async () => {
    if (!selectedCandidat || !agenceId) return;
    setLoadingApproval(true);
    try {
      const result = await hrApi.initializeHiringApproval(selectedCandidat.id, agenceId);
      if (result.autoApproved) {
        toast.success('Candidature approuvée automatiquement (pas de workflow configuré)');
      } else {
        toast.success(`Workflow d'approbation initialisé (${result.levels} niveau(x))`);
      }
      onRefresh?.();
      fetchApprovalStatus(selectedCandidat.id);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de l\'initialisation du workflow');
    } finally {
      setLoadingApproval(false);
    }
  };

  const handleSubmitApproval = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedCandidat) return;
    setLoadingApproval(true);
    try {
      const result = await hrApi.submitHiringApproval(selectedCandidat.id, decision, approvalComment || undefined);
      if (result.finalDecision) {
        toast.success(decision === 'APPROVED' ? 'Candidature approuvée définitivement' : 'Candidature rejetée');
      } else {
        toast.success(`Approbation niveau ${selectedCandidat.currentApprovalLevel} soumise - En attente niveau suivant`);
      }
      setApprovalComment('');
      onRefresh?.();
      fetchApprovalStatus(selectedCandidat.id);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la soumission de l\'approbation');
    } finally {
      setLoadingApproval(false);
    }
  };

  const handleCvUpload = async (file: File) => {
    if (!selectedCandidat || !onUploadCv) return;
    setUploadingCv(true);
    try {
      const result = await onUploadCv(selectedCandidat.id, file);
      if (result) {
        toast.success('CV uploadé');
        setSelectedCandidat({ ...selectedCandidat, cvUrl: result.cvUrl });
        if (result.cvDownloadUrl) setCvDownloadUrl(result.cvDownloadUrl);
      } else {
        toast.error("Erreur lors de l'upload du CV");
      }
    } finally {
      setUploadingCv(false);
    }
  };

  const handleSaveInterview = async () => {
    if (!selectedCandidat || !onUpdateCandidature) return;
    setSavingInterview(true);
    try {
      const success = await onUpdateCandidature(selectedCandidat.id, {
        dateEntretien: interviewData.dateEntretien || undefined,
        notes: interviewData.notes || undefined,
      });
      if (success) {
        toast.success('Informations entretien sauvegardées');
        setSelectedCandidat({
          ...selectedCandidat,
          dateEntretien: interviewData.dateEntretien,
          notes: interviewData.notes
        });
      }
    } finally {
      setSavingInterview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onCreate(formData);
    if (success) {
      setFormData({
        nom: '',
        prenom: '',
        email: '',
        telephone: '',
        posteVise: '',
        experience: '',
        datePostulation: new Date().toISOString().split('T')[0]
      });
      setShowForm(false);
    }
  };

  const getStatutVariant = (statut: Candidat['statut']) => {
    switch (statut) {
      case StatutCandidature.ACCEPTED: return 'success';
      case StatutCandidature.REJECTED: return 'danger';
      case StatutCandidature.INTERVIEW: return 'warning';
      default: return 'info';
    }
  };

  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'text-content-muted';
    if (score >= 70) return 'text-status-success';
    if (score >= 40) return 'text-status-warning';
    return 'text-status-danger';
  };

  const getScoreBg = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'bg-surface-subtle';
    if (score >= 70) return 'bg-status-success-bg';
    if (score >= 40) return 'bg-status-warning-bg';
    return 'bg-status-danger-bg';
  };

  const stats = {
    total: candidats.length,
    enAttente: candidats.filter(c => c.statut === StatutCandidature.PENDING).length,
    entretien: candidats.filter(c => c.statut === StatutCandidature.INTERVIEW).length,
    acceptes: candidats.filter(c => c.statut === StatutCandidature.ACCEPTED).length
  };

  const columns = [
    {
      label: 'Candidat',
      key: 'nom',
      primary: true,
      format: (val: string, item: Candidat) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-status-info to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {item.nom.charAt(0)}{item.prenom.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-content-primary text-sm truncate">{item.nom} {item.prenom}</div>
            <div className="text-[10px] text-content-muted flex items-center gap-1">
              <Briefcase size={10} />
              {item.posteVise}
            </div>
          </div>
        </div>
      )
    },
    {
      label: 'Contact',
      key: 'email',
      hideOnMobile: true,
      format: (val: string, item: Candidat) => (
        <div className="text-xs text-content-secondary space-y-0.5">
          <div className="flex items-center gap-1"><Mail size={10} />{val}</div>
          {item.telephone && <div className="flex items-center gap-1"><Phone size={10} />{item.telephone}</div>}
        </div>
      )
    },
    {
      label: 'Score',
      key: 'scoreGlobal',
      hideOnMobile: true,
      format: (val: number | null, item: Candidat) => (
        <div className={`px-2 py-0.5 rounded text-xs font-bold inline-block ${getScoreBg(val)} ${getScoreColor(val)}`}>
          {val !== null && val !== undefined ? `${val}/100` : '—'}
        </div>
      )
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (val: string, item: Candidat) => (
        <div className="flex items-center gap-2">
          <Badge variant={getStatutVariant(item.statut)} value={val} size="sm" />
          {canEditCandidats && (
            <select
              value={item.statut}
              onChange={(e) => onUpdateStatus(item.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-surface-elevated border border-edge-strong rounded text-content-primary text-[10px] focus:outline-none focus:ring-1 focus:ring-status-info"
            >
              <option value={StatutCandidature.PENDING}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.PENDING]}</option>
              <option value={StatutCandidature.INTERVIEW}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.INTERVIEW]}</option>
              <option value={StatutCandidature.ACCEPTED}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.ACCEPTED]}</option>
              <option value={StatutCandidature.REJECTED}>{STATUT_CANDIDATURE_LABELS[StatutCandidature.REJECTED]}</option>
            </select>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Stats Cards */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Card className="p-3 bg-surface/50 border-edge-subtle hover:bg-surface transition-colors">
          <div className="text-content-muted text-[10px] uppercase font-bold tracking-wider mb-0.5">Total</div>
          <div className="text-xl font-bold text-content-primary leading-none">{stats.total}</div>
        </Card>
        <Card className="p-3 bg-surface/50 border-edge-subtle hover:bg-surface transition-colors">
          <div className="text-content-muted text-[10px] uppercase font-bold tracking-wider mb-0.5">En Attente</div>
          <div className="text-xl font-bold text-status-info leading-none">{stats.enAttente}</div>
        </Card>
        <Card className="p-3 bg-surface/50 border-edge-subtle hover:bg-surface transition-colors">
          <div className="text-content-muted text-[10px] uppercase font-bold tracking-wider mb-0.5">Entretien</div>
          <div className="text-xl font-bold text-status-warning leading-none">{stats.entretien}</div>
        </Card>
        <Card className="p-3 bg-surface/50 border-edge-subtle hover:bg-surface transition-colors">
          <div className="text-content-muted text-[10px] uppercase font-bold tracking-wider mb-0.5">Acceptés</div>
          <div className="text-xl font-bold text-status-success leading-none">{stats.acceptes}</div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 bg-surface-base border border-edge rounded-lg flex flex-col">
        <div className="shrink-0 p-2 border-b border-edge flex justify-between items-center bg-surface-base/50">
           <h3 className="text-xs font-bold text-content-primary flex items-center gap-2">
              <Briefcase size={14} className="text-status-info" />
              Candidatures
           </h3>
           {canCreateCandidats && (
             <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="h-7 text-xs px-2">
               <Plus size={14} />
               <span className="hidden sm:inline">Nouvelle</span>
             </Button>
           )}
        </div>

        <div className="flex-1 overflow-hidden">
          <ResponsiveTable
            data={paginatedCandidats}
            columns={columns}
            mobileBreakpoint="md"
            emptyMessage="Aucune candidature enregistrée."
            maxHeight="100%"
            pagination={{
              page: currentPage,
              totalPages,
              onPageChange: setCurrentPage
            }}
            density="compact"
            className="border-0 rounded-none h-full"
            headerClassName="bg-surface-base sticky top-0"
            onRowClick={(item) => handleSelectCandidat(item)}
          />
        </div>
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvelle Candidature"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Nom"
              name="nom"
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              required
            />

            <FormField
              label="Prénom"
              name="prenom"
              type="text"
              value={formData.prenom}
              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              required
            />

            <FormField
              label="Email"
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />

            <FormField
              label="Téléphone"
              name="telephone"
              type="tel"
              value={formData.telephone}
              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
              required
            />

            <FormField
              label="Poste Visé"
              name="posteVise"
              type="text"
              value={formData.posteVise}
              onChange={(e) => setFormData({ ...formData, posteVise: e.target.value })}
              required
            />

            <FormField
              label="Date de Postulation"
              name="datePostulation"
              type="date"
              value={formData.datePostulation}
              onChange={(e) => setFormData({ ...formData, datePostulation: e.target.value })}
              required
            />
          </div>

          <TextareaField
            label="Expérience"
            name="experience"
            value={formData.experience}
            onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
            rows={4}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary">
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedCandidat}
        onClose={() => { setSelectedCandidat(null); setCvDownloadUrl(null); }}
        title={selectedCandidat ? `${selectedCandidat.nom} ${selectedCandidat.prenom}` : ''}
        size="lg"
      >
        {selectedCandidat && (
          <div className="space-y-5">
            {/* Info Summary */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-content-muted text-xs">Poste visé</span>
                <div className="text-content-primary font-medium flex items-center gap-1.5">
                  <Briefcase size={13} className="text-status-info" />
                  {selectedCandidat.posteVise}
                </div>
              </div>
              <div>
                <span className="text-content-muted text-xs">Statut</span>
                <div className="mt-0.5">
                  <Badge variant={getStatutVariant(selectedCandidat.statut)} value={STATUT_CANDIDATURE_LABELS[selectedCandidat.statut as keyof typeof STATUT_CANDIDATURE_LABELS] || selectedCandidat.statut} size="sm" />
                </div>
              </div>
              <div>
                <span className="text-content-muted text-xs">Email</span>
                <div className="text-content-primary flex items-center gap-1.5">
                  <Mail size={13} className="text-content-muted" />
                  {selectedCandidat.email}
                </div>
              </div>
              <div>
                <span className="text-content-muted text-xs">Téléphone</span>
                <div className="text-content-primary flex items-center gap-1.5">
                  <Phone size={13} className="text-content-muted" />
                  {selectedCandidat.telephone || '-'}
                </div>
              </div>
              {selectedCandidat.scoreGlobal !== null && selectedCandidat.scoreGlobal !== undefined && (
                <div>
                  <span className="text-content-muted text-xs">Score</span>
                  <div className={`font-bold ${getScoreColor(selectedCandidat.scoreGlobal)}`}>
                    {selectedCandidat.scoreGlobal}/100
                  </div>
                </div>
              )}
              {selectedCandidat.source && selectedCandidat.source !== 'MANUAL' && (
                <div>
                  <span className="text-content-muted text-xs">Source</span>
                  <div className="text-content-primary text-sm">Portail interne</div>
                </div>
              )}
              {selectedCandidat.experience && (
                <div className="col-span-2">
                  <span className="text-content-muted text-xs">Expérience</span>
                  <div className="text-content-secondary text-sm mt-0.5">{selectedCandidat.experience}</div>
                </div>
              )}
            </div>

            {/* CV Section */}
            <div className="border-t border-edge pt-4">
              <h4 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={13} />
                Curriculum Vitae
              </h4>
              {selectedCandidat.cvUrl ? (
                <div className="flex items-center justify-between bg-surface/60 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-content-secondary">
                    <FileText size={16} className="text-status-success" />
                    <span>CV uploadé</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {cvDownloadUrl && (
                      <a
                        href={cvDownloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-accent-secondary/20 text-accent rounded-md text-xs font-medium hover:bg-accent-secondary-hover/30 transition flex items-center gap-1.5"
                      >
                        <ExternalLink size={12} />
                        Télécharger
                      </a>
                    )}
                    {canEditCandidats && onUploadCv && (
                      <button
                        onClick={() => cvFileInputRef.current?.click()}
                        disabled={uploadingCv}
                        className="px-3 py-1.5 bg-surface-elevated text-content-secondary rounded-md text-xs font-medium hover:bg-surface-subtle transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Upload size={12} />
                        {uploadingCv ? 'Upload...' : 'Remplacer'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between bg-surface/40 border border-dashed border-edge rounded-lg p-3">
                  <span className="text-sm text-content-muted">Aucun CV uploadé</span>
                  {canEditCandidats && onUploadCv && (
                    <button
                      onClick={() => cvFileInputRef.current?.click()}
                      disabled={uploadingCv}
                      className="px-3 py-1.5 bg-accent-secondary text-content-primary rounded-md text-xs font-medium hover:bg-accent-secondary-hover transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Upload size={12} />
                      {uploadingCv ? 'Upload...' : 'Uploader CV'}
                    </button>
                  )}
                </div>
              )}
              <input
                ref={cvFileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCvUpload(file);
                  e.target.value = '';
                }}
              />
            </div>

            {/* Interview Section */}
            {(selectedCandidat.statut === StatutCandidature.INTERVIEW || selectedCandidat.dateEntretien) && (
              <div className="border-t border-edge pt-4">
                <h4 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Clock size={13} />
                  Entretien
                </h4>
                <div className="space-y-3">
                  <FormField
                    label="Date de l'entretien"
                    name="dateEntretien"
                    type="date"
                    value={interviewData.dateEntretien}
                    onChange={(e) => setInterviewData(prev => ({ ...prev, dateEntretien: e.target.value }))}
                  />
                  <div>
                    <label className="block text-xs font-medium text-content-muted mb-1">
                      Notes d'entretien
                    </label>
                    <textarea
                      value={interviewData.notes}
                      onChange={(e) => setInterviewData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Observations, impressions, questions posées..."
                      className="w-full p-3 bg-surface border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-accent focus:outline-none resize-none text-sm"
                      rows={3}
                    />
                  </div>
                  {canEditCandidats && onUpdateCandidature && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveInterview}
                      disabled={savingInterview}
                    >
                      <MessageSquare size={14} />
                      {savingInterview ? 'Sauvegarde...' : 'Sauvegarder'}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Hiring Approval Workflow Section */}
            {selectedCandidat.statut === StatutCandidature.ACCEPTED && (
              <div className="border-t border-edge pt-4">
                <h4 className="text-xs font-bold text-content-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-status-info" />
                  Workflow d'Approbation
                </h4>

                <div className="mb-4">
                  {(!selectedCandidat.approvalStatus || selectedCandidat.approvalStatus === 'NOT_STARTED') && (
                    <Badge variant="neutral" value="Non démarré" size="sm" />
                  )}
                  {selectedCandidat.approvalStatus === 'IN_PROGRESS' && (
                    <Badge variant="warning" value={`En cours - Niveau ${selectedCandidat.currentApprovalLevel || 1}`} size="sm" />
                  )}
                  {selectedCandidat.approvalStatus === 'APPROVED' && (
                    <Badge variant="success" value="Approuvé" size="sm" />
                  )}
                  {selectedCandidat.approvalStatus === 'REJECTED' && (
                    <Badge variant="danger" value="Rejeté" size="sm" />
                  )}
                </div>

                {(!selectedCandidat.approvalStatus || selectedCandidat.approvalStatus === 'NOT_STARTED') && agenceId && canApprove && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleInitializeApproval}
                    disabled={loadingApproval}
                    className="mb-4"
                  >
                    {loadingApproval ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                    Démarrer le workflow d'approbation
                  </Button>
                )}

                {approvalHistory.length > 0 && (
                  <div className="space-y-3 mb-4">
                    <p className="text-xs text-content-muted font-medium">Historique des approbations</p>
                    <div className="relative pl-4 border-l-2 border-edge space-y-3">
                      {approvalHistory.map((approval) => (
                        <div key={approval.id} className="relative">
                          <div className={`absolute -left-[21px] w-4 h-4 rounded-full border-2 ${
                            approval.statut === 'APPROVED' ? 'bg-status-success border-status-success' :
                            approval.statut === 'REJECTED' ? 'bg-status-danger border-status-danger' :
                            'bg-surface-elevated border-edge-strong'
                          }`}>
                            {approval.statut === 'APPROVED' && <CheckCircle size={10} className="text-content-primary absolute top-0.5 left-0.5" />}
                            {approval.statut === 'REJECTED' && <XCircle size={10} className="text-content-primary absolute top-0.5 left-0.5" />}
                          </div>
                          <div className="bg-surface/50 rounded-lg p-3 ml-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-content-primary">
                                Niveau {approval.level} - {approval.approverRole}
                              </span>
                              <Badge
                                variant={approval.statut === 'APPROVED' ? 'success' : approval.statut === 'REJECTED' ? 'danger' : 'neutral'}
                                value={approval.statut === 'APPROVED' ? 'Approuvé' : approval.statut === 'REJECTED' ? 'Rejeté' : 'En attente'}
                                size="xs"
                              />
                            </div>
                            {approval.approverNom && (
                              <p className="text-xs text-content-muted">
                                Par: {approval.approverPrenom} {approval.approverNom}
                              </p>
                            )}
                            {approval.commentaire && (
                              <p className="text-xs text-content-secondary mt-1 italic">"{approval.commentaire}"</p>
                            )}
                            {approval.decidedAt && (
                              <p className="text-[10px] text-content-muted mt-1">
                                {new Date(approval.decidedAt).toLocaleString('fr-FR')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCandidat.approvalStatus === 'IN_PROGRESS' && canApprove && (
                  <div className="space-y-3 bg-surface/30 rounded-lg p-3">
                    <p className="text-xs text-content-muted font-medium">Soumettre votre décision</p>
                    <textarea
                      value={approvalComment}
                      onChange={(e) => setApprovalComment(e.target.value)}
                      placeholder="Commentaire (optionnel)..."
                      className="w-full p-2 bg-surface-base/50 border border-edge rounded-lg text-content-primary placeholder-content-muted focus:border-status-info focus:outline-none resize-none text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => handleSubmitApproval('APPROVED')}
                        disabled={loadingApproval}
                        className="flex-1"
                      >
                        {loadingApproval ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        Approuver
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleSubmitApproval('REJECTED')}
                        disabled={loadingApproval}
                        className="flex-1"
                      >
                        {loadingApproval ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        Rejeter
                      </Button>
                    </div>
                  </div>
                )}

                {selectedCandidat.approvalStatus === 'APPROVED' && selectedCandidat.finalApprovedAt && (
                  <div className="bg-status-success-bg border border-status-success/30 rounded-lg p-3">
                    <p className="text-xs text-status-success font-medium flex items-center gap-1.5">
                      <CheckCircle size={14} />
                      Approbation finale le {new Date(selectedCandidat.finalApprovedAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                )}

                {selectedCandidat.approvalStatus === 'APPROVED' && (
                  <Button
                    variant="success"
                    className="w-full mt-4"
                    onClick={() => {
                      setOnboardingCandidat(selectedCandidat);
                      setShowOnboarding(true);
                      setSelectedCandidat(null);
                    }}
                  >
                    <UserPlus size={16} className="mr-2" />
                    Démarrer l'onboarding
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Onboarding Wizard Modal */}
      <Modal
        isOpen={showOnboarding && !!onboardingCandidat}
        onClose={() => { setShowOnboarding(false); setOnboardingCandidat(null); }}
        title="Processus d'Onboarding"
        size="lg"
      >
        {onboardingCandidat && (
          <OnboardingWizard
            candidatureId={onboardingCandidat.id}
            candidat={{
              nom: onboardingCandidat.nom,
              prenom: onboardingCandidat.prenom,
              email: onboardingCandidat.email,
              telephone: onboardingCandidat.telephone,
              poste: onboardingCandidat.posteVise,
            }}
            agenceId={agenceId}
            onComplete={() => {
              setShowOnboarding(false);
              setOnboardingCandidat(null);
              onRefresh?.();
              toast.success('Employé créé');
            }}
            onClose={() => { setShowOnboarding(false); setOnboardingCandidat(null); }}
          />
        )}
      </Modal>
    </div>
  );
}
