import { useState } from 'react';
import { generateTransactionOTP, validateTransactionOTP, generateTransactionReference } from '../services/otpService';

interface UseOTPTransactionProps {
  onSuccess: (validationData: any) => void;
  onError?: (error: string) => void;
}

interface TransactionData {
  transactionType: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  montant: number;
  description?: string;
}

export function useOTPTransaction({ onSuccess, onError }: UseOTPTransactionProps) {
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<TransactionData | null>(null);
  const [transactionReference, setTransactionReference] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Initie une transaction nécessitant une validation OTP
   */
  const initiateTransaction = async (transactionData: TransactionData) => {
    setLoading(true);
    setCurrentTransaction(transactionData);

    try {
      // Générer une référence unique
      const ref = generateTransactionReference(transactionData.transactionType);
      setTransactionReference(ref);

      // Pas besoin de générer l'OTP ici, le modal le fera
      setShowOTPModal(true);
    } catch (error: any) {
      if (onError) {
        onError(error.message || 'Erreur lors de l\'initialisation de la transaction');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Gère la validation réussie de l'OTP
   */
  const handleOTPSuccess = (validationData: any) => {
    setShowOTPModal(false);

    // Appeler le callback de succès avec toutes les données
    onSuccess({
      ...validationData,
      transactionReference,
      transactionData: currentTransaction
    });

    // Reset
    setCurrentTransaction(null);
    setTransactionReference('');
  };

  /**
   * Annule la transaction en cours
   */
  const cancelTransaction = () => {
    setShowOTPModal(false);
    setCurrentTransaction(null);
    setTransactionReference('');
  };

  return {
    showOTPModal,
    currentTransaction,
    transactionReference,
    loading,
    initiateTransaction,
    handleOTPSuccess,
    cancelTransaction
  };
}
