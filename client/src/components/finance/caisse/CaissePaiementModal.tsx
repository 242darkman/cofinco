import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X, DollarSign, Wallet, Smartphone, Building2, User, FileText, Check, Users, CheckCircle2, AlertCircle, Printer, Eye, CreditCard, TrendingUp, PiggyBank } from 'lucide-react';
import SearchableSelect from '../../ui/SearchableSelect';
import { saveToLoge } from '../../../lib/loge-storage';
import { usePermissions } from '../../auth/ProtectedFeature';
import { clientApi, clientSearchApi, operationCaisseApi, tontineApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';

const AirtelLogo = ({ className = '' }: { className?: string }) => (
  <div className={`flex items-center justify-center font-bold text-red-500 bg-red-100 rounded-lg p-2 ${className}`}>
    <span>Airtel</span>
  </div>
);

const MTNLogo = ({ className = '' }: { className?: string }) => (
  <div className={`flex items-center justify-center font-bold text-yellow-500 bg-yellow-100 rounded-lg p-2 ${className}`}>
    <span>MTN</span>
  </div>
);

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
}

const TYPES_OPERATIONS = [
  { value: 'Cotisation Tontine', label: 'Cotisation Tontine', isEntree: true },
  { value: 'Retrait Tontine', label: 'Retrait Tontine', isEntree: false },
  { value: 'Remboursement Prêt', label: 'Remboursement Prêt', isEntree: true },
  { value: 'Décaissement Prêt', label: 'Décaissement Prêt', isEntree: false },
  { value: 'Dépôt épargne', label: 'Versement Compte Épargne', isEntree: true },
  { value: 'Retrait Épargne', label: 'Retrait Compte Épargne', isEntree: false },
  { value: 'Versement Courant', label: 'Versement Compte Courant', isEntree: true },
  { value: 'Retrait Courant', label: 'Retrait Compte Courant', isEntree: false },
  { value: 'Versement Bloqué', label: 'Versement Compte Bloqué', isEntree: true },
  { value: 'Retrait Bloqué', label: 'Retrait Compte Bloqué', isEntree: false },
  { value: 'Encaissement Divers', label: 'Encaissement Divers', isEntree: true },
  { value: 'Décaissement Divers', label: 'Décaissement Divers', isEntree: false },
  { value: 'Frais Bancaires', label: 'Frais Bancaires', isEntree: true },
] as const;

