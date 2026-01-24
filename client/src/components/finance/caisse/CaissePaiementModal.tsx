import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, User, FileText, Users, CreditCard, ArrowDownLeft, ArrowUpRight, Loader2, Banknote, CheckCircle, Building2 } from 'lucide-react';
import mtnMomoLogo from '../../../assets/logos/momo_mtna.png';
import airtelMoneyLogo from '../../../assets/logos/airtel-money.png';
import SearchableSelect from '../../ui/SearchableSelect';
import { saveToLoge } from '../../../lib/loge-storage';
import { usePermissions } from '../../auth/ProtectedFeature';
import { clientApi, clientSearchApi, operationCaisseApi, tontineApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { v4 as uuidv4 } from 'uuid';
import {
  StatutCompte,
  StatutParticipationTontine,
  StatutTransaction,
  TypeOperationCaisse,
  MethodePaiement,
  MethodePaiementType,
  isOperationCaisseEntree,
  normalizeOperationType,
  isActiveStatus
} from '@shared/enum/status-constants';
import { getStatusLabel, ACCOUNT_TYPE_LABELS } from '../../../lib/status-labels';

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

  const [formData, setFormData] = useState<FormData>({
    client_id: preSelectedClientId || '',
    montant: preFilledAmount ? preFilledAmount.toString() : '',
    mode_paiement: MethodePaiement.CASH,
    type_operation: normalizeOperationType(initialType),
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
  useEffect(() => {
    if (preSelectedAccountId) {
      setSelectedAccountId(preSelectedAccountId);
    }
    if (preSelectedAccountId && preFilledAmount && !formData.description) {
      setFormData(prev => ({
        ...prev,
        description: `Dépôt initial - Activation de compte`
      }));
    }
  }, [preSelectedAccountId, preFilledAmount]);
  
  // Synchroniser le type d'opération si initialType change
  useEffect(() => {
    if (initialType) {
      const normalized = normalizeOperationType(initialType);
      setFormData(prev => ({
        ...prev,
        type_operation: normalized
      }));
    }
  }, [initialType]);

  const idempotencyKey = useMemo(() => uuidv4(), []);

  const isOperationEntree = useCallback((typeOp: string) => {
    return isOperationCaisseEntree(typeOp);
  }, []);

  const isTontineOperation =
    formData.type_operation === TypeOperationCaisse.TONTINE_CONTRIBUTION ||
    formData.type_operation === TypeOperationCaisse.TONTINE_WITHDRAWAL;

  const isAccountOperation = [
    TypeOperationCaisse.DEPOSIT_SAVINGS,
    TypeOperationCaisse.WITHDRAWAL_SAVINGS,
    TypeOperationCaisse.DEPOSIT_CURRENT,
    TypeOperationCaisse.WITHDRAWAL_CURRENT,
    TypeOperationCaisse.DEPOSIT_BLOCKED,
    TypeOperationCaisse.WITHDRAWAL_BLOCKED
  ].includes(formData.type_operation as any);

  const loadClients = useCallback(async () => {
    try {
      const data = await clientApi.getAllList();
      setClients(data.filter((c: any) => isActiveStatus(c.statut) || isActiveStatus(c.status)));
    } catch (error) {
      console.error('Error loading clients:', error);
      setClients([]);
    }
  }, []);

  useEffect(() => {
    if (canCreatePayments) {
      loadClients();
    }
  }, [loadClients, canCreatePayments]);

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

  useEffect(() => {
    if (formData.client_id) {
        setLoadingTontines(true);
        const displayClientSummary = async () => {
             try {
                 const credits = await clientSearchApi.getCredits(formData.client_id, { statut: 'Accordé' });
                 setClientCredits(credits || []);

                 const tontines = await clientSearchApi.getTontines(formData.client_id);
                 setClientTontines(tontines || []);
                 setActiveTontinesCount((tontines || []).filter(t =>
                   t.statut === StatutParticipationTontine.ACTIVE || isActiveStatus(t.statut)
                 ).length);

                 if (isTontineOperation && tontines && tontines.length === 1) {
                      selectTontine(tontines[0]);
                 }

                 const comptes = await compteEpargneApi.getByClient(formData.client_id);
                 setClientAccounts(comptes || []);

                 if (preSelectedAccountId && comptes) {
                     const preSelected = comptes.find((c: any) => c.id === preSelectedAccountId);
                     if (preSelected) {
                         setSelectedAccountId(preSelectedAccountId);
                         setSelectedAccount(preSelected);
                     }
                 } else if (comptes?.length === 1) {
                     setSelectedAccountId(comptes[0].id);
                     setSelectedAccount(comptes[0]);
                 }
             } catch (err) {
                 console.error("Error loading client details", err);
             } finally {
                 setLoadingTontines(false);
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
      setLoadingTontines(false);
    }
  }, [formData.client_id, isTontineOperation, selectTontine, preSelectedAccountId]);

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

  useEffect(() => {
     if (isAccountOperation && filteredAccounts.length === 1) {
         const acc = filteredAccounts[0];
         setSelectedAccountId(acc.id);
         setSelectedAccount(acc);
     } else if (isAccountOperation && selectedAccountId) {
         const isValid = filteredAccounts.find(a => a.id === selectedAccountId);
         if (!isValid) {
             setSelectedAccountId('');
             setSelectedAccount(null);
         }
     }
  }, [isAccountOperation, filteredAccounts, selectedAccountId]);

  const genererReference = useCallback(() => {
    const date = new Date();
    return `PAY-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }, []);

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

    if (formData.mode_paiement === MethodePaiement.MOBILE_MONEY) {
      if (!formData.numero_telephone) {
        newErrors.numero_telephone = 'Numéro requis';
      }
      if (!formData.numero_transaction) {
        newErrors.numero_transaction = 'Numéro transaction requis';
      }
    }

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

  const generateReceiptHTML = useCallback((data: ReceiptData) => {
    const now = new Date();
    const safeReference = escapeHtml(data.reference);
    const safeClientName = escapeHtml(`${data.client?.nom || ''} ${data.client?.prenom || ''}`.trim() || 'Client');
    const safeType = escapeHtml(data.type);
    const safeMode = escapeHtml(data.modePaiement);
    
    return `
      <html>
        <head>
          <title>Reçu de Paiement - ${safeReference}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0; color: #4f46e5; }
            .row { display: flex; justify-content: space-between; border-bottom: 1px dashed #eee; padding: 5px 0; }
            .montant { font-size: 24px; font-bold; text-align: center; margin: 20px 0; color: #059669; }
          </style>
        </head>
        <body>
          <div class="header"><h1>COFINCO</h1><p>Reçu de Transaction</p></div>
          <div class="row"><span>Réf:</span><strong>${safeReference}</strong></div>
          <div class="row"><span>Date:</span><strong>${now.toLocaleString()}</strong></div>
          <div class="row"><span>Client:</span><strong>${safeClientName}</strong></div>
          <div class="row"><span>Type:</span><strong>${safeType}</strong></div>
          <div class="row"><span>Mode:</span><strong>${safeMode}</strong></div>
          <div class="montant">${formatMoney(data.total)}</div>
        </body>
      </html>
    `;
  }, []);

  const saveReceiptToLoge = useCallback(async (data: ReceiptData) => {
    const html = generateReceiptHTML(data);
    try {
      const blob = new Blob([html], { type: 'text/html' });
      await saveToLoge(blob, {
        nom: `Recu_${data.reference}.html`,
        description: `Reçu transaction ${data.reference}`,
        categorie: 'general',
        referenceType: 'recu_caisse',
        referenceId: data.reference
      });
    } catch (e) {
      console.error('Loge save error:', e);
    }
  }, [generateReceiptHTML]);

  const executeOperationDirect = useCallback(async (operationData: any) => {
    try {
      setLoading(true);
      let response;
      if (formData.type_operation === TypeOperationCaisse.TONTINE_CONTRIBUTION && selectedTontine) {
        response = await tontineApi.addContribution(selectedTontine.tontineId, {
          clientId: formData.client_id,
          montant: operationData.montant,
          methodePaiement: formData.mode_paiement,
          reference: operationData.reference
        });
      } else if (isAccountOperation && selectedAccount && selectedAccount.statut === StatutCompte.PENDING_ACTIVATION && isOperationEntree(formData.type_operation)) {
          response = await compteEpargneApi.depotInitial(selectedAccount.id, {
             montant: operationData.montant,
             sessionCaisseId: sessionId,
             modePaiement: formData.mode_paiement,
             idempotencyKey
          });
      } else {
        response = await operationCaisseApi.create({
          ...operationData,
          statut: StatutTransaction.POSTED,
          idempotencyKey
        });
      }
      
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
        items: [{ description: formData.description, montant: operationData.montant, quantite: 1 }],
        total: operationData.montant,
        modePaiement: formData.mode_paiement,
        devise: 'FCFA',
        agent: { nom: 'Caissier', prenom: '' }
      };

      await saveReceiptToLoge(rData);
      setReceiptData(rData);
      setFactureId(response?.facture?.id);
      setShowReceipt(true);
      toast.success('Transaction réussie !');
    } catch (error) {
      const msg = handleApiError(error, 'Erreur de transaction');
      toast.error(msg);
      setErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  }, [formData, selectedTontine, selectedAccount, sessionId, idempotencyKey, clients, saveReceiptToLoge]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;
    
    const operationData = {
      session_id: sessionId,
      type_operation: formData.type_operation,
      montant: parseFloat(formData.montant),
      mode_paiement: formData.mode_paiement,
      reference: formData.reference || genererReference(),
      description: sanitizeInput(formData.description),
      client_id: formData.client_id,
      numero_telephone: formData.numero_telephone || null,
      numero_transaction: formData.numero_transaction || null,
      tontineId: selectedTontine?.tontineId || null,
      membreId: selectedTontine?.id || null,
      compteId: selectedAccountId || null
    };

    await executeOperationDirect(operationData);
  }, [validate, formData, sessionId, selectedTontine, selectedAccountId, genererReference, executeOperationDirect]);

  const handleCloseReceipt = useCallback(() => {
    setShowReceipt(false);
    setReceiptData(undefined);
    setFactureId(undefined);
    onSuccess();
    onClose();
  }, [onSuccess, onClose]);

  const formattedMontant = useMemo(() => {
    const value = parseFloat(formData.montant);
    if (isNaN(value) || value <= 0) return null;
    return formatMoney(value);
  }, [formData.montant]);

  const selectedClient = useMemo(() => 
    clients.find(c => c.id === formData.client_id),
    [clients, formData.client_id]
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-950 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-800 flex flex-col max-h-[90vh]">
        
        {/* HEADER FIXE */}
        <header className="px-8 py-5 bg-slate-900/80 border-b border-slate-800 backdrop-blur flex justify-between items-center">
           <div>
              <div className="flex items-center gap-3">
                 <div className={`p-2 rounded-lg ${isOperationEntree(formData.type_operation) ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    {isOperationEntree(formData.type_operation) ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                 </div>
                 <div>
                    <h2 className="text-xl font-bold text-white">Nouvelle Transaction</h2>
                    <p className="text-xs text-slate-400">Effectuez une opération rapide et sécurisée</p>
                 </div>
              </div>
           </div>
           <button 
             onClick={onClose} 
             className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors"
           >
              <X size={20} />
           </button>
        </header>
  
        {/* BODY SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-2">
                   <User size={12}/> Client / Membre
                </label>
                <div className="h-14">
                   <SearchableSelect 
                      label=""
                      name="client_id"
                      value={formData.client_id}
                      onChange={(value) => setFormData(prev => ({ ...prev, client_id: String(value) }))}
                      options={clients.map(c => ({
                        value: c.id,
                        label: `${c.nom || ''} ${c.prenom || ''}`.trim() || 'Sans Nom',
                        subLabel: [c.telephone, c.email].filter(Boolean).join(' • '),
                        image: c.photoProfile || c.photo_profile
                      }))}
                      placeholder="Rechercher un client..."
                      error={errors.client_id}
                      className="h-full w-full bg-slate-900 border-slate-700 rounded-xl"
                   />
                </div>
             </div>
  
             <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-2">
                   <FileText size={12}/> Nature Opération
                </label>
                <div className="relative h-14">
                   <select 
                      className="h-full w-full bg-slate-900 border border-slate-700 rounded-xl px-4 text-white appearance-none focus:border-indigo-500 outline-none transition-all"
                      value={formData.type_operation}
                      onChange={(e) => setFormData(prev => ({ ...prev, type_operation: e.target.value }))}
                   >
                      <optgroup label="Tontines" className="bg-slate-900">
                        <option value={TypeOperationCaisse.TONTINE_CONTRIBUTION}>Cotisation Tontine</option>
                        <option value={TypeOperationCaisse.TONTINE_WITHDRAWAL}>Retrait Tontine</option>
                      </optgroup>
                      <optgroup label="Crédits" className="bg-slate-900">
                        <option value={TypeOperationCaisse.LOAN_REPAYMENT}>Remboursement Prêt</option>
                        <option value={TypeOperationCaisse.CREDIT_DISBURSEMENT}>Décaissement Prêt</option>
                      </optgroup>
                      <optgroup label="Comptes" className="bg-slate-900">
                        <option value={TypeOperationCaisse.DEPOSIT_SAVINGS}>Versement Épargne</option>
                        <option value={TypeOperationCaisse.WITHDRAWAL_SAVINGS}>Retrait Épargne</option>
                        <option value={TypeOperationCaisse.DEPOSIT_CURRENT}>Versement Courant</option>
                        <option value={TypeOperationCaisse.WITHDRAWAL_CURRENT}>Retrait Courant</option>
                      </optgroup>
                      <option value={TypeOperationCaisse.MISC_COLLECTION}>Encaissement Divers</option>
                      <option value={TypeOperationCaisse.MISC_DISBURSEMENT}>Décaissement Divers</option>
                   </select>
                   <ArrowDownLeft size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none rotate-[-45deg]" />
                </div>
             </div>
          </div>
  
          {formData.client_id && (
             <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex items-center gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xl border-2 border-slate-800">
                   {selectedClient?.nom?.charAt(0) || 'C'}
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 border-l border-slate-800 pl-6">
                   <div>
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Détails Client</div>
                      <div className="text-sm font-bold text-white truncate">
                         {selectedClient?.nom || 'Client'} {selectedClient?.prenom || ''}
                      </div>
                   </div>
                   <div className="flex gap-4">
                      <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Crédits</div>
                        <div className="text-sm font-bold text-amber-500 flex items-center gap-1"><CreditCard size={12}/> {clientCredits.length}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tontines</div>
                        <div className="text-sm font-bold text-emerald-500 flex items-center gap-1"><Users size={12}/> {activeTontinesCount}</div>
                      </div>
                   </div>
                </div>
             </div>
          )}
  
          {(isTontineOperation || isAccountOperation) && (
             <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1 mb-2 block">
                   {isTontineOperation ? 'Sélection Tontine' : 'Sélection Compte'}
                </label>
                <div className="h-14">
                    {isTontineOperation ? (
                      <SearchableSelect
                        label=""
                        name="tontine_id"
                        value={selectedTontine?.id || ''}
                        onChange={(val) => {
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
                        className="h-full w-full bg-slate-900 border-slate-700 rounded-xl"
                      />
                    ) : (
                      <div className="relative h-full">
                        <select 
                            className="w-full h-full bg-slate-900 border border-slate-700 rounded-xl px-4 text-white appearance-none focus:border-indigo-500 outline-none transition-all"
                            value={selectedAccountId}
                            onChange={(e) => {
                                setSelectedAccountId(e.target.value);
                                setSelectedAccount(filteredAccounts.find(a => a.id === e.target.value));
                            }}
                        >
                            <option value="">Sélectionner un compte...</option>
                            {filteredAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.numero_compte || acc.numeroCompte} - {getStatusLabel(acc.type_compte || acc.typeCompte, ACCOUNT_TYPE_LABELS)} ({formatMoney(acc.solde || 0)})
                                </option>
                            ))}
                        </select>
                        <ArrowDownLeft size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none rotate-[-45deg]" />
                      </div>
                    )}
                </div>
                {errors.account && <p className="text-red-500 text-xs mt-1">{errors.account}</p>}
             </div>
          )}
  
          <div className="space-y-3">
             <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Mode de paiement</label>
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                   { id: MethodePaiement.CASH, label: 'Espèces', icon: Banknote, color: 'emerald' },
                   { id: MethodePaiement.MOBILE_MONEY, label: 'MTN MoMo', img: mtnMomoLogo, color: 'yellow' },
                   { id: 'airtel', label: 'Airtel Money', img: airtelMoneyLogo, color: 'rose' },
                   { id: MethodePaiement.TRANSFER, label: 'Virement', icon: Building2, color: 'indigo' },
                ].map((m) => {
                   const isSelected = formData.mode_paiement === m.id;
                   const Icon = m.icon;
                   
                   return (
                     <button
                        key={m.id}
                        type="button"
                        onClick={() => setFormData(prev => ({...prev, mode_paiement: m.id as any}))}
                        className={`h-24 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all relative ${
                           isSelected 
                           ? `border-${m.color}-500/50 bg-${m.color}-500/10 shadow-lg` 
                           : 'border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-600'
                        }`}
                     >
                        {m.img ? <img src={m.img} alt={m.label} className="h-8 object-contain" /> : (Icon && <Icon size={26} />)}
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-white' : 'text-slate-500'}`}>{m.label}</span>
                     </button>
                   )
                })}
             </div>
          </div>

          {(formData.mode_paiement === MethodePaiement.MOBILE_MONEY || formData.mode_paiement === MethodePaiement.TRANSFER) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{formData.mode_paiement === MethodePaiement.MOBILE_MONEY ? 'Téléphone' : 'Banque'}</label>
                <input
                  type="text"
                  className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white focus:border-indigo-500 outline-none"
                  value={formData.mode_paiement === MethodePaiement.MOBILE_MONEY ? formData.numero_telephone : formData.banque_origine}
                  onChange={(e) => setFormData(p => ({ ...p, [formData.mode_paiement === MethodePaiement.MOBILE_MONEY ? 'numero_telephone' : 'banque_origine']: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Référence / ID</label>
                <input
                  type="text"
                  className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white focus:border-indigo-500 outline-none"
                  value={formData.mode_paiement === MethodePaiement.MOBILE_MONEY ? formData.numero_transaction : formData.reference_virement}
                  onChange={(e) => setFormData(p => ({ ...p, [formData.mode_paiement === MethodePaiement.MOBILE_MONEY ? 'numero_transaction' : 'reference_virement']: e.target.value }))}
                />
              </div>
            </div>
          )}
  
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Montant</label>
            <div className="relative group">
               <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-4xl text-slate-600 group-focus-within:text-indigo-500 transition-colors">
                  <Banknote size={32} />
               </span>
               <input 
                  type="number" 
                  className="w-full h-28 bg-slate-900 border-2 border-slate-800 rounded-2xl pl-20 pr-16 text-5xl font-black text-white outline-none focus:border-indigo-500 transition-all font-mono"
                  placeholder="0"
                  value={formData.montant}
                  onChange={(e) => setFormData(prev => ({ ...prev, montant: e.target.value }))}
               />
               <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 font-bold">FCFA</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Note</label>
            <textarea
              className="w-full min-h-[80px] bg-slate-900 border border-slate-700 rounded-xl p-4 text-white focus:border-indigo-500 outline-none resize-none transition-all"
              placeholder="Commentaire..."
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
            />
          </div>
        </div>
  
        <div className="p-8 bg-slate-900 border-t border-slate-800 flex flex-col gap-4">
           {formattedMontant && (
             <div className="text-center text-sm font-medium text-slate-500">
                Confirmation: <span className="text-white font-bold">{formattedMontant} FCFA</span>
             </div>
           )}
           <button 
             onClick={handleSubmit}
             disabled={loading}
             className="w-full h-16 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-2xl font-black text-xl flex items-center justify-center gap-3 transition-all"
           >
              {loading ? <Loader2 size={24} className="animate-spin" /> : <><CheckCircle size={24} /> Valider la Transaction</>}
           </button>
           <button onClick={onClose} className="text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest">
             Annuler
           </button>
        </div>
      </div>

      <UniversalPaymentSuccessModal
        isOpen={showReceipt}
        onClose={handleCloseReceipt}
        term="Terminer"
        data={receiptData}
        factureId={factureId}
      />
    </div>
  );
}
