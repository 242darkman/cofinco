import React, { useState, useEffect, useRef } from 'react';
import { Plus, CreditCard, Wallet, Lock, X, Edit2, Trash2, Check, AlertCircle, TrendingUp, AlertTriangle, Unlock } from 'lucide-react';
import { Card, Badge, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { useCompteSubscription } from '../../hooks/useRealTimeSubscription';
import { toast, handleApiError } from '../../lib/toast';

interface CompteBancaire {
  id: string;
  clientId: string;
  client_id?: string;
  typeCompte: 'Courant' | 'Épargne' | 'Bloqué';
  type_compte?: string;
  numeroCompte: string;
  numero_compte?: string;
  soldeCourant: string;
  solde_courant?: string;
  tauxInteret?: number;
  taux_interet?: number;
  dateOuverture?: string;
  date_ouverture?: string;
  statut: 'Actif' | 'Fermé' | 'Suspendu' | 'Clôturé';
  blocageActif?: boolean;
  blocage_actif?: boolean;
  blocageMotif?: string;
  blocage_motif?: string;
  blocageFin?: string;
  blocage_fin?: string;
  createdAt: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface ClientAccountsProps {
  clientId: string;
  agenceId?: string;
}

// Helper to normalize snake_case to camelCase response
function normalizeCompte(c: any): CompteBancaire {
  return {
    id: c.id,
    clientId: c.clientId || c.client_id,
    typeCompte: c.typeCompte || c.type_compte,
    numeroCompte: c.numeroCompte || c.numero_compte || '',
    soldeCourant: c.soldeCourant || c.solde_courant || '0',
    tauxInteret: c.tauxInteret || c.taux_interet || 0,
    dateOuverture: c.dateOuverture || c.date_ouverture,
    statut: c.statut || 'Actif',
    blocageActif: c.blocageActif || c.blocage_actif || false,
    blocageMotif: c.blocageMotif || c.blocage_motif,
    blocageFin: c.blocageFin || c.blocage_fin,
    createdAt: c.createdAt || c.created_at,
    updatedAt: c.updatedAt || c.updated_at,
  };
}

export default function ClientAccounts({ clientId, agenceId }: ClientAccountsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'create');
  const canEditAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'edit');
  const canDeleteAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'delete');
  const canBlockAccounts = hasPermission('comptes', 'edit') || hasPermission('admin', 'all');

  const [comptes, setComptes] = useState<CompteBancaire[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingCompte, setEditingCompte] = useState<CompteBancaire | null>(null);
  const [formData, setFormData] = useState({
    typeCompte: 'Courant' as 'Courant' | 'Épargne' | 'Bloqué',
    soldeInitial: 0,
    tauxInteret: 0,
    statut: 'Actif' as 'Actif' | 'Fermé' | 'Suspendu',
    methodePaiement: 'Espèces' as 'Espèces' | 'Mobile Money' | 'Virement' | 'Carte'
  });

  const isSubmittingRef = useRef(false);

  // Real-time subscription for updates
  useCompteSubscription(comptes[0]?.id, {
    onBalanceChange: () => fetchComptes(),
    onBlocked: () => fetchComptes(),
    onUnblocked: () => fetchComptes(),
  });

  useEffect(() => {
    fetchComptes();
  }, [clientId]);

  const fetchComptes = async () => {
    setLoading(true);
    try {
      // Use the portfolio endpoint to get client's accounts
      const res = await fetch(`/api/clients/${clientId}/portfolio`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement comptes');
      const data = await res.json();
      // Portfolio returns { comptes: [...], credits: [...], ... }
      const comptesData = (data.comptes || []).map(normalizeCompte);
      setComptes(comptesData.sort((a: CompteBancaire, b: CompteBancaire) =>
        new Date(b.dateOuverture || b.createdAt).getTime() - new Date(a.dateOuverture || a.createdAt).getTime()
      ));
    } catch (error) {
      console.error('Erreur chargement comptes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingCompte) {
        setShowForm(false);
        setShowConfirm(true);
        return;
    }

    try {
      // First get current user's agenceId from session if not provided
      let targetAgenceId = agenceId;
      if (!targetAgenceId) {
        const userRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (userRes.ok) {
          const userData = await userRes.json();
          targetAgenceId = userData.agenceId || userData.agence_id;
        }
      }

      const payload = {
        clientId,
        agenceId: targetAgenceId,
        typeCompte: formData.typeCompte,
        soldeInitial: formData.soldeInitial,
        tauxInteret: formData.tauxInteret,
      };

      // Use the new /api/comptes endpoint
      const res = await fetch('/api/comptes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur création compte');
      }

      const newAccount = await res.json();
      setComptes(prev => [normalizeCompte(newAccount), ...prev]);
      resetForm();
      toast.success(`Compte ${newAccount.typeCompte || 'bancaire'} créé avec succès ! N° ${newAccount.numeroCompte || newAccount.numero_compte}`);
    } catch (error) {
      console.error('Erreur souscription compte:', error);
      toast.error(handleApiError(error, 'Erreur lors de la création du compte'));
    }
  };

  const handleConfirmUpdate = async () => {
      if (!editingCompte) return;

      setLoading(true);
      isSubmittingRef.current = true;

      try {
          // Note: PATCH endpoint for comptes not yet implemented
          // For now, show a message that editing requires admin action
          toast.warning("La modification des comptes nécessite une action administrative.");
          toast.info("Veuillez contacter votre superviseur pour effectuer cette opération.");
          resetForm();
          setShowConfirm(false);
      } catch (error) {
          console.error("Update error:", error);
          toast.error(handleApiError(error, 'Erreur lors de la modification'));
          setShowForm(true);
          setShowConfirm(false);
      } finally {
          setLoading(false);
          isSubmittingRef.current = false;
      }
  };

  const handleDelete = async (compteId: string) => {
     toast.warning('La suppression de compte n\'est pas disponible pour des raisons de sécurité.');
     toast.info('Contactez l\'administrateur pour clôturer un compte.');
     // Implement DELETE /api/accounts/:id if needed
  };

  const handleEdit = (compte: CompteBancaire) => {
    setEditingCompte(compte);
    setFormData({
      typeCompte: compte.typeCompte as 'Courant' | 'Épargne' | 'Bloqué',
      soldeInitial: Number(compte.soldeCourant) || 0,
      tauxInteret: compte.tauxInteret || 0,
      statut: compte.statut as 'Actif' | 'Fermé' | 'Suspendu',
      methodePaiement: 'Espèces'
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCompte(null);
    setFormData({
      typeCompte: 'Courant',
      soldeInitial: 0,
      tauxInteret: 0,
      statut: 'Actif',
      methodePaiement: 'Espèces'
    });
  };

  const getCompteIcon = (type: string) => {
    if (type === 'Bloqué') return Lock;
    return type === 'Courant' ? CreditCard : Wallet;
  };

  const getSolde = (compte: CompteBancaire): number => {
    return Number(compte.soldeCourant) || 0;
  };

  return (
    <div className="space-y-4">
      {/* Mobile-First Header */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
            Comptes Bancaires
            <span className="text-xs font-normal text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{comptes.length}</span>
        </h3>
        {canCreateAccounts && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition flex items-center gap-1.5 text-sm shadow-lg shadow-cyan-500/20"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nouveau Compte</span>
            <span className="sm:hidden">Nouveau</span>
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => {
            setShowConfirm(false);
            if (!isSubmittingRef.current && editingCompte) {
                setShowForm(true);
            }
        }}
        onConfirm={handleConfirmUpdate}
        title="Modifier le compte"
        message={
            <div className="space-y-2">
                <p>Êtes-vous sûr de vouloir modifier ce compte ?</p>
                <div className="bg-slate-800/50 p-3 rounded-lg text-sm border border-slate-700/50">
                    <p className="flex justify-between"><span>Type:</span> <span className="font-medium text-white">{formData.typeCompte}</span></p>
                    <p className="flex justify-between"><span>Statut:</span> <span className={`font-medium ${formData.statut === 'Actif' ? 'text-emerald-400' : 'text-red-400'}`}>{formData.statut}</span></p>
                    {formData.typeCompte === 'Épargne' && (
                         <p className="flex justify-between"><span>Taux:</span> <span className="font-medium text-white">{formData.tauxInteret}%</span></p>
                    )}
                </div>
            </div>
        }
        confirmText="Sauvegarder"
        variant="warning"
        isLoading={loading}
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      ) : comptes.length === 0 ? (
        <Card variant="default" padding="lg" className="border-dashed border-slate-700 bg-transparent">
          <div className="text-center">
            <div className="bg-slate-800/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                 <AlertCircle className="text-slate-500" size={24} />
            </div>
            <p className="text-slate-400 text-sm mb-4">Aucun compte bancaire actif</p>
            {canCreateAccounts && (
              <button
                  onClick={() => setShowForm(true)}
                  className="text-cyan-400 hover:text-cyan-300 text-sm font-medium hover:underline"
              >
                  Créer un premier compte
              </button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {comptes.map((compte) => {
            const Icon = getCompteIcon(compte.typeCompte);
            const isEpargne = compte.typeCompte === 'Épargne';
            const isBloque = compte.typeCompte === 'Bloqué' || compte.blocageActif;
            const solde = getSolde(compte);

            return (
              <Card
                key={compte.id}
                variant="default"
                padding="sm"
                className={`hover:border-cyan-500/30 transition-colors group relative overflow-hidden ${isBloque ? 'border-amber-500/30' : ''}`}
              >
                 {/* Decorative background gradient */}
                 {isBloque ? (
                     <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
                 ) : isEpargne ? (
                     <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
                 ) : (
                     <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
                 )}

                <div className="flex items-start justify-between mb-3 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isBloque ? 'bg-amber-500/10 text-amber-400' : isEpargne ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm flex items-center gap-1.5">
                        {compte.typeCompte}
                        {isBloque && <Lock size={12} className="text-amber-400" />}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono tracking-wider">{compte.numeroCompte}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge value={compte.statut} size="sm" />
                    {isBloque && (
                      <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {compte.blocageMotif || 'Bloqué'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative z-10 mb-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-tight mb-0.5">
                      {isBloque ? 'Solde (Bloqué)' : 'Solde Disponible'}
                    </p>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-xl font-bold tracking-tight ${isBloque ? 'text-amber-300' : 'text-white'}`}>
                          {solde.toLocaleString()}
                        </span>
                        <span className="text-xs font-medium text-slate-500">FCFA</span>
                    </div>

                    {isEpargne && (compte.tauxInteret || 0) > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                            <TrendingUp size={10} className="text-emerald-500" />
                            <span className="text-[10px] text-emerald-500 font-medium">+{compte.tauxInteret}% d'intérêts</span>
                        </div>
                    )}

                    {isBloque && compte.blocageFin && (
                        <div className="flex items-center gap-1 mt-1">
                            <Unlock size={10} className="text-amber-500" />
                            <span className="text-[10px] text-amber-500 font-medium">
                              Déblocage: {new Date(compte.blocageFin).toLocaleDateString('fr-FR')}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-slate-700/50 relative z-10">
                  {canEditAccounts ? (
                    <button
                      onClick={() => handleEdit(compte)}
                      className="flex-1 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition flex items-center justify-center gap-1.5"
                    >
                      <Edit2 size={12} /> Modifier
                    </button>
                  ) : (
                    <div className="flex-1 py-1.5 rounded bg-slate-800/50 text-slate-500 text-xs font-medium flex items-center justify-center gap-1.5">
                      <AlertTriangle size={12} /> Lecture seule
                    </div>
                  )}
                  {canDeleteAccounts && (
                    <button
                      onClick={() => handleDelete(compte.id)}
                      className="p-1.5 rounded bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-800/50 border-b border-slate-700 p-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {editingCompte ? 'Modifier le compte' : 'Nouveau compte'}
                </h2>
              </div>
              <button
                onClick={resetForm}
                className="p-1.5 hover:bg-slate-700 rounded-lg transition text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">Type de compte</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, typeCompte: 'Courant' }))}
                    className={`p-3 rounded-lg border transition flex flex-col items-center gap-2 ${
                      formData.typeCompte === 'Courant'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <CreditCard size={20} className={formData.typeCompte === 'Courant' ? 'text-cyan-400' : 'text-slate-500'} />
                    <span className={`text-xs font-medium ${formData.typeCompte === 'Courant' ? 'text-cyan-400' : 'text-slate-400'}`}>Courant</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, typeCompte: 'Épargne' }))}
                    className={`p-3 rounded-lg border transition flex flex-col items-center gap-2 ${
                      formData.typeCompte === 'Épargne'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <Wallet size={20} className={formData.typeCompte === 'Épargne' ? 'text-emerald-400' : 'text-slate-500'} />
                    <span className={`text-xs font-medium ${formData.typeCompte === 'Épargne' ? 'text-emerald-400' : 'text-slate-400'}`}>Épargne</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, typeCompte: 'Bloqué' }))}
                    className={`p-3 rounded-lg border transition flex flex-col items-center gap-2 ${
                      formData.typeCompte === 'Bloqué'
                        ? 'border-amber-500 bg-amber-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <Lock size={20} className={formData.typeCompte === 'Bloqué' ? 'text-amber-400' : 'text-slate-500'} />
                    <span className={`text-xs font-medium ${formData.typeCompte === 'Bloqué' ? 'text-amber-400' : 'text-slate-400'}`}>Bloqué</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Solde initial (FCFA)</label>
                <div className="relative">
                    <input
                    type="number"
                    min="0"
                    value={formData.soldeInitial}
                    onChange={(e) => setFormData(prev => ({ ...prev, soldeInitial: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-12 py-2.5 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-medium">FCFA</span>
                </div>
              </div>

              {formData.soldeInitial > 0 && !editingCompte && (
                  <div className="animate-in slide-in-from-top-2 duration-200">
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Méthode de paiement</label>
                      <select
                          value={formData.methodePaiement}
                          onChange={(e) => setFormData(prev => ({ ...prev, methodePaiement: e.target.value as any }))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition appearance-none"
                      >
                          <option value="Espèces">Espèces</option>
                          <option value="Mobile Money">Mobile Money</option>
                          <option value="Virement">Virement</option>
                          <option value="Carte">Carte</option>
                      </select>
                  </div>
              )}

              {formData.typeCompte === 'Épargne' && (
                <div className="animate-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Taux d'intérêt (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={formData.tauxInteret}
                    onChange={(e) => setFormData(prev => ({ ...prev, tauxInteret: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-emerald-500 outline-none transition"
                  />
                </div>
              )}

              {formData.typeCompte === 'Bloqué' && (
                <div className="animate-in slide-in-from-top-2 duration-200 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-400">
                    <AlertTriangle size={12} className="inline mr-1" />
                    Les comptes bloqués permettent les dépôts mais interdisent les retraits jusqu'au déblocage explicite.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-700 mt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-cyan-500/20"
                >
                  <Check size={16} />
                  {editingCompte ? 'Sauvegarder' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
