interface SendSMSParams {
  phoneNumber: string;
  message: string;
  provider?: 'twilio' | 'africas-talking';
}

interface SendSMSResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendSMS(params: SendSMSParams): Promise<SendSMSResponse> {
  try {
    const response = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('Erreur envoi SMS:', data);
      return {
        success: false,
        error: data.error || 'Erreur lors de l\'envoi du SMS',
      };
    }

    return {
      success: true,
      messageId: data.sid || data.messageId,
    };
  } catch (error: any) {
    console.error('Erreur service SMS:', error);
    return {
      success: false,
      error: error.message || 'Erreur lors de l\'envoi du SMS',
    };
  }
}

export async function sendOTPSMS(
  phoneNumber: string,
  otpCode: string
): Promise<SendSMSResponse> {
  const message = `COFIN&CO-M - Votre code de validation: ${otpCode}. Valide 5 min. Ne partagez pas ce code.`;

  const provider = getProviderForPhoneNumber(phoneNumber);

  return sendSMS({
    phoneNumber,
    message,
    provider,
  });
}

export async function sendTransactionConfirmationSMS(
  phoneNumber: string,
  transactionType: string,
  montant: number
): Promise<SendSMSResponse> {
  const message = `COFIN&CO-M - Transaction ${transactionType} de ${montant.toLocaleString()} FCFA confirmée. Merci de votre confiance.`;

  const provider = getProviderForPhoneNumber(phoneNumber);

  return sendSMS({
    phoneNumber,
    message,
    provider,
  });
}

function getProviderForPhoneNumber(phoneNumber: string): 'twilio' | 'africas-talking' {
  const cleanNumber = phoneNumber.replace(/\s+/g, '');

  if (cleanNumber.startsWith('+242') || cleanNumber.startsWith('242')) {
    return 'africas-talking';
  }

  if (/^\+?(254|233|234|255|256|263)/.test(cleanNumber)) {
    return 'africas-talking';
  }

  return 'twilio';
}

export async function updateSMSDeliveryStatus(
  deliveryLogId: string,
  status: 'SENT' | 'DELIVERED' | 'FAILED',
  providerMessageId?: string,
  errorMessage?: string
): Promise<boolean> {
  try {
    const response = await fetch(`/api/sms/delivery-status/${deliveryLogId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, providerMessageId, errorMessage })
    });

    return response.ok;
  } catch (error) {
    console.error('Erreur mise à jour statut SMS:', error);
    return false;
  }
}

export async function getSMSHistory(limit: number = 50) {
  try {
    const response = await fetch(`/api/sms/history?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Erreur récupération historique');
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    console.error('Erreur récupération historique SMS:', error);
    return { success: false, error: error.message };
  }
}

export async function getSMSStats(days: number = 30) {
  try {
    const response = await fetch(`/api/sms/stats?days=${days}`);
    
    if (!response.ok) {
      throw new Error('Erreur stats');
    }
    
    const stats = await response.json();
    return { success: true, stats };
  } catch (error: any) {
    console.error('Erreur stats SMS:', error);
    return { success: false, error: error.message };
  }
}
