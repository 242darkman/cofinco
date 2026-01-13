/**
 * Reevaluation Service
 * 
 * Main business logic for credit reevaluation workflow operations.
 */

import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { 
  demandesCredit, 
  reevaluationsCredit, 
  enquetesComplementaires,
  scoringHistory,
  reevaluationAuditLogs,
  configReevaluation,
  InsertReevaluationCredit,
  InsertEnqueteComplementaire,
  InsertScoringHistory,
  InsertReevaluationAuditLog,
  ReevaluationCredit,
  ConfigReevaluation,
  DemandeCredit
} from '@shared/schema/finance';
import { clients } from '@shared/schema/clients';
import { 
  validateReevaluationCreation, 
  checkEligibilityQuick,
  CreateReevaluationPayload,
  REEVALUATION_RULES
} from './reevaluation-validator';

/**
 * Get reevaluation configuration (global or agency-specific)
 */
export async function getConfigReevaluation(agenceId?: string): Promise<ConfigReevaluation> {
  // Try to find agency-specific config first
  if (agenceId) {
    const [agencyConfig] = await db
      .select()
      .from(configReevaluation)
      .where(and(
        eq(configReevaluation.agenceId, agenceId),
        eq(configReevaluation.actif, true)
      ))
      .limit(1);
    
    if (agencyConfig) return agencyConfig;
  }
  
  // Fallback to global config
  const [globalConfig] = await db
    .select()
    .from(configReevaluation)
    .where(and(
      eq(configReevaluation.actif, true)
    ))
    .limit(1);
  
  if (!globalConfig) {
    // Return default config if none exists
    return {
      id: 'default',
      delaiMinimumJours: 0, // Reduced to 0 (immediate)
      maxReevaluationsParDemande: 2,
      motifsNonReevaluables: ['Fraude avérée', 'Client blacklisté', 'Faux documents'],
      elementsNouveauxObligatoires: true,
      enqueteComplementaireObligatoire: false,
      documentsMinimum: 0,
      seuilScoreMinimum: 40,
      deltaScoreMinimum: 5,
      reductionMontantMaxPourcentage: 50,
      actif: true,
      agenceId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ConfigReevaluation;
  }
  
  return globalConfig;
}

/**
 * Get demande by ID with all necessary fields
 */
export async function getDemandeById(demandeId: string): Promise<DemandeCredit | null> {
  const [demande] = await db
    .select()
    .from(demandesCredit)
    .where(eq(demandesCredit.id, demandeId))
    .limit(1);
  
  return demande || null;
}

/**
 * Create a new reevaluation request
 */
export async function createReevaluation(
  demandeId: string,
  payload: CreateReevaluationPayload,
  userId: string,
  context?: { ipAddress?: string; userAgent?: string }
): Promise<{ success: boolean; reevaluation?: ReevaluationCredit; errors?: any[] }> {
  // 1. Get demande
  const demande = await getDemandeById(demandeId);
  if (!demande) {
    return { success: false, errors: [{ code: 'DEMANDE_NOT_FOUND', message: 'Demande introuvable' }] };
  }
  
  // 2. Get config
  const config = await getConfigReevaluation();
  
  // 3. Validate
  const validation = await validateReevaluationCreation(demande, config, payload);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }
  
  // 4. Create reevaluation
  const [reevaluation] = await db.insert(reevaluationsCredit).values({
    demandeId: demande.id,
    clientId: demande.clientId,
    
    // Snapshot of rejection (immutable)
    motifRejetInitial: demande.motifRejet || '',
    dateRejetInitial: demande.dateRejet || new Date(),
    scoreRejetInitial: demande.scoreCredit,
    montantInitialDemande: demande.montantDemande,
    
    // New elements
    elementsNouveaux: payload.elementsNouveaux,
    justification: payload.justification,
    
    // Adjustments
    nouveauMontantDemande: payload.nouveauMontantDemande?.toString(),
    nouvelleDureeValeur: payload.nouvelleDureeValeur,
    nouvelleDureeUnite: payload.nouvelleDureeUnite as any,
    nouvelleFrequence: payload.nouvelleFrequence as any,
    
    // Guarantees
    garantiesAdditionnelles: payload.garantiesAdditionnelles,
    coEmprunteurDetails: payload.coEmprunteur,
    
    // Documents
    documentsJoints: payload.documentsJoints,
    
    // Metadata
    statut: 'Demandée',
    createdBy: userId,
    
    // Placeholders that will be set by trigger
    // Generate Reevaluation Number manually (since trigger might be missing)
    numeroReevaluation: await (async () => {
      const year = new Date().getFullYear();
      // Use MAX instead of COUNT to safely increment even if records were deleted
      const pattern = `REEV-${year}-%`;
      const result = await db.execute(sql`
        SELECT MAX(numero_reevaluation) as last_num
        FROM ${reevaluationsCredit} 
        WHERE numero_reevaluation LIKE ${pattern}
      `);
      
      let nextNum = 1;
      const lastNumStr = result.rows[0]?.last_num;
      
      if (lastNumStr && typeof lastNumStr === 'string') {
        const parts = lastNumStr.split('-');
        if (parts.length === 3) {
          const lastSeq = parseInt(parts[2], 10);
          if (!isNaN(lastSeq)) {
            nextNum = lastSeq + 1;
          }
        }
      }
      
      return `REEV-${year}-${nextNum.toString().padStart(4, '0')}`;
    })(),
    numeroVersion: 0, // Will be set by trigger
  } as InsertReevaluationCredit).returning();
  
  // 5. Update the demande status to indicate reevaluation in progress
  await db.update(demandesCredit)
    .set({
      statut: 'Réévaluation en cours',
      reevaluationEnCours: true,
      derniereReevaluationId: reevaluation.id,
      dateDerniereReevaluation: new Date()
    })
    .where(eq(demandesCredit.id, demande.id));

  // 6. Create audit log
  await createAuditLog({
    reevaluationId: reevaluation.id,
    demandeId: demande.id,
    action: 'REEVALUATION_CREEE',
    statutAvant: null,
    statutApres: 'Demandée',
    details: {
      description: 'Réévaluation créée',
      elementsNouveaux: payload.elementsNouveaux.map(e => e.type),
      nouveauMontant: payload.nouveauMontantDemande,
      montantInitial: Number(demande.montantDemande)
    },
    userId,
    roleUtilisateur: 'Agent',
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent
  });

  return { success: true, reevaluation };
}

