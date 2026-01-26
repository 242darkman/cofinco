import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, User, MapPin, Briefcase, Mail, Phone, CreditCard,
  MoreVertical, CheckCircle, Ban, Calendar, MessageCircle,
  Loader2, FileText, KeyRound, LogOut, Archive, History, Shield,
  ChevronLeft, Upload, Download, Trash2, Clock, AlertTriangle,
  Eye, File
} from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes';
import { resolveStorageUrl } from '@/lib/format';
import { StatutUser } from '@shared/enum/status-constants';
import { toast } from 'sonner';

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

interface EntityFile {
  key: string;
  name: string;
  url: string | null;
  bucket: 'public' | 'private';
  size?: number;
  lastModified?: string;
}

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
  const [documents, setDocuments] = useState<EntityFile[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Handle chat opening via cross-module navigation
  const handleOpenChat = () => {
    setIsLoadingChat(true);
    onClose();
    window.dispatchEvent(new CustomEvent('navigate-module', {
      detail: {
        module: 'messages',
        data: { chatUserId: employee.userId, chatUserName: `${employee.nom} ${employee.prenom}`, chatUserPhoto: employee.photoProfile || null }
      }
    }));
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
      const res = await fetch(`/api/storage/entity/employe/${employee.id}/files`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.files || []);
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
        const tempPassword = `Temp${Math.random().toString(36).slice(2, 8)}!1`;
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

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', 'employe');
      formData.append('entityType', 'employe');
      formData.append('entityId', employee.id);

      const res = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) throw new Error('Erreur upload');
      toast.success('Document ajouté', { description: file.name });
      fetchDocuments();
    } catch (error: any) {
      toast.error('Erreur upload', { description: error.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAllDocs = () => {
    setConfirmAction({
      title: 'Supprimer tous les documents',
      message: `Tous les documents de ${employee.nom} ${employee.prenom} seront supprimés définitivement.`,
      confirmLabel: 'Supprimer tout',
      variant: 'danger',
      onConfirm: async () => {
        const res = await fetch(`/api/storage/entity/employe/${employee.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Erreur suppression');
        toast.success('Documents supprimés');
        fetchDocuments();
      },
    });
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
      case 'critical': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'high': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-950 h-full shadow-2xl border-l border-slate-800 flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >

        {/* HEADER GRAPHIQUE */}
        <div className="relative h-40 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 shrink-0">
           <button
             onClick={onClose}
             className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
           >
             <X size={20} />
           </button>

           <div className="absolute -bottom-10 left-8 flex items-end gap-4">
              <div className="w-24 h-24 rounded-2xl bg-slate-900 border-4 border-slate-950 overflow-hidden shadow-2xl">
                 {employee.photoProfile ? (
                   <img
                     src={resolveStorageUrl(employee.photoProfile)}
                     alt={`${employee.nom} ${employee.prenom}`}
                     className="w-full h-full object-cover"
                   />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-indigo-700 text-2xl font-bold text-white">
                     {getInitials(employee.nom, employee.prenom)}
                   </div>
                 )}
              </div>
              <div className="mb-2">
                 <h2 className="text-xl font-bold text-white">{employee.nom} {employee.prenom}</h2>
                 <p className="text-indigo-400 font-medium text-sm">{employee.poste || 'Non défini'}</p>
              </div>
           </div>
        </div>

        {/* CONFIRMATION MODAL OVERLAY */}
        {confirmAction && (
          <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-8">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 fade-in duration-200">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                confirmAction.variant === 'danger' ? 'bg-red-500/10' :
                confirmAction.variant === 'warning' ? 'bg-amber-500/10' : 'bg-indigo-500/10'
              }`}>
                <AlertTriangle size={20} className={
                  confirmAction.variant === 'danger' ? 'text-red-400' :
                  confirmAction.variant === 'warning' ? 'text-amber-400' : 'text-indigo-400'
                } />
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{confirmAction.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">{confirmAction.message}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-sm transition-colors border border-slate-700"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={actionLoading}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                    confirmAction.variant === 'danger'
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : confirmAction.variant === 'warning'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
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
        <div className="flex-1 overflow-y-auto pt-14 px-8 pb-8 space-y-8">

          {/* Sub-view navigation */}
          {activeView !== 'profile' && (
            <button
              onClick={() => setActiveView('profile')}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors -mt-2 mb-2"
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
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-900/20"
                >
                  Modifier Profil
                </button>

                <button
                  onClick={handleOpenChat}
                  disabled={isLoadingChat}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm border border-slate-700 flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-wait"
                >
                  {isLoadingChat ? (
                    <Loader2 size={18} className="animate-spin text-indigo-400" />
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
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <MoreVertical size={20} />
                  </button>

                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-12 z-20 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 origin-top-right">

                        <div className="px-3 py-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Administration</div>
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

                        <div className="my-1 border-t border-slate-800" />

                        <div className="px-3 py-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Sécurité</div>
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

                        <div className="my-1 border-t border-slate-800" />

                        <MenuItem
                          icon={Ban}
                          label={employee.statut === StatutUser.SUSPENDED ? "Réactiver le compte" : "Suspendre le compte"}
                          color={employee.statut === StatutUser.SUSPENDED ? "text-emerald-500 hover:bg-emerald-500/10" : "text-amber-500 hover:bg-amber-500/10"}
                          onClick={handleSuspendAccount}
                        />
                        <MenuItem
                          icon={Archive}
                          label="Archiver (Départ)"
                          color="text-red-500 hover:bg-red-500/10"
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
                <div className="col-span-2 p-4 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                   <div>
                      <div className="text-xs text-slate-500 uppercase font-bold mb-1">Salaire de Base</div>
                      <div className="text-2xl font-bold text-emerald-400">
                        {parseFloat(employee.salaireBase || '0').toLocaleString()} FCFA
                      </div>
                      {employee.modeCalculPaie && (
                        <div className="text-xs text-slate-400 mt-1">
                          Mode: {employee.modeCalculPaie === 'MONTHLY' ? 'Mensuel' : employee.modeCalculPaie === 'DAILY' ? 'Journalier' : 'Horaire'}
                        </div>
                      )}
                   </div>
                   <div className="text-right">
                      <div className="text-xs text-slate-500 mb-1">N° CNSS</div>
                      <div className="text-sm text-white font-mono">
                        {employee.numeroCnss || 'Non renseigné'}
                      </div>
                   </div>
                </div>
              </Section>

              {/* Block 4: Agence */}
              {(employee.agenceId || employee.agence) && (
                <Section title="Affectation" icon={MapPin}>
                  <div className="col-span-2">
                    <div className="text-xs text-slate-500 font-medium mb-2">Agence</div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm text-slate-200 font-medium">
                        {employee.agence?.nom || 'Agence principale'}
                      </div>
                      {employee.agence?.typeAgence && (
                        <AgencyTypeBadge type={employee.agence.typeAgence} />
                      )}
                    </div>
                    {employee.agence?.codeAgence && (
                      <div className="text-xs text-slate-500 font-mono mt-1">
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
                <div className="flex items-center gap-2 text-slate-400">
                  <FileText size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wider">Documents</h3>
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                    {documents.length}
                  </span>
                </div>
                <div className="flex gap-2">
                  {documents.length > 0 && (
                    <button
                      onClick={handleDeleteAllDocs}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Supprimer tout"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Ajouter
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleUploadDocument}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                  />
                </div>
              </div>

              {docsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <File size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucun document</p>
                  <p className="text-xs mt-1">Ajoutez des fichiers pour cet employé</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.key} className="flex items-center gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors group">
                      <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-medium truncate">{doc.name}</p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          {doc.size && <span>{formatFileSize(doc.size)}</span>}
                          {doc.lastModified && <span>{formatDateTime(doc.lastModified)}</span>}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            doc.bucket === 'public' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {doc.bucket === 'public' ? 'Public' : 'Privé'}
                          </span>
                        </div>
                      </div>
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-slate-500 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Voir"
                        >
                          <Eye size={16} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========== ACTIVITY HISTORY VIEW ========== */}
          {activeView === 'activity' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-400">
                <History size={18} />
                <h3 className="text-sm font-bold uppercase tracking-wider">Historique d'activité</h3>
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                  {auditLogs.length}
                </span>
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Clock size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucune activité enregistrée</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex gap-3 p-3 bg-slate-900/50 border border-slate-800/50 rounded-xl hover:border-slate-700/50 transition-colors">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        log.statut === 'success' ? 'bg-emerald-400' :
                        log.statut === 'failure' ? 'bg-red-400' : 'bg-amber-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-slate-200 font-medium">
                            {getActionLabel(log.action)}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${getRiskColor(log.riskLevel)}`}>
                            {log.riskLevel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <Clock size={10} />
                          <span>{formatDateTime(log.createdAt)}</span>
                          {log.resource && (
                            <>
                              <span className="text-slate-700">|</span>
                              <span>{log.resource}</span>
                            </>
                          )}
                          {log.ipAddress && (
                            <>
                              <span className="text-slate-700">|</span>
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
       <div className="flex items-center gap-2 text-slate-400 border-b border-slate-800 pb-2">
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
       <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
         {Icon && <Icon size={12} />} {label}
       </div>
       <div className={`text-sm text-slate-200 font-medium ${
         mono ? 'font-mono bg-slate-900 px-2 py-1 rounded w-fit text-slate-400 border border-slate-800' : ''
       } ${
         badge ? 'bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded text-xs w-fit border border-indigo-500/20 uppercase font-bold' : ''
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
    if (isActive) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (isSuspended) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
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
          colors: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
        };
      case 'SECONDARY':
        return {
          label: 'Secondaire',
          colors: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        };
      case 'KIOSK':
        return {
          label: 'Kiosque',
          colors: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        };
      default:
        return {
          label: type,
          colors: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
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
  color = "text-slate-300 hover:bg-slate-800 hover:text-white"
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