export default function CaissePaiementModal({ sessionId, onClose, onSuccess, initialType }: CaissePaiementModalProps) {
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

  // Client Summary State
  const [clientCredits, setClientCredits] = useState<any[]>([]);
  const [activeTontinesCount, setActiveTontinesCount] = useState(0);
  const [activeCreditsAmount, setActiveCreditsAmount] = useState(0);

  const [formData, setFormData] = useState({
    client_id: '',
    montant: '',
    mode_paiement: 'Espèces',
    type_operation: initialType || 'Cotisation Tontine',
    numero_telephone: '',
    numero_transaction: '',
    reference: '',
    description: ''
  });

  // Vérifier si c'est une opération d'entrée
  const isOperationEntree = useCallback((typeOp: string) => {
    const found = TYPES_OPERATIONS.find(t => t.value === typeOp);
    return found?.isEntree ?? true;
  }, []);

  // Vérifier si c'est une opération tontine
  const isTontineOperation = useMemo(() => {
    return formData.type_operation === 'Cotisation Tontine' || formData.type_operation === 'Retrait Tontine';
  }, [formData.type_operation]);

  // Charger les clients via api-client
  const loadClients = useCallback(async () => {
    try {
      const data = await clientApi.getAll();
      setClients(data.filter((c: any) => c.status === 'Actif'));
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
                 const tontines = await clientSearchApi.getTontines(formData.client_id);
                 setClientTontines(tontines || []);
                 setActiveTontinesCount((tontines || []).filter(t => t.statut === 'Actif').length);
                 
                 // Auto-select if tontine op
                 if (isTontineOperation && tontines && tontines.length === 1) {
                      selectTontine(tontines[0]);
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
      setActiveTontinesCount(0);
      setActiveCreditsAmount(0);
    }
  }, [formData.client_id, isTontineOperation, selectTontine]);



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
      newErrors.montant = 'Montant invalide';
    } else if (montant > VALIDATION_LIMITS.MAX_AMOUNT) {
      newErrors.montant = `Le montant ne peut pas dépasser ${formatMoney(VALIDATION_LIMITS.MAX_AMOUNT)}`;
    } else if (montant < VALIDATION_LIMITS.MIN_AMOUNT) {
      newErrors.montant = `Le montant minimum est ${formatMoney(VALIDATION_LIMITS.MIN_AMOUNT)}`;
    }

    const isMobileMoney = formData.mode_paiement === 'Airtel Money' || formData.mode_paiement === 'MTN Mobile Money';
    if (isMobileMoney && !formData.numero_telephone) {
      newErrors.numero_telephone = 'Numéro requis';
    }
    if (isMobileMoney && !formData.numero_transaction) {
      newErrors.numero_transaction = 'Numéro transaction requis';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description requise';
    }
    if (isTontineOperation && !selectedTontine) {
      newErrors.tontine = 'Veuillez sélectionner une tontine';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, isTontineOperation, selectedTontine]);

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

      const isMobileMoney = formData.mode_paiement === 'Airtel Money' || formData.mode_paiement === 'MTN Mobile Money';

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
        membreId: selectedTontine?.id || null
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
      if (formData.type_operation === 'Cotisation Tontine' && selectedTontine) {
        response = await tontineApi.addContribution(selectedTontine.tontineId, {
          clientId: formData.client_id,
          montant: operationData.montant,
          methodePaiement: formData.mode_paiement,
          reference: operationData.reference
        });
      } else {
        // **Autres opérations** : créer l'opération de caisse
        response = await operationCaisseApi.create({
          ...operationData,
          statut: 'Posté' 
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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paiement-modal-title"
    >
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <header className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 id="paiement-modal-title" className="text-2xl font-bold text-white">
            Fiche de Paiement
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
            data-testid="button-close-payment"
            aria-label="Fermer la fiche de paiement"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errors.submit && (
            <div
              className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg"
              role="alert"
            >
              {errors.submit}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <SearchableSelect
                label="Client *"
                name="client_id"
                value={formData.client_id}
                onChange={(value: string | number) => setFormData({ ...formData, client_id: String(value) })}
                options={clients.map(c => ({
                  value: c.id,
                  label: `${c.nom || ''} ${c.prenom || ''}`.trim() || 'Sans Nom',
                  subLabel: [c.telephone, c.email].filter(Boolean).join(' • '),
                  image: c.photo 
                }))}
                placeholder="Rechercher un client..."
                error={errors.client_id}
                required
              />
            </div>
            
            {/* Client Summary */}
            {formData.client_id && (
                <div className="col-span-1 md:col-span-2 bg-slate-700/30 rounded-lg p-3 flex flex-wrap gap-4 items-center mb-2">
                    <div className="flex items-center gap-2">
                        <User className="text-blue-400" size={18} />
                        <span className="text-slate-300 text-sm">Client: <strong className="text-white">{clients.find(c => c.id === formData.client_id)?.nom} {clients.find(c => c.id === formData.client_id)?.prenom}</strong></span>
                    </div>
                    
                    <div className="h-4 w-px bg-slate-600 hidden sm:block"></div>
                    
                    <div className="flex items-center gap-2" title="Crédits en cours">
                        <CreditCard className={clientCredits.length > 0 ? "text-amber-400" : "text-slate-500"} size={18} />
                        <span className="text-sm">
                            <span className="text-slate-400">Crédits:</span> 
                            <strong className={`ml-1 ${clientCredits.length > 0 ? "text-amber-400" : "text-slate-500"}`}>
                                {clientCredits.length} 
                                {clientCredits.length > 0 && ` (${formatMoney(activeCreditsAmount)})`}
                            </strong>
                        </span>
                    </div>

                    <div className="h-4 w-px bg-slate-600 hidden sm:block"></div>

                    <div className="flex items-center gap-2" title="Tontines actives">
                        <Users className={activeTontinesCount > 0 ? "text-emerald-400" : "text-slate-500"} size={18} />
                        <span className="text-sm">
                            <span className="text-slate-400">Tontines:</span>
                            <strong className={`ml-1 ${activeTontinesCount > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                                {activeTontinesCount}
                            </strong>
                        </span>
                    </div>
                </div>
            )}

            <div>
              <label
                htmlFor="type-operation-select"
                className="block text-sm font-semibold text-slate-300 mb-2"
              >
                Type d'Opération *
              </label>
              <select
                id="type-operation-select"
                value={formData.type_operation}
                onChange={(e) => setFormData({ ...formData, type_operation: e.target.value })}
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
                data-testid="select-operation-type"
                aria-required="true"
              >
                <optgroup label="Tontines">
                  <option value="Cotisation Tontine">Cotisation Tontine</option>
                  <option value="Retrait Tontine">Retrait Tontine</option>
                </optgroup>
                <optgroup label="Crédits / Prêts">
                  <option value="Remboursement Prêt">Remboursement Prêt</option>
                  <option value="Décaissement Prêt">Décaissement Prêt</option>
                </optgroup>
                <optgroup label="Compte Épargne">
                  <option value="Dépôt épargne">Versement Compte Épargne</option>
                  <option value="Retrait Épargne">Retrait Compte Épargne</option>
                </optgroup>
                <optgroup label="Compte Courant">
                  <option value="Versement Courant">Versement Compte Courant</option>
                  <option value="Retrait Courant">Retrait Compte Courant</option>
                </optgroup>
                <optgroup label="Compte Bloqué">
                  <option value="Versement Bloqué">Versement Compte Bloqué</option>
                  <option value="Retrait Bloqué">Retrait Compte Bloqué</option>
                </optgroup>
                <optgroup label="Autres">
                  <option value="Encaissement Divers">Encaissement Divers</option>
                  <option value="Décaissement Divers">Décaissement Divers</option>
                  <option value="Frais Bancaires">Frais Bancaires</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Section Tontines */}
          {isTontineOperation && formData.client_id && (
            <section
              className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-4"
              aria-labelledby="tontines-title"
            >
              <div className="flex items-center gap-2 mb-3">
                <Users className="text-blue-400" size={20} aria-hidden="true" />
                <h4 id="tontines-title" className="font-semibold text-white">
                  Tontines du client
                </h4>
              </div>

              {loadingTontines ? (
                <div className="flex items-center justify-center py-4" role="status" aria-label="Chargement des tontines">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
                </div>
              ) : clientTontines.length === 0 ? (
                <div className="flex items-center gap-2 text-amber-400 py-2" role="status">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>Ce client n'est inscrit à aucune tontine active</span>
                </div>
              ) : (
                <div className="space-y-2" role="listbox" aria-label="Liste des tontines">
                  {clientTontines.map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => selectTontine(ct)}
                      className={`w-full p-4 rounded-lg border-2 transition text-left flex items-center justify-between ${
                        selectedTontine?.id === ct.id
                          ? 'border-green-500 bg-green-500/20'
                          : 'border-slate-600 bg-slate-700/50 hover:border-blue-500'
                      }`}
                      data-testid={`tontine-option-${ct.id}`}
                      role="option"
                      aria-selected={selectedTontine?.id === ct.id}
                    >
                      <div>
                        <p className="font-semibold text-white">{escapeHtml(ct.tontine.nom)}</p>
                        <p className="text-sm text-slate-400">
                          Cotisation: <span className="text-green-400 font-bold">{formatMoney(parseFloat(ct.tontine.montantCotisation))}</span>
                          {' '}{escapeHtml(ct.tontine.frequence)}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Total versé: {formatMoney(parseFloat(ct.totalCotisations || '0'))}
                        </p>
                      </div>
                      {selectedTontine?.id === ct.id && (
                        <CheckCircle2 className="text-green-400" size={24} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {errors.tontine && (
                <p className="text-red-500 text-sm mt-2" role="alert">{errors.tontine}</p>
              )}
            </section>
          )}

          {/* Montant */}
          <div>
            <label
              htmlFor="montant-input"
              className="block text-sm font-semibold text-slate-300 mb-2"
            >
              <DollarSign size={16} className="inline mr-1" aria-hidden="true" />
              Montant (FCFA) *
            </label>
            <input
              id="montant-input"
              type="number"
              value={formData.montant}
              onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
              className={`w-full px-4 py-3 bg-slate-700 border ${
                errors.montant ? 'border-red-500' : 'border-slate-600'
              } rounded-lg text-white text-lg font-bold focus:ring-2 focus:ring-blue-500`}
              placeholder="50000"
              min="0"
              step="100"
              data-testid="input-montant"
              aria-required="true"
              aria-invalid={!!errors.montant}
              aria-describedby={errors.montant ? 'montant-error' : selectedTontine ? 'montant-hint' : undefined}
            />
            {errors.montant && (
              <p id="montant-error" className="text-red-500 text-sm mt-1" role="alert">
                {errors.montant}
              </p>
            )}
            {selectedTontine && !errors.montant && (
              <p id="montant-hint" className="text-sm text-green-400 mt-1">
                Montant de cotisation prérempli depuis la tontine "{escapeHtml(selectedTontine.tontine.nom)}"
              </p>
            )}
          </div>

          {/* Mode de Paiement */}
          <fieldset>
            <legend className="block text-sm font-semibold text-slate-300 mb-3">
              Mode de Paiement *
            </legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="radiogroup">
              {[
                { mode: 'Espèces', icon: Wallet, color: 'green', disabled: false },
                { mode: 'Airtel Money', icon: null, color: 'red', logo: AirtelLogo, disabled: true },
                { mode: 'MTN Mobile Money', icon: null, color: 'yellow', logo: MTNLogo, disabled: true },
                { mode: 'Virement', icon: Building2, color: 'emerald', disabled: true }
              ].map(({ mode, icon: Icon, color, logo: Logo, disabled }) => (
                <button
                  key={mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    const needsPhone = mode === 'Airtel Money' || mode === 'MTN Mobile Money';
                    setFormData({
                      ...formData,
                      mode_paiement: mode,
                      numero_telephone: needsPhone ? formData.numero_telephone : '',
                      numero_transaction: needsPhone ? formData.numero_transaction : ''
                    });
                  }}
                  className={`p-4 rounded-lg border-2 transition relative ${
                    disabled 
                      ? 'border-slate-800 bg-slate-800/50 opacity-50 cursor-not-allowed grayscale' 
                      : formData.mode_paiement === mode
                        ? `border-${color}-500 bg-${color}-500/20`
                        : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                  }`}
                  role="radio"
                  aria-checked={formData.mode_paiement === mode}
                  aria-disabled={disabled}
                  data-testid={`payment-${mode.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {Logo ? (
                    <Logo className="h-12 w-12 mx-auto mb-2" />
                  ) : Icon ? (
                    <Icon
                      size={32}
                      className={`mx-auto mb-2 ${
                        disabled ? 'text-slate-600' :
                        formData.mode_paiement === mode ? `text-${color}-400` : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                  ) : null}
                  <div
                    className={`text-sm font-semibold ${
                      disabled ? 'text-slate-500' :
                      formData.mode_paiement === mode ? `text-${color}-400` : 'text-slate-300'
                    }`}
                  >
                    {mode.replace(' Money', '').replace(' Mobile', '')}
                  </div>
                  {disabled && (
                     <span className="absolute top-2 right-2 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
                     </span>
                  )}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Informations Mobile Money */}
          {(formData.mode_paiement === 'Airtel Money' || formData.mode_paiement === 'MTN Mobile Money') && (
            <section
              className="p-4 bg-slate-700/30 border border-slate-600 rounded-lg space-y-4"
              aria-labelledby="mobile-money-title"
            >
              <div className="flex items-center gap-2 mb-3">
                <Smartphone className="text-cyan-400" size={20} aria-hidden="true" />
                <h4 id="mobile-money-title" className="font-semibold text-white">
                  Informations Mobile Money
                </h4>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="phone-input"
                    className="block text-sm font-semibold text-slate-300 mb-2"
                  >
                    Numéro de Téléphone *
                  </label>
                  <input
                    id="phone-input"
                    type="tel"
                    value={formData.numero_telephone}
                    onChange={(e) => setFormData({ ...formData, numero_telephone: e.target.value })}
                    className={`w-full px-4 py-3 bg-slate-700 border ${
                      errors.numero_telephone ? 'border-red-500' : 'border-slate-600'
                    } rounded-lg text-white`}
                    placeholder="+242 06 XXX XXXX"
                    data-testid="input-phone"
                    aria-required="true"
                    aria-invalid={!!errors.numero_telephone}
                    aria-describedby={errors.numero_telephone ? 'phone-error' : undefined}
                  />
                  {errors.numero_telephone && (
                    <p id="phone-error" className="text-red-500 text-sm mt-1" role="alert">
                      {errors.numero_telephone}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="transaction-input"
                    className="block text-sm font-semibold text-slate-300 mb-2"
                  >
                    Numéro de Transaction *
                  </label>
                  <input
                    id="transaction-input"
                    type="text"
                    value={formData.numero_transaction}
                    onChange={(e) => setFormData({ ...formData, numero_transaction: e.target.value })}
                    className={`w-full px-4 py-3 bg-slate-700 border ${
                      errors.numero_transaction ? 'border-red-500' : 'border-slate-600'
                    } rounded-lg text-white font-mono`}
                    placeholder="TRX123456789"
                    data-testid="input-transaction"
                    aria-required="true"
                    aria-invalid={!!errors.numero_transaction}
                    aria-describedby={errors.numero_transaction ? 'transaction-error' : undefined}
                  />
                  {errors.numero_transaction && (
                    <p id="transaction-error" className="text-red-500 text-sm mt-1" role="alert">
                      {errors.numero_transaction}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Référence */}
          <div>
            <label
              htmlFor="reference-input"
              className="block text-sm font-semibold text-slate-300 mb-2"
            >
              Référence (optionnel)
            </label>
            <input
              id="reference-input"
              type="text"
              value={formData.reference}
              onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono"
              placeholder="Généré automatiquement"
              data-testid="input-reference"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="description-input"
              className="block text-sm font-semibold text-slate-300 mb-2"
            >
              <FileText size={16} className="inline mr-1" aria-hidden="true" />
              Description *
            </label>
            <textarea
              id="description-input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`w-full px-4 py-3 bg-slate-700 border ${
                errors.description ? 'border-red-500' : 'border-slate-600'
              } rounded-lg text-white`}
              rows={3}
              placeholder="Détails du paiement..."
              data-testid="input-description"
              aria-required="true"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && (
              <p id="description-error" className="text-red-500 text-sm mt-1" role="alert">
                {errors.description}
              </p>
            )}
          </div>

          {/* Résumé du montant */}
          {formattedMontant && (
            <div
              className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4"
              role="status"
              aria-label="Résumé du paiement"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Montant du paiement</p>
                  <p
                    className={`text-3xl font-bold ${
                      isOperationEntree(formData.type_operation) ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {isOperationEntree(formData.type_operation) ? '+' : '-'}
                    {formattedMontant}
                  </p>
                  <p className="text-sm text-slate-300 mt-1">via {formData.mode_paiement}</p>
                </div>
                <DollarSign
                  size={48}
                  className={isOperationEntree(formData.type_operation) ? 'text-green-400' : 'text-red-400'}
                  aria-hidden="true"
                />
              </div>
            </div>
          )}

          {/* Boutons d'action */}
          <div className="flex gap-3">
            {canCreatePayments ? (
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                data-testid="button-validate-payment"
              >
                <Check size={20} aria-hidden="true" />
                {loading ? 'Enregistrement...' : 'Valider le Paiement'}
              </button>
            ) : (
              <div
                className="flex-1 px-6 py-3 bg-amber-500/20 text-amber-400 rounded-lg text-center font-semibold flex items-center justify-center gap-2"
                role="alert"
              >
                <AlertCircle size={20} aria-hidden="true" />
                Vous n'avez pas la permission d'effectuer des paiements
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold focus:ring-2 focus:ring-slate-500 focus:outline-none"
              data-testid="button-cancel-payment"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>

      {/* Universal Success Modal */}
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
        factureId={factureId}
      />
    </div>
  );
}
