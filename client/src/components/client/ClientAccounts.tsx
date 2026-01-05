import React, { useState, useEffect, useRef } from 'react';
import { Plus, CreditCard, Wallet, X, Edit2, Trash2, Check, AlertCircle, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, Badge, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';

interface CompteBancaire {
  id: string;
  clientId: string;
  typeCompte: 'Courant' | 'Épargne';
  numeroCompte: string;
  solde: number;
  tauxInteret: number;
  dateOuverture: string;
  statut: 'Actif' | 'Fermé' | 'Suspendu';
  createdAt: string;
  updatedAt: string;
}

interface ClientAccountsProps {
  clientId: string;
}

export default function ClientAccounts({ clientId }: ClientAccountsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'create');
  const canEditAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'edit');
  const canDeleteAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'delete');

  const [comptes, setComptes] = useState<CompteBancaire[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editingCompte, setEditingCompte] = useState<CompteBancaire | null>(null);
  const [formData, setFormData] = useState({
    typeCompte: 'Courant' as 'Courant' | 'Épargne',
    solde: 0,
    tauxInteret: 0,
    statut: 'Actif' as 'Actif' | 'Fermé' | 'Suspendu'
  });
  
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    fetchComptes();
  }, [clientId]);

  const fetchComptes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/accounts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement comptes');
      const data = await res.json();
      setComptes(data.sort((a: CompteBancaire, b: CompteBancaire) => 
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
      const payload = {
        typeCompte: formData.typeCompte,
        soldeInitial: formData.solde,
        tauxInteret: formData.tauxInteret,
        statut: formData.statut
      };

      const res = await fetch(`/api/clients/${clientId}/accounts`, {
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
      setComptes(prev => [newAccount, ...prev]);
      resetForm();
    } catch (error) {
      console.error('Erreur souscription compte:', error);
      alert(error instanceof Error ? error.message : 'Erreur inconnue');
    }
  };

  const handleConfirmUpdate = async () => {
      if (!editingCompte) return;

      setLoading(true);
      isSubmittingRef.current = true;

      try {
          const res = await fetch(`/api/clients/${clientId}/accounts/${editingCompte.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                  typeCompte: formData.typeCompte,
                  tauxInteret: formData.tauxInteret,
                  statut: formData.statut,
                  solde: formData.solde
              })
          });

          if (!res.ok) throw new Error('Erreur modification');
          
          const updated = await res.json();
          setComptes(prev => prev.map(c => c.id === updated.id ? updated : c));
          resetForm();
          setShowConfirm(false);
      } catch (error) {
          console.error("Update error:", error);
          alert("Erreur lors de la modification");
          setShowForm(true); // Re-open form on error
          setShowConfirm(false);
      } finally {
          setLoading(false);
          isSubmittingRef.current = false;
      }
  };

  const handleDelete = async (compteId: string) => {
     if (!confirm('Action non supportée pour le moment sur la nouvelle API (sécurité).')) return;
     // Implement DELETE /api/accounts/:id if needed
  };

  const handleEdit = (compte: CompteBancaire) => {
    setEditingCompte(compte);
    setFormData({
      typeCompte: compte.typeCompte,
      solde: compte.solde,
      tauxInteret: compte.tauxInteret,
      statut: compte.statut
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCompte(null);
    setFormData({
      typeCompte: 'Courant',
      solde: 0,
      tauxInteret: 0,
      statut: 'Actif'
    });
  };

  const getCompteIcon = (type: string) => {
    return type === 'Courant' ? CreditCard : Wallet;
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

            return (
              <Card 
                key={compte.id}
                variant="default"
                padding="sm" // Compact padding
                className="hover:border-cyan-500/30 transition-colors group relative overflow-hidden"
              >
                 {/* Decorative background gradient */}
                 {isEpargne ? (
                     <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
                 ) : (
                     <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
                 )}

                <div className="flex items-start justify-between mb-3 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isEpargne ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm">{compte.typeCompte}</h4>
                      <p className="text-[10px] text-slate-500 font-mono tracking-wider">{compte.numeroCompte}</p>
                    </div>
                  </div>
                  <Badge value={compte.statut} size="sm" />
                </div>

                <div className="relative z-10 mb-3">
                    <p className="text-[10px] text-slate-500 uppercase tracking-tight mb-0.5">Solde Disponible</p>
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-white tracking-tight">{compte.solde.toLocaleString()}</span>
                        <span className="text-xs font-medium text-slate-500">FCFA</span>
                    </div>
                    
                    {isEpargne && compte.tauxInteret > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                            <TrendingUp size={10} className="text-emerald-500" />
                            <span className="text-[10px] text-emerald-500 font-medium">+{compte.tauxInteret}% d'intérêts</span>
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
                <div className="grid grid-cols-2 gap-3">
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
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Solde initial (FCFA)</label>
                <div className="relative">
                    <input
                    type="number"
                    min="0"
                    value={formData.solde}
                    onChange={(e) => setFormData(prev => ({ ...prev, solde: Number(e.target.value) }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-12 py-2.5 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-medium">FCFA</span>
                </div>
              </div>

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

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Statut</label>
                <select
                  value={formData.statut}
                  onChange={(e) => setFormData(prev => ({ ...prev, statut: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition appearance-none"
                >
                  <option value="Actif">Actif</option>
                  <option value="Suspendu">Suspendu</option>
                  <option value="Fermé">Fermé</option>
                </select>
              </div>

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
