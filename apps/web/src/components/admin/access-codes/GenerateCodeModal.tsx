import React, { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Key, Copy, Check, AlertTriangle, Info, ChevronRight, ChevronLeft, User, Search, Send, Bell, Clock, Hash, Shield, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import SelectField from '@/components/ui/SelectField';
import Button from '@/components/ui/Button';
import { GeneratedCodeResult } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';
import { useQuery } from '@tanstack/react-query';

interface GenerateCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (data: any) => Promise<GeneratedCodeResult>;
  generatedCode?: string | null;
}

type CodeType = 'EMERGENCY' | 'DAILY' | 'PERMANENT';
type Step = 'type' | 'config' | 'recipient' | 'confirm';

interface UserResult {
  id: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  role?: string;
  agence?: string;
  photoProfile?: string;
}

// Predefined options
const VALIDITY_OPTIONS = [
  { value: '1', label: '1 heure' },
  { value: '2', label: '2 heures' },
  { value: '4', label: '4 heures' },
  { value: '8', label: '8 heures' },
  { value: '12', label: '12 heures' },
  { value: '24', label: '1 jour' },
  { value: '48', label: '2 jours' },
  { value: '72', label: '3 jours' },
  { value: '168', label: '1 semaine' },
  { value: '720', label: '30 jours' },
];

const MAX_USAGES_OPTIONS = [
  { value: '1', label: '1 fois' },
  { value: '2', label: '2 fois' },
  { value: '3', label: '3 fois' },
  { value: '5', label: '5 fois' },
  { value: '10', label: '10 fois' },
  { value: '20', label: '20 fois' },
  { value: '50', label: '50 fois' },
];

const AUTH_DURATION_OPTIONS = [
  { value: '1', label: '1 heure' },
  { value: '2', label: '2 heures' },
  { value: '4', label: '4 heures' },
  { value: '8', label: '8 heures' },
  { value: '12', label: '12 heures' },
  { value: '24', label: '24 heures' },
];

const CODE_TYPE_DEFAULTS: Record<CodeType, { expiresInHours: number; maxUsages: number; authorizationDurationHours: number }> = {
  EMERGENCY: { expiresInHours: 8, maxUsages: 1, authorizationDurationHours: 4 },
  DAILY: { expiresInHours: 24, maxUsages: 5, authorizationDurationHours: 8 },
  PERMANENT: { expiresInHours: 720, maxUsages: 50, authorizationDurationHours: 24 },
};

const CODE_TYPES: { type: CodeType; icon: string; title: string; subtitle: string; color: string }[] = [
  {
    type: 'EMERGENCY',
    icon: '🚨',
    title: 'Urgence',
    subtitle: 'Usage unique, expiration rapide',
    color: 'red'
  },
  {
    type: 'DAILY',
    icon: '📅',
    title: 'Journalier',
    subtitle: 'Réutilisable sur la journée',
    color: 'blue'
  },
  {
    type: 'PERMANENT',
    icon: '🔑',
    title: 'Permanent',
    subtitle: 'Longue durée, multi-usage',
    color: 'purple'
  },
];

