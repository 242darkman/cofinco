/**
 * Admin Product Rates Management
 * Manage interest rates and fees for account products
 * Compact, responsive design matching app theme
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Percent,
  Save,
  Edit2,
  X,
  Check,
  TrendingUp,
  DollarSign,
  RefreshCw,
  Loader2,
  Info,
  Shield,
  Wallet,
  PiggyBank,
  Lock,
  ArrowUpDown,
  Search,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { toast } from '../../lib/toast';
import { usePermissions } from '../auth/ProtectedFeature';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '../../lib/utils';

interface ProduitCompte {
  id: string;
  code: string;
  nom: string;
  typeCompte: 'EPARGNE' | 'COURANT' | 'BLOQUE';
  tauxInteret: string | null;
  frais: {
    ouverture?: number;
    tenue?: number;
    cloture?: number;
    retrait?: number;
  } | null;
  regles: {
    soldeMinimum?: number;
    plafondDepot?: number;
    plafondRetrait?: number;
    dureeMinimumJours?: number;
    depotInitialObligatoire?: boolean;
    depotInitialMinimum?: number;
    validationOuvertureRequise?: boolean;
    autoriserSoldeNegatifCloture?: boolean;
  } | null;
  actif: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { label: string; badge: string; icon: React.ElementType; gradient: string }> = {
  EPARGNE: {
    label: 'Épargne',
    badge: 'ÉPARGNE',
    icon: PiggyBank,
    gradient: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
  },
  COURANT: {
    label: 'Courant',
    badge: 'COURANT',
    icon: Wallet,
    gradient: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30',
  },
  BLOQUE: {
    label: 'Bloqué',
    badge: 'BLOQUÉ',
    icon: Lock,
    gradient: 'from-amber-500/20 to-orange-500/20 border-amber-500/30',
  },
};

export default function AdminProductRates() {
  const { hasPermission } = usePermissions();
  const canManageRates = hasPermission('admin', 'manage') || hasPermission('settings', 'edit');
  const queryClient = useQueryClient();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    tauxInteret: '',
    fraisOuverture: '',
    fraisTenue: '',
    fraisCloture: '',
    fraisRetrait: '',
    soldeMinimum: '',
    plafondDepot: '',
    depotInitialObligatoire: false,
    depotInitialMinimum: '',
    validationOuvertureRequise: false,
    autoriserSoldeNegatifCloture: false,
  });

  // Fetch products
  const { data: products = [], isLoading, refetch } = useQuery<ProduitCompte[]>({
    queryKey: ['/api/produits-compte'],
    queryFn: async () => {
      const res = await fetch('/api/produits-compte', { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur lors du chargement');
      return res.json();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/produits-compte/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erreur');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/produits-compte'] });
      toast.success('Taux mis à jour');
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = !filterType || p.typeCompte === filterType;
      return matchesSearch && matchesType;
    });
  }, [products, searchQuery, filterType]);

  // Stats
  const stats = useMemo(() => {
    const active = products.filter(p => p.actif);
    const avgRate = active.reduce((sum, p) => sum + (parseFloat(p.tauxInteret || '0') || 0), 0) / (active.length || 1);
    return {
      total: products.length,
      active: active.length,
      avgRate: avgRate.toFixed(2),
      withRates: active.filter(p => p.tauxInteret && parseFloat(p.tauxInteret) > 0).length,
    };
  }, [products]);

  const startEditing = useCallback((product: ProduitCompte) => {
    setEditingId(product.id);
    setEditValues({
      tauxInteret: product.tauxInteret || '',
      fraisOuverture: product.frais?.ouverture?.toString() || '',
      fraisTenue: product.frais?.tenue?.toString() || '',
      fraisCloture: product.frais?.cloture?.toString() || '',
      fraisRetrait: product.frais?.retrait?.toString() || '',
      soldeMinimum: product.regles?.soldeMinimum?.toString() || '',
      plafondDepot: product.regles?.plafondDepot?.toString() || '',
      depotInitialObligatoire: product.regles?.depotInitialObligatoire ?? false,
      depotInitialMinimum: product.regles?.depotInitialMinimum?.toString() || '',
      validationOuvertureRequise: product.regles?.validationOuvertureRequise ?? false,
      autoriserSoldeNegatifCloture: product.regles?.autoriserSoldeNegatifCloture ?? false,
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveChanges = useCallback((product: ProduitCompte) => {
    openConfirm({
      title: 'Confirmer les modifications',
      message: `Modifier les taux du produit "${product.nom}" ?`,
      variant: 'warning',
      confirmText: 'Confirmer',
      onConfirm: () => {
        const data = {
          tauxInteret: editValues.tauxInteret ? parseFloat(editValues.tauxInteret) : null,
          frais: {
            ouverture: editValues.fraisOuverture ? parseFloat(editValues.fraisOuverture) : undefined,
            tenue: editValues.fraisTenue ? parseFloat(editValues.fraisTenue) : undefined,
            cloture: editValues.fraisCloture ? parseFloat(editValues.fraisCloture) : undefined,
            retrait: editValues.fraisRetrait ? parseFloat(editValues.fraisRetrait) : undefined,
          },
          regles: {
            ...product.regles,
            soldeMinimum: editValues.soldeMinimum ? parseFloat(editValues.soldeMinimum) : undefined,
            plafondDepot: editValues.plafondDepot ? parseFloat(editValues.plafondDepot) : undefined,
            depotInitialObligatoire: editValues.depotInitialObligatoire,
            depotInitialMinimum: editValues.depotInitialMinimum ? parseFloat(editValues.depotInitialMinimum) : undefined,
            validationOuvertureRequise: editValues.validationOuvertureRequise,
            autoriserSoldeNegatifCloture: editValues.autoriserSoldeNegatifCloture,
          },
        };
        updateMutation.mutate({ id: product.id, data });
      },
    });
  }, [editValues, openConfirm, updateMutation]);

  if (!canManageRates) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-red-400 opacity-50" />
          <h3 className="text-lg font-semibold text-white mb-2">Accès restreint</h3>
          <p className="text-slate-400 text-sm">Permission requise</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Header with Stats */}
      <div className="bg-linear-to-r from-indigo-600/90 to-purple-600/90 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Percent size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Gestion des Taux</h2>
              <p className="text-[11px] text-indigo-100/80">Configuration produits</p>
            </div>
          </div>

          {/* Inline Stats */}
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-center px-3">
              <p className="text-lg font-bold text-white">{stats.total}</p>
              <p className="text-[9px] text-indigo-100/70 uppercase">Produits</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-3">
              <p className="text-lg font-bold text-emerald-300">{stats.active}</p>
              <p className="text-[9px] text-indigo-100/70 uppercase">Actifs</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-3">
              <p className="text-lg font-bold text-amber-300">{stats.avgRate}%</p>
              <p className="text-[9px] text-indigo-100/70 uppercase">Taux Moy.</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-3">
              <p className="text-lg font-bold text-cyan-300">{stats.withRates}</p>
              <p className="text-[9px] text-indigo-100/70 uppercase">Avec Taux</p>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition"
          >
            <RefreshCw size={16} className={cn("text-white", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Toolbar: Search + Type Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full h-9 pl-9 pr-3 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterType(null)}
            className={cn(
              "h-9 px-3 text-[11px] font-medium rounded-lg border transition-colors",
              !filterType
                ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-400"
                : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white"
            )}
          >
            Tous
          </button>
          {Object.entries(TYPE_CONFIG).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className={cn(
                "h-9 px-3 text-[11px] font-medium rounded-lg border transition-colors flex items-center gap-1.5",
                filterType === type
                  ? `bg-linear-to-r ${config.gradient}`
                  : "bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white"
              )}
            >
              <config.icon size={12} />
              {config.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-indigo-400" size={32} />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <Info size={32} className="mb-2 opacity-50" />
          <p className="text-sm">Aucun produit trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredProducts.map((product) => {
            const isEditing = editingId === product.id;
            const config = TYPE_CONFIG[product.typeCompte] || TYPE_CONFIG.COURANT;
            const TypeIcon = config.icon;

            return (
              <div
                key={product.id}
                className={cn(
                  "bg-slate-900/50 border rounded-xl overflow-hidden transition-all",
                  isEditing
                    ? "border-indigo-500 ring-1 ring-indigo-500/30"
                    : "border-slate-800 hover:border-slate-700"
                )}
              >
                {/* Product Header - Compact */}
                <div className={cn("p-3 bg-linear-to-r border-b border-slate-800", config.gradient)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 bg-white/10 rounded-lg shrink-0">
                        <TypeIcon size={14} className="text-white" />
                      </div>
                      <div className="min-w-0 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white truncate">{product.nom}</h3>
                        {!product.actif && (
                          <span className="px-1.5 py-0.5 text-[8px] bg-red-500/30 text-red-300 rounded">
                            INACTIF
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[9px] font-bold bg-black/20 text-white/80 rounded">
                      {config.badge}
                    </span>
                  </div>
                </div>

                {/* Rate Display - Prominent */}
                <div className="px-3 py-2.5 bg-slate-800/30 border-b border-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <Percent size={10} />
                      Taux d'intérêt
                    </span>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={editValues.tauxInteret}
                          onChange={(e) => setEditValues({ ...editValues, tauxInteret: e.target.value })}
                          className="w-16 px-2 py-0.5 text-right text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                        />
                        <span className="text-slate-400 text-xs">%</span>
                      </div>
                    ) : (
                      <span className={cn(
                        "text-lg font-bold",
                        product.tauxInteret && parseFloat(product.tauxInteret) > 0
                          ? "text-emerald-400"
                          : "text-slate-500"
                      )}>
                        {product.tauxInteret ? `${parseFloat(product.tauxInteret).toFixed(2)}%` : '0.00%'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Fees Grid - Compact */}
                <div className="p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <FeeField
                      label="Ouverture"
                      value={product.frais?.ouverture}
                      editValue={editValues.fraisOuverture}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisOuverture: v })}
                    />
                    <FeeField
                      label="Tenue/mois"
                      value={product.frais?.tenue}
                      editValue={editValues.fraisTenue}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisTenue: v })}
                    />
                    <FeeField
                      label="Retrait"
                      value={product.frais?.retrait}
                      editValue={editValues.fraisRetrait}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisRetrait: v })}
                    />
                    <FeeField
                      label="Clôture"
                      value={product.frais?.cloture}
                      editValue={editValues.fraisCloture}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisCloture: v })}
                    />
                  </div>

                  {/* Rules - Inline */}
                  <div className="mt-2 pt-2 border-t border-slate-800/50 grid grid-cols-2 gap-2">
                    <div className="text-[10px]">
                      <span className="text-slate-500">Min: </span>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editValues.soldeMinimum}
                          onChange={(e) => setEditValues({ ...editValues, soldeMinimum: e.target.value })}
                          className="w-16 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-white text-[10px]"
                        />
                      ) : (
                        <span className="text-slate-300">
                          {product.regles?.soldeMinimum?.toLocaleString() || '-'} F
                        </span>
                      )}
                    </div>
                    <div className="text-[10px]">
                      <span className="text-slate-500">Plafond: </span>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editValues.plafondDepot}
                          onChange={(e) => setEditValues({ ...editValues, plafondDepot: e.target.value })}
                          className="w-16 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-white text-[10px]"
                        />
                      ) : (
                        <span className="text-slate-300">
                          {product.regles?.plafondDepot?.toLocaleString() || '∞'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Policy toggles */}
                  <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-1.5">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Politique</p>
                    <PolicyToggle
                      label="Dépôt initial obligatoire"
                      checked={isEditing ? editValues.depotInitialObligatoire : (product.regles?.depotInitialObligatoire ?? false)}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, depotInitialObligatoire: v })}
                    />
                    {(isEditing ? editValues.depotInitialObligatoire : product.regles?.depotInitialObligatoire) && (
                      <div className="text-[10px] pl-5">
                        <span className="text-slate-500">Dépôt min: </span>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.depotInitialMinimum}
                            onChange={(e) => setEditValues({ ...editValues, depotInitialMinimum: e.target.value })}
                            className="w-16 px-1 py-0.5 bg-slate-700 border border-slate-600 rounded text-white text-[10px]"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-slate-300">
                            {product.regles?.depotInitialMinimum?.toLocaleString() || '-'} F
                          </span>
                        )}
                      </div>
                    )}
                    <PolicyToggle
                      label="Validation ouverture requise"
                      checked={isEditing ? editValues.validationOuvertureRequise : (product.regles?.validationOuvertureRequise ?? false)}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, validationOuvertureRequise: v })}
                    />
                    <PolicyToggle
                      label="Autoriser clôture solde < frais"
                      checked={isEditing ? editValues.autoriserSoldeNegatifCloture : (product.regles?.autoriserSoldeNegatifCloture ?? false)}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, autoriserSoldeNegatifCloture: v })}
                    />
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="px-3 py-2 bg-slate-900/50 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[9px] text-slate-600">
                    {format(new Date(product.createdAt), 'dd/MM/yy', { locale: fr })}
                  </span>

                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={cancelEditing}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => saveChanges(product)}
                        disabled={updateMutation.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition disabled:opacity-50"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                        Sauver
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditing(product)}
                      className="flex items-center gap-1 px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded text-[11px] transition"
                    >
                      <Edit2 size={12} />
                      Modifier
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

// Policy Toggle Component
function PolicyToggle({
  label,
  checked,
  isEditing,
  onChange,
}: {
  label: string;
  checked: boolean;
  isEditing: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={cn(
            "relative w-7 h-4 rounded-full transition-colors shrink-0",
            checked ? "bg-indigo-500" : "bg-slate-600"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform",
              checked ? "left-3.5" : "left-0.5"
            )}
          />
        </button>
      ) : (
        <span className={cn(
          "w-2 h-2 rounded-full shrink-0",
          checked ? "bg-emerald-400" : "bg-slate-600"
        )} />
      )}
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  );
}

// Compact Fee Field Component
function FeeField({
  label,
  value,
  editValue,
  isEditing,
  onChange,
}: {
  label: string;
  value?: number;
  editValue: string;
  isEditing: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
      <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      {isEditing ? (
        <input
          type="number"
          value={editValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-1.5 py-0.5 text-xs bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
          placeholder="0"
        />
      ) : (
        <p className="text-xs font-medium text-white">
          {value?.toLocaleString() || '-'} <span className="text-slate-500 text-[10px]">F</span>
        </p>
      )}
    </div>
  );
}
