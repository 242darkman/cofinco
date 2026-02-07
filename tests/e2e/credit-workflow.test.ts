import { test, expect, Page } from '@playwright/test';
import { db } from '../../server/db';
import { users, sessions } from '../../shared/schema/auth';
import { clients } from '../../shared/schema/clients';
import { demandesCredit, enquetesCredit, credits } from '../../shared/schema/finance';
import { agentActivities } from '../../shared/schema/agent-activities';
import { agences } from '../../shared/schema/agences';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Test data
const testAgence = {
  id: uuidv4(),
  nom: "Agence Test E2E",
  ville: "Brazzaville",
  codeAgence: "AG-TEST-E2E"
};

const testSupervisor = {
  id: uuidv4(),
  nom: "Superviseur Test",
  email: "supervisor@test.com",
  password: "Test@1234",
  role: "superviseur",
  agenceId: testAgence.id
};

const testAgent = {
  id: uuidv4(),
  nom: "Agent Terrain Test",
  email: "agent@test.com",
  password: "Test@1234",
  role: "agent_terrain",
  agenceId: testAgence.id
};

const testCaissier = {
  id: uuidv4(),
  nom: "Caissier Test",
  email: "caissier@test.com",
  password: "Test@1234",
  role: "caissier",
  agenceId: testAgence.id
};

const testClient = {
  id: uuidv4(),
  nom: "Client Test",
  telephone: "+242060000000",
  email: "client@test.com",
  numeroCompte: "CLT-TEST-001",
  agenceId: testAgence.id
};

// Helper functions
async function setupTestData() {
  // Create test agency
  await db.insert(agences).values(testAgence).onConflictDoNothing();
  
  // Create test users
  await db.insert(users).values([testSupervisor, testAgent, testCaissier]).onConflictDoNothing();
  
  // Create test client
  await db.insert(clients).values(testClient).onConflictDoNothing();
}

async function cleanupTestData() {
  // Delete in reverse order of dependencies
  await db.delete(credits).where(eq(credits.clientId, testClient.id));
  await db.delete(enquetesCredit).where(eq(enquetesCredit.clientId, testClient.id));
  await db.delete(agentActivities).where(eq(agentActivities.assignedAgentId, testAgent.id));
  await db.delete(demandesCredit).where(eq(demandesCredit.clientId, testClient.id));
  await db.delete(clients).where(eq(clients.id, testClient.id));
  await db.delete(users).where(eq(users.agenceId, testAgence.id));
  await db.delete(agences).where(eq(agences.id, testAgence.id));
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/);
}

