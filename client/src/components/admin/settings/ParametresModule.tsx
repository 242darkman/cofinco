import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings, Building2, DollarSign, Shield, Palette, Flag, User, Save, Lock,
  LayoutDashboard, FileText, Mail, Phone, Globe, ChevronDown
} from 'lucide-react';
import { toast } from '../../../lib/toast';
import { Card, Button, Badge, LoadingSpinner, FormField, SelectField } from '../../ui';
import { systemSettingsApi } from '../../../lib/api-client';
import { useSystemSettings } from '../../../hooks/settings/useSystemSettings';
import { useSecuritySettings } from '../../../hooks/settings/useSecuritySettings';
import { useUserProfile } from '../../../hooks/useUserProfile';
import SecurityPersonalSettings from './SecurityPersonalSettings';

type TabId = 'general' | 'securite' | 'taux' | 'compte' | 'interface' | 'features';

interface TabItem {
  key: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
}

const TABS: TabItem[] = [
  { key: 'general', label: 'Général', icon: Building2, description: "Identité et coordonnées de l'agence" },
  { key: 'securite', label: 'Sécurité', icon: Shield, description: "Mots de passe et contrôle d'accès" },
  { key: 'taux', label: 'Taux & Intérêts', icon: DollarSign, description: "Configuration des produits financiers" },
  { key: 'compte', label: 'Mon Compte', icon: User, description: "Paramètres personnels et PIN" },
  { key: 'interface', label: 'Apparence', icon: Palette, description: "Thème et personnalisation" },
  { key: 'features', label: 'Fonctionnalités', icon: Flag, description: "Activer ou désactiver des modules" }
];

interface ParametresModuleProps {
  activeView?: string;
}

