/**
 * Reevaluation Validator Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  REEVALUATION_RULES,
  validateReevaluationCreation,
  checkEligibilityQuick,
  CreateReevaluationPayload
} from '../../server/services/reevaluation-validator';
import { DemandeCredit, ConfigReevaluation, ReevaluationCredit } from '../../shared/schema/finance';
import { addDays, subDays } from 'date-fns';

describe('Reevaluation Validation Rules', () => {
  // Mock data
  const mockConfig: ConfigReevaluation = {
    id: 'config-1',
    delaiMinimumJours: 30,
    maxReevaluationsParDemande: 2,
    motifsNonReevaluables: ['Fraude avérée', 'Client blacklisté', 'Faux documents'],
    elementsNouveauxObligatoires: true,
    enqueteComplementaireObligatoire: false,
    documentsMinimum: 1,
    seuilScoreMinimum: 40,
    deltaScoreMinimum: 5,
    reductionMontantMaxPourcentage: 50,
    actif: true,
    agenceId: null,
    createdAt: new Date(),
    updatedAt: new Date()
  } as ConfigReevaluation;

  const createMockDemande = (overrides?: Partial<DemandeCredit>): DemandeCredit => ({
    id: 'demande-1',
    numeroDemande: 'DMD-2026-001',
    clientId: 'client-1',
    montantDemande: '500000',
    tauxInteret: '5',
    frequenceRemboursement: 'Mensuel',
    dureeValeur: 12,
    dureeUnite: 'Mois',
    objetCredit: 'Test',
    statut: 'Rejetée',
    motifRejet: 'Capacité de remboursement insuffisante',
    dateRejet: subDays(new Date(), 45),
    scoreCredit: 45,
    nombreReevaluations: 0,
    reevaluationEnCours: false,
    createdAt: new Date(),
    ...overrides
  } as DemandeCredit);

  describe('validateDemandeStatus', () => {
    it('should pass for rejected demande', () => {
      const demande = createMockDemande({ statut: 'Rejetée' });
      const result = REEVALUATION_RULES.validateDemandeStatus(demande);
      expect(result.valid).toBe(true);
    });

    it('should fail for non-rejected demande', () => {
      const demande = createMockDemande({ statut: 'Approuvée' });
      const result = REEVALUATION_RULES.validateDemandeStatus(demande);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('DEMANDE_NOT_REJECTED');
    });
  });

  describe('validateDelaiMinimum', () => {
    it('should pass when delay is sufficient', () => {
      const dateRejet = subDays(new Date(), 45);
      const result = REEVALUATION_RULES.validateDelaiMinimum(dateRejet, mockConfig);
      expect(result.valid).toBe(true);
    });

    it('should fail when delay is insufficient', () => {
      const dateRejet = subDays(new Date(), 15);
      const result = REEVALUATION_RULES.validateDelaiMinimum(dateRejet, mockConfig);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('DELAI_NON_RESPECTE');
      expect(result.details?.joursRequis).toBe(30);
    });

    it('should fail when dateRejet is null', () => {
      const result = REEVALUATION_RULES.validateDelaiMinimum(null, mockConfig);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('DATE_REJET_MANQUANTE');
    });
  });

  describe('validateNombreMax', () => {
    it('should pass when under limit', () => {
      const demande = createMockDemande({ nombreReevaluations: 1 });
      const result = REEVALUATION_RULES.validateNombreMax(demande, mockConfig);
      expect(result.valid).toBe(true);
    });

    it('should fail when at limit', () => {
      const demande = createMockDemande({ nombreReevaluations: 2 });
      const result = REEVALUATION_RULES.validateNombreMax(demande, mockConfig);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MAX_REEVALUATIONS_REACHED');
    });
  });

  describe('validateMotifReevaluable', () => {
    it('should pass for normal motifs', () => {
      const result = REEVALUATION_RULES.validateMotifReevaluable(
        'Capacité de remboursement insuffisante',
        mockConfig
      );
      expect(result.valid).toBe(true);
    });

    it('should fail for blacklisted motifs', () => {
      const result = REEVALUATION_RULES.validateMotifReevaluable(
        'Fraude avérée lors de la vérification',
        mockConfig
      );
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MOTIF_NON_REEVALUABLE');
    });

    it('should pass when motif is null', () => {
      const result = REEVALUATION_RULES.validateMotifReevaluable(null, mockConfig);
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePasDeReevaluationEnCours', () => {
    it('should pass when no reevaluation in progress', () => {
      const demande = createMockDemande({ reevaluationEnCours: false });
      const result = REEVALUATION_RULES.validatePasDeReevaluationEnCours(demande);
      expect(result.valid).toBe(true);
    });

    it('should fail when reevaluation in progress', () => {
      const demande = createMockDemande({ reevaluationEnCours: true });
      const result = REEVALUATION_RULES.validatePasDeReevaluationEnCours(demande);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('REEVALUATION_EN_COURS');
    });
  });

  describe('validateElementsNouveaux', () => {
    it('should pass with elements when required', () => {
      const elements = [{ type: 'Garantie supplémentaire', description: 'Test' }];
      const result = REEVALUATION_RULES.validateElementsNouveaux(elements, mockConfig);
      expect(result.valid).toBe(true);
    });

    it('should fail without elements when required', () => {
      const result = REEVALUATION_RULES.validateElementsNouveaux([], mockConfig);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('ELEMENTS_NOUVEAUX_REQUIS');
    });
  });

  describe('validateJustification', () => {
    it('should pass with sufficient length', () => {
      const justification = 'Cette justification contient plus de 50 caractères et devrait passer la validation.';
      const result = REEVALUATION_RULES.validateJustification(justification);
      expect(result.valid).toBe(true);
    });

    it('should fail with insufficient length', () => {
      const result = REEVALUATION_RULES.validateJustification('Court');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('JUSTIFICATION_TROP_COURTE');
    });
  });

  describe('validateDocuments', () => {
    it('should pass with enough documents', () => {
      const result = REEVALUATION_RULES.validateDocuments(['doc1.pdf'], mockConfig);
      expect(result.valid).toBe(true);
    });

    it('should fail without documents', () => {
      const result = REEVALUATION_RULES.validateDocuments([], mockConfig);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('DOCUMENTS_INSUFFISANTS');
    });
  });

  describe('validateNonVerrouille', () => {
    it('should pass when not locked', () => {
      const reevaluation = { verrouille: false } as ReevaluationCredit;
      const result = REEVALUATION_RULES.validateNonVerrouille(reevaluation);
      expect(result.valid).toBe(true);
    });

    it('should fail when locked', () => {
      const reevaluation = { 
        verrouille: true, 
        dateVerrouillage: new Date() 
      } as ReevaluationCredit;
      const result = REEVALUATION_RULES.validateNonVerrouille(reevaluation);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('REEVALUATION_VERROUILLEE');
    });
  });

  describe('validateTransition', () => {
    it('should allow valid transitions', () => {
      const validTransitions = [
        ['Demandée', 'Éligibilité en cours'],
        ['Autorisée', 'Enquête complémentaire'],
        ['En comité', 'Approuvée'],
      ];

      for (const [from, to] of validTransitions) {
        const result = REEVALUATION_RULES.validateTransition(from, to);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject invalid transitions', () => {
      const invalidTransitions = [
        ['Approuvée', 'Demandée'],
        ['Rejetée définitivement', 'En comité'],
        ['Annulée', 'Autorisée'],
      ];

      for (const [from, to] of invalidTransitions) {
        const result = REEVALUATION_RULES.validateTransition(from, to);
        expect(result.valid).toBe(false);
        expect(result.code).toBe('TRANSITION_INVALIDE');
      }
    });
  });

  describe('checkEligibilityQuick', () => {
    it('should return eligible for valid case', () => {
      const demande = createMockDemande();
      const result = checkEligibilityQuick(demande, mockConfig);
      
      expect(result.estEligible).toBe(true);
      expect(result.delaiOk).toBe(true);
      expect(result.nombreOk).toBe(true);
      expect(result.motifBlackliste).toBe(false);
    });

    it('should return ineligible when delay not met', () => {
      const demande = createMockDemande({ dateRejet: subDays(new Date(), 10) });
      const result = checkEligibilityQuick(demande, mockConfig);
      
      expect(result.estEligible).toBe(false);
      expect(result.delaiOk).toBe(false);
      expect(result.motifRefus).toContain('Délai minimum');
    });
  });
});
