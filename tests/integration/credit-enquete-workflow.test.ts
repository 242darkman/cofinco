import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../server/db';
import { 
  demandesCredit, 
  enquetesCredit, 
  credits 
} from '../../shared/schema/finance';
import { 
  agentActivities 
} from '../../shared/schema/agent-activities';
import { clients } from '../../shared/schema/clients';
import { users } from '../../shared/schema/auth';
import { agences } from '../../shared/schema/agences';
import { eq, and, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

describe('Credit Enquete Workflow Integration', () => {
  // Test data
  const testAgence = {
    id: uuidv4(),
    nom: "Test Agence",
    ville: "Brazzaville",
    codeAgence: "TEST-001"
  };

  const testSupervisor = {
    id: uuidv4(),
    nom: "Test Supervisor",
    email: "supervisor@test.com",
    password: "test123",
    role: "superviseur" as const,
    agenceId: testAgence.id
  };

  const testAgent = {
    id: uuidv4(),
    nom: "Test Agent",
    email: "agent@test.com",
    password: "test123",
    role: "agent_terrain" as const,
    agenceId: testAgence.id
  };

  const testClient = {
    id: uuidv4(),
    nom: "Test Client",
    telephone: "+242060000001",
    email: "client@test.com",
    numeroCompte: "TEST-CLIENT-001",
    agenceId: testAgence.id,
    statut: "Actif" as const
  };

  beforeEach(async () => {
    // Clean existing test data
    await db.delete(credits).where(eq(credits.clientId, testClient.id));
    await db.delete(enquetesCredit).where(eq(enquetesCredit.clientId, testClient.id));
    await db.delete(demandesCredit).where(eq(demandesCredit.clientId, testClient.id));
    await db.delete(agentActivities).where(
      or(
        eq(agentActivities.assignedAgentId, testAgent.id),
        eq(agentActivities.assignedBy, testSupervisor.id)
      )
    );
    await db.delete(clients).where(eq(clients.id, testClient.id));
    await db.delete(users).where(
      or(
        eq(users.id, testSupervisor.id),
        eq(users.id, testAgent.id)
      )
    );
    await db.delete(agences).where(eq(agences.id, testAgence.id));

    // Insert test data
    await db.insert(agences).values(testAgence);
    await db.insert(users).values([testSupervisor, testAgent]);
    await db.insert(clients).values(testClient);
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(credits).where(eq(credits.clientId, testClient.id));
    await db.delete(enquetesCredit).where(eq(enquetesCredit.clientId, testClient.id));
    await db.delete(demandesCredit).where(eq(demandesCredit.clientId, testClient.id));
    await db.delete(agentActivities).where(
      or(
        eq(agentActivities.assignedAgentId, testAgent.id),
        eq(agentActivities.assignedBy, testSupervisor.id)
      )
    );
    await db.delete(clients).where(eq(clients.id, testClient.id));
    await db.delete(users).where(
      or(
        eq(users.id, testSupervisor.id),
        eq(users.id, testAgent.id)
      )
    );
    await db.delete(agences).where(eq(agences.id, testAgence.id));
  });

  it('should create credit application and generate enquete', async () => {
    // Create credit application
    const [demande] = await db.insert(demandesCredit).values({
      clientId: testClient.id,
      montantDemande: "500000",
      tauxInteret: "2.5",
      frequenceRemboursement: "DAILY",
      dureeValeur: 30,
      dureeUnite: "JOUR",
      typeRevenu: "Salarie",
      statut: "EN_ATTENTE",
      typeCredit: "COMMERCIAL",
      objetCredit: "Achat de marchandises",
      createdBy: testClient.id
    }).returning();

    expect(demande).toBeDefined();
    expect(demande.statut).toBe("EN_ATTENTE");

    // Create enquete for the application
    const [enquete] = await db.insert(enquetesCredit).values({
      clientId: testClient.id,
      demandeId: demande.id,
      montantDemande: demande.montantDemande,
      objetCredit: demande.objetCredit,
      statut: "PENDING_ASSIGNMENT"
    }).returning();

    expect(enquete).toBeDefined();
    expect(enquete.statut).toBe("PENDING_ASSIGNMENT");
    expect(enquete.demandeId).toBe(demande.id);
  });

  it('should assign enquete to agent and create activity', async () => {
    // Setup: Create demande and enquete
    const [demande] = await db.insert(demandesCredit).values({
      clientId: testClient.id,
      montantDemande: "500000",
      tauxInteret: "2.5",
      frequenceRemboursement: "DAILY",
      dureeValeur: 30,
      dureeUnite: "JOUR",
      typeRevenu: "Salarie",
      statut: "EN_ATTENTE",
      typeCredit: "COMMERCIAL",
      objetCredit: "Achat de marchandises",
      createdBy: testClient.id
    }).returning();

    const [enquete] = await db.insert(enquetesCredit).values({
      clientId: testClient.id,
      demandeId: demande.id,
      montantDemande: demande.montantDemande,
      objetCredit: demande.objetCredit,
      statut: "PENDING_ASSIGNMENT"
    }).returning();

    // Assign to agent
    const [updatedEnquete] = await db.update(enquetesCredit)
      .set({
        assignedAgentId: testAgent.id,
        assignedAt: new Date(),
        assignedBy: testSupervisor.id,
        statut: "ASSIGNED",
        priority: "HIGH",
        dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
        updatedAt: new Date()
      })
      .where(eq(enquetesCredit.id, enquete.id))
      .returning();

    expect(updatedEnquete.assignedAgentId).toBe(testAgent.id);
    expect(updatedEnquete.statut).toBe("ASSIGNED");

    // Create corresponding activity
    const [activity] = await db.insert(agentActivities).values({
      assignedAgentId: testAgent.id,
      agenceId: testAgence.id,
      activityType: "CREDIT_INVESTIGATION",
      referenceId: enquete.id,
      referenceTable: "enquetes_credit",
      title: `Enquête crédit - ${demande.montantDemande} FCFA`,
      description: `Enquête pour ${testClient.nom}`,
      priority: "HIGH",
      dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
      status: "PENDING",
      assignedBy: testSupervisor.id
    }).returning();

    expect(activity).toBeDefined();
    expect(activity.assignedAgentId).toBe(testAgent.id);
    expect(activity.referenceId).toBe(enquete.id);
    expect(activity.activityType).toBe("CREDIT_INVESTIGATION");
  });

  it('should submit enquete with agent recommendation', async () => {
    // Setup: Create and assign enquete
    const [demande] = await db.insert(demandesCredit).values({
      clientId: testClient.id,
      montantDemande: "500000",
      tauxInteret: "2.5",
      frequenceRemboursement: "DAILY",
      dureeValeur: 30,
      dureeUnite: "JOUR",
      typeRevenu: "Salarie",
      statut: "EN_ATTENTE",
      typeCredit: "COMMERCIAL",
      objetCredit: "Achat de marchandises",
      createdBy: testClient.id
    }).returning();

    const [enquete] = await db.insert(enquetesCredit).values({
      clientId: testClient.id,
      demandeId: demande.id,
      montantDemande: demande.montantDemande,
      objetCredit: demande.objetCredit,
      statut: "ASSIGNED",
      assignedAgentId: testAgent.id,
      assignedAt: new Date(),
      assignedBy: testSupervisor.id
    }).returning();

    // Submit enquete with investigation results
    const [submittedEnquete] = await db.update(enquetesCredit)
      .set({
        statut: "SUBMITTED",
        
        // Business verification
        categorieActivite: "Commerce",
        typeActivite: "Vente au détail",
        ancienneteActivite: 24, // 24 months
        evaluationActivite: "Activité stable et rentable",
        
        // Income assessment
        revenuMensuel: "800000",
        revenuJournalier: "30000",
        typeRevenu: "Commercial",
        chargesMensuelles: "200000",
        
        // Household situation
        personnesCharge: 3,
        typeHabitation: "Locataire",
        
        // Risk assessment
        capaciteRemboursement: "600000",
        scoreGlobal: 75,
        riskLevel: "LOW",
        
        // Agent recommendation
        agentRecommendation: "APPROVE",
        recommendedAmount: "500000",
        recommandation: "Client fiable avec activité stable",
        observations: "Bonne capacité de remboursement, activité vérifiée sur le terrain",
        
        // Timestamps
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // Started 2 hours ago
        submittedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(enquetesCredit.id, enquete.id))
      .returning();

    expect(submittedEnquete.statut).toBe("SUBMITTED");
    expect(submittedEnquete.agentRecommendation).toBe("APPROVE");
    expect(submittedEnquete.riskLevel).toBe("LOW");

    // Update activity status
    await db.update(agentActivities)
      .set({
        status: "COMPLETED",
        completedAt: new Date(),
        outcome: "APPROVE",
        notes: "Enquête complétée avec recommandation d'approbation"
      })
      .where(
        and(
          eq(agentActivities.referenceId, enquete.id),
          eq(agentActivities.referenceTable, "enquetes_credit")
        )
      );
  });

  it('should review and approve enquete by supervisor', async () => {
    // Setup: Create submitted enquete
    const [demande] = await db.insert(demandesCredit).values({
      clientId: testClient.id,
      montantDemande: "500000",
      tauxInteret: "2.5",
      frequenceRemboursement: "DAILY",
      dureeValeur: 30,
      dureeUnite: "JOUR",
      typeRevenu: "Salarie",
      statut: "EN_ATTENTE",
      typeCredit: "COMMERCIAL",
      objetCredit: "Achat de marchandises",
      createdBy: testClient.id
    }).returning();

    const [enquete] = await db.insert(enquetesCredit).values({
      clientId: testClient.id,
      demandeId: demande.id,
      montantDemande: demande.montantDemande,
      objetCredit: demande.objetCredit,
      statut: "SUBMITTED",
      assignedAgentId: testAgent.id,
      agentRecommendation: "APPROVE",
      riskLevel: "LOW",
      submittedAt: new Date()
    }).returning();

    // Review and approve
    const [reviewedEnquete] = await db.update(enquetesCredit)
      .set({
        statut: "REVIEWED",
        reviewedAt: new Date(),
        reviewedBy: testSupervisor.id,
        supervisorNotes: "Enquête complète et détaillée. Approuvée.",
        updatedAt: new Date()
      })
      .where(eq(enquetesCredit.id, enquete.id))
      .returning();

    expect(reviewedEnquete.statut).toBe("REVIEWED");
    expect(reviewedEnquete.reviewedBy).toBe(testSupervisor.id);

    // Update demande status
    await db.update(demandesCredit)
      .set({
        statut: "APPROUVEE",
        montantApprouve: demande.montantDemande,
        updatedAt: new Date()
      })
      .where(eq(demandesCredit.id, demande.id));
  });

  it('should handle enquete rejection', async () => {
    // Setup: Create enquete with negative assessment
    const [demande] = await db.insert(demandesCredit).values({
      clientId: testClient.id,
      montantDemande: "1000000",
      tauxInteret: "2.5",
      frequenceRemboursement: "DAILY",
      dureeValeur: 60,
      dureeUnite: "JOUR",
      typeRevenu: "Informel",
      statut: "EN_ATTENTE",
      typeCredit: "COMMERCIAL",
      objetCredit: "Expansion commerciale",
      createdBy: testClient.id
    }).returning();

    const [enquete] = await db.insert(enquetesCredit).values({
      clientId: testClient.id,
      demandeId: demande.id,
      montantDemande: demande.montantDemande,
      objetCredit: demande.objetCredit,
      statut: "SUBMITTED",
      assignedAgentId: testAgent.id,
      agentRecommendation: "REJECT",
      riskLevel: "VERY_HIGH",
      riskFactors: ["Revenus non vérifiables", "Pas d'historique crédit", "Montant trop élevé"],
      submittedAt: new Date()
    }).returning();

    // Supervisor confirms rejection
    const [rejectedEnquete] = await db.update(enquetesCredit)
      .set({
        statut: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: testSupervisor.id,
        supervisorNotes: "Risque trop élevé, recommandation de rejet confirmée",
        updatedAt: new Date()
      })
      .where(eq(enquetesCredit.id, enquete.id))
      .returning();

    expect(rejectedEnquete.statut).toBe("REJECTED");

    // Update demande status
    const [rejectedDemande] = await db.update(demandesCredit)
      .set({
        statut: "REJETEE",
        motifRejet: "Enquête terrain défavorable - risque trop élevé",
        updatedAt: new Date()
      })
      .where(eq(demandesCredit.id, demande.id))
      .returning();

    expect(rejectedDemande.statut).toBe("REJETEE");
  });

  it('should track multiple activities per agent', async () => {
    // Create multiple activities for the agent
    const activities = [];
    
    for (let i = 0; i < 5; i++) {
      const [activity] = await db.insert(agentActivities).values({
        assignedAgentId: testAgent.id,
        agenceId: testAgence.id,
        activityType: i % 2 === 0 ? "CREDIT_INVESTIGATION" : "PROSPECTION",
        title: `Activity ${i + 1}`,
        description: `Test activity ${i + 1}`,
        priority: ["LOW", "MEDIUM", "HIGH", "URGENT"][i % 4] as any,
        dueDate: new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000),
        status: "PENDING",
        assignedBy: testSupervisor.id
      }).returning();
      
      activities.push(activity);
    }

    // Query agent activities
    const agentActivitiesList = await db.select()
      .from(agentActivities)
      .where(
        and(
          eq(agentActivities.assignedAgentId, testAgent.id),
          isNull(agentActivities.deletedAt)
        )
      );

    expect(agentActivitiesList.length).toBe(5);
    
    // Check different activity types
    const investigations = agentActivitiesList.filter(a => a.activityType === "CREDIT_INVESTIGATION");
    const prospections = agentActivitiesList.filter(a => a.activityType === "PROSPECTION");
    
    expect(investigations.length).toBe(3);
    expect(prospections.length).toBe(2);
  });

  it('should handle enquete reassignment', async () => {
    // Setup: Create assigned enquete
    const [demande] = await db.insert(demandesCredit).values({
      clientId: testClient.id,
      montantDemande: "300000",
      tauxInteret: "2.5",
      frequenceRemboursement: "DAILY",
      dureeValeur: 20,
      dureeUnite: "JOUR",
      typeRevenu: "Salarie",
      statut: "EN_ATTENTE",
      typeCredit: "PERSONNEL",
      objetCredit: "Besoins personnels",
      createdBy: testClient.id
    }).returning();

    const [enquete] = await db.insert(enquetesCredit).values({
      clientId: testClient.id,
      demandeId: demande.id,
      montantDemande: demande.montantDemande,
      objetCredit: demande.objetCredit,
      statut: "ASSIGNED",
      assignedAgentId: testAgent.id,
      assignedAt: new Date(),
      assignedBy: testSupervisor.id
    }).returning();

    // Create new agent for reassignment
    const newAgent = {
      id: uuidv4(),
      nom: "New Agent",
      email: "newagent@test.com",
      password: "test123",
      role: "agent_terrain" as const,
      agenceId: testAgence.id
    };
    await db.insert(users).values(newAgent);

    // Reassign enquete
    const [reassignedEnquete] = await db.update(enquetesCredit)
      .set({
        assignedAgentId: newAgent.id,
        assignedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(enquetesCredit.id, enquete.id))
      .returning();

    expect(reassignedEnquete.assignedAgentId).toBe(newAgent.id);

    // Update activity
    await db.update(agentActivities)
      .set({
        assignedAgentId: newAgent.id,
        previousAgentId: testAgent.id,
        reassignedAt: new Date(),
        reassignmentReason: "Agent initial indisponible"
      })
      .where(
        and(
          eq(agentActivities.referenceId, enquete.id),
          eq(agentActivities.referenceTable, "enquetes_credit")
        )
      );

    // Cleanup
    await db.delete(users).where(eq(users.id, newAgent.id));
  });
});