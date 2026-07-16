import React, { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { Coins, AlertTriangle, Check, Globe, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import type { CurrencyConfig } from '@shared/config/currency';

type PresetWithId = CurrencyConfig & { id: string };

interface PresetFormData {
  code: string;
  symbol: string;
  symbolPosition: 'before' | 'after';
  locale: string;
  decimals: number;
}

const emptyForm: PresetFormData = {
  code: '',
  symbol: '',
  symbolPosition: 'after',
  locale: 'fr-FR',
  decimals: 0,
};

export default function AdminCurrencySettings() {
  const [presets, setPresets] = useState<PresetWithId[]>([]);
  const [activeCurrency, setActiveCurrency] = useState<CurrencyConfig | null>(null);
  const [selectedCode, setSelectedCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // CRUD state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PresetFormData>(emptyForm);
  const [formSaving, setFormSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [current, presetList] = await Promise.all([
        fetch('/api/config/currency').then(r => r.json()),
        fetch('/api/config/currency/presets').then(r => r.json()),
      ]);
      setActiveCurrency(current);
      setSelectedCode(current.code);
      setPresets(presetList);
    } catch {
      toast.error('Erreur de chargement de la configuration devise');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Switch active currency ----
  const handleSave = async () => {
    if (selectedCode === activeCurrency?.code) {
      toast.info('La devise est deja configuree sur ce code');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devise: selectedCode }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      const preset = presets.find(p => p.code === selectedCode);
      if (preset) setActiveCurrency(preset);
      toast.success(`Devise changee en ${selectedCode}. Les montants s'affichent desormais en ${preset?.symbol || selectedCode}.`);
    } catch {
      toast.error('Erreur lors de la mise a jour de la devise');
    } finally {
      setSaving(false);
    }
  };

  // ---- Create / Edit preset ----
  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEdit = (preset: PresetWithId) => {
    setEditingId(preset.id);
    setFormData({
      code: preset.code,
      symbol: preset.symbol,
      symbolPosition: preset.symbolPosition,
      locale: preset.locale,
      decimals: preset.decimals,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const handleFormSubmit = async () => {
    if (!formData.code || !formData.symbol) {
      toast.error('Code et symbole sont obligatoires');
      return;
    }
    setFormSaving(true);
    try {
      const url = editingId
        ? `/api/config/currency/presets/${editingId}`
        : '/api/config/currency/presets';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Erreur serveur');
      }

      toast.success(editingId ? 'Devise mise a jour' : 'Devise ajoutee');
      closeForm();
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la sauvegarde');
    } finally {
      setFormSaving(false);
    }
  };

  // ---- Delete preset ----
  const handleDelete = async (preset: PresetWithId) => {
    if (preset.code === activeCurrency?.code) {
      toast.error('Impossible de supprimer la devise active');
      return;
    }
    setDeletingId(preset.id);
    try {
      const res = await fetch(`/api/config/currency/presets/${preset.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Erreur serveur');
      }
      toast.success(`Devise ${preset.code} supprimee`);
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedPreset = presets.find(p => p.code === selectedCode);
  const hasChanged = selectedCode !== activeCurrency?.code;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* En-tete */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-accent/10 rounded-lg">
          <Coins size={24} className="text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-content-primary">Devise de l'application</h2>
          <p className="text-sm text-content-muted mt-1">
            Configure la devise utilisee pour tous les montants affiches, les rapports,
            les PDFs et les notifications. Le changement s'applique immediatement a tous les utilisateurs connectes.
          </p>
        </div>
      </div>

      {/* Devise actuelle */}
      <div className="bg-surface/50 border border-edge rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-content-muted mb-2">
          <Globe size={14} />
          Devise active
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-content-primary">
            {activeCurrency?.symbol}
          </span>
          <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full font-mono">
            {activeCurrency?.code}
          </span>
          <span className="text-sm text-content-muted">
            &middot; {activeCurrency?.decimals === 0 ? 'Pas de decimales' : `${activeCurrency?.decimals} decimales`}
            &middot; Locale: {activeCurrency?.locale}
          </span>
        </div>
      </div>

      {/* Selection + actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-content-secondary">
            Changer la devise
          </label>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent/10 border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors"
          >
            <Plus size={14} />
            Ajouter
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelectedCode(preset.code)}
              className={`
                group relative flex flex-col items-start p-3 rounded-lg border transition-all text-left
                ${selectedCode === preset.code
                  ? 'border-accent bg-accent/10 ring-1 ring-accent/50'
                  : 'border-edge bg-surface/50 hover:border-edge-strong'
                }
              `}
            >
              {selectedCode === preset.code && (
                <Check size={14} className="absolute top-2 right-2 text-accent" />
              )}

              {/* Edit/Delete icons — top right, visible on hover */}
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); openEdit(preset); }}
                  className="p-1 rounded hover:bg-surface-elevated/50 text-content-muted hover:text-content-secondary"
                >
                  <Pencil size={12} />
                </span>
                {preset.code !== activeCurrency?.code && (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(preset); }}
                    className="p-1 rounded hover:bg-status-danger-bg text-content-muted hover:text-status-danger"
                  >
                    {deletingId === preset.id
                      ? <Spinner size="xs" tone="current" className="text-status-danger" />
                      : <Trash2 size={12} />
                    }
                  </span>
                )}
              </div>

              <span className="text-lg font-bold text-content-primary">{preset.symbol}</span>
              <span className="text-xs font-mono text-content-muted mt-0.5">{preset.code}</span>
              <span className="text-xs text-content-muted mt-1">
                {preset.decimals === 0 ? 'Entier' : `${preset.decimals} dec.`}
                {' '}&middot;{' '}
                {preset.symbolPosition === 'after' ? 'Apres' : 'Avant'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Formulaire ajout/edition */}
      {showForm && (
        <div className="bg-surface/80 border border-edge-strong rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-content-secondary">
              {editingId ? 'Modifier la devise' : 'Nouvelle devise'}
            </h3>
            <button type="button" onClick={closeForm} className="p-1 text-content-muted hover:text-content-secondary">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-content-muted mb-1">Code ISO 4217</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="GBP"
                maxLength={5}
                disabled={!!editingId}
                className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-content-muted mb-1">Symbole</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value }))}
                placeholder="£"
                maxLength={10}
                className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-content-muted mb-1">Position du symbole</label>
              <select
                value={formData.symbolPosition}
                onChange={(e) => setFormData(prev => ({ ...prev, symbolPosition: e.target.value as 'before' | 'after' }))}
                className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary focus:border-accent focus:outline-none"
              >
                <option value="after">Apres (1 000 €)</option>
                <option value="before">Avant ($1,000)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-content-muted mb-1">Decimales</label>
              <select
                value={formData.decimals}
                onChange={(e) => setFormData(prev => ({ ...prev, decimals: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary focus:border-accent focus:outline-none"
              >
                <option value={0}>0 (entier)</option>
                <option value={2}>2 (centimes)</option>
                <option value={3}>3</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-content-muted mb-1">Locale</label>
              <input
                type="text"
                value={formData.locale}
                onChange={(e) => setFormData(prev => ({ ...prev, locale: e.target.value }))}
                placeholder="fr-FR"
                className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 text-sm text-content-muted hover:text-content-secondary transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleFormSubmit}
              disabled={formSaving || !formData.code || !formData.symbol}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-primary-hover text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} />
              {formSaving ? 'Enregistrement...' : editingId ? 'Mettre a jour' : 'Creer'}
            </button>
          </div>
        </div>
      )}

      {/* Apercu */}
      {selectedPreset && hasChanged && (
        <div className="bg-status-warning-bg border border-status-warning/30 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-status-warning mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="text-status-warning font-medium">Apercu du changement</p>
              <p className="text-content-muted mt-1">
                Les montants seront affiches comme suit :
              </p>
              <div className="mt-2 space-y-1 text-content-secondary font-mono text-xs">
                <div>1 234 567 &rarr; {selectedPreset.symbolPosition === 'after'
                  ? `1 234 567 ${selectedPreset.symbol}`
                  : `${selectedPreset.symbol} 1,234,567${selectedPreset.decimals > 0 ? '.' + '0'.repeat(selectedPreset.decimals) : ''}`
                }</div>
              </div>
              <p className="text-status-warning/80 text-xs mt-3">
                Ce changement affecte uniquement l'affichage. Les soldes et ecritures comptables en base ne sont pas convertis.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bouton sauvegarder */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanged || saving}
          className={`
            px-5 py-2.5 rounded-lg text-sm font-medium transition-all
            ${hasChanged
              ? 'bg-accent hover:bg-accent-primary-hover text-white'
              : 'bg-surface-elevated text-content-muted cursor-not-allowed'
            }
          `}
        >
          {saving ? 'Enregistrement...' : 'Appliquer la devise'}
        </button>
      </div>
    </div>
  );
}
