import React, { useState, useEffect, useRef } from 'react';
import { Plus, Check, AlertCircle, AlertTriangle, X } from 'lucide-react';
import { Card, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { useCompteSubscription } from '../../hooks/useRealTimeSubscription';
import { toast, handleApiError } from '../../lib/toast';
import AccountCard from './AccountCard';
import AccountHistory from './AccountHistory';
import { StatutCompte, type StatutCompteType, TypeCompte, MethodePaiement } from '@shared/enum/status-constants';

// Mapping FR → EN pour envoi backend
const TYPE_COMPTE_TO_EN: Record<string, string> = {
  'Courant': TypeCompte.CURRENT,
  'Épargne': TypeCompte.SAVINGS,
  'Bloqué': TypeCompte.BLOCKED,
};

// Mapping EN → FR pour affichage UI
const TYPE_COMPTE_TO_FR: Record<string, string> = {
  [TypeCompte.CURRENT]: 'Courant',
  [TypeCompte.SAVINGS]: 'Épargne',
  [TypeCompte.BLOCKED]: 'Bloqué',
};

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
  statut: StatutCompteType; // Strict EN only
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
  // Convert EN typeCompte from backend to FR for UI display
  const rawType = c.typeCompte || '';
  const typeCompte = TYPE_COMPTE_TO_FR[rawType] || rawType;

  return {
    id: c.id,
    clientId: c.clientId,
    typeCompte: typeCompte as 'Courant' | 'Épargne' | 'Bloqué',
    numeroCompte: c.numeroCompte || '',
    soldeCourant: c.soldeCourant || '0',
    tauxInteret: c.tauxInteret || 0,
    dateOuverture: c.dateOuverture,
    statut: c.statut || StatutCompte.ACTIVE,
    blocageActif: c.blocageActif || false,
    blocageMotif: c.blocageMotif,
    blocageFin: c.blocageFin,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default function ClientAccounts({ clientId, agenceId }: ClientAccountsProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'create');
  const canEditAccounts = hasPermission('clients', 'edit') || hasPermission('comptes', 'edit');
  
  const [comptes, setComptes] = useState<CompteBancaire[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  // Action states
  const [showConfirm, setShowConfirm] = useState(false);
  const [showActionConfirm, setShowActionConfirm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<CompteBancaire | null>(null);
  const [pendingAction, setPendingAction] = useState<'suspend' | 'close' | 'reactivate' | null>(null);
  const [actionReason, setActionReason] = useState('');

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyCompte, setHistoryCompte] = useState<CompteBancaire | null>(null);

  const [editingCompte, setEditingCompte] = useState<CompteBancaire | null>(null);
  const [formData, setFormData] = useState({
    typeCompte: 'Courant' as 'Courant' | 'Épargne' | 'Bloqué',
    soldeInitial: 0,
    tauxInteret: 0,
    statut: StatutCompte.ACTIVE as StatutCompteType,
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
      const res = await fetch(`/api/clients/${clientId}/portfolio`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement comptes');
      const data = await res.json();
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
      let targetAgenceId = agenceId;
      if (!targetAgenceId) {
        const userRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (userRes.ok) {
          const userData = await userRes.json();
          targetAgenceId = userData.agenceId;
        }
      }

      const payload = {
        clientId,
        agenceId: targetAgenceId,
        typeCompte: TYPE_COMPTE_TO_EN[formData.typeCompte] || formData.typeCompte, // Convert FR to EN
        soldeInitial: formData.soldeInitial,
        tauxInteret: formData.tauxInteret,
      };

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
      toast.success(`Compte ${newAccount.typeCompte || 'bancaire'} créé avec succès !`);
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
          toast.warning("La modification des comptes est restreinte.");
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

  const handleAccountAction = (action: 'suspend' | 'close' | 'details' | 'history', compte: CompteBancaire) => {
      setSelectedAccount(compte);
      
      if (action === 'suspend') {
          setPendingAction(compte.statut === StatutCompte.SUSPENDED ? 'reactivate' : 'suspend');
          setShowActionConfirm(true);
      } else if (action === 'close') {
          setPendingAction('close');
          setShowActionConfirm(true);
      } else if (action === 'details') {
          toast.info(`Détails du compte ${compte.numeroCompte}`);
      } else if (action === 'history') {
          setHistoryCompte(compte);
          setShowHistory(true);
      }
  };

  const executeAccountAction = async () => {
      if (!selectedAccount || !pendingAction) return;
      
      try {
          if (pendingAction === 'close') {
            toast.warning("La clôture de compte n'est pas encore automatisée.");
            toast.info("Veuillez contacter l'administrateur système.");
            setShowActionConfirm(false);
            return;
          }

          const endpoint = pendingAction === 'suspend' 
            ? `/api/comptes/${selectedAccount.id}/bloquer`
            : `/api/comptes/${selectedAccount.id}/debloquer`;

          // Map 'Autre' as default motif if not specified strictly in UI
          const motif = actionReason || 'Autre';

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ motif })
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Erreur lors de l\'opération');
          }
          
          const actionLabel = pendingAction === 'suspend' ? 'suspendu' : 'réactivé';
          toast.success(`Le compte a été ${actionLabel} avec succès.`);
          
          await fetchComptes(); // Refresh list to get updated status
          
          setShowActionConfirm(false);
          setSelectedAccount(null);
          setPendingAction(null);
          setActionReason('');
      } catch (error) {
          console.error("Status change error:", error);
          toast.error(handleApiError(error, "Erreur lors du changement de statut"));
      }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingCompte(null);
    setFormData({
      typeCompte: 'Courant',
      soldeInitial: 0,
      tauxInteret: 0,
      statut: StatutCompte.ACTIVE,
      methodePaiement: 'Espèces'
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
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
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmUpdate}
        title="Modifier le compte"
        message="Êtes-vous sûr ?"
        confirmText="Sauvegarder"
        variant="warning"
        isLoading={loading}
      />

        {/* Change Status Dialog */}
       <ConfirmDialog
        isOpen={showActionConfirm}
        onClose={() => setShowActionConfirm(false)}
        onConfirm={executeAccountAction}
        title={pendingAction === 'suspend' ? "Suspendre le compte" : pendingAction === 'close' ? "Clôturer le compte" : "Réactiver le compte"}
        message={
            <div className="space-y-3">
                <p>
                    {pendingAction === 'suspend' 
                        ? "Le compte sera bloqué pour toutes les opérations de débit. Les crédits resteront possibles."
                        : pendingAction === 'close'
                        ? "Attention : La clôture est définitive. Le solde doit être à zéro avant de procéder."
                        : "Le compte sera de nouveau pleinement opérationnel."}
                </p>
                {(pendingAction === 'suspend' || pendingAction === 'close') && (
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Motif de l'action *</label>
                        <input 
                            type="text" 
                            className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-white"
                            placeholder="Ex: Fraude suspicion, Demande client..."
                            value={actionReason}
                            onChange={(e) => setActionReason(e.target.value)}
                        />
                    </div>
                )}
            </div>
        }
        confirmText={pendingAction === 'suspend' ? "Suspendre" : pendingAction === 'close' ? "Clôturer" : "Réactiver"}
        variant={pendingAction === 'close' ? "danger" : "warning"}
        isLoading={loading}
        disabled={(pendingAction === 'suspend' || pendingAction === 'close') && !actionReason.trim()}
      />

      {/* Account History Modal */}
      {showHistory && historyCompte && (
        <AccountHistory
            compteId={historyCompte.id}
            numeroCompte={historyCompte.numeroCompte}
            isOpen={showHistory}
            onClose={() => setShowHistory(false)}
        />
      )}

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
          {comptes.map((compte) => (
             <AccountCard 
                key={compte.id}
                compte={compte}
                onAction={handleAccountAction}
                onEdit={(c) => { setEditingCompte(c); setShowForm(true); }}
             />
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-800/50 border-b border-slate-700 p-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {editingCompte ? 'Détails du compte' : 'Nouveau compte'}
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
               {/* Read-only details for verify */}
               {editingCompte && (
                   <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-4">
                       <p className="text-sm text-blue-300 flex gap-2">
                           <AlertCircle size={16} />
                           Pour modifier le solde, veuillez effectuer une opération de caisse (Dépôt/Retrait).
                       </p>
                   </div>
               )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase">Type de compte</label>
                {/* Type selection logic same as before but disabled if editing */}
                 <div className="grid grid-cols-3 gap-2">
                  {['Courant', 'Épargne', 'Bloqué']
                    .filter(type => {
                        const normalizedType = type.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        return !comptes.some(c => {
                             const cType = (c.typeCompte || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                             const isSameType = cType === normalizedType;
                             // Only closed/cancelled accounts are excluded
                             const closedStatuses: string[] = [StatutCompte.CLOSED, StatutCompte.CANCELLED];
                             const isActive = !closedStatuses.includes(c.statut);
                             return isSameType && isActive;
                        });
                    })
                    .map((type) => (
                    <button
                        key={type}
                        type="button"
                        disabled={!!editingCompte} 
                        onClick={() => setFormData(prev => ({ ...prev, typeCompte: type as any }))}
                        className={`p-3 rounded-lg border transition flex flex-col items-center gap-2 ${
                        formData.typeCompte === type
                            ? 'border-cyan-500 bg-cyan-500/10'
                            : 'border-slate-700 bg-slate-800/50'
                        } ${editingCompte ? 'opacity-50 cursor-not-allowed' : 'hover:border-slate-600'}`}
                    >
                        <span className={`text-xs font-medium ${formData.typeCompte === type ? 'text-cyan-400' : 'text-slate-400'}`}>{type}</span>
                    </button>
                  ))}
                 </div>
              </div>

              {/* Solde Initial - ONLY for NEW accounts */}
              {!editingCompte ? (
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
              ) : (
                   <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">Solde Actuel (FCFA)</label>
                    <div className="relative">
                        <input
                        type="text"
                        disabled
                        value={Number(editingCompte.soldeCourant).toLocaleString()}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-12 py-2.5 text-slate-400 text-sm cursor-not-allowed"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-600 font-medium">FCFA</span>
                    </div>
                  </div>
              )}

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
                  Fermer
                </button>
                {!editingCompte && (
                    <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-cyan-500/20"
                    >
                    <Check size={16} />
                    Créer
                    </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
