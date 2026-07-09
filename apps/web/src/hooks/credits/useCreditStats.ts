import { useCredits } from '../../hooks/credits/useCredits';
import { useDemandes } from '../../hooks/credits/useDemandes';
import { useEnquetes } from '../../hooks/credits/useEnquetes';
import { StatutCredit, StatutDemande, StatutEnquete } from '@shared/enum/status-constants';

export function useCreditStats() {
  const { credits } = useCredits();
  const { demandes } = useDemandes();
  const { enquetes, normalizeStatut: normalizeEnqueteStatut } = useEnquetes();

  const normalizeDemande = (statut?: string): string => {
    if (!statut) return StatutDemande.PENDING_FEES;
    return statut.toUpperCase();
  };

  const normalizeCredit = (statut?: string): string => {
    if (!statut) return StatutCredit.PENDING;
    return statut.toUpperCase();
  };

  const stats = {
    creditsActifs: credits.filter(c => {
      const norm = normalizeCredit(c.statut);
      return norm === StatutCredit.ACTIVE;
    }).length,
    creditsTotal: credits.length,
    creditsEnRetard: credits.filter(c => c.joursRetard > 0).length,

    demandesEnAttente: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.PENDING_FEES;
    }).length,
    demandesTotal: demandes.length,
    demandesApprouvees: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.APPROVED || norm === StatutDemande.DISBURSED;
    }).length,

    enquetesEnCours: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.READY_FOR_INVESTIGATION || norm === StatutDemande.UNDER_INVESTIGATION;
    }).length + enquetes.filter(e => normalizeEnqueteStatut(e.statut) === StatutEnquete.IN_PROGRESS).length,
    enquetesTotal: enquetes.length,
    enquetesApprouvees: enquetes.filter(e =>
      normalizeEnqueteStatut(e.statut) === StatutEnquete.APPROVED
    ).length,

    montantTotalCredits: credits.filter(c => {
      const norm = normalizeCredit(c.statut);
      return norm === StatutCredit.ACTIVE || norm === StatutCredit.LATE || norm === StatutCredit.PAID || norm === StatutCredit.CLOSED;
    }).reduce((sum, c) => sum + (c.montantPrincipal || 0), 0),
    montantTotalDemandes: demandes.reduce((sum, d) => sum + (d.montantDemande || 0), 0),
    montantDemandesEnAttente: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.PENDING_FEES;
    }).reduce((sum, d) => sum + (d.montantDemande || 0), 0),
    montantDemandesAccorde: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.APPROVED || norm === StatutDemande.DISBURSED;
    }).reduce((sum, d) => sum + (d.montantDemande || 0), 0),
    montantDemandesRejete: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.REJECTED || norm === StatutDemande.DEFINITIVELY_REJECTED;
    }).reduce((sum, d) => sum + (d.montantDemande || 0), 0),
    montantTotalEnquetes: enquetes.reduce((sum, e) => sum + (e.montantDemande || 0), 0)
  };

  return stats;
}
