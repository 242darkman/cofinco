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
  HelpCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { toast } from '../../lib/toast';
import { usePermissions } from '../auth/ProtectedFeature';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import Tooltip from '../ui/Tooltip';

interface ProduitCompte {
  id: string;
  code: string;
  nom: string;
  typeCompte: 'SAVINGS' | 'CURRENT' | 'BLOCKED';
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
  SAVINGS: {
    label: 'Épargne',
    badge: 'ÉPARGNE',
    icon: PiggyBank,
    gradient: 'from-status-success/20 to-accent/20 border-status-success/30',
  },
  CURRENT: {
    label: 'Courant',
    badge: 'COURANT',
    icon: Wallet,
    gradient: 'from-status-info/20 to-accent/20 border-status-info/30',
  },
  BLOCKED: {
    label: 'Bloqué',
    badge: 'BLOQUÉ',
    icon: Lock,
    gradient: 'from-status-warning/20 to-status-warning/20 border-status-warning/30',
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
          <Shield size={48} className="mx-auto mb-4 text-status-danger opacity-50" />
          <h3 className="text-lg font-semibold text-content-primary mb-2">Accès restreint</h3>
          <p className="text-content-muted text-sm">Permission requise</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Header with Stats */}
      <div className="bg-linear-to-r from-accent via-cyan-600/90 to-status-info rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Percent size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Gestion des Taux</h2>
              <p className="text-[11px] text-white/70">Configuration produits</p>
            </div>
          </div>

