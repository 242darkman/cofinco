/**
 * Modale de retrait — clôture définitive d'une carte de pointage.
 *
 * Affiche la répartition contractuelle avant confirmation :
 * total collecté M×N, montant restitué A = M×N − M, retenue M (frais de
 * gestion de caisse). Retrait bloqué tant que N < 2 (le client recevrait 0).
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Banknote, Smartphone } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CartePointageDto } from '@/lib/api-client';
import { useRetirerCartePointage, generateIdempotencyKey } from '@/hooks/use-cartes-pointage';
import {
  calculerRetraitCartePointage,
  peutRetirer,
  MIN_VERSEMENTS_POUR_RETRAIT,
} from '@shared/utils/carte-pointage';

type PaymentMethod = 'CASH' | 'MOBILE_MONEY';

interface WithdrawModalProps {
  carte: CartePointageDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ carte, isOpen, onClose }) => {
  const { toast } = useToast();
  const { fmt } = useCurrency();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const retirer = useRetirerCartePointage();

  const idempotencyKey = useMemo(
    () => generateIdempotencyKey('cdp-ret'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, carte?.id],
  );

  // Répartition calculée avec les règles partagées (mêmes montants que le serveur).
  const repartition = useMemo(() => {
    if (!carte || !peutRetirer(carte.completedSlots)) return null;
    return calculerRetraitCartePointage(carte.unitAmount, carte.completedSlots);
  }, [carte]);

  if (!carte) return null;
  const retraitAutorise = repartition !== null;

  const handleSubmit = () => {
    retirer.mutate(
      { cardId: carte.id, paymentMethod, idempotencyKey },
      {
        onSuccess: (resultat) => {
          toast({
            title: 'Retrait effectué — carte clôturée',
            description: `Client : ${fmt(resultat.montantClient)} — Frais de gestion : ${fmt(resultat.commission)}`,
            variant: 'success',
          });
          onClose();
        },
        onError: (error) => {
          toast({ title: 'Retrait refusé', description: error.message, variant: 'destructive' });
        },
      },
    );
  };

  const methodes: Array<{ value: PaymentMethod; label: string; icon: typeof Banknote }> = [
    { value: 'CASH', label: 'Espèces', icon: Banknote },
    { value: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Demander un retrait"
      subtitle={`Carte ${carte.reference}`}
      size="sm"
      variant="warning"
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={retirer.isPending}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={handleSubmit}
            className="flex-1"
            isLoading={retirer.isPending}
            disabled={!retraitAutorise}
          >
            Confirmer le retrait
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!retraitAutorise ? (
          <div className="flex items-start gap-2 rounded-lg bg-status-warning-bg p-3 text-sm text-status-warning-text">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Au moins {MIN_VERSEMENTS_POUR_RETRAIT} versements sont requis pour un retrait
              (actuellement {carte.completedSlots}). Avec un seul versement, le montant restitué serait nul.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-surface-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-content-secondary">Total collecté ({carte.completedSlots} versements)</span>
                <span className="font-semibold text-content-primary">{fmt(repartition.totalCollecte)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-content-secondary">Frais de gestion (1 échéance)</span>
                <span className="font-semibold text-status-danger">− {fmt(repartition.commission)}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-edge pt-2">
                <span className="font-medium text-content-primary">Montant restitué au client</span>
                <span className="text-base font-bold text-status-success">{fmt(repartition.montantClient)}</span>
              </div>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-content-primary">Versement au client via</legend>
              <div className="grid grid-cols-2 gap-2">
                {methodes.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentMethod(value)}
                    aria-pressed={paymentMethod === value}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                      paymentMethod === value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-edge text-content-secondary hover:bg-surface-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex items-start gap-2 rounded-lg bg-status-warning-bg p-3 text-xs text-status-warning-text">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Cette opération est définitive : la carte sera clôturée et archivée.
                Les frais de gestion sont comptabilisés dans la caisse de l'agent validateur.
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default WithdrawModal;
