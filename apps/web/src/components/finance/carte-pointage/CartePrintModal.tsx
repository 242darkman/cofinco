/**
 * Modale d'aperçu et d'impression d'une carte de pointage.
 *
 * S'appuie sur `useReceiptPDF` (react-to-print) : seul le gabarit
 * `CartePointagePrintTemplate` est imprimé — sidebar, topbar et boutons
 * sont automatiquement exclus du rendu papier.
 */

import React, { useRef } from 'react';
import { Printer } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useReceiptPDF } from '@/hooks/finance/useReceiptPDF';
import type { CartePointageDto } from '@/lib/api-client';
import CartePointagePrintTemplate from './CartePointagePrintTemplate';

interface CartePrintModalProps {
  carte: CartePointageDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CartePrintModal: React.FC<CartePrintModalProps> = ({ carte, isOpen, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { print } = useReceiptPDF({
    filename: carte ? `carte-pointage_${carte.reference}` : 'carte-pointage',
    format: 'a4',
    contentRef: printRef,
  });

  if (!carte) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Imprimer la carte"
      subtitle={carte.reference}
      size="xl"
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Fermer
          </Button>
          <Button icon={Printer} onClick={() => print()} className="flex-1">
            Imprimer
          </Button>
        </div>
      }
    >
      {/* Aperçu fidèle du rendu papier */}
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-edge bg-surface-muted p-3">
        <CartePointagePrintTemplate ref={printRef} carte={carte} />
      </div>
    </Modal>
  );
};

export default CartePrintModal;
