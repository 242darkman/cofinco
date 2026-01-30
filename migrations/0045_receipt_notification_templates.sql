-- Migration: Insert receipt notification templates (SMS + Email)
-- Templates for RECEIPT_DEPOSIT and RECEIPT_WITHDRAWAL
-- Variables: clientName, accountNumber, amount, balance, reference, date, agentName

-- ============================================================================
-- SMS TEMPLATES
-- ============================================================================

INSERT INTO sms_templates (code, nom, contenu, placeholders, description, actif)
VALUES (
  'RECEIPT_DEPOSIT',
  'Recu depot SMS',
  'COFIN&CO-M: Depot de {{amount}} FCFA sur le compte {{accountNumber}}. Solde: {{balance}} FCFA. Ref: {{reference}}. {{date}}.',
  'clientName,accountNumber,amount,balance,reference,date,agentName',
  'SMS de confirmation de depot (recu electronique)',
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO sms_templates (code, nom, contenu, placeholders, description, actif)
VALUES (
  'RECEIPT_WITHDRAWAL',
  'Recu retrait SMS',
  'COFIN&CO-M: Retrait de {{amount}} FCFA du compte {{accountNumber}}. Solde: {{balance}} FCFA. Ref: {{reference}}. {{date}}.',
  'clientName,accountNumber,amount,balance,reference,date,agentName',
  'SMS de confirmation de retrait (recu electronique)',
  true
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- EMAIL TEMPLATES
-- ============================================================================

INSERT INTO email_templates (code, nom, subject, contenu_html, contenu_text, placeholders, description, actif)
VALUES (
  'RECEIPT_DEPOSIT',
  'Recu depot email',
  'Confirmation de depot - COFIN&CO-M',
  '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>COFIN&CO-M</title></head><body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><tr><td style="background:linear-gradient(135deg,#1b2d4b 0%,#0f766e 100%);padding:24px 32px;text-align:center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><span style="font-size:28px;font-weight:bold;color:#fff;letter-spacing:1px">COFIN</span><span style="font-size:28px;font-weight:bold;color:#f5a623">&amp;</span><span style="font-size:28px;font-weight:bold;color:#4ebb6b">CO</span><span style="font-size:28px;font-weight:bold;color:#f0c844">-M</span></td></tr><tr><td align="center" style="padding-top:4px"><span style="font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:2px">La Finance Autrement</span></td></tr></table></td></tr><tr><td style="padding:32px"><h2 style="color:#0f766e;margin:0 0 16px">Depot confirme</h2><p style="color:#495057;line-height:1.6">Bonjour {{clientName}},</p><p style="color:#495057;line-height:1.6">Nous confirmons la reception de votre depot.</p><table role="presentation" style="background:#f0fdf4;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant depose</span></td><td align="right"><strong style="color:#0f766e;font-size:20px">{{amount}} FCFA</strong></td></tr><tr><td colspan="2" style="padding:4px 0;border-bottom:1px solid #e9ecef"></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Nouveau solde</span></td><td align="right"><strong style="color:#1b2d4b">{{balance}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Reference</span></td><td align="right"><strong style="color:#1b2d4b">{{reference}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Date</span></td><td align="right"><strong style="color:#1b2d4b">{{date}}</strong></td></tr></table></td></tr></table><p style="color:#868e96;font-size:13px;margin-top:24px">Ce recu fait foi de votre operation. Conservez-le pour vos archives.</p></td></tr><tr><td style="background:#f8f9fa;padding:20px 32px;border-top:1px solid #e9ecef"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:12px;color:#868e96;line-height:1.5">COFIN&amp;CO-M - Microfinance<br>Boulevard Denis Sassou, Brazzaville<br>+242 06 000 00 00</td><td align="right" style="font-size:11px;color:#adb5bd">Cet email a ete envoye automatiquement.<br>Merci de ne pas y repondre.</td></tr></table></td></tr></table></td></tr></table></body></html>',
  'Bonjour {{clientName}}, depot de {{amount}} FCFA sur le compte {{accountNumber}} confirme. Nouveau solde: {{balance}} FCFA. Ref: {{reference}}. Date: {{date}}. COFIN&CO-M',
  'clientName,accountNumber,amount,balance,reference,date,agentName',
  'Email de confirmation de depot (recu electronique)',
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO email_templates (code, nom, subject, contenu_html, contenu_text, placeholders, description, actif)
VALUES (
  'RECEIPT_WITHDRAWAL',
  'Recu retrait email',
  'Confirmation de retrait - COFIN&CO-M',
  '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>COFIN&CO-M</title></head><body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><tr><td style="background:linear-gradient(135deg,#1b2d4b 0%,#0f766e 100%);padding:24px 32px;text-align:center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><span style="font-size:28px;font-weight:bold;color:#fff;letter-spacing:1px">COFIN</span><span style="font-size:28px;font-weight:bold;color:#f5a623">&amp;</span><span style="font-size:28px;font-weight:bold;color:#4ebb6b">CO</span><span style="font-size:28px;font-weight:bold;color:#f0c844">-M</span></td></tr><tr><td align="center" style="padding-top:4px"><span style="font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:2px">La Finance Autrement</span></td></tr></table></td></tr><tr><td style="padding:32px"><h2 style="color:#1b2d4b;margin:0 0 16px">Retrait confirme</h2><p style="color:#495057;line-height:1.6">Bonjour {{clientName}},</p><p style="color:#495057;line-height:1.6">Nous confirmons votre retrait.</p><table role="presentation" style="background:#fef2f2;border-radius:8px;width:100%;margin:20px 0" cellpadding="0" cellspacing="0"><tr><td style="padding:16px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Montant retire</span></td><td align="right"><strong style="color:#ef4444;font-size:20px">{{amount}} FCFA</strong></td></tr><tr><td colspan="2" style="padding:4px 0;border-bottom:1px solid #e9ecef"></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Compte</span></td><td align="right"><strong style="color:#1b2d4b">{{accountNumber}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Nouveau solde</span></td><td align="right"><strong style="color:#1b2d4b">{{balance}} FCFA</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Reference</span></td><td align="right"><strong style="color:#1b2d4b">{{reference}}</strong></td></tr><tr><td style="padding:4px 0"><span style="color:#868e96;font-size:13px">Date</span></td><td align="right"><strong style="color:#1b2d4b">{{date}}</strong></td></tr></table></td></tr></table><div style="background:#fffbeb;border-left:4px solid #f5a623;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#495057;margin:0;font-size:13px;line-height:1.6">Si vous n''avez pas effectue cette operation, contactez immediatement votre agence.</p></div><p style="color:#868e96;font-size:13px;margin-top:24px">Ce recu fait foi de votre operation. Conservez-le pour vos archives.</p></td></tr><tr><td style="background:#f8f9fa;padding:20px 32px;border-top:1px solid #e9ecef"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:12px;color:#868e96;line-height:1.5">COFIN&amp;CO-M - Microfinance<br>Boulevard Denis Sassou, Brazzaville<br>+242 06 000 00 00</td><td align="right" style="font-size:11px;color:#adb5bd">Cet email a ete envoye automatiquement.<br>Merci de ne pas y repondre.</td></tr></table></td></tr></table></td></tr></table></body></html>',
  'Bonjour {{clientName}}, retrait de {{amount}} FCFA du compte {{accountNumber}} confirme. Nouveau solde: {{balance}} FCFA. Ref: {{reference}}. Date: {{date}}. COFIN&CO-M',
  'clientName,accountNumber,amount,balance,reference,date,agentName',
  'Email de confirmation de retrait (recu electronique)',
  true
)
ON CONFLICT (code) DO NOTHING;
