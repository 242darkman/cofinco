import { test as base, expect, Page } from '@playwright/test';

/**
 * Authentication Fixtures for E2E Tests
 *
 * Provides pre-authenticated contexts for different user roles.
 */

export interface TestUser {
  email: string;
  password: string;
  role: string;
  expectedModules: string[];
  forbiddenModules: string[];
}

/**
 * Test users for different roles
 * These should match seed data in the database
 */
export const testUsers: Record<string, TestUser> = {
  admin: {
    email: 's.administrateur',
    password: 'Password1234@',
    role: 'ADMIN',
    expectedModules: ['Clients', 'Crédits', 'Caisse', 'Comptabilité', 'Admin'],
    forbiddenModules: [],
  },
  caissier: {
    email: '@g.ngouabi',
    password: 'Password1234@',
    role: 'CAISSIER',
    expectedModules: ['Clients', 'Caisse'],
    forbiddenModules: ['Admin', 'Comptabilité'],
  },
  agentTerrain: {
    email: '@e.makosso',
    password: 'Password1234@',
    role: 'AGENT_TERRAIN',
    expectedModules: ['Clients'],
    forbiddenModules: ['Admin', 'Comptabilité', 'Coffre'],
  },
  comptable: {
    email: '@c.mountou',
    password: 'Password1234@',
    role: 'COMPTABLE',
    expectedModules: ['Comptabilité'],
    forbiddenModules: ['Admin'],
  }
};

/**
 * Login helper function
 */
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');

  // Fill login form
  await page.fill('input[name="username"]', user.email);
  await page.getByLabel(/mot de passe/i).fill(user.password);

  // Submit
  await page.getByRole('button', { name: /connexion/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL(/\/(dashboard|accueil)/);

  // Verify user is logged in
  await expect(page.getByTestId('user-menu')).toBeVisible({ timeout: 10000 });
}

/**
 * Logout helper function
 */
export async function logout(page: Page): Promise<void> {
  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: /déconnexion/i }).click();
  await page.waitForURL('/login');
}

/**
 * Extended test fixture with authentication helpers
 */
export const test = base.extend<{
  authenticatedPage: Page;
  loginAs: (role: keyof typeof testUsers) => Promise<void>;
}>({
  authenticatedPage: async ({ page }, use) => {
    await use(page);
  },

  loginAs: async ({ page }, use) => {
    const loginAs = async (role: keyof typeof testUsers) => {
      const user = testUsers[role];
      if (!user) {
        throw new Error(`Unknown test user role: ${role}`);
      }
      await login(page, user);
    };
    await use(loginAs);
  },
});

export { expect };
