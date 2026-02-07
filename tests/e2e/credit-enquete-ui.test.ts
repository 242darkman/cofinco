import { test, expect, Page } from '@playwright/test';

// Helper to login
async function login(page: Page, role: 'admin' | 'superviseur' | 'agent' | 'caissier') {
  const credentials = {
    admin: { email: 'admin@cofinco.com', password: 'Admin@123' },
    superviseur: { email: 'supervisor@cofinco.com', password: 'Supervisor@123' },
    agent: { email: 'agent@cofinco.com', password: 'Agent@123' },
    caissier: { email: 'caissier@cofinco.com', password: 'Caissier@123' }
  };

  await page.goto('/login');
  await page.fill('input[name="email"]', credentials[role].email);
  await page.fill('input[name="password"]', credentials[role].password);
  await page.click('button[type="submit"]');
  
  // Wait for navigation to dashboard
  await page.waitForURL(/(dashboard|agent|caisse)/);
}

test.describe('Credit Enquete Workflow UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage and cookies
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('Complete credit workflow from application to disbursement', async ({ page }) => {
    // Step 1: Admin creates credit application
    await test.step('Create credit application', async () => {
      await login(page, 'admin');
      
      // Navigate to credits
      await page.click('nav >> text=Crédits');
      await page.click('text=Demandes de crédit');
      
      // Click new application button
      await page.click('button:has-text("Nouvelle demande")');
      
      // Fill the form
      await page.selectOption('select[name="clientId"]', { index: 1 }); // Select first client
      await page.fill('input[name="montantDemande"]', '500000');
      await page.selectOption('select[name="typeCredit"]', 'COMMERCIAL');
      await page.fill('textarea[name="objetCredit"]', 'Achat de marchandises pour commerce');
      await page.selectOption('select[name="frequenceRemboursement"]', 'DAILY');
      await page.fill('input[name="dureeValeur"]', '30');
      await page.selectOption('select[name="dureeUnite"]', 'JOUR');
      await page.fill('input[name="tauxInteret"]', '2.5');
      
      // Submit form
      await page.click('button:has-text("Enregistrer")');
      
      // Verify success message
      await expect(page.locator('text=Demande créée avec succès')).toBeVisible();
    });

    // Step 2: Supervisor assigns enquete to agent
    await test.step('Assign enquete to agent', async () => {
      await login(page, 'superviseur');
      
      // Navigate to enquetes
      await page.click('nav >> text=Crédits');
      await page.click('text=Enquêtes crédit');
      
      // Find pending enquete
      await page.click('tr:has-text("PENDING_ASSIGNMENT") >> button:has-text("Assigner")');
      
      // Assignment modal should open
      await expect(page.locator('h2:has-text("Assigner l\'enquête")')).toBeVisible();
      
      // Select agent
      await page.selectOption('select[name="agentId"]', { index: 1 });
      await page.selectOption('select[name="priority"]', 'HIGH');
      await page.fill('input[name="dueDate"]', '2024-12-31');
      await page.fill('textarea[name="notes"]', 'Client prioritaire, enquête urgente');
      
      // Confirm assignment
      await page.click('button:has-text("Confirmer l\'assignation")');
      
      // Verify assignment
      await expect(page.locator('text=Enquête assignée avec succès')).toBeVisible();
      
      // Status should change to ASSIGNED
      await expect(page.locator('tr:has-text("ASSIGNED")')).toBeVisible();
    });

    // Step 3: Agent conducts field investigation
    await test.step('Agent conducts investigation', async () => {
      await login(page, 'agent');
      
      // Check notification badge
      await expect(page.locator('[data-testid="notification-badge"]')).toContainText('1');
      
      // Click notification
      await page.click('[data-testid="notification-icon"]');
      await expect(page.locator('text=Nouvelle enquête assignée')).toBeVisible();
      await page.click('text=Voir détails');
      
      // Should navigate to enquete form
      await expect(page).toHaveURL(/enquete/);
      
      // Start investigation
      await page.click('button:has-text("Commencer l\'enquête")');
      
      // Fill business verification
      await page.check('input[name="businessActivityVerified"]');
      await page.selectOption('select[name="businessType"]', 'Commerce de détail');
      await page.fill('input[name="businessAge"]', '24');
      await page.fill('input[name="businessLocation"]', 'Marché Central, Brazzaville');
      await page.selectOption('select[name="businessStability"]', 'STABLE');
      
      // Fill income assessment
      await page.fill('input[name="estimatedMonthlyIncome"]', '800000');
      await page.fill('input[name="estimatedDailyIncome"]', '30000');
      await page.selectOption('select[name="incomeVerificationMethod"]', 'OBSERVED');
      await page.selectOption('select[name="incomeConsistency"]', 'CONSISTENT');
      
      // Fill household information
      await page.fill('input[name="householdSize"]', '5');
      await page.fill('input[name="dependents"]', '3');
      await page.selectOption('select[name="housingType"]', 'TENANT');
      await page.fill('input[name="monthlyExpenses"]', '200000');
      
      // Capture GPS location (if permission granted)
      await page.click('button:has-text("Capturer position GPS")');
      
      // Mock GPS permission
      await page.context().grantPermissions(['geolocation']);
      await page.context().setGeolocation({ latitude: -4.2634, longitude: 15.2429 });
      
      // Wait for GPS capture
      await expect(page.locator('text=Position capturée')).toBeVisible({ timeout: 10000 });
      
      // Take photo of business (mock file upload)
      const fileInput = page.locator('input[type="file"][name="businessPhoto"]');
      await fileInput.setInputFiles({
        name: 'business.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image-content')
      });
      
      // Risk assessment
      await page.selectOption('select[name="riskLevel"]', 'LOW');
      await page.check('input[value="Activité stable"]');
      await page.check('input[value="Bon historique"]');
      
      // Agent recommendation
      await page.selectOption('select[name="agentRecommendation"]', 'APPROVE');
      await page.fill('input[name="recommendedAmount"]', '500000');
      await page.fill('textarea[name="agentComments"]', 
        'Client sérieux avec une activité commerciale stable. ' +
        'Revenus vérifiés sur place. Bonne capacité de remboursement. ' +
        'Je recommande l\'approbation du crédit.'
      );
      
      // Submit investigation
      await page.click('button:has-text("Soumettre l\'enquête")');
      
      // Confirm submission
      await page.click('button:has-text("Confirmer")');
      
      // Success message
      await expect(page.locator('text=Enquête soumise avec succès')).toBeVisible();
    });

    // Step 4: Supervisor reviews investigation
    await test.step('Supervisor reviews investigation', async () => {
      await login(page, 'superviseur');
      
      // Navigate to submitted enquetes
      await page.click('nav >> text=Crédits');
      await page.click('text=Enquêtes à valider');
      
      // Find submitted enquete
      await page.click('tr:has-text("SUBMITTED") >> button:has-text("Examiner")');
      
      // Review modal should open
      await expect(page.locator('h2:has-text("Examen de l\'enquête")')).toBeVisible();
      
      // Check agent's recommendation
      await expect(page.locator('text=Recommandation: APPROVE')).toBeVisible();
      await expect(page.locator('text=Niveau de risque: LOW')).toBeVisible();
      
      // View field photos
      await page.click('button:has-text("Voir les photos")');
      await expect(page.locator('img[alt="Photo terrain"]')).toBeVisible();
      await page.click('button[aria-label="Fermer"]');
      
      // Approve investigation
      await page.click('button:has-text("Approuver l\'enquête")');
      await page.fill('textarea[name="supervisorNotes"]', 
        'Enquête complète et bien documentée. Approuvée pour passage en comité.'
      );
      await page.click('button:has-text("Confirmer l\'approbation")');
      
      // Success message
      await expect(page.locator('text=Enquête approuvée')).toBeVisible();
    });

    // Step 5: Credit committee approves the loan
    await test.step('Credit committee approval', async () => {
      await login(page, 'admin');
      
      // Navigate to credit committee
      await page.click('nav >> text=Crédits');
      await page.click('text=Comité de crédit');
      
      // Find credit application
      await page.click('tr:has-text("EN_COMITE") >> button:has-text("Examiner")');
      
      // Review all information
      await expect(page.locator('text=Enquête terrain: APPROUVÉE')).toBeVisible();
      await expect(page.locator('text=Risque: FAIBLE')).toBeVisible();
      
      // Approve credit
      await page.click('button:has-text("Approuver le crédit")');
      await page.fill('textarea[name="conditions"]', 'Conditions standards appliquées');
      await page.click('button:has-text("Confirmer l\'approbation")');
      
      // Success
      await expect(page.locator('text=Crédit approuvé')).toBeVisible();
    });

    // Step 6: Cashier disburses the loan
    await test.step('Loan disbursement', async () => {
      await login(page, 'caissier');
      
      // Navigate to pending disbursements
      await page.click('nav >> text=Caisse');
      await page.click('text=Décaissements en attente');
      
      // Find approved credit
      await page.click('tr:has-text("APPROVED") >> button:has-text("Décaisser")');
      
      // Disbursement modal
      await expect(page.locator('h2:has-text("Décaissement crédit")')).toBeVisible();
      
      // Select disbursement method
      await page.selectOption('select[name="disbursementChannel"]', 'CASH');
      await page.fill('input[name="paymentReference"]', 'CASH-2024-001');
      
      // Verify client identity
      await page.check('input[name="identityVerified"]');
      await page.fill('input[name="idNumber"]', 'CNI123456789');
      
      // Confirm disbursement
      await page.click('button:has-text("Confirmer le décaissement")');
      
      // Print receipt
      await page.click('button:has-text("Imprimer le reçu")');
      
      // Success
      await expect(page.locator('text=Décaissement effectué avec succès')).toBeVisible();
      
      // Credit should now be ACTIVE
      await page.click('text=Crédits actifs');
      await expect(page.locator('tr:has-text("ACTIVE")')).toBeVisible();
    });
  });

  test('Offline investigation submission', async ({ page, context }) => {
    await test.step('Go offline and submit investigation', async () => {
      await login(page, 'agent');
      
      // Navigate to investigations
      await page.click('text=Mes enquêtes');
      
      // Open an assigned investigation
      await page.click('tr:has-text("ASSIGNED") >> button:has-text("Traiter")');
      
      // Simulate offline mode
      await context.setOffline(true);
      
      // Offline indicator should appear
      await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
      
      // Fill investigation form
      await page.check('input[name="businessActivityVerified"]');
      await page.fill('input[name="estimatedMonthlyIncome"]', '600000');
      await page.selectOption('select[name="riskLevel"]', 'MEDIUM');
      await page.selectOption('select[name="agentRecommendation"]', 'APPROVE_WITH_CAUTION');
      await page.fill('textarea[name="agentComments"]', 'Enquête réalisée hors connexion');
      
      // Save locally
      await page.click('button:has-text("Sauvegarder hors ligne")');
      await expect(page.locator('text=Enquête sauvegardée localement')).toBeVisible();
      
      // Go back online
      await context.setOffline(false);
      
      // Sync should start automatically
      await expect(page.locator('text=Synchronisation en cours')).toBeVisible();
      await expect(page.locator('text=Synchronisation terminée')).toBeVisible({ timeout: 10000 });
    });
  });

  test('Real-time notification on assignment', async ({ browser }) => {
    // Create two browser contexts
    const supervisorContext = await browser.newContext();
    const agentContext = await browser.newContext();
    
    const supervisorPage = await supervisorContext.newPage();
    const agentPage = await agentContext.newPage();
    
    await test.step('Setup users', async () => {
      // Login supervisor
      await login(supervisorPage, 'superviseur');
      
      // Login agent
      await login(agentPage, 'agent');
      
      // Agent should be on dashboard
      await expect(agentPage.locator('h1:has-text("Tableau de bord")')).toBeVisible();
    });
    
    await test.step('Assign investigation and verify notification', async () => {
      // Supervisor assigns investigation
      await supervisorPage.click('text=Enquêtes crédit');
      await supervisorPage.click('button:has-text("Assigner")').first();
      await supervisorPage.selectOption('select[name="agentId"]', { index: 1 });
      await supervisorPage.click('button:has-text("Confirmer")');
      
      // Agent should receive notification in real-time (within 5 seconds)
      await expect(agentPage.locator('[data-testid="notification-badge"]'))
        .toContainText('1', { timeout: 5000 });
      
      // Notification toast should appear
      await expect(agentPage.locator('text=Nouvelle enquête assignée')).toBeVisible();
    });
    
    // Cleanup
    await supervisorContext.close();
    await agentContext.close();
  });

  test('Investigation rejection flow', async ({ page }) => {
    await test.step('Agent recommends rejection', async () => {
      await login(page, 'agent');
      
      // Open assigned investigation
      await page.click('text=Mes enquêtes');
      await page.click('tr:has-text("ASSIGNED") >> button:has-text("Traiter")');
      
      // Fill negative assessment
      await page.check('input[name="businessActivityVerified"]');
      await page.selectOption('select[name="businessStability"]', 'DECLINING');
      await page.fill('input[name="estimatedMonthlyIncome"]', '200000');
      await page.fill('input[name="monthlyExpenses"]', '180000');
      
      // High risk factors
      await page.selectOption('select[name="riskLevel"]', 'VERY_HIGH');
      await page.check('input[value="Revenus insuffisants"]');
      await page.check('input[value="Activité en déclin"]');
      await page.check('input[value="Pas de garanties"]');
      
      // Rejection recommendation
      await page.selectOption('select[name="agentRecommendation"]', 'REJECT');
      await page.fill('textarea[name="agentComments"]', 
        'Activité commerciale en déclin. Revenus insuffisants pour couvrir le remboursement. ' +
        'Risque très élevé. Je recommande le rejet de la demande.'
      );
      
      // Submit
      await page.click('button:has-text("Soumettre")');
      await page.click('button:has-text("Confirmer")');
      
      await expect(page.locator('text=Enquête soumise')).toBeVisible();
    });
    
    await test.step('Supervisor confirms rejection', async () => {
      await login(page, 'superviseur');
      
      await page.click('text=Enquêtes à valider');
      await page.click('tr:has-text("REJECT") >> button:has-text("Examiner")');
      
      // Review rejection
      await expect(page.locator('text=Recommandation: REJET')).toBeVisible();
      await expect(page.locator('text=Risque: TRÈS ÉLEVÉ')).toBeVisible();
      
      // Confirm rejection
      await page.click('button:has-text("Confirmer le rejet")');
      await page.fill('textarea[name="supervisorNotes"]', 
        'Rejet confirmé suite à l\'enquête terrain défavorable'
      );
      await page.click('button:has-text("Rejeter définitivement")');
      
      await expect(page.locator('text=Demande rejetée')).toBeVisible();
    });
  });
});