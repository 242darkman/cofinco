import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, User, CreditCard, Coins, Users, CheckCircle, XCircle, Loader, ArrowLeft, ArrowUpRight, ArrowDownLeft, Wallet, ShieldCheck, Banknote } from 'lucide-react';
import { OTPValidationSimple } from '../../auth/OTPValidationSimple';
import { Card, Button, SearchInput, Badge, FormField, SelectField } from '../../ui';
import { clientSearchApi, clientApi, creditApi, tontineApi, operationCaisseApi, systemSettingsApi, factureApi, validationOtpApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { ReceiptTemplate } from '../../ui/printable/ReceiptTemplate';
import { useReceiptPrinter } from '../../../hooks/useReceiptPrinter';

// Types and Interfaces
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
  numero_credit?: string;
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

interface CompteEpargne {
    id: string;
    numeroCompte: string;
    typeCompte: string;
    solde: string;
    statut: string;
}

type DirectionOperation = 'Dépôt' | 'Retrait';
type DestinationType = 'Compte' | 'Credit' | 'Tontine';

interface CaisseOperationsProps {
  sessionId?: string;
  onBack?: () => void;
}

export default function CaisseOperations({ sessionId, onBack }: CaisseOperationsProps) {
  // Global State
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [smsValidationEnabled, setSmsValidationEnabled] = useState(true);
  
  // Selection State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  // Data State
  const [clientComptes, setClientComptes] = useState<CompteEpargne[]>([]);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [tontines, setTontines] = useState<Tontine[]>([]);
  
  // Operation State
  const [direction, setDirection] = useState<DirectionOperation>('Dépôt');
  const [selectedDestination, setSelectedDestination] = useState<{id: string, type: DestinationType, subType?: string, label: string} | null>(null);
  const [montant, setMontant] = useState('');
  
  // Dialogs & Validation
  const [showOTP, setShowOTP] = useState(false);
  const [otpData, setOtpData] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [montantError, setMontantError] = useState<string | null>(null);
  const [lastOperationReference, setLastOperationReference] = useState<string | null>(null);

  const { componentRef, receiptData, printReceipt, isPrinting } = useReceiptPrinter();

  // Initial Load
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
  
  // Real-time Update Listener
  const refreshClientData = useCallback(async (clientId: string) => {
      try {
          const updatedClient = await clientApi.getById(clientId);
          if (updatedClient) {
              setSelectedClient(prev => ({ ...prev, ...updatedClient }));
              await chargerDonneesClient(clientId); // Re-fetch all accounts/credits
          }
      } catch (err) {
          console.error("Failed to refresh client data:", err);
      }
  }, []);

  useEffect(() => {
      const handleClientUpdate = (event: CustomEvent) => {
          const { clientId } = event.detail || {};
          if (clientId && selectedClient && selectedClient.id === clientId) {
               refreshClientData(clientId);
          }
      };
      window.addEventListener('client-update', handleClientUpdate as EventListener);
      return () => window.removeEventListener('client-update', handleClientUpdate as EventListener);
  }, [selectedClient, refreshClientData]);

  // Client Search & Data Loading
  const rechercherClient = useCallback(async () => {
    const trimmedSearch = sanitizeInput(searchTerm.trim());
    if (!trimmedSearch) return;

    setSearchLoading(true);
    try {
      const results = await clientSearchApi.search(trimmedSearch);
      const data = results[0] || null;

      if (data) {
        setSelectedClient(data);
        await chargerDonneesClient(data.id);
        toast.success(`Client ${data.nom} sélectionné`);
      } else {
        toast.warning('Aucun client trouvé');
      }
    } catch (error) {
      handleApiError(error, 'Erreur recherche');
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm]);

  const chargerDonneesClient = useCallback(async (clientId: string) => {
    try {
      const [creditsData, tontinesData, comptesData] = await Promise.all([
        creditApi.getAll({ clientId, statut: 'Approuvé,En cours,Actif' }),
        tontineApi.getByClient(clientId),
        compteEpargneApi.getByClient(clientId)
      ]);

      setCredits(creditsData || []);
      // Map the result to extract the tontine objects from the membership data
      setTontines(tontinesData?.map((m: any) => m.tontine || m) || []);
      setClientComptes(comptesData || []);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    }
  }, []);

  // Validation
  const validateMontant = useCallback((value: string): boolean => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue <= 0) {
      setMontantError('Montant invalide');
      return false;
    }
    setMontantError(null);
    return true;
  }, []);

  // Form Reset
  const reinitialiserFormulaire = useCallback(() => {
    setSelectedClient(null);
    setDirection('Dépôt');
    setSelectedDestination(null);
    setMontant('');
    setSearchTerm('');
    setSuccessMessage('');
    setOtpData(null);
    setMontantError(null);
    setLastOperationReference(null);
    setClientComptes([]);
    setCredits([]);
    setTontines([]);
  }, []);

  // Operation Preparation
  const preparerOperation = useCallback(async () => {
    if (!selectedClient || !selectedDestination || !montant) {
      toast.warning('Formulaire incomplet');
      return;
    }

    if (!validateMontant(montant)) return;

    // Logic Check: Withdrawal amount vs Balance
    if (direction === 'Retrait' && selectedDestination.type === 'Compte') {
        const compte = clientComptes.find(c => c.id === selectedDestination.id);
        if (compte && parseFloat(montant) > parseFloat(compte.solde)) {
            setMontantError('Solde insuffisant');
            return;
        }
    }

    setShowConfirmDialog(true);
  }, [selectedClient, selectedDestination, montant, direction, clientComptes, validateMontant]);


  // Operation Execution
  const confirmerOperation = useCallback(async () => {
    setShowConfirmDialog(false);
    setLoading(true);
    const loadingId = toast.loading('Traitement...');

    try {
      // Determine Type Operation String
      let typeOperationStr = '';
      if (selectedDestination?.type === 'Compte') {
          typeOperationStr = direction === 'Dépôt' ? 'Versement' : 'Retrait';
      } else if (selectedDestination?.type === 'Credit') {
          typeOperationStr = 'Remboursement Crédit';
      } else if (selectedDestination?.type === 'Tontine') {
          typeOperationStr = 'Cotisation Tontine';
      }

      const operationPayload = {
        session_id: sessionId,
        client_id: selectedClient!.id,
        nom_client: `${selectedClient!.nom} ${selectedClient!.prenom}`,
        telephone_client: selectedClient!.telephone,
        type: typeOperationStr,
        montant: montant, 
        statut_otp: smsValidationEnabled ? 'En attente' : 'Non requis',
        // Optional links
        compte_id: selectedDestination?.type === 'Compte' ? selectedDestination.id : undefined,
        credit_id: selectedDestination?.type === 'Credit' ? selectedDestination.id : undefined,
        tontine_id: selectedDestination?.type === 'Tontine' ? selectedDestination.id : undefined,
        
        details_operation: {
           destination_label: selectedDestination?.label,
           direction: direction
        }
      };

      const operationInserted = await operationCaisseApi.create(operationPayload);
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
        setOtpData({
          operationId: operationInserted.id,
          codeOTP,
          telephone: selectedClient!.telephone,
          operationType: typeOperationStr,
          amount: parseFloat(montant)
        });
        setShowOTP(true);
      } else {
        toast.dismiss(loadingId);
        await finaliserOperationSansOTP(operationInserted.id, typeOperationStr);
      }
    } catch (error) {
      toast.dismiss(loadingId);
      handleApiError(error, 'Erreur création');
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedClient, selectedDestination, direction, montant, smsValidationEnabled]);

  const finaliserOperationSansOTP = async (opId: string, typeOp: string) => {
       try {
           await operationCaisseApi.update(opId, { statut_otp: 'Validé (sans SMS)' });
           await processDependentOperations(typeOp);
           setSuccessMessage('Opération validée !');
           toast.success('Succès');
       } catch (e) { console.error(e); }
  };

  const processDependentOperations = async (typeOp: string) => {
    // Credit Payments & Tontine Contributions logic
    // Note: Account updates are handled by backend finance.ts automatically now
    if (typeOp === 'Remboursement Crédit' && selectedDestination?.type === 'Credit') {
        await creditApi.addPayment(selectedDestination.id, { montant: parseFloat(montant), client_id: selectedClient?.id });
    }
    if (typeOp === 'Cotisation Tontine' && selectedDestination?.type === 'Tontine') {
        await tontineApi.addContribution(selectedDestination.id, { membre_id: selectedClient?.id, montant: parseFloat(montant) });
    }
    // TODO: Create Facture logic here if needed or keep existing logic
  };

  const handlePrintReceipt = useCallback(() => {
     if (!selectedClient || !montant) return;
     let typeOp = selectedDestination?.type === 'Compte' ? (direction === 'Dépôt' ? 'Versement' : 'Retrait') : (selectedDestination?.type === 'Credit' ? 'Remboursement' : 'Cotisation');
     
     printReceipt({
       title: 'Reçu de Transaction',
       reference: lastOperationReference || `OP-${Date.now()}`,
       date: new Date(),
       type: typeOp,
       client: { nom: selectedClient.nom, prenom: selectedClient.prenom, telephone: selectedClient.telephone },
       agent: { nom: 'Agent', prenom: 'Caisse' },
       items: [{ description: typeOp, details: selectedDestination?.label || '', montant: parseFloat(montant), quantite: 1 }],
       total: parseFloat(montant),
       modePaiement: 'Espèces',
       devise: 'FCFA'
     });
  }, [selectedClient, montant, selectedDestination, direction, lastOperationReference, printReceipt]);


  // Derived Data for UI
  const availableDestinations = useMemo(() => {
      const options: {id: string, type: DestinationType, label: string, subType: string, balance?: string}[] = [];

      // 1. Accounts (Always available if they exist)
      clientComptes.forEach(acc => {
          if (acc.statut !== 'Actif') return;
          options.push({
              id: acc.id,
              type: 'Compte',
              subType: acc.typeCompte,
              label: acc.typeCompte, // "Epargne", "Courant"
              balance: acc.solde
          });
      });

      // 2. Credits (Only for Dépôt)
      if (direction === 'Dépôt') {
          credits.forEach(cred => {
              options.push({
                  id: cred.id,
                  type: 'Credit',
                  subType: 'Credit',
                  label: 'Remboursement Crédit', //cred.type_credit || 'Crédit',
                  balance: formatMoney(cred.solde_restant) + ' restant'
              });
          });

          // 3. Tontines (Only for Dépôt)
          tontines.forEach(tont => {
              options.push({
                  id: tont.id,
                  type: 'Tontine',
                  subType: 'Tontine',
                  label: 'Cotisation Tontine', // tont.nom,
                  balance: formatMoney(tont.montant_contribution) + '/mois'
              });
          });
      }

      return options;
  }, [clientComptes, credits, tontines, direction]);


  // --- Render Components ---

  const SuccessModal = () => {
    if (!successMessage) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-6 relative flex flex-col items-center text-center space-y-6">
             <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/50 mb-2">
                 <CheckCircle className="text-emerald-500" size={32} />
             </div>
             <div>
                <h3 className="text-2xl font-bold text-white mb-2">Succès !</h3>
                <p className="text-slate-400">Transaction enregistrée.</p>
             </div>
             <div className="grid grid-cols-2 gap-3 w-full">
                <Button variant="outline" onClick={reinitialiserFormulaire} className="h-12 rounded-xl">Fermer</Button>
                <Button variant="primary" onClick={handlePrintReceipt} disabled={isPrinting} className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white">
                    {isPrinting ? <Loader className="animate-spin" /> : 'Reçu'}
                </Button>
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-[85vh] font-sans selection:bg-cyan-500/30">
      {receiptData && <div style={{ display: "none" }}><ReceiptTemplate ref={componentRef} data={receiptData} /></div>}
      <SuccessModal />
      <ConfirmDialog isOpen={showConfirmDialog} title="Confirmer" message={`Valider le ${direction.toLowerCase()} de ${formatMoney(parseFloat(montant || '0'))} ?`} onConfirm={confirmerOperation} onClose={() => setShowConfirmDialog(false)} />
      <OTPValidationSimple isOpen={showOTP} onClose={() => setShowOTP(false)} onValidate={async (val) => { if(val) { setShowOTP(false); await finaliserOperationSansOTP(otpData?.operationId, 'OTP Validated'); }}} phoneNumber={otpData?.telephone || ''} generatedCode={otpData?.codeOTP || ''} operationType={otpData?.operationType || ''} amount={otpData?.amount || 0} />

      <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col bg-slate-900/95 backdrop-blur-xl border border-slate-800/50 shadow-2xl rounded-[32px] overflow-hidden">
            
            {/* Header */}
            <div className="px-6 pt-8 pb-4 flex items-center justify-between">
                {selectedClient ? (
                     <button onClick={reinitialiserFormulaire} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={20} /> <span className="text-sm font-medium">Retour</span>
                     </button>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400"><Wallet size={16} /></div>
                        <span className="font-bold text-slate-200">Caisse Espèces</span>
                    </div>
                )}
                {selectedClient && <div className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider">Mode Transaction</div>}
            </div>

            <div className="p-6 flex-1 flex flex-col space-y-6 overflow-y-auto custom-scrollbar">
              
              {!selectedClient ? (
                /* Step 1: Search */
                <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-3xl font-bold text-white text-center mb-2">Quel client ?</h2>
                    <p className="text-slate-400 text-center mb-8">Recherchez un client pour commencer</p>
                    <div className="relative group mb-6">
                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none"><Search className="text-slate-500" size={24} /></div>
                        <input type="text" autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rechercherClient()} placeholder="Nom, téléphone, compte..." className="w-full pl-14 pr-6 py-6 bg-slate-800/50 border border-slate-700/50 rounded-3xl focus:border-cyan-500 focus:bg-slate-800 text-xl text-white outline-none transition-all shadow-inner placeholder:text-slate-600" />
                    </div>
                    <Button onClick={rechercherClient} disabled={searchLoading || !searchTerm.trim()} className="w-full py-5 rounded-2xl text-lg font-bold shadow-lg shadow-cyan-900/20 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 transition-all active:scale-[0.98]">
                        {searchLoading ? <Loader className="animate-spin mx-auto" /> : 'Continuer'}
                    </Button>
                </div>
              ) : (
                /* Step 2: Operation */
                <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-20">
                    
                    {/* Client Card */}
                    <div className="p-4 rounded-3xl bg-slate-800/40 border border-slate-700/50 flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-slate-700 overflow-hidden flex-shrink-0 border-2 border-slate-600">
                             {selectedClient.photo_url ? <img src={selectedClient.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-lg">{selectedClient.nom[0]}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate">{selectedClient.nom} {selectedClient.prenom}</h3>
                            <p className="text-slate-400 text-sm truncate">{selectedClient.telephone} • {selectedClient.numero_compte || 'Sans compte'}</p>
                        </div>
                    </div>

                    {/* Direction Switch */}
                    <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-800/50 rounded-2xl border border-slate-800">
                        <button onClick={() => { setDirection('Dépôt'); setSelectedDestination(null); setMontant(''); }} className={`relative flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${direction === 'Dépôt' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-emerald-400'}`}>
                            <ArrowDownLeft size={20} /> Dépôt
                        </button>
                        <button onClick={() => { setDirection('Retrait'); setSelectedDestination(null); setMontant(''); }} className={`relative flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${direction === 'Retrait' ? 'bg-red-500 text-white shadow-lg shadow-red-900/20' : 'text-slate-400 hover:text-red-400'}`}>
                             Retrait <ArrowUpRight size={20} />
                        </button>
                    </div>

                    {/* Dynamic Destination Grid */}
                    <div className="space-y-3">
                         <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Destination</label>
                         <div className="grid grid-cols-2 gap-3">
                            {availableDestinations.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => {
                                        setSelectedDestination(opt);
                                        // Auto-fill amount for tontine?
                                        if (opt.type === 'Tontine' && opt.balance) {
                                             const val = parseFloat(opt.balance.replace(/[^0-9.]/g, ''));
                                             if (!isNaN(val)) setMontant(val.toString());
                                        }
                                    }}
                                    className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 group overflow-hidden flex flex-col justify-between h-28 ${
                                        selectedDestination?.id === opt.id
                                        ? 'border-cyan-500 bg-cyan-950/20 shadow-lg shadow-cyan-900/20'
                                        : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-800'
                                    }`}
                                >
                                    <div className="flex items-start justify-between w-full">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedDestination?.id === opt.id ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                            {opt.type === 'Compte' && <CreditCard size={16} />}
                                            {opt.type === 'Credit' && <ShieldCheck size={16} />}
                                            {opt.type === 'Tontine' && <Users size={16} />}
                                        </div>
                                        {selectedDestination?.id === opt.id && <CheckCircle size={18} className="text-cyan-500" />}
                                    </div>
                                    <div>
                                        <span className={`block font-bold text-sm leading-tight ${selectedDestination?.id === opt.id ? 'text-white' : 'text-slate-300'}`}>
                                            {opt.label}
                                        </span>
                                        {opt.balance && <span className="text-[10px] text-slate-500 font-medium truncate block mt-1">{opt.type === 'Compte' ? formatMoney(opt.balance) : opt.balance}</span>}
                                    </div>
                                </button>
                            ))}
                            
                            {availableDestinations.length === 0 && (
                                <div className="col-span-2 py-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                                    Aucune destination disponible pour ce mode.
                                </div>
                            )}
                         </div>
                    </div>

                    {/* Amount Input */}
                    {selectedDestination && (
                        <div className="space-y-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
                             <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Montant (FCFA)</label>
                             <div className="relative">
                                <input
                                    type="number"
                                    value={montant}
                                    onChange={(e) => { setMontant(e.target.value); setMontantError(null); }}
                                    placeholder="0"
                                    className="w-full bg-slate-950 border-2 border-slate-800 focus:border-cyan-500/50 rounded-2xl py-5 text-4xl font-mono font-bold text-white text-center outline-none transition-colors"
                                />
                             </div>
                             {montantError && <p className="text-red-400 text-xs text-center font-bold">{montantError}</p>}
                             
                             {/* Valid Button */}
                            <Button
                                onClick={preparerOperation}
                                disabled={loading}
                                className="w-full py-5 mt-4 text-base font-bold rounded-2xl shadow-xl shadow-cyan-900/20 active:scale-[0.98] transition-all bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white"
                            >
                                {loading ? <Loader className="animate-spin mx-auto" /> : `Confirmer l'opération`}
                            </Button>
                        </div>
                    )}

                </div>
              )}
            </div>
        </Card>
      </div>
    </div>
  );
}
