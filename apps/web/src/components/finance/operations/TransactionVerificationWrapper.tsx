import React, { useState, useCallback } from 'react';
import SMSVerificationModal from '../../auth/SMSVerificationModal';
import { auditApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';

interface TransactionVerificationWrapperProps {
  transactionType: 'encaissement' | 'retrait';
  clientId: string;
  agentId: string;
  montant: number;
  clientPhone: string;
  onSuccess: (verificationId: string) => void;
  onCancel: () => void;
}

export const useTransactionVerification = () => {
  const [showVerification, setShowVerification] = useState(false);
  const [verificationId, setVerificationId] = useState('');
  const [verificationData, setVerificationData] = useState<any>(null);

  const initiateVerification = useCallback(async (
    transactionType: 'encaissement' | 'retrait',
    clientId: string,
    agentId: string,
    montant: number,
    clientPhone: string,
    metadata?: any
  ): Promise<string> => {
    // Générer un code de vérification à 6 chiffres (crypto-secure)
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const verificationCode = (100000 + (array[0] % 900000)).toString();

    try {
      // Créer le code de vérification SMS via API
      const smsVerification = await auditApi.create({
        action: 'SMS_VERIFICATION',
        entity_type: 'sms_verification',
        entity_id: clientId,
        details: {
          client_id: clientId,
          agent_id: agentId,
          transaction_type: transactionType,
          montant,
          code: verificationCode,
          telephone: clientPhone,
          metadata: metadata || {}
        }
      });

      // En mode développement, afficher le code via toast
      // En production, ce code serait envoyé par SMS au client
      if (process.env.NODE_ENV === 'development') {
        toast.info(`Code de vérification (DEV): ${verificationCode}`);
      }

      setVerificationId(smsVerification.id);
      setVerificationData({
        transactionType,
        clientPhone,
        montant
      });
      setShowVerification(true);

      return smsVerification.id;
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de la création du code de vérification'));
      throw error;
    }
  }, []);

  const closeVerification = () => {
    setShowVerification(false);
    setVerificationId('');
    setVerificationData(null);
  };

  const VerificationModal = ({ onVerified }: { onVerified: () => void }) => {
    if (!showVerification || !verificationData) return null;

    return (
      <SMSVerificationModal
        onClose={closeVerification}
        onVerified={() => {
          closeVerification();
          onVerified();
        }}
        verificationId={verificationId}
        clientPhone={verificationData.clientPhone}
        montant={verificationData.montant}
        transactionType={verificationData.transactionType}
      />
    );
  };

  return {
    initiateVerification,
    closeVerification,
    showVerification,
    verificationId,
    VerificationModal
  };
};
