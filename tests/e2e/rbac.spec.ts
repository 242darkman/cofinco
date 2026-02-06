import { test, expect, testUsers, login } from './fixtures/auth';

/**
 * RBAC E2E Tests
 *
 * Tests for:
 * - E2E-01: Module visibility based on role permissions
 * - E2E-02: Action buttons visibility based on permissions
 * - E2E-03: Direct URL access protection (403 redirect)
 * - E2E-04: Real-time permission updates via WebSocket
 */

test.describe('E2E-01: Module Visibility by Role', () => {
  test('Admin should see all modules in navigation', async ({ page }) => {
    const user = testUsers.admin;
    await login(page, user);

    // Check sidebar navigation
    const sidebar = page.getByRole('navigation');

    for (const moduleName of user.expectedModules) {
      await expect(
        sidebar.getByRole('link', { name: new RegExp(moduleName, 'i') })
      ).toBeVisible();
    }
  });

  test('Caissier should only see authorized modules', async ({ page }) => {
    const user = testUsers.caissier;
    await login(page, user);

    const sidebar = page.getByRole('navigation');

    // Should see expected modules
    for (const moduleName of user.expectedModules) {
      await expect(
        sidebar.getByRole('link', { name: new RegExp(moduleName, 'i') })
      ).toBeVisible();
    }

    // Should NOT see forbidden modules
    for (const moduleName of user.forbiddenModules) {
      await expect(
        sidebar.getByRole('link', { name: new RegExp(moduleName, 'i') })
      ).not.toBeVisible();
    }
  });

  test('Agent Terrain should have limited module access', async ({ page }) => {
    const user = testUsers.agentTerrain;
    await login(page, user);

    const sidebar = page.getByRole('navigation');

    // Should see expected modules
    for (const moduleName of user.expectedModules) {
      await expect(
        sidebar.getByRole('link', { name: new RegExp(moduleName, 'i') })
      ).toBeVisible();
    }

    // Should NOT see forbidden modules
    for (const moduleName of user.forbiddenModules) {
      await expect(
        sidebar.getByRole('link', { name: new RegExp(moduleName, 'i') })
      ).not.toBeVisible();
    }
  });
});

test.describe('E2E-02: Action Buttons Visibility', () => {
  test('Admin should see all CRUD buttons on clients page', async ({ page }) => {
    await login(page, testUsers.admin);

    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Should see create button
    await expect(
      page.getByRole('button', { name: /nouveau|ajouter|créer/i })
    ).toBeVisible();

    // Navigate to client detail (if any clients exist)
    const clientRows = page.getByRole('row').filter({ hasText: /@/ });
    if ((await clientRows.count()) > 0) {
      await clientRows.first().click();
      await page.waitForURL(/\/clients\/.+/);

      // Should see edit/delete buttons
      await expect(
        page.getByRole('button', { name: /modifier|éditer/i })
      ).toBeVisible();
    }
  });

  test('Agent Terrain should not see delete button on clients', async ({ page }) => {
    await login(page, testUsers.agentTerrain);

    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    // Navigate to client detail
    const clientRows = page.getByRole('row').filter({ hasText: /@/ });
    if ((await clientRows.count()) > 0) {
      await clientRows.first().click();
      await page.waitForURL(/\/clients\/.+/);

      // Should NOT see delete button
      await expect(
        page.getByRole('button', { name: /supprimer|delete/i })
      ).not.toBeVisible();
    }
  });

  test('Caissier should see caisse operations buttons', async ({ page }) => {
    await login(page, testUsers.caissier);

    await page.goto('/caisse');
    await page.waitForLoadState('networkidle');

    // Should see deposit/withdraw buttons
    await expect(
      page.getByRole('button', { name: /dépôt|encaissement/i })
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: /retrait|décaissement/i })
    ).toBeVisible();
  });
});

