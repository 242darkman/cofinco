import React, { useState, useEffect, useMemo } from 'react';
import { Settings, Save, Loader2, Plus, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, Award } from 'lucide-react';
import { prospectionPrimeApi } from '../../lib/api-client';
import { toast } from 'sonner';
import { FeatureHeader, FEATURE_DESCRIPTIONS } from '../ui';

type FilterTab = 'all' | 'active' | 'inactive';

export default function ProspectionPrimeConfig() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [formData, setFormData] = useState({
    nom: '',
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
    if (!formData.nom.trim()) {
      toast.error('Le nom est requis');
      return;
    }
    setSaving(true);
    try {
      await prospectionPrimeApi.createConfig(formData);
      toast.success('Configuration créée');
      setShowCreate(false);
      setFormData({ nom: '', typePrime: 'FIXED', montantFixe: '5000', tauxVariable: '', requireFirstCredit: false, requireMinRevenu: '', actif: true });
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
      toast.success(actif ? 'Désactivée' : 'Activée');
      loadConfigs();
    } catch (err: any) {
      toast.error(err.message || 'Erreur');
    }
  };

  const activeCount = useMemo(() => configs.filter(c => c.actif).length, [configs]);
  const inactiveCount = useMemo(() => configs.filter(c => !c.actif).length, [configs]);
  const filteredConfigs = useMemo(() => {
    if (filterTab === 'active') return configs.filter(c => c.actif);
    if (filterTab === 'inactive') return configs.filter(c => !c.actif);
    return configs;
  }, [configs, filterTab]);

  useEffect(() => { setPage(1); }, [filterTab]);

  const totalFiltered = filteredConfigs.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));
  const paginatedConfigs = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredConfigs.slice(start, start + perPage);
  }, [filteredConfigs, page, perPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FeatureHeader
        featureKey="hr.primes"
        title={FEATURE_DESCRIPTIONS['hr.primes'].title}
        subtitle={`${activeCount} active${activeCount > 1 ? 's' : ''} • ${FEATURE_DESCRIPTIONS['hr.primes'].subtitle}`}
        helpText={FEATURE_DESCRIPTIONS['hr.primes'].helpText}
        icon={<Award size={20} />}
      />

      {/* Controls Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5 bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50 text-[11px]">
          {([
            { key: 'all' as const, label: 'Toutes', count: configs.length },
            { key: 'active' as const, label: 'Actives', count: activeCount },
            { key: 'inactive' as const, label: 'Inactives', count: inactiveCount },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition ${
                filterTab === tab.key
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
              <span className={`text-[9px] px-1 rounded-full font-bold ${
                filterTab === tab.key ? 'bg-white/20' : 'bg-slate-700 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium transition"
        >
          <Plus size={12} />
          Nouvelle config
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="p-3 bg-slate-800 border border-cyan-500/30 rounded-xl space-y-3">
          <h3 className="text-xs font-bold text-white">Nouvelle configuration</h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[9px] font-medium text-slate-400 uppercase mb-0.5">Nom</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:border-cyan-500 focus:outline-none"
                placeholder="Ex: Prime Conversion"
              />
            </div>

            <div>
              <label className="block text-[9px] font-medium text-slate-400 uppercase mb-0.5">Type</label>
              <select
                value={formData.typePrime}
                onChange={(e) => setFormData(prev => ({ ...prev, typePrime: e.target.value }))}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="FIXED">Montant Fixe</option>
                <option value="VARIABLE">Taux Variable</option>
              </select>
            </div>

            {formData.typePrime === 'FIXED' ? (
              <div>
                <label className="block text-[9px] font-medium text-slate-400 uppercase mb-0.5">Montant (FCFA)</label>
                <input
                  type="number"
                  value={formData.montantFixe}
                  onChange={(e) => setFormData(prev => ({ ...prev, montantFixe: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="5000"
                />
              </div>
            ) : (
              <div>
                <label className="block text-[9px] font-medium text-slate-400 uppercase mb-0.5">Taux (% salaire brut annuel)</label>
                <input
                  type="number"
                  value={formData.tauxVariable}
                  onChange={(e) => setFormData(prev => ({ ...prev, tauxVariable: e.target.value }))}
                  className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:border-cyan-500 focus:outline-none"
                  placeholder="1.5"
                  step="0.1"
                />
              </div>
            )}

            <div>
              <label className="block text-[9px] font-medium text-slate-400 uppercase mb-0.5">Revenu min.</label>
              <input
                type="number"
                value={formData.requireMinRevenu}
                onChange={(e) => setFormData(prev => ({ ...prev, requireMinRevenu: e.target.value }))}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white focus:border-cyan-500 focus:outline-none"
                placeholder="Optionnel"
              />
            </div>

            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.requireFirstCredit}
                  onChange={(e) => setFormData(prev => ({ ...prev, requireFirstCredit: e.target.checked }))}
                  className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 w-3.5 h-3.5"
                />
                <span className="text-[10px] text-slate-300">1er crédit requis</span>
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs transition"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1 transition disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Créer
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {paginatedConfigs.length === 0 && !showCreate && (
        <div className="text-center py-6 text-slate-400">
          <Settings size={24} className="mx-auto mb-1.5 opacity-50" />
          <p className="text-xs">
            {filterTab === 'active' ? 'Aucune configuration active' : filterTab === 'inactive' ? 'Aucune configuration inactive' : 'Aucune configuration de prime'}
          </p>
        </div>
      )}

      {/* Config list - compact table-like rows */}
      {paginatedConfigs.length > 0 && (
        <div className="border border-slate-700/50 rounded-lg overflow-hidden divide-y divide-slate-700/30">
          {paginatedConfigs.map((config: any) => (
            <div
              key={config.id}
              className={`flex items-center gap-3 px-3 py-2 text-xs transition ${
                config.actif ? 'bg-slate-800/60' : 'bg-slate-900/40 opacity-60'
              }`}
            >
              {/* Toggle */}
              <button
                onClick={() => handleToggle(config.id, config.actif)}
                className="flex-shrink-0 text-slate-400 hover:text-white transition"
              >
                {config.actif ? <ToggleRight size={20} className="text-emerald-400" /> : <ToggleLeft size={20} />}
              </button>

              {/* Name + badge */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-white font-medium truncate">
                    {config.nom || (config.typePrime === 'FIXED' ? 'Montant Fixe' : 'Taux Variable')}
                  </span>
                  <span className={`px-1 py-px rounded text-[8px] font-bold uppercase flex-shrink-0 ${
                    config.typePrime === 'VARIABLE'
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  }`}>
                    {config.typePrime === 'VARIABLE' ? 'Variable' : 'Fixe'}
                  </span>
                </div>
              </div>

              {/* Key value */}
              <div className="text-right flex-shrink-0">
                {config.typePrime === 'VARIABLE' ? (
                  <span className="text-blue-300 font-medium">{config.tauxVariable || 0}% <span className="text-slate-500 font-normal">du brut annuel</span></span>
                ) : (
                  <span className="text-emerald-300 font-medium">{Number(config.montantFixe || 0).toLocaleString()} <span className="text-slate-500 font-normal">FCFA</span></span>
                )}
              </div>

              {/* Conditions */}
              <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 text-[10px] text-slate-500">
                {config.requireFirstCredit && (
                  <span className="px-1.5 py-px rounded bg-slate-700/50 border border-slate-600/30">1er crédit</span>
                )}
                {config.requireMinRevenu && (
                  <span className="px-1.5 py-px rounded bg-slate-700/50 border border-slate-600/30">Min {Number(config.requireMinRevenu).toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
          <span>{(page - 1) * perPage + 1}-{Math.min(page * perPage, totalFiltered)} sur {totalFiltered}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="px-1.5 font-medium text-slate-400">{page}/{totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 transition"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
