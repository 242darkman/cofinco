import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Building2, DollarSign, Shield, Palette, Flag, User, Save, Lock, LayoutDashboard, FileText } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { Card, Button, Badge, LoadingSpinner, TabGroup, FormField } from '../../ui';
import { systemSettingsApi } from '../../../lib/api-client';
import { useSystemSettings } from '../../../hooks/settings/useSystemSettings';
import { useCompanySettings } from '../../../hooks/settings/useCompanySettings';
import { useInterestRates } from '../../../hooks/settings/useInterestRates';
import { useSecuritySettings } from '../../../hooks/settings/useSecuritySettings';
import { useFeatureFlags } from '../../../hooks/settings/useFeatureFlags';
import { useUISettings } from '../../../hooks/settings/useUISettings';
import { useUserProfile } from '../../../hooks/useUserProfile';
import SecurityPersonalSettings from './SecurityPersonalSettings';

type TabId = 'general' | 'entreprise' | 'taux' | 'securite' | 'compte' | 'interface' | 'features';

const TABS = [
  { key: 'general', label: 'Général', icon: Building2 },
  { key: 'securite', label: 'Sécurité', icon: Shield },
  { key: 'taux', label: 'Taux & Intérêts', icon: DollarSign },
  { key: 'compte', label: 'Mon Compte', icon: User },
  { key: 'interface', label: 'Apparence', icon: Palette },
  { key: 'features', label: 'Fonctionnalités', icon: Flag }
];

interface ParametresModuleProps {
  activeView?: string;
}

export default function ParametresModule({ activeView }: ParametresModuleProps) {
  const [activeTab, setActiveTab] = useState<string>('general');
  const [formData, setFormData] = useState({
      agence_name: '',
      agence_code: '',
      devise: '',
      email: '',
      telephone: ''
  });
  const [localLoading, setLocalLoading] = useState(false);

  useEffect(() => {
    if (activeView) {
      const viewMap: Record<string, string> = {
        'params-general': 'general',
        'params-securite': 'securite', 
        'params-notifications': 'interface'
      };
      if (viewMap[activeView]) {
          setActiveTab(viewMap[activeView]);
      }
    }
  }, [activeView]);

  useEffect(() => {
    const loadSettings = async () => {
        try {
            setLocalLoading(true);
            const data = await systemSettingsApi.get();
            setFormData({
                agence_name: data.agence_name || '',
                agence_code: data.agence_code || '',
                devise: data.devise || '',
                email: data.email || '',
                telephone: data.telephone || ''
            });
        } catch (error) {
            console.error(error);
            // Silent error or toast?
        } finally {
            setLocalLoading(false);
        }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
        setLocalLoading(true);
        await systemSettingsApi.update(formData);
        toast.success("Paramètres enregistrés avec succès");
    } catch (error) {
        toast.error("Erreur lors de l'enregistrement");
    } finally {
        setLocalLoading(false);
    }
  };

  const systemSettings = useSystemSettings();
  const companySettings = useCompanySettings();
  const interestRates = useInterestRates();
  const securitySettings = useSecuritySettings();
  const featureFlags = useFeatureFlags();
  const uiSettings = useUISettings();
  const { user: currentUser } = useUserProfile();




  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <Card variant="default" padding="md" className="bg-slate-900 border-slate-800">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <Settings className="w-6 h-6 text-blue-400 animate-spin-slow" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white leading-tight">Paramètres Système</h2>
                    <p className="text-sm text-slate-400 mt-1">Configuration générale de la plateforme</p>
                </div>
            </div>
            <Button 
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 font-semibold self-start w-full sm:w-auto mt-2 sm:mt-0"
                onClick={handleSave}
                isLoading={localLoading}
            >
                <Save size={18} className="mr-2" />
                Enregistrer
            </Button>
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
                            Informations Générales
                        </h3>
                        <div className="grid gap-5">
                            <FormField 
                                label="Nom de l'Agence *" 
                                name="agence_name" 
                                value={formData.agence_name} 
                                onChange={handleInputChange}
                                placeholder="Ex: Ma Microfinance"
                                className="bg-slate-800/50 border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                                icon={Building2}
                            />
                            
                            <FormField 
                                label="Code Agence *" 
                                name="agence_code" 
                                value={formData.agence_code} 
                                onChange={handleInputChange}
                                placeholder="Ex: AGC001"
                                className="bg-slate-800/50 border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                                icon={FileText}
                            />
                            
                             <FormField 
                                label="Devise *" 
                                name="devise" 
                                value={formData.devise} 
                                onChange={handleInputChange}
                                placeholder="Ex: Franc CFA (FCFA)"
                                className="bg-slate-800/50 border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                                icon={DollarSign}
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                         <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            Coordonnées
                        </h3>
                         <div className="grid gap-5 sm:grid-cols-2">
                             <FormField 
                                label="Email de contact" 
                                name="email" 
                                value={formData.email} 
                                onChange={handleInputChange}
                                className="bg-slate-800/50 border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                                icon={FileText} // Add icon if desired
                            />
                             <FormField 
                                label="Téléphone" 
                                name="telephone" 
                                value={formData.telephone} 
                                onChange={handleInputChange}
                                className="bg-slate-800/50 border-slate-700 focus:border-blue-500 focus:ring-blue-500/20"
                                icon={FileText} // Add icon if desired
                            />
                         </div>
                    </div>
                </div>
            )}

            {/* Security Tab */}
            {activeTab === 'securite' && (
                <div className="space-y-6">
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

                    <div className="grid grid-cols-2 gap-4">
                        <StatBox label="Tentatives Max" value={securitySettings.settings?.max_login_attempts || 3} icon={Lock} />
                        <StatBox label="Timeout Session" value={`${securitySettings.settings?.session_timeout_minutes || 30} min`} icon={LayoutDashboard} />
                    </div>
                </div>
            )}

            {/* Mon Compte Tab */}
            {activeTab === 'compte' && (
                 <SecurityPersonalSettings user={currentUser} />
            )}

             {/* Placeholder for other tabs */}
            {['taux', 'interface', 'features'].includes(activeTab) && (
                <div className="py-12 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                    <p>Configuration bientôt disponible pour cette section.</p>
                </div>
            )}

        </div>
      </Card>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: string | number, icon: any }) {
  return (
    <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col items-center justify-center text-center gap-2">
      <div className="p-2 bg-slate-700/50 rounded-lg text-slate-400">
          <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold text-white">{value}</p>
      </div>
    </div>
  );
}
