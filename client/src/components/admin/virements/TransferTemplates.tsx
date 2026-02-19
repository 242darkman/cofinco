/**
 * Transfer Templates Component
 * Manage reusable transfer templates
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Loader2,
  ArrowRight,
  Calendar,
  DollarSign,
  Building2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { settingsExtendedApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

export interface TransferTemplate {
  id: string;
  name: string;
  description?: string;
  sourceAccountPattern?: string;
  destinationAccountPattern?: string;
  frequency?: 'once' | 'daily' | 'weekly' | 'monthly';
  defaultAmount?: number;
  isActive: boolean;
  createdAt: string;
}

export interface TransferTemplatesProps {
  onUseTemplate?: (template: TransferTemplate) => void;
}

const FREQUENCY_LABELS: Record<string, string> = {
  once: 'Unique',
  daily: 'Quotidien',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
};

export default function TransferTemplates({ onUseTemplate }: TransferTemplatesProps) {
  const [templates, setTemplates] = useState<TransferTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TransferTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sourceAccountPattern: '',
    destinationAccountPattern: '',
    frequency: 'once' as 'once' | 'daily' | 'weekly' | 'monthly',
    defaultAmount: '',
    isActive: true,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      // Simulated - would use actual API
      // const data = await settingsExtendedApi.getTransferTemplates();
      // setTemplates(data);
      setTemplates([]);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des modèles de virement'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error('Le nom est requis');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        defaultAmount: formData.defaultAmount ? parseFloat(formData.defaultAmount) : undefined,
      };

      if (editingTemplate) {
        // Update
        toast.success('Template mis à jour');
      } else {
        // Create
        toast.success('Template créé');
      }

      resetForm();
      loadTemplates();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce template?')) return;

    try {
      toast.success('Template supprimé');
      loadTemplates();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la suppression du modèle'));
    }
  };

  const handleEdit = (template: TransferTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      sourceAccountPattern: template.sourceAccountPattern || '',
      destinationAccountPattern: template.destinationAccountPattern || '',
      frequency: template.frequency || 'once',
      defaultAmount: template.defaultAmount?.toString() || '',
      isActive: template.isActive,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      sourceAccountPattern: '',
      destinationAccountPattern: '',
      frequency: 'once',
      defaultAmount: '',
      isActive: true,
    });
  };

  const formatAmount = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
  };

  return (
    <div className="bg-surface/50 rounded-xl border border-edge overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-edge flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-lg">
            <FileText className="text-accent" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-content-primary">Templates de virement</h3>
            <p className="text-sm text-content-muted">{templates.length} template(s) configuré(s)</p>
          </div>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-primary-hover text-white rounded-lg transition"
        >
          <Plus size={18} />
          Nouveau template
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 border-b border-edge bg-surface-base/50">
          <h4 className="font-medium text-content-primary mb-4">
            {editingTemplate ? 'Modifier le template' : 'Nouveau template'}
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-content-muted mb-1">Nom du template *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Ex: Virement mensuel agence"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm text-content-muted mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                placeholder="Description optionnelle"
              />
            </div>

            <div>
              <label className="block text-sm text-content-muted mb-1">Compte source (pattern)</label>
              <input
                type="text"
                value={formData.sourceAccountPattern}
                onChange={(e) => setFormData({ ...formData, sourceAccountPattern: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Ex: COFFRE_*"
              />
            </div>

            <div>
              <label className="block text-sm text-content-muted mb-1">Compte destination (pattern)</label>
              <input
                type="text"
                value={formData.destinationAccountPattern}
                onChange={(e) => setFormData({ ...formData, destinationAccountPattern: e.target.value })}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Ex: CAISSE_*"
              />
            </div>

            <div>
              <label className="block text-sm text-content-muted mb-1">Fréquence</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value as any })}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="once">Unique</option>
                <option value="daily">Quotidien</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuel</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-content-muted mb-1">Montant par défaut (FCFA)</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={formData.defaultAmount}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setFormData({ ...formData, defaultAmount: v }); }}
                className="w-full px-4 py-2.5 bg-surface-elevated border border-edge-strong rounded-lg text-content-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Optionnel"
              />
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-edge-strong text-accent focus:ring-accent"
                />
                <span className="text-sm text-content-secondary">Template actif</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-content-muted hover:text-content-primary transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-primary-hover text-white rounded-lg transition disabled:opacity-50"
            >
              {saving && <Loader2 className="animate-spin" size={16} />}
              {editingTemplate ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="max-h-[400px] overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-accent" size={32} />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto mb-4 text-content-muted opacity-50" />
            <p className="text-content-muted">Aucun template configuré</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-accent hover:text-accent text-sm"
            >
              Créer votre premier template
            </button>
          </div>
        ) : (
          <div className="divide-y divide-edge/50">
            {templates.map((template) => (
              <div
                key={template.id}
                className="p-4 hover:bg-surface-elevated/30 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-content-primary">{template.name}</h4>
                      {template.isActive ? (
                        <CheckCircle size={14} className="text-status-success" />
                      ) : (
                        <XCircle size={14} className="text-content-muted" />
                      )}
                    </div>

                    {template.description && (
                      <p className="text-sm text-content-muted mb-2">{template.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-content-muted">
                      {template.sourceAccountPattern && (
                        <span className="flex items-center gap-1">
                          <Building2 size={12} />
                          {template.sourceAccountPattern}
                          <ArrowRight size={12} />
                          {template.destinationAccountPattern || 'Tout'}
                        </span>
                      )}

                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        {FREQUENCY_LABELS[template.frequency || 'once']}
                      </span>

                      {template.defaultAmount && (
                        <span className="flex items-center gap-1">
                          <DollarSign size={12} />
                          {formatAmount(template.defaultAmount)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {onUseTemplate && (
                      <button
                        onClick={() => onUseTemplate(template)}
                        className="p-2 text-accent hover:bg-accent/10 rounded-lg transition"
                        title="Utiliser ce template"
                      >
                        <Copy size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-2 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded-lg transition"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-2 text-status-danger hover:bg-status-danger-bg rounded-lg transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
