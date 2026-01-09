import React, { useState, useEffect } from 'react';
import { Save, AlertTriangle, Settings } from 'lucide-react';
import { Card, Button, FormField, LoadingSpinner } from '../ui';
import { systemSettingsApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

export default function AdminCreditSettings() {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState({
    default_currency: 'FCFA',
    enable_notifications: true,
    auto_approve_limit: 0,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await systemSettingsApi.get();
      // Merge with defaults if needed
      setSettings(prev => ({ ...prev, ...data?.credit_settings }));
    } catch (error) {
     // Silent fail for now if settings don't exist yet
     console.error("Error loading settings", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await systemSettingsApi.update({
        credit_settings: settings
      });
      toast.success('Paramètres mis à jour');
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur mise à jour'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-3 mb-6 border-b border-slate-700/50 pb-4">
          <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="font-bold text-white">Configuration Générale</h3>
            <p className="text-sm text-slate-400">Paramètres globaux pour le module crédit</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <FormField
              label="Devise par défaut"
              name="default_currency"
              value={settings.default_currency}
              onChange={(e) => setSettings({...settings, default_currency: e.target.value})}
              disabled // Locked for now
            />
            
            <FormField
              label="Limite d'approbation automatique (FCFA)"
              name="auto_approve_limit"
              type="number"
              value={settings.auto_approve_limit}
              onChange={(e) => setSettings({...settings, auto_approve_limit: Number(e.target.value)})}
              placeholder="0 pour désactiver"
            />
        </div>

         <div className="mt-6 pt-4 border-t border-slate-700/50 flex justify-end">
            <Button 
                variant="primary" 
                icon={Save} 
                onClick={handleSubmit}
                isLoading={submitting}
            >
                Enregistrer les modifications
            </Button>
         </div>
      </Card>
      
      <Card className="bg-amber-500/5 border-amber-500/20">
         <div className="flex gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" size={20} />
            <div>
               <h4 className="font-bold text-amber-500">Zone Dangereuse</h4>
               <p className="text-sm text-slate-400 mt-1">
                 La modification de ces paramètres affectera tous les nouveaux crédits. 
                 Les crédits existants ne seront pas modifiés.
               </p>
            </div>
         </div>
      </Card>
    </div>
  );
}
