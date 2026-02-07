export interface OTPGenerateParams {
  transactionType: string;
  transactionReference: string;
  clientId: string;
  clientPhone: string;
  montant: number;
  createdBy: string;
  createdByRole: string;
}

export interface OTPValidateParams {
  transactionReference: string;
  otpCode: string;
  validatedBy: string;
  validatedByName?: string;
  validatedByRole?: string;
}

export interface OTPGenerateResponse {
  success: boolean;
  otpId?: string;
  expiresAt?: string;
  message?: string;
  error?: string;
}

export interface OTPValidateResponse {
  success: boolean;
  validationId?: string;
  clientName?: string;
  montant?: number;
  message?: string;
  error?: string;
}

export async function generateTransactionOTP(
  params: OTPGenerateParams
): Promise<OTPGenerateResponse> {
  try {
    const response = await fetch('/api/otp/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Erreur lors de la génération du code OTP'
      };
    }

    return data as OTPGenerateResponse;
  } catch (error: any) {
    console.error('Erreur génération OTP:', error);
    return {
      success: false,
      error: error.message || 'Erreur lors de la génération du code OTP'
    };
  }
}

export async function validateTransactionOTP(
  params: OTPValidateParams
): Promise<OTPValidateResponse> {
  try {
    const response = await fetch('/api/otp/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Erreur lors de la validation du code OTP'
      };
    }

    return data as OTPValidateResponse;
  } catch (error: any) {
    console.error('Erreur validation OTP:', error);
    return {
      success: false,
      error: error.message || 'Erreur lors de la validation du code OTP'
    };
  }
}

export async function getOTPValidationHistory(
  userId: string,
  limit: number = 50
) {
  try {
    const response = await fetch(`/api/otp/history/${userId}?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Erreur récupération historique');
    }
    
    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    console.error('Erreur récupération historique:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function checkPendingOTP(clientId: string) {
  try {
    const response = await fetch(`/api/otp/pending/${clientId}`);
    
    if (!response.ok) {
      throw new Error('Erreur vérification OTP');
    }
    
    const data = await response.json();
    return {
      success: true,
      hasPendingOTP: !!data,
      pendingOTP: data
    };
  } catch (error: any) {
    console.error('Erreur vérification OTP:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function cancelOTP(otpId: string) {
  try {
    const response = await fetch(`/api/otp/${otpId}/cancel`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error('Erreur annulation OTP');
    }

    return { success: true };
  } catch (error: any) {
    console.error('Erreur annulation OTP:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export function generateTransactionReference(prefix: string = 'TXN'): string {
  const date = new Date();
  const timestamp = date.getTime();
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const random = (array[0] % 10000).toString().padStart(4, '0');
  return `${prefix}-${timestamp}-${random}`;
}
