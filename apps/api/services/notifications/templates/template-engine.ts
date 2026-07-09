import Handlebars from "handlebars";
import { db } from "../../../db";
import { smsTemplates, emailTemplates } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// In-memory template caches: code -> compiled Handlebars template
const smsCache = new Map<string, HandlebarsTemplateDelegate>();
const emailHtmlCache = new Map<string, HandlebarsTemplateDelegate>();
const emailTextCache = new Map<string, HandlebarsTemplateDelegate>();
const emailSubjectCache = new Map<string, HandlebarsTemplateDelegate>();

// ============================================================================
// Register Handlebars helpers
// ============================================================================

Handlebars.registerHelper("formatNumber", (value: unknown) => {
  const num = Number(value);
  return isNaN(num) ? String(value) : num.toLocaleString("fr-FR");
});

Handlebars.registerHelper("uppercase", (value: unknown) =>
  String(value ?? "").toUpperCase()
);

// ============================================================================
// SMS Template Rendering
// ============================================================================

/**
 * Render an SMS template by code with variables.
 * Templates are loaded from the `sms_templates` DB table and cached in memory.
 */
export async function renderSmsTemplate(
  code: string,
  variables: Record<string, unknown>
): Promise<string> {
  let compiled = smsCache.get(code);

  if (!compiled) {
    const [template] = await db
      .select()
      .from(smsTemplates)
      .where(and(eq(smsTemplates.code, code), eq(smsTemplates.actif, true)))
      .limit(1);

    if (!template) {
      throw new Error(`SMS template '${code}' not found or inactive`);
    }

    compiled = Handlebars.compile(template.contenu);
    smsCache.set(code, compiled);
  }

  return compiled(variables);
}

// ============================================================================
// Email Template Rendering
// ============================================================================

/**
 * Render an email template by code.
 * Returns { subject, html, text } all rendered with Handlebars.
 */
export async function renderEmailTemplate(
  code: string,
  variables: Record<string, unknown>
): Promise<{ subject: string; html: string; text: string }> {
  let compiledHtml = emailHtmlCache.get(code);
  let compiledText = emailTextCache.get(code);
  let compiledSubject = emailSubjectCache.get(code);

  if (!compiledHtml || !compiledText || !compiledSubject) {
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.code, code), eq(emailTemplates.actif, true)))
      .limit(1);

    if (!template) {
      throw new Error(`Email template '${code}' not found or inactive`);
    }

    compiledHtml = Handlebars.compile(template.contenuHtml);
    compiledText = Handlebars.compile(template.contenuText);
    compiledSubject = Handlebars.compile(template.subject);

    emailHtmlCache.set(code, compiledHtml);
    emailTextCache.set(code, compiledText);
    emailSubjectCache.set(code, compiledSubject);
  }

  return {
    subject: compiledSubject(variables),
    html: compiledHtml(variables),
    text: compiledText(variables),
  };
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidate template cache.
 * Call after an admin edits a template in the UI.
 * @param code Optional: invalidate a specific template. If omitted, clears all.
 */
export function invalidateTemplateCache(code?: string): void {
  if (code) {
    smsCache.delete(code);
    emailHtmlCache.delete(code);
    emailTextCache.delete(code);
    emailSubjectCache.delete(code);
  } else {
    smsCache.clear();
    emailHtmlCache.clear();
    emailTextCache.clear();
    emailSubjectCache.clear();
  }
}
