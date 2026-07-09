import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Smartphone, Building2, FileCheck, CreditCard, Loader2, AlertTriangle } from 'lucide-react';
import Switch from '../ui/Switch';
import { toast } from 'sonner';

interface PaymentMethodConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
  dbField: string;
}

const PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    key: 'cash',
    label: 'Espèces',
    description: 'Paiements en liquide au guichet',
    icon: Banknote,
    dbField: 'cash_enabled',
  },
  {
    key: 'mobileMoney',
    label: 'Mobile Money',
    description: 'MTN MoMo & Airtel Money',
    icon: Smartphone,
    dbField: 'mobile_money_enabled',
  },
  {
    key: 'transfer',
    label: 'Virement',
    description: 'Virements bancaires entrants/sortants',
    icon: Building2,
    dbField: 'transfer_enabled',
  },
  {
    key: 'check',
    label: 'Chèque',
    description: 'Paiements par chèque bancaire',
    icon: FileCheck,
    dbField: 'check_enabled',
  },
];

export default function AdminPaymentMethodToggles() {
  const queryClient = useQueryClient();
  const [confirmDisable, setConfirmDisable] = useState<PaymentMethodConfig | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/system-settings'],
    queryFn: async () => {
      const res = await fetch('/api/system-settings', { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement paramètres');
      return res.json();
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Erreur mise à jour');
      return res.json();
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['/api/system-settings'] });
      const prev = queryClient.getQueryData(['/api/system-settings']);
      queryClient.setQueryData(['/api/system-settings'], (old: any) => ({
        ...old,
        ...payload,
      }));
      return { prev };
    },
    onSuccess: (_data, payload) => {
      const field = Object.keys(payload)[0];
      const enabled = payload[field];
      const method = PAYMENT_METHODS.find(m => m.dbField === field);
      toast.success(`${method?.label ?? 'Méthode'} ${enabled ? 'activé' : 'désactivé'}`);
    },
    onError: (_err, _payload, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['/api/system-settings'], context.prev);
      }
      toast.error('Erreur lors de la mise à jour');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/system-settings'] });
    },
  });

  const enabledCount = settings
    ? PAYMENT_METHODS.filter(m => settings[m.dbField] !== false).length
    : PAYMENT_METHODS.length;

  const handleToggle = (method: PaymentMethodConfig) => {
    const isEnabled = settings?.[method.dbField] !== false;

    if (isEnabled) {
      // Désactivation : vérifier qu'il reste au moins 1 actif
      if (enabledCount <= 1) {
        toast.error('Au moins un moyen de paiement doit rester actif');
        return;
      }
      // Demander confirmation
      setConfirmDisable(method);
    } else {
      // Activation : pas de confirmation nécessaire
      mutation.mutate({ [method.dbField]: true });
    }
  };

  const confirmAndDisable = () => {
    if (!confirmDisable) return;
    mutation.mutate({ [confirmDisable.dbField]: false });
    setConfirmDisable(null);
  };

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setConfirmDisable(null);
  }, []);

  useEffect(() => {
    if (confirmDisable) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [confirmDisable, handleEscape]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-content-muted" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-accent/10">
          <CreditCard className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h2 className="text-base font-bold text-content-primary">Moyens de paiement</h2>
          <p className="text-xs text-content-muted">
            {enabledCount}/{PAYMENT_METHODS.length} actifs — Les changements sont appliqués instantanément
          </p>
        </div>
      </div>

      {/* Toggle Cards */}
      <div className="bg-card border border-card-border rounded-xl divide-y divide-edge-subtle overflow-hidden">
        {PAYMENT_METHODS.map((method) => {
          const Icon = method.icon;
          const isEnabled = settings?.[method.dbField] !== false;
          const isLastEnabled = isEnabled && enabledCount <= 1;
          const isToggling = mutation.isPending;

          return (
            <div
              key={method.key}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-subtle/50"
            >
              <div className={`p-2 rounded-lg transition-colors ${
                isEnabled ? 'bg-status-success-bg text-status-success' : 'bg-surface-subtle text-content-muted'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold transition-colors ${
                  isEnabled ? 'text-content-primary' : 'text-content-muted'
                }`}>
                  {method.label}
                </p>
                <p className="text-xs text-content-muted truncate">{method.description}</p>
              </div>
              <Switch
                checked={isEnabled}
                onChange={() => handleToggle(method)}
                disabled={isToggling || isLastEnabled}
                size="sm"
                ariaLabel={`${isEnabled ? 'Désactiver' : 'Activer'} ${method.label}`}
              />
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-content-muted text-center">
        La désactivation masque le moyen de paiement sur toutes les interfaces (caisse, agents, crédits, comptes).
      </p>

      {/* Confirmation Dialog */}
      {confirmDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDisable(null)}>
          <div className="bg-card border border-card-border rounded-xl shadow-xl max-w-sm w-full mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-status-warning-bg">
                <AlertTriangle className="w-5 h-5 text-status-warning" />
              </div>
              <h3 className="text-sm font-bold text-content-primary">Confirmer la désactivation</h3>
            </div>
            <p className="text-sm text-content-secondary">
              Désactiver <span className="font-semibold">{confirmDisable.label}</span> masquera ce moyen de paiement sur toutes les interfaces (caisse, agents, crédits, comptes).
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDisable(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-edge text-content-secondary hover:bg-surface-subtle transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmAndDisable}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-status-danger text-white hover:bg-status-danger/90 transition-colors"
              >
                Désactiver
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