// E2E Tests
test.describe('Credit Workflow with Investigation', () => {
  test.beforeAll(async () => {
    await setupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test('Complete credit workflow from application to disbursement', async ({ page, context }) => {
    // Step 1: Client applies for credit
    await test.step('Client applies for credit', async () => {
      await page.goto('/');
      await page.click('text=Demander un crédit');
      
      // Fill credit application form
      await page.fill('input[name="montant"]', '500000');
      await page.selectOption('select[name="typeCredit"]', 'COMMERCIAL');
      await page.fill('textarea[name="objetCredit"]', 'Achat de marchandises');
      await page.selectOption('select[name="frequenceRemboursement"]', 'DAILY');
      await page.fill('input[name="dureeValeur"]', '30');
      await page.selectOption('select[name="dureeUnite"]', 'JOUR');
      
      // Submit application
      await page.click('button:text("Soumettre la demande")');
      await expect(page.locator('text=Demande soumise avec succès')).toBeVisible();
    });

    // Step 2: Supervisor assigns investigation to agent
    await test.step('Supervisor assigns investigation to agent', async () => {
      // Login as supervisor
      await login(page, testSupervisor.email, testSupervisor.password);
      
      // Navigate to credit applications
      await page.click('text=Crédits');
      await page.click('text=Demandes en attente');
      
      // Find the test client's application
      await page.click(`tr:has-text("${testClient.nom}")`);
      
      // Assign investigation
      await page.click('button:text("Assigner enquête")');
      await page.selectOption('select[name="agentId"]', testAgent.id);
      await page.fill('input[name="dueDate"]', '2024-12-31');
      await page.selectOption('select[name="priority"]', 'HIGH');
      await page.fill('textarea[name="notes"]', 'Enquête urgente pour client important');
      await page.click('button:text("Assigner")');
      
      await expect(page.locator('text=Enquête assignée avec succès')).toBeVisible();
      
      // Logout
      await page.click('button[aria-label="Déconnexion"]');
    });

    // Step 3: Agent receives notification and conducts investigation
    await test.step('Agent conducts field investigation', async () => {
      // Login as agent
      await login(page, testAgent.email, testAgent.password);
      
      // Check notification
      await expect(page.locator('[data-notification-badge]')).toHaveText('1');
      await page.click('[data-notification-icon]');
      await expect(page.locator('text=Nouvelle enquête assignée')).toBeVisible();
      
      // Navigate to activities
      await page.click('text=Mes activités');
      await page.click(`tr:has-text("Enquête crédit - 500000 FCFA")`);
      
      // Start investigation
      await page.click('button:text("Commencer l\'enquête")');
      
      // Fill investigation form
      await page.check('input[name="businessActivityVerified"]');
      await page.selectOption('select[name="businessType"]', 'Commerce');
      await page.fill('input[name="businessAge"]', '24'); // 24 months
      await page.fill('input[name="businessLocation"]', 'Marché Central Brazzaville');
      await page.selectOption('select[name="businessStability"]', 'STABLE');
      
      // Income assessment
      await page.fill('input[name="estimatedMonthlyIncome"]', '800000');
      await page.fill('input[name="estimatedDailyIncome"]', '30000');
      await page.selectOption('select[name="incomeVerificationMethod"]', 'OBSERVED');
      await page.selectOption('select[name="incomeConsistency"]', 'CONSISTENT');
      
      // Household situation
      await page.fill('input[name="householdSize"]', '5');
      await page.fill('input[name="dependents"]', '3');
      await page.selectOption('select[name="housingType"]', 'TENANT');
      await page.fill('input[name="monthlyExpenses"]', '200000');
      
      // Risk assessment
      await page.fill('input[name="repaymentCapacityAssessment"]', '600000');
      await page.fill('input[name="debtToIncomeRatio"]', '0.25');
      await page.selectOption('select[name="riskLevel"]', 'LOW');
      
      // Agent recommendation
      await page.selectOption('select[name="agentRecommendation"]', 'APPROVE');
      await page.fill('input[name="recommendedAmount"]', '500000');
      await page.fill('textarea[name="agentComments"]', 'Client sérieux avec activité stable. Bonne capacité de remboursement.');
      
      // Capture GPS location (mock)
      await page.click('button:text("Capturer position GPS")');
      await page.waitForTimeout(1000); // Wait for GPS
      
      // Take field photos (mock)
      await page.click('button:text("Prendre photo")');
      await page.waitForTimeout(500);
      
      // Submit investigation
      await page.click('button:text("Soumettre l\'enquête")');
      await expect(page.locator('text=Enquête soumise avec succès')).toBeVisible();
      
      // Logout
      await page.click('button[aria-label="Déconnexion"]');
    });

    // Step 4: Supervisor reviews investigation
    await test.step('Supervisor reviews investigation', async () => {
      // Login as supervisor
      await login(page, testSupervisor.email, testSupervisor.password);
      
      // Navigate to pending investigations
      await page.click('text=Crédits');
      await page.click('text=Enquêtes à valider');
      
      // Find and open investigation
      await page.click(`tr:has-text("${testClient.nom}"):has-text("SUBMITTED")`);
      
      // Review investigation details
      await expect(page.locator('text=Recommandation agent: APPROVE')).toBeVisible();
      await expect(page.locator('text=Niveau de risque: LOW')).toBeVisible();
      
      // Approve investigation
      await page.click('button:text("Approuver l\'enquête")');
      await page.fill('textarea[name="supervisorNotes"]', 'Enquête complète et détaillée. Approuvée.');
      await page.click('button:text("Confirmer l\'approbation")');
      
      await expect(page.locator('text=Enquête approuvée')).toBeVisible();
    });

    // Step 5: Credit committee approves loan
    await test.step('Credit committee approves loan', async () => {
      // Navigate to credit approval
      await page.click('text=Comité de crédit');
      await page.click(`tr:has-text("${testClient.nom}")`);
      
      // Review all information
      await expect(page.locator('text=Enquête terrain: APPROVED')).toBeVisible();
      
      // Approve credit
      await page.click('button:text("Approuver le crédit")');
      await page.fill('input[name="tauxInteret"]', '2.5');
      await page.fill('textarea[name="conditions"]', 'Conditions standards');
      await page.click('button:text("Confirmer l\'approbation")');
      
      await expect(page.locator('text=Crédit approuvé')).toBeVisible();
      
      // Logout
      await page.click('button[aria-label="Déconnexion"]');
    });

    // Step 6: Cashier disburses the loan
    await test.step('Cashier disburses the loan', async () => {
      // Login as cashier
      await login(page, testCaissier.email, testCaissier.password);
      
      // Navigate to pending disbursements
      await page.click('text=Caisse');
      await page.click('text=Décaissements en attente');
      
      // Find the approved credit
      await page.click(`tr:has-text("${testClient.nom}")`);
      
      // Process disbursement
      await page.click('button:text("Procéder au décaissement")');
      await page.selectOption('select[name="disbursementChannel"]', 'CASH');
      await page.fill('input[name="paymentReference"]', 'CASH-001-2024');
      
      // Confirm disbursement
      await page.click('button:text("Confirmer le décaissement")');
      await expect(page.locator('text=Décaissement effectué')).toBeVisible();
      
      // Print receipt
      await page.click('button:text("Imprimer le reçu")');
      await page.waitForTimeout(1000); // Wait for print dialog
    });

    // Step 7: Verify credit is active
    await test.step('Verify credit is active', async () => {
      // Check credit status in database
      const [credit] = await db
        .select()
        .from(credits)
        .where(eq(credits.clientId, testClient.id))
        .limit(1);
      
      expect(credit).toBeDefined();
      expect(credit.statut).toBe('ACTIVE');
      expect(credit.disbursementStatus).toBe('DISBURSED');
      
      // Navigate to active credits
      await page.click('text=Crédits actifs');
      await expect(page.locator(`tr:has-text("${testClient.nom}"):has-text("ACTIVE")`)).toBeVisible();
    });
  });

  test('Offline investigation submission and sync', async ({ page, context }) => {
    // Enable offline mode
    await context.setOffline(true);
    
    await test.step('Agent submits investigation offline', async () => {
      // Login as agent (assuming cached session)
      await page.goto('/agent/activities');
      
      // Open investigation form
      await page.click('text=Enquête hors ligne');
      
      // Fill basic investigation data
      await page.fill('input[name="clientName"]', 'Client Offline Test');
      await page.fill('input[name="montantDemande"]', '300000');
      await page.fill('textarea[name="observations"]', 'Enquête réalisée hors connexion');
      
      // Save offline
      await page.click('button:text("Sauvegarder hors ligne")');
      await expect(page.locator('text=Enquête sauvegardée localement')).toBeVisible();
    });
    
    // Re-enable network
    await context.setOffline(false);
    
    await test.step('Sync offline data', async () => {
      // Trigger sync
      await page.click('button:text("Synchroniser")');
      await expect(page.locator('text=Synchronisation en cours')).toBeVisible();
      
      // Wait for sync completion
      await expect(page.locator('text=Synchronisation terminée')).toBeVisible({ timeout: 10000 });
      
      // Verify data is synced
      await page.reload();
      await expect(page.locator('text=Client Offline Test')).toBeVisible();
    });
  });

  test('Real-time notifications for investigation updates', async ({ page, browser }) => {
    // Open two browser contexts for supervisor and agent
    const supervisorContext = await browser.newContext();
    const agentContext = await browser.newContext();
    
    const supervisorPage = await supervisorContext.newPage();
    const agentPage = await agentContext.newPage();
    
    await test.step('Setup: Login both users', async () => {
      // Login supervisor
      await login(supervisorPage, testSupervisor.email, testSupervisor.password);
      
      // Login agent
      await login(agentPage, testAgent.email, testAgent.password);
    });
    
    await test.step('Real-time assignment notification', async () => {
      // Supervisor assigns investigation
      await supervisorPage.goto('/credits/investigations');
      await supervisorPage.click('button:text("Nouvelle assignation")');
      await supervisorPage.selectOption('select[name="agentId"]', testAgent.id);
      await supervisorPage.click('button:text("Assigner")');
      
      // Agent should receive notification in real-time
      await expect(agentPage.locator('[data-notification-badge]')).toHaveText('1', { timeout: 5000 });
      await expect(agentPage.locator('text=Nouvelle enquête assignée')).toBeVisible();
    });
    
    await test.step('Real-time submission notification', async () => {
      // Agent submits investigation
      await agentPage.goto('/agent/activities');
      await agentPage.click('text=Soumettre enquête');
      
      // Supervisor should receive notification
      await expect(supervisorPage.locator('[data-notification-badge]')).toContainText('1', { timeout: 5000 });
      await expect(supervisorPage.locator('text=Enquête soumise')).toBeVisible();
    });
    
    // Cleanup
    await supervisorContext.close();
    await agentContext.close();
  });

  test('Investigation reassignment flow', async ({ page }) => {
    await test.step('Initial assignment', async () => {
      await login(page, testSupervisor.email, testSupervisor.password);
      
      // Create and assign investigation
      await page.goto('/credits/investigations');
      await page.click('button:text("Nouvelle enquête")');
      await page.selectOption('select[name="agentId"]', testAgent.id);
      await page.click('button:text("Assigner")');
      
      const investigationId = await page.getAttribute('[data-investigation-id]', 'data-investigation-id');
      expect(investigationId).toBeTruthy();
    });
    
    await test.step('Reassign to different agent', async () => {
      // Find investigation
      await page.click('[data-investigation-actions]');
      await page.click('text=Réassigner');
      
      // Select new agent
      await page.selectOption('select[name="newAgentId"]', 'other-agent-id');
      await page.fill('textarea[name="reason"]', "Agent initial indisponible");
      await page.click('button:text("Confirmer la réassignation")');
      
      await expect(page.locator('text=Enquête réassignée')).toBeVisible();
    });
    
    await test.step('Verify reassignment history', async () => {
      await page.click('text=Historique');
      await expect(page.locator('text=REASSIGNED')).toBeVisible();
      await expect(page.locator('text=Agent initial indisponible')).toBeVisible();
    });
  });

  test('Credit workflow with rejection at investigation stage', async ({ page }) => {
    await test.step('Agent recommends rejection', async () => {
      await login(page, testAgent.email, testAgent.password);
      
      // Open investigation
      await page.goto('/agent/activities');
      await page.click('text=Enquête à traiter');
      
      // Fill investigation with negative assessment
      await page.selectOption('select[name="agentRecommendation"]', 'REJECT');
      await page.selectOption('select[name="riskLevel"]', 'VERY_HIGH');
      await page.fill('textarea[name="agentComments"]', 'Activité non vérifiable, revenus incertains');
      
      await page.click('button:text("Soumettre")');
    });
    
    await test.step('Supervisor reviews rejection', async () => {
      await login(page, testSupervisor.email, testSupervisor.password);
      
      await page.goto('/credits/investigations');
      await page.click('text=À valider');
      
      // Review rejection recommendation
      await expect(page.locator('text=Recommandation: REJECT')).toBeVisible();
      
      // Confirm rejection
      await page.click('button:text("Confirmer le rejet")');
      await page.fill('textarea[name="supervisorNotes"]', "Rejet confirmé suite à l'enquête terrain");
      await page.click('button:text("Rejeter définitivement")');
      
      await expect(page.locator('text=Demande de crédit rejetée')).toBeVisible();
    });
    
    await test.step('Verify credit application is rejected', async () => {
      // Check in database
      const [demande] = await db
        .select()
        .from(demandesCredit)
        .where(eq(demandesCredit.clientId, testClient.id))
        .orderBy(demandesCredit.createdAt, 'desc')
        .limit(1);
      
      expect(demande.statut).toBe('REJECTED');
    });
  });
});

// Performance tests
test.describe('Credit Workflow Performance', () => {
  test('Should handle concurrent investigations', async ({ browser }) => {
    const contexts = [];
    const pages = [];
    
    // Create 10 concurrent agent sessions
    for (let i = 0; i < 10; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
    }
    
    // All agents submit investigations simultaneously
    const promises = pages.map(async (page, index) => {
      await login(page, `agent${index}@test.com`, 'Test@1234');
      await page.goto('/agent/activities');
      await page.click('text=Soumettre enquête');
      // ... fill and submit
      return page.waitForSelector('text=Enquête soumise');
    });
    
    // All should complete within reasonable time
    await Promise.all(promises);
    
    // Cleanup
    await Promise.all(contexts.map(c => c.close()));
  });
  
  test('Should maintain data consistency under load', async ({ page }) => {
    // Simulate rapid status changes
    await login(page, testSupervisor.email, testSupervisor.password);
    
    for (let i = 0; i < 20; i++) {
      await page.goto('/credits/investigations');
      await page.click('button:text("Assigner")');
      await page.selectOption('select[name="agentId"]', testAgent.id);
      await page.click('button:text("Confirmer")');
      
      // Immediately reassign
      await page.click('button:text("Réassigner")');
      await page.selectOption('select[name="agentId"]', 'other-agent-id');
      await page.click('button:text("Confirmer")');
    }
    
    // Verify final state is consistent
    const activities = await db
      .select()
      .from(agentActivities)
      .where(eq(agentActivities.activityType, 'CREDIT_INVESTIGATION'));
    
    activities.forEach(activity => {
      expect(activity.assignedAgentId).toBeDefined();
      expect(activity.status).toMatch(/PENDING|IN_PROGRESS|COMPLETED/);
    });
  });
});