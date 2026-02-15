import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, User, MapPin, Briefcase, Mail, Phone, CreditCard,
  MoreVertical, CheckCircle, Ban, Calendar, MessageCircle,
  Loader2, FileText, KeyRound, LogOut, Archive, History, Shield,
  ChevronLeft, Upload, Download, Trash2, Clock, AlertTriangle,
  Eye, File, Building2
} from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes';
import TransferAgenceModal from './TransferAgenceModal';
import { resolveStorageUrl } from '@/lib/format';
import { StatutUser } from '@shared/enum/status-constants';
import { toast } from 'sonner';
import DocumentPreviewModal from '../ui/DocumentPreviewModal';

type DrawerView = 'profile' | 'documents' | 'activity';

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger' | 'warning' | 'info';
  onConfirm: () => Promise<void>;
}

interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  statut: string;
  riskLevel: string;
  createdAt: string;
}

interface EmployeeDoc {
  id: string;
  employeId: string;
  nom: string;
  typeDocument: string;
  categorie: string | null;
  description: string | null;
  storageKey: string;
  bucket: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  dateEmission: string | null;
  dateExpiration: string | null;
  statut: string;
  verifiePar: string | null;
  verifieAt: string | null;
  motifRejet: string | null;
  ajoutePar: string | null;
  createdAt: string | null;
  url?: string | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Contrat',
  ID_CARD: 'Pièce d\'identité',
  DIPLOMA: 'Diplôme',
  CERTIFICATE: 'Certificat',
  MEDICAL: 'Médical',
  OTHER: 'Autre',
};

const DOC_STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'En attente', cls: 'bg-status-warning-bg text-status-warning border-status-warning/30' },
  VERIFIED: { label: 'Vérifié', cls: 'bg-status-success-bg text-status-success border-status-success/30' },
  REJECTED: { label: 'Rejeté', cls: 'bg-status-danger-bg text-status-danger border-status-danger/30' },
  EXPIRED: { label: 'Expiré', cls: 'bg-surface-subtle/30 text-content-muted border-edge-strong/30' },
};

interface EmployeeProfileDrawerProps {
  employee: Employe;
  onClose: () => void;
  onEdit?: (employee: Employe) => void;
  onRefresh?: () => void;
}

