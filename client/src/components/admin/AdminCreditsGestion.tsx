import React from 'react';
import { CreditCard } from 'lucide-react';
import AdminCreditPlansGestion from './AdminCreditPlansGestion';

export default function AdminCreditsGestion() {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 mx-[-8px] sm:mx-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-status-info-bg rounded-lg">
            <CreditCard className="text-status-info" size={18} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-content-primary">Administration Crédits</h2>
            <p className="text-[10px] sm:text-xs text-content-muted">Gérer les plans et produits de crédit</p>
          </div>
        </div>
      </div>

      <AdminCreditPlansGestion />
    </div>
  );
}
