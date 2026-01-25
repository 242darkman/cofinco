import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, User, CheckCircle, XCircle, Wallet, ArrowUpRight, ArrowDownLeft, Loader, Coins } from 'lucide-react';
import { PhysicalConfirmationStep, PhysicalConfirmationData } from '../../auth/PhysicalConfirmationStep';
import { Card, Button } from '@/components/ui';
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
        setMontant(echeance.montant_total.toString());
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
        const ct = c.type_compte || c.typeCompte || '';
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
        const montantEcheance = prochaineEcheance.montant_total;

        await echeanceCreditApi.update(prochaineEcheance.id, {
          montant_paye: (prochaineEcheance.montant_paye || 0) + montantPaye,
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
        numeroCompte: lastOperationData.client?.numero_compte
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
      devise: 'FCFA'
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
    <div className="flex flex-col h-full font-sans selection:bg-emerald-500/30 p-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
        
        {/* LEFT COL: Search & Client Summary (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-3 h-full">
            {/* Search Section */}
            <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-3 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10">
                        <Search className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold text-sm text-slate-200">Identifier le client</h3>
                </div>
                <div className="space-y-2">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                        placeholder="Rechercher (Nom, compte, tel)..."
                        className="w-full px-3 py-2 text-sm bg-slate-950/50 border border-slate-700 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600 text-white shadow-sm hover:border-slate-600"
                    />
                    <Button
                        onClick={rechercherClient}
                        disabled={searchLoading || !searchTerm.trim()}
                        className="w-full py-2 text-xs font-bold tracking-wide"
                        variant="primary"
                    >
                        {searchLoading ? <Loader className="w-4 h-4 animate-spin" /> : 'Rechercher'}
                    </Button>
                </div>
            </Card>

            {/* Client Result / Empty State */}
            <div className="flex-1 min-h-0">
                {selectedClient ? (
                    <Card className="bg-slate-800/50 border border-slate-700/50 h-full p-4 flex flex-col items-center relative animate-in fade-in zoom-in-95 duration-300">
                        <button
                            onClick={reinitialiserFormulaire}
                            className="absolute top-2 right-2 text-slate-500 hover:text-red-400 transition bg-slate-800/50 hover:bg-slate-800 p-1.5 rounded-full backdrop-blur-sm z-20"
                        >
                            <XCircle size={16} />
                        </button>
                        
                        <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20 mb-3">
                            <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center text-white">
                                <User size={24} aria-hidden="true" />
                            </div>
                        </div>
                        
                        <h3 className="font-bold text-lg text-white truncate text-center w-full">
                            {escapeHtml(selectedClient.nom)} {escapeHtml(selectedClient.prenom || '')}
                        </h3>
                        <p className="text-sm font-medium text-slate-400 mb-4">{escapeHtml(selectedClient.telephone || '')}</p>
                        
                        {selectedClient.numero_compte && (
                            <Badge
                                variant="neutral"
                                size="sm"
                                className="bg-slate-800 border-slate-700 text-slate-300 text-xs mb-6"
                                value={escapeHtml(selectedClient.numero_compte)}
                            />
                        )}

                        {/* Recent Activity Mini-Summary (Placeholder for visual balance) */}
                        <div className="grid grid-cols-2 gap-2 w-full mt-auto">
                            <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
                                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Dernière Op.</p>
                                <p className="font-mono text-white text-xs font-bold">-</p>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-900/50 border border-slate-800 text-center">
                                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Solde Cash</p>
                                <p className="font-mono text-white text-xs font-bold">-</p>
                            </div>
                        </div>
                    </Card>
                ) : (
                     <div className="h-full rounded-xl border-2 border-dashed border-slate-800 flex flex-col items-center justify-center text-slate-600 space-y-4 p-6">
                        <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center">
                            <Wallet size={20} className="opacity-50" />
                        </div>
                        <p className="text-xs font-medium text-center">Sélectionnez un client pour<br/>effectuer un dépôt ou retrait</p>
                     </div>
                )}
            </div>
        </div>

        {/* RIGHT COL: Operation Cockpit (8 cols) */}
        {selectedClient && (
             <div className="lg:col-span-8 h-full flex flex-col">
                <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 h-full p-0 flex flex-col overflow-hidden relative">
                    
                    {/* Header: Operation Type Selector */}
                    <div className="p-4 border-b border-slate-800 bg-slate-950/30">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Coins className="text-emerald-400" size={20} />
                                Opération Caisse
                            </h2>
                            {/* Segmented Control for Type */}
                            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
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
                                            ? type === 'Dépôt' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-rose-600 text-white shadow-lg' 
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
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
                                        ? 'bg-slate-800 text-white border-slate-600 shadow-sm'
                                        : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'
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
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Crédit à rembourser</label>
                              <div className="flex overflow-x-auto gap-3 pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-slate-700">
                                {creditsActifs.map((credit) => (
                                  <div
                                    key={credit.id}
                                    onClick={() => {
                                      setCreditSelectionne(credit);
                                      chargerProchaineEcheance(credit.id);
                                    }}
                                    className={`min-w-[180px] p-3 rounded-xl border cursor-pointer transition-all ${
                                      creditSelectionne?.id === credit.id
                                        ? 'border-blue-500/50 bg-blue-900/20 shadow-lg'
                                        : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                                    }`}
                                  >
                                    <div className="text-xs font-bold text-slate-200"># {escapeHtml(credit.numero_credit)}</div>
                                    <div className="text-[10px] text-slate-400 mt-1">Reste: <span className="text-blue-400 font-bold">{formatMoney(credit.solde_restant)}</span></div>
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
                                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-medium text-slate-500">Montant (FCFA)</label>
                                            <button
                                              onClick={toggleBilletage}
                                              className={`text-[10px] font-bold flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
                                                showBilletage ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-emerald-400'
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
                                              montantError ? 'border-red-500 text-red-400' : 'border-slate-700 text-white focus:border-emerald-500'
                                          }`}
                                        />
                                        {montantError && <p className="text-[10px] text-red-400 text-center mt-2">{montantError}</p>}
                                    </div>

                                    {/* Physical Confirmation Indicator (If needed) */}
                                    {confirmationData && (
                                        <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-3 flex items-start gap-3">
                                            <CheckCircle size={16} className="text-blue-400 mt-0.5" />
                                            <div>
                                                <p className="text-xs font-bold text-blue-300">Identité Confirmée</p>
                                                <p className="text-[10px] text-slate-400 capitalize">Méthode: {confirmationData.verificationMethod.replace('_', ' ')}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right: Billetage (Conditional) */}
                                {showBilletage && (
                                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 animate-in fade-in slide-in-from-right-4">
                                        <div className="grid grid-cols-2 gap-3 mb-2 h-40 overflow-y-auto pr-1 custom-scrollbar">
                                            {DENOMINATIONS.map((denom) => (
                                                <div key={denom.value} className="flex items-center gap-2">
                                                    <span className="text-[10px] text-slate-500 w-10 text-right">{denom.label}</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={billetage[denom.value] || ''}
                                                        onChange={(e) => updateBilletage(denom.value, parseInt(e.target.value) || 0)}
                                                        className="flex-1 py-1 px-2 text-xs bg-slate-900 border border-slate-700 rounded text-right text-white focus:border-emerald-500 outline-none"
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
                    <div className="p-4 border-t border-slate-800 bg-slate-950/50 mt-auto">
                        <Button
                            onClick={preparerOperation}
                            disabled={loading || !montant || parseFloat(montant) <= 0 || !!montantError}
                            className={`w-full py-4 text-sm font-bold tracking-wide shadow-xl transition-all ${
                                typeOperation === 'Retrait' 
                                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20' 
                                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20'
                            }`}
                        >
                            {loading ? <Loader className="w-5 h-5 animate-spin mx-auto" /> : `CONFIRMER ${typeOperation?.toUpperCase() || 'OPÉRATION'}`}
                        </Button>
                    </div>
                </Card>
             </div>
        )}
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
