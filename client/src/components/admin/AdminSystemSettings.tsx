import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Save, Building2, DollarSign, Clock, Shield, Bell, Smartphone, CreditCard, AlertTriangle, Trash2, RefreshCw, Lock, LayoutDashboard, FileText, Flag, Mail } from 'lucide-react';
import { Card, Button, Badge, TabGroup, FormField, LoadingSpinner, Switch } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { systemSettingsApi, adminApi, agenceApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

// Helper Component for toggle items
interface ToggleItemProps {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    activeColor: string;
    icon: any;
    disabled?: boolean;
    comingSoon?: boolean;
}

function ToggleItem({ label, description, checked, onChange, activeColor, icon: Icon, disabled = false, comingSoon = false }: ToggleItemProps) {
    return (
        <div className={`flex items-center justify-between p-3 sm:p-4 rounded-xl border transition-all duration-200 group ${
            disabled
                ? 'border-slate-800/50 bg-slate-900/30 opacity-60'
                : 'border-slate-800 bg-slate-800/30 hover:bg-slate-800/50'
        }`}>
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                 <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-colors ${
                    disabled
                        ? 'bg-slate-800/50 text-slate-600'
                        : checked
                            ? activeColor + '/20 text-' + activeColor.replace('bg-', '')
                            : 'bg-slate-800 text-slate-500 group-hover:text-slate-400'
                 }`}>
                    <Icon size={20} className={checked && !disabled ? 'text-inherit' : 'text-current'} />
                 </div>
                 <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2">
                         <p className={`font-semibold text-sm sm:text-base leading-tight truncate ${disabled ? 'text-slate-500' : 'text-white'}`}>
                             {label}
                         </p>
                         {comingSoon && (
                             <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full whitespace-nowrap">
                                 Bientôt
                             </span>
                         )}
                     </div>
                     <p className={`text-xs sm:text-sm line-clamp-2 mt-0.5 ${disabled ? 'text-slate-600' : 'text-slate-400'}`}>
                         {description}
                     </p>
                 </div>
            </div>
            <Switch
                checked={checked}
                onChange={disabled ? () => {} : onChange}
                disabled={disabled}
             />
        </div>
    );
}

interface SystemSettings {
  agence_name: string;
  agence_code: string;
  devise: string;
  pays: string;
  adresse: string;
  telephone: string;
  email: string;
  session_timeout: number;
  max_login_attempts: number;
  password_min_length: number;
  notification_email_enabled: boolean;
  notification_sms_enabled: boolean;
  sms_payment_validation_enabled: boolean;
  mobile_money_enabled: boolean;
  maintenance_mode: boolean;
}

export default function AdminSystemSettings() {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canEditSettings = hasPermission('settings', 'edit') || hasPermission('admin', 'manage');
  const canResetPlatform = hasPermission('admin', 'manage');

  const [settings, setSettings] = useState<SystemSettings>({
    agence_name: 'COFIN - Microfinance',
    agence_code: 'COF001',
    devise: 'XAF',
    pays: 'République du Congo',
    adresse: '',
    telephone: '',
    email: '',
    session_timeout: 30,
    max_login_attempts: 5,
    password_min_length: 8,
    notification_email_enabled: false, // Disabled for prod
    notification_sms_enabled: false,   // Disabled for prod
    sms_payment_validation_enabled: false, // Disabled for prod
    mobile_money_enabled: false,       // Disabled for prod
    maintenance_mode: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('general');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Per-agency reset state
  const [agences, setAgences] = useState<{ id: string; nom: string }[]>([]);
  const [selectedAgenceToReset, setSelectedAgenceToReset] = useState('');
  const [agenceResetConfirmation, setAgenceResetConfirmation] = useState('');
  const [isResettingAgence, setIsResettingAgence] = useState(false);

  // Confirmation dialog
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const loadSettings = useCallback(async () => {
    try {
      const data = await systemSettingsApi.get();
      if (data) {
        setSettings({
          agence_name: data.agence_name || settings.agence_name,
          agence_code: data.agence_code || settings.agence_code,
          devise: data.devise || settings.devise,
          pays: data.pays || settings.pays,
          adresse: data.adresse || '',
          telephone: data.telephone || '',
          email: data.email || '',
          session_timeout: data.session_timeout || 30,
          max_login_attempts: data.max_login_attempts || 5,
          password_min_length: data.password_min_length || 8,
          notification_email_enabled: false,
          notification_sms_enabled: false,
          sms_payment_validation_enabled: false,
          mobile_money_enabled: false,
          maintenance_mode: data.maintenance_mode === true
        });
      }
    } catch (error) {
      // Silently fail - default settings will be used
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadAgences();
  }, [loadSettings]);

  const loadAgences = async () => {
    try {
      const data = await agenceApi.getAll();
      setAgences(data.map((a: any) => ({ id: a.id, nom: a.nom })));
    } catch (error) {
      console.error('Error loading agencies:', error);
    }
  };

  const saveSettings = useCallback(async () => {
    setSaving(true);
    try {
      await systemSettingsApi.update({
        ...settings,
        notification_email_enabled: false,
        notification_sms_enabled: false,
        sms_payment_validation_enabled: false,
        mobile_money_enabled: false
      });

      toast.success('Paramètres enregistrés avec succès');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleResetPlatform = useCallback(() => {
    if (resetConfirmation !== 'REINITIALISER') {
      toast.warning('Veuillez taper "REINITIALISER" pour confirmer');
      return;
    }

    openConfirm({
      title: 'Réinitialiser la plateforme ?',
      message: 'Cette action va supprimer TOUTES les données (clients, crédits, épargnes, tontines, transactions, employés sauf admin). Cette action est IRRÉVERSIBLE.',
      variant: 'danger',
      confirmText: 'Réinitialiser',
      onConfirm: async () => {
        setIsResetting(true);
        try {
          await adminApi.resetPlatform({ confirmation: 'REINITIALISER' });
          toast.success('Plateforme réinitialisée avec succès');
          setResetConfirmation('');
          window.location.reload();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la réinitialisation'));
        } finally {
          setIsResetting(false);
        }
      },
    });
  }, [resetConfirmation, openConfirm]);

  const handleResetAgence = useCallback(() => {
    if (!selectedAgenceToReset) {
      toast.warning('Veuillez sélectionner une agence');
      return;
    }
    if (agenceResetConfirmation !== 'REINITIALISER_AGENCE') {
      toast.warning('Veuillez taper "REINITIALISER_AGENCE" pour confirmer');
      return;
    }

    const selectedAgence = agences.find(a => a.id === selectedAgenceToReset);
    
    openConfirm({
      title: `Réinitialiser l'agence "${selectedAgence?.nom}" ?`,
      message: `Cette action va supprimer TOUTES les données de l'agence "${selectedAgence?.nom}" (clients, crédits, épargnes, tontines, sessions caisse). Les employés seront désaffectés mais conservés. Cette action est IRRÉVERSIBLE.`,
      variant: 'danger',
      confirmText: 'Réinitialiser',
      onConfirm: async () => {
        setIsResettingAgence(true);
        try {
          await adminApi.resetAgence(selectedAgenceToReset, { confirmation: 'REINITIALISER_AGENCE' });
          toast.success(`Agence "${selectedAgence?.nom}" réinitialisée avec succès`);
          setAgenceResetConfirmation('');
          setSelectedAgenceToReset('');
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la réinitialisation'));
        } finally {
          setIsResettingAgence(false);
        }
      },
    });
  }, [selectedAgenceToReset, agenceResetConfirmation, agences, openConfirm]);

  const TABS = [
    { key: 'general', label: 'Général', icon: Building2 },
    { key: 'security', label: 'Sécurité', icon: Shield },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'danger', label: 'Zone Danger', icon: AlertTriangle }
  ];

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card variant="default" padding="md" className="bg-slate-900 border-slate-800">

        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <Settings className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white leading-tight">Paramètres Système</h2>
                    <p className="text-sm text-slate-400 mt-1">Configuration générale de la plateforme</p>
                </div>
            </div>
            {canEditSettings ? (
              <Button
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 font-semibold self-start w-full sm:w-auto mt-2 sm:mt-0"
                  onClick={saveSettings}
                  disabled={saving}
              >
                  {saving ? <RefreshCw className="animate-spin mr-2" size={18} /> : <Save size={18} className="mr-2" />}
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            ) : (
              <div className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm flex items-center gap-2 self-start">
                <AlertTriangle size={16} />
                Permission requise
              </div>
            )}
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6">
            <TabGroup
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={TABS}
                variant="buttons"
                size="md"
                className="bg-slate-950/50 p-1.5 rounded-xl border border-slate-800"
            />
        </div>

        {/* Content Area */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* General Tab */}
            {activeTab === 'general' && (
                <div className="space-y-6">
                    <div>
                         <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            Informations Agence
                        </h3>
                        <div className="grid gap-5 md:grid-cols-2">
                            <FormField
                                label="Nom de l'Agence *"
                                name="agence_name"
                                value={settings.agence_name}
                                onChange={(e) => setSettings({ ...settings, agence_name: e.target.value })}
                                placeholder="Ma Microfinance"
                                className="bg-slate-800/50 border-slate-700"
                                icon={Building2}
                            />
                            <div className="flex gap-2 items-end">
                                <FormField
                                    label="Code Agence *"
                                    name="agence_code"
                                    value={settings.agence_code}
                                    onChange={(e) => setSettings({ ...settings, agence_code: e.target.value })}
                                    placeholder="AGC001"
                                    className="bg-slate-800/50 border-slate-700 font-mono"
                                    containerClassName="flex-1"
                                    icon={FileText}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-auto py-2 sm:py-2.5 w-[42px] sm:w-[46px] border-slate-700 bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded-lg p-0 flex items-center justify-center"
                                    onClick={() => {
                                        const randomCode = 'AGC' + Math.floor(100 + Math.random() * 900);
                                        setSettings({ ...settings, agence_code: randomCode });
                                    }}
                                    title="Générer un code aléatoire"
                                >
                                    <RefreshCw size={18} />
                                </Button>
                            </div>
                             <FormField
                                label="Devise *"
                                name="devise"
                                value={settings.devise}
                                onChange={(e) => setSettings({ ...settings, devise: e.target.value })}
                                className="bg-slate-800/50 border-slate-700 opacity-75 cursor-not-allowed"
                                icon={DollarSign}
                                disabled
                            />
                             <FormField
                                label="Pays *"
                                name="pays"
                                value={settings.pays}
                                onChange={(e) => setSettings({ ...settings, pays: e.target.value })}
                                className="bg-slate-800/50 border-slate-700 opacity-75 cursor-not-allowed"
                                icon={Flag}
                                disabled
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                         <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            Coordonnées
                        </h3>
                         <div className="grid gap-5 md:grid-cols-2">
                             <FormField
                                label="Adresse"
                                name="adresse"
                                value={settings.adresse}
                                onChange={(e) => setSettings({ ...settings, adresse: e.target.value })}
                                className="bg-slate-800/50 border-slate-700"
                            />
                             <div className="flex gap-2">
                                <FormField
                                    label="Indicatif"
                                    name="ind"
                                    value="+242"
                                    readOnly={true}
                                    containerClassName="w-24"
                                    className="bg-slate-800/50 border-slate-700 text-center"
                                />
                                <FormField
                                    label="Téléphone"
                                    name="telephone"
                                    value={(settings.telephone || '').replace('+242', '').trim()}
                                    onChange={(e) => {
                                        const num = e.target.value.replace(/[^\d]/g, '');
                                        setSettings({ ...settings, telephone: '+242' + num });
                                    }}
                                    className="bg-slate-800/50 border-slate-700"
                                    containerClassName="flex-1"
                                />
                             </div>
                             <FormField
                                label="Email"
                                name="email"
                                value={settings.email}
                                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                                type="email"
                                className="bg-slate-800/50 border-slate-700"
                            />
                         </div>
                    </div>
                </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
                <div className="space-y-6">
                    <div className="grid lg:grid-cols-2 gap-6">
                        {/* Column 1: Policies */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 rounded-lg bg-slate-800/50 text-slate-300">
                                    <Shield size={20} />
                                </div>
                                <h4 className="font-bold text-white text-lg">Politique de Sécurité</h4>
                            </div>

                            <Card className="bg-slate-900/50 border-slate-800 p-4 sm:p-5 space-y-5">
                                <FormField
                                    label="Durée de session (min)"
                                    name="session_timeout"
                                    type="number"
                                    value={settings.session_timeout}
                                    onChange={(e) => setSettings({ ...settings, session_timeout: parseInt(e.target.value) || 30 })}
                                    className="bg-slate-950 border-slate-800 focus:border-blue-500/50"
                                    icon={Clock}
                                    helperText="Déconnexion automatique après inactivité"
                                />
                                 <FormField
                                    label="Tentatives connexion max"
                                    name="max_login_attempts"
                                    type="number"
                                    value={settings.max_login_attempts}
                                    onChange={(e) => setSettings({ ...settings, max_login_attempts: parseInt(e.target.value) || 5 })}
                                    className="bg-slate-950 border-slate-800 focus:border-blue-500/50"
                                    icon={Lock}
                                    helperText="Blocage du compte après échecs"
                                />
                                 <FormField
                                    label="Longueur min. mot de passe"
                                    name="password_min_length"
                                    type="number"
                                    value={settings.password_min_length}
                                    onChange={(e) => setSettings({ ...settings, password_min_length: parseInt(e.target.value) || 8 })}
                                    className="bg-slate-950 border-slate-800 focus:border-blue-500/50"
                                    icon={Shield}
                                    helperText="Complexité requise pour les accès"
                                />
                            </Card>
                        </div>

                        {/* Column 2: Features */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 rounded-lg bg-slate-800/50 text-slate-300">
                                    <LayoutDashboard size={20} />
                                </div>
                                <h4 className="font-bold text-white text-lg">Fonctionnalités & Accès</h4>
                            </div>

                            <div className="space-y-3">
                                <ToggleItem
                                    label="Mode Maintenance"
                                    description="Bloquer l'accès pour tous sauf admins"
                                    checked={settings.maintenance_mode}
                                    onChange={(checked) => setSettings({ ...settings, maintenance_mode: checked })}
                                    activeColor="bg-amber-500"
                                    icon={AlertTriangle}
                                />
                                <ToggleItem
                                    label="Validation SMS"
                                    description="Double authentification pour paiements"
                                    checked={false}
                                    onChange={() => {}}
                                    activeColor="bg-emerald-500"
                                    icon={Shield}
                                    disabled={true}
                                    comingSoon={true}
                                />
                                <ToggleItem
                                    label="Mobile Money"
                                    description="Paiements MTN/Airtel Money"
                                    checked={false}
                                    onChange={() => {}}
                                    activeColor="bg-blue-500"
                                    icon={Smartphone}
                                    disabled={true}
                                    comingSoon={true}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
                <div className="space-y-6">
                    {/* Coming Soon Banner */}
                    <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <Bell className="text-amber-400" size={24} />
                        <div>
                            <h4 className="font-bold text-amber-400">Fonctionnalités en développement</h4>
                            <p className="text-xs text-amber-400/80">Les notifications SMS et Email seront disponibles dans une prochaine mise à jour.</p>
                        </div>
                    </div>

                    <Card className="bg-slate-900/50 border-slate-800 p-4 sm:p-5 space-y-3">
                        <ToggleItem
                            label="Notifications Email"
                            description="Envoyer des récapitulatifs et alertes par email"
                            checked={false}
                            onChange={() => {}}
                            activeColor="bg-blue-500"
                            icon={Mail}
                            disabled={true}
                            comingSoon={true}
                        />
                        <ToggleItem
                            label="Notifications SMS"
                            description="Envoyer des alertes urgentes par SMS"
                            checked={false}
                            onChange={() => {}}
                            activeColor="bg-blue-500"
                            icon={Smartphone}
                            disabled={true}
                            comingSoon={true}
                        />
                    </Card>

                    {/* Info about future features */}
                    <Card className="bg-slate-900/50 border-slate-800 p-4 sm:p-5">
                        <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                            <CreditCard size={18} className="text-slate-400" />
                            Intégrations prévues
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <p className="font-medium text-slate-300 text-sm">SMS Gateway</p>
                                <p className="text-xs text-slate-500 mt-1">Twilio, Africas Talking</p>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <p className="font-medium text-slate-300 text-sm">Email Service</p>
                                <p className="text-xs text-slate-500 mt-1">SendGrid, Mailgun</p>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <p className="font-medium text-slate-300 text-sm">Mobile Money</p>
                                <p className="text-xs text-slate-500 mt-1">MTN MoMo, Airtel Money</p>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <p className="font-medium text-slate-300 text-sm">Push Notifications</p>
                                <p className="text-xs text-slate-500 mt-1">Firebase Cloud Messaging</p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Danger Tab */}
            {activeTab === 'danger' && (
                <div className="space-y-6">
                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                        <AlertTriangle className="text-red-500" size={24} />
                        <div>
                            <h4 className="font-bold text-red-400">Zone de Danger</h4>
                            <p className="text-xs text-red-400/80">Actions irréversibles. Procédez avec prudence.</p>
                        </div>
                    </div>

                    <Card className="bg-red-950/20 border-red-500/20 p-4 sm:p-6 space-y-6">
                         <div className="space-y-2">
                             <h5 className="font-bold text-white flex items-center gap-2">
                                <Trash2 size={20} className="text-red-500" />
                                Réinitialisation Plateforme
                             </h5>
                             <p className="text-sm text-slate-400">
                                Cette action supprimera <strong>toutes les données</strong> (clients, crédits, tontines, employés). Seul le compte admin sera conservé.
                             </p>
                         </div>

                         <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                            <FormField
                                label="CONFIRMATION DE SÉCURITÉ"
                                name="reset_confirmation"
                                value={resetConfirmation}
                                onChange={(e) => setResetConfirmation(e.target.value)}
                                placeholder='Tapez "REINITIALISER"'
                                className="bg-slate-800 border-red-500/30 focus:border-red-500 placeholder-slate-600"
                                helperText="Veuillez taper le mot exact pour confirmer."
                            />
                         </div>

                         {canResetPlatform ? (
                          <Button
                              variant="danger"
                              className="w-full justify-center py-3 font-bold shadow-lg shadow-red-900/20"
                              disabled={resetConfirmation !== 'REINITIALISER' || isResetting}
                              onClick={handleResetPlatform}
                          >
                              {isResetting ? <RefreshCw className="animate-spin mr-2" /> : <Trash2 className="mr-2" />}
                              Réinitialiser la Plateforme
                          </Button>
                        ) : (
                          <div className="w-full py-3 bg-amber-500/20 text-amber-400 rounded-lg font-bold flex items-center justify-center gap-2">
                            <AlertTriangle size={20} />
                            Permission admin requise
                          </div>
                        )}
                    </Card>

                    {/* Per-Agency Reset Section */}
                    <Card className="bg-amber-950/20 border-amber-500/20 p-4 sm:p-6 space-y-6">
                         <div className="space-y-2">
                             <h5 className="font-bold text-white flex items-center gap-2">
                                <Building2 size={20} className="text-amber-500" />
                                Réinitialisation par Agence
                             </h5>
                             <p className="text-sm text-slate-400">
                                Cette action supprimera les données d'<strong>une seule agence</strong> (clients, crédits, tontines, sessions caisse). Les autres agences seront préservées. Les employés seront désaffectés mais conservés.
                             </p>
                         </div>

                         <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-4">
                            {/* Agency Selector */}
                            <div>
                              <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
                                Sélectionner l'agence à réinitialiser
                              </label>
                              <select
                                value={selectedAgenceToReset}
                                onChange={(e) => setSelectedAgenceToReset(e.target.value)}
                                className="w-full h-10 sm:h-11 px-4 pr-10 bg-slate-800 border border-amber-500/30 rounded-lg text-white text-sm sm:text-base appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:border-amber-500 focus:ring-amber-500/30"
                              >
                                <option value="">-- Choisir une agence --</option>
                                {agences.map((agence) => (
                                  <option key={agence.id} value={agence.id}>
                                    {agence.nom}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {selectedAgenceToReset && (
                              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                <p className="text-sm text-amber-400">
                                  ⚠️ Vous êtes sur le point de réinitialiser l'agence: <strong>{agences.find(a => a.id === selectedAgenceToReset)?.nom}</strong>
                                </p>
                              </div>
                            )}

                            <FormField
                                label="CONFIRMATION DE SÉCURITÉ"
                                name="agence_reset_confirmation"
                                value={agenceResetConfirmation}
                                onChange={(e) => setAgenceResetConfirmation(e.target.value)}
                                placeholder='Tapez "REINITIALISER_AGENCE"'
                                className="bg-slate-800 border-amber-500/30 focus:border-amber-500 placeholder-slate-600"
                                helperText="Veuillez taper le mot exact pour confirmer."
                            />
                         </div>

                         {canResetPlatform ? (
                          <Button
                              variant="secondary"
                              className="w-full justify-center py-3 font-bold bg-amber-600 hover:bg-amber-500 text-white border-amber-500"
                              disabled={!selectedAgenceToReset || agenceResetConfirmation !== 'REINITIALISER_AGENCE' || isResettingAgence}
                              onClick={handleResetAgence}
                          >
                              {isResettingAgence ? <RefreshCw className="animate-spin mr-2" /> : <Building2 className="mr-2" />}
                              Réinitialiser l'Agence
                          </Button>
                        ) : (
                          <div className="w-full py-3 bg-amber-500/20 text-amber-400 rounded-lg font-bold flex items-center justify-center gap-2">
                            <AlertTriangle size={20} />
                            Permission admin requise
                          </div>
                        )}
                    </Card>
                </div>
            )}

        </div>
      </Card>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={closeConfirm}
        onConfirm={handleConfirm}
        title={confirmState.title || ''}
        message={confirmState.message || ''}
        variant={confirmState.variant}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
