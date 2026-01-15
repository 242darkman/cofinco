import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, User, CheckCircle, XCircle, Wallet, ArrowUpRight, ArrowDownLeft, Loader, CreditCard, Users, PiggyBank, Lock, RefreshCw, AlertCircle, Calendar, Calculator, Coins } from 'lucide-react';
import { OTPValidationSimple } from '../../auth/OTPValidationSimple';
import AccountHolderPresenceModal, { PresenceConfirmationData } from '../../auth/AccountHolderPresenceModal';
import { Card, Button, Badge } from '@/components/ui';
import { clientSearchApi, creditApi, tontineApi, sessionCaisseApi, operationCaisseApi, echeanceCreditApi, compteEpargneApi, securityConfigApi, SecurityConfigResponse } from '../../../lib/api-client';
import { toast, handleApiError } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { validateAmount, VALIDATION_LIMITS } from '../../../lib/validation';
import { escapeHtml, sanitizeInput } from '../../../lib/sanitize';
import ConfirmDialog from '../../ui/ConfirmDialog';
import { SkeletonCard } from '../../ui/Skeleton';
import { UniversalPaymentSuccessModal } from './shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { authService } from '../../../lib/auth';

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
  const [showOTP, setShowOTP] = useState(false);
  const [otpData, setOtpData] = useState<any>(null);
  const [creditsActifs, setCreditsActifs] = useState<any[]>([]);
  const [creditSelectionne, setCreditSelectionne] = useState<any>(null);
  const [prochaineEcheance, setProchaineEcheance] = useState<any>(null);
  const [tontinesActives, setTontinesActives] = useState<any[]>([]);
  const [tontineSelectionnee, setTontineSelectionnee] = useState<any>(null);
  const [membresTontine, setMembresTontine] = useState<any[]>([]);
  const [comptesClient, setComptesClient] = useState<any[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [montantError, setMontantError] = useState<string | null>(null);
  const [lastOperationData, setLastOperationData] = useState<any>(null);

  // Security configuration states
  const [securityConfig, setSecurityConfig] = useState<SecurityConfigResponse | null>(null);
  const [showPresenceModal, setShowPresenceModal] = useState(false);
  const [presenceVerified, setPresenceVerified] = useState<PresenceConfirmationData | null>(null);

  // Universal Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | undefined>(undefined);
  const [factureId, setFactureId] = useState<string | undefined>(undefined);

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

  const reinitialiserBilletage = useCallback(() => {
    setBilletage({});
  }, []);

  // Charger la configuration de sécurité au montage
  useEffect(() => {
    const loadSecurityConfig = async () => {
      try {
        const config = await securityConfigApi.getConfig();
        setSecurityConfig(config);
      } catch (error) {
        console.error('Erreur chargement config sécurité:', error);
        // Par défaut: OTP désactivé, présence requise pour retraits
        setSecurityConfig({
          otpEnabled: false,
          requireAccountHolderPresence: true,
          operationsRequiringPresence: ['Retrait', 'Retrait Compte Courant', 'Retrait Épargne', 'Décaissement Crédit', 'Distribution Tontine'],
          presenceVerificationThreshold: 0
        });
      }
    };
    loadSecurityConfig();
  }, []);

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
      const clients = await clientSearchApi.search(trimmedSearch);
      const data = clients.length > 0 ? clients[0] : null;

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
      const credits = await creditApi.getAll({ clientId, statut: 'Actif' });
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

  // Charger les membres d'une tontine
  const chargerMembresTontine = useCallback(async (tontineId: string) => {
    try {
      const membres = await tontineApi.getMembres(tontineId);
      setMembresTontine(membres || []);
    } catch (error) {
      console.error('Erreur chargement membres:', error);
      setMembresTontine([]);
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

    let typeCompte: string | null = null;
    if (typeOp === 'Compte Courant' || typeOp === 'Retrait Compte Courant') {
      typeCompte = 'Courant';
    } else if (typeOp === 'Compte Épargne' || typeOp === 'Retrait Épargne') {
      typeCompte = 'Epargne';
    } else if (typeOp === 'Compte Bloqué') {
      typeCompte = 'Bloqué';
    }

    if (typeCompte) {
      const compte = comptesClient.find(c => {
        const ct = c.type_compte || c.typeCompte || '';
        return ct === typeCompte || ct.toLowerCase().includes(typeCompte!.toLowerCase());
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

  // Vérifier si l'opération nécessite une validation spéciale
  const requiresPresenceVerification = useCallback((opType: string, subType?: string): boolean => {
    if (!securityConfig?.requireAccountHolderPresence) return false;
    const typeToCheck = subType || opType;
    return securityConfig.operationsRequiringPresence.some(
      op => op.toLowerCase() === typeToCheck.toLowerCase() || opType.toLowerCase() === 'retrait'
    );
  }, [securityConfig]);

  // Confirmer et décider du type de validation (OTP, présence, ou bypass)
  const confirmerPreparation = useCallback(async () => {
    setShowConfirmDialog(false);
    setLoading(true);

    try {
      const reference = `ESP-${Date.now()}`;
      const typeDetaille = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;

      // Trouver le compte associé à ce type d'opération
      const compteId = getCompteIdForOperation(typeDetaille);

      const operationData = {
        session_id: sessionId,
        client_id: selectedClient!.id,
        compte_id: compteId,
        type_operation: typeOperation,
        sous_type_operation: typeDetaille,
        montant: parseFloat(montant),
        mode_paiement: 'Espèces',
        type_paiement: 'Espèces',
        reference: reference,
        description: sanitizeInput(description) || `${typeOperation} - ${typeDetaille}`,
        details_billetage: Object.keys(billetage).length > 0 ? billetage : undefined,
        client_info: {
          nom: selectedClient!.nom,
          prenom: selectedClient!.prenom,
          telephone: selectedClient!.telephone || selectedClient!.phone
        }
      };

      setOtpData({ operation: operationData, type: 'caisse_especes' });

      // Décider du type de validation selon la configuration
      const isWithdrawal = requiresPresenceVerification(typeOperation!, typeDetaille || undefined);

      if (securityConfig?.otpEnabled) {
        // OTP activé - utiliser la validation OTP
        setShowOTP(true);
      } else if (isWithdrawal) {
        // OTP désactivé mais c'est un retrait - exiger la présence du titulaire
        setShowPresenceModal(true);
      } else {
        // OTP désactivé et c'est un dépôt - exécuter directement
        setLoading(false);
        await validerOperationDirect(operationData);
      }
    } catch (error) {
      const errorMessage = handleApiError(error, 'Erreur lors de la préparation');
      toast.error(errorMessage);
      setLoading(false);
    } finally {
      if (securityConfig?.otpEnabled || requiresPresenceVerification(typeOperation!, typeDepot || typeRetrait || undefined)) {
        setLoading(false);
      }
    }
  }, [typeOperation, typeDepot, typeRetrait, sessionId, selectedClient, montant, description, billetage, getCompteIdForOperation, securityConfig, requiresPresenceVerification]);

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

  // Valider l'opération après confirmation de présence du titulaire
  const validerOperationAvecPresence = useCallback(async (presenceData: PresenceConfirmationData) => {
    const loadingId = toast.loading('Traitement du retrait en cours...');
    setShowPresenceModal(false);
    setPresenceVerified(presenceData); // Stocker pour affichage UI
    setLoading(true);

    try {
      // Ajouter les données de confirmation de présence à l'opération (traçabilité)
      const operationAvecPresence = {
        ...otpData.operation,
        presence_verification: presenceData  // Stocké en DB pour audit
      };

      await executeOperation(operationAvecPresence, loadingId);
    } finally {
      setLoading(false);
    }
  }, [otpData, executeOperation]);

  // Valider l'opération après OTP
  const validerOperation = useCallback(async (code: string) => {
    const loadingId = toast.loading('Traitement de l\'opération en cours...');
    setLoading(true);

    try {
      await executeOperation(otpData.operation, loadingId);
    } finally {
      setLoading(false);
      setShowOTP(false);
    }
  }, [otpData, executeOperation]);

  // Réinitialiser le formulaire
  const reinitialiserFormulaire = useCallback(() => {
    setSelectedClient(null);
    setTypeOperation(null);
    setTypeDepot(null);
    setTypeRetrait(null);
    setMontant('');
    setDescription('');
    setSearchTerm('');
    setOtpData(null);
    setCreditSelectionne(null);
    setTontineSelectionnee(null);
    setProchaineEcheance(null);
    setBilletage({});
    setShowBilletage(false);
    setMontantError(null);
    setPresenceVerified(null);
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
      modePaiement: 'Espèces',
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



  // Calcul du total billetage mémorisé
  const totalBilletage = useMemo(() => {
    return Object.entries(billetage).reduce((acc, [val, qty]) => {
      return acc + (parseInt(val) * qty);
    }, 0);
  }, [billetage]);

  // Message de confirmation mémorisé
  const confirmationMessage = useMemo(() => {
    if (!selectedClient || !typeOperation || !montant) return '';
    const typeDetaille = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;
    return `Vous êtes sur le point d'effectuer un ${typeOperation?.toLowerCase()} de ${formatMoney(parseFloat(montant))} pour ${escapeHtml(selectedClient.nom)} ${escapeHtml(selectedClient.prenom || '')}${typeDetaille ? ` (${typeDetaille})` : ''}.`;
  }, [selectedClient, typeOperation, typeDepot, typeRetrait, montant]);

  return (
    <div className="flex flex-col font-sans selection:bg-emerald-500/30">
      <div className="w-full max-w-sm mx-auto">
        <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 shadow-2xl shadow-emerald-900/10 rounded-2xl overflow-hidden ring-1 ring-white/5">
          <div className="p-5 relative">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-teal-600/10 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" aria-hidden="true" />

            <div className="relative z-10">
              <h2 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-5 tracking-tight flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                Caisse Espèces
              </h2>

              {!selectedClient ? (
                <div
                  className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 shadow-inner backdrop-blur-sm group transition-all hover:bg-slate-800/70"
                  role="search"
                  aria-label="Recherche de client"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10">
                      <Search className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold text-sm text-slate-200">Identifier le client</h3>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                      placeholder="Rechercher (Nom, compte, tel)..."
                      className="w-full px-4 py-3 text-sm bg-slate-950/50 border border-slate-700 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 outline-none transition-all placeholder:text-slate-600 text-white shadow-sm hover:border-slate-600"
                      aria-label="Rechercher un client par nom, numéro de compte ou téléphone"
                    />
                    <Button
                      onClick={rechercherClient}
                      disabled={searchLoading || !searchTerm.trim()}
                      className="w-full py-3 text-sm font-bold tracking-wide shadow-lg shadow-emerald-900/20 hover:shadow-emerald-500/20 transition-all active:scale-[0.98]"
                      variant="primary"
                      aria-label="Rechercher le client"
                    >
                      {searchLoading ? <Loader className="w-4 h-4 animate-spin" aria-hidden="true" /> : 'Rechercher'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* Client Info */}
                  <div
                    className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 relative overflow-hidden group hover:border-slate-600/50 transition-colors"
                    role="region"
                    aria-label="Informations du client sélectionné"
                  >
                    <button
                      onClick={reinitialiserFormulaire}
                      className="absolute top-2.5 right-2.5 text-slate-500 hover:text-red-400 transition bg-slate-800/50 hover:bg-slate-800 p-1 rounded-full backdrop-blur-sm z-20"
                      aria-label="Annuler et réinitialiser le formulaire"
                    >
                      <XCircle size={16} aria-hidden="true" />
                    </button>
                    <div className="flex items-center gap-3 pr-6 relative z-10">
                      <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                        <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 flex items-center justify-center text-white">
                          <User size={20} aria-hidden="true" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-white truncate">
                          {escapeHtml(selectedClient.nom)} {escapeHtml(selectedClient.prenom || '')}
                        </h3>
                        <p className="text-[11px] font-medium text-slate-400">
                          {escapeHtml(selectedClient.telephone || '')}
                        </p>
                        {selectedClient.numero_compte && (
                          <Badge
                            variant="neutral"
                            size="sm"
                            className="mt-1 bg-slate-800 border-slate-700 text-slate-300 text-[10px]"
                            value={escapeHtml(selectedClient.numero_compte)}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Success Message */}


                  {/* Presence Verification Indicator */}
                  {presenceVerified && typeOperation === 'Retrait' && (
                    <div
                      className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 animate-in slide-in-from-top-2"
                      role="status"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1 rounded-full bg-blue-500/20">
                          <CheckCircle size={12} className="text-blue-400" />
                        </div>
                        <span className="text-xs font-semibold text-blue-300">Presence verifiee</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-[10px] text-blue-300 border border-blue-500/20">
                          {presenceVerified.verificationMethod === 'piece_identite' && 'Piece d\'identite'}
                          {presenceVerified.verificationMethod === 'reconnaissance_visuelle' && 'Client connu'}
                          {presenceVerified.verificationMethod === 'signature' && 'Signature'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-[10px] text-emerald-300 border border-emerald-500/20">
                          Identite confirmee
                        </span>
                      </div>
                      {presenceVerified.agentNotes && (
                        <p className="text-[10px] text-slate-400 mt-2 italic">
                          Note: {presenceVerified.agentNotes}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Operation Type */}
                  <div
                    className="grid grid-cols-2 gap-2.5"
                    role="group"
                    aria-label="Type d'opération"
                  >
                    {(['Dépôt', 'Retrait'] as TypeOperation[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setTypeOperation(type);
                          setTypeDepot(null);
                          setTypeRetrait(null);
                          setShowBilletage(false);
                          setMontantError(null);
                        }}
                        className={`p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center gap-1.5 h-[68px] relative overflow-hidden ${
                          typeOperation === type
                            ? type === 'Dépôt'
                              ? 'border-emerald-500/50 bg-emerald-950/30 text-emerald-300 shadow-lg shadow-emerald-500/10'
                              : 'border-rose-500/50 bg-rose-950/30 text-rose-300 shadow-lg shadow-rose-500/10'
                            : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:bg-slate-800/50'
                        }`}
                        aria-pressed={typeOperation === type}
                        aria-label={`Sélectionner ${type}`}
                      >
                        {type === 'Dépôt' ? <ArrowDownLeft size={20} aria-hidden="true" /> : <ArrowUpRight size={20} aria-hidden="true" />}
                        <span className="font-bold text-sm">{type}</span>
                      </button>
                    ))}
                  </div>

                  {/* Sub-types */}
                  {typeOperation && (
                    <div className="space-y-2 animate-in slide-in-from-bottom-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                        {typeOperation === 'Dépôt' ? 'Destination' : 'Source'}
                      </label>
                      <div
                        className="grid grid-cols-2 gap-2"
                        role="group"
                        aria-label={typeOperation === 'Dépôt' ? 'Destination du dépôt' : 'Source du retrait'}
                      >
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
                            className={`p-2.5 rounded-lg border text-xs font-medium text-left transition-all ${
                              (typeDepot === subType || typeRetrait === subType)
                                ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-200'
                                : 'border-slate-700/50 bg-slate-800/20 text-slate-400 hover:bg-slate-800/40'
                            }`}
                            aria-pressed={typeDepot === subType || typeRetrait === subType}
                          >
                            {subType}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Sections: Credits */}
                  {typeDepot === 'Remboursement Crédit' && creditsActifs.length > 0 && (
                    <div className="space-y-2 animate-in slide-in-from-bottom-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase pl-1">
                        Crédit à rembourser
                      </label>
                      <div
                        className="flex overflow-x-auto gap-2.5 pb-2 -mx-1 px-1 snap-x scrollbar-thin scrollbar-thumb-slate-700"
                        role="listbox"
                        aria-label="Sélectionner un crédit"
                      >
                        {creditsActifs.map((credit) => (
                          <div
                            key={credit.id}
                            onClick={() => {
                              setCreditSelectionne(credit);
                              chargerProchaineEcheance(credit.id);
                            }}
                            className={`min-w-[160px] snap-center p-3 rounded-xl border cursor-pointer transition-all ${
                              creditSelectionne?.id === credit.id
                                ? 'border-blue-500/50 bg-blue-900/20 shadow-lg shadow-blue-500/10'
                                : 'border-slate-700/50 bg-slate-800/30 text-slate-400'
                            }`}
                            role="option"
                            aria-selected={creditSelectionne?.id === credit.id}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setCreditSelectionne(credit);
                                chargerProchaineEcheance(credit.id);
                              }
                            }}
                          >
                            <div className="text-xs font-bold text-slate-200">
                              # {escapeHtml(credit.numero_credit)}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1">
                              Reste: <span className="text-blue-400 font-bold">{formatMoney(credit.solde_restant)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Sections: Tontines */}
                  {typeDepot === 'Cotisation Tontine' && tontinesActives.length > 0 && (
                    <div className="space-y-2 animate-in slide-in-from-bottom-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase pl-1">
                        Sélectionner Tontine
                      </label>
                      <div
                        className="flex overflow-x-auto gap-2.5 pb-2 -mx-1 px-1 snap-x scrollbar-thin scrollbar-thumb-slate-700"
                        role="listbox"
                        aria-label="Sélectionner une tontine"
                      >
                        {tontinesActives.map((tontine) => (
                          <div
                            key={tontine.id}
                            onClick={() => {
                              setTontineSelectionnee(tontine);
                              chargerMembresTontine(tontine.id);
                              setMontant(tontine.montant_contribution.toString());
                              setMontantError(null);
                            }}
                            className={`min-w-[160px] snap-center p-3 rounded-xl border cursor-pointer transition-all ${
                              tontineSelectionnee?.id === tontine.id
                                ? 'border-emerald-500/50 bg-emerald-900/20 shadow-lg shadow-emerald-500/10'
                                : 'border-slate-700/50 bg-slate-800/30 text-slate-400'
                            }`}
                            role="option"
                            aria-selected={tontineSelectionnee?.id === tontine.id}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setTontineSelectionnee(tontine);
                                chargerMembresTontine(tontine.id);
                                setMontant(tontine.montant_contribution.toString());
                              }
                            }}
                          >
                            <div className="text-xs font-bold text-slate-200 truncate">
                              {escapeHtml(tontine.nom)}
                            </div>
                            <div className="text-[10px] text-emerald-400 font-bold mt-1">
                              {formatMoney(tontine.montant_contribution)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Montant & Billetage Input */}
                  {((typeOperation === 'Dépôt' && typeDepot) || (typeOperation === 'Retrait' && typeRetrait)) && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between pl-1">
                          <label
                            htmlFor="montant-input"
                            className="text-[10px] font-bold text-slate-500 uppercase"
                          >
                            Montant (FCFA)
                          </label>
                          <button
                            onClick={toggleBilletage}
                            className={`text-[10px] font-bold flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
                              showBilletage ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-emerald-400'
                            }`}
                            aria-expanded={showBilletage}
                            aria-controls="billetage-section"
                          >
                            <Coins size={12} aria-hidden="true" />
                            {showBilletage ? 'Masquer Billetage' : 'Billetage'}
                          </button>
                        </div>

                        {showBilletage && (
                          <div
                            id="billetage-section"
                            className="bg-slate-950/50 border border-slate-700/50 rounded-xl p-3 mb-3 animate-in fade-in slide-in-from-top-2"
                          >
                            <div className="grid grid-cols-3 gap-2">
                              {DENOMINATIONS.map((denom) => (
                                <div key={denom.value} className="space-y-1">
                                  <label
                                    htmlFor={`billetage-${denom.value}`}
                                    className="text-[9px] text-slate-500 block text-center"
                                  >
                                    {denom.label}
                                  </label>
                                  <input
                                    id={`billetage-${denom.value}`}
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={billetage[denom.value] || ''}
                                    onChange={(e) => updateBilletage(denom.value, parseInt(e.target.value) || 0)}
                                    className="w-full text-center py-1.5 text-xs bg-slate-800 border-slate-700 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-white font-mono"
                                    aria-label={`Nombre de billets de ${denom.label} FCFA`}
                                  />
                                </div>
                              ))}
                            </div>
                            {totalBilletage > 0 && (
                              <div className="text-center mt-2 text-xs text-emerald-400 font-bold">
                                Total: {formatMoney(totalBilletage)}
                              </div>
                            )}
                          </div>
                        )}

                        <input
                          id="montant-input"
                          type="number"
                          value={montant}
                          onChange={(e) => {
                            setMontant(e.target.value);
                            if (e.target.value) validateMontant(e.target.value);
                          }}
                          disabled={typeDepot === 'Cotisation Tontine' || showBilletage}
                          placeholder="0"
                          className={`w-full px-4 py-3.5 text-2xl font-bold text-center border rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-slate-950/50 transition-all text-white shadow-inner ${
                            showBilletage ? 'opacity-80' : ''
                          } ${montantError ? 'border-red-500' : 'border-slate-700'}`}
                          aria-invalid={!!montantError}
                          aria-describedby={montantError ? 'montant-error' : undefined}
                        />
                        {montantError && (
                          <p
                            id="montant-error"
                            className="text-[10px] text-red-400 text-center"
                            role="alert"
                          >
                            {montantError}
                          </p>
                        )}
                        {showBilletage && !montantError && (
                          <p className="text-[10px] text-slate-500 text-center">
                            Calculé automatiquement depuis le billetage
                          </p>
                        )}
                      </div>

                      {typeDepot === 'Remboursement Crédit' && prochaineEcheance && (
                        <div className="text-center text-[10px] text-slate-400">
                          Prochaine échéance:{' '}
                          <time
                            className="text-white font-bold"
                            dateTime={prochaineEcheance.date_echeance}
                          >
                            {new Date(prochaineEcheance.date_echeance).toLocaleDateString('fr-FR')}
                          </time>
                          {' '}-{' '}
                          <span className="text-white font-bold">
                            {formatMoney(prochaineEcheance.montant_total)}
                          </span>
                        </div>
                      )}

                      <Button
                        onClick={preparerOperation}
                        disabled={loading || !montant || parseFloat(montant) <= 0 || !!montantError}
                        className="w-full py-3.5 text-sm font-bold tracking-wide shadow-xl shadow-emerald-900/20 hover:shadow-emerald-500/25 transition-all"
                        variant="primary"
                        aria-label="Confirmer l'opération"
                      >
                        {loading ? (
                          <Loader className="w-5 h-5 animate-spin mx-auto" aria-hidden="true" />
                        ) : (
                          "CONFIRMER L'OPÉRATION"
                        )}
                      </Button>
                    </div>
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
        title={`Confirmer le ${typeOperation?.toLowerCase() || 'opération'}`}
        message={confirmationMessage}
        onConfirm={confirmerPreparation}
        onClose={() => setShowConfirmDialog(false)}
        variant={typeOperation === 'Retrait' ? 'danger' : 'success'}
        confirmText="Confirmer"
        cancelText="Annuler"
      />

      {/* OTP Validation (si OTP activé) */}
      {showOTP && otpData && selectedClient && securityConfig?.otpEnabled && (
        <OTPValidationSimple
          isOpen={showOTP}
          onClose={() => setShowOTP(false)}
          onValidate={(isValid) => {
            if (isValid) validerOperation('valid');
          }}
          phoneNumber={selectedClient.telephone || selectedClient.phone || ''}
          generatedCode="123456"
          operationType={typeOperation || ''}
          amount={parseFloat(montant)}
        />
      )}

      {/* Account Holder Presence Modal (pour retraits quand OTP désactivé) */}
      {showPresenceModal && otpData && selectedClient && (
        <AccountHolderPresenceModal
          isOpen={showPresenceModal}
          onClose={() => setShowPresenceModal(false)}
          onConfirm={validerOperationAvecPresence}
          clientName={`${selectedClient.nom} ${selectedClient.prenom || ''}`}
          clientPhone={selectedClient.telephone || selectedClient.phone}
          operationType={typeRetrait || typeOperation || 'Retrait'}
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
        factureId={factureId}
      />
    </div>
  );
}
