/**
 * Bouton pour générer le rapport PDF de clôture de session caisse
 * Ouvre un aperçu modal avec options d'impression et téléchargement
 */

import React, { useState } from 'react';
import { FileDown } from 'lucide-react';
import Button from '../../ui/Button';
import { type ClosureReportData } from '../../../hooks/finance/useClosurePDF';
import { ClosingReportViewer } from './ClosingReportViewer';
import { SessionCaisse } from '../../../types/finance';

interface ClosureReportButtonProps {
  session: SessionCaisse;
  billetage?: Record<string, number>;
  montantVersCoffre?: number;
  montantReporte?: number;
  ecartJustification?: string;
  observations?: string;
  mmReconciliation?: ClosureReportData['mmReconciliation'];
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
}

export default function ClosureReportButton({
  session,
  billetage = {},
  montantVersCoffre = 0,
  montantReporte = 0,
  ecartJustification,
  observations,
  mmReconciliation,
  variant = 'outline',
  size = 'sm',
  className = '',
  showLabel = true,
}: ClosureReportButtonProps) {
  const [showViewer, setShowViewer] = useState(false);
  const [reportData, setReportData] = useState<ClosureReportData | null>(null);

  const handleOpen = () => {
    // Normalize session fields
    const soldeOuverture = Number(
      session.montantOuverture ||
      session.soldeInitial ||
      0
    );
    const soldeTheorique = Number(
      session.montantFermetureTheorique ||
      session.soldeTheorique ||
      0
    );
    const soldePhysique = Number(
      session.montantPhysique ||
      session.soldeReel ||
      0
    ) || calculateBilletageTotal(billetage);

    const openedAt = session.openedAt || new Date().toISOString();
    const closedAt = session.closedAt || new Date().toISOString();

    // Calculate totals from operations if available
    let totalEntrees = 0;
    let totalSorties = 0;
    if (session.operations && Array.isArray(session.operations)) {
      for (const op of session.operations) {
        const montant = Number(op.montant || 0);
        const type = (op.typeOperation || '').toLowerCase();
        if (type.includes('retrait') || type.includes('sortie') || type.includes('disbursement')) {
          totalSorties += montant;
        } else {
          totalEntrees += montant;
        }
      }
    } else {
      // Fallback calculation
      totalEntrees = Math.max(0, soldeTheorique - soldeOuverture);
      totalSorties = Math.max(0, totalEntrees - (soldeTheorique - soldeOuverture));
    }

    const data: ClosureReportData = {
      sessionId: session.id,
      caisseNom: session.caisseNom || 'Caisse',
      agenceNom: session.agenceNom || 'Agence',
      agenceCode: session.agenceCode,
      caissierNom: session.caissierNom || 'Caissier',
      caissierId: session.caissierId || '',
      openedAt,
      closedAt,
      soldeOuverture,
      totalEntrees,
      totalSorties,
      soldeTheorique,
      soldePhysique,
      ecart: soldePhysique - soldeTheorique,
      ecartJustification,
      billetage,
      montantVersCoffre,
      montantReporte,
      mmReconciliation,
      observations,
    };

    setReportData(data);
    setShowViewer(true);
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleOpen}
        className={className}
        icon={FileDown}
      >
        {showLabel && 'Rapport PDF'}
      </Button>

      {showViewer && reportData && (
        <ClosingReportViewer
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          data={reportData}
        />
      )}
    </>
  );
}

function calculateBilletageTotal(billetage: Record<string, number>): number {
  const denominations: Record<string, number> = {
    billets_10000: 10000,
    billets_5000: 5000,
    billets_1000: 1000,
    billets_500: 500,
    billets_200: 200,
    billets_100: 100,
    billets_50: 50,
    pieces_20: 20,
    pieces_10: 10,
    pieces_5: 5,
  };

  return Object.entries(billetage).reduce((total, [key, count]) => {
    return total + (denominations[key] || 0) * (count || 0);
  }, 0);
}
