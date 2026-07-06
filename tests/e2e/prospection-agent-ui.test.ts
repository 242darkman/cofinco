import { test, expect, Page } from '@playwright/test';

// Helper to login
async function login(page: Page, role: 'admin' | 'superviseur' | 'agent' | 'caissier') {
  const credentials = {
    admin: { email: 'admin@microflex.com', password: 'Admin@123' },
    superviseur: { email: 'supervisor@microflex.com', password: 'Supervisor@123' },
    agent: { email: 'agent@microflex.com', password: 'Agent@123' },
    caissier: { email: 'caissier@microflex.com', password: 'Caissier@123' }
  };

  await page.goto('/login');
  await page.fill('input[name="email"]', credentials[role].email);
  await page.fill('input[name="password"]', credentials[role].password);
  await page.click('button[type="submit"]');
  
  // Wait for navigation to dashboard
  await page.waitForURL(/(dashboard|agent|caisse)/);
}

test.describe('Agent Prospection Workflow UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage and cookies
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('Complete prospection workflow with GPS and photos', async ({ page, context }) => {
    // Step 1: Agent starts new prospection
    await test.step('Start new prospection', async () => {
      await login(page, 'agent');
      
      // Navigate to prospection
      await page.click('nav >> text=Prospection');
      await page.click('text=Nouvelle prospection');
      
      // Should open prospection form
      await expect(page.locator('h2:has-text("Nouvelle prospection")')).toBeVisible();
      
      // Grant geolocation permission
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: -4.2634, longitude: 15.2429 });
      
      // Capture GPS location
      await page.click('button:has-text("Capturer position GPS")');
      await expect(page.locator('text=Position capturée')).toBeVisible({ timeout: 10000 });
      
      // Fill prospect information
      await page.fill('input[name="businessName"]', 'Boutique Moderne');
      await page.selectOption('select[name="businessType"]', 'Commerce de détail');
      await page.fill('input[name="ownerName"]', 'Jean Makaya');
      await page.fill('input[name="phoneNumber"]', '+243812345678');
      await page.fill('input[name="email"]', 'jean.makaya@example.com');
      
      // Business details
      await page.fill('textarea[name="businessAddress"]', 'Avenue de la Paix, Marché Central, Brazzaville');
      await page.fill('input[name="monthlyRevenue"]', '1500000');
      await page.fill('input[name="employeeCount"]', '5');
      await page.selectOption('select[name="businessAge"]', '2-5 ans');
      
      // Take business photo (mock file upload)
      const businessPhotoInput = page.locator('input[type="file"][name="businessPhoto"]');
      await businessPhotoInput.setInputFiles({
        name: 'business-front.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-business-image')
      });
      
      // Take owner photo
      const ownerPhotoInput = page.locator('input[type="file"][name="ownerPhoto"]');
      await ownerPhotoInput.setInputFiles({
        name: 'owner-portrait.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-owner-image')
      });
      
      // Interest in services
      await page.check('input[value="credit"]');
      await page.check('input[value="epargne"]');
      await page.check('input[value="mobile_banking"]');
      
      // Estimated credit need
      await page.fill('input[name="creditAmount"]', '500000');
      await page.selectOption('select[name="creditPurpose"]', 'Fonds de roulement');
      
      // Competition analysis
      await page.check('input[name="hasOtherMicrofinance"]');
      await page.fill('input[name="otherMicrofinanceName"]', 'MicroFin Plus');
      
      // Agent notes
      await page.fill('textarea[name="agentNotes"]', 
        'Prospect très intéressé par nos services. ' +
        'Commerce bien établi avec une clientèle fidèle. ' +
        'Potentiel client prioritaire.'
      );
      
      // Qualification score
      await page.selectOption('select[name="qualificationScore"]', 'HOT');
      
      // Save prospection
      await page.click('button:has-text("Enregistrer la prospection")');
      
      // Success message
      await expect(page.locator('text=Prospection enregistrée avec succès')).toBeVisible();
    });

    // Step 2: Supervisor reviews prospection
    await test.step('Supervisor reviews prospection', async () => {
      await login(page, 'superviseur');
      
      // Navigate to prospections
      await page.click('nav >> text=Prospection');
      await page.click('text=Prospections à valider');
      
      // Find new prospection
      await page.click('tr:has-text("Boutique Moderne") >> button:has-text("Examiner")');
      
      // Review modal should open
      await expect(page.locator('h2:has-text("Examen de la prospection")')).toBeVisible();
      
      // Check captured data
      await expect(page.locator('text=Qualification: HOT')).toBeVisible();
      await expect(page.locator('text=Revenus mensuels: 1,500,000 FCFA')).toBeVisible();
      
      // View photos
      await page.click('button:has-text("Voir les photos")');
      await expect(page.locator('img[alt="Photo commerce"]')).toBeVisible();
      await expect(page.locator('img[alt="Photo propriétaire"]')).toBeVisible();
      await page.click('button[aria-label="Fermer"]');
      
      // View location on map
      await page.click('button:has-text("Voir sur la carte")');
      await expect(page.locator('[data-testid="map-view"]')).toBeVisible();
      await page.click('button[aria-label="Fermer"]');
      
      // Approve and convert to lead
      await page.click('button:has-text("Approuver et convertir")');
      await page.selectOption('select[name="assignTo"]', { index: 1 });
      await page.fill('textarea[name="conversionNotes"]', 
        'Prospect qualifié. À contacter rapidement pour proposition commerciale.'
      );
      await page.click('button:has-text("Convertir en lead")');
      
      // Success message
      await expect(page.locator('text=Prospect converti en lead')).toBeVisible();
    });

    // Step 3: Agent follows up on lead
    await test.step('Agent follows up on converted lead', async () => {
      await login(page, 'agent');
      
      // Check notification for new lead
      await expect(page.locator('[data-testid="notification-badge"]')).toContainText('1');
      
      // Click notification
      await page.click('[data-testid="notification-icon"]');
      await expect(page.locator('text=Nouveau lead assigné')).toBeVisible();
      await page.click('text=Voir détails');
      
      // Should navigate to lead details
      await expect(page).toHaveURL(/leads/);
      await expect(page.locator('h1:has-text("Boutique Moderne")')).toBeVisible();
      
      // Schedule follow-up
      await page.click('button:has-text("Programmer un suivi")');
      await page.selectOption('select[name="followUpType"]', 'Visite sur site');
      await page.fill('input[name="followUpDate"]', '2024-12-25');
      await page.fill('input[name="followUpTime"]', '10:00');
      await page.fill('textarea[name="followUpNotes"]', 'Présentation des produits de crédit');
      await page.click('button:has-text("Programmer")');
      
      // Success
      await expect(page.locator('text=Suivi programmé')).toBeVisible();
    });
  });

  test('Offline prospection with sync', async ({ page, context }) => {
    await test.step('Create prospection offline', async () => {
      await login(page, 'agent');
      
      // Navigate to prospection
      await page.click('nav >> text=Prospection');
      await page.click('text=Nouvelle prospection');
      
      // Go offline
      await context.setOffline(true);
      
      // Offline indicator should appear
      await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
      
      // Fill basic prospection form
      await page.fill('input[name="businessName"]', 'Épicerie du Coin');
      await page.selectOption('select[name="businessType"]', 'Commerce de proximité');
      await page.fill('input[name="ownerName"]', 'Marie Nguema');
      await page.fill('input[name="phoneNumber"]', '+243823456789');
      
      // Business details
      await page.fill('textarea[name="businessAddress"]', 'Rue 15, Quartier Moungali');
      await page.fill('input[name="monthlyRevenue"]', '800000');
      await page.selectOption('select[name="qualificationScore"]', 'WARM');
      
      // Save locally
      await page.click('button:has-text("Sauvegarder hors ligne")');
      await expect(page.locator('text=Prospection sauvegardée localement')).toBeVisible();
      
      // Verify it's in local queue
      await page.click('text=Prospections hors ligne (1)');
      await expect(page.locator('text=Épicerie du Coin')).toBeVisible();
      
      // Go back online
      await context.setOffline(false);
      
      // Auto-sync should start
      await expect(page.locator('text=Synchronisation en cours')).toBeVisible();
      await expect(page.locator('text=1 prospection(s) synchronisée(s)')).toBeVisible({ timeout: 10000 });
      
      // Queue should be empty
      await expect(page.locator('text=Prospections hors ligne (0)')).toBeVisible();
    });
  });

  test('Bulk prospection import from Excel', async ({ page }) => {
    await test.step('Import prospects from Excel file', async () => {
      await login(page, 'superviseur');
      
      // Navigate to prospection
      await page.click('nav >> text=Prospection');
      await page.click('text=Import en masse');
      
      // Import modal should open
      await expect(page.locator('h2:has-text("Importer des prospects")')).toBeVisible();
      
      // Download template
      await page.click('a:has-text("Télécharger le modèle Excel")');
      
      // Mock Excel file upload
      const excelInput = page.locator('input[type="file"][accept=".xlsx,.xls"]');
      
      // Create mock Excel file content
      const mockExcelContent = Buffer.from('mock-excel-data');
      await excelInput.setInputFiles({
        name: 'prospects-import.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: mockExcelContent
      });
      
      // Preview should show
      await expect(page.locator('text=10 prospects détectés')).toBeVisible();
      await expect(page.locator('table >> text=Boutique Alpha')).toBeVisible();
      
      // Map fields
      await page.selectOption('select[name="fieldMapping.businessName"]', 'Nom Commerce');
      await page.selectOption('select[name="fieldMapping.ownerName"]', 'Propriétaire');
      await page.selectOption('select[name="fieldMapping.phoneNumber"]', 'Téléphone');
      
      // Assign to agents
      await page.selectOption('select[name="defaultAssignment"]', 'Répartition équitable');
      
      // Start import
      await page.click('button:has-text("Lancer l\'import")');
      
      // Progress bar
      await expect(page.locator('[role="progressbar"]')).toBeVisible();
      await expect(page.locator('text=Import terminé: 10/10')).toBeVisible({ timeout: 15000 });
      
      // Success summary
      await expect(page.locator('text=10 prospects importés avec succès')).toBeVisible();
    });
  });

  test('Prospection with geofencing alerts', async ({ page, context }) => {
    await test.step('Agent enters designated zone', async () => {
      await login(page, 'agent');
      
      // Grant permissions
      await context.grantPermissions(['geolocation', 'notifications']);
      
      // Set initial location outside zone
      await context.setGeolocation({ latitude: -4.3000, longitude: 15.3000 });
      
      // Enable geofencing
      await page.click('nav >> text=Paramètres');
      await page.click('text=Zones de prospection');
      await page.check('input[name="enableGeofencing"]');
      await page.click('button:has-text("Activer les alertes")');
      
      // Navigate back to prospection
      await page.click('nav >> text=Prospection');
      
      // Simulate entering a hot zone
      await context.setGeolocation({ latitude: -4.2634, longitude: 15.2429 });
      
      // Alert should appear
      await expect(page.locator('[data-testid="geofence-alert"]')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Zone de prospection détectée')).toBeVisible();
      await expect(page.locator('text=5 prospects potentiels à proximité')).toBeVisible();
      
      // View nearby prospects
      await page.click('button:has-text("Voir les prospects")');
      await expect(page.locator('[data-testid="nearby-prospects-list"]')).toBeVisible();
      await expect(page.locator('text=Restaurant Le Palmier (200m)')).toBeVisible();
      
      // Start quick prospection
      await page.click('tr:has-text("Restaurant Le Palmier") >> button:has-text("Prospecter")');
      
      // Quick form should open with pre-filled location
      await expect(page.locator('input[name="latitude"]')).toHaveValue('-4.2634');
      await expect(page.locator('input[name="longitude"]')).toHaveValue('15.2429');
    });
  });

  test('Prospection performance dashboard', async ({ page }) => {
    await test.step('View agent prospection metrics', async () => {
      await login(page, 'superviseur');
      
      // Navigate to dashboard
      await page.click('nav >> text=Tableau de bord');
      await page.click('text=Performance Prospection');
      
      // Dashboard should load
      await expect(page.locator('h1:has-text("Performance Prospection")')).toBeVisible();
      
      // Key metrics should be visible
      await expect(page.locator('[data-testid="total-prospects"]')).toBeVisible();
      await expect(page.locator('[data-testid="conversion-rate"]')).toBeVisible();
      await expect(page.locator('[data-testid="avg-qualification-score"]')).toBeVisible();
      
      // Agent leaderboard
      await expect(page.locator('h2:has-text("Top Agents")')).toBeVisible();
      await expect(page.locator('table >> text=Agent Mambou')).toBeVisible();
      
      // Filter by date range
      await page.click('button:has-text("Cette semaine")');
      await page.click('text=Ce mois');
      
      // Charts should update
      await expect(page.locator('[data-testid="prospection-chart"]')).toBeVisible();
      
      // Download report
      await page.click('button:has-text("Exporter rapport")');
      await page.selectOption('select[name="reportFormat"]', 'PDF');
      await page.click('button:has-text("Télécharger")');
      
      // Success message
      await expect(page.locator('text=Rapport généré')).toBeVisible();
    });
  });

  test('Real-time collaboration on prospects', async ({ browser }) => {
    // Create two browser contexts for different agents
    const agent1Context = await browser.newContext();
    const agent2Context = await browser.newContext();
    
    const agent1Page = await agent1Context.newPage();
    const agent2Page = await agent2Context.newPage();
    
    await test.step('Setup agents', async () => {
      // Login both agents
      await login(agent1Page, 'agent');
      await login(agent2Page, 'agent');
      
      // Both navigate to prospects list
      await agent1Page.click('nav >> text=Prospection');
      await agent2Page.click('nav >> text=Prospection');
      
      await agent1Page.click('text=Liste des prospects');
      await agent2Page.click('text=Liste des prospects');
    });
    
    await test.step('Agent 1 locks a prospect', async () => {
      // Agent 1 opens a prospect
      await agent1Page.click('tr:has-text("Boutique Test") >> button:has-text("Modifier")');
      
      // Lock indicator should appear for Agent 2
      await expect(agent2Page.locator('tr:has-text("Boutique Test") >> [data-testid="lock-icon"]'))
        .toBeVisible({ timeout: 5000 });
      await expect(agent2Page.locator('text=En cours de modification par Agent Mambou'))
        .toBeVisible();
      
      // Agent 2 tries to edit - should be blocked
      await agent2Page.click('tr:has-text("Boutique Test") >> button:has-text("Modifier")');
      await expect(agent2Page.locator('text=Ce prospect est actuellement modifié')).toBeVisible();
    });
    
    await test.step('Agent 1 adds a note visible in real-time', async () => {
      // Agent 1 adds a note
      await agent1Page.fill('textarea[name="newNote"]', 'Contact établi, RDV pris pour demain');
      await agent1Page.click('button:has-text("Ajouter note")');
      
      // Note should appear for Agent 2 in real-time
      await expect(agent2Page.locator('text=Contact établi, RDV pris pour demain'))
        .toBeVisible({ timeout: 5000 });
      
      // Activity indicator
      await expect(agent2Page.locator('[data-testid="activity-indicator"]'))
        .toContainText('Agent Mambou vient d\'ajouter une note');
    });
    
    // Cleanup
    await agent1Context.close();
    await agent2Context.close();
  });
});