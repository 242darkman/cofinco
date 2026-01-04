import React, { useState } from 'react';
import { Key, RefreshCw, Copy, Check, AlertTriangle, Shield } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import FormField from '@/components/ui/FormField';
import SelectField from '@/components/ui/SelectField';
import Button from '@/components/ui/Button';
import { User } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface GenerateCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onGenerate: (data: any) => Promise<any>;
}

export default function GenerateCodeModal({ isOpen, onClose, users, onGenerate }: GenerateCodeModalProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGenerateCodes = hasPermission('access_codes', 'create') || hasPermission('admin', 'manage');

  const [formData, setFormData] = useState({
    validityHours: 8,
    assignedTo: '',
    agence: '',
    notes: '',
    maxUses: 1
  });
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const result = await onGenerate(formData);
      if (result && result.code) {
        setGeneratedCode(result.code);
      }
    } catch (error) {
      console.error('Error generating code:', error);
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
    setGeneratedCode(null);
    setFormData({
      validityHours: 8,
      assignedTo: '',
      agence: '',
      notes: '',
      maxUses: 1
    });
    onClose();
  };

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
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Durée de validité (heures)" name="validityHours">
              <input
                type="number"
                min="1"
                max="24"
                name="validityHours"
                value={formData.validityHours}
                onChange={(e) => setFormData({ ...formData, validityHours: parseInt(e.target.value) || 8 })}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FormField>
            <FormField label="Utilisations Max" name="maxUses">
              <input
                type="number"
                min="1"
                name="maxUses"
                value={formData.maxUses}
                onChange={(e) => setFormData({ ...formData, maxUses: parseInt(e.target.value) || 1 })}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Assigné à (optionnel)"
              name="assignedTo"
              value={formData.assignedTo}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              options={[
                { value: '', label: 'Tout le monde' },
                ...users.filter(u => u.role !== 'Administrateur').map(user => ({
                  value: user.id,
                  label: `${user.nom} (${user.role})`
                }))
              ]}
            />
            <FormField label="Agence (optionnel)" name="agence">
              <input
                  type="text"
                  name="agence"
                  value={formData.agence}
                  onChange={(e) => setFormData({ ...formData, agence: e.target.value })}
                  placeholder="Toutes les agences"
                  className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </FormField>
          </div>

          <FormField label="Notes" name="notes">
            <input
              type="text"
              name="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Raison de la génération..."
              className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>

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
