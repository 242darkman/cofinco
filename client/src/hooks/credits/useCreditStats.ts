import { useState } from 'react';
import { useCredits } from '../../hooks/credits/useCredits';
import { useDemandes } from '../../hooks/credits/useDemandes';
import { useEnquetes } from '../../hooks/credits/useEnquetes';
import { StatutCredit, StatutDemande } from '@shared/enum/status-constants';

export function useCreditStats() {
  const { credits } = useCredits();
  const { demandes } = useDemandes();
  const { enquetes } = useEnquetes();

  const normalizeStatus = (status: string | undefined): string => {
    if (!status) return '';
    return status.toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[éèê]/g, 'e')
      .replace(/[àâ]/g, 'a');
  };

  const stats = {
    creditsActifs: credits.filter(c => {
      const s = normalizeStatus(c.statut);
      return c.statut === StatutCredit.ACTIVE || s === 'actif' || s === 'en_cours' || s === 'debourse';
    }).length,
    creditsTotal: credits.length,
    creditsEnRetard: credits.filter(c => c.jours_retard > 0).length,

    demandesEnAttente: demandes.filter(d => {
      const s = normalizeStatus(d.statut);
      return d.statut === StatutDemande.PENDING_FEES || s === 'en_attente' || s === 'pending';
    }).length,
    demandesTotal: demandes.length,
    demandesApprouvees: demandes.filter(d => {
      const s = normalizeStatus(d.statut);
      return d.statut === StatutDemande.APPROVED || d.statut === StatutDemande.DISBURSED || s === 'approuvee' || s === 'approuve' || s === 'approved' || s === 'decaissee' || s === 'debourse';
    }).length,

    enquetesEnCours: demandes.filter(d => {
      const s = normalizeStatus(d.statut);
      return d.statut === StatutDemande.READY_FOR_INVESTIGATION || d.statut === StatutDemande.UNDER_INVESTIGATION || s === 'a_enqueter' || s === 'en_enquete';
    }).length + enquetes.filter(e => normalizeStatus(e.statut) === 'en_cours').length,
    enquetesTotal: enquetes.length,
    enquetesApprouvees: enquetes.filter(e => {
      const s = normalizeStatus(e.statut);
      return s === 'approuve';
    }).length,

    montantTotalCredits: credits.filter(c => {
      const s = normalizeStatus(c.statut);
      return c.statut === StatutCredit.ACTIVE || c.statut === StatutCredit.LATE || c.statut === StatutCredit.PAID || c.statut === StatutCredit.CLOSED || s === 'actif' || s === 'en_cours' || s === 'debourse' || s === 'en_retard' || s === 'solde' || s === 'cloture';
    }).reduce((sum, c) => sum + (c.montant_principal || 0), 0),
    montantTotalDemandes: demandes.reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantDemandesEnAttente: demandes.filter(d => {
      const s = normalizeStatus(d.statut);
      return d.statut === StatutDemande.PENDING_FEES || s === 'en_attente' || s === 'pending';
    }).reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantDemandesAccorde: demandes.filter(d => {
      const s = normalizeStatus(d.statut);
      return d.statut === StatutDemande.APPROVED || d.statut === StatutDemande.DISBURSED || s === 'approuvee' || s === 'approuve' || s === 'approved' || s === 'decaissee' || s === 'debourse';
    }).reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantDemandesRejete: demandes.filter(d => {
      const s = normalizeStatus(d.statut);
      return d.statut === StatutDemande.REJECTED || d.statut === StatutDemande.DEFINITIVELY_REJECTED || s === 'rejete' || s === 'rejected' || s === 'rejetee';
    }).reduce((sum, d) => sum + (d.montant_demande || 0), 0),
    montantTotalEnquetes: enquetes.reduce((sum, e) => sum + (e.montant_demande || 0), 0)
  };

  return stats;
}