          {/* Inline Stats */}
          <div className="hidden sm:flex items-center gap-4">
            <div className="text-center px-3">
              <p className="text-lg font-bold text-white">{stats.total}</p>
              <p className="text-[9px] text-white/60 uppercase">Produits</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-3">
              <p className="text-lg font-bold text-white">{stats.active}</p>
              <p className="text-[9px] text-white/60 uppercase">Actifs</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-3">
              <p className="text-lg font-bold text-yellow-200">{stats.avgRate}%</p>
              <p className="text-[9px] text-white/60 uppercase">Taux Moy.</p>
            </div>
            <div className="w-px h-8 bg-white/20" />
            <div className="text-center px-3">
              <p className="text-lg font-bold text-white">{stats.withRates}</p>
              <p className="text-[9px] text-white/60 uppercase">Avec Taux</p>
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
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full h-9 pl-9 pr-3 bg-surface/50 border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterType(null)}
            className={cn(
              "h-9 px-3 text-[11px] font-medium rounded-lg border transition-colors",
              !filterType
                ? "bg-accent/10 border-accent/40 text-accent"
                : "bg-surface/50 border-edge text-content-muted hover:text-content-primary"
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
                  : "bg-surface/50 border-edge text-content-muted hover:text-content-primary"
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
          <Loader2 className="animate-spin text-accent" size={32} />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-content-muted">
          <Info size={32} className="mb-2 opacity-50" />
          <p className="text-sm">Aucun produit trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredProducts.map((product) => {
            const isEditing = editingId === product.id;
            const config = TYPE_CONFIG[product.typeCompte] || TYPE_CONFIG.CURRENT;
            const TypeIcon = config.icon;

            return (
              <div
                key={product.id}
                className={cn(
                  "bg-surface-base/50 border rounded-xl transition-all",
                  isEditing
                    ? "border-accent ring-1 ring-accent/30"
                    : "border-edge hover:border-edge"
                )}
              >
                {/* Product Header - Compact */}
                <div className={cn("p-3 bg-linear-to-r border-b border-edge rounded-t-xl", config.gradient)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 bg-white/10 rounded-lg shrink-0">
                        <TypeIcon size={14} className="text-content-primary" />
                      </div>
                      <div className="min-w-0 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-content-primary truncate">{product.nom}</h3>
                        {!product.actif && (
                          <span className="px-1.5 py-0.5 text-[8px] bg-status-danger/30 text-status-danger rounded">
                            INACTIF
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[9px] font-bold bg-black/20 text-content-primary/80 rounded">
                      {config.badge}
                    </span>
                  </div>
                </div>

                {/* Rate Display - Prominent */}
                <div className="px-3 py-2.5 bg-surface/30 border-b border-edge/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-content-muted flex items-center gap-1">
                      <Percent size={10} />
                      Taux d'intérêt
                    </span>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          inputMode="decimal"
                          value={editValues.tauxInteret}
                          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setEditValues({ ...editValues, tauxInteret: v }); }}
                          className="w-16 px-2 py-0.5 text-right text-sm bg-surface-elevated border border-edge-strong rounded focus:border-accent outline-none text-content-primary"
                        />
                        <span className="text-content-muted text-xs">%</span>
                      </div>
                    ) : (
                      <span className={cn(
                        "text-lg font-bold",
                        product.tauxInteret && parseFloat(product.tauxInteret) > 0
                          ? "text-status-success"
                          : "text-content-muted"
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
                      tooltipField="ouverture"
                      value={product.frais?.ouverture}
                      editValue={editValues.fraisOuverture}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisOuverture: v })}
                    />
                    <FeeField
                      label="Tenue/mois"
                      tooltipField="tenue"
                      value={product.frais?.tenue}
                      editValue={editValues.fraisTenue}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisTenue: v })}
                    />
                    <FeeField
                      label="Retrait"
                      tooltipField="retrait"
                      value={product.frais?.retrait}
                      editValue={editValues.fraisRetrait}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisRetrait: v })}
                    />
                    <FeeField
                      label="Clôture"
                      tooltipField="cloture"
                      value={product.frais?.cloture}
                      editValue={editValues.fraisCloture}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, fraisCloture: v })}
                    />
                  </div>

                  {/* Rules - Inline */}
                  <div className="mt-2 pt-2 border-t border-edge/50 grid grid-cols-2 gap-2">
                    <div className="text-[10px]">
                      <span className="text-content-muted inline-flex items-center">Min:<InfoTooltip field="soldeMinimum" /> </span>
                      {isEditing ? (
                        <input
                          inputMode="decimal"
                          value={editValues.soldeMinimum}
                          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setEditValues({ ...editValues, soldeMinimum: v }); }}
                          className="w-16 px-1 py-0.5 bg-surface-elevated border border-edge-strong rounded text-content-primary text-[10px]"
                        />
                      ) : (
                        <span className="text-content-secondary">
                          {product.regles?.soldeMinimum?.toLocaleString() || '-'} F
                        </span>
                      )}
                    </div>
                    <div className="text-[10px]">
                      <span className="text-content-muted inline-flex items-center">Plafond:<InfoTooltip field="plafondDepot" /> </span>
                      {isEditing ? (
                        <input
                          inputMode="decimal"
                          value={editValues.plafondDepot}
                          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setEditValues({ ...editValues, plafondDepot: v }); }}
                          className="w-16 px-1 py-0.5 bg-surface-elevated border border-edge-strong rounded text-content-primary text-[10px]"
                        />
                      ) : (
                        <span className="text-content-secondary">
                          {product.regles?.plafondDepot?.toLocaleString() || '∞'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Policy toggles */}
                  <div className="mt-2 pt-2 border-t border-edge/50 space-y-1.5">
                    <p className="text-[9px] text-content-muted uppercase tracking-wide">Politique</p>
                    <PolicyToggle
                      label="Dépôt initial obligatoire"
                      tooltipField="depotInitialObligatoire"
                      checked={isEditing ? editValues.depotInitialObligatoire : (product.regles?.depotInitialObligatoire ?? false)}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, depotInitialObligatoire: v })}
                    />
                    {(isEditing ? editValues.depotInitialObligatoire : product.regles?.depotInitialObligatoire) && (
                      <div className="text-[10px] pl-5">
                        <span className="text-content-muted inline-flex items-center">Dépôt min: <InfoTooltip field="depotInitialMinimum" /></span>
                        {isEditing ? (
                          <input
                            inputMode="decimal"
                            value={editValues.depotInitialMinimum}
                            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); setEditValues({ ...editValues, depotInitialMinimum: v }); }}
                            className="w-16 px-1 py-0.5 bg-surface-elevated border border-edge-strong rounded text-content-primary text-[10px]"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-content-secondary">
                            {product.regles?.depotInitialMinimum?.toLocaleString() || '-'} F
                          </span>
                        )}
                      </div>
                    )}
                    <PolicyToggle
                      label="Validation ouverture requise"
                      tooltipField="validationOuvertureRequise"
                      checked={isEditing ? editValues.validationOuvertureRequise : (product.regles?.validationOuvertureRequise ?? false)}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, validationOuvertureRequise: v })}
                    />
                    <PolicyToggle
                      label="Autoriser clôture solde < frais"
                      tooltipField="autoriserSoldeNegatifCloture"
                      checked={isEditing ? editValues.autoriserSoldeNegatifCloture : (product.regles?.autoriserSoldeNegatifCloture ?? false)}
                      isEditing={isEditing}
                      onChange={(v) => setEditValues({ ...editValues, autoriserSoldeNegatifCloture: v })}
                    />
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="px-3 py-2 bg-surface-base/50 border-t border-edge rounded-b-xl flex items-center justify-between">
                  <span className="text-[9px] text-content-muted">
                    {format(new Date(product.createdAt), 'dd/MM/yy', { locale: fr })}
                  </span>

                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={cancelEditing}
                        className="p-1.5 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded transition"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => saveChanges(product)}
                        disabled={updateMutation.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 bg-accent hover:bg-accent-primary-hover text-white rounded text-[11px] font-medium transition disabled:opacity-50"
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
                      className="flex items-center gap-1 px-2.5 py-1 text-content-muted hover:text-content-primary hover:bg-surface-elevated rounded text-[11px] transition"
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

// Tooltip descriptions for each config field
const FIELD_TOOLTIPS: Record<string, string> = {
  ouverture: "Frais uniques prélevés à l'ouverture du compte. Débité en premier avant le dépôt initial.",
  tenue: "Frais mensuels prélevés automatiquement le 1er de chaque mois sur le solde du compte.",
  retrait: "Frais prélevés sur chaque opération de retrait effectuée sur ce type de compte.",
  cloture: "Frais prélevés sur le solde lors de la clôture définitive du compte.",
  depotInitialObligatoire: "Si activé, un dépôt minimum doit être effectué pour que le compte devienne actif.",
  depotInitialMinimum: "Montant minimum du dépôt initial requis à l'ouverture.",
  validationOuvertureRequise: "Si activé, un chef d'agence doit approuver l'ouverture avant l'activation du compte.",
  autoriserSoldeNegatifCloture: "Si activé, permet la clôture même si le solde ne couvre pas les frais de clôture.",
  soldeMinimum: "Solde minimum autorisé sur ce type de compte.",
  plafondDepot: "Montant maximum de dépôt autorisé (∞ = illimité).",
};

// Inline tooltip component using shared Tooltip
function InfoTooltip({ field }: { field: string }) {
  const tip = FIELD_TOOLTIPS[field];
  if (!tip) return null;
  return (
    <Tooltip content={tip} position="top" maxWidth={220}>
      <HelpCircle size={10} className="ml-1 text-content-muted hover:text-content-secondary cursor-help" />
    </Tooltip>
  );
}

// Policy Toggle Component
function PolicyToggle({
  label,
  checked,
  isEditing,
  onChange,
  tooltipField,
}: {
  label: string;
  checked: boolean;
  isEditing: boolean;
  onChange: (value: boolean) => void;
  tooltipField?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {isEditing ? (
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={cn(
            "relative w-7 h-4 rounded-full transition-colors shrink-0",
            checked ? "bg-accent" : "bg-surface-subtle"
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
          checked ? "bg-status-success" : "bg-surface-subtle"
        )} />
      )}
      <span className="text-[10px] text-content-muted flex items-center">{label}{tooltipField && <InfoTooltip field={tooltipField} />}</span>
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
  tooltipField,
}: {
  label: string;
  value?: number;
  editValue: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  tooltipField?: string;
}) {
  return (
    <div className="bg-surface/40 rounded-lg px-2.5 py-2">
      <p className="text-[9px] text-content-muted uppercase tracking-wide mb-0.5 flex items-center">{label}{tooltipField && <InfoTooltip field={tooltipField} />}</p>
      {isEditing ? (
        <input
          inputMode="decimal"
          value={editValue}
          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); onChange(v); }}
          className="w-full px-1.5 py-0.5 text-xs bg-surface-elevated border border-edge-strong rounded focus:border-accent outline-none text-content-primary"
          placeholder="0"
        />
      ) : (
        <p className="text-xs font-medium text-content-primary">
          {value?.toLocaleString() || '-'} <span className="text-content-muted text-[10px]">F</span>
        </p>
      )}
    </div>
  );
}
