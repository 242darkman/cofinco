import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database
const mockSelect = vi.fn();

const createMockBuilder = (result: any = []) => {
  const builder: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve(Array.isArray(result) ? result : [result]),
  };
  return builder;
};

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
  },
}));

import {
  renderSmsTemplate,
  renderEmailTemplate,
  invalidateTemplateCache,
} from '../services/notifications/templates/template-engine';

describe('Template Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateTemplateCache(); // Clear all caches before each test
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // SMS TEMPLATE RENDERING
  // ===========================================================================

  describe('renderSmsTemplate', () => {
    it('should render a Handlebars template with variables', async () => {
      const builder = createMockBuilder([{
        id: '1',
        code: 'CREDIT_APPROVED',
        contenu: 'Félicitations {{clientName}}! Crédit de {{amount}} FC approuvé.',
        actif: true,
      }]);
      mockSelect.mockReturnValue(builder);

      const result = await renderSmsTemplate('CREDIT_APPROVED', {
        clientName: 'Jean Dupont',
        amount: '500000',
      });

      expect(result).toBe('Félicitations Jean Dupont! Crédit de 500000 FC approuvé.');
    });

    it('should throw if template not found', async () => {
      const builder = createMockBuilder([]);
      mockSelect.mockReturnValue(builder);

      await expect(
        renderSmsTemplate('NONEXISTENT', {})
      ).rejects.toThrow("SMS template 'NONEXISTENT' not found or inactive");
    });

    it('should cache compiled templates and not re-query DB', async () => {
      const builder = createMockBuilder([{
        id: '1',
        code: 'OTP_CODE',
        contenu: 'Votre code: {{code}}',
        actif: true,
      }]);
      mockSelect.mockReturnValue(builder);

      // First call - should query DB
      await renderSmsTemplate('OTP_CODE', { code: '123456' });
      const firstCallCount = mockSelect.mock.calls.length;

      // Second call - should use cache
      const result = await renderSmsTemplate('OTP_CODE', { code: '654321' });
      expect(result).toBe('Votre code: 654321');
      expect(mockSelect.mock.calls.length).toBe(firstCallCount); // No new DB query
    });

    it('should support Handlebars helpers like formatNumber', async () => {
      const builder = createMockBuilder([{
        id: '1',
        code: 'BALANCE',
        contenu: 'Solde: {{formatNumber amount}} FC',
        actif: true,
      }]);
      mockSelect.mockReturnValue(builder);

      const result = await renderSmsTemplate('BALANCE', { amount: 1500000 });
      // formatNumber uses fr-FR locale
      expect(result).toContain('1');
      expect(result).toContain('500');
      expect(result).toContain('000');
      expect(result).toContain('FC');
    });
  });

  // ===========================================================================
  // EMAIL TEMPLATE RENDERING
  // ===========================================================================

  describe('renderEmailTemplate', () => {
    it('should render subject, html, and text with variables', async () => {
      const builder = createMockBuilder([{
        id: '1',
        code: 'WELCOME',
        subject: 'Bienvenue {{clientName}}',
        contenuHtml: '<h1>Bienvenue {{clientName}}!</h1><p>Votre compte est prêt.</p>',
        contenuText: 'Bienvenue {{clientName}}! Votre compte est prêt.',
        actif: true,
      }]);
      mockSelect.mockReturnValue(builder);

      const result = await renderEmailTemplate('WELCOME', {
        clientName: 'Marie',
      });

      expect(result.subject).toBe('Bienvenue Marie');
      expect(result.html).toBe('<h1>Bienvenue Marie!</h1><p>Votre compte est prêt.</p>');
      expect(result.text).toBe('Bienvenue Marie! Votre compte est prêt.');
    });

    it('should throw if email template not found', async () => {
      const builder = createMockBuilder([]);
      mockSelect.mockReturnValue(builder);

      await expect(
        renderEmailTemplate('NONEXISTENT', {})
      ).rejects.toThrow("Email template 'NONEXISTENT' not found or inactive");
    });

    it('should cache email templates', async () => {
      const builder = createMockBuilder([{
        id: '1',
        code: 'OTP_EMAIL',
        subject: 'Code: {{code}}',
        contenuHtml: '<p>{{code}}</p>',
        contenuText: '{{code}}',
        actif: true,
      }]);
      mockSelect.mockReturnValue(builder);

      await renderEmailTemplate('OTP_EMAIL', { code: '111111' });
      const callCount = mockSelect.mock.calls.length;

      const result = await renderEmailTemplate('OTP_EMAIL', { code: '222222' });
      expect(result.subject).toBe('Code: 222222');
      expect(mockSelect.mock.calls.length).toBe(callCount); // No new DB query
    });
  });

  // ===========================================================================
  // CACHE INVALIDATION
  // ===========================================================================

  describe('invalidateTemplateCache', () => {
    it('should invalidate a specific template by code', async () => {
      // Populate cache
      const builder = createMockBuilder([{
        id: '1',
        code: 'TEST',
        contenu: 'Hello {{name}}',
        actif: true,
      }]);
      mockSelect.mockReturnValue(builder);

      await renderSmsTemplate('TEST', { name: 'A' });
      const callCount = mockSelect.mock.calls.length;

      // Invalidate
      invalidateTemplateCache('TEST');

      // Next call should re-query DB
      await renderSmsTemplate('TEST', { name: 'B' });
      expect(mockSelect.mock.calls.length).toBeGreaterThan(callCount);
    });

    it('should invalidate all templates when no code given', async () => {
      const builder = createMockBuilder([{
        id: '1',
        code: 'T1',
        contenu: '{{x}}',
        actif: true,
      }]);
      mockSelect.mockReturnValue(builder);

      await renderSmsTemplate('T1', { x: '1' });

      invalidateTemplateCache(); // Clear all

      // Next call should re-query
      const callsBefore = mockSelect.mock.calls.length;
      await renderSmsTemplate('T1', { x: '2' });
      expect(mockSelect.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
