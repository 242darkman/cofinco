import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, User, CreditCard, Coins, Users, CheckCircle, XCircle, Loader, ArrowLeft, Printer } from 'lucide-react';
import { OTPValidationSimple } from '../../auth/OTPValidationSimple';
import { Card, Button, SearchInput, Badge, FormField, SelectField } from '../../ui';
import { clientSearchApi, clientApi, creditApi, tontineApi, operationCaisseApi, systemSettingsApi, factureApi, validationOtpApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { ReceiptTemplate } from '../../ui/printable/ReceiptTemplate';
import { useReceiptPrinter } from '../../../hooks/useReceiptPrinter';

interface Client {
  id: string;
  nom: string;
  prenom: string;
  numero_compte?: string;
  telephone: string;
  email?: string;
  solde_epargne?: number;
  phone?: string;
  photo_url?: string;
}

interface Credit {
  id: string;
  montant: number;
  solde_restant: number;
  montant_total_du?: number;
  taux_interet: number;
  date_debut: string;
  date_fin: string;
  status: string;
  type_credit?: string;
}

interface Tontine {
  id: string;
  nom: string;
  montant_contribution: number;
  frequence: string;
  date_prochaine_reunion?: string;
  nombre_membres_actuel: number;
  status: string;
}

type TypeOperation = 'Versement' | 'Retrait' | 'Remboursement Crédit' | 'Cotisation Tontine';

interface CaisseOperationsProps {
  sessionId?: string;
  onBack?: () => void;
}

export default function CaisseOperations({ sessionId, onBack }: CaisseOperationsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [typeOperation, setTypeOperation] = useState<TypeOperation | null>(null);
  const [montant, setMontant] = useState('');
  const [credits, setCredits] = useState<Credit[]>([]);
  const [tontines, setTontines] = useState<Tontine[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null);
  const [selectedTontine, setSelectedTontine] = useState<Tontine | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otpData, setOtpData] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [smsValidationEnabled, setSmsValidationEnabled] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [montantError, setMontantError] = useState<string | null>(null);
  const [lastOperationReference, setLastOperationReference] = useState<string | null>(null);

  const { componentRef, receiptData, printReceipt, isPrinting } = useReceiptPrinter();

  // Charger les paramètres système
  useEffect(() => {
    loadSystemSettings();
  }, []);

  const loadSystemSettings = useCallback(async () => {
    try {
      const data = await systemSettingsApi.get();
      if (data) {
        setSmsValidationEnabled(data.sms_payment_validation_enabled !== false);
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    }
  }, []);
  
  // Refresh client data (Real-time)
  const refreshClientData = useCallback(async (clientId: string) => {
      try {
          const updatedClient = await clientApi.getById(clientId);
          if (updatedClient) {
              setSelectedClient(prev => ({ ...prev, ...updatedClient }));
              // Also refresh credits/tontines just in case
              await chargerDonneesClient(clientId);
          }
      } catch (err) {
          console.error("Failed to refresh client data:", err);
      }
  }, []);

  // Listen for real-time updates
  useEffect(() => {
      const handleClientUpdate = (event: CustomEvent) => {
          const { clientId } = event.detail || {};
          if (clientId && selectedClient && selectedClient.id === clientId) {
               refreshClientData(clientId);
          }
      };

      window.addEventListener('client-update', handleClientUpdate as EventListener);
      return () => {
          window.removeEventListener('client-update', handleClientUpdate as EventListener);
      };
  }, [selectedClient, refreshClientData]);

  // Validation du montant
  const validateMontant = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setMontantError('Le montant doit être supérieur à 0');
      return false;
    }
    if (numValue > VALIDATION_LIMITS.MAX_AMOUNT) {
      setMontantError(`Le montant ne peut pas dépasser ${formatMoney(VALIDATION_LIMITS.MAX_AMOUNT)}`);
      return false;
    }
    if (numValue < VALIDATION_LIMITS.MIN_AMOUNT) {
      setMontantError(`Le montant minimum est ${formatMoney(VALIDATION_LIMITS.MIN_AMOUNT)}`);
      return false;
    }
    setMontantError(null);
    return true;
  }, []);

  // Rechercher un client via api-client
  const rechercherClient = useCallback(async () => {
    const trimmedSearch = sanitizeInput(searchTerm.trim());
    if (!trimmedSearch) {
      toast.warning('Veuillez entrer un terme de recherche');
      return;
    }

    setSearchLoading(true);
    try {
      const results = await clientSearchApi.search(trimmedSearch);
      const data = results[0] || null;

      if (data) {
        setSelectedClient(data);
        await chargerDonneesClient(data.id);
        toast.success(`Client ${data.nom} ${data.prenom || ''} sélectionné`);
      } else {
        toast.warning('Aucun client trouvé avec ces critères');
      }
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors de la recherche');
      toast.error(errorMessage);
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm]);

  // Charger les données du client via api-client
  const chargerDonneesClient = useCallback(async (clientId: string) => {
    try {
      const [creditsData, tontinesData] = await Promise.all([
        creditApi.getAll({ clientId, statut: 'Approuvé,En cours,Actif' }),
        tontineApi.getAll({ statut: 'Active' })
      ]);

      setCredits(creditsData || []);
      setTontines(tontinesData || []);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      setCredits([]);
      setTontines([]);
    }
  }, []);

  // Préparer l'opération avec validation
  const preparerOperation = useCallback(async () => {
    if (!selectedClient || !typeOperation || !montant) {
      toast.warning('Veuillez remplir tous les champs');
      return;
    }

    if (!validateMontant(montant)) {
      return;
    }

    if (typeOperation === 'Remboursement Crédit' && !selectedCredit) {
      toast.warning('Veuillez sélectionner un crédit');
      return;
    }

    if (typeOperation === 'Cotisation Tontine' && !selectedTontine) {
      toast.warning('Veuillez sélectionner une tontine');
      return;
    }

    // Afficher la confirmation
    setShowConfirmDialog(true);
  }, [selectedClient, typeOperation, montant, selectedCredit, selectedTontine, validateMontant]);

  // Confirmer et lancer l'opération
  const confirmerOperation = useCallback(async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    const loadingId = toast.loading('Préparation de l\'opération...');

    try {
      const operationData = {
        session_id: sessionId,
        client_id: selectedClient!.id,
        nom_client: `${selectedClient!.nom} ${selectedClient!.prenom}`,
        telephone_client: selectedClient!.telephone,
        type: typeOperation,
        montant: montant, // Send as string for numeric/decimal DB field
        statut_otp: smsValidationEnabled ? 'En attente' : 'Non requis',
        credit_id: selectedCredit?.id,
        tontine_id: selectedTontine?.id,
        details_operation: {
          credit: selectedCredit ? {
            solde_restant: selectedCredit.solde_restant,
            nouveau_reste: selectedCredit.solde_restant - parseFloat(montant)
          } : null,
          tontine: selectedTontine ? {
            nom: selectedTontine.nom,
            montant_contribution: selectedTontine.montant_contribution
          } : null
        }
      };

      const operationInserted = await operationCaisseApi.create(operationData);
      setLastOperationReference(operationInserted.reference || `OP-${Date.now()}`);

      if (smsValidationEnabled) {
        const codeOTP = Math.floor(100000 + Math.random() * 900000).toString();

        await validationOtpApi.create({
          operation_id: operationInserted.id,
          client_id: selectedClient!.id,
          telephone: selectedClient!.telephone,
          code_otp: codeOTP,
          statut: 'En attente'
        });

        toast.dismiss(loadingId);
        toast.info('Code OTP envoyé par SMS');

        setOtpData({
          operationId: operationInserted.id,
          codeOTP,
          telephone: selectedClient!.telephone,
          message: `Code de validation COFIN: ${codeOTP}\nOpération: ${typeOperation}\nMontant: ${formatMoney(parseFloat(montant))}\nValable 10 minutes.`
        });
        setShowOTP(true);
      } else {
        toast.dismiss(loadingId);
        await finaliserOperationSansOTP(operationInserted.id);
      }
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de la préparation');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedClient, typeOperation, montant, smsValidationEnabled, selectedCredit, selectedTontine]);

  // Handle Receipt Printing
  const handlePrintReceipt = useCallback(() => {
    if (!selectedClient || !typeOperation || !montant) return;
    
    const details = selectedCredit 
      ? `Crédit ${selectedCredit.type_credit || ''} - Reste: ${formatMoney(selectedCredit.solde_restant - parseFloat(montant))}` 
      : selectedTontine 
        ? `Cotisation ${selectedTontine.nom}`
        : '';

    printReceipt({
      title: 'REÇU DE TRANSACTION',
      reference: lastOperationReference || `OP-${Date.now()}`,
      date: new Date(),
      type: typeOperation,
      client: {
        nom: selectedClient.nom,
        prenom: selectedClient.prenom,
        telephone: selectedClient.telephone,
        numeroCompte: selectedClient.numero_compte,
      },
      agent: {
        nom: 'Agent', // TODO: Get from Auth Context if available
        prenom: 'Caisse',
      },
      items: [
        {
          description: typeOperation,
          details: details,
          montant: parseFloat(montant),
          quantite: 1
        }
      ],
      total: parseFloat(montant),
      modePaiement: 'Espèces', // Default for Caisse Physics
      devise: 'FCFA'
    });
  }, [selectedClient, typeOperation, montant, selectedCredit, selectedTontine, lastOperationReference, printReceipt]);


  // Finaliser l'opération sans OTP
  const finaliserOperationSansOTP = useCallback(async (operationId: string) => {
    const loadingId = toast.loading('Finalisation de l\'opération...');

    try {
      await operationCaisseApi.update(operationId, { statut_otp: 'Validé (sans SMS)' });
      await processDependentOperations();
      await genererFacture(operationId);

      toast.dismiss(loadingId);
      toast.success('Opération validée avec succès !');

      setSuccessMessage('Opération validée avec succès !');
      // DO NOT Auto-reset immediately if we want to print
      // setTimeout(() => reinitialiserFormulaire(), 3000); 
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de la finalisation');
      toast.error(errorMessage);
    }
  }, []);

  // Traiter les opérations dépendantes
  const processDependentOperations = useCallback(async () => {
    if (typeOperation === 'Remboursement Crédit' && selectedCredit && selectedClient) {
      await creditApi.addPayment(selectedCredit.id, {
        montant: parseFloat(montant),
        client_id: selectedClient.id
      });
    }

    if (typeOperation === 'Cotisation Tontine' && selectedTontine && selectedClient) {
      await tontineApi.addContribution(selectedTontine.id, {
        membre_id: selectedClient.id,
        montant: parseFloat(montant)
      });
    }
  }, [typeOperation, selectedCredit, selectedTontine, selectedClient, montant]);

  // Valider l'opération après OTP
  const validerOperation = useCallback(async (codeValide: boolean) => {
    if (!codeValide || !otpData) {
      setShowOTP(false);
      return;
    }

    setLoading(true);
    const loadingId = toast.loading('Validation de l\'opération...');

    try {
      await operationCaisseApi.update(otpData.operationId, { statut_otp: 'Validé' });

      await validationOtpApi.update(otpData.operationId, {
        statut: 'Validé',
        date_validation: new Date().toISOString()
      });

      await processDependentOperations();
      await genererFacture(otpData.operationId);

      toast.dismiss(loadingId);
      toast.success('Opération validée avec succès !');

      setSuccessMessage('Opération validée avec succès !');
      // DO NOT Auto-reset immediately if we want to print
      // setTimeout(() => reinitialiserFormulaire(), 3000);
    } catch (error) {
      toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de la validation');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setShowOTP(false);
    }
  }, [otpData, processDependentOperations]);

  // Générer la facture
  const genererFacture = useCallback(async (operationId: string) => {
    try {
      const numeroFacture = `FACT-${Date.now()}`;
      const factureData = {
        operation_id: operationId,
        numero_facture: numeroFacture,
        type_facture: 'Client',
        client_id: selectedClient!.id,
        nom_client: `${selectedClient!.nom} ${selectedClient!.prenom}`,
        telephone_client: selectedClient!.telephone,
        type_operation: typeOperation,
        montant: parseFloat(montant),
        details: { credit: selectedCredit, tontine: selectedTontine }
      };

      await factureApi.create(factureData);

      // Facture Caisse
      await factureApi.create({
        ...factureData,
        type_facture: 'Caisse',
        numero_facture: numeroFacture + '-C'
      });
    } catch (error) {
      console.error('Erreur génération facture:', error);
    }
  }, [selectedClient, typeOperation, montant, selectedCredit, selectedTontine]);

  // Réinitialiser le formulaire
  const reinitialiserFormulaire = useCallback(() => {
    setSelectedClient(null);
    setTypeOperation(null);
    setMontant('');
    setSelectedCredit(null);
    setSelectedTontine(null);
    setSearchTerm('');
    setSuccessMessage('');
    setOtpData(null);
    setMontantError(null);
    setLastOperationReference(null);
  }, []);

  // Nouveau solde du crédit mémorisé
  const nouveauSoldeCredit = useMemo(() => {
    if (!selectedCredit || !montant || parseFloat(montant) <= 0) return null;
    return selectedCredit.solde_restant - parseFloat(montant);
  }, [selectedCredit, montant]);

  // Message de confirmation mémorisé
  const confirmationMessage = useMemo(() => {
    if (!selectedClient || !typeOperation || !montant) return '';
    let message = `Vous êtes sur le point d'effectuer un ${typeOperation.toLowerCase()} de ${formatMoney(parseFloat(montant))} pour ${escapeHtml(selectedClient.nom)} ${escapeHtml(selectedClient.prenom || '')}.`;
    if (typeOperation === 'Remboursement Crédit' && selectedCredit && nouveauSoldeCredit !== null) {
      message += ` Le nouveau solde du crédit sera de ${formatMoney(nouveauSoldeCredit)}.`;
    }
    if (typeOperation === 'Cotisation Tontine' && selectedTontine) {
      message += ` Cotisation pour la tontine "${escapeHtml(selectedTontine.nom)}".`;
    }
    return message;
  }, [selectedClient, typeOperation, montant, selectedCredit, selectedTontine, nouveauSoldeCredit]);

  return (
    <div className="flex flex-col font-sans selection:bg-cyan-500/30">
        
      {/* Hidden Receipt Template for Printing */}
      {receiptData && (
        <div style={{ display: "none" }}>
          <ReceiptTemplate ref={componentRef} data={receiptData} />
        </div>
      )}

      <div className="w-full max-w-sm mx-auto">
        <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 shadow-2xl shadow-cyan-900/10 rounded-2xl overflow-hidden ring-1 ring-white/5">
          <div className="p-5 relative">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" aria-hidden="true" />

            <div className="relative z-10">
              <div className="relative flex items-center justify-center mb-5">
                {onBack && (
                  <div className="absolute left-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onBack}
                      className="p-0 h-8 w-8 rounded-full text-slate-400 hover:text-white"
                      aria-label="Retour"
                    >
                      <ArrowLeft size={20} aria-hidden="true" />
                    </Button>
                  </div>
                )}
                <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight whitespace-nowrap">
                  Opérations de Caisse
                </h2>
              </div>

              {!selectedClient ? (
                <div
                  className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 shadow-inner backdrop-blur-sm group transition-all hover:bg-slate-800/70"
                  role="search"
                  aria-label="Recherche de client"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10">
                      <Search className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold text-sm text-slate-200 whitespace-nowrap">
                      Rechercher un client
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed font-medium">
                    Recherchez par nom, compte ou téléphone
                  </p>

                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                        placeholder="Ex: Kouame..."
                        className="w-full px-4 py-3 text-sm bg-slate-950/50 border border-slate-700 rounded-lg focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all placeholder:text-slate-600 text-white shadow-sm hover:border-slate-600"
                        aria-label="Rechercher un client par nom, compte ou téléphone"
                      />
                    </div>
                    <Button
                      onClick={rechercherClient}
                      disabled={searchLoading || !searchTerm.trim()}
                      className="w-full py-3 text-sm font-bold tracking-wide shadow-lg shadow-cyan-900/20 hover:shadow-cyan-500/20 transition-all active:scale-[0.98] whitespace-nowrap"
                      variant="primary"
                      aria-label="Rechercher le client"
                    >
                      {searchLoading ? <Loader className="w-4 h-4 animate-spin" aria-hidden="true" /> : 'Rechercher le client'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Client Info Card */}
                  <div
                    className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 relative overflow-hidden group hover:border-slate-600/50 transition-colors"
                    role="region"
                    aria-label="Informations du client sélectionné"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                    {!successMessage && (
                      <button
                        onClick={reinitialiserFormulaire}
                        className="absolute top-2.5 right-2.5 text-slate-500 hover:text-red-400 transition bg-slate-800/50 hover:bg-slate-800 p-1 rounded-full backdrop-blur-sm z-20"
                        aria-label="Annuler et réinitialiser le formulaire"
                      >
                        <XCircle size={16} aria-hidden="true" />
                      </button>
                    )}
                    <div className="flex items-center gap-3 pr-6 relative z-10">
                      <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
                        <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center">
                          {selectedClient.photo_url ? (
                            <img src={selectedClient.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User size={20} className="text-cyan-400" aria-hidden="true" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-white truncate tracking-tight">
                          {escapeHtml(selectedClient.nom)} {escapeHtml(selectedClient.prenom || '')}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[11px] font-medium text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-800 inline-block">
                            {escapeHtml(selectedClient.telephone || '')}
                          </p>
                          {selectedClient.numero_compte && (
                            <Badge
                              variant="neutral"
                              size="sm"
                              className="bg-slate-800 border-slate-700 text-slate-300 text-[10px]"
                              value={escapeHtml(selectedClient.numero_compte)}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                   {/* Success Message & Actions */}
                   {successMessage ? (
                    <div className="space-y-4 animate-in zoom-in-95 duration-300">
                      
                      <div
                        className="bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 px-4 py-6 rounded-xl flex flex-col items-center gap-3 text-center shadow-lg backdrop-blur-sm"
                        role="status"
                        aria-live="polite"
                      >
                        <div className="p-3 bg-emerald-500/10 rounded-full ring-1 ring-emerald-500/20 mb-1">
                          <CheckCircle size={32} aria-hidden="true" />
                        </div>
                        <span className="text-lg font-bold tracking-tight text-white">{successMessage}</span>
                        <p className="text-sm text-emerald-400/80">Transaction enregistrée avec succès</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                         <Button 
                            variant="secondary" 
                            className="w-full py-3 h-auto flex flex-col gap-1 items-center justify-center border-slate-700 bg-slate-800/80 hover:bg-slate-700"
                            onClick={handlePrintReceipt}
                            disabled={isPrinting}
                         >
                            <Printer size={20} />
                            <span className="text-xs">Imprimer Reçu</span>
                         </Button>

                         <Button 
                            variant="primary" 
                            className="w-full py-3 h-auto flex flex-col gap-1 items-center justify-center"
                            onClick={reinitialiserFormulaire}
                         >
                            <Coins size={20} />
                            <span className="text-xs">Nouvelle Opération</span>
                         </Button>
                      </div>

                    </div>
                  ) : (
                    <>
                    {/* Operation Type Selection */}
                    <div className="space-y-2.5">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                        Type d'opération
                      </label>
                      <div
                        className="grid grid-cols-2 gap-2.5"
                        role="group"
                        aria-label="Sélectionner le type d'opération"
                      >
                        {(['Versement', 'Retrait', 'Remboursement Crédit', 'Cotisation Tontine'] as TypeOperation[]).map((type) => (
                          <button
                            key={type}
                            onClick={() => {
                              setTypeOperation(type);
                              setMontantError(null);
                              if (type !== 'Cotisation Tontine') {
                                setMontant('');
                              }
                            }}
                            className={`p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center gap-2 text-center h-[72px] relative group overflow-hidden ${
                              typeOperation === type
                                ? 'border-cyan-500/50 bg-cyan-950/30 text-cyan-300 shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20'
                                : 'border-slate-800 bg-slate-800/30 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50 hover:text-slate-200'
                            }`}
                            aria-pressed={typeOperation === type}
                            aria-label={`Sélectionner ${type}`}
                          >
                            <div
                              className={`absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 transition-opacity duration-500 ${
                                typeOperation === type ? 'opacity-100' : 'group-hover:opacity-100'
                              }`}
                              aria-hidden="true"
                            />
                            {type === 'Versement' && (
                              <Coins
                                className={`transition-colors ${
                                  typeOperation === type
                                    ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                                    : 'text-slate-500 group-hover:text-slate-300'
                                }`}
                                size={20}
                                aria-hidden="true"
                              />
                            )}
                            {type === 'Retrait' && (
                              <CreditCard
                                className={`transition-colors ${
                                  typeOperation === type
                                    ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                                    : 'text-slate-500 group-hover:text-slate-300'
                                }`}
                                size={20}
                                aria-hidden="true"
                              />
                            )}
                            {type === 'Remboursement Crédit' && (
                              <CreditCard
                                className={`transition-colors ${
                                  typeOperation === type
                                    ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                                    : 'text-slate-500 group-hover:text-slate-300'
                                }`}
                                size={20}
                                aria-hidden="true"
                              />
                            )}
                            {type === 'Cotisation Tontine' && (
                              <Users
                                className={`transition-colors ${
                                  typeOperation === type
                                    ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                                    : 'text-slate-500 group-hover:text-slate-300'
                                }`}
                                size={20}
                                aria-hidden="true"
                              />
                            )}
                            <span className="font-semibold text-[10px] leading-tight relative z-10">{type}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic Sections based on Operation Type */}
                    {typeOperation === 'Remboursement Crédit' && credits.length > 0 && (
                      <div className="space-y-2.5 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                          Sélectionner un crédit
                        </label>
                        <div
                          className="flex overflow-x-auto gap-2.5 pb-2 -mx-1 px-1 snap-x scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
                          role="listbox"
                          aria-label="Sélectionner un crédit"
                        >
                          {credits.map((credit) => (
                            <div
                              key={credit.id}
                              onClick={() => setSelectedCredit(credit)}
                              className={`min-w-[160px] snap-center p-3.5 rounded-xl border cursor-pointer transition-all duration-300 ${
                                selectedCredit?.id === credit.id
                                  ? 'border-blue-500/50 bg-blue-950/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/20'
                                  : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                              }`}
                              role="option"
                              aria-selected={selectedCredit?.id === credit.id}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setSelectedCredit(credit);
                                }
                              }}
                            >
                              <div className="font-bold text-xs text-slate-200 mb-1">
                                {formatMoney(credit.montant_total_du || credit.montant || 0)}
                              </div>
                              <div className="text-[10px] text-slate-400 flex justify-between items-center">
                                <span>Reste:</span>
                                <span className="font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                  {formatMoney(credit.solde_restant || 0)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {typeOperation === 'Cotisation Tontine' && tontines.length > 0 && (
                      <div className="space-y-2.5 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                          Sélectionner une tontine
                        </label>
                        <div
                          className="flex overflow-x-auto gap-2.5 pb-2 -mx-1 px-1 snap-x scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
                          role="listbox"
                          aria-label="Sélectionner une tontine"
                        >
                          {tontines.map((tontine) => (
                            <div
                              key={tontine.id}
                              onClick={() => {
                                setSelectedTontine(tontine);
                                setMontant((tontine.montant_contribution || 0).toString());
                                setMontantError(null);
                              }}
                              className={`min-w-[160px] snap-center p-3.5 rounded-xl border cursor-pointer transition-all duration-300 ${
                                selectedTontine?.id === tontine.id
                                  ? 'border-emerald-500/50 bg-emerald-950/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20'
                                  : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                              }`}
                              role="option"
                              aria-selected={selectedTontine?.id === tontine.id}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setSelectedTontine(tontine);
                                  setMontant((tontine.montant_contribution || 0).toString());
                                }
                              }}
                            >
                              <div className="font-bold text-xs text-slate-200 truncate mb-1">
                                {escapeHtml(tontine.nom)}
                              </div>
                              <div className="text-emerald-400 font-bold text-sm bg-emerald-500/10 inline-block px-2 py-0.5 rounded">
                                {formatMoney(tontine.montant_contribution || 0)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Amount Input */}
                    {typeOperation && (
                      <div className="space-y-2.5 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <label
                          htmlFor="montant-input"
                          className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1"
                        >
                          Montant (FCFA)
                        </label>
                        <div className="relative group">
                          <input
                            id="montant-input"
                            type="number"
                            value={montant}
                            onChange={(e) => {
                              setMontant(e.target.value);
                              if (e.target.value) validateMontant(e.target.value);
                            }}
                            disabled={typeOperation === 'Cotisation Tontine'}
                            placeholder="0"
                            className={`w-full px-4 py-3.5 text-2xl font-bold text-center border rounded-xl focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none bg-slate-950/50 transition-all placeholder:text-slate-800 text-white disabled:opacity-50 disabled:bg-slate-900 group-hover:border-slate-600 shadow-inner ${
                              montantError ? 'border-red-500' : 'border-slate-700'
                            }`}
                            aria-invalid={!!montantError}
                            aria-describedby={montantError ? 'montant-error' : undefined}
                          />
                          {typeOperation !== 'Cotisation Tontine' && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600 pointer-events-none">
                              FCFA
                            </div>
                          )}
                        </div>
                        {montantError && (
                          <p
                            id="montant-error"
                            className="text-[10px] text-red-400 text-center"
                            role="alert"
                          >
                            {montantError}
                          </p>
                        )}
                        {selectedCredit && nouveauSoldeCredit !== null && (
                          <div className="flex justify-center">
                            <p className="text-[10px] text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">
                              Nouveau reste:{' '}
                              <span className={`font-bold ml-1 ${nouveauSoldeCredit < 0 ? 'text-red-400' : 'text-white'}`}>
                                {formatMoney(nouveauSoldeCredit)}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Button */}
                    <div className="pt-2">
                      <Button
                        onClick={preparerOperation}
                        disabled={loading || !typeOperation || !montant || !!montantError}
                        className={`w-full py-3.5 text-sm font-bold tracking-wide shadow-xl transition-all duration-300 relative overflow-hidden group ${
                          loading || !typeOperation || !montant || !!montantError
                            ? 'opacity-70 grayscale'
                            : 'hover:shadow-cyan-500/25 active:scale-[0.98]'
                        }`}
                        variant="primary"
                        aria-label="Confirmer l'opération"
                      >
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"
                          aria-hidden="true"
                        />
                        {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" aria-hidden="true" /> : "CONFIRMER L'OPÉRATION"}
                      </Button>
                    </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title={`Confirmer l'opération de ${typeOperation?.toLowerCase() || ''}`}
        message={confirmationMessage}
        onConfirm={confirmerOperation}
        onClose={() => setShowConfirmDialog(false)}
        variant={typeOperation === 'Retrait' ? 'danger' : 'success'}
        confirmText="Confirmer"
        cancelText="Annuler"
      />

      {/* OTP Validation */}
      {showOTP && otpData && (
        <OTPValidationSimple
          isOpen={showOTP}
          onClose={() => setShowOTP(false)}
          onValidate={validerOperation}
          phoneNumber={otpData.telephone}
          generatedCode={otpData.codeOTP}
          operationType={typeOperation || 'Opération'}
          amount={parseFloat(montant)}
        />
      )}
    </div>
  );
}
