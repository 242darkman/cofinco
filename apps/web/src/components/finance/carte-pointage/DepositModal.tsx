/**
 * Modale de versement — pointe la case suivante d'une carte.
 *
 * Le montant est toujours le montant unitaire M figé à l'ouverture.
 * Espèces : nécessite une caisse ouverte côté serveur (erreur métier sinon).
 * L'idempotence est garantie par une clé générée à l'ouverture de la modale.
 */

import React, { useMemo, useState } from 'react';
import { Banknote, Smartphone } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CartePointageDto } from '@/lib/api-client';
import { useDeposerCartePointage, generateIdempotencyKey } from '@/hooks/use-cartes-pointage';
import { NOMBRE_CASES } from './SlotGrid';

type PaymentMethod = 'CASH' | 'MOBILE_MONEY';

interface DepositModalProps {
  carte: CartePointageDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({ carte, isOpen, onClose }) => {
  const { toast } = useToast();
  const { fmt } = useCurrency();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const deposer = useDeposerCartePointage();

  // Clé d'idempotence stable pour la durée d'ouverture de la modale :
  // un double-clic ou un retry réseau ne crée jamais deux versements.
  const idempotencyKey = useMemo(
    () => generateIdempotencyKey('cdp-dep'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, carte?.id],
  );

  if (!carte) return null;
  const prochaineCase = carte.completedSlots + 1;

  const handleSubmit = () => {
    deposer.mutate(
      { cardId: carte.id, paymentMethod, idempotencyKey },
      {
        onSuccess: () => {
          toast({
            title: 'Versement enregistré',
            description: `Case ${prochaineCase}/${NOMBRE_CASES} pointée (${fmt(carte.unitAmount)})`,
            variant: 'success',
          });
          onClose();
        },
        onError: (error) => {
          toast({ title: 'Versement refusé', description: error.message, variant: 'destructive' });
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
      title="Effectuer un versement"
      subtitle={`Carte ${carte.reference}`}
      size="sm"
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={deposer.isPending}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} className="flex-1" isLoading={deposer.isPending}>
            Pointer la case {prochaineCase}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-muted p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-content-secondary">Montant du versement</span>
            <span className="font-bold text-content-primary">{fmt(carte.unitAmount)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-content-secondary">Case à pointer</span>
            <span className="font-semibold text-content-primary">
              {prochaineCase} / {NOMBRE_CASES}
            </span>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-content-primary">Méthode de paiement</legend>
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
          {paymentMethod === 'CASH' && (
            <p className="mt-2 text-xs text-content-muted">
              Une session de caisse ouverte est requise : le montant crédite votre caisse.
            </p>
          )}
        </fieldset>
      </div>
    </Modal>
  );
};

export default DepositModal;
