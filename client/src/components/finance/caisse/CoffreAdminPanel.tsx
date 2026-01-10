import { useState, useEffect } from 'react';
import { Card, Button, Switch, FormField } from "@/components/ui";
import { Loader2, Save, ShieldAlert, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { coffreApi } from '@/lib/api-client';

interface CoffreAdminPanelProps {
  agenceId: string;
}

interface ConfigState {
  seuilDoubleValidation: number;
  separationInitiateurValideur: boolean;
  montantMaxTransfert: number | null;
  actif: boolean;
}

export function CoffreAdminPanel({ agenceId }: CoffreAdminPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigState>({
    seuilDoubleValidation: 1000000,
    separationInitiateurValideur: true,
    montantMaxTransfert: null,
    actif: true
  });

  useEffect(() => {
    loadConfig();
  }, [agenceId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await coffreApi.getConfig(agenceId);
      setConfig({
        seuilDoubleValidation: Number(data.seuilDoubleValidation),
        separationInitiateurValideur: data.separationInitiateurValideur,
        montantMaxTransfert: data.montantMaxTransfert ? Number(data.montantMaxTransfert) : null,
        actif: data.actif
      });
    } catch (error) {
      console.error('Erreur chargement config:', error);
      toast.error("Impossible de charger la configuration du coffre.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await coffreApi.updateConfig({
        agenceId,
        seuilDoubleValidation: String(config.seuilDoubleValidation),
        separationInitiateurValideur: config.separationInitiateurValideur,
        montantMaxTransfert: config.montantMaxTransfert ? String(config.montantMaxTransfert) : null,
        actif: config.actif
      });
      toast.success("Configuration mise à jour avec succès.");
    } catch (error) {
      console.error('Erreur sauvegarde config:', error);
      toast.error("Impossible de mettre à jour la configuration.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Sécurité et Restrictions</h3>
            </div>
            <p className="text-sm text-muted-foreground">
                Configuration des règles de sécurité pour les opérations du coffre-fort.
            </p>
        </div>
        <div className="space-y-6 p-6">
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h4 className="font-semibold text-sm">Attention</h4>
              <p className="text-sm text-amber-700 mt-1">
                Ces modifications affectent immédiatement toutes les opérations de coffre pour cette agence.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Toggle Separation des rôles */}
            <div className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <label className="text-base font-semibold">Double Validation</label>
                <div className="text-sm text-gray-500">
                  Séparer strictement les rôles d'initiateur et de validateur.
                </div>
              </div>
              <Switch
                checked={config.separationInitiateurValideur}
                onChange={(checked) => setConfig(prev => ({ ...prev, separationInitiateurValideur: checked }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                label="Seuil de Double Validation (FCFA)"
                name="seuilDoubleValidation"
                type="number"
                value={config.seuilDoubleValidation}
                onChange={(e) => setConfig(prev => ({ ...prev, seuilDoubleValidation: Number(e.target.value) }))}
                helperText="Montant à partir duquel la validation par un supérieur est requise."
              />

              <FormField
                label="Montant Maximum par Transfert (FCFA)"
                name="montantMaxTransfert"
                type="number"
                value={config.montantMaxTransfert || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfig(prev => ({ ...prev, montantMaxTransfert: val ? Number(val) : null }))
                }}
                placeholder="Illimité"
                helperText="Laisser vide pour aucune limite."
              />
            </div>

            {/* Toggle Coffre Actif */}
            <div className="flex flex-row items-center justify-between rounded-lg border p-4 bg-slate-50">
              <div className="space-y-0.5">
                <label className="text-base font-semibold">Coffre Actif</label>
                <div className="text-sm text-gray-500">
                  Activer ou désactiver les opérations sur ce coffre.
                </div>
              </div>
              <Switch
                checked={config.actif}
                onChange={(checked) => setConfig(prev => ({ ...prev, actif: checked }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving} isLoading={saving}>
              <Save className="mr-2 h-4 w-4" />
              Enregistrer la configuration
            </Button>
          </div>

        </div>
      </Card>
    </div>
  );
}
