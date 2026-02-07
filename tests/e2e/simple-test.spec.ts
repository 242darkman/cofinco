import { test, expect } from '@playwright/test';

test('can access login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/login/);
  await expect(page.getByRole('heading', { name: 'Espace Connexion' })).toBeVisible();
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
});