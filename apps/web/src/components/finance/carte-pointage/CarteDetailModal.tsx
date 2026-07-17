/**
 * Modale de détail — carte virtuelle plein format + historique des transactions.
 */

import React from 'react';
import Modal from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrency } from '@/contexts/CurrencyContext';
import type { CartePointageDto } from '@/lib/api-client';
import { useCartePointageDetail } from '@/hooks/use-cartes-pointage';
import CarteVirtuelle from './CarteVirtuelle';

interface CarteDetailModalProps {
  carte: CartePointageDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CarteDetailModal: React.FC<CarteDetailModalProps> = ({ carte, isOpen, onClose }) => {
  const { fmt } = useCurrency();
  const { data, isLoading } = useCartePointageDetail(isOpen && carte ? carte.id : null);

  if (!carte) return null;
  const carteAffichee = data ? { ...carte, ...data.carte } : carte;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Carte de pointage" subtitle={carte.reference} size="lg">
      <div className="space-y-4">
        <CarteVirtuelle carte={carteAffichee} />

        <div>
          <h3 className="mb-2 text-sm font-semibold text-content-primary">Historique des opérations</h3>
          {isLoading ? (
            <Skeleton className="h-20 rounded-lg" />
          ) : !data || data.transactions.length === 0 ? (
            <p className="text-sm text-content-muted">Aucune opération pour le moment.</p>
          ) : (
            <ul className="divide-y divide-edge rounded-lg border border-edge">
              {data.transactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between p-2.5 text-sm">
                  <div>
                    <span
                      className={`font-medium ${
                        t.type === 'DEPOSIT' ? 'text-status-success' : 'text-status-danger'
                      }`}
                    >
                      {t.type === 'DEPOSIT' ? `Versement — case ${t.slotNumber}` : 'Retrait (clôture)'}
                    </span>
                    <span className="ml-2 text-xs text-content-muted">
                      {new Date(t.createdAt).toLocaleString('fr-FR')} · {t.paymentMethod === 'CASH' ? 'Espèces' : 'Mobile Money'}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-content-primary">
                      {t.type === 'DEPOSIT' ? '+' : '−'} {fmt(t.amount)}
                    </p>
                    {t.type === 'WITHDRAWAL' && Number(t.commissionAmount) > 0 && (
                      <p className="text-xs text-content-muted">Frais de gestion : {fmt(t.commissionAmount)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CarteDetailModal;