// Search users hook
function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['search-users-for-code', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=10`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.users || data || [];
    },
    enabled: query.length >= 2,
    staleTime: 30000,
  });
}

export default function GenerateCodeModal({ isOpen, onClose, onGenerate, generatedCode: externalCode }: GenerateCodeModalProps) {
  const { hasPermission } = usePermissions();
  const canGenerateCodes = hasPermission('access_codes', 'create') || hasPermission('admin', 'manage');

  // Steps
  const [currentStep, setCurrentStep] = useState<Step>('type');

  // Form data
  const [formData, setFormData] = useState({
    codeType: 'EMERGENCY' as CodeType,
    expiresInHours: 8,
    maxUsages: 1,
    authorizationDurationHours: 4,
    description: '',
    assignedToUserId: null as string | null,
    sendNotification: true,
  });

  // User search
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const { data: searchResults, isLoading: searchLoading } = useSearchUsers(userSearch);

  // State
  const [generating, setGenerating] = useState(false);
  const [internalCode, setInternalCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatedCode = externalCode ?? internalCode;

  // Update defaults when code type changes
  useEffect(() => {
    const defaults = CODE_TYPE_DEFAULTS[formData.codeType];
    setFormData(prev => ({
      ...prev,
      ...defaults,
    }));
  }, [formData.codeType]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('type');
      setFormData({
        codeType: 'EMERGENCY',
        expiresInHours: 8,
        maxUsages: 1,
        authorizationDurationHours: 4,
        description: '',
        assignedToUserId: null,
        sendNotification: true,
      });
      setSelectedUser(null);
      setUserSearch('');
      setError(null);
      setInternalCode(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setGenerating(true);
    setError(null);
    try {
      const dataToSend = {
        codeType: formData.codeType,
        expiresInHours: formData.expiresInHours,
        maxUsages: formData.codeType === 'PERMANENT' ? null : formData.maxUsages,
        authorizationDurationHours: formData.authorizationDurationHours,
        description: formData.description || undefined,
        assignedToUserId: formData.assignedToUserId,
        sendNotification: formData.sendNotification && !!formData.assignedToUserId,
      };

      const result = await onGenerate(dataToSend);
      if (result && result.code) {
        setInternalCode(result.code);
      } else if (result && result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedCode) return;
    await navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleClose = () => {
    onClose();
  };

  const selectUser = (user: UserResult) => {
    setSelectedUser(user);
    setFormData(prev => ({ ...prev, assignedToUserId: user.id }));
    setUserSearch('');
  };

  const clearSelectedUser = () => {
    setSelectedUser(null);
    setFormData(prev => ({ ...prev, assignedToUserId: null }));
  };

  const nextStep = () => {
    const steps: Step[] = ['type', 'config', 'recipient', 'confirm'];
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1]);
  };

  const prevStep = () => {
    const steps: Step[] = ['type', 'config', 'recipient', 'confirm'];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) setCurrentStep(steps[idx - 1]);
  };

  // Get labels for summary
  const getValidityLabel = () => VALIDITY_OPTIONS.find(o => o.value === String(formData.expiresInHours))?.label || `${formData.expiresInHours}h`;
  const getUsagesLabel = () => formData.codeType === 'PERMANENT' ? 'Illimité' : (MAX_USAGES_OPTIONS.find(o => o.value === String(formData.maxUsages))?.label || `${formData.maxUsages} fois`);
  const getAuthLabel = () => AUTH_DURATION_OPTIONS.find(o => o.value === String(formData.authorizationDurationHours))?.label || `${formData.authorizationDurationHours}h`;

  // Step indicator
  const steps: { key: Step; label: string }[] = [
    { key: 'type', label: 'Type' },
    { key: 'config', label: 'Configuration' },
    { key: 'recipient', label: 'Destinataire' },
    { key: 'confirm', label: 'Confirmation' },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);

  // Success screen
  if (generatedCode) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="">
        <div className="text-center py-4">
          {/* Success animation */}
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-status-success to-status-success flex items-center justify-center animate-pulse">
            <Check className="w-10 h-10 text-white" />
          </div>

          <h2 className="text-xl font-bold text-content-primary mb-2">Code généré</h2>

          {selectedUser && (
            <p className="text-content-muted text-sm mb-4">
              {formData.sendNotification ? 'Notification envoyée à ' : 'Assigné à '}
              <span className="text-content-primary font-medium">{selectedUser.prenom} {selectedUser.nom}</span>
            </p>
          )}

          {/* Code display */}
          <div className="my-6 p-4 bg-surface rounded-xl">
            <p className="text-xs text-content-muted uppercase tracking-wide mb-2">Code d'accès</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl font-mono font-bold text-status-success tracking-[0.3em]">
                {generatedCode}
              </span>
              <button
                onClick={copyToClipboard}
                className={`p-2 rounded-lg transition-all ${copiedCode ? 'bg-status-success-bg text-status-success' : 'bg-surface-elevated text-content-muted hover:text-content-primary'}`}
              >
                {copiedCode ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>

          {/* Warning */}
          <div className="flex items-center justify-center gap-2 text-status-warning text-sm mb-6">
            <AlertTriangle size={16} />
            <span>Ce code ne sera plus affiché. Notez-le maintenant.</span>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            <div className="bg-surface/50 rounded-lg p-3">
              <Clock size={16} className="mx-auto text-content-muted mb-1" />
              <p className="text-xs text-content-muted">Validité</p>
              <p className="text-sm font-medium text-content-primary">{getValidityLabel()}</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-3">
              <Hash size={16} className="mx-auto text-content-muted mb-1" />
              <p className="text-xs text-content-muted">Utilisations</p>
              <p className="text-sm font-medium text-content-primary">{getUsagesLabel()}</p>
            </div>
            <div className="bg-surface/50 rounded-lg p-3">
              <Shield size={16} className="mx-auto text-content-muted mb-1" />
              <p className="text-xs text-content-muted">Accès</p>
              <p className="text-sm font-medium text-content-primary">{getAuthLabel()}</p>
            </div>
          </div>

          <Button onClick={handleClose} variant="primary" className="w-full">
            Fermer
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nouveau code d'accès" size="lg">
      {/* Step indicator */}
      <div className="flex items-center justify-between mb-6 px-2">
        {steps.map((step, idx) => (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                idx < currentStepIndex ? 'bg-status-success text-white' :
                idx === currentStepIndex ? 'bg-status-info text-white' :
                'bg-surface-elevated text-content-muted'
              }`}>
                {idx < currentStepIndex ? <Check size={16} /> : idx + 1}
              </div>
              <span className={`text-[10px] mt-1 ${idx === currentStepIndex ? 'text-status-info' : 'text-content-muted'}`}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 ${idx < currentStepIndex ? 'bg-status-success' : 'bg-surface-elevated'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-status-danger-bg border border-status-danger/30 rounded-lg text-status-danger text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Type Selection */}
      {currentStep === 'type' && (
        <div className="space-y-4">
          <p className="text-content-muted text-sm">Sélectionnez le type de code adapté à votre besoin</p>

          <div className="space-y-3">
            {CODE_TYPES.map(({ type, icon, title, subtitle, color }) => (
              <button
                key={type}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, codeType: type }))}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                  formData.codeType === type
                    ? `border-${color}-500 bg-${color}-500/10`
                    : 'border-edge hover:border-edge-strong bg-surface/50'
                }`}
              >
                <span className="text-3xl">{icon}</span>
                <div className="flex-1">
                  <p className={`font-semibold ${formData.codeType === type ? `text-${color}-400` : 'text-content-primary'}`}>
                    {title}
                  </p>
                  <p className="text-sm text-content-muted">{subtitle}</p>
                </div>
                {formData.codeType === type && (
                  <div className={`w-6 h-6 rounded-full bg-${color}-500 flex items-center justify-center`}>
                    <Check size={14} className="text-content-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Configuration */}
      {currentStep === 'config' && (
        <div className="space-y-4">
          <p className="text-content-muted text-sm">Configurez les paramètres du code</p>

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Validité du code"
              name="expiresInHours"
              value={String(formData.expiresInHours)}
              onChange={(e) => setFormData(prev => ({ ...prev, expiresInHours: parseInt(e.target.value) }))}
              options={VALIDITY_OPTIONS}
            />

            {formData.codeType !== 'PERMANENT' && (
              <SelectField
                label="Nombre d'utilisations"
                name="maxUsages"
                value={String(formData.maxUsages)}
                onChange={(e) => setFormData(prev => ({ ...prev, maxUsages: parseInt(e.target.value) }))}
                options={MAX_USAGES_OPTIONS}
              />
            )}
          </div>

          <SelectField
            label="Durée d'accès après validation"
            name="authorizationDurationHours"
            value={String(formData.authorizationDurationHours)}
            onChange={(e) => setFormData(prev => ({ ...prev, authorizationDurationHours: parseInt(e.target.value) }))}
            options={AUTH_DURATION_OPTIONS}
          />

          {/* Info box */}
          <div className="p-3 bg-status-info-bg border border-status-info/30 rounded-lg flex gap-3">
            <Info size={18} className="text-status-info shrink-0 mt-0.5" />
            <div className="text-sm text-status-info">
              <p className="font-medium mb-1">Comment ça fonctionne</p>
              <ul className="text-xs text-status-info/80 space-y-1">
                <li>• Le code peut être utilisé pendant <strong>{getValidityLabel()}</strong></li>
                <li>• Chaque validation donne <strong>{getAuthLabel()}</strong> d'accès à la caisse</li>
                {formData.codeType !== 'PERMANENT' && (
                  <li>• Le code peut être validé <strong>{getUsagesLabel()}</strong></li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Recipient */}
      {currentStep === 'recipient' && (
        <div className="space-y-4">
          <p className="text-content-muted text-sm">Assignez le code à un utilisateur (optionnel)</p>

          {/* Selected user display */}
          {selectedUser ? (
            <div className="p-4 bg-surface rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-status-info to-status-info flex items-center justify-center text-white font-bold">
                  {selectedUser.prenom?.[0]}{selectedUser.nom?.[0]}
                </div>
                <div>
                  <p className="font-medium text-content-primary">{selectedUser.prenom} {selectedUser.nom}</p>
                  <p className="text-sm text-content-muted">{selectedUser.role} {selectedUser.agence ? `• ${selectedUser.agence}` : ''}</p>
                </div>
              </div>
              <button
                onClick={clearSelectedUser}
                className="p-2 text-content-muted hover:text-status-danger hover:bg-status-danger-bg rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <>
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" size={18} />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Rechercher par nom, email..."
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-edge rounded-xl text-content-primary placeholder:text-content-muted focus:border-status-info focus:outline-none"
                />
                {searchLoading && (
                  <Spinner size="sm" tone="current" className="text-content-muted absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Search results */}
              {searchResults && searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-edge divide-y divide-edge">
                  {searchResults.map((user: UserResult) => (
                    <button
                      key={user.id}
                      onClick={() => selectUser(user)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-surface transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center text-content-primary text-sm font-medium">
                        {user.prenom?.[0]}{user.nom?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-content-primary truncate">{user.prenom} {user.nom}</p>
                        <p className="text-xs text-content-muted truncate">{user.email || user.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {userSearch.length >= 2 && searchResults?.length === 0 && !searchLoading && (
                <p className="text-center text-content-muted py-4">Aucun utilisateur trouvé</p>
              )}
            </>
          )}

          {/* Notification option */}
          {selectedUser && (
            <label className="flex items-center gap-3 p-4 bg-surface/50 rounded-xl cursor-pointer hover:bg-surface transition-colors">
              <input
                type="checkbox"
                checked={formData.sendNotification}
                onChange={(e) => setFormData(prev => ({ ...prev, sendNotification: e.target.checked }))}
                className="w-5 h-5 rounded border-edge-strong text-status-info focus:ring-status-info focus:ring-offset-0 bg-surface-elevated"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-status-info" />
                  <span className="font-medium text-content-primary">Envoyer une notification</span>
                </div>
                <p className="text-xs text-content-muted mt-1">
                  Le bénéficiaire recevra le code par notification push
                </p>
              </div>
            </label>
          )}

          {/* Skip option */}
          {!selectedUser && (
            <div className="text-center py-2">
              <button
                type="button"
                onClick={nextStep}
                className="text-sm text-content-muted hover:text-content-primary transition-colors"
              >
                Continuer sans assigner →
              </button>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-2">
              Motif (optionnel)
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Ex: Clôture mensuelle, Inventaire..."
              className="w-full px-4 py-3 bg-surface border border-edge rounded-xl text-content-primary placeholder:text-content-muted focus:border-status-info focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Step 4: Confirmation */}
      {currentStep === 'confirm' && (
        <div className="space-y-4">
          <p className="text-content-muted text-sm">Vérifiez les informations avant de générer le code</p>

          {/* Summary card */}
          <div className="bg-gradient-to-br from-surface to-surface/50 rounded-xl overflow-hidden">
            {/* Type header */}
            <div className={`p-4 ${
              formData.codeType === 'EMERGENCY' ? 'bg-status-danger-bg' :
              formData.codeType === 'DAILY' ? 'bg-status-info-bg' :
              'bg-status-info-bg'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {CODE_TYPES.find(t => t.type === formData.codeType)?.icon}
                </span>
                <div>
                  <p className="font-semibold text-content-primary">
                    Code {CODE_TYPES.find(t => t.type === formData.codeType)?.title}
                  </p>
                  {formData.description && (
                    <p className="text-sm text-content-muted">{formData.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div className="p-4 grid grid-cols-3 gap-4">
              <div className="text-center">
                <Clock size={20} className="mx-auto text-content-muted mb-2" />
                <p className="text-xs text-content-muted uppercase">Validité</p>
                <p className="text-sm font-semibold text-content-primary mt-1">{getValidityLabel()}</p>
              </div>
              <div className="text-center">
                <Hash size={20} className="mx-auto text-content-muted mb-2" />
                <p className="text-xs text-content-muted uppercase">Utilisations</p>
                <p className="text-sm font-semibold text-content-primary mt-1">{getUsagesLabel()}</p>
              </div>
              <div className="text-center">
                <Shield size={20} className="mx-auto text-content-muted mb-2" />
                <p className="text-xs text-content-muted uppercase">Accès/session</p>
                <p className="text-sm font-semibold text-content-primary mt-1">{getAuthLabel()}</p>
              </div>
            </div>

            {/* Recipient */}
            {selectedUser && (
              <div className="px-4 pb-4">
                <div className="p-3 bg-surface-base/50 rounded-lg flex items-center gap-3">
                  <User size={18} className="text-content-muted" />
                  <div className="flex-1">
                    <p className="text-sm text-content-primary">{selectedUser.prenom} {selectedUser.nom}</p>
                    <p className="text-xs text-content-muted">
                      {formData.sendNotification ? '📲 Notification activée' : 'Sans notification'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Generate button */}
          {canGenerateCodes ? (
            <Button
              onClick={handleSubmit}
              variant="primary"
              icon={Key}
              isLoading={generating}
              loadingText="Génération..."
              className="w-full py-3"
            >
              Générer le code
            </Button>
          ) : (
            <div className="text-center p-4 bg-status-warning-bg rounded-xl text-status-warning">
              Permission requise pour générer des codes
            </div>
          )}
        </div>
      )}

      {/* Navigation buttons */}
      {!generatedCode && (
        <div className="flex justify-between mt-6 pt-4 border-t border-edge">
          <Button
            type="button"
            variant="ghost"
            onClick={currentStep === 'type' ? handleClose : prevStep}
            icon={currentStep === 'type' ? X : ChevronLeft}
          >
            {currentStep === 'type' ? 'Annuler' : 'Retour'}
          </Button>

          {currentStep !== 'confirm' && (
            <Button
              type="button"
              variant="primary"
              onClick={nextStep}
            >
              Suivant
              <ChevronRight size={16} className="ml-1" />
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
