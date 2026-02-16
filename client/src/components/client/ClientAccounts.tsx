import React, { useState, useEffect } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { Card, ConfirmDialog } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { useCan } from '../../contexts/AbilityContext';
import { useCompteSubscription } from '../../hooks/useRealTimeSubscription';
import { toast, handleApiError } from '../../lib/toast';
import AccountCard from './AccountCard';
import AccountHistory from './AccountHistory';
import SuspendAccountModal from './SuspendAccountModal';
import ClosureWizard from './ClosureWizard';
import EpargneAccountForm from '../finance/epargne/EpargneAccountForm';
import { StatutCompte, type StatutCompteType, TypeCompte } from '@shared/enum/status-constants';
import { Actions } from '@shared/ability/actions';
import { Subjects } from '@shared/ability/subjects';

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

  // Granular CASL permissions for account lifecycle
  const canSuspend = useCan(Actions.SUSPEND, Subjects.COMPTE);
  const canUnsuspend = useCan(Actions.UNSUSPEND, Subjects.COMPTE);
  const canCloseInitiate = useCan(Actions.CLOSE_INITIATE, Subjects.COMPTE);
  const canCloseCancel = useCan(Actions.CLOSE_CANCEL, Subjects.COMPTE);

  const [comptes, setComptes] = useState<CompteBancaire[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAccountWizard, setShowAccountWizard] = useState(false);

  // Action states
  const [selectedAccount, setSelectedAccount] = useState<CompteBancaire | null>(null);

  // Suspend modal
  const [showSuspendModal, setShowSuspendModal] = useState(false);

  // Unsuspend confirm
  const [showUnsuspendConfirm, setShowUnsuspendConfirm] = useState(false);

  // Closure wizard
  const [showClosureWizard, setShowClosureWizard] = useState(false);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyCompte, setHistoryCompte] = useState<CompteBancaire | null>(null);

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

  const handleAccountAction = (action: 'suspend' | 'unsuspend' | 'close' | 'cancel_closure' | 'history' | 'activate', compte: CompteBancaire) => {
      setSelectedAccount(compte);

      if (action === 'activate') {
          toast.info('Ce compte est en attente de paiement. Rendez-vous à la caisse pour encaisser le dépôt initial.');
          setSelectedAccount(null);
      } else if (action === 'suspend') {
          setShowSuspendModal(true);
      } else if (action === 'unsuspend') {
          setShowUnsuspendConfirm(true);
      } else if (action === 'close' || action === 'cancel_closure') {
          // ClosureWizard handles both: new requests and viewing/cancelling existing ones
          setShowClosureWizard(true);
      } else if (action === 'history') {
          setHistoryCompte(compte);
          setShowHistory(true);
      }
  };

  const handleUnsuspend = async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`/api/comptes/${selectedAccount.id}/unsuspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ motif: 'Levée manuelle de suspension' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Erreur lors de la levée de suspension');
      }
      toast.success('Suspension levée avec succès. Le compte est de nouveau actif.');
      await fetchComptes();
      setShowUnsuspendConfirm(false);
      setSelectedAccount(null);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la levée de suspension'));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-content-primary flex items-center gap-2">
            Comptes Bancaires
            <span className="text-xs font-normal text-content-muted bg-surface px-2 py-0.5 rounded-full">{comptes.length}</span>
        </h3>
        {canCreateAccounts && (
          <button
            onClick={() => setShowAccountWizard(true)}
            className="px-3 py-1.5 bg-accent-secondary hover:bg-accent-secondary-hover text-white rounded-lg transition flex items-center gap-1.5 text-sm shadow-lg shadow-accent/20"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Nouveau Compte</span>
            <span className="sm:hidden">Nouveau</span>
          </button>
        )}
      </div>

      {/* Suspend Account Modal */}
      {selectedAccount && (
        <SuspendAccountModal
          isOpen={showSuspendModal}
          onClose={() => { setShowSuspendModal(false); setSelectedAccount(null); }}
          compteId={selectedAccount.id}
          numeroCompte={selectedAccount.numeroCompte}
          onSuccess={fetchComptes}
        />
      )}

      {/* Unsuspend Confirm Dialog */}
      <ConfirmDialog
        isOpen={showUnsuspendConfirm}
        onClose={() => { setShowUnsuspendConfirm(false); setSelectedAccount(null); }}
        onConfirm={handleUnsuspend}
        title="Lever la suspension"
        message={
          <div className="space-y-2">
            <p>Le compte <span className="font-mono text-content-primary">{selectedAccount?.numeroCompte}</span> sera de nouveau pleinement opérationnel.</p>
            <p className="text-sm text-content-muted">Toutes les opérations (dépôts et retraits) seront réactivées.</p>
          </div>
        }
        confirmText="Lever la suspension"
        variant="success"
        isLoading={loading}
      />

      {/* Closure Wizard */}
      {selectedAccount && (
        <ClosureWizard
          isOpen={showClosureWizard}
          onClose={() => { setShowClosureWizard(false); setSelectedAccount(null); }}
          compteId={selectedAccount.id}
          numeroCompte={selectedAccount.numeroCompte}
          soldeCourant={selectedAccount.soldeCourant}
          onSuccess={fetchComptes}
        />
      )}

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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      ) : comptes.length === 0 ? (
        <Card variant="default" padding="lg" className="border-dashed border-edge bg-transparent">
          <div className="text-center">
            <div className="bg-surface/50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                 <AlertCircle className="text-content-muted" size={24} />
            </div>
            <p className="text-content-muted text-sm mb-4">Aucun compte bancaire actif</p>
            {canCreateAccounts && (
              <button
                  onClick={() => setShowAccountWizard(true)}
                  className="text-accent hover:text-accent text-sm font-medium hover:underline"
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
                canSuspend={canSuspend}
                canUnsuspend={canUnsuspend}
                canCloseInitiate={canCloseInitiate}
                canCloseCancel={canCloseCancel}
             />
          ))}
        </div>
      )}

      {/* Account Creation Wizard */}
      {showAccountWizard && (
        <EpargneAccountForm
          clientId={clientId}
          onClose={() => setShowAccountWizard(false)}
          onSuccess={() => {
            setShowAccountWizard(false);
            fetchComptes();
          }}
        />
      )}
    </div>
  );
}
