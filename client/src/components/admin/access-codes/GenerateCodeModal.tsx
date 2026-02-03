import React, { useState } from 'react';
import { Key, Copy, Check, AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import FormField from '@/components/ui/FormField';
import SelectField from '@/components/ui/SelectField';
import Button from '@/components/ui/Button';
import { User, GeneratedCodeResult } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface GenerateCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onGenerate: (data: any) => Promise<GeneratedCodeResult>;
  generatedCode?: string | null;
}

type CodeType = 'EMERGENCY' | 'DAILY' | 'PERMANENT';

export default function GenerateCodeModal({ isOpen, onClose, users, onGenerate, generatedCode: externalCode }: GenerateCodeModalProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGenerateCodes = hasPermission('access_codes', 'create') || hasPermission('admin', 'manage');

  const [formData, setFormData] = useState({
    codeType: 'EMERGENCY' as CodeType,
    expiresInHours: 8,
    maxUsages: 1,
    authorizationDurationHours: 4,
    description: ''
  });
  const [generating, setGenerating] = useState(false);
  const [internalCode, setInternalCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use external code if provided, otherwise use internal
  const generatedCode = externalCode ?? internalCode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    try {
      const result = await onGenerate({
        codeType: formData.codeType,
        expiresInHours: formData.expiresInHours,
        maxUsages: formData.maxUsages,
        authorizationDurationHours: formData.authorizationDurationHours,
        description: formData.description || undefined,
      });
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

  const copyToClipboard = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleClose = () => {
    setInternalCode(null);
    setError(null);
    setFormData({
      codeType: 'EMERGENCY',
      expiresInHours: 8,
      maxUsages: 1,
      authorizationDurationHours: 4,
      description: ''
    });
    onClose();
  };

  const codeTypeOptions = [
    { value: 'EMERGENCY', label: 'Urgence (usage unique)' },
    { value: 'DAILY', label: 'Journalier (usage quotidien)' },
    { value: 'PERMANENT', label: 'Permanent (usage illimité)' }
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Générer un code d'accès">
      {generatedCode ? (
        <div className="space-y-6">
          <div className="bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 rounded-xl p-6 text-center">
            <p className="text-green-600 dark:text-green-400 mb-2">Code généré avec succès !</p>
            <div className="flex items-center justify-center gap-3 my-4">
              <span className="text-4xl font-mono font-bold text-slate-900 dark:text-white tracking-wider">
                {generatedCode}
              </span>
              <button
                onClick={() => copyToClipboard(generatedCode)}
                className="p-2 bg-white/50 hover:bg-white/80 dark:bg-black/20 dark:hover:bg-black/40 rounded-lg transition-colors"
                title="Copier"
              >
                {copiedCode === generatedCode ? (
                  <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="w-6 h-6 text-slate-700 dark:text-slate-300" />
                )}
              </button>
            </div>
            <p className="text-amber-600 dark:text-yellow-400 text-sm flex items-center justify-center gap-2">
              <AlertTriangle size={16} />
              Ce code ne sera plus affiché. Conservez-le précieusement.
            </p>
          </div>
          <div className="flex justify-end">
             <Button onClick={handleClose} variant="secondary">Fermer</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg p-3 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <SelectField
            label="Type de code"
            name="codeType"
            value={formData.codeType}
            onChange={(e) => setFormData({ ...formData, codeType: e.target.value as CodeType })}
            options={codeTypeOptions}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Validité du code (heures)" name="expiresInHours">
              <input
                type="number"
                min="1"
                max="720"
                name="expiresInHours"
                value={formData.expiresInHours}
                onChange={(e) => setFormData({ ...formData, expiresInHours: parseInt(e.target.value) || 8 })}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Durée pendant laquelle le code peut être utilisé</p>
            </FormField>

            <FormField label="Utilisations max" name="maxUsages">
              <input
                type="number"
                min="1"
                name="maxUsages"
                value={formData.maxUsages}
                onChange={(e) => setFormData({ ...formData, maxUsages: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Nombre de fois que le code peut être validé</p>
            </FormField>
          </div>

          <FormField label="Durée d'autorisation (heures)" name="authorizationDurationHours">
            <input
              type="number"
              min="1"
              max="24"
              name="authorizationDurationHours"
              value={formData.authorizationDurationHours}
              onChange={(e) => setFormData({ ...formData, authorizationDurationHours: parseInt(e.target.value) || 4 })}
              className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">Durée d'accès à la caisse après validation du code</p>
          </FormField>

          <FormField label="Description (optionnel)" name="description">
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Raison de la génération, agent concerné..."
              className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-300">
            <p>
              Le code généré permettra à l'utilisateur qui le valide d'accéder à la caisse
              pendant <strong>{formData.authorizationDurationHours}h</strong>.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={handleClose}>Annuler</Button>
            {canGenerateCodes ? (
              <Button type="submit" variant="primary" icon={Key} isLoading={generating}>
                Générer le code
              </Button>
            ) : (
              <div className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm">
                Permission requise
              </div>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
