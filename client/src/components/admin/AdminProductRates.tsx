/**
 * Admin Product Rates Management
 * Manage interest rates and fees for account products
 * Admin-only access - Professional no-scroll interface
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Percent,
  Save,
  Edit2,
  X,
  Check,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Clock,
  History,
  Shield,
  RefreshCw,
  Loader2,
  Info,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge } from '../ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { toast, handleApiError } from '../../lib/toast';
import { usePermissions } from '../auth/ProtectedFeature';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
  } | null;
  actif: boolean;
  createdAt: string;
}

interface RateChange {
  productId: string;
  field: string;
  oldValue: number | null;
  newValue: number | null;
  changedAt: string;
  changedBy: string;
}

const TYPE_COMPTE_LABELS: Record<string, { label: string; color: string }> = {
  EPARGNE: { label: 'Épargne', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  COURANT: { label: 'Courant', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  BLOQUE: { label: 'Bloqué', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

export default function AdminProductRates() {
  const { hasPermission } = usePermissions();
  const canManageRates = hasPermission('admin', 'manage') || hasPermission('settings', 'edit');
  const queryClient = useQueryClient();
  const { confirmState, openConfirm, closeConfirm, handleConfirm } = useConfirmDialog();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    tauxInteret: string;
    fraisOuverture: string;
    fraisTenue: string;
    fraisCloture: string;
    fraisRetrait: string;
    soldeMinimum: string;
    plafondDepot: string;
  }>({
    tauxInteret: '',
    fraisOuverture: '',
    fraisTenue: '',
    fraisCloture: '',
    fraisRetrait: '',
    soldeMinimum: '',
    plafondDepot: '',
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
        throw new Error(err.error || 'Erreur lors de la mise à jour');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/produits-compte'] });
      toast.success('Taux mis à jour avec succès');
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

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
    });
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
    setEditValues({
      tauxInteret: '',
      fraisOuverture: '',
      fraisTenue: '',
      fraisCloture: '',
      fraisRetrait: '',
      soldeMinimum: '',
      plafondDepot: '',
    });
  }, []);

  const saveChanges = useCallback((product: ProduitCompte) => {
    openConfirm({
      title: 'Confirmer les modifications',
      message: `Voulez-vous vraiment modifier les taux et frais du produit "${product.nom}" ? Cette action sera enregistrée dans l'historique d'audit.`,
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
          },
        };
        updateMutation.mutate({ id: product.id, data });
      },
    });
  }, [editValues, openConfirm, updateMutation]);

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

  if (!canManageRates) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto mb-4 text-red-400 opacity-50" />
          <h3 className="text-lg font-semibold text-white mb-2">Accès restreint</h3>
          <p className="text-slate-400">Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto overflow-x-hidden">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 p-6 bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
              <Percent className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Gestion des Taux</h1>
              <p className="text-slate-400 text-sm">Configuration des taux d'intérêt et frais des produits</p>
            </div>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Produits</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.total}</p>
              </div>
              <div className="p-2.5 bg-blue-500/10 rounded-lg">
                <DollarSign size={20} className="text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Actifs</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.active}</p>
              </div>
              <div className="p-2.5 bg-emerald-500/10 rounded-lg">
                <Check size={20} className="text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Taux moyen</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{stats.avgRate}%</p>
              </div>
              <div className="p-2.5 bg-amber-500/10 rounded-lg">
                <TrendingUp size={20} className="text-amber-400" />
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Avec taux</p>
                <p className="text-2xl font-bold text-purple-400 mt-1">{stats.withRates}</p>
              </div>
              <div className="p-2.5 bg-purple-500/10 rounded-lg">
                <Percent size={20} className="text-purple-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid - Scrollable */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-indigo-400" size={40} />
          </div>
        ) : products.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Info size={48} className="mx-auto mb-4 text-slate-500" />
              <p className="text-slate-400">Aucun produit configuré</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {products.map((product) => {
              const isEditing = editingId === product.id;
              const typeInfo = TYPE_COMPTE_LABELS[product.typeCompte] || { label: product.typeCompte, color: 'bg-slate-500/20 text-slate-400' };

              return (
                <div
                  key={product.id}
                  className={`bg-slate-800/80 backdrop-blur border rounded-xl transition-all ${
                    isEditing ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-700 hover:border-slate-600'
                  }`}
                >
                  {/* Product Header */}
                  <div className="p-4 border-b border-slate-700/50">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white">{product.nom}</h3>
                          {!product.actif && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded border border-red-500/30">
                              Inactif
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">{product.code}</p>
                      </div>
                      <span className={`px-2 py-0.5 text-xs rounded-full border ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Rates & Fees */}
                  <div className="p-4 space-y-4">
                    {/* Interest Rate */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Percent size={14} />
                        <span className="text-sm">Taux d'intérêt</span>
                      </div>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.tauxInteret}
                            onChange={(e) => setEditValues({ ...editValues, tauxInteret: e.target.value })}
                            className="w-20 px-2 py-1 text-right text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                            placeholder="0.00"
                          />
                          <span className="text-slate-400 text-sm">%</span>
                        </div>
                      ) : (
                        <span className="font-semibold text-white">
                          {product.tauxInteret ? `${parseFloat(product.tauxInteret).toFixed(2)}%` : '-'}
                        </span>
                      )}
                    </div>

                    {/* Fees Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-700/30 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Ouverture</p>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.fraisOuverture}
                            onChange={(e) => setEditValues({ ...editValues, fraisOuverture: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                            placeholder="0"
                          />
                        ) : (
                          <p className="text-white font-medium text-sm">
                            {product.frais?.ouverture?.toLocaleString() || '-'} FCFA
                          </p>
                        )}
                      </div>

                      <div className="bg-slate-700/30 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tenue mensuelle</p>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.fraisTenue}
                            onChange={(e) => setEditValues({ ...editValues, fraisTenue: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                            placeholder="0"
                          />
                        ) : (
                          <p className="text-white font-medium text-sm">
                            {product.frais?.tenue?.toLocaleString() || '-'} FCFA
                          </p>
                        )}
                      </div>

                      <div className="bg-slate-700/30 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Retrait</p>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.fraisRetrait}
                            onChange={(e) => setEditValues({ ...editValues, fraisRetrait: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                            placeholder="0"
                          />
                        ) : (
                          <p className="text-white font-medium text-sm">
                            {product.frais?.retrait?.toLocaleString() || '-'} FCFA
                          </p>
                        )}
                      </div>

                      <div className="bg-slate-700/30 rounded-lg p-2.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Clôture</p>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editValues.fraisCloture}
                            onChange={(e) => setEditValues({ ...editValues, fraisCloture: e.target.value })}
                            className="w-full px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                            placeholder="0"
                          />
                        ) : (
                          <p className="text-white font-medium text-sm">
                            {product.frais?.cloture?.toLocaleString() || '-'} FCFA
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Rules */}
                    <div className="pt-3 border-t border-slate-700/50">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Solde minimum</p>
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValues.soldeMinimum}
                              onChange={(e) => setEditValues({ ...editValues, soldeMinimum: e.target.value })}
                              className="w-full px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                              placeholder="0"
                            />
                          ) : (
                            <p className="text-slate-300 text-sm">
                              {product.regles?.soldeMinimum?.toLocaleString() || '-'} FCFA
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Plafond dépôt</p>
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValues.plafondDepot}
                              onChange={(e) => setEditValues({ ...editValues, plafondDepot: e.target.value })}
                              className="w-full px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded focus:border-indigo-500 outline-none text-white"
                              placeholder="0"
                            />
                          ) : (
                            <p className="text-slate-300 text-sm">
                              {product.regles?.plafondDepot?.toLocaleString() || 'Illimité'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-4 py-3 bg-slate-900/50 border-t border-slate-700/50 flex items-center justify-between">
                    <p className="text-[10px] text-slate-500">
                      Créé le {format(new Date(product.createdAt), 'dd/MM/yyyy', { locale: fr })}
                    </p>

                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={cancelEditing}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition"
                        >
                          <X size={16} />
                        </button>
                        <button
                          onClick={() => saveChanges(product)}
                          disabled={updateMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                        >
                          {updateMutation.isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Save size={14} />
                          )}
                          Enregistrer
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditing(product)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition"
                      >
                        <Edit2 size={14} />
                        Modifier
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
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
