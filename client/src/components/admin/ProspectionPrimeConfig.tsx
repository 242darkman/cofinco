import React, { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Plus, DollarSign, Percent, ToggleLeft, ToggleRight } from 'lucide-react';
import { prospectionPrimeApi } from '../../lib/api-client';
import { toast } from 'sonner';

export default function ProspectionPrimeConfig() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [formData, setFormData] = useState({
    typePrime: 'FIXED',
    montantFixe: '5000',
    tauxVariable: '',
    requireFirstCredit: false,
    requireMinRevenu: '',
    actif: true,
  });

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await prospectionPrimeApi.getConfig();
      setConfigs(data);
    } catch {
      toast.error('Erreur chargement configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await prospectionPrimeApi.createConfig(formData);
      toast.success('Configuration créée');
      setShowCreate(false);
      loadConfigs();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, actif: boolean) => {
    try {
      await prospectionPrimeApi.updateConfig(id, { actif: !actif });
      toast.success(actif ? 'Configuration désactivée' : 'Configuration activée');
      loadConfigs();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    }
  };

  const handleUpdate = async (id: string, updates: Record<string, any>) => {
    try {
      await prospectionPrimeApi.updateConfig(id, updates);
      toast.success('Configuration mise à jour');
      loadConfigs();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition"
        >
          <Plus size={14} />
          Nouvelle config
        </button>
      </div>

      {/* Existing configs */}
      {configs.length === 0 && !showCreate && (
        <div className="text-center py-8 text-slate-400">
          <Settings size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucune configuration de prime</p>
          <p className="text-xs mt-1">Créez une configuration pour activer les primes de prospection</p>
        </div>
      )}

      {configs.map((config: any) => (
        <div key={config.id} className={`p-4 rounded-xl border transition ${config.actif ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-900/50 border-slate-800 opacity-60'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {config.typePrime === 'FIXED' ? (
                <DollarSign size={16} className="text-emerald-400" />
              ) : (
                <Percent size={16} className="text-blue-400" />
              )}
              <span className="text-sm font-medium text-white">
                {(config.typePrime) === 'FIXED' ? 'Montant Fixe' : 'Taux Variable'}
              </span>
            </div>
            <button onClick={() => handleToggle(config.id, config.actif)} className="text-slate-400 hover:text-white transition">
              {config.actif ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2 bg-slate-900/50 rounded-lg">
              <span className="text-slate-400">Montant fixe</span>
              <p className="text-white font-medium">{Number(config.montantFixe || 0).toLocaleString()} FCFA</p>
            </div>
            {(config.tauxVariable) && (
              <div className="p-2 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400">Taux variable</span>
                <p className="text-white font-medium">{config.tauxVariable}%</p>
              </div>
            )}
            <div className="p-2 bg-slate-900/50 rounded-lg">
              <span className="text-slate-400">1er crédit requis</span>
              <p className="text-white font-medium">{(config.requireFirstCredit) ? 'Oui' : 'Non'}</p>
            </div>
            {(config.requireMinRevenu) && (
              <div className="p-2 bg-slate-900/50 rounded-lg">
                <span className="text-slate-400">Revenu min.</span>
                <p className="text-white font-medium">{Number(config.requireMinRevenu).toLocaleString()} FCFA</p>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Create Form */}
      {showCreate && (
        <div className="p-4 bg-slate-800 border border-cyan-500/30 rounded-xl space-y-4">
          <h3 className="text-sm font-bold text-white">Nouvelle configuration</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase mb-1">Type</label>
              <select
                value={formData.typePrime}
                onChange={(e) => setFormData(prev => ({ ...prev, typePrime: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="FIXED">Montant Fixe</option>
                <option value="VARIABLE">Taux Variable</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase mb-1">Montant fixe (FCFA)</label>
              <input
                type="number"
                value={formData.montantFixe}
                onChange={(e) => setFormData(prev => ({ ...prev, montantFixe: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
                placeholder="5000"
              />
            </div>

            {formData.typePrime === 'VARIABLE' && (
              <div>
                <label className="block text-[10px] font-medium text-slate-400 uppercase mb-1">Taux variable (%)</label>
                <input
                  type="number"
                  value={formData.tauxVariable}
                  onChange={(e) => setFormData(prev => ({ ...prev, tauxVariable: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="2.5"
                  step="0.1"
                />
              </div>
            )}

            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase mb-1">Revenu min. requis</label>
              <input
                type="number"
                value={formData.requireMinRevenu}
                onChange={(e) => setFormData(prev => ({ ...prev, requireMinRevenu: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500 focus:outline-none"
                placeholder="Optionnel"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requireFirstCredit}
              onChange={(e) => setFormData(prev => ({ ...prev, requireFirstCredit: e.target.checked }))}
              className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-sm text-slate-300">Exiger un premier crédit pour éligibilité</span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Créer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
