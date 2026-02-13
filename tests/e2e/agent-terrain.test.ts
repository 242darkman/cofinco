import { test, expect, Page } from '@playwright/test';
import { createTestFixture, type TestFixture } from './test-fixtures';

let fixture: TestFixture;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="username"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|agent/);
}

async function mockGeolocation(page: Page, lat: number, lng: number) {
  await page.context().setGeolocation({ latitude: lat, longitude: lng });
  await page.context().grantPermissions(['geolocation']);
}

// E2E Tests for Agent Terrain Module
test.describe('Agent Terrain Module', () => {
  test.beforeAll(async () => {
    fixture = await createTestFixture('agent');
  });

  test('Agent dashboard displays activities and metrics', async ({ page }) => {
    await test.step('Login as agent', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      await expect(page).toHaveURL(/\/agent\/(dashboard|terrain)/);
    });

    await test.step('Verify dashboard sections', async () => {
      // Check main metrics
      await expect(page.locator('[data-testid="activities-pending"]')).toBeVisible();
      await expect(page.locator('[data-testid="activities-completed"]')).toBeVisible();
      await expect(page.locator('[data-testid="performance-score"]')).toBeVisible();
      
      // Check activity list
      await expect(page.locator('h2:text("Activités du jour")')).toBeVisible();
      
      // Check upcoming activities
      await expect(page.locator('h2:text("Activités à venir")')).toBeVisible();
      
      // Check notifications
      await expect(page.locator('[data-notification-icon]')).toBeVisible();
    });

    await test.step('Navigate through sections', async () => {
      // Go to activities
      await page.click('text=Mes activités');
      await expect(page).toHaveURL(/activities/);
      
      // Go to prospections
      await page.click('text=Prospections');
      await expect(page).toHaveURL(/prospections/);
      
      // Go to investigations
      await page.click('text=Enquêtes crédit');
      await expect(page).toHaveURL(/enquetes/);
    });
  });

  test('Complete prospection workflow', async ({ page, context }) => {
    await mockGeolocation(page, -4.2634, 15.2429); // Brazzaville coordinates
    
    await test.step('Login and navigate to prospection', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      await page.click('text=Nouvelle prospection');
    });

    await test.step('Fill prospection form', async () => {
      // Client information
      await page.fill('input[name="nom"]', 'Prospect Test');
      await page.fill('input[name="telephone"]', '+242069999999');
      await page.fill('input[name="email"]', 'prospect@test.com');
      
      // Business information
      await page.selectOption('select[name="typeActivite"]', 'Commerce');
      await page.fill('input[name="nomEntreprise"]', 'Commerce Test');
      await page.fill('textarea[name="descriptionActivite"]', 'Vente de produits divers');
      await page.fill('input[name="revenuMensuelEstime"]', '500000');
      
      // Location
      await page.click('button:text("Capturer position GPS")');
      await page.waitForSelector('text=Position capturée');
      
      // Interest
      await page.selectOption('select[name="niveauInteret"]', 'ELEVE');
      await page.fill('input[name="montantCreditSouhaite"]', '300000');
      await page.selectOption('select[name="typeCreditSouhaite"]', 'COMMERCIAL');
      
      // Notes
      await page.fill('textarea[name="notes"]', "Prospect intéressant, à suivre");
    });

    await test.step('Take photo of business', async () => {
      // Mock camera capture
      await page.click('button:text("Prendre photo")');
      
      // In real test, would interact with camera
      // For E2E, we simulate by uploading a file
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles('tests/fixtures/business-photo.jpg');
      
      await expect(page.locator('img[alt="Photo activité"]')).toBeVisible();
    });

    await test.step('Save prospection', async () => {
      await page.click('button:text("Enregistrer la prospection")');
      await expect(page.locator('text=Prospection enregistrée')).toBeVisible();
    });

    await test.step('Verify prospection in list', async () => {
      await page.goto('/agent/prospections');
      await expect(page.locator('text=Prospect Test')).toBeVisible();
      await expect(page.locator('text=ELEVE')).toBeVisible();
    });
  });

  test('Agent completes field investigation', async ({ page, context }) => {
    await mockGeolocation(page, -4.2634, 15.2429);
    
    await test.step('Receive investigation assignment', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      
      // Check for notification
      await expect(page.locator('[data-notification-badge]')).toBeVisible();
      await page.click('[data-notification-icon]');
      await page.click('text=Nouvelle enquête assignée');
      
      // Should navigate to investigation
      await expect(page).toHaveURL(/enquetes\/[a-f0-9-]+/);
    });

    await test.step('Start investigation', async () => {
      await page.click('button:text("Commencer l\'enquête")');
      await expect(page.locator('text=Statut: EN_COURS')).toBeVisible();
      
      // Capture start time and location
      await page.click('button:text("Marquer présence sur site")');
      await expect(page.locator('text=Présence enregistrée')).toBeVisible();
    });

    await test.step('Fill investigation details', async () => {
      // Business verification
      await page.check('input[name="businessActivityVerified"]');
      await page.fill('input[name="businessLocation"]', "Marché Total, Bacongo");
      await page.selectOption('select[name="businessType"]', 'Commerce');
      await page.fill('input[name="businessAge"]', '36'); // months
      
      // Income assessment
      await page.fill('input[name="estimatedMonthlyIncome"]', '750000');
      await page.fill('input[name="estimatedDailyIncome"]', '28000');
      await page.selectOption('select[name="incomeVerificationMethod"]', 'OBSERVED');
      
      // Take photos
      await page.click('button:text("Photo du commerce")');
      await page.locator('input[type="file"]').setInputFiles('tests/fixtures/business.jpg');
      
      await page.click('button:text("Photo du stock")');
      await page.locator('input[type="file"]').nth(1).setInputFiles('tests/fixtures/stock.jpg');
      
      // Risk assessment
      await page.selectOption('select[name="riskLevel"]', 'MEDIUM');
      await page.check('input[value="Localisation éloignée"]');
      await page.check('input[value="Première demande"]');
      
      // Recommendation
      await page.selectOption('select[name="agentRecommendation"]', 'APPROVE_WITH_CAUTION');
      await page.fill('input[name="recommendedAmount"]', '400000');
      await page.fill('textarea[name="agentComments"]', 
        "Activité vérifiée et rentable. Réduire le montant pour première demande."
      );
    });

    await test.step('Submit investigation', async () => {
      await page.click('button:text("Soumettre l\'enquête")');
      
      // Confirm submission
      await page.click('button:text("Confirmer la soumission")');
      await expect(page.locator('text=Enquête soumise avec succès')).toBeVisible();
      
      // Should update activity status
      await expect(page.locator('text=Statut: COMPLETE')).toBeVisible();
    });
  });

  test('Agent activity tracking and performance', async ({ page }) => {
    await test.step('View activity history', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      await page.click('text=Mon historique');
      
      // Filter by date range
      await page.fill('input[name="dateFrom"]', '2024-01-01');
      await page.fill('input[name="dateTo"]', '2024-12-31');
      await page.click('button:text("Filtrer")');
      
      // Check activity list
      await expect(page.locator('table tbody tr').first()).toBeVisible();
      
      // Export report
      await page.click('button:text("Exporter")');
      const download = await page.waitForEvent('download');
      expect(download.suggestedFilename()).toContain('activities');
    });

    await test.step('View performance metrics', async () => {
      await page.click('text=Mes performances');
      
      // Check metrics display
      await expect(page.locator('text=Taux de complétion')).toBeVisible();
      await expect(page.locator('text=Temps moyen')).toBeVisible();
      await expect(page.locator('text=Score de qualité')).toBeVisible();
      
      // Check performance chart
      await expect(page.locator('canvas[data-testid="performance-chart"]')).toBeVisible();
    });

    await test.step('View commissions', async () => {
      await page.click('text=Mes commissions');
      
      // Check commission summary
      await expect(page.locator('text=Commissions du mois')).toBeVisible();
      await expect(page.locator('[data-testid="total-commissions"]')).toBeVisible();
      
      // View details
      await page.click('text=Voir détails');
      await expect(page.locator('table:has-text("Type")')).toBeVisible();
    });
  });

  test('Offline mode functionality', async ({ page, context }) => {
    await test.step('Login and cache data', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      
      // Wait for initial data sync
      await page.waitForSelector('text=Synchronisé');
      
      // Cache some activities
      await page.click('text=Télécharger pour hors ligne');
      await expect(page.locator('text=Données téléchargées')).toBeVisible();
    });

    // Go offline
    await context.setOffline(true);
    
    await test.step('Work offline', async () => {
      // Should show offline indicator
      await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
      
      // Navigate to activities (should work with cached data)
      await page.click('text=Mes activités');
      await expect(page.locator('text=Mode hors ligne')).toBeVisible();
      
      // Start an activity
      await page.locator('tr[data-activity-id]').first().click();
      await page.click('button:text("Commencer")');
      
      // Fill some data
      await page.fill('textarea[name="notes"]', 'Notes prises hors ligne');
      await page.click('button:text("Sauvegarder localement")');
      
      await expect(page.locator('text=Sauvegardé localement')).toBeVisible();
    });

    // Go back online
    await context.setOffline(false);
    
    await test.step('Sync offline changes', async () => {
      // Should detect connection
      await expect(page.locator('[data-testid="online-indicator"]')).toBeVisible();
      
      // Automatic sync should start
      await expect(page.locator('text=Synchronisation...')).toBeVisible();
      
      // Wait for sync completion
      await expect(page.locator('text=Synchronisation terminée')).toBeVisible({ timeout: 10000 });
      
      // Verify changes are synced
      await page.reload();
      await page.locator('tr[data-activity-id]').first().click();
      await expect(page.locator('text=Notes prises hors ligne')).toBeVisible();
    });
  });

  test('Real-time notifications and updates', async ({ page, browser }) => {
    const agentContext = await browser.newContext();
    const supervisorContext = await browser.newContext();
    
    const agentPage = await agentContext.newPage();
    const supervisorPage = await supervisorContext.newPage();
    
    await test.step('Setup connections', async () => {
      // Login agent
      await login(agentPage, fixture.agentEmail, fixture.password);
      
      // Login supervisor
      await login(supervisorPage, fixture.supervisorEmail, fixture.password);
    });

    await test.step('Supervisor assigns activity', async () => {
      // Supervisor creates and assigns activity
      await supervisorPage.goto('/supervisor/activities');
      await supervisorPage.click('button:text("Nouvelle activité")');
      await supervisorPage.selectOption('select[name="agentId"]', fixture.agentId);
      await supervisorPage.selectOption('select[name="activityType"]', 'CLIENT_VISIT');
      await supervisorPage.fill('input[name="title"]', 'Visite client urgent');
      await supervisorPage.selectOption('select[name="priority"]', 'URGENT');
      await supervisorPage.click('button:text("Assigner")');
    });

    await test.step('Agent receives real-time notification', async () => {
      // Agent should receive notification without refresh
      await expect(agentPage.locator('[data-notification-badge]')).toContainText('1', { timeout: 5000 });
      
      // Notification popup should appear
      await expect(agentPage.locator('text=Nouvelle activité assignée')).toBeVisible();
      await expect(agentPage.locator('text=Visite client urgent')).toBeVisible();
      
      // Activity should appear in list
      await expect(agentPage.locator('tr:has-text("Visite client urgent")')).toBeVisible();
      await expect(agentPage.locator('[data-priority="URGENT"]')).toBeVisible();
    });

    await test.step('Agent updates activity status', async () => {
      // Agent starts activity
      await agentPage.click('tr:has-text("Visite client urgent")');
      await agentPage.click('button:text("Commencer")');
    });

    await test.step('Supervisor sees real-time update', async () => {
      // Supervisor should see status change without refresh
      await expect(supervisorPage.locator('tr:has-text("Visite client urgent") [data-status]'))
        .toHaveText('EN_COURS', { timeout: 5000 });
      
      // Activity indicator should update
      await expect(supervisorPage.locator('[data-testid="active-agents-count"]'))
        .toContainText('1');
    });

    // Cleanup
    await agentContext.close();
    await supervisorContext.close();
  });

  test('Agent GPS tracking and route optimization', async ({ page, context }) => {
    await mockGeolocation(page, -4.2634, 15.2429);
    
    await test.step('Enable location tracking', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      await page.click('text=Paramètres');
      await page.check('input[name="enableLocationTracking"]');
      await page.click('button:text("Enregistrer")');
    });

    await test.step('View activities on map', async () => {
      await page.click('text=Carte des activités');
      
      // Map should load
      await expect(page.locator('[data-testid="activity-map"]')).toBeVisible();
      
      // Activities should be displayed as markers
      await expect(page.locator('[data-testid="activity-marker"]').first()).toBeVisible();
      
      // Click marker for details
      await page.locator('[data-testid="activity-marker"]').first().click();
      await expect(page.locator('[data-testid="activity-popup"]')).toBeVisible();
    });

    await test.step('Get optimized route', async () => {
      // Select multiple activities
      await page.locator('input[data-activity-select]').nth(0).check();
      await page.locator('input[data-activity-select]').nth(1).check();
      await page.locator('input[data-activity-select]').nth(2).check();
      
      // Request route optimization
      await page.click('button:text("Optimiser le trajet")');
      
      // Route should be calculated and displayed
      await expect(page.locator('[data-testid="optimized-route"]')).toBeVisible();
      await expect(page.locator('text=Distance totale')).toBeVisible();
      await expect(page.locator('text=Temps estimé')).toBeVisible();
      
      // Start navigation
      await page.click('button:text("Commencer la navigation")');
      await expect(page.locator('[data-testid="navigation-active"]')).toBeVisible();
    });

    await test.step('Track movement', async () => {
      // Simulate movement to next location
      await context.setGeolocation({ latitude: -4.2650, longitude: 15.2450 });
      await page.waitForTimeout(2000);
      
      // Location should update
      await expect(page.locator('[data-testid="current-location"]')).toContainText('-4.265');
      
      // Distance should be tracked
      await expect(page.locator('[data-testid="distance-traveled"]')).not.toHaveText('0 km');
    });
  });

  test('Agent document management', async ({ page }) => {
    await test.step('Upload documents', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      await page.click('text=Documents');
      
      // Upload multiple documents
      await page.click('button:text("Ajouter des documents")');
      
      const fileInput = await page.locator('input[type="file"][multiple]');
      await fileInput.setInputFiles([
        'tests/fixtures/id-card.pdf',
        'tests/fixtures/proof-of-address.pdf',
        'tests/fixtures/business-license.jpg'
      ]);
      
      // Set document types
      await page.selectOption('select[name="document-0-type"]', 'ID_CARD');
      await page.selectOption('select[name="document-1-type"]', 'PROOF_OF_ADDRESS');
      await page.selectOption('select[name="document-2-type"]', 'BUSINESS_LICENSE');
      
      await page.click('button:text("Téléverser")');
      await expect(page.locator('text=Documents téléversés')).toBeVisible();
    });

    await test.step('View and manage documents', async () => {
      // Documents should be listed
      await expect(page.locator('tr:has-text("id-card.pdf")')).toBeVisible();
      await expect(page.locator('tr:has-text("proof-of-address.pdf")')).toBeVisible();
      
      // Preview document
      await page.click('button[aria-label="Aperçu"]:near(tr:has-text("business-license.jpg"))');
      await expect(page.locator('img[alt="Aperçu du document"]')).toBeVisible();
      await page.click('button[aria-label="Fermer l\'aperçu"]');
      
      // Download document
      const downloadPromise = page.waitForEvent('download');
      await page.click('button[aria-label="Télécharger"]:near(tr:has-text("id-card.pdf"))');
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('id-card.pdf');
    });
  });

  test('Agent planning and scheduling', async ({ page }) => {
    await test.step('View weekly planning', async () => {
      await login(page, fixture.agentEmail, fixture.password);
      await page.click('text=Mon planning');
      
      // Calendar should be displayed
      await expect(page.locator('[data-testid="weekly-calendar"]')).toBeVisible();
      
      // Activities should be shown as events
      await expect(page.locator('[data-testid="calendar-event"]').first()).toBeVisible();
    });

    await test.step('Request time off', async () => {
      await page.click('button:text("Demander une absence")');
      
      await page.fill('input[name="startDate"]', '2024-12-25');
      await page.fill('input[name="endDate"]', '2024-12-26');
      await page.selectOption('select[name="reason"]', 'PERSONAL');
      await page.fill('textarea[name="notes"]', 'Fêtes de fin d\'année');
      
      await page.click('button:text("Soumettre la demande")');
      await expect(page.locator('text=Demande envoyée')).toBeVisible();
    });

    await test.step('View and reschedule activities', async () => {
      // Click on a scheduled activity
      await page.locator('[data-testid="calendar-event"]').first().click();
      
      // Activity details should appear
      await expect(page.locator('[data-testid="activity-details-modal"]')).toBeVisible();
      
      // Request reschedule
      await page.click('button:text("Demander un report")');
      await page.fill('input[name="newDate"]', '2024-12-20');
      await page.fill('textarea[name="reason"]', 'Client non disponible');
      await page.click('button:text("Envoyer la demande")');
      
      await expect(page.locator('text=Demande de report envoyée')).toBeVisible();
    });
  });
});

// Performance and stress tests
test.describe('Agent Module Performance', () => {
  test.beforeAll(async () => {
    if (!fixture) fixture = await createTestFixture('agent-perf');
  });

  test('Offline sync with large datasets', async ({ page, context }) => {
    // Create offline data
    const offlineData = [];
    for (let i = 0; i < 50; i++) {
      offlineData.push({
        type: 'investigation',
        data: {
          clientName: `Offline Client ${i}`,
          montantDemande: 100000 + i * 10000,
          observations: `Observation ${i}`,
          photos: [`photo${i}_1.jpg`, `photo${i}_2.jpg`]
        }
      });
    }

    await login(page, fixture.agentEmail, fixture.password);
    
    // Go offline
    await context.setOffline(true);
    
    // Simulate saving offline data
    await page.evaluate((data) => {
      localStorage.setItem('offline_queue', JSON.stringify(data));
    }, offlineData);

    // Go back online
    await context.setOffline(false);

    // Trigger sync
    await page.click('button:text("Synchroniser")');

    // Should handle large sync
    await expect(page.locator('text=50 éléments à synchroniser')).toBeVisible();
    await expect(page.locator('text=Synchronisation terminée')).toBeVisible({ timeout: 30000 });
  });

});