/**
 * Bouton pour générer le rapport PDF de clôture de session caisse
 */

import React, { useState } from 'react';
import { FileDown, Loader2, FileCheck } from 'lucide-react';
import Button from '../../ui/Button';
import { useClosurePDF, ClosureReportData } from '../../../hooks/finance/useClosurePDF';
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
  const [isGenerating, setIsGenerating] = useState(false);
  const { generateClosureReport } = useClosurePDF();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Normalize session fields (camelCase vs snake_case)
      const soldeOuverture = Number(
        session.montant_ouverture ||
        (session as any).montantOuverture ||
        session.solde_initial ||
        0
      );
      const soldeTheorique = Number(
        session.montant_fermeture_theorique ||
        (session as any).montantFermetureTheorique ||
        session.solde_theorique ||
        0
      );
      const soldePhysique = Number(
        session.montant_physique ||
        (session as any).montantPhysique ||
        session.solde_reel ||
        0
      ) || calculateBilletageTotal(billetage);

      const openedAt = session.openedAt || session.opened_at || new Date().toISOString();
      const closedAt = session.closedAt || session.closed_at || new Date().toISOString();

      // Calculate totals from operations if available
      let totalEntrees = 0;
      let totalSorties = 0;
      if ((session as any).operations && Array.isArray((session as any).operations)) {
        for (const op of (session as any).operations) {
          const montant = Number(op.montant || 0);
          const type = (op.type_operation || '').toLowerCase();
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

      const reportData: ClosureReportData = {
        sessionId: session.id,
        caisseNom: session.caisse_nom || (session as any).caisseNom || 'Caisse',
        agenceNom: session.agence_nom || (session as any).agenceNom || 'Agence',
        agenceCode: session.agence_code || (session as any).agenceCode,
        caissierNom: session.caissier_nom || (session as any).caissierNom || 'Caissier',
        caissierId: session.caissier_id || (session as any).caissierId || '',
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

      await generateClosureReport(reportData);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleGenerate}
      disabled={isGenerating}
      className={className}
      icon={isGenerating ? Loader2 : FileDown}
    >
      {showLabel && (isGenerating ? 'Génération...' : 'Rapport PDF')}
    </Button>
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
