import { useCredits } from '../../hooks/credits/useCredits';
import { useDemandes } from '../../hooks/credits/useDemandes';
import { useEnquetes } from '../../hooks/credits/useEnquetes';
import { StatutCredit, StatutDemande, StatutEnquete } from '@shared/enum/status-constants';

export function useCreditStats() {
  const { credits } = useCredits();
  const { demandes } = useDemandes();
  const { enquetes, normalizeStatut: normalizeEnqueteStatut } = useEnquetes();

  // Normalize status to handle legacy French values
  const normalizeStatus = (status: string | undefined): string => {
    if (!status) return '';
    return status.toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[éèê]/g, 'e')
      .replace(/[àâ]/g, 'a');
  };

  // Normalize demande status
  const normalizeDemande = (statut?: string): string => {
    if (!statut) return StatutDemande.PENDING_FEES;
    const s = normalizeStatus(statut);
    if (s === 'en_attente' || s === 'pending') return StatutDemande.PENDING_FEES;
    if (s === 'approuve' || s === 'approuvee' || s === 'approved') return StatutDemande.APPROVED;
    if (s === 'rejete' || s === 'rejetee' || s === 'rejected') return StatutDemande.REJECTED;
    if (s === 'decaissee' || s === 'debourse' || s === 'disbursed') return StatutDemande.DISBURSED;
    return statut.toUpperCase();
  };

  // Normalize credit status
  const normalizeCredit = (statut?: string): string => {
    if (!statut) return StatutCredit.PENDING;
    const s = normalizeStatus(statut);
    if (s === 'actif' || s === 'en_cours' || s === 'active') return StatutCredit.ACTIVE;
    if (s === 'en_retard' || s === 'late') return StatutCredit.LATE;
    if (s === 'solde' || s === 'paid') return StatutCredit.PAID;
    if (s === 'cloture' || s === 'closed') return StatutCredit.CLOSED;
    return statut.toUpperCase();
  };

  const stats = {
    creditsActifs: credits.filter(c => {
      const norm = normalizeCredit(c.statut);
      return norm === StatutCredit.ACTIVE;
    }).length,
    creditsTotal: credits.length,
    creditsEnRetard: credits.filter(c => c.jours_retard > 0).length,

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
    }).reduce((sum, c) => sum + (c.montant_principal || 0), 0),
    montantTotalDemandes: demandes.reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantDemandesEnAttente: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.PENDING_FEES;
    }).reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantDemandesAccorde: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.APPROVED || norm === StatutDemande.DISBURSED;
    }).reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantDemandesRejete: demandes.filter(d => {
      const norm = normalizeDemande(d.statut);
      return norm === StatutDemande.REJECTED || norm === StatutDemande.DEFINITIVELY_REJECTED;
    }).reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantTotalEnquetes: enquetes.reduce((sum, e) => sum + (e.montant_demande || 0), 0)
  };

  return stats;
}
