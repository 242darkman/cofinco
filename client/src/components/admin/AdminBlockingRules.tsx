/**
 * Admin Blocking Rules Component
 * Manage IP and device blocking rules for enhanced security
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  Globe,
  Smartphone,
  Ban,
  Clock,
  CheckCircle,
  X,
  Loader2,
  Search,
} from 'lucide-react';
import { Card, Button, FormField, SelectField, Modal, SearchInput, FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { usePermissions } from '../auth/ProtectedFeature';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { toast, handleApiError } from '../../lib/toast';
import { settingsExtendedApi } from '../../lib/api-client';

export interface BlockingRule {
  id: string;
  ruleType: 'IP' | 'DEVICE' | 'GEO' | 'USER_AGENT';
  pattern: string;
  description: string | null;
  reason: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
  hitCount: number;
  lastHitAt: string | null;
}

const RULE_TYPE_OPTIONS = [
  { value: 'IP', label: 'Adresse IP', description: 'Bloquer une adresse IP ou plage CIDR' },
  { value: 'DEVICE', label: 'Appareil (Device ID)', description: 'Bloquer un identifiant d\'appareil' },
  { value: 'GEO', label: 'Géolocalisation', description: 'Bloquer un pays ou région' },
  { value: 'USER_AGENT', label: 'User Agent', description: 'Bloquer un type de navigateur/bot' },
];

const RULE_TYPE_ICONS: Record<string, React.ElementType> = {
  IP: Globe,
  DEVICE: Smartphone,
  GEO: Globe,
  USER_AGENT: Globe,
};

export default function AdminBlockingRules() {
  const { hasPermission } = usePermissions();
  const canManageRules = hasPermission('security', 'manage') || hasPermission('admin', 'manage');
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [rules, setRules] = useState<BlockingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<BlockingRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [formData, setFormData] = useState({
    ruleType: 'IP' as 'IP' | 'DEVICE' | 'GEO' | 'USER_AGENT',
    pattern: '',
    description: '',
    reason: '',
    expiresAt: '',
  });

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await settingsExtendedApi.getBlockingRules();
      setRules(data || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des règles'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const resetForm = () => {
    setFormData({
      ruleType: 'IP',
      pattern: '',
      description: '',
      reason: '',
      expiresAt: '',
    });
    setEditingRule(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.pattern.trim()) {
      toast.error('Le motif est requis');
      return;
    }

    setSaving(true);
    try {
      if (editingRule) {
        await settingsExtendedApi.updateBlockingRule(editingRule.id, {
          ...formData,
          expiresAt: formData.expiresAt || null,
        });
        toast.success('Règle mise à jour');
      } else {
        await settingsExtendedApi.createBlockingRule({
          ...formData,
          expiresAt: formData.expiresAt || null,
        });
        toast.success('Règle créée');
      }

      setShowForm(false);
      resetForm();
      loadRules();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'enregistrement'));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (rule: BlockingRule) => {
    setEditingRule(rule);
    setFormData({
      ruleType: rule.ruleType,
      pattern: rule.pattern,
      description: rule.description || '',
      reason: rule.reason || '',
      expiresAt: rule.expiresAt ? rule.expiresAt.split('T')[0] : '',
    });
    setShowForm(true);
  };

  const toggleActive = async (rule: BlockingRule) => {
    try {
      await settingsExtendedApi.updateBlockingRule(rule.id, {
        isActive: !rule.isActive,
      });
      toast.success(rule.isActive ? 'Règle désactivée' : 'Règle activée');
      loadRules();
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la mise à jour'));
    }
  };

  const deleteRule = (rule: BlockingRule) => {
    openConfirm({
      title: 'Supprimer cette règle ?',
      message: `Voulez-vous vraiment supprimer la règle de blocage "${rule.pattern}" ?`,
      variant: 'danger',
      confirmText: 'Supprimer',
      onConfirm: async () => {
        try {
          await settingsExtendedApi.deleteBlockingRule(rule.id);
          toast.success('Règle supprimée');
          loadRules();
        } catch (error) {
          toast.error(handleApiError(error, 'Erreur lors de la suppression'));
        }
      },
    });
  };

  const filteredRules = rules.filter((rule) => {
    const matchSearch =
      rule.pattern.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (rule.description?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchType = filterType === 'all' || rule.ruleType === filterType;
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && rule.isActive) ||
      (filterStatus === 'inactive' && !rule.isActive);
    return matchSearch && matchType && matchStatus;
  });

  const getRuleTypeColor = (type: string) => {
    switch (type) {
      case 'IP':
        return 'bg-status-info-bg text-status-info border-status-info/30';
      case 'DEVICE':
        return 'bg-status-info-bg text-status-info border-status-info/30';
      case 'GEO':
        return 'bg-status-success-bg text-status-success border-status-success/30';
      case 'USER_AGENT':
        return 'bg-status-warning-bg text-status-warning border-status-warning/30';
      default:
        return 'bg-surface-subtle/40 text-content-muted border-edge-strong/30';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <FeatureHeader
        featureKey="admin.blocking-rules"
        title={FEATURE_DESCRIPTIONS['admin.blocking-rules'].title}
        subtitle={FEATURE_DESCRIPTIONS['admin.blocking-rules'].subtitle}
        helpText={FEATURE_DESCRIPTIONS['admin.blocking-rules'].helpText}
        icon={
          <div className="p-2 sm:p-3 bg-status-danger-bg rounded-xl">
            <Shield className="text-status-danger" size={22} />
          </div>
        }
        actions={
          canManageRules ? (
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="w-full sm:w-auto justify-center"
            >
              Nouvelle règle
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-surface border-edge p-3 text-center">
          <p className="text-2xl font-bold text-content-primary">{rules.length}</p>
          <p className="text-xs text-content-muted">Total règles</p>
        </Card>
        <Card className="bg-surface border-edge p-3 text-center">
          <p className="text-2xl font-bold text-status-success">{rules.filter((r) => r.isActive).length}</p>
          <p className="text-xs text-content-muted">Actives</p>
        </Card>
        <Card className="bg-surface border-edge p-3 text-center">
          <p className="text-2xl font-bold text-status-info">{rules.filter((r) => r.ruleType === 'IP').length}</p>
          <p className="text-xs text-content-muted">Blocages IP</p>
        </Card>
        <Card className="bg-surface border-edge p-3 text-center">
          <p className="text-2xl font-bold text-status-warning">
            {rules.reduce((sum, r) => sum + r.hitCount, 0)}
          </p>
          <p className="text-xs text-content-muted">Blocages effectués</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-surface-base border-edge p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchInput
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher une règle..."
            />
          </div>
          <SelectField
            label=""
            name="filterType"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            options={[
              { value: 'all', label: 'Tous les types' },
              { value: 'IP', label: 'IP' },
              { value: 'DEVICE', label: 'Appareil' },
              { value: 'GEO', label: 'Géolocalisation' },
              { value: 'USER_AGENT', label: 'User Agent' },
            ]}
            className="w-full sm:w-40"
          />
          <SelectField
            label=""
            name="filterStatus"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            options={[
              { value: 'all', label: 'Tous les statuts' },
              { value: 'active', label: 'Actives' },
              { value: 'inactive', label: 'Inactives' },
            ]}
            className="w-full sm:w-36"
          />
        </div>
      </Card>

      {/* Rules List */}
      <Card className="bg-surface-base border-edge overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-accent" size={32} />
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="text-center py-12">
            <Ban size={48} className="mx-auto mb-4 text-content-muted opacity-50" />
            <p className="text-content-muted">Aucune règle de blocage</p>
            {canManageRules && (
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="mt-4"
              >
                Créer une règle
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {filteredRules.map((rule) => {
              const Icon = RULE_TYPE_ICONS[rule.ruleType] || Globe;
              const isExpired = rule.expiresAt && new Date(rule.expiresAt) < new Date();

              return (
                <div
                  key={rule.id}
                  className={`p-4 hover:bg-surface/50 transition ${
                    !rule.isActive || isExpired ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-lg ${getRuleTypeColor(rule.ruleType)}`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-content-primary font-medium truncate">
                            {rule.pattern}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded-full border ${getRuleTypeColor(
                              rule.ruleType
                            )}`}
                          >
                            {rule.ruleType}
                          </span>
                          {!rule.isActive && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-surface-subtle/50 text-content-muted border border-edge-strong/30">
                              Désactivée
                            </span>
                          )}
                          {isExpired && (
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-status-danger-bg text-status-danger border border-status-danger/30">
                              Expirée
                            </span>
                          )}
                        </div>
                        {rule.description && (
                          <p className="text-sm text-content-muted mt-1">{rule.description}</p>
                        )}
                        {rule.reason && (
                          <p className="text-xs text-status-warning/80 mt-1">Raison: {rule.reason}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-content-muted">
                          <span className="flex items-center gap-1">
                            <Ban size={12} />
                            {rule.hitCount} blocages
                          </span>
                          {rule.expiresAt && (
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              Expire: {new Date(rule.expiresAt).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                          {rule.lastHitAt && (
                            <span>
                              Dernier blocage:{' '}
                              {new Date(rule.lastHitAt).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {canManageRules && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleActive(rule)}
                          className={`p-2 rounded-lg transition ${
                            rule.isActive
                              ? 'text-status-success hover:bg-status-success-bg'
                              : 'text-content-muted hover:bg-surface-elevated'
                          }`}
                          title={rule.isActive ? 'Désactiver' : 'Activer'}
                        >
                          <CheckCircle size={16} />
                        </button>
                        <button
                          onClick={() => startEdit(rule)}
                          className="p-2 text-content-muted hover:text-status-info hover:bg-status-info-bg rounded-lg transition"
                          title="Modifier"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => deleteRule(rule)}
                          className="p-2 text-content-muted hover:text-status-danger hover:bg-status-danger-bg rounded-lg transition"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={editingRule ? 'Modifier la règle' : 'Nouvelle règle de blocage'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <SelectField
            label="Type de règle"
            name="ruleType"
            value={formData.ruleType}
            onChange={(e) => setFormData({ ...formData, ruleType: e.target.value as any })}
            options={RULE_TYPE_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
          />

          <div className="text-xs text-content-muted bg-surface/50 p-2 rounded-lg">
            {RULE_TYPE_OPTIONS.find((o) => o.value === formData.ruleType)?.description}
          </div>

          <FormField
            label="Motif à bloquer"
            name="pattern"
            value={formData.pattern}
            onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
            placeholder={
              formData.ruleType === 'IP'
                ? '192.168.1.0/24 ou 10.0.0.1'
                : formData.ruleType === 'GEO'
                ? 'CN, RU, KP (codes pays ISO)'
                : formData.ruleType === 'USER_AGENT'
                ? 'bot, crawler, selenium'
                : 'device-id-xxx'
            }
            required
          />

          <FormField
            label="Description (optionnel)"
            name="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Description de la règle"
          />

          <FormField
            label="Raison du blocage (optionnel)"
            name="reason"
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            placeholder="Raison du blocage"
          />

          <FormField
            label="Date d'expiration (optionnel)"
            name="expiresAt"
            type="date"
            value={formData.expiresAt}
            onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
          />

          <div className="flex gap-3 pt-4">
            <Button type="submit" variant="primary" isLoading={saving} fullWidth>
              {editingRule ? 'Mettre à jour' : 'Créer la règle'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      </Modal>

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
