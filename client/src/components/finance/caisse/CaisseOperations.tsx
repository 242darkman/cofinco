import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, CreditCard, Users, CheckCircle, Loader, ArrowLeft, ArrowUpRight, ArrowDownLeft, Wallet, ShieldCheck } from 'lucide-react';
import { Card, Button } from '../../ui';
import { clientSearchApi, clientApi, creditApi, tontineApi, operationCaisseApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney, parseMoney } from '../../../lib/format';
import { sanitizeInput } from '../../../lib/sanitize';
import { TypeOperationCaisse, TYPE_COMPTE_LABELS, TypeCompteType } from '@shared/enum/status-constants';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { ReceiptData, ReceiptTemplate } from '../../ui/printable/ReceiptTemplate';
import { InvoiceTemplate } from '../../ui/printable/InvoiceTemplate';
import { usePrinter } from '../../../hooks/useReceiptPrinter';
import { currencySymbol } from '@shared/config/currency';

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

type DirectionOperation = 'Dépôt' | 'Retrait';
type DestinationType = 'Compte' | 'Credit' | 'Tontine';

const maskAccountNumber = (value?: string) => {
  if (!value) return undefined;
  if (value.includes('*')) return value;
  const compact = value.replace(/\s+/g, '');
  const last4 = compact.slice(-4);
  if (!last4) return value;
  return `**** ${last4}`;
};

const resolveTontineStatus = (amount: number, miseParTour: number) => {
  if (miseParTour <= 0) return 'Indéfini';
  if (amount < miseParTour) return 'Retard';
  const reste = amount % miseParTour;
  if (reste === 0 && amount === miseParTour) return 'À jour';
  if (reste === 0 && amount > miseParTour) return 'Avance';
  return 'Avance partielle';
};

interface CaisseOperationsProps {
  sessionId?: string;
}