export default function EmployeeProfileDrawer({ employee, onClose, onEdit, onRefresh }: EmployeeProfileDrawerProps) {
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [activeView, setActiveView] = useState<DrawerView>('profile');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Activity history state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Documents state
  const [documents, setDocuments] = useState<EmployeeDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadMeta, setUploadMeta] = useState({ nom: '', typeDocument: 'OTHER', dateExpiration: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDoc | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Helper to get initials
  const getInitials = (nom: string, prenom: string) => {
    return `${(nom || '').charAt(0)}${(prenom || '').charAt(0)}`.toUpperCase();
  };

  // Helper to translate status
  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      [StatutUser.ACTIVE]: 'Actif',
      [StatutUser.INACTIVE]: 'Inactif',
      [StatutUser.SUSPENDED]: 'Suspendu',
      'Congé': 'Congé'
    };
    return statusMap[status] || status;
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateString;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1048576).toFixed(1)} Mo`;
  };

  // Handle chat opening — create/get DM first, then navigate with conversationId
  const handleOpenChat = async () => {
    if (!employee.userId) return;
    setIsLoadingChat(true);
    try {
      const res = await fetch('/api/v2/conversations/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: employee.userId }),
      });
      if (!res.ok) throw new Error('Erreur messagerie');
      const data = await res.json();

      onClose();
      window.dispatchEvent(new CustomEvent('navigate-module', {
        detail: {
          module: 'messages',
          data: {
            conversationId: data.conversation.id,
            chatUserId: employee.userId,
            chatUserName: `${employee.nom} ${employee.prenom}`,
            chatUserPhoto: employee.photoProfile || null,
          }
        }
      }));
    } catch {
      toast.error("Impossible d'ouvrir la messagerie");
    } finally {
      setIsLoadingChat(false);
    }
  };

  // ===== FETCH FUNCTIONS =====

  const fetchAuditLogs = useCallback(async () => {
    if (!employee.userId) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/audit-logs?userId=${employee.userId}&limit=50`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLogsLoading(false);
    }
  }, [employee.userId]);

  const fetchDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await fetch(`/api/hr/employees/${employee.id}/documents`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement documents:', error);
    } finally {
      setDocsLoading(false);
    }
  }, [employee.id]);

  // Load data when switching views
  useEffect(() => {
    if (activeView === 'activity') fetchAuditLogs();
    if (activeView === 'documents') fetchDocuments();
  }, [activeView, fetchAuditLogs, fetchDocuments]);

  // ===== ACTION HANDLERS =====

  const handleResetPassword = () => {
    setMenuOpen(false);
    setConfirmAction({
      title: 'Réinitialiser le mot de passe',
      message: `Le mot de passe de ${employee.nom} ${employee.prenom} sera réinitialisé. Un mot de passe temporaire sera généré.`,
      confirmLabel: 'Réinitialiser',
      variant: 'info',
      onConfirm: async () => {
        const array = new Uint8Array(6);
        crypto.getRandomValues(array);
        const tempPassword = `Temp${Array.from(array, b => b.toString(36)).join('').slice(0, 6)}!1A`;
        const res = await fetch(`/api/users/${employee.userId}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ password: tempPassword }),
        });
        if (!res.ok) throw new Error('Erreur lors de la réinitialisation');
        toast.success('Mot de passe réinitialisé', {
          description: `Nouveau mot de passe temporaire : ${tempPassword}`,
          duration: 15000,
        });
      },
    });
  };

  const handleForceLogout = () => {
    setMenuOpen(false);
    setConfirmAction({
      title: 'Forcer la déconnexion',
      message: `${employee.nom} ${employee.prenom} sera immédiatement déconnecté(e) de toutes ses sessions actives.`,
      confirmLabel: 'Déconnecter',
      variant: 'warning',
      onConfirm: async () => {
        const res = await fetch(`/api/sessions/${employee.userId}/terminate`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'Erreur');
        }
        const data = await res.json();
        toast.success('Déconnexion forcée', {
          description: `${data.deletedCount || 0} session(s) terminée(s)`,
        });
      },
    });
  };

  const handleSuspendAccount = () => {
    setMenuOpen(false);
    const isSuspended = employee.statut === StatutUser.SUSPENDED;
    setConfirmAction({
      title: isSuspended ? 'Réactiver le compte' : 'Suspendre le compte',
      message: isSuspended
        ? `Le compte de ${employee.nom} ${employee.prenom} sera réactivé et pourra se reconnecter.`
        : `${employee.nom} ${employee.prenom} ne pourra plus se connecter tant que le compte est suspendu.`,
      confirmLabel: isSuspended ? 'Réactiver' : 'Suspendre',
      variant: isSuspended ? 'info' : 'warning',
      onConfirm: async () => {
        const newStatus = isSuspended ? StatutUser.ACTIVE : StatutUser.SUSPENDED;
        const res = await fetch(`/api/users/${employee.userId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ statut: newStatus }),
        });
        if (!res.ok) throw new Error('Erreur lors de la mise à jour du statut');
        toast.success(isSuspended ? 'Compte réactivé' : 'Compte suspendu', {
          description: `${employee.nom} ${employee.prenom} — Statut: ${isSuspended ? 'Actif' : 'Suspendu'}`,
        });
        onRefresh?.();
      },
    });
  };

  const handleArchive = () => {
    setMenuOpen(false);
    setConfirmAction({
      title: 'Archiver (Départ)',
      message: `Cette action va archiver le dossier de ${employee.nom} ${employee.prenom}. Le compte utilisateur sera désactivé et l'employé ne pourra plus se connecter. Cette action est irréversible.`,
      confirmLabel: 'Archiver définitivement',
      variant: 'danger',
      onConfirm: async () => {
        const res = await fetch(`/api/employes/${employee.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Erreur lors de l\'archivage');
        toast.success('Employé archivé', {
          description: `${employee.nom} ${employee.prenom} a été archivé(e) avec succès.`,
        });
        onRefresh?.();
        onClose();
      },
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      await confirmAction.onConfirm();
    } catch (error: any) {
      toast.error('Erreur', { description: error.message || 'Une erreur est survenue' });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  // ===== DOCUMENT HANDLERS =====

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadMeta.nom) {
      toast.error('Nom du document requis');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('nom', uploadMeta.nom);
      formData.append('typeDocument', uploadMeta.typeDocument);
      if (uploadMeta.dateExpiration) formData.append('dateExpiration', uploadMeta.dateExpiration);

      const res = await fetch(`/api/hr/employees/${employee.id}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('Erreur upload');
      toast.success('Document ajouté', { description: uploadMeta.nom });
      setUploadMeta({ nom: '', typeDocument: 'OTHER', dateExpiration: '' });
      setShowUploadForm(false);
      fetchDocuments();
    } catch (error: any) {
      toast.error('Erreur upload', { description: error.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDoc = (doc: EmployeeDoc) => {
    setConfirmAction({
      title: 'Supprimer le document',
      message: `Le document "${doc.nom}" sera supprimé définitivement.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: async () => {
        const res = await fetch(`/api/hr/documents/${doc.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Erreur suppression');
        toast.success('Document supprimé');
        fetchDocuments();
      },
    });
  };

  const handleVerifyDoc = async (docId: string, statut: 'VERIFIED' | 'REJECTED', motifRejet?: string) => {
    try {
      const res = await fetch(`/api/hr/documents/${docId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ statut, motifRejet }),
      });
      if (!res.ok) throw new Error('Erreur vérification');
      toast.success(statut === 'VERIFIED' ? 'Document vérifié' : 'Document rejeté');
      fetchDocuments();
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  // ===== AUDIT LOG HELPERS =====

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'LOGIN': 'Connexion',
      'LOGOUT': 'Déconnexion',
      'LOGIN_FAILED': 'Tentative de connexion échouée',
      'CREATE_CLIENT': 'Création client',
      'UPDATE_CLIENT': 'Modification client',
      'DELETE_CLIENT': 'Suppression client',
      'CREATE_DEPOSIT': 'Dépôt effectué',
      'CREATE_WITHDRAWAL': 'Retrait effectué',
      'CREATE_TRANSFER': 'Transfert effectué',
      'APPROVE_CREDIT': 'Approbation crédit',
      'CREATE_CREDIT': 'Création crédit',
      'UPDATE_USER': 'Modification utilisateur',
      'RESET_PASSWORD': 'Réinitialisation mot de passe',
      'FORCE_LOGOUT': 'Déconnexion forcée',
      'CREATE_EMPLOYE': 'Création employé',
      'UPDATE_EMPLOYE': 'Modification employé',
      'DELETE_EMPLOYE': 'Suppression employé',
      'PURGE_AUDIT_LOGS': 'Purge des logs',
    };
    return labels[action] || action.replace(/_/g, ' ');
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-status-danger bg-status-danger-bg border-status-danger/20';
      case 'high': return 'text-status-warning bg-status-warning-bg border-status-warning/20';
      case 'medium': return 'text-status-warning bg-status-warning-bg border-status-warning/20';
      default: return 'text-content-muted bg-surface-subtle/30 border-edge-strong/20';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface-base h-full shadow-2xl border-l border-edge overflow-y-auto animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* BOUTON FERMER (Absolute) */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 bg-black/20 hover:bg-black/40 text-content-primary rounded-full transition-colors backdrop-blur-md"
        >
          <X size={20} />
        </button>

        {/* HEADER GRAPHIQUE */}
        <div className="relative z-10 h-40 bg-gradient-to-br from-accent via-surface-base to-surface-base">

           <div className="absolute -bottom-10 left-8 flex items-end gap-4">
              <div className="w-24 h-24 rounded-2xl bg-surface-base border-4 border-edge overflow-hidden shadow-2xl">
                 {employee.photoProfile ? (
                   <img
                     src={resolveStorageUrl(employee.photoProfile)}
                     alt={`${employee.nom} ${employee.prenom}`}
                     className="w-full h-full object-cover"
                   />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent to-accent text-2xl font-bold text-white">
                     {getInitials(employee.nom, employee.prenom)}
                   </div>
                 )}
              </div>
              <div className="mb-2">
                 <h2 className="text-xl font-bold text-content-primary">{employee.nom} {employee.prenom}</h2>
                 <p className="text-accent font-medium text-sm">{employee.poste || 'Non défini'}</p>
              </div>
           </div>
        </div>

        {/* CONFIRMATION MODAL OVERLAY */}
        {confirmAction && (
          <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="bg-surface-base border border-edge rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 fade-in duration-200">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                confirmAction.variant === 'danger' ? 'bg-status-danger-bg' :
                confirmAction.variant === 'warning' ? 'bg-status-warning-bg' : 'bg-accent/10'
              }`}>
                <AlertTriangle size={20} className={
                  confirmAction.variant === 'danger' ? 'text-status-danger' :
                  confirmAction.variant === 'warning' ? 'text-status-warning' : 'text-accent'
                } />
              </div>
              <h3 className="text-content-primary font-bold text-lg mb-2">{confirmAction.title}</h3>
              <p className="text-content-muted text-sm leading-relaxed mb-6">{confirmAction.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-surface hover:bg-surface-elevated text-content-secondary rounded-xl font-medium text-sm transition-colors border border-edge"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={actionLoading}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                    confirmAction.variant === 'danger'
                      ? 'bg-status-danger hover:bg-status-danger text-white'
                      : confirmAction.variant === 'warning'
                      ? 'bg-status-warning hover:bg-status-warning text-white'
                      : 'bg-accent hover:bg-accent-primary-hover text-white'
                  }`}
                >
                  {actionLoading && <Loader2 size={16} className="animate-spin" />}
                  {confirmAction.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONTENU DU DOSSIER */}
        <div className="relative z-0 pt-20 px-8 pb-8 space-y-8">

          {/* Sub-view navigation */}
          {activeView !== 'profile' && (
            <button
              onClick={() => setActiveView('profile')}
              className="flex items-center gap-2 text-sm text-content-muted hover:text-content-primary transition-colors -mt-2 mb-2"
            >
              <ChevronLeft size={16} />
              Retour au profil
            </button>
          )}

          {/* ========== PROFILE VIEW ========== */}
          {activeView === 'profile' && (
            <>
              {/* Actions Rapides Contextuelles */}
              <div className="flex gap-3 relative">
                <button
                  onClick={() => onEdit && onEdit(employee)}
                  className="flex-1 py-2.5 bg-accent hover:bg-accent-primary-hover text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-accent/20"
                >
                  Modifier Profil
                </button>

                <button
                  onClick={handleOpenChat}
                  disabled={isLoadingChat}
                  className="px-4 py-2.5 bg-surface hover:bg-surface-elevated text-content-primary rounded-xl font-bold text-sm border border-edge flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-wait"
                >
                  {isLoadingChat ? (
                    <Loader2 size={18} className="animate-spin text-accent" />
                  ) : (
                    <MessageCircle size={18} />
                  )}
                  <span className="hidden sm:inline">Message</span>
                </button>

                {/* Options Menu */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!isMenuOpen)}
                    className={`px-3 py-2.5 rounded-xl border transition-colors ${
                      isMenuOpen
                        ? 'bg-surface-elevated border-edge-strong text-content-primary'
                        : 'bg-surface border-edge text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <MoreVertical size={20} />
                  </button>

                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-12 z-20 w-64 bg-surface-base border border-edge rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 origin-top-right">

                        <div className="px-3 py-2 text-[10px] uppercase font-bold text-content-muted tracking-wider">Administration</div>
                        <MenuItem
                          icon={FileText}
                          label="Gérer les documents"
                          onClick={() => { setActiveView('documents'); setMenuOpen(false); }}
                        />
                        <MenuItem
                          icon={History}
                          label="Historique d'activité"
                          onClick={() => { setActiveView('activity'); setMenuOpen(false); }}
                        />
                        <MenuItem
                          icon={Building2}
                          label="Changer d'agence"
                          onClick={() => { setShowTransferModal(true); setMenuOpen(false); }}
                        />

                        <div className="my-1 border-t border-edge" />

                        <div className="px-3 py-2 text-[10px] uppercase font-bold text-content-muted tracking-wider">Sécurité</div>
                        <MenuItem
                          icon={KeyRound}
                          label="Réinitialiser le mot de passe"
                          onClick={handleResetPassword}
                        />
                        <MenuItem
                          icon={LogOut}
                          label="Forcer la déconnexion"
                          onClick={handleForceLogout}
                        />

                        <div className="my-1 border-t border-edge" />

                        <MenuItem
                          icon={Ban}
                          label={employee.statut === StatutUser.SUSPENDED ? "Réactiver le compte" : "Suspendre le compte"}
                          color={employee.statut === StatutUser.SUSPENDED ? "text-status-success hover:bg-status-success-bg" : "text-status-warning hover:bg-status-warning-bg"}
                          onClick={handleSuspendAccount}
                        />
                        <MenuItem
                          icon={Archive}
                          label="Archiver (Départ)"
                          color="text-status-danger hover:bg-status-danger-bg"
                          onClick={handleArchive}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Block 1: Info Pro */}
              <Section title="Informations Professionnelles" icon={Briefcase}>
                <GridItem label="Matricule" value={employee.matricule} mono />
                <GridItem label="Département" value={employee.departement || 'N/A'} />
                <GridItem label="Date d'embauche" value={formatDate(employee.dateEmbauche)} icon={Calendar} />
                <GridItem
                  label="Statut"
                  value={<StatusBadge status={getStatusLabel(employee.statut)} />}
                />
                <GridItem label="Type Contrat" value={employee.typeContrat} badge />
                <GridItem label="Manager" value={employee.managerNom || 'Aucun'} />
              </Section>

              {/* Block 2: Info Perso */}
              <Section title="Coordonnées & Personnel" icon={User}>
                <GridItem label="Email" value={employee.email || 'Non renseigné'} icon={Mail} />
                <GridItem label="Téléphone" value={employee.phone || 'Non renseigné'} icon={Phone} />
                <GridItem label="Date de naissance" value={formatDate(employee.dateNaissance)} icon={Calendar} />
                <GridItem label="Sexe" value={employee.sexe === 'M' ? 'Masculin' : 'Féminin'} />
                <GridItem
                  label="Adresse"
                  value={employee.adresse ? `${employee.adresse}${employee.ville ? ', ' + employee.ville : ''}` : 'Non renseignée'}
                  icon={MapPin}
                  fullWidth
                />
              </Section>

              {/* Block 3: Financier */}
              <Section title="Données Financières" icon={CreditCard}>
                <div className="col-span-2 p-4 bg-surface-base rounded-xl border border-edge flex justify-between items-center">
                   <div>
                      <div className="text-xs text-content-muted uppercase font-bold mb-1">Salaire de Base</div>
                      <div className="text-2xl font-bold text-status-success">
                        {parseFloat(employee.salaireBase || '0').toLocaleString()} FCFA
                      </div>
                      {employee.modeCalculPaie && (
                        <div className="text-xs text-content-muted mt-1">
                          Mode: {employee.modeCalculPaie === 'MONTHLY' ? 'Mensuel' : employee.modeCalculPaie === 'DAILY' ? 'Journalier' : 'Horaire'}
                        </div>
                      )}
                   </div>
                   <div className="text-right">
                      <div className="text-xs text-content-muted mb-1">N° CNSS</div>
                      <div className="text-sm text-content-primary font-mono">
                        {employee.numeroCnss || 'Non renseigné'}
                      </div>
                   </div>
                </div>
              </Section>

              {/* Block 4: Agence */}
              {(employee.agenceId || employee.agence) && (
                <Section title="Affectation" icon={MapPin}>
                  <div className="col-span-2">
                    <div className="text-xs text-content-muted font-medium mb-2">Agence</div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-content-secondary font-medium">
                        {employee.agence?.nom || 'Agence principale'}
                      </div>
                      {employee.agence?.typeAgence && (
                        <AgencyTypeBadge type={employee.agence.typeAgence} />
                      )}
                    </div>
                    {employee.agence?.codeAgence && (
                      <div className="text-xs text-content-muted font-mono mt-1">
                        Code: {employee.agence.codeAgence}
                      </div>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}

          {/* ========== DOCUMENTS VIEW ========== */}
          {activeView === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-content-muted">
                  <FileText size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wider">Documents</h3>
                  <span className="text-xs bg-surface text-content-muted px-2 py-0.5 rounded-full">
                    {documents.length}
                  </span>
                </div>
                <button
                  onClick={() => setShowUploadForm(!showUploadForm)}
                  disabled={uploading}
                  className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-primary-hover text-white text-xs font-bold rounded-lg transition-colors"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  Ajouter
                </button>
              </div>

              {/* Upload form */}
              {showUploadForm && (
                <div className="p-4 bg-surface-base border border-accent/30 rounded-xl space-y-3 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-content-muted uppercase">Nom du document *</label>
                      <input
                        type="text"
                        value={uploadMeta.nom}
                        onChange={(e) => setUploadMeta(p => ({ ...p, nom: e.target.value }))}
                        placeholder="ex: Contrat CDI"
                        className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-sm text-content-primary placeholder-content-muted focus:border-accent outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-content-muted uppercase">Type</label>
                      <select
                        value={uploadMeta.typeDocument}
                        onChange={(e) => setUploadMeta(p => ({ ...p, typeDocument: e.target.value }))}
                        className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-sm text-content-primary appearance-none focus:border-accent outline-none"
                      >
                        {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-content-muted uppercase">Date d'expiration (optionnel)</label>
                    <input
                      type="date"
                      value={uploadMeta.dateExpiration}
                      onChange={(e) => setUploadMeta(p => ({ ...p, dateExpiration: e.target.value }))}
                      className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-sm text-content-primary focus:border-accent outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || !uploadMeta.nom}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-accent hover:bg-accent-primary-hover disabled:bg-surface disabled:text-content-muted text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      Choisir le fichier
                    </button>
                    <button
                      onClick={() => setShowUploadForm(false)}
                      className="px-3 py-2 text-content-muted hover:text-content-primary text-xs transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleUploadDocument}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  />
                </div>
              )}

              {docsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-accent" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 text-content-muted">
                  <File size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucun document</p>
                  <p className="text-xs mt-1">Ajoutez des fichiers pour cet employé</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const statusStyle = DOC_STATUS_STYLES[doc.statut] || DOC_STATUS_STYLES.PENDING;
                    const isExpired = doc.dateExpiration && new Date(doc.dateExpiration) < new Date();
                    return (
                      <div key={doc.id} className="p-3 bg-surface-base border border-edge rounded-xl hover:border-edge transition-colors group">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                            <FileText size={16} className="text-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-content-secondary font-medium truncate">{doc.nom}</p>
                            <div className="flex items-center gap-2 text-[11px] text-content-muted mt-0.5">
                              <span className="text-content-muted">{DOC_TYPE_LABELS[doc.typeDocument] || doc.typeDocument}</span>
                              {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${statusStyle.cls}`}>
                                {isExpired && doc.statut !== 'EXPIRED' ? 'Expiré' : statusStyle.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {doc.statut === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleVerifyDoc(doc.id, 'VERIFIED')}
                                  className="p-1.5 text-status-success hover:bg-status-success-bg rounded-lg transition-colors"
                                  title="Vérifier"
                                >
                                  <CheckCircle size={14} />
                                </button>
                                <button
                                  onClick={() => handleVerifyDoc(doc.id, 'REJECTED')}
                                  className="p-1.5 text-status-danger hover:bg-status-danger-bg rounded-lg transition-colors"
                                  title="Rejeter"
                                >
                                  <Ban size={14} />
                                </button>
                              </>
                            )}
                            {doc.url && (
                              <button
                                onClick={() => setPreviewDoc(doc)}
                                className="p-1.5 text-content-muted hover:text-accent transition-colors"

                                title="Aperçu"
                              >
                                <Eye size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteDoc(doc)}
                              className="p-1.5 text-content-muted hover:text-status-danger transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {doc.dateExpiration && (
                          <div className={`mt-2 flex items-center gap-1.5 text-[10px] ${isExpired ? 'text-status-danger' : 'text-content-muted'}`}>
                            <Calendar size={10} />
                            <span>Expire le {new Date(doc.dateExpiration).toLocaleDateString('fr-FR')}</span>
                            {isExpired && <AlertTriangle size={10} className="text-status-danger" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========== ACTIVITY HISTORY VIEW ========== */}
          {activeView === 'activity' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-content-muted">
                <History size={18} />
                <h3 className="text-sm font-bold uppercase tracking-wider">Historique d'activité</h3>
                <span className="text-xs bg-surface text-content-muted px-2 py-0.5 rounded-full">
                  {auditLogs.length}
                </span>
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-accent" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-content-muted">
                  <Clock size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucune activité enregistrée</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 p-3 bg-surface-base/50 border border-edge/50 rounded-xl hover:border-edge-subtle transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        log.statut === 'success' ? 'bg-status-success' :
                        log.statut === 'failure' ? 'bg-status-danger' : 'bg-status-warning'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-content-secondary font-medium">
                            {getActionLabel(log.action)}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getRiskColor(log.riskLevel)}`}>
                            {log.riskLevel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-content-muted">
                          <Clock size={10} />
                          <span>{formatDateTime(log.createdAt)}</span>
                          {log.resource && (
                            <>
                              <span className="text-content-secondary">|</span>
                              <span>{log.resource}</span>
                            </>
                          )}
                          {log.ipAddress && (
                            <>
                              <span className="text-content-secondary">|</span>
                              <span className="font-mono">{log.ipAddress}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          documentId={previewDoc.id}
          documentName={previewDoc.nom || previewDoc.fileName}
          preloadedUrl={previewDoc.url || undefined}
          preloadedMimeType={previewDoc.mimeType || undefined}
        />
      )}

      {showTransferModal && (
        <TransferAgenceModal
          employee={employee}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => { setShowTransferModal(false); onRefresh?.(); }}
        />
      )}
    </div>
  );
}

// --- SOUS-COMPOSANTS ---

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
       <div className="flex items-center gap-2 text-content-muted border-b border-edge pb-2">
         <Icon size={18} />
         <h3 className="text-sm font-bold uppercase tracking-wider">{title}</h3>
       </div>
       <div className="grid grid-cols-2 gap-4">
         {children}
       </div>
    </div>
  );
}

function GridItem({
  label,
  value,
  icon: Icon,
  fullWidth,
  mono,
  badge
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  fullWidth?: boolean;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className={`space-y-1 ${fullWidth ? 'col-span-2' : ''}`}>
       <div className="text-xs text-content-muted font-medium flex items-center gap-2">
         {Icon && <Icon size={12} />} {label}
       </div>
       <div className={`text-sm text-content-secondary font-medium ${
         mono ? 'font-mono bg-surface-base px-2 py-1 rounded w-fit text-content-muted border border-edge' : ''
       } ${
         badge ? 'bg-accent/10 text-accent px-2 py-0.5 rounded text-xs w-fit border border-accent/20 uppercase font-bold' : ''
       }`}>
         {value}
       </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'Actif';
  const isSuspended = status === 'Suspendu';

  const getStyles = () => {
    if (isActive) return 'bg-status-success-bg text-status-success border-status-success/20';
    if (isSuspended) return 'bg-status-warning-bg text-status-warning border-status-warning/20';
    return 'bg-status-danger-bg text-status-danger border-status-danger/20';
  };

  const getIcon = () => {
    if (isActive) return <CheckCircle size={12} />;
    return <Ban size={12} />;
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStyles()}`}>
      {getIcon()}
      {status}
    </span>
  );
}

function AgencyTypeBadge({ type }: { type: 'MAIN' | 'SECONDARY' | 'KIOSK' }) {
  const getTypeInfo = () => {
    switch (type) {
      case 'MAIN':
        return {
          label: 'Principale',
          colors: 'bg-accent/10 text-accent border-accent/20'
        };
      case 'SECONDARY':
        return {
          label: 'Secondaire',
          colors: 'bg-status-info-bg text-status-info border-status-info/20'
        };
      case 'KIOSK':
        return {
          label: 'Kiosque',
          colors: 'bg-status-info-bg text-status-info border-status-info/20'
        };
      default:
        return {
          label: type,
          colors: 'bg-surface-subtle/30 text-content-muted border-edge-strong/20'
        };
    }
  };

  const typeInfo = getTypeInfo();

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${typeInfo.colors}`}>
      {typeInfo.label}
    </span>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  color = "text-content-secondary hover:bg-surface hover:text-content-primary"
}: {
  icon: React.ElementType;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  color?: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${color}`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}