test.describe('E2E-03: Direct URL Protection', () => {
  test('Unauthorized user should be redirected from admin page', async ({ page }) => {
    // Login as non-admin
    await login(page, testUsers.caissier);

    // Try to access admin page directly
    await page.goto('/admin');

    // Should be redirected or see forbidden message
    await expect(page).toHaveURL(/\/(forbidden|dashboard|accueil|403)/);

    // Or see a forbidden message
    const forbiddenMessage = page.getByText(/accès refusé|non autorisé|forbidden/i);
    const isRedirected = !page.url().includes('/admin');

    expect(isRedirected || (await forbiddenMessage.isVisible())).toBeTruthy();
  });

  test('Unauthorized user should be redirected from comptabilite page', async ({ page }) => {
    await login(page, testUsers.agentTerrain);

    await page.goto('/comptabilite');

    // Should be redirected or see forbidden message
    const forbiddenMessage = page.getByText(/accès refusé|non autorisé|forbidden/i);
    const isRedirected = !page.url().includes('/comptabilite');

    expect(isRedirected || (await forbiddenMessage.isVisible())).toBeTruthy();
  });

  test('Unauthenticated user should be redirected to login', async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();

    // Try to access protected page
    await page.goto('/clients');

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('E2E-04: Real-time Permission Updates', () => {
  test.skip('UI should update when permissions change via WebSocket', async ({ page, context }) => {
    // This test requires a second browser context to simulate admin changing permissions
    // Skip for now as it requires more complex setup

    await login(page, testUsers.caissier);

    // Open a second page as admin
    const adminPage = await context.newPage();
    await login(adminPage, testUsers.admin);

    // Admin navigates to RBAC settings
    await adminPage.goto('/admin/rbac');

    // TODO: Implement full WebSocket test when admin UI is ready
    // 1. Admin toggles a permission for caissier role
    // 2. Caissier's page should receive WebSocket update
    // 3. UI should automatically reflect the change

    await adminPage.close();
  });

  test('Permission context should load correctly on page load', async ({ page }) => {
    await login(page, testUsers.caissier);

    // Wait for permissions to load
    await page.waitForFunction(() => {
      return (window as any).__PERMISSIONS_LOADED__ === true;
    }, { timeout: 10000 }).catch(() => {
      // Fallback: check if sidebar is rendered (indicates permissions loaded)
    });

    // Verify navigation is rendered based on permissions
    const sidebar = page.getByRole('navigation');
    await expect(sidebar).toBeVisible();

    // Should see Caisse link
    await expect(
      sidebar.getByRole('link', { name: /caisse/i })
    ).toBeVisible();
  });
});

test.describe('E2E-05: Permission Boundary Tests', () => {
  test('API requests without permission should return 403', async ({ page, request }) => {
    await login(page, testUsers.agentTerrain);

    // Get session cookie
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session'));

    if (sessionCookie) {
      // Try to access admin endpoint
      const response = await request.get('/api/admin/users', {
        headers: {
          Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
        },
      });

      // Should be 403 Forbidden
      expect(response.status()).toBe(403);
    }
  });

  test('Comptable should access accounting endpoints', async ({ page, request }) => {
    await login(page, testUsers.comptable);

    // Get session cookie
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name.includes('session'));

    if (sessionCookie) {
      // Should be able to access accounting data
      const response = await request.get('/api/comptabilite/comptes', {
        headers: {
          Cookie: `${sessionCookie.name}=${sessionCookie.value}`,
        },
      });

      // Should be 200 OK
      expect(response.status()).toBe(200);
    }
  });
});

test.describe('E2E-06: Session Persistence', () => {
  test('Permissions should persist across page reloads', async ({ page }) => {
    await login(page, testUsers.caissier);

    // Check initial state
    const sidebar = page.getByRole('navigation');
    await expect(
      sidebar.getByRole('link', { name: /caisse/i })
    ).toBeVisible();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Permissions should still be correct
    await expect(
      sidebar.getByRole('link', { name: /caisse/i })
    ).toBeVisible();

    await expect(
      sidebar.getByRole('link', { name: /admin/i })
    ).not.toBeVisible();
  });

  test('Permissions should clear on logout', async ({ page }) => {
    await login(page, testUsers.admin);

    // Verify admin sees admin link
    const sidebar = page.getByRole('navigation');
    await expect(
      sidebar.getByRole('link', { name: /admin/i })
    ).toBeVisible();

    // Logout
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: /déconnexion/i }).click();

    // Wait for login page
    await expect(page).toHaveURL(/\/login/);

    // Try to access admin page
    await page.goto('/admin');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
