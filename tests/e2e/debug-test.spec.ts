import { test, expect } from '@playwright/test';

test('debug login page structure', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  
  // Take screenshot for debugging
  await page.screenshot({ path: 'login-page.png' });
  
  // Log page content
  const inputs = await page.locator('input').all();
  console.log(`Found ${inputs.length} input elements`);
  
  for (const input of inputs) {
    const type = await input.getAttribute('type');
    const name = await input.getAttribute('name');
    const placeholder = await input.getAttribute('placeholder');
    console.log(`Input: type=${type}, name=${name}, placeholder=${placeholder}`);
  }
  
  // Check for form
  const forms = await page.locator('form').all();
  console.log(`Found ${forms.length} form elements`);
  
  // Look for login-related text
  const pageText = await page.textContent('body');
  console.log('Page contains "email":', pageText?.toLowerCase().includes('email'));
  console.log('Page contains "password":', pageText?.toLowerCase().includes('password'));
});