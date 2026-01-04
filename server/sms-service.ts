import { db } from './db';
import { smsNotifications, smsTemplates, smsProviderSettings, clients } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export type SmsProvider = 'twilio' | 'africas_talking' | 'bulksms' | 'easysendsms' | 'manual';

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SmsTemplateVariables {
  clientName?: string;
  amount?: string;
  dueDate?: string;
  creditType?: string;
  tontineName?: string;
  meetingDate?: string;
  balance?: string;
  [key: string]: string | undefined;
}

const SMS_TEMPLATES = {
  PAYMENT_REMINDER: {
    fr: "Bonjour {clientName}, nous vous rappelons votre échéance de paiement du {dueDate}. Montant: {amount} FC. COFIN&CO-M",
    en: "Hello {clientName}, reminder: payment due on {dueDate}. Amount: {amount} FC. COFIN&CO-M"
  },
  CREDIT_APPROVED: {
    fr: "Félicitations {clientName}! Votre demande de crédit de {amount} FC a été approuvée. Passez à notre agence. COFIN&CO-M",
    en: "Congratulations {clientName}! Your credit request of {amount} FC has been approved. Visit our branch. COFIN&CO-M"
  },
  SAVINGS_CONFIRMED: {
    fr: "Votre épargne de {amount} FC a bien été enregistrée. Nouveau solde: {balance} FC. Merci de votre confiance. COFIN&CO-M",
    en: "Your savings of {amount} FC has been recorded. New balance: {balance} FC. Thank you for your trust. COFIN&CO-M"
  },
  TONTINE_REMINDER: {
    fr: "Rappel: Réunion tontine '{tontineName}' prévue le {meetingDate}. Cotisation: {amount} FC. COFIN&CO-M",
    en: "Reminder: Tontine '{tontineName}' meeting on {meetingDate}. Contribution: {amount} FC. COFIN&CO-M"
  },
  TONTINE_CONTRIBUTION_CONFIRMED: {
    fr: "Votre cotisation de {amount} FC pour la tontine '{tontineName}' a été enregistrée. Merci! COFIN&CO-M",
    en: "Your contribution of {amount} FC for tontine '{tontineName}' has been recorded. Thank you! COFIN&CO-M"
  },
  CREDIT_OVERDUE: {
    fr: "URGENT: {clientName}, votre échéance de crédit du {dueDate} est en retard. Montant dû: {amount} FC. Contactez-nous. COFIN&CO-M",
    en: "URGENT: {clientName}, your credit payment from {dueDate} is overdue. Amount due: {amount} FC. Contact us. COFIN&CO-M"
  },
  WELCOME: {
    fr: "Bienvenue chez COFIN&CO-M, {clientName}! Votre compte a été créé avec succès. Merci de votre confiance.",
    en: "Welcome to COFIN&CO-M, {clientName}! Your account has been created successfully. Thank you for your trust."
  }
};

function replaceTemplateVariables(template: string, variables: SmsTemplateVariables): string {
  let message = template;
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
  }
  return message;
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  if (!cleaned.startsWith('242')) {
    if (cleaned.startsWith('0')) {
      cleaned = '242' + cleaned.substring(1);
    } else {
      cleaned = '242' + cleaned;
    }
  }
  
  return '+' + cleaned;
}

async function getActiveProvider(): Promise<{ provider: SmsProvider; settings: any } | null> {
  try {
    const [primaryProvider] = await db
      .select()
      .from(smsProviderSettings)
      .where(and(eq(smsProviderSettings.isPrimary, true), eq(smsProviderSettings.isActive, true)))
      .limit(1);
    
    if (primaryProvider) {
      return {
        provider: primaryProvider.provider as SmsProvider,
        settings: primaryProvider.settings || {}
      };
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      return {
        provider: 'twilio',
        settings: {
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER
        }
      };
    }

    if (process.env.AFRICAS_TALKING_API_KEY && process.env.AFRICAS_TALKING_USERNAME) {
      return {
        provider: 'africas_talking',
        settings: {
          apiKey: process.env.AFRICAS_TALKING_API_KEY,
          username: process.env.AFRICAS_TALKING_USERNAME,
          senderId: process.env.AFRICAS_TALKING_SENDER_ID || 'COFIN'
        }
      };
    }

    if (process.env.BULKSMS_API_TOKEN) {
      return {
        provider: 'bulksms',
        settings: {
          apiToken: process.env.BULKSMS_API_TOKEN,
          senderId: process.env.BULKSMS_SENDER_ID || 'COFIN'
        }
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting active SMS provider:', error);
    return null;
  }
}

async function sendViaTwilio(to: string, message: string, settings: any): Promise<SendSmsResult> {
  try {
    const { accountSid, authToken, phoneNumber } = settings;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        From: phoneNumber,
        To: to,
        Body: message
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      return { success: true, messageId: data.sid };
    } else {
      return { success: false, error: data.message || 'Twilio error' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function sendViaAfricasTalking(to: string, message: string, settings: any): Promise<SendSmsResult> {
  try {
    const { apiKey, username, senderId } = settings;
    const url = 'https://api.africastalking.com/version1/messaging';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey
      },
      body: new URLSearchParams({
        username,
        to,
        message,
        from: senderId
      })
    });

    const data = await response.json();
    
    if (data.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
      return { success: true, messageId: data.SMSMessageData.Recipients[0].messageId };
    } else {
      return { success: false, error: data.SMSMessageData?.Message || 'Africa\'s Talking error' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function sendViaBulkSms(to: string, message: string, settings: any): Promise<SendSmsResult> {
  try {
    const { apiToken, senderId } = settings;
    const url = 'https://api.bulksms.com/v1/messages';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: senderId,
        to,
        body: message
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      return { success: true, messageId: data.id };
    } else {
      return { success: false, error: data.detail || 'BulkSMS error' };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendSms(
  phoneNumber: string,
  templateCode: keyof typeof SMS_TEMPLATES,
  variables: SmsTemplateVariables,
  options?: {
    clientId?: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
    createdBy?: string;
    language?: 'fr' | 'en';
  }
): Promise<SendSmsResult> {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const language = options?.language || 'fr';
  
  const template = SMS_TEMPLATES[templateCode];
  if (!template) {
    return { success: false, error: `Template '${templateCode}' not found` };
  }
  
  const message = replaceTemplateVariables(template[language], variables);
  
  const providerInfo = await getActiveProvider();
  
  const [notification] = await db.insert(smsNotifications).values({
    clientId: options?.clientId || null,
    phoneNumber: formattedPhone,
    type: templateCode.toLowerCase(),
    message,
    status: 'pending',
    provider: providerInfo?.provider || 'manual',
    relatedEntityId: options?.relatedEntityId || null,
    relatedEntityType: options?.relatedEntityType || null,
    createdBy: options?.createdBy || null
  }).returning();
  
  if (!providerInfo) {
    console.log(`[SMS] No provider configured. Message queued for manual sending:`, {
      to: formattedPhone,
      message,
      notificationId: notification.id
    });
    
    return { 
      success: true, 
      messageId: notification.id,
      error: 'No SMS provider configured. Message saved for manual sending.'
    };
  }
  
  let result: SendSmsResult;
  
  switch (providerInfo.provider) {
    case 'twilio':
      result = await sendViaTwilio(formattedPhone, message, providerInfo.settings);
      break;
    case 'africas_talking':
      result = await sendViaAfricasTalking(formattedPhone, message, providerInfo.settings);
      break;
    case 'bulksms':
      result = await sendViaBulkSms(formattedPhone, message, providerInfo.settings);
      break;
    default:
      result = { success: false, error: `Unknown provider: ${providerInfo.provider}` };
  }
  
  await db.update(smsNotifications)
    .set({
      status: result.success ? 'sent' : 'failed',
      providerMessageId: result.messageId || null,
      errorMessage: result.error || null,
      sentAt: result.success ? new Date() : null
    })
    .where(eq(smsNotifications.id, notification.id));
  
  if (result.success) {
    console.log(`[SMS] Sent successfully to ${formattedPhone} via ${providerInfo.provider}`);
  } else {
    console.error(`[SMS] Failed to send to ${formattedPhone}: ${result.error}`);
  }
  
  return result;
}

export async function sendPaymentReminder(
  clientId: string,
  dueDate: string,
  amount: number,
  createdBy?: string
): Promise<SendSmsResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  
  if (!client) {
    return { success: false, error: 'Client not found' };
  }
  
  if (!client.telephone) {
    return { success: false, error: 'Client telephone not available' };
  }
  
  return sendSms(client.telephone, 'PAYMENT_REMINDER', {
    clientName: `${client.prenom || ''} ${client.nom}`.trim(),
    dueDate,
    amount: amount.toLocaleString()
  }, {
    clientId,
    createdBy
  });
}

export async function sendCreditApprovalNotification(
  clientId: string,
  creditId: string,
  amount: number,
  createdBy?: string
): Promise<SendSmsResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  
  if (!client) {
    return { success: false, error: 'Client not found' };
  }
  
  if (!client.telephone) {
    return { success: false, error: 'Client telephone not available' };
  }
  
  return sendSms(client.telephone, 'CREDIT_APPROVED', {
    clientName: `${client.prenom || ''} ${client.nom}`.trim(),
    amount: amount.toLocaleString()
  }, {
    clientId,
    relatedEntityId: creditId,
    relatedEntityType: 'credit',
    createdBy
  });
}

export async function sendSavingsConfirmation(
  clientId: string,
  epargneId: string,
  amount: number,
  newBalance: number,
  createdBy?: string
): Promise<SendSmsResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  
  if (!client) {
    return { success: false, error: 'Client not found' };
  }
  
  if (!client.telephone) {
    return { success: false, error: 'Client telephone not available' };
  }
  
  return sendSms(client.telephone, 'SAVINGS_CONFIRMED', {
    clientName: `${client.prenom || ''} ${client.nom}`.trim(),
    amount: amount.toLocaleString(),
    balance: newBalance.toLocaleString()
  }, {
    clientId,
    relatedEntityId: epargneId,
    relatedEntityType: 'epargne',
    createdBy
  });
}

export async function sendTontineReminder(
  clientId: string,
  tontineId: string,
  tontineName: string,
  meetingDate: string,
  amount: number,
  createdBy?: string
): Promise<SendSmsResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  
  if (!client) {
    return { success: false, error: 'Client not found' };
  }
  
  if (!client.telephone) {
    return { success: false, error: 'Client telephone not available' };
  }
  
  return sendSms(client.telephone, 'TONTINE_REMINDER', {
    clientName: `${client.prenom || ''} ${client.nom}`.trim(),
    tontineName,
    meetingDate,
    amount: amount.toLocaleString()
  }, {
    clientId,
    relatedEntityId: tontineId,
    relatedEntityType: 'tontine',
    createdBy
  });
}

export async function sendTontineContributionConfirmation(
  clientId: string,
  tontineId: string,
  tontineName: string,
  amount: number,
  createdBy?: string
): Promise<SendSmsResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  
  if (!client) {
    return { success: false, error: 'Client not found' };
  }
  
  if (!client.telephone) {
    return { success: false, error: 'Client telephone not available' };
  }
  
  return sendSms(client.telephone, 'TONTINE_CONTRIBUTION_CONFIRMED', {
    clientName: `${client.prenom || ''} ${client.nom}`.trim(),
    tontineName,
    amount: amount.toLocaleString()
  }, {
    clientId,
    relatedEntityId: tontineId,
    relatedEntityType: 'tontine',
    createdBy
  });
}

export async function sendWelcomeMessage(
  clientId: string,
  createdBy?: string
): Promise<SendSmsResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  
  if (!client) {
    return { success: false, error: 'Client not found' };
  }
  
  if (!client.telephone) {
    return { success: false, error: 'Client telephone not available' };
  }
  
  return sendSms(client.telephone, 'WELCOME', {
    clientName: `${client.prenom || ''} ${client.nom}`.trim()
  }, {
    clientId,
    createdBy
  });
}

export async function getSmsNotifications(limit = 50) {
  return db.select().from(smsNotifications).orderBy(smsNotifications.createdAt).limit(limit);
}

export async function getProviderStatus() {
  const provider = await getActiveProvider();
  const allProviders = await db.select().from(smsProviderSettings);
  
  return {
    activeProvider: provider?.provider || null,
    hasEnvironmentConfig: !!(process.env.TWILIO_ACCOUNT_SID || process.env.AFRICAS_TALKING_API_KEY || process.env.BULKSMS_API_TOKEN),
    configuredProviders: allProviders,
    availableProviders: ['twilio', 'africas_talking', 'bulksms', 'easysendsms']
  };
}