/**
 * Validate eligibility for a reevaluation
 */
export async function validateEligibility(
  reevaluationId: string,
  userId: string,
  override?: { force: boolean; motif?: string }
): Promise<{ success: boolean; statut: string; motifRefus?: string }> {
  // 1. Get reevaluation
  const [reevaluation] = await db
    .select()
    .from(reevaluationsCredit)
    .where(eq(reevaluationsCredit.id, reevaluationId))
    .limit(1);
  
  if (!reevaluation) {
    throw new Error('Réévaluation introuvable');
  }
  
  // 2. Validate transition
  const transitionValid = REEVALUATION_RULES.validateTransition(
    reevaluation.statut, 
    'Éligibilité en cours'
  );
  if (!transitionValid.valid && !override?.force) {
    throw new Error(transitionValid.message);
  }
  
  // 3. Get demande and config
  const demande = await getDemandeById(reevaluation.demandeId);
  const config = await getConfigReevaluation();
  
  if (!demande) {
    throw new Error('Demande associée introuvable');
  }
  
  // 4. Check eligibility
  const eligibility = checkEligibilityQuick(demande, config);
  
  // 5. Update reevaluation status
  const nouveauStatut = eligibility.estEligible || override?.force ? 'Autorisée' : 'Refusée';
  
  await db.update(reevaluationsCredit)
    .set({
      statut: nouveauStatut,
      eligibiliteValidee: eligibility.estEligible || override?.force,
      motifRefusEligibilite: eligibility.estEligible ? null : eligibility.motifRefus,
      dateValidationEligibilite: new Date(),
      validePar: userId,
      updatedAt: new Date()
    })
    .where(eq(reevaluationsCredit.id, reevaluationId));
  
  // 6. Audit log
  await createAuditLog({
    reevaluationId: reevaluation.id,
    demandeId: reevaluation.demandeId,
    action: eligibility.estEligible ? 'ELIGIBILITE_VERIFIEE' : 'ELIGIBILITE_REFUSEE',
    statutAvant: reevaluation.statut,
    statutApres: nouveauStatut,
    details: {
      description: eligibility.estEligible 
        ? 'Éligibilité validée' 
        : `Éligibilité refusée: ${eligibility.motifRefus}`,
      eligibilite: eligibility,
      override: override?.force ? { motif: override.motif } : undefined
    },
    userId,
    roleUtilisateur: 'Superviseur'
  });
  
  return {
    success: true,
    statut: nouveauStatut,
    motifRefus: eligibility.estEligible ? undefined : eligibility.motifRefus
  };
}