export default function CaisseOperations({ sessionId }: CaisseOperationsProps) {

  // Global State
  const [successMessage, setSuccessMessage] = useState('');
  
  // Selection State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClientInitialData, setSelectedClientInitialData] = useState<Client | null>(null);
  
  // Operation State
  const [direction, setDirection] = useState<DirectionOperation>('Dépôt');
  const [selectedDestination, setSelectedDestination] = useState<{id: string, type: DestinationType, subType?: string, label: string} | null>(null);
  const [montant, setMontant] = useState('');
  
  // Dialogs & Validation
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [montantError, setMontantError] = useState<string | null>(null);
  const [lastOperationReference, setLastOperationReference] = useState<string | null>(null);

  const { componentRef, printData, print, isPrinting } = usePrinter();
  const {
    componentRef: invoiceRef,
    printData: invoicePrintData,
    print: printInvoice,
    isPrinting: isInvoicePrinting
  } = usePrinter();
  
  // Real-time Data fetching with React Query
  const { data: selectedClient } = useQuery({
    queryKey: ['client', selectedClientId],
    queryFn: () => selectedClientId ? clientApi.getById(selectedClientId) : null,
    enabled: !!selectedClientId,
    initialData: selectedClientInitialData
  });

  const { data: clientComptes = [] } = useQuery({
    queryKey: ['comptes-epargne', selectedClientId],
    queryFn: () => selectedClientId ? compteEpargneApi.getByClient(selectedClientId) : [],
    enabled: !!selectedClientId
  });

  const { data: credits = [] } = useQuery({
    queryKey: ['credits', selectedClientId],
    queryFn: () => selectedClientId ? creditApi.getAll({ clientId: selectedClientId, statut: 'Approuvé,En cours,Actif' }) : [],
    enabled: !!selectedClientId
  });

  const { data: rawTontines = [] } = useQuery({
    queryKey: ['tontines', selectedClientId],
    queryFn: () => selectedClientId ? tontineApi.getByClient(selectedClientId) : [],
    enabled: !!selectedClientId
  });

  // Map tontine membership to tontine object
  const tontines = useMemo(() => {
    return rawTontines?.map((m: any) => m.tontine || m) || [];
  }, [rawTontines]);

  const [loading, setLoading] = useState(false); // Submission loading state


  // Client Search & Data Loading
  const rechercherClient = useCallback(async () => {
    const trimmedSearch = sanitizeInput(searchTerm.trim());
    if (!trimmedSearch) return;

    setSearchLoading(true);
    try {
      const response = await clientSearchApi.search(trimmedSearch, { page: 1, perPage: 10 });
      const data = response.data?.[0] || null;

      if (data) {
        setSelectedClientInitialData(data);
        setSelectedClientId(data.id);
        toast.success(`Client ${data.nom} sélectionné`);
        setSearchTerm('');
      } else {
        toast.warning('Aucun client trouvé');
      }
    } catch (error) {
      handleApiError(error, 'Erreur recherche');
    } finally {
      setSearchLoading(false);
    }
  }, [searchTerm]);

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
    setSelectedClientId(null);
    setSelectedClientInitialData(null);
    setDirection('Dépôt');
    setSelectedDestination(null);
    setMontant('');
    setSearchTerm('');
    setMontantError(null);
    setSuccessMessage('');
    setLastOperationReference(null);
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
    const loadingId = toast.loading(`Traitement du ${direction.toLowerCase()}...`);

    try {
      // Determine Type Operation String using standardized enum values
      let typeOperationStr = '';
      if (selectedDestination?.type === 'Compte') {
          const subType = selectedDestination.subType?.toLowerCase() || '';
          if (subType.includes('epargne') || subType.includes('épargne')) {
              typeOperationStr = direction === 'Dépôt'
                  ? TypeOperationCaisse.DEPOSIT_SAVINGS
                  : TypeOperationCaisse.WITHDRAWAL_SAVINGS;
          } else if (subType.includes('courant')) {
              typeOperationStr = direction === 'Dépôt'
                  ? TypeOperationCaisse.DEPOSIT_CURRENT
                  : TypeOperationCaisse.WITHDRAWAL_CURRENT;
          } else if (subType.includes('bloqu')) {
              typeOperationStr = direction === 'Dépôt'
                  ? TypeOperationCaisse.DEPOSIT_BLOCKED
                  : TypeOperationCaisse.WITHDRAWAL_BLOCKED;
          } else {
              // Default to savings for unknown account types
              typeOperationStr = direction === 'Dépôt'
                  ? TypeOperationCaisse.DEPOSIT_SAVINGS
                  : TypeOperationCaisse.WITHDRAWAL_SAVINGS;
          }
      } else if (selectedDestination?.type === 'Credit') {
          typeOperationStr = TypeOperationCaisse.LOAN_REPAYMENT;
      } else if (selectedDestination?.type === 'Tontine') {
          typeOperationStr = TypeOperationCaisse.TONTINE_CONTRIBUTION;
      }

      const operationPayload = {
        session_id: sessionId,
        client_id: selectedClient!.id,
        type_operation: typeOperationStr,
        montant: montant,
        description: `${direction} - ${selectedDestination?.label || ''}`,
        // Optional links
        compte_id: selectedDestination?.type === 'Compte' ? selectedDestination.id : undefined,
        metadata: {
          nom_client: `${selectedClient!.nom} ${selectedClient!.prenom}`,
          telephone_client: selectedClient!.telephone,
          destination_label: selectedDestination?.label,
          direction: direction,
          credit_id: selectedDestination?.type === 'Credit' ? selectedDestination.id : undefined,
          tontine_id: selectedDestination?.type === 'Tontine' ? selectedDestination.id : undefined
        }
      };

      const operationInserted = await operationCaisseApi.create(operationPayload);
      setLastOperationReference(operationInserted.reference || `OP-${Date.now()}`);

      // OTP désactivé - exécuter directement
      toast.dismiss(loadingId);
      await finaliserOperationSansOTP(operationInserted.id, typeOperationStr);
    } catch (error) {
      toast.dismiss(loadingId);
      handleApiError(error, `Erreur lors du ${direction.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }, [sessionId, selectedClient, selectedDestination, direction, montant]);

   const finaliserOperationSansOTP = async (opId: string, typeOp: string) => {
       try {
           await operationCaisseApi.update(opId, { statut_otp: 'Validé (sans SMS)' });
           await processDependentOperations(typeOp);
           
           const message = `${typeOp} de ${formatMoney(parseFloat(montant))} validé avec succès.`;
           setSuccessMessage(message);
           toast.success(message);
       } catch (e) { 
           console.error(e);
           toast.error("Erreur lors de la finalisation de l'opération");
       }
   };

  const processDependentOperations = async (typeOp: string) => {
    // Credit Payments & Tontine Contributions logic
    // Note: Account updates are handled by backend finance.ts automatically now
    if (typeOp === TypeOperationCaisse.LOAN_REPAYMENT && selectedDestination?.type === 'Credit') {
        await creditApi.addPayment(selectedDestination.id, { montant: parseFloat(montant), client_id: selectedClient?.id });
    }
    if (typeOp === TypeOperationCaisse.TONTINE_CONTRIBUTION && selectedDestination?.type === 'Tontine') {
        await tontineApi.addContribution(selectedDestination.id, { membre_id: selectedClient?.id, montant: parseFloat(montant) });
    }
    // TODO: Create Facture logic here if needed or keep existing logic
  };

  const buildReceiptData = useCallback((): ReceiptData | null => {
    if (!selectedClient || !montant || !selectedDestination) return null;

    const amountValue = parseMoney(montant);
    const typeOp =
      selectedDestination.type === 'Compte'
        ? (direction === 'Dépôt' ? 'Versement' : 'Retrait')
        : selectedDestination.type === 'Credit'
          ? 'Remboursement Crédit'
          : 'Cotisation Tontine';

    const details: NonNullable<ReceiptData['details']> = [];
    let numeroCompte: string | undefined;

    if (selectedDestination.type === 'Compte') {
      const compte = clientComptes.find(c => c.id === selectedDestination.id);
      const ancienSolde = compte ? parseMoney(compte.solde) : 0;
      const nouveauSolde =
        direction === 'Dépôt' ? ancienSolde + amountValue : ancienSolde - amountValue;
      numeroCompte = maskAccountNumber(compte?.numeroCompte || selectedClient.numeroCompte);
      details.push({ label: 'Ancien Solde', value: formatMoney(ancienSolde) });
      details.push({
        label: 'Mouvement',
        value: `${direction === 'Dépôt' ? '+' : '-'} ${formatMoney(amountValue)}`
      });
      details.push({
        label: 'Nouveau Solde',
        value: formatMoney(nouveauSolde),
        isBold: true
      });
    } else if (selectedDestination.type === 'Tontine') {
      const tontine = tontines.find(t => t.id === selectedDestination.id);
      const miseParTour = tontine?.montant_contribution || 0;
      const toursRegles = miseParTour > 0 ? Math.floor(amountValue / miseParTour) : 0;
      const statut = resolveTontineStatus(amountValue, miseParTour);
      details.push({ label: 'Mise par tour', value: formatMoney(miseParTour) });
      details.push({
        label: 'Tours réglés',
        value: `${toursRegles} ${toursRegles > 1 ? 'tours' : 'tour'}`
      });
      details.push({ label: 'Avance/Retard', value: statut });
    } else {
      details.push({ label: 'Montant', value: formatMoney(amountValue), isBold: true });
    }

    return {
      title: 'Reçu de Transaction',
      reference: lastOperationReference || `OP-${Date.now()}`,
      date: new Date(),
      type: typeOp,
      transaction: {
        id: lastOperationReference || `OP-${Date.now()}`,
        date: new Date(),
        type:
          selectedDestination.type === 'Compte'
            ? (direction === 'Dépôt' ? 'DEPOT' : 'RETRAIT')
            : selectedDestination.type === 'Credit'
              ? 'REMBOURSEMENT'
              : 'TONTINE',
        amount: amountValue,
        cashierName: 'Agent Caisse'
      },
      client: {
        nom: selectedClient.nom,
        prenom: selectedClient.prenom,
        telephone: selectedClient.telephone,
        numeroCompte: numeroCompte
      },
      agent: { nom: 'Agent', prenom: 'Caisse' },
      details,
      items: [
        {
          description: typeOp,
          details: selectedDestination.label || '',
          montant: amountValue,
          quantite: 1
        }
      ],
      total: amountValue,
      modePaiement: 'Espèces',
      devise: currencySymbol()
    };
  }, [selectedClient, montant, selectedDestination, direction, lastOperationReference, clientComptes, tontines]);

  const handlePrintTicket = useCallback(() => {
    const data = buildReceiptData();
    if (!data) return;
    print(data);
  }, [buildReceiptData, print]);

  const handlePrintInvoice = useCallback(() => {
    const data = buildReceiptData();
    if (!data) return;
    printInvoice(data);
  }, [buildReceiptData, printInvoice]);


  // Derived Data for UI
  const availableDestinations = useMemo(() => {
      const options: {id: string, type: DestinationType, label: string, subType: string, balance?: string}[] = [];

      // 1. Accounts (Always available if they exist)
      clientComptes.forEach(acc => {
          if (acc.statut !== 'ACTIVE') return;
          options.push({
              id: acc.id,
              type: 'Compte',
              subType: acc.typeCompte,
              label: TYPE_COMPTE_LABELS[acc.typeCompte as TypeCompteType] || acc.typeCompte, // "Compte Épargne", "Compte Courant"
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
        <div className="bg-surface-base border border-edge w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="p-6 relative flex flex-col items-center text-center space-y-6">
             <div className="w-16 h-16 rounded-full bg-status-success-bg flex items-center justify-center ring-1 ring-status-success/50 mb-2">
                 <CheckCircle className="text-status-success" size={32} />
             </div>
             <div>
                <h3 className="text-2xl font-bold text-content-primary mb-2">Succès !</h3>
                <p className="text-content-muted">Transaction enregistrée.</p>
             </div>
             <div className="space-y-3 w-full">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="primary"
                    onClick={handlePrintTicket}
                    disabled={isPrinting}
                    className="h-12 rounded-xl bg-status-success hover:bg-status-success text-white"
                  >
                    {isPrinting ? <Loader className="animate-spin" /> : 'Reçu Ticket'}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handlePrintInvoice}
                    disabled={isInvoicePrinting}
                    className="h-12 rounded-xl bg-status-info hover:bg-status-info text-white"
                  >
                    {isInvoicePrinting ? <Loader className="animate-spin" /> : 'Facture A4'}
                  </Button>
                </div>
                <Button variant="outline" onClick={reinitialiserFormulaire} className="h-12 rounded-xl">
                  Fermer
                </Button>
             </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-[85vh] font-sans selection:bg-accent-secondary/30">
      {printData && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0',
            width: '210mm',
            background: 'white',
            zIndex: -1,
          }}
        >
          <ReceiptTemplate ref={componentRef} data={printData} />
        </div>
      )}
      {invoicePrintData && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-10000px',
            top: '0',
            width: '210mm',
            background: 'white',
            zIndex: -1,
          }}
        >
          <InvoiceTemplate ref={invoiceRef} data={invoicePrintData} />
        </div>
      )}
      <SuccessModal />
      <ConfirmDialog isOpen={showConfirmDialog} title="Confirmer" message={`Valider le ${direction.toLowerCase()} de ${formatMoney(parseFloat(montant || '0'))} ?`} onConfirm={confirmerOperation} onClose={() => setShowConfirmDialog(false)} />

      <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
        <Card className="flex-1 flex flex-col bg-surface-base/95 backdrop-blur-xl border border-edge/50 shadow-2xl rounded-[32px] overflow-hidden">
            
            {/* Header */}
            <div className="px-6 pt-8 pb-4 flex items-center justify-between">
                {selectedClient ? (
                     <button onClick={reinitialiserFormulaire} className="flex items-center gap-2 text-content-muted hover:text-content-primary transition-colors">
                        <ArrowLeft size={20} /> <span className="text-sm font-medium">Retour</span>
                     </button>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent"><Wallet size={16} /></div>
                        <span className="font-bold text-content-secondary">Caisse Espèces</span>
                    </div>
                )}
                {selectedClient && <div className="px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold uppercase tracking-wider">Mode Transaction</div>}
            </div>

            <div className="p-6 flex-1 flex flex-col space-y-6 overflow-y-auto custom-scrollbar">
              
              {!selectedClient ? (
                /* Step 1: Search */
                <div className="flex-1 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-3xl font-bold text-content-primary text-center mb-2">Quel client ?</h2>
                    <p className="text-content-muted text-center mb-8">Recherchez un client pour commencer</p>
                    <div className="relative group mb-6">
                        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none"><Search className="text-content-muted" size={24} /></div>
                        <input type="text" autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rechercherClient()} placeholder="Nom, téléphone, compte..." className="w-full pl-14 pr-6 py-6 bg-surface/50 border border-edge-subtle rounded-3xl focus:border-accent focus:bg-surface text-xl text-content-primary outline-none transition-all shadow-inner placeholder:text-content-muted" />
                    </div>
                    <Button onClick={rechercherClient} disabled={searchLoading || !searchTerm.trim()} className="w-full py-5 rounded-2xl text-lg font-bold shadow-lg shadow-accent/20 bg-gradient-to-r from-accent to-status-info hover:from-accent hover:to-status-info transition-all active:scale-[0.98]">
                        {searchLoading ? <Loader className="animate-spin mx-auto" /> : 'Continuer'}
                    </Button>
                </div>
              ) : (
                /* Step 2: Operation */
                <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-20">
                    
                    {/* Client Card */}
                    <div className="p-4 rounded-3xl bg-surface/40 border border-edge-subtle flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-surface-elevated overflow-hidden flex-shrink-0 border-2 border-edge-strong">
                             {selectedClient.photo_url ? <img src={selectedClient.photo_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-content-muted font-bold text-lg">{selectedClient.nom[0]}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-content-primary truncate">{selectedClient.nom} {selectedClient.prenom}</h3>
                            <p className="text-content-muted text-sm truncate">{selectedClient.telephone} • {selectedClient.numeroCompte || 'Sans compte'}</p>
                        </div>
                    </div>

                    {/* Direction Switch */}
                    <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface/50 rounded-2xl border border-edge">
                        <button onClick={() => { setDirection('Dépôt'); setSelectedDestination(null); setMontant(''); }} className={`relative flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${direction === 'Dépôt' ? 'bg-status-success text-white shadow-lg shadow-status-success/20' : 'text-content-muted hover:text-status-success'}`}>
                            <ArrowDownLeft size={20} /> Dépôt
                        </button>
                        <button onClick={() => { setDirection('Retrait'); setSelectedDestination(null); setMontant(''); }} className={`relative flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${direction === 'Retrait' ? 'bg-status-danger text-white shadow-lg shadow-status-danger/20' : 'text-content-muted hover:text-status-danger'}`}>
                             Retrait <ArrowUpRight size={20} />
                        </button>
                    </div>

                    {/* Dynamic Destination Grid */}
                    <div className="space-y-3">
                         <label className="text-xs font-bold text-content-muted uppercase tracking-wider ml-1">Destination</label>
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
                                        ? 'border-accent bg-accent/10 shadow-lg shadow-accent/20'
                                        : 'border-edge bg-surface-base/50 hover:border-edge hover:bg-surface'
                                    }`}
                                >
                                    <div className="flex items-start justify-between w-full">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selectedDestination?.id === opt.id ? 'bg-accent-secondary text-content-primary' : 'bg-surface text-content-muted'}`}>
                                            {opt.type === 'Compte' && <CreditCard size={16} />}
                                            {opt.type === 'Credit' && <ShieldCheck size={16} />}
                                            {opt.type === 'Tontine' && <Users size={16} />}
                                        </div>
                                        {selectedDestination?.id === opt.id && <CheckCircle size={18} className="text-accent" />}
                                    </div>
                                    <div>
                                        <span className={`block font-bold text-sm leading-tight ${selectedDestination?.id === opt.id ? 'text-content-primary' : 'text-content-secondary'}`}>
                                            {opt.label}
                                        </span>
                                        {opt.balance && <span className="text-[10px] text-content-muted font-medium truncate block mt-1">{opt.type === 'Compte' ? formatMoney(opt.balance) : opt.balance}</span>}
                                    </div>
                                </button>
                            ))}
                            
                            {availableDestinations.length === 0 && (
                                <div className="col-span-2 py-8 text-center text-content-muted border border-dashed border-edge rounded-2xl">
                                    Aucune destination disponible pour ce mode.
                                </div>
                            )}
                         </div>
                    </div>

                    {/* Amount Input */}
                    {selectedDestination && (
                        <div className="space-y-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
                             <label className="text-xs font-bold text-content-muted uppercase tracking-wider ml-1">Montant (FCFA)</label>
                             <div className="relative">
                                <input
                                    type="number"
                                    value={montant}
                                    onChange={(e) => { setMontant(e.target.value); setMontantError(null); }}
                                    placeholder="0"
                                    className="w-full bg-surface-base border-2 border-edge focus:border-accent/50 rounded-2xl py-5 text-4xl font-mono font-bold text-content-primary text-center outline-none transition-colors"
                                />
                             </div>
                             {montantError && <p className="text-status-danger text-xs text-center font-bold">{montantError}</p>}
                             
                             {/* Valid Button */}
                            <Button
                                onClick={preparerOperation}
                                disabled={loading}
                                className="w-full py-5 mt-4 text-base font-bold rounded-2xl shadow-xl shadow-accent/20 active:scale-[0.98] transition-all bg-gradient-to-r from-accent to-status-info hover:from-accent hover:to-status-info text-white"
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