export default function ParametresModule({ activeView }: ParametresModuleProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [formData, setFormData] = useState({
    agence_name: '',
    agence_code: '',
    devise: '',
    email: '',
    telephone: ''
  });
  const [initialData, setInitialData] = useState({
    agence_name: '',
    agence_code: '',
    devise: '',
    email: '',
    telephone: ''
  });
  const [localLoading, setLocalLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const securitySettings = useSecuritySettings();
  const { user: currentUser } = useUserProfile();

  // Detect unsaved changes
  const hasChanges = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(initialData);
  }, [formData, initialData]);

  // Map activeView to tab
  useEffect(() => {
    if (activeView) {
      const viewMap: Record<string, TabId> = {
        'params-general': 'general',
        'params-securite': 'securite',
        'params-notifications': 'interface'
      };
      if (viewMap[activeView]) {
        setActiveTab(viewMap[activeView]);
      }
    }
  }, [activeView]);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsInitialLoading(true);
        const data = await systemSettingsApi.get();
        const loaded = {
          agence_name: data.agence_name || '',
          agence_code: data.agence_code || '',
          devise: data.devise || '',
          email: data.email || '',
          telephone: data.telephone || ''
        };
        setFormData(loaded);
        setInitialData(loaded);
      } catch (error) {
        console.error(error);
        toast.error("Erreur lors du chargement des paramètres");
      } finally {
        setIsInitialLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setLocalLoading(true);
      await systemSettingsApi.update(formData);
      setInitialData(formData); // Reset "initial" to current after save
      toast.success("Paramètres enregistrés avec succès");
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setLocalLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const currentTabData = TABS.find(t => t.key === activeTab);

  if (isInitialLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white pb-28 md:pb-8 p-4 md:p-6 lg:p-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 p-4 md:p-5 bg-slate-900/50 rounded-2xl border border-slate-800">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <Settings className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white">Paramètres Système</h1>
            <p className="text-sm text-slate-400 mt-0.5">Gérez la configuration globale de votre plateforme.</p>
          </div>
        </div>

        {/* Save Button - Desktop Only */}
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={localLoading}
          disabled={!hasChanges}
          className={`hidden md:flex items-center gap-2 px-6 py-2.5 font-semibold transition-all ${
            hasChanges
              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-700 cursor-not-allowed opacity-50'
          }`}
        >
          <Save size={18} />
          Enregistrer
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
        {/* SIDEBAR NAVIGATION */}
        <nav className="w-full md:w-64 flex-shrink-0">
          {/* Mobile: Dropdown Select */}
          <div className="md:hidden mb-6">
            <SelectField
              label=""
              name="mobile-tab"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as TabId)}
              options={TABS.map(tab => ({ value: tab.key, label: tab.label }))}
              icon={currentTabData?.icon}
              className="bg-slate-900 border-slate-700"
            />
          </div>

          {/* Desktop: Vertical Menu */}
          <div className="hidden md:block space-y-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left group ${
                    isActive
                      ? 'bg-slate-900 text-indigo-400 border-l-2 border-indigo-500 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-900/50 hover:text-white border-l-2 border-transparent'
                  }`}
                >
                  <Icon
                    size={18}
                    className={isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-white transition-colors'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{tab.label}</div>
                    <div className="text-[10px] opacity-60 font-normal truncate">{tab.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        {/* MAIN CONTENT */}
        <div className="flex-1 space-y-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Section: Identité Agence */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 md:p-6">
                <h3 className="text-lg font-semibold text-white mb-1">Informations Générales</h3>
                <p className="text-xs text-slate-500 mb-6">Ces informations apparaissent sur les reçus et rapports officiels.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Nom Agence - Full Width */}
                  <div className="md:col-span-2">
                    <FormField
                      label="Nom de l'Agence"
                      name="agence_name"
                      value={formData.agence_name}
                      onChange={handleInputChange}
                      placeholder="Ex: Ma Microfinance"
                      icon={Building2}
                      required
                      helperText="Le nom officiel qui sera affiché sur tous les documents."
                    />
                  </div>

                  {/* Code Agence */}
                  <div>
                    <FormField
                      label="Code Agence"
                      name="agence_code"
                      value={formData.agence_code}
                      onChange={handleInputChange}
                      placeholder="Ex: AGC001"
                      icon={FileText}
                      disabled
                      helperText="Identifiant unique système (non modifiable après création)."
                    />
                  </div>

                  {/* Devise */}
                  <div>
                    <FormField
                      label="Devise Principale"
                      name="devise"
                      value={formData.devise}
                      onChange={handleInputChange}
                      placeholder="Ex: XAF"
                      icon={DollarSign}
                      required
                      helperText="La devise utilisée pour toutes les transactions. Ne peut être modifiée après la première opération."
                    />
                  </div>
                </div>
              </div>

              {/* Section: Coordonnées */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 md:p-6">
                <h3 className="text-lg font-semibold text-white mb-1">Coordonnées de Contact</h3>
                <p className="text-xs text-slate-500 mb-6">Informations de contact officielles de l'agence.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <FormField
                    label="Email Officiel"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="contact@agence.com"
                    icon={Mail}
                    helperText="Adresse email pour les communications officielles et notifications."
                  />

                  <FormField
                    label="Téléphone"
                    name="telephone"
                    type="tel"
                    value={formData.telephone}
                    onChange={handleInputChange}
                    placeholder="+242 06 000 0000"
                    icon={Phone}
                    helperText="Numéro principal de contact de l'agence."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'securite' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Security Status Banner */}
              <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <Shield className="text-emerald-400" size={24} />
                  <div>
                    <h4 className="font-bold text-emerald-400">Sécurité Renforcée</h4>
                    <p className="text-xs text-emerald-300/80">Tous les systèmes de sécurité sont actifs.</p>
                  </div>
                </div>
                <Badge variant="success" value="Actif" />
              </div>

              {/* Security Stats */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 md:p-6">
                <h3 className="text-lg font-semibold text-white mb-1">Politique de Sécurité</h3>
                <p className="text-xs text-slate-500 mb-6">Paramètres globaux de sécurité appliqués à tous les utilisateurs.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <StatBox
                    label="Tentatives de connexion max"
                    value={securitySettings.settings?.max_login_attempts || 3}
                    icon={Lock}
                    description="Nombre d'essais avant blocage du compte."
                  />
                  <StatBox
                    label="Timeout de session"
                    value={`${securitySettings.settings?.session_timeout_minutes || 30} min`}
                    icon={LayoutDashboard}
                    description="Durée d'inactivité avant déconnexion automatique."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Mon Compte Tab */}
          {activeTab === 'compte' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <SecurityPersonalSettings user={currentUser} />
            </div>
          )}

          {/* Placeholder for other tabs */}
          {['taux', 'interface', 'features'].includes(activeTab) && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="py-16 text-center bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-xl">
                <div className="w-16 h-16 mx-auto mb-4 bg-slate-800/50 rounded-full flex items-center justify-center">
                  {currentTabData && <currentTabData.icon className="w-8 h-8 text-slate-600" />}
                </div>
                <h3 className="text-lg font-semibold text-slate-400 mb-2">{currentTabData?.label}</h3>
                <p className="text-sm text-slate-500">Configuration bientôt disponible pour cette section.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE STICKY SAVE BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 z-50 safe-area-bottom">
        <Button
          onClick={handleSave}
          isLoading={localLoading}
          disabled={!hasChanges}
          className={`w-full flex justify-center items-center gap-2 px-6 py-3.5 font-bold rounded-xl shadow-lg transition-all ${
            hasChanges
              ? 'bg-emerald-600 active:bg-emerald-700 text-white'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          <Save size={20} />
          {hasChanges ? 'Enregistrer les modifications' : 'Aucune modification'}
        </Button>
      </div>
    </div>
  );
}

// Enhanced StatBox with description
interface StatBoxProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
}

function StatBox({ label, value, icon: Icon, description }: StatBoxProps) {
  return (
    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-slate-700/50 rounded-lg text-slate-400">
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      </div>
      {description && (
        <p className="text-[10px] text-slate-500 leading-relaxed">{description}</p>
      )}
    </div>
  );
}
