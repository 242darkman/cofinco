import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, DollarSign, Wallet, Smartphone, Building2, User, FileText, Check, Users, CheckCircle2, AlertCircle, CreditCard, ArrowDownLeft, ArrowUpRight, Loader2, Banknote, CheckCircle } from 'lucide-react';
import mtnMomoLogo from '../../../assets/logos/momo_mtna.png';
import airtelMoneyLogo from '../../../assets/logos/airtel-money.png';
import SearchableSelect from '../../ui/SearchableSelect';
import { saveToLoge } from '../../../lib/loge-storage';
import { usePermissions } from '../../auth/ProtectedFeature';
import { clientApi, clientSearchApi, operationCaisseApi, tontineApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { v4 as uuidv4 } from 'uuid';
import {
  StatutClient,
  StatutCompte,
  StatutParticipationTontine,
  StatutTransaction,
  TypeOperationCaisse,
  MethodePaiement,
  MethodePaiementType,
  METHODE_PAIEMENT_LABELS,
  isOperationCaisseEntree,
  isActiveStatus
} from '@shared/enum/status-constants';
import { getStatusLabel, ACCOUNT_STATUS_LABELS, ACCOUNT_TYPE_LABELS } from '../../../lib/status-labels';

interface ClientTontine {
  id: string;
  tontineId: string;
  clientId: string;
  statut: string;
  totalCotisations: string;
  tontine: {
    id: string;
    nom: string;
    montantCotisation: string;
    frequence: string;
    statut: string;
  };
}

interface CaissePaiementModalProps {
  sessionId: string;
  onClose: () => void;
  onSuccess: () => void;
  initialType?: string;
  /** ID du compte pré-sélectionné (pour activation depuis PendingActivationDrawer) */
  preSelectedAccountId?: string;
  /** Montant pré-rempli (pour activation depuis PendingActivationDrawer) */
  preFilledAmount?: number;
  /** ID du client pré-sélectionné (pour activation depuis PendingActivationDrawer) */
  preSelectedClientId?: string;
}

interface FormData {
  client_id: string;
  montant: string;
  mode_paiement: MethodePaiementType;
  type_operation: string;
  numero_telephone: string;
  numero_transaction: string;
  reference: string;
  description: string;
  banque_origine: string;
  numero_compte_origine: string;
  reference_virement: string;
}

export default function CaissePaiementModal({
  sessionId,
  onClose,
  onSuccess,
  initialType,
  preSelectedAccountId,
  preFilledAmount,
  preSelectedClientId
}: CaissePaiementModalProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreatePayments = hasPermission('caisse', 'create') || hasPermission('paiements', 'create');

  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [clientTontines, setClientTontines] = useState<ClientTontine[]>([]);
  const [selectedTontine, setSelectedTontine] = useState<ClientTontine | null>(null);
  const [loadingTontines, setLoadingTontines] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);
  const [factureId, setFactureId] = useState<string | undefined>(undefined);
  const [clientAccounts, setClientAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<any>(null); // Full object for status check

  // Client Summary State
  const [clientCredits, setClientCredits] = useState<any[]>([]);
  const [activeTontinesCount, setActiveTontinesCount] = useState(0);
  const [activeCreditsAmount, setActiveCreditsAmount] = useState(0);

  const [formData, setFormData] = useState<FormData>({
    client_id: preSelectedClientId || '',
    montant: preFilledAmount ? preFilledAmount.toString() : '',
    mode_paiement: MethodePaiement.CASH,
    type_operation: initialType || TypeOperationCaisse.TONTINE_CONTRIBUTION,
    numero_telephone: '',
    numero_transaction: '',
    reference: '',
    description: '',
    // Champs pour virements
    banque_origine: '',
    numero_compte_origine: '',
    reference_virement: ''
  });

  // Pré-sélectionner le compte et définir la description si fourni (activation depuis drawer)
  // Cet effet est séparé du chargement des comptes client pour garantir la priorité
  useEffect(() => {
    if (preSelectedAccountId) {
      setSelectedAccountId(preSelectedAccountId);
      // Le selectedAccount sera défini après le chargement des comptes client
    }
    // Pré-remplir la description pour les activations de compte
    if (preSelectedAccountId && preFilledAmount && !formData.description) {
      setFormData(prev => ({
        ...prev,
        description: `Dépôt initial - Activation de compte`
      }));
    }
  }, [preSelectedAccountId, preFilledAmount]);

  // Idempotency Key - useMemo garantit une seule génération à la création du composant
  // Ceci est la solution correcte au bug #8 de l'audit : évite les doublons lors des re-renders
  const idempotencyKey = useMemo(() => uuidv4(), []);

  // Vérifier si c'est une opération d'entrée - utilise la fonction centralisée
  const isOperationEntree = useCallback((typeOp: string) => {
    return isOperationCaisseEntree(typeOp);
  }, []);

  // Vérifier si c'est une opération tontine - utilise les constantes EN
  const isTontineOperation = useMemo(() => {
    return formData.type_operation === TypeOperationCaisse.TONTINE_CONTRIBUTION ||
           formData.type_operation === TypeOperationCaisse.TONTINE_WITHDRAWAL;
  }, [formData.type_operation]);

  // Vérifier si c'est une opération sur compte - utilise les constantes EN
  const isAccountOperation = useMemo(() => {
    return [
      TypeOperationCaisse.DEPOSIT_SAVINGS,
      TypeOperationCaisse.WITHDRAWAL_SAVINGS,
      TypeOperationCaisse.DEPOSIT_CURRENT,
      TypeOperationCaisse.WITHDRAWAL_CURRENT,
      TypeOperationCaisse.DEPOSIT_BLOCKED,
      TypeOperationCaisse.WITHDRAWAL_BLOCKED
    ].includes(formData.type_operation as any);
  }, [formData.type_operation]);

  // Vérifier si c'est une opération de crédit
  const isLoanOperation = useMemo(() => {
    return [
      TypeOperationCaisse.LOAN_REPAYMENT,
      TypeOperationCaisse.CREDIT_DISBURSEMENT
    ].includes(formData.type_operation as any);
  }, [formData.type_operation]);

  // Charger les clients via api-client
  // Utilise isActiveStatus pour gérer les données legacy FR et EN
  const loadClients = useCallback(async () => {
    try {
      const data = await clientApi.getAllList();
      // Le serveur retourne 'statut' (FR), on vérifie les deux pour compatibilité
      setClients(data.filter((c: any) => isActiveStatus(c.statut) || isActiveStatus(c.status)));
    } catch (error) {
      console.error('Error loading clients:', error);
      setClients([]);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Sélectionner une tontine
  const selectTontine = useCallback((tontine: ClientTontine) => {
    setSelectedTontine(tontine);
    const montantCotisation = tontine.tontine.montantCotisation;
    setFormData(prev => ({
      ...prev,
      montant: montantCotisation,
      description: sanitizeInput(`Cotisation ${tontine.tontine.nom} - ${tontine.tontine.frequence}`)
    }));
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.montant;
      delete newErrors.tontine;
      return newErrors;
    });
  }, []);

  // Charger les tontines du client via api-client
  const loadClientTontines = useCallback(async (clientId: string) => {
    setLoadingTontines(true);
    try {
      const data = await clientSearchApi.getTontines(clientId);
      setClientTontines(data || []);
      if (data && data.length === 1) {
        selectTontine(data[0]);
      }
    } catch (error) {
      console.error('Error loading client tontines:', error);
      setClientTontines([]);
    } finally {
      setLoadingTontines(false);
    }
  }, []);

  useEffect(() => {
    if (formData.client_id) {
        // Load detailed client info
        const displayClientSummary = async () => {
             try {
                 // 1. Load Credits
                 const credits = await clientSearchApi.getCredits(formData.client_id, { statut: 'Accordé' }); // or Actif
                 setClientCredits(credits || []);
                 const totalCreditAmount = (credits || []).reduce((sum, c) => sum + Number(c.restant_du || 0), 0);
                 setActiveCreditsAmount(totalCreditAmount);

                 // 2. Load Tontines (also needed for summary even if not tontine op)
                 // Utilise StatutParticipationTontine (sémantiquement correct) avec fallback isActiveStatus
                 const tontines = await clientSearchApi.getTontines(formData.client_id);
                 setClientTontines(tontines || []);
                 setActiveTontinesCount((tontines || []).filter(t =>
                   t.statut === StatutParticipationTontine.ACTIVE || isActiveStatus(t.statut)
                 ).length);
                 
                 // Auto-select if tontine op
                 if (isTontineOperation && tontines && tontines.length === 1) {
                      selectTontine(tontines[0]);
                 }

                 // Load Accounts for account ops (or just pre-load)
                 const comptes = await compteEpargneApi.getByClient(formData.client_id);
                 setClientAccounts(comptes || []);

                 // Si un compte est pré-sélectionné (activation depuis drawer),
                 // on définit l'objet complet selectedAccount
                 if (preSelectedAccountId && comptes) {
                     const preSelected = comptes.find((c: any) => c.id === preSelectedAccountId);
                     if (preSelected) {
                         setSelectedAccountId(preSelectedAccountId);
                         setSelectedAccount(preSelected);
                     }
                 } else if (comptes?.length === 1) {
                     // Auto-select si un seul compte
                     setSelectedAccountId(comptes[0].id);
                     setSelectedAccount(comptes[0]);
                 }
             } catch (err) {
                 console.error("Error loading client details", err);
             }
        }
        displayClientSummary();
    } else {
      setClientTontines([]);
      setClientCredits([]);
      setSelectedTontine(null);
      setClientAccounts([]);
      setSelectedAccountId('');
      setSelectedAccount(null);
      setActiveTontinesCount(0);
      setActiveCreditsAmount(0);
    }
  }, [formData.client_id, isTontineOperation, selectTontine]);



  // Filtrer les comptes en fonction du type d'opération
  const filteredAccounts = useMemo(() => {
     if (!clientAccounts) return [];
     const op = formData.type_operation;
     
     if ([TypeOperationCaisse.DEPOSIT_SAVINGS, TypeOperationCaisse.WITHDRAWAL_SAVINGS].includes(op as any)) {
         return clientAccounts.filter(a => (a.type_compte || a.typeCompte) === 'SAVINGS');
     } else if ([TypeOperationCaisse.DEPOSIT_CURRENT, TypeOperationCaisse.WITHDRAWAL_CURRENT].includes(op as any)) {
         return clientAccounts.filter(a => (a.type_compte || a.typeCompte) === 'CURRENT');
     } else if ([TypeOperationCaisse.DEPOSIT_BLOCKED, TypeOperationCaisse.WITHDRAWAL_BLOCKED].includes(op as any)) {
         return clientAccounts.filter(a => (a.type_compte || a.typeCompte) === 'BLOCKED');
     }
     return [];
  }, [clientAccounts, formData.type_operation]);

  // Auto-select account if only one match exists after filtering
  useEffect(() => {
     if (isAccountOperation && filteredAccounts.length === 1) {
         const acc = filteredAccounts[0];
         setSelectedAccountId(acc.id);
         setSelectedAccount(acc);
     } else if (isAccountOperation && selectedAccountId) {
         // Verify if selected account is still valid for the new operation type
         const isValid = filteredAccounts.find(a => a.id === selectedAccountId);
         if (!isValid) {
             setSelectedAccountId('');
             setSelectedAccount(null);
         }
     }
  }, [isAccountOperation, filteredAccounts, selectedAccountId]);

  // Générer une référence
  const genererReference = useCallback(() => {

    const date = new Date();
    return `PAY-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }, []);

  // Validation du formulaire
  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_id) {
      newErrors.client_id = 'Client requis';
    }

    const montant = parseFloat(formData.montant);
    if (!formData.montant || isNaN(montant) || montant <= 0) {
      newErrors.montant = 'Le montant doit être supérieur à 0';
    } else if (montant > VALIDATION_LIMITS.MAX_AMOUNT) {
      newErrors.montant = `Le montant ne peut pas dépasser ${formatMoney(VALIDATION_LIMITS.MAX_AMOUNT)}`;
    } else if (montant < VALIDATION_LIMITS.MIN_AMOUNT) {
      newErrors.montant = `Le montant minimum est ${formatMoney(VALIDATION_LIMITS.MIN_AMOUNT)}`;
    }

    // Validation Mobile Money
    if (formData.mode_paiement === MethodePaiement.MOBILE_MONEY) {
      if (!formData.numero_telephone) {
        newErrors.numero_telephone = 'Numéro requis';
      } else {
        const phoneClean = formData.numero_telephone.replace(/\s/g, '');
        const phoneRegex = /^(\+242|00242|0)?[0-9]{9}$/;
        if (!phoneRegex.test(phoneClean)) {
          newErrors.numero_telephone = 'Format invalide (ex: +242 06 123 4567)';
        }
      }
      if (!formData.numero_transaction) {
        newErrors.numero_transaction = 'Numéro transaction requis';
      }
    }

    // Validation Virement
    if (formData.mode_paiement === MethodePaiement.TRANSFER) {
      if (!formData.banque_origine?.trim()) {
        newErrors.banque_origine = "Banque d'origine requise";
      }
      if (!formData.reference_virement?.trim()) {
        newErrors.reference_virement = 'Référence virement requise';
      }
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description requise';
    }
    if (isTontineOperation && !selectedTontine) {
      newErrors.tontine = 'Veuillez sélectionner une tontine';
    }
    if (isAccountOperation && !selectedAccountId) {
      newErrors.account = 'Veuillez sélectionner un compte';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, isTontineOperation, selectedTontine, isAccountOperation, selectedAccountId]);

  // Soumettre le formulaire
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.warning('Veuillez corriger les erreurs du formulaire');
      return;
    }

    setLoading(true);
    const loadingId = toast.loading('Préparation du paiement...');

    try {
      const montant = parseFloat(formData.montant);
      const reference = formData.reference || genererReference();

      const isMobileMoney = formData.mode_paiement === MethodePaiement.MOBILE_MONEY;

      const operationData = {
        session_id: sessionId,
        type_operation: formData.type_operation,
        montant,
        mode_paiement: formData.mode_paiement,
        reference,
        description: sanitizeInput(formData.description),
        client_id: formData.client_id,
        numero_telephone: isMobileMoney ? sanitizeInput(formData.numero_telephone) : null,
        numero_transaction: isMobileMoney ? sanitizeInput(formData.numero_transaction) : null,
        tontineId: selectedTontine?.tontineId || null,
        membreId: selectedTontine?.id || null,
        compteId: selectedAccountId || null
      };

      toast.dismiss(loadingId);
      
      // OTP désactivé - exécuter l'opération directement
      await executeOperationDirect(operationData);
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de la préparation');
      toast.error(errorMessage);
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  }, [formData, validate, genererReference, sessionId, selectedTontine]);

  // Générer le HTML du reçu (avec échappement XSS)
  const generateReceiptHTML = useCallback((data: any) => {
    const now = new Date();
    const safeReference = escapeHtml(data.reference);
    const safeClientName = escapeHtml(data.clientName);
    const safeTypeOperation = escapeHtml(data.type_operation);
    const safeModePaiement = escapeHtml(data.mode_paiement);
    const safeDescription = escapeHtml(data.description);
    const safeTelephone = data.numero_telephone ? escapeHtml(data.numero_telephone) : '';
    const safeTransaction = data.numero_transaction ? escapeHtml(data.numero_transaction) : '';

    return `
      <html>
        <head>
          <title>Reçu de Paiement - ${safeReference}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { color: #1e3a8a; margin: 0; font-size: 24px; }
            .header p { color: #666; margin: 5px 0; }
            .receipt-info { margin-bottom: 20px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #ddd; }
            .label { color: #666; }
            .value { font-weight: bold; color: #1e3a8a; }
            .montant { font-size: 28px; text-align: center; color: #16a34a; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 15px; }
            .status { background: #dcfce7; color: #16a34a; padding: 5px 15px; border-radius: 20px; display: inline-block; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>COFIN&amp;CO-M</h1>
            <p>Reçu de Paiement</p>
            <span class="status">VALIDÉ</span>
          </div>
          <div class="receipt-info">
            <div class="row"><span class="label">Référence:</span><span class="value">${safeReference}</span></div>
            <div class="row"><span class="label">Date:</span><span class="value">${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR')}</span></div>
            <div class="row"><span class="label">Client:</span><span class="value">${safeClientName}</span></div>
            <div class="row"><span class="label">Opération:</span><span class="value">${safeTypeOperation}</span></div>
            <div class="row"><span class="label">Mode:</span><span class="value">${safeModePaiement}</span></div>
            ${safeTelephone ? `<div class="row"><span class="label">Téléphone:</span><span class="value">${safeTelephone}</span></div>` : ''}
            ${safeTransaction ? `<div class="row"><span class="label">N° Transaction:</span><span class="value">${safeTransaction}</span></div>` : ''}
          </div>
          <div class="montant">${formatMoney(Number(data.montant))}</div>
          <div class="row"><span class="label">Description:</span><span class="value">${safeDescription}</span></div>
          <div class="footer">
            <p>Merci pour votre confiance</p>
            <p>COFIN&amp;CO-M - Microfinance</p>
          </div>
        </body>
      </html>
    `;
  }, []);

  // Sauvegarder le reçu dans la Loge
  const saveReceiptToLoge = useCallback(async (data: any) => {
    const receiptHTML = generateReceiptHTML(data);
    try {
      const blob = new Blob([receiptHTML], { type: 'text/html' });
      const fileName = `Recu_${data.reference}_${new Date().toISOString().split('T')[0]}.html`;
      await saveToLoge(blob, {
        nom: fileName,
        description: `Reçu ${data.type_operation} - ${data.clientName} - ${formatMoney(Number(data.montant))}`,
        categorie: 'general',
        referenceType: 'recu_caisse',
        referenceId: data.reference,
        tags: ['recu', data.mode_paiement, data.type_operation]
      });
    } catch (error) {
      console.error('Erreur sauvegarde reçu:', error);
    }
  }, [generateReceiptHTML]);

  // Imprimer le reçu
  const printReceiptOnly = useCallback(() => {
    if (!receiptData) return;
    const receiptHTML = generateReceiptHTML(receiptData);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(receiptHTML);
      iframeDoc.close();

      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      }, 300);
    }
  }, [receiptData, generateReceiptHTML]);

  // Fermer le reçu
  const handleCloseReceipt = useCallback(() => {
    setShowReceipt(false);
    setReceiptData(undefined);
    onSuccess();
    onClose();
  }, [onSuccess, onClose]);

  // Exécuter l'opération directement (sans OTP)
  const executeOperationDirect = useCallback(async (operationData: any) => {
    const loadingId = toast.loading('Enregistrement du paiement...');

    try {
      setLoading(true);

      // **Cotisations Tontine** : utiliser l'endpoint tontine qui gère déjà le ledger
      let response;
      if (formData.type_operation === TypeOperationCaisse.TONTINE_CONTRIBUTION && selectedTontine) {
        response = await tontineApi.addContribution(selectedTontine.tontineId, {
          clientId: formData.client_id,
          montant: operationData.montant,
          methodePaiement: formData.mode_paiement,
          reference: operationData.reference
        });

      } else if (isAccountOperation && selectedAccount && selectedAccount.statut === StatutCompte.PENDING_ACTIVATION && isOperationEntree(formData.type_operation)) {
          // ACTIVATION DE COMPTE : APPEL SPECIFIQUE
          response = await compteEpargneApi.depotInitial(selectedAccount.id, {
             montant: operationData.montant,
             sessionCaisseId: sessionId,
             modePaiement: formData.mode_paiement, // 'Espèces' normalement
             idempotencyKey // Add key to call
          });
      } else {
        // **Autres opérations** : créer l'opération de caisse
        response = await operationCaisseApi.create({
          ...operationData,
          statut: StatutTransaction.POSTED,
          idempotencyKey
        });
      }
      
      // Extraire le factureId si disponible
      const factureIdFromResponse = response?.facture?.id;

      const clientName = `${clients.find(c => c.id === formData.client_id)?.nom || ''} ${clients.find(c => c.id === formData.client_id)?.prenom || ''}`.trim() || 'Client';
      
      const rData: ReceiptData = {
        title: `Reçu de ${formData.type_operation}`,
        reference: operationData.reference,
        date: new Date(),
        type: formData.type_operation,
        client: {
          nom: clients.find(c => c.id === formData.client_id)?.nom || 'Client',
          prenom: clients.find(c => c.id === formData.client_id)?.prenom || '',
          telephone: formData.numero_telephone
        },
        items: [
          {
            description: formData.description || formData.type_operation,
            montant: parseFloat(operationData.montant),
            quantite: 1
          }
        ],
        total: parseFloat(operationData.montant),
        modePaiement: formData.mode_paiement,
        devise: 'FCFA',
        agent: {
          nom: 'Caissier', // Ideally get from user context if available
          prenom: ''
        }
      };

      // Sauvegarder le reçu dans la Loge
      await saveReceiptToLoge(rData);

      toast.dismiss(loadingId);
      toast.success('Paiement enregistré avec succès !');

      // Afficher le reçu visuellement
      setReceiptData(rData);
      setFactureId(factureIdFromResponse);
      setShowReceipt(true);
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de l\'enregistrement');
      toast.error(errorMessage);
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  }, [formData, selectedTontine, clients, saveReceiptToLoge]);

  // Montant formaté mémorisé
  const formattedMontant = useMemo(() => {
    const value = parseFloat(formData.montant);
    if (isNaN(value) || value <= 0) return null;
    return formatMoney(value);
  }, [formData.montant]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
      <div className="bg-slate-950 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-800 flex flex-col max-h-[90vh]">
        
        {/* HEADER: Titre + Close */}
        <header className="px-6 py-4 bg-slate-900/50 border-b border-slate-800 flex justify-between items-center">
           <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isOperationEntree(formData.type_operation) ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                 {isOperationEntree(formData.type_operation) ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
              </div>
              <div>
                  <h2 id="paiement-modal-title" className="text-xl font-bold text-white">Nouvelle Transaction</h2>
                  <p className="text-xs text-slate-400">Effectuez une opération rapide et sécurisée</p>
              </div>
           </div>
           <button 
             onClick={onClose} 
             className="p-2 hover:bg-slate-800 rounded-full transition-colors"
             aria-label="Fermer"
           >
             <X size={20} className="text-slate-400" />
           </button>
        </header>
  
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          
          {/* SECTION 1: QUI & QUOI (Grid 2 cols) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Col Gauche: Client */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex items-center gap-2">
                    <User size={12}/> Client / Membre
                </label>
                <SearchableSelect
                  label=""
                  name="client_id"
                  value={formData.client_id}
                  onChange={(value: string | number) => setFormData({ ...formData, client_id: String(value) })}
                  options={clients.map(c => ({
                    value: c.id,
                    label: `${c.nom || ''} ${c.prenom || ''}`.trim() || 'Sans Nom',
                    subLabel: [c.telephone, c.email].filter(Boolean).join(' • '),
                    image: c.photoProfile || c.photo_profile || c.photo
                  }))}
                  placeholder="Rechercher un client..."
                  error={errors.client_id}
                  required
                />
                
                {/* Rich Summary Card (Si client sélectionné) */}
                {formData.client_id && (
                   <div className="mt-2 p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shrink-0">
                         {clients.find(c => c.id === formData.client_id)?.nom?.charAt(0) || 'C'}
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="text-sm font-bold text-white truncate">
                             {clients.find(c => c.id === formData.client_id)?.nom} {clients.find(c => c.id === formData.client_id)?.prenom}
                         </div>
                         <div className="flex items-center gap-4 text-xs text-indigo-300 mt-1">
                             <div className="flex items-center gap-1.5" title={`${clientCredits.length} Crédit${clientCredits.length > 1 ? 's' : ''} actif${clientCredits.length > 1 ? 's' : ''}`}>
                                 <CreditCard size={12} className="opacity-70"/> 
                                 <span className="font-medium">{clientCredits.length} {clientCredits.length > 1 ? 'Crédits' : 'Crédit'}</span>
                             </div>
                             <div className="w-px h-3 bg-indigo-500/30"></div>
                             <div className="flex items-center gap-1.5" title={`${activeTontinesCount} Tontine${activeTontinesCount > 1 ? 's' : ''} active${activeTontinesCount > 1 ? 's' : ''}`}>
                                 <Users size={12} className="opacity-70"/> 
                                 <span className="font-medium">{activeTontinesCount} {activeTontinesCount > 1 ? 'Tontines' : 'Tontine'}</span>
                             </div>
                         </div>
                      </div>
                   </div>
                )}
             </div>
  
             {/* Col Droite: Type Opération */}
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex items-center gap-2">
                    <FileText size={12}/> Nature Opération
                </label>
                <div className="relative">
                    <select 
                       value={formData.type_operation}
                       onChange={(e) => setFormData({ ...formData, type_operation: e.target.value })}
                       className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none appearance-none"
                    >
                       <optgroup label="Tontines">
                         <option value={TypeOperationCaisse.TONTINE_CONTRIBUTION}>Cotisation Tontine</option>
                         <option value={TypeOperationCaisse.TONTINE_WITHDRAWAL}>Retrait Tontine</option>
                       </optgroup>
                       <optgroup label="Crédits / Prêts">
                         <option value={TypeOperationCaisse.LOAN_REPAYMENT}>Remboursement Prêt</option>
                         <option value={TypeOperationCaisse.CREDIT_DISBURSEMENT}>Décaissement Prêt</option>
                       </optgroup>
                       <optgroup label="Compte Épargne">
                         <option value={TypeOperationCaisse.DEPOSIT_SAVINGS}>Versement Compte Épargne</option>
                         <option value={TypeOperationCaisse.WITHDRAWAL_SAVINGS}>Retrait Compte Épargne</option>
                       </optgroup>
                       <optgroup label="Compte Courant">
                         <option value={TypeOperationCaisse.DEPOSIT_CURRENT}>Versement Compte Courant</option>
                         <option value={TypeOperationCaisse.WITHDRAWAL_CURRENT}>Retrait Compte Courant</option>
                       </optgroup>
                       <optgroup label="Compte Bloqué">
                         <option value={TypeOperationCaisse.DEPOSIT_BLOCKED}>Versement Compte Bloqué</option>
                         <option value={TypeOperationCaisse.WITHDRAWAL_BLOCKED}>Retrait Compte Bloqué</option>
                       </optgroup>
                       <optgroup label="Autres">
                         <option value={TypeOperationCaisse.MISC_COLLECTION}>Encaissement Divers</option>
                         <option value={TypeOperationCaisse.MISC_DISBURSEMENT}>Décaissement Divers</option>
                         <option value={TypeOperationCaisse.BANK_FEE}>Frais Bancaires</option>
                       </optgroup>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <ArrowDownLeft size={16} className="rotate-[-45deg]" />
                    </div>
                </div>
                
                {/* Selecteurs Conditionnels (Tontine / Compte / Prêt) */}
                
                {/* 1. TONTINES */}
                {isTontineOperation && formData.client_id && (
                   <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                      {loadingTontines ? (
                         <div className="flex items-center justify-center p-2"><div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div></div>
                      ) : clientTontines.length === 0 ? (
                         <div className="text-amber-500 text-xs p-2 bg-amber-500/10 rounded border border-amber-500/20">Aucune tontine active</div>
                      ) : (
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Tontine Cible</label>
                              <SearchableSelect
                                label=""
                                name="tontine_id"
                                value={selectedTontine?.id || ''}
                                onChange={(val: string | number) => {
                                    const t = clientTontines.find(ct => ct.id === val);
                                    if (t) selectTontine(t);
                                }}
                                options={clientTontines.map(ct => ({
                                    value: ct.id,
                                    label: `${ct.tontine.nom} (${formatMoney(parseFloat(ct.tontine.montantCotisation))})`,
                                    subLabel: ct.tontine.frequence
                                }))}
                                placeholder="Sélectionner une tontine..."
                                error={errors.tontine}
                                className="bg-slate-800 border-slate-600"
                              />
                          </div>
                      )}
                   </div>
                )}
                
                {/* 2. COMPTES (Filtrés par type) */}
                {isAccountOperation && formData.client_id && (
                   <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                        {filteredAccounts.length === 0 ? (
                           <div className="text-amber-500 text-xs p-2 bg-amber-500/10 rounded border border-amber-500/20">Aucun compte correspondant trouvé</div>
                        ) : (
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Compte Cible</label>
                                <select 
                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                    value={selectedAccountId}
                                    onChange={(e) => {
                                        setSelectedAccountId(e.target.value);
                                        const acc = filteredAccounts.find(a => a.id === e.target.value);
                                        if (acc) setSelectedAccount(acc);
                                    }}
                                >
                                    <option value="">Sélectionner un compte...</option>
                                    {filteredAccounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.numero_compte || acc.numeroCompte} - {getStatusLabel(acc.type_compte || acc.typeCompte, ACCOUNT_TYPE_LABELS)} ({formatMoney(acc.solde || 0)})
                                        </option>
                                    ))}
                                </select>
                                {errors.account && <p className="text-red-500 text-xs">{errors.account}</p>}
                            </div>
                        )}
                   </div>
                )}
                
                {/* 3. CRÉDITS (Nouveau) */}
                {isLoanOperation && formData.client_id && (
                   <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                       {clientCredits.length === 0 ? (
                           <div className="text-amber-500 text-xs p-2 bg-amber-500/10 rounded border border-amber-500/20">Aucun crédit actif trouvé</div>
                       ) : (
                           <div className="space-y-1">
                               <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Crédit Cible</label>
                               <select 
                                   className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
                                   // Note: Assuming we might need a selectedCredit state in future, but for now we might use description to store info or add state
                                   onChange={(e) => {
                                       const credit = clientCredits.find(c => c.id === e.target.value);
                                       if (credit) {
                                           setFormData(prev => ({
                                               ...prev,
                                               description: `${prev.description ? prev.description + ' - ' : ''}Crédit #${credit.reference_dossier || credit.id}`
                                           }));
                                       }
                                   }}
                               >
                                   <option value="">Sélectionner un crédit...</option>
                                   {clientCredits.map(c => (
                                       <option key={c.id} value={c.id}>
                                           {c.reference_dossier || 'Dossier'} - Restant: {formatMoney(c.restant_du)}
                                       </option>
                                   ))}
                               </select>
                           </div>
                       )}
                   </div>
                )}
             </div>
          </div>
  
          {/* SECTION 2: MÉTHODE DE PAIEMENT (Tuiles) */}
          <div className="space-y-2">
             <label className="text-xs font-bold text-slate-500 uppercase ml-1 block">Règlement</label>
             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Tuile CASH */}
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, mode_paiement: MethodePaiement.CASH})}
                  className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-emerald-500 ${formData.mode_paiement === MethodePaiement.CASH ? 'border-emerald-500 bg-emerald-500/10 shadow-lg scale-[1.02]' : 'border-slate-800 bg-slate-900/50 opacity-60 hover:opacity-100 hover:border-slate-600'}`}
                >
                   <Banknote size={24} className={formData.mode_paiement === MethodePaiement.CASH ? 'text-emerald-500' : 'text-slate-400'} />
                   <span className={`text-[10px] font-bold uppercase ${formData.mode_paiement === MethodePaiement.CASH ? 'text-emerald-400' : 'text-slate-400'}`}>Espèces</span>
                </button>
                
                {/* Tuile MTN */}
                <button 
                   type="button"
                   disabled={true /* Disabled for now as per original code */}
                   onClick={() => setFormData({...formData, mode_paiement: MethodePaiement.MOBILE_MONEY})}
                   className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 outline-none relative overflow-hidden ${formData.mode_paiement === MethodePaiement.MOBILE_MONEY ? 'border-yellow-500 bg-yellow-500/10 shadow-lg scale-[1.02]' : 'border-slate-800 bg-slate-900/50 opacity-40 grayscale cursor-not-allowed'}`}
                >
                   <img src={mtnMomoLogo} alt="MTN MoMo" className="h-8 object-contain" />
                   {/* <span className="text-[10px] font-bold uppercase text-slate-400">MTN MoMo</span> */}
                   <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">Bientôt</span>
                   </div>
                </button>
  
                {/* Tuile Airtel */}
                <button 
                   type="button"
                   disabled={true /* Disabled for now as per original code */}
                   onClick={() => setFormData({...formData, mode_paiement: MethodePaiement.MOBILE_MONEY})}
                   className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 outline-none relative overflow-hidden ${formData.mode_paiement === MethodePaiement.MOBILE_MONEY ? 'border-red-500 bg-red-500/10 shadow-lg scale-[1.02]' : 'border-slate-800 bg-slate-900/50 opacity-40 grayscale cursor-not-allowed'}`}
                >
                   <img src={airtelMoneyLogo} alt="Airtel Money" className="h-8 object-contain" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">Bientôt</span>
                   </div>
                </button>
  
                {/* Tuile Virement */}
                <button 
                   type="button"
                   onClick={() => setFormData({...formData, mode_paiement: MethodePaiement.TRANSFER})}
                   className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-200 outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 ${formData.mode_paiement === MethodePaiement.TRANSFER ? 'border-blue-500 bg-blue-500/10 shadow-lg scale-[1.02]' : 'border-slate-800 bg-slate-900/50 opacity-60 hover:opacity-100 hover:border-slate-600'}`}
                >
                   <Building2 size={24} className={formData.mode_paiement === MethodePaiement.TRANSFER ? 'text-blue-500' : 'text-slate-400'} />
                   <span className={`text-[10px] font-bold uppercase ${formData.mode_paiement === MethodePaiement.TRANSFER ? 'text-blue-400' : 'text-slate-400'}`}>Virement</span>
                </button>
             </div>
          </div>
  
          {/* SECTION 3: MONTANT (Hero Input) */}
          <div className="space-y-6">
             {/* Champs conditionnels Virement qui glissent ici si sélectionnés - Logic adapted from original */}
             {formData.mode_paiement === MethodePaiement.TRANSFER && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-4 p-4 bg-slate-900/50 rounded-xl border border-blue-900/30">
                   <div className="md:col-span-1">
                       <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Banque Origine</label>
                       <input 
                          value={formData.banque_origine}
                          onChange={(e) => setFormData({...formData, banque_origine: e.target.value})}
                          placeholder="Ex: BGFI" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" 
                        />
                         {errors.banque_origine && <p className="text-red-500 text-xs mt-1">{errors.banque_origine}</p>}
                   </div>
                   <div className="md:col-span-2">
                       <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Réf. Virement</label>
                       <input 
                          value={formData.reference_virement}
                          onChange={(e) => setFormData({...formData, reference_virement: e.target.value})}
                          placeholder="Réf: VIR-xxx" 
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500" 
                        />
                        {errors.reference_virement && <p className="text-red-500 text-xs mt-1">{errors.reference_virement}</p>}
                   </div>
                </div>
             )}
  
             {/* Champs conditionnels Mobile Money (Phone/Ref) - Adapté pour le futur si activé */}
              {formData.mode_paiement === MethodePaiement.MOBILE_MONEY && (
                <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-4 p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                   <div>
                       <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Téléphone</label>
                       <input 
                           value={formData.numero_telephone}
                           onChange={(e) => setFormData({...formData, numero_telephone: e.target.value})}
                           placeholder="+242..." 
                           className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500" 
                       />
                   </div>
                   <div>
                       <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">ID Transaction</label>
                       <input 
                           value={formData.numero_transaction}
                           onChange={(e) => setFormData({...formData, numero_transaction: e.target.value})}
                           placeholder="Trans ID" 
                           className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500" 
                       />
                   </div>
                </div>
             )}
  
             <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                     <span className={`text-4xl font-bold ${isOperationEntree(formData.type_operation) ? 'text-emerald-500' : 'text-rose-500'}`}>
                         {isOperationEntree(formData.type_operation) ? '+' : '-'}
                     </span>
                </div>
                <input 
                   type="number"
                   value={formData.montant}
                   onChange={(e) => setFormData({...formData, montant: e.target.value})}
                   className={`w-full bg-slate-900/50 border-2 rounded-2xl pl-12 pr-16 py-8 text-5xl font-bold text-white placeholder-slate-700 outline-none transition-all text-center tracking-tight ${errors.montant ? 'border-red-500 focus:border-red-400' : 'border-slate-800 focus:border-indigo-500'}`}
                   placeholder="0"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-bold text-lg">FCFA</span>
             </div>
             {errors.montant && (
                 <div className="text-center">
                     <span className="px-3 py-1 rounded-full bg-red-500/10 text-red-400 text-sm border border-red-500/20 inline-flex items-center gap-2">
                         <AlertCircle size={14}/> {errors.montant}
                     </span>
                 </div>
             )}
              {selectedTontine && !errors.montant && (
               <div className="text-center -mt-2">
                 <span className="text-emerald-400 text-xs bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                   Cotisation suggérée: {formatMoney(parseFloat(selectedTontine.tontine.montantCotisation))}
                 </span>
               </div>
             )}
          </div>
  
          {/* SECTION 4: MÉTADONNÉES (Discret) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-slate-800/50">
             <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 block">Note / Description</label>
                <input 
                   value={formData.description}
                   onChange={(e) => setFormData({...formData, description: e.target.value})}
                   placeholder="Ajouter une note ou description..." 
                   className={`w-full bg-transparent border-b ${errors.description ? 'border-red-500' : 'border-slate-800 focus:border-indigo-500'} px-0 py-2 text-sm text-white placeholder-slate-600 outline-none transition-colors`}
                />
                {errors.description && <p className="text-red-500 text-xs">{errors.description}</p>}
             </div>
             <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 block text-right">Référence</label>
                <input 
                   disabled 
                   value={formData.reference || "Auto-généré"} 
                   className="w-full bg-transparent border-b border-slate-800 px-0 py-2 text-sm text-slate-600 font-mono text-right" 
                />
             </div>
          </div>
  
          {/* Global Error Banner if any unexpected error */}
          {errors.submit && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl flex items-center gap-3">
                  <AlertCircle size={20} />
                  <span className="text-sm font-medium">{errors.submit}</span>
              </div>
          )}
  
        </div>
  
        {/* FOOTER: Action */}
        <div className="p-6 bg-slate-900 border-t border-slate-800">
           <button 
              onClick={handleSubmit}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.99] ${loading ? 'bg-indigo-600/50 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20 text-white'}`}
           >
              {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={24}/>
                    <span>Traitement en cours...</span>
                  </>
              ) : (
                  <>
                    <CheckCircle size={24} />
                    <span>Valider la Transaction</span>
                  </>
              )}
           </button>
           <div className="mt-4 text-center">
              <button onClick={onClose} className="text-slate-500 hover:text-white text-sm transition-colors">
                  Annuler l'opération
              </button>
           </div>
        </div>
  
      </div>
      
      {/* Universal Success Modal - Preservé */}
      <UniversalPaymentSuccessModal
        isOpen={showReceipt}
        onClose={() => {
            setShowReceipt(false);
            setFactureId(undefined);
            onSuccess();
            onClose();
        }}
        term="Terminer"
        data={receiptData}
      />
    </div>
  );
}