/**
 * Start a complementary inquiry
 */
export async function startEnqueteComplementaire(
  reevaluationId: string,
  objectifEnquete: string,
  pointsAVerifier: string[],
  enqueteurId: string,
  userId: string
): Promise<{ success: boolean; enquete?: any }> {
  // 1. Get reevaluation
  const [reevaluation] = await db
    .select()
    .from(reevaluationsCredit)
    .where(eq(reevaluationsCredit.id, reevaluationId))
    .limit(1);
  
  if (!reevaluation) {
    throw new Error('Réévaluation introuvable');
  }
  
  // 2. Validate transition
  const transitionValid = REEVALUATION_RULES.validateTransition(
    reevaluation.statut, 
    'Enquête complémentaire'
  );
  if (!transitionValid.valid) {
    throw new Error(transitionValid.message);
  }
  
  // 3. Create inquiry with temporary numero (will be set properly)
  const numeroEnquete = `ENQC-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  
  const [enquete] = await db.insert(enquetesComplementaires).values({
    reevaluationId: reevaluation.id,
    demandeId: reevaluation.demandeId,
    clientId: reevaluation.clientId,
    numeroEnquete,
    objectifEnquete,
    pointsAVerifier,
    enqueteurId,
    statut: 'En cours',
    dateDebut: new Date()
  } as InsertEnqueteComplementaire).returning();
  
  // 4. Update reevaluation
  await db.update(reevaluationsCredit)
    .set({
      statut: 'Enquête complémentaire',
      enqueteComplementaireId: enquete.id,
      updatedAt: new Date()
    })
    .where(eq(reevaluationsCredit.id, reevaluationId));
  
  // 5. Audit log
  await createAuditLog({
    reevaluationId: reevaluation.id,
    demandeId: reevaluation.demandeId,
    action: 'ENQUETE_COMPLEMENTAIRE_DEMARREE',
    statutAvant: reevaluation.statut,
    statutApres: 'Enquête complémentaire',
    details: {
      description: 'Enquête complémentaire démarrée',
      enqueteId: enquete.id,
      enqueteurId,
      objectifEnquete,
      pointsAVerifier
    },
    userId,
    roleUtilisateur: 'Superviseur'
  });
  
  return { success: true, enquete };
}

/**
 * Submit to committee for decision
 */
export async function submitToCommittee(
  reevaluationId: string,
  membresConvoques: string[],
  notePreparatoire: string | undefined,
  userId: string
): Promise<{ success: boolean; scoring?: any }> {
  // 1. Get reevaluation
  const [reevaluation] = await db
    .select()
    .from(reevaluationsCredit)
    .where(eq(reevaluationsCredit.id, reevaluationId))
    .limit(1);
  
  if (!reevaluation) {
    throw new Error('Réévaluation introuvable');
  }
  
  // 2. Validate transition
  const transitionValid = REEVALUATION_RULES.validateTransition(
    reevaluation.statut, 
    'En comité'
  );
  if (!transitionValid.valid) {
    throw new Error(transitionValid.message);
  }
  
  // 3. Calculate new score (simplified - would use real scoring service)
  const demande = await getDemandeById(reevaluation.demandeId);
  const oldScore = reevaluation.scoreRejetInitial || 0;
  
  // Simple scoring improvement based on new elements
  const elementsNouveaux = (reevaluation.elementsNouveaux as any[]) || [];
  let scoreBonus = 0;
  for (const element of elementsNouveaux) {
    switch (element.type) {
      case 'Garantie supplémentaire': scoreBonus += 10; break;
      case 'Co-emprunteur': scoreBonus += 8; break;
      case 'Justificatif de revenus': scoreBonus += 5; break;
      case 'Réduction montant demandé': scoreBonus += 7; break;
      default: scoreBonus += 3;
    }
  }
  
  const nouveauScore = Math.min(100, oldScore + scoreBonus);
  const deltaScore = nouveauScore - oldScore;
  
  // 4. Record scoring history
  const [scoringRecord] = await db.insert(scoringHistory).values({
    demandeId: reevaluation.demandeId,
    clientId: reevaluation.clientId,
    reevaluationId: reevaluation.id,
    typeScore: 'Post-réévaluation',
    scoreTotal: nouveauScore,
    scorePrecedent: oldScore,
    deltaScore,
    donneesCalcul: {
      elementsNouveaux: elementsNouveaux.length,
      scoreBonus,
      timestamp: new Date()
    },
    recommandationAuto: nouveauScore >= 60 ? 'Approbation recommandée' : 'Examen approfondi requis',
    calculeParSysteme: true
  } as InsertScoringHistory).returning();
  
  // 5. Update reevaluation
  await db.update(reevaluationsCredit)
    .set({
      statut: 'En comité',
      nouveauScore,
      deltaScore,
      membresComite: membresConvoques,
      updatedAt: new Date()
    })
    .where(eq(reevaluationsCredit.id, reevaluationId));
  
  // 6. Audit log
  await createAuditLog({
    reevaluationId: reevaluation.id,
    demandeId: reevaluation.demandeId,
    action: 'SOUMIS_COMITE',
    statutAvant: reevaluation.statut,
    statutApres: 'En comité',
    details: {
      description: 'Dossier soumis au comité de crédit',
      membresConvoques,
      notePreparatoire,
      scoring: {
        ancien: oldScore,
        nouveau: nouveauScore,
        delta: deltaScore
      }
    },
    userId,
    roleUtilisateur: 'Superviseur'
  });
  
  return { 
    success: true, 
    scoring: {
      scoreTotal: nouveauScore,
      scorePrecedent: oldScore,
      deltaScore,
      recommandation: nouveauScore >= 60 ? 'Approbation recommandée' : 'Examen approfondi requis'
    }
  };
}

/**
 * Record committee decision
 */
export async function recordCommitteeDecision(
  reevaluationId: string,
  decision: 'Approuvée' | 'Rejetée définitivement' | 'Montant réduit',
  montantApprouve: number | undefined,
  commentaire: string,
  membresPresents: string[],
  conditionsSpeciales: string | undefined,
  userId: string
): Promise<{ success: boolean; reevaluation?: ReevaluationCredit }> {
  // 1. Get reevaluation
  const [reevaluation] = await db
    .select()
    .from(reevaluationsCredit)
    .where(eq(reevaluationsCredit.id, reevaluationId))
    .limit(1);
  
  if (!reevaluation) {
    throw new Error('Réévaluation introuvable');
  }
  
  // 2. Determine final status
  const finalStatut = decision === 'Montant réduit' ? 'Approuvée' : decision;
  
  // 3. Validate transition
  const transitionValid = REEVALUATION_RULES.validateTransition(
    reevaluation.statut, 
    finalStatut
  );
  if (!transitionValid.valid) {
    throw new Error(transitionValid.message);
  }
  
  // 4. Update reevaluation (will be locked by trigger)
  const [updated] = await db.update(reevaluationsCredit)
    .set({
      statut: finalStatut,
      decisionComite: decision,
      montantApprouveComite: montantApprouve?.toString(),
      conditionsSpeciales,
      commentaireComite: commentaire,
      dateDecisionComite: new Date(),
      decidePar: userId,
      membresComite: membresPresents,
      updatedAt: new Date()
    })
    .where(eq(reevaluationsCredit.id, reevaluationId))
    .returning();
  
  // 5. If approved, update the parent DemandeCredit to 'Approuvée après réévaluation'
  // This status indicates the reevaluation was approved and the demand is ready for commission credit disbursement
  if (finalStatut === 'Approuvée') {
    await db.update(demandesCredit)
      .set({
        statut: 'Approuvée après réévaluation',
        montantApprouve: montantApprouve?.toString() || reevaluation.nouveauMontantDemande,
        dureeValeur: reevaluation.nouvelleDureeValeur || undefined,
        dureeUnite: reevaluation.nouvelleDureeUnite || undefined,
        reevaluationEnCours: false,
        updatedAt: new Date()
      })
      .where(eq(demandesCredit.id, reevaluation.demandeId));
  }
  
  // 5. Audit log
  await createAuditLog({
    reevaluationId: reevaluation.id,
    demandeId: reevaluation.demandeId,
    action: 'DECISION_COMITE',
    statutAvant: reevaluation.statut,
    statutApres: finalStatut,
    details: {
      description: `Décision du comité: ${decision}`,
      decision,
      montantApprouve,
      conditionsSpeciales,
      commentaire,
      membresPresents
    },
    userId,
    roleUtilisateur: 'Comité'
  });
  
  return { success: true, reevaluation: updated };
}

/**
 * Cancel a reevaluation
 */
export async function cancelReevaluation(
  reevaluationId: string,
  motif: string,
  userId: string
): Promise<{ success: boolean }> {
  const [reevaluation] = await db
    .select()
    .from(reevaluationsCredit)
    .where(eq(reevaluationsCredit.id, reevaluationId))
    .limit(1);
  
  if (!reevaluation) {
    throw new Error('Réévaluation introuvable');
  }
  
  if (reevaluation.verrouille) {
    throw new Error('Cette réévaluation est verrouillée');
  }
  
  // Check if cancellation is allowed from current status
  const terminalStatuses = ['Approuvée', 'Rejetée définitivement', 'Annulée'];
  if (terminalStatuses.includes(reevaluation.statut)) {
    throw new Error('Impossible d\'annuler une réévaluation dans cet état');
  }
  
  await db.update(reevaluationsCredit)
    .set({
      statut: 'Annulée',
      updatedAt: new Date()
    })
    .where(eq(reevaluationsCredit.id, reevaluationId));
  
  await createAuditLog({
    reevaluationId: reevaluation.id,
    demandeId: reevaluation.demandeId,
    action: 'ANNULEE',
    statutAvant: reevaluation.statut,
    statutApres: 'Annulée',
    details: {
      description: 'Réévaluation annulée',
      motif
    },
    userId,
    roleUtilisateur: 'Agent'
  });
  
  return { success: true };
}

/**
 * Get reevaluation by ID with related data
 */
export async function getReevaluationById(reevaluationId: string) {
  const [reevaluation] = await db
    .select()
    .from(reevaluationsCredit)
    .where(eq(reevaluationsCredit.id, reevaluationId))
    .limit(1);
  
  return reevaluation || null;
}

/**
 * Get all reevaluations for a demande
 */
export async function getReevaluationsByDemande(demandeId: string) {
  return db
    .select()
    .from(reevaluationsCredit)
    .where(eq(reevaluationsCredit.demandeId, demandeId))
    .orderBy(desc(reevaluationsCredit.createdAt));
}

/**
 * Get audit logs for a reevaluation
 */
export async function getAuditLogs(reevaluationId: string) {
  return db
    .select()
    .from(reevaluationAuditLogs)
    .where(eq(reevaluationAuditLogs.reevaluationId, reevaluationId))
    .orderBy(desc(reevaluationAuditLogs.timestamp));
}

/**
 * Helper: Create audit log entry
 */
async function createAuditLog(data: Omit<InsertReevaluationAuditLog, 'id' | 'timestamp'>) {
  return db.insert(reevaluationAuditLogs).values(data as InsertReevaluationAuditLog);
}
