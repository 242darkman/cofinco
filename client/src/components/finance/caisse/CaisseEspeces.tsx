import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, User, CheckCircle, XCircle, Wallet, ArrowUpRight, ArrowDownLeft, Loader, Coins } from 'lucide-react';
import { PhysicalConfirmationStep, PhysicalConfirmationData } from '../../auth/PhysicalConfirmationStep';
import { Card, Button, Badge } from '@/components/ui';
import { clientSearchApi, creditApi, tontineApi, sessionCaisseApi, operationCaisseApi, echeanceCreditApi, compteEpargneApi } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { authService } from '../../../lib/auth';
import { StatutCredit, TypeCompte, TypeOperationCaisse } from '@shared/enum/status-constants';
import { useOperationInfo } from './hooks/useOperationInfo';
import { currencySymbol } from '@shared/config/currency';

// Mapping des types UI (français) vers les enums système (EN)
const mapToOperationEnum = (typeOp: string | null, typeDetaille: string | null): string => {
  if (!typeDetaille) return TypeOperationCaisse.MISC_COLLECTION;

  const detail = typeDetaille.toLowerCase();

  // Dépôts
  if (detail.includes('épargne') || detail.includes('epargne')) {
    return typeOp === 'Retrait' ? TypeOperationCaisse.WITHDRAWAL_SAVINGS : TypeOperationCaisse.DEPOSIT_SAVINGS;
  }
  if (detail.includes('courant')) {
    return typeOp === 'Retrait' ? TypeOperationCaisse.WITHDRAWAL_CURRENT : TypeOperationCaisse.DEPOSIT_CURRENT;
  }
  if (detail.includes('bloqué') || detail.includes('bloque')) {
    return typeOp === 'Retrait' ? TypeOperationCaisse.WITHDRAWAL_BLOCKED : TypeOperationCaisse.DEPOSIT_BLOCKED;
  }
  if (detail.includes('tontine') && detail.includes('cotisation')) {
    return TypeOperationCaisse.TONTINE_CONTRIBUTION;
  }
  if (detail.includes('tontine') && detail.includes('distribution')) {
    return TypeOperationCaisse.TONTINE_WITHDRAWAL;
  }
  if (detail.includes('remboursement') || detail.includes('crédit')) {
    return TypeOperationCaisse.LOAN_REPAYMENT;
  }
  if (detail.includes('décaissement') || detail.includes('decaissement')) {
    return TypeOperationCaisse.LOAN_DISBURSEMENT;
  }

  // Fallback
  return typeOp === 'Retrait' ? TypeOperationCaisse.MISC_DISBURSEMENT : TypeOperationCaisse.MISC_COLLECTION;
};

interface Client {
  id: string;
  nom: string;
  prenom: string;
  numeroCompte?: string;
  numero_compte?: string;
  telephone: string;
  email?: string;
  phone?: string;
  photo_url?: string;
}

type TypeOperation = 'Dépôt' | 'Retrait';
type TypeDepot = 'Compte Courant' | 'Compte Épargne' | 'Compte Bloqué' | 'Cotisation Tontine' | 'Remboursement Crédit';
type TypeRetrait = 'Retrait Compte Courant' | 'Retrait Épargne' | 'Décaissement Crédit' | 'Distribution Tontine';

interface CaisseEspecesProps {
  sessionId: string;
  onTransactionComplete: () => void;
}

const DENOMINATIONS = [
  { value: 10000, label: '10.000' },
  { value: 5000, label: '5.000' },
  { value: 2000, label: '2.000' },
  { value: 1000, label: '1.000' },
  { value: 500, label: '500' },
  { value: 100, label: '100' },
];



export default function CaisseEspeces({ sessionId, onTransactionComplete }: CaisseEspecesProps) {
  const user = authService.getCurrentUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [typeOperation, setTypeOperation] = useState<TypeOperation | null>(null);
  const [typeDepot, setTypeDepot] = useState<TypeDepot | null>(null);
  const [typeRetrait, setTypeRetrait] = useState<TypeRetrait | null>(null);
  const [montant, setMontant] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showPhysicalConfirmation, setShowPhysicalConfirmation] = useState(false);
  const [pendingOperationData, setPendingOperationData] = useState<any>(null);
  const [creditsActifs, setCreditsActifs] = useState<any[]>([]);
  const [creditSelectionne, setCreditSelectionne] = useState<any>(null);
  const [prochaineEcheance, setProchaineEcheance] = useState<any>(null);
  const [tontinesActives, setTontinesActives] = useState<any[]>([]);
  const [tontineSelectionnee, setTontineSelectionnee] = useState<any>(null);
  const [comptesClient, setComptesClient] = useState<any[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [montantError, setMontantError] = useState<string | null>(null);
  const [lastOperationData, setLastOperationData] = useState<any>(null);

  // Physical confirmation state (replaces OTP)
  const [confirmationData, setConfirmationData] = useState<PhysicalConfirmationData | null>(null);

  // Universal Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);

  // Billetage State
  const [showBilletage, setShowBilletage] = useState(false);
  const [billetage, setBilletage] = useState<Record<number, number>>({});

  // Dynamic Info via Hook
  const { infoCardData, suggestedAmount, loading: infoLoading } = useOperationInfo({
    clientId: selectedClient?.id,
    typeOperation,
    subType: typeOperation === 'Dépôt' ? typeDepot : typeRetrait,
    selectedClient,
    tontinesActives,
    creditsActifs,
    comptesClient
  });

  // Auto-fill amount when suggested amount changes
  useEffect(() => {
    if (suggestedAmount) {
      setMontant(suggestedAmount);
      setMontantError(null);
    }
  }, [suggestedAmount]);


  const toggleBilletage = useCallback(() => setShowBilletage(!showBilletage), [showBilletage]);

  // Mise à jour du billetage avec calcul automatique
  const updateBilletage = useCallback((value: number, count: number) => {
    const sanitizedCount = Math.max(0, Math.floor(count));
    const newBilletage = { ...billetage, [value]: sanitizedCount };
    setBilletage(newBilletage);

    const total = Object.entries(newBilletage).reduce((acc, [val, qty]) => {
      return acc + (parseInt(val) * qty);
    }, 0);

    if (total > 0) {
      setMontant(total.toString());
      setMontantError(null);
    }
  }, [billetage]);

  // NOTE: OTP/Security config removed - Physical Confirmation is now always used for sensitive operations

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

  // Recherche de client via api-client
  const rechercherClient = useCallback(async () => {
    const trimmedSearch = sanitizeInput(searchTerm.trim());
    if (!trimmedSearch) {
      toast.warning('Veuillez entrer un terme de recherche');
      return;
    }

    setSearchLoading(true);
    try {
      const response = await clientSearchApi.search(trimmedSearch, { page: 1, perPage: 10 });
      const data = response.data?.length ? response.data[0] : null;

      if (data) {
        setSelectedClient(data);
        // Charger en parallèle les crédits, tontines et comptes
        await Promise.all([
          chargerCreditsActifs(data.id),
          chargerTontinesActives(data.id),
          chargerComptesClient(data.id)
        ]);
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

  // Charger les crédits actifs via api-client
  const chargerCreditsActifs = useCallback(async (clientId: string) => {
    try {
      const credits = await creditApi.getAll({ clientId, statut: StatutCredit.ACTIVE });
      setCreditsActifs(credits || []);
    } catch (error) {
      console.error('Erreur chargement crédits:', error);
      setCreditsActifs([]);
    }
  }, []);

  // Charger la prochaine échéance via api-client
  const chargerProchaineEcheance = useCallback(async (creditId: string) => {
    try {
      const echeance = await echeanceCreditApi.getProchaine(creditId);
      if (echeance) {
        setProchaineEcheance(echeance);
        setMontant(echeance.montantTotal.toString());
        setMontantError(null);
      } else {
        setProchaineEcheance(null);
        setMontant('');
      }
    } catch (error) {
      console.error('Erreur chargement échéance:', error);
      setProchaineEcheance(null);
    }
  }, []);

  // Charger les tontines actives via api-client
  const chargerTontinesActives = useCallback(async (clientId: string) => {
    try {
      const tontines = await tontineApi.getByClient(clientId);
      setTontinesActives(tontines || []);
    } catch (error) {
      console.error('Erreur chargement tontines:', error);
      setTontinesActives([]);
    }
  }, []);

  // Charger les comptes du client
  const chargerComptesClient = useCallback(async (clientId: string) => {
    try {
      const comptes = await compteEpargneApi.getByClient(clientId);
      setComptesClient(comptes || []);
    } catch (error) {
      console.error('Erreur chargement comptes:', error);
      setComptesClient([]);
    }
  }, []);

  // Trouver le compte approprié selon le type d'opération
  const getCompteIdForOperation = useCallback((typeOp: TypeDepot | TypeRetrait | null): string | undefined => {
    if (!comptesClient.length) return undefined;

    let targetType: string | null = null;
    if (typeOp === 'Compte Courant' || typeOp === 'Retrait Compte Courant') {
      targetType = TypeCompte.CURRENT;
    } else if (typeOp === 'Compte Épargne' || typeOp === 'Retrait Épargne') {
      targetType = TypeCompte.SAVINGS;
    } else if (typeOp === 'Compte Bloqué') {
      targetType = TypeCompte.BLOCKED;
    }

    if (targetType) {
      const compte = comptesClient.find(c => {
        const ct = c.typeCompte || '';
        return ct === targetType;
      });
      return compte?.id;
    }
    return undefined;
  }, [comptesClient]);




  // Préparer l'opération avec validation
  const preparerOperation = useCallback(async () => {
    if (!typeOperation || !montant) {
      toast.warning('Veuillez sélectionner un type d\'opération et entrer un montant');
      return;
    }

    if (!validateMontant(montant)) {
      return;
    }

    if (typeOperation === 'Dépôt' && !typeDepot) {
      toast.warning('Veuillez sélectionner la destination du dépôt');
      return;
    }

    if (typeOperation === 'Retrait' && !typeRetrait) {
      toast.warning('Veuillez sélectionner la source du retrait');
      return;
    }

    // Afficher la confirmation
    setShowConfirmDialog(true);
  }, [typeOperation, montant, typeDepot, typeRetrait, validateMontant]);

  // Vérifier si l'opération nécessite une confirmation physique (retraits et montants élevés)
  const requiresPhysicalConfirmation = useCallback((opType: string, amount: number): boolean => {
    // Retraits toujours confirmés physiquement
    if (opType === 'Retrait') return true;
    // Dépôts > 500 000 FCFA aussi (anti-blanchiment)
    if (amount >= 500_000) return true;
    return false;
  }, []);

  // Confirmer et décider du type de validation (physique ou direct)
  const confirmerPreparation = useCallback(async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      const reference = `ESP-${Date.now()}`;
      const typeDetaille = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;

      // Trouver le compte associé à ce type d'opération
      const compteId = getCompteIdForOperation(typeDetaille);
      const parsedMontant = parseFloat(montant);

      // Map French UI strings to standardized enum values
      const typeOperationEnum = mapToOperationEnum(typeOperation, typeDetaille);

      const operationData = {
        session_id: sessionId,
        client_id: selectedClient!.id,
        compte_id: compteId,
        type_operation: typeOperationEnum,
        montant: parsedMontant,
        methode_paiement: 'CASH',
        reference: reference,
        description: sanitizeInput(description) || `${typeOperation} - ${typeDetaille}`,
        metadata: {
          sous_type_operation: typeDetaille,
          type_paiement: 'CASH',
          details_billetage: Object.keys(billetage).length > 0 ? billetage : undefined,
          client_info: {
            nom: selectedClient!.nom,
            prenom: selectedClient!.prenom,
            telephone: selectedClient!.telephone || selectedClient!.phone
          }
        }
      };

      setPendingOperationData(operationData);

      // Décider du type de validation
      if (requiresPhysicalConfirmation(typeOperation!, parsedMontant)) {
        // Retraits ou montants élevés: confirmation physique requise
        setShowPhysicalConfirmation(true);
        setLoading(false);
      } else {
        // Petits dépôts: exécution directe
        setLoading(false);
        await validerOperationDirect(operationData);
      }
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors de la préparation');
      toast.error(errorMessage);
      setLoading(false);
    }
  }, [typeOperation, typeDepot, typeRetrait, sessionId, selectedClient, montant, description, billetage, getCompteIdForOperation, requiresPhysicalConfirmation]);

  // Fonction centrale pour exécuter l'opération (utilisée par tous les modes de validation)
  const executeOperation = useCallback(async (operationData: any, loadingId?: string | number) => {
    try {
      // Enregistrer l'opération via api-client
      await operationCaisseApi.create(operationData);

      // Mettre à jour le solde de la session
      const montantAjout = typeOperation === 'Dépôt' ? parseFloat(montant) : -parseFloat(montant);
      await sessionCaisseApi.update(sessionId, { montant_ajout: montantAjout });

      // Logique spécifique pour remboursement crédit
      if (typeDepot === 'Remboursement Crédit' && prochaineEcheance && creditSelectionne) {
        const montantPaye = parseFloat(montant);
        const montantEcheance = prochaineEcheance.montantTotal;

        await echeanceCreditApi.update(prochaineEcheance.id, {
          montant_paye: (prochaineEcheance.montantPaye || 0) + montantPaye,
          status: montantPaye >= montantEcheance ? 'Payée' : 'Partielle',
          date_paiement: montantPaye >= montantEcheance ? new Date().toISOString().split('T')[0] : null
        });

        await creditApi.addPayment(creditSelectionne.id, { montant: montantPaye });
      }

      // Logique spécifique pour cotisation tontine
      if (typeDepot === 'Cotisation Tontine' && tontineSelectionnee && selectedClient) {
        await tontineApi.addContribution(tontineSelectionnee.id, {
          client_id: selectedClient.id,
          montant: parseFloat(montant),
          date_contribution: new Date().toISOString().split('T')[0]
        });
      }

      if (loadingId) toast.dismiss(loadingId);
      toast.success(`${typeOperation} de ${formatMoney(parseFloat(montant))} effectué avec succès !`);

      // Sauvegarder les données pour le reçu
      setLastOperationData({
        reference: operationData.reference,
        typeOperation,
        typeDetaille: typeOperation === 'Dépôt' ? typeDepot : typeRetrait,
        montant: parseFloat(montant),
        client: selectedClient,
        date: new Date()
      });

      return true;
    } catch (error) {
      if (loadingId) toast.dismiss(loadingId);
      const errorMessage = handleApiError(error, 'Erreur lors de l\'opération');
      toast.error(errorMessage);
      return false;
    }
  }, [typeOperation, typeDepot, montant, sessionId, prochaineEcheance, creditSelectionne, tontineSelectionnee, selectedClient, typeRetrait]);

  // Valider l'opération directement (bypass OTP pour dépôts quand OTP désactivé)
  const validerOperationDirect = useCallback(async (operationData: any) => {
    const loadingId = toast.loading('Traitement de l\'opération en cours...');
    setLoading(true);

    try {
      await executeOperation(operationData, loadingId);
    } finally {
      setLoading(false);
    }
  }, [executeOperation]);

  // Valider l'opération après confirmation physique de l'agent
  const validerOperationAvecConfirmation = useCallback(async (physicalData: PhysicalConfirmationData) => {
    const loadingId = toast.loading('Traitement de l\'opération en cours...');
    setShowPhysicalConfirmation(false);
    setConfirmationData(physicalData); // Stocker pour affichage UI
    setLoading(true);

    try {
      // Ajouter les données de confirmation physique à l'opération (traçabilité)
      const operationAvecConfirmation = {
        ...pendingOperationData,
        physical_confirmation: physicalData  // Stocké en DB pour audit
      };

      await executeOperation(operationAvecConfirmation, loadingId);
    } finally {
      setLoading(false);
    }
  }, [pendingOperationData, executeOperation]);

  // Réinitialiser le formulaire
  const reinitialiserFormulaire = useCallback(() => {
    setSelectedClient(null);
    setTypeOperation(null);
    setTypeDepot(null);
    setTypeRetrait(null);
    setMontant('');
    setDescription('');
    setSearchTerm('');
    setPendingOperationData(null);
    setCreditSelectionne(null);
    setTontineSelectionnee(null);
    setProchaineEcheance(null);
    setBilletage({});
    setShowBilletage(false);
    setMontantError(null);
    setConfirmationData(null);
  }, []);

  // Fonction pour afficher le reçu via le modal universel
  const handleShowReceipt = useCallback(() => {
    if (!lastOperationData) return;

    const rData: ReceiptData = {
      title: `Reçu de ${lastOperationData.typeOperation}`,
      reference: lastOperationData.reference,
      date: lastOperationData.date,
      type: lastOperationData.typeDetaille || lastOperationData.typeOperation,
      client: {
        nom: lastOperationData.client?.nom || '',
        prenom: lastOperationData.client?.prenom || '',
        telephone: lastOperationData.client?.telephone || lastOperationData.client?.phone || '',
        numeroCompte: lastOperationData.client?.numeroCompte
      },
      agent: {
        nom: user?.nom || 'Agent',
        prenom: user?.prenom || '',
        id: user?.id
      },
      items: [
        {
          description: `${lastOperationData.typeOperation} - ${lastOperationData.typeDetaille || 'Espèces'}`,
          montant: lastOperationData.montant,
          quantite: 1
        }
      ],
      total: lastOperationData.montant,
      modePaiement: 'CASH',
      devise: currencySymbol()
    };

    setReceiptData(rData);
    setShowSuccessModal(true);
  }, [lastOperationData, user]);

  // Déclencher l'affichage du reçu quand une opération est réussie
  useEffect(() => {
      if (lastOperationData) {
          handleShowReceipt();
      }
  }, [lastOperationData, handleShowReceipt]);



  // Message de confirmation mémorisé
  const confirmationMessage = useMemo(() => {
    if (!selectedClient || !typeOperation || !montant) return '';
    const typeDetaille = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    return `Vous êtes sur le point d'effectuer un ${typeOperation?.toLowerCase()} de ${formatMoney(parseFloat(montant))} pour ${escapeHtml(selectedClient.nom)} ${escapeHtml(selectedClient.prenom || '')}${typeDetaille ? ` (${typeDetaille})` : ''}.`;
  }, [selectedClient, typeOperation, typeDepot, typeRetrait, montant]);

  return (
    <div className="flex flex-col h-full font-sans selection:bg-status-success/30 p-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
        
        {/* LEFT COL: Search & Client Summary (Compact) */}
        <div className="lg:col-span-3 flex flex-col gap-3 h-full">
            {/* Search Section */}
            <Card className="bg-surface-base/80 backdrop-blur-xl border border-edge p-3 shrink-0">
                <div className="flex items-center gap-2 mb-2">
                    <Search className="w-3.5 h-3.5 text-content-muted" aria-hidden="true" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                        placeholder="Rechercher client..."
                        className="flex-1 bg-transparent border-none text-sm text-content-primary focus:ring-0 placeholder:text-content-muted p-0"
                    />
                </div>
            </Card>

            {/* Client Profile Card (Only if selected) */}
            {selectedClient && (
                <Card className="bg-surface/50 border border-edge-subtle flex-1 p-3 flex flex-col items-center relative animate-in fade-in zoom-in-95 duration-300">
                    <button
                        onClick={reinitialiserFormulaire}
                        className="absolute top-2 right-2 text-content-muted hover:text-status-danger transition"
                    >
                        <XCircle size={14} />
                    </button>
                    
                    <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-br from-status-success to-accent shadow-lg shadow-status-success/20 mb-2">
                        <div className="w-full h-full rounded-full overflow-hidden bg-surface-base flex items-center justify-center text-content-primary">
                            <User size={20} aria-hidden="true" />
                        </div>
                    </div>
                    
                    <h3 className="font-bold text-sm text-content-primary truncate text-center w-full">
                        {escapeHtml(selectedClient.nom)} {escapeHtml(selectedClient.prenom || '')}
                    </h3>
                    <p className="text-xs text-content-muted mb-2">{escapeHtml(selectedClient.telephone || '')}</p>
                    
                    {selectedClient.numeroCompte && (
                        <Badge
                            variant="neutral"
                            size="sm"
                            className="bg-surface border-edge text-content-secondary text-[10px] mb-4"
                            value={escapeHtml(selectedClient.numeroCompte)}
                        />
                    )}

                    {/* Dynamic Info Card - Always visible if operation selected, with emphasized amount */}
                    <div className="w-full mt-auto space-y-2">
                      {infoCardData && (
                        <div className={`p-3 rounded-lg border text-center transition-all duration-300 ${
                            infoCardData.amount !== null && infoCardData.amount > 0 
                            ? 'bg-status-info-bg border-status-info/30' 
                            : 'bg-surface-base/50 border-edge'
                        }`}>
                          <p className="text-[10px] text-content-muted uppercase tracking-wider mb-1 line-clamp-1">
                            {infoCardData.title}
                          </p>
                          {infoLoading ? (
                            <Loader className="w-3 h-3 animate-spin mx-auto text-status-success" />
                          ) : (
                            <>
                              <p className={`font-mono text-base font-bold ${
                                infoCardData.amount !== null ? 'text-content-primary' : 'text-content-muted'
                              }`}>
                                {infoCardData.amount !== null ? formatMoney(infoCardData.amount) : '-'}
                              </p>
                              {infoCardData.subtitle && (
                                <p className="text-[9px] text-content-muted mt-0.5 line-clamp-1">{infoCardData.subtitle}</p>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      
                      {!infoCardData && (
                        <div className="p-2 rounded bg-surface-base/30 border border-edge/50 text-center">
                            <p className="text-[10px] text-content-muted">Sélectionnez une opération</p>
                        </div>
                      )}
                    </div>
                </Card>
            )}
        </div>

        {/* RIGHT COL: Operation Cockpit (Expanded) */}
        <div className="lg:col-span-9 h-full flex flex-col">
            {selectedClient ? (
                <Card className="bg-surface-base/80 backdrop-blur-xl border border-edge h-full p-0 flex flex-col overflow-hidden relative animate-in slide-in-from-right-4 duration-300">
                    
                    {/* Header: Operation Type Selector */}
                    <div className="p-4 border-b border-edge bg-surface-base/30">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-content-primary flex items-center gap-2">
                                <Coins className="text-status-success" size={20} />
                                Opération Caisse
                            </h2>
                            {/* Segmented Control for Type */}
                            <div className="flex bg-surface-base p-1 rounded-lg border border-edge">
                                {(['Dépôt', 'Retrait'] as TypeOperation[]).map(type => (
                                    <button
                                        key={type}
                                        onClick={() => {
                                             setTypeOperation(type);
                                             setTypeDepot(null);
                                             setTypeRetrait(null);
                                             setShowBilletage(false);
                                             setMontantError(null);
                                        }}
                                        className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${
                                            typeOperation === type 
                                            ? type === 'Dépôt' ? 'bg-status-success text-white shadow-lg' : 'bg-status-danger text-white shadow-lg' 
                                            : 'text-content-muted hover:text-content-secondary hover:bg-white/5'
                                        }`}
                                    >
                                        {type === 'Dépôt' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                         {/* Sub-types Pills */}
                         {typeOperation && (
                             <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2">
                                {(typeOperation === 'Dépôt'
                                  ? ['Compte Courant', 'Compte Épargne', 'Compte Bloqué', 'Cotisation Tontine', 'Remboursement Crédit']
                                  : ['Retrait Compte Courant', 'Retrait Épargne', 'Décaissement Crédit', 'Distribution Tontine']
                                ).map((subType: string) => (
                                  <button
                                    key={subType}
                                    onClick={() => {
                                      if (typeOperation === 'Dépôt') setTypeDepot(subType as TypeDepot);
                                      else setTypeRetrait(subType as TypeRetrait);
                                      setCreditSelectionne(null);
                                      setTontineSelectionnee(null);
                                      setMontant('');
                                      setMontantError(null);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                      (typeDepot === subType || typeRetrait === subType)
                                        ? 'bg-surface text-content-primary border-edge-strong shadow-sm'
                                        : 'bg-transparent border-edge text-content-muted hover:border-edge'
                                    }`}
                                  >
                                    {subType}
                                  </button>
                                ))}
                             </div>
                         )}
                    </div>

                    {/* Main Form Content */}
                    <div className="flex-1 p-6 overflow-y-auto space-y-6">
                        {/* Dynamic Sections: Credits */}
                        {typeDepot === 'Remboursement Crédit' && creditsActifs.length > 0 && (
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-content-muted uppercase">Crédit à rembourser</label>
                              <div className="flex overflow-x-auto gap-3 pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-edge">
                                {creditsActifs.map((credit) => (
                                  <div
                                    key={credit.id}
                                    onClick={() => {
                                      setCreditSelectionne(credit);
                                      chargerProchaineEcheance(credit.id);
                                    }}
                                    className={`min-w-[180px] p-3 rounded-xl border cursor-pointer transition-all ${
                                      creditSelectionne?.id === credit.id
                                        ? 'border-status-info/50 bg-status-info-bg shadow-lg'
                                        : 'border-edge bg-surface-base/50 text-content-muted hover:border-edge-strong'
                                    }`}
                                  >
                                    <div className="text-xs font-bold text-content-secondary"># {escapeHtml(credit.numeroCredit)}</div>
                                    <div className="text-[10px] text-content-muted mt-1">Reste: <span className="text-status-info font-bold">{formatMoney(credit.solde_restant)}</span></div>
                                  </div>
                                ))}
                              </div>
                            </div>
                        )}

                        {/* Amount & Billetage Section */}
                        {((typeOperation === 'Dépôt' && typeDepot) || (typeOperation === 'Retrait' && typeRetrait)) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Left: Amount Input */}
                                <div className="space-y-4">
                                    <div className="bg-surface-base p-4 rounded-xl border border-edge">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-medium text-content-muted">Montant (FCFA)</label>
                                            <button
                                              onClick={toggleBilletage}
                                              className={`text-[10px] font-bold flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
                                                showBilletage ? 'text-status-success bg-status-success-bg' : 'text-content-muted hover:text-status-success'
                                              }`}
                                            >
                                              <Coins size={12} />
                                              {showBilletage ? 'Masquer Billetage' : 'Ouvrir Billetage'}
                                            </button>
                                        </div>
                                        <input
                                          type="number"
                                          value={montant}
                                          onChange={(e) => {
                                            setMontant(e.target.value);
                                            if (e.target.value) validateMontant(e.target.value);
                                          }}
                                          disabled={typeDepot === 'Cotisation Tontine' || showBilletage}
                                          placeholder="0"
                                          className={`w-full py-2 text-3xl font-bold bg-transparent border-b-2 outline-none text-center transition-all ${
                                              montantError ? 'border-status-danger text-status-danger' : 'border-edge text-content-primary focus:border-status-success'
                                          }`}
                                        />
                                        {montantError && <p className="text-[10px] text-status-danger text-center mt-2">{montantError}</p>}
                                    </div>

                                    {/* Physical Confirmation Indicator (If needed) */}
                                    {confirmationData && (
                                        <div className="bg-status-info-bg border border-status-info/20 rounded-xl p-3 flex items-start gap-3">
                                            <CheckCircle size={16} className="text-status-info mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-status-info">Identité Confirmée</p>
                                                <p className="text-[10px] text-content-muted capitalize">Méthode: {confirmationData.verificationMethod.replace('_', ' ')}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Billetage (Conditional) */}
                                {showBilletage && (
                                    <div className="bg-surface-base/50 border border-edge rounded-xl p-4 animate-in fade-in slide-in-from-right-4">
                                        <div className="grid grid-cols-2 gap-3 mb-2 h-40 overflow-y-auto pr-1 custom-scrollbar">
                                            {DENOMINATIONS.map((denom) => (
                                                <div key={denom.value} className="flex items-center gap-2">
                                                    <span className="text-[10px] text-content-muted w-10 text-right">{denom.label}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={billetage[denom.value] || ''}
                                                        onChange={(e) => updateBilletage(denom.value, parseInt(e.target.value) || 0)}
                                                        className="flex-1 py-1 px-2 text-xs bg-surface-base border border-edge rounded text-right text-content-primary focus:border-status-success outline-none"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer: Action Button */}
                    <div className="p-4 border-t border-edge bg-surface-base/50 mt-auto">
                        <Button
                            onClick={preparerOperation}
                            disabled={loading || !montant || parseFloat(montant) <= 0 || !!montantError}
                            className={`w-full py-4 text-sm font-bold tracking-wide shadow-xl transition-all ${
                                typeOperation === 'Retrait' 
                                ? 'bg-status-danger hover:bg-status-danger shadow-status-danger/20' 
                                : 'bg-status-success hover:bg-status-success shadow-status-success/20'
                            }`}
                        >
                            {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : `CONFIRMER ${typeOperation?.toUpperCase() || 'OPÉRATION'}`}
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="h-full rounded-xl border-2 border-dashed border-edge bg-surface-base/20 flex flex-col items-center justify-center text-content-muted space-y-4 p-6">
                    <div className="w-16 h-16 rounded-full bg-surface-base flex items-center justify-center ring-4 ring-edge/50">
                        <Wallet size={24} className="opacity-50" />
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-medium text-content-muted">En attente de client</p>
                        <p className="text-xs text-content-muted mt-1">Utilisez la recherche à gauche pour commencer</p>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title={`Confirmer le ${typeOperation?.toLowerCase() || 'opération'}`}
        message={confirmationMessage}
        onConfirm={confirmerPreparation}
        onClose={() => setShowConfirmDialog(false)}
        variant={typeOperation === 'Retrait' ? 'danger' : 'success'}
        confirmText="Confirmer"
        cancelText="Annuler"
      />

      {/* Physical Confirmation Modal (retraits et montants élevés) */}
      {showPhysicalConfirmation && pendingOperationData && selectedClient && (
        <PhysicalConfirmationStep
          isOpen={showPhysicalConfirmation}
          onClose={() => setShowPhysicalConfirmation(false)}
          onConfirm={validerOperationAvecConfirmation}
          clientName={`${selectedClient.nom} ${selectedClient.prenom || ''}`}
          clientPhone={selectedClient.telephone || selectedClient.phone}
          operationType={typeRetrait || typeDepot || typeOperation || 'Opération'}
          amount={parseFloat(montant)}
          isLoading={loading}
        />
      )}

      {/* Print Receipt Dialog */}
      <UniversalPaymentSuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
            setShowSuccessModal(false);
            setLastOperationData(null);
            reinitialiserFormulaire();
            onTransactionComplete();
        }}
        term="Terminer"
        data={receiptData}
      />
    </div>
  );
}
