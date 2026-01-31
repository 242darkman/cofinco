import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Search,
  ArrowRight,
  CalendarClock,
  Banknote,
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  Building2
} from 'lucide-react';
import { compteEpargneApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { formatMoney } from '../../lib/format';

interface Compte {
  id: string;
  numeroCompte: string;
  numero_compte?: string;
  typeCompte: string;
  type_compte?: string;
  solde: number | string;
  clientNom?: string;
  clientPrenom?: string;
  client_nom?: string;
  client_prenom?: string;
  userNom?: string;
  userPrenom?: string;
  user_nom?: string;
  user_prenom?: string;
}

interface ScheduledTransfer {
  id: string;
  compteSourceId?: string;
  compteDestId?: string;
  montant: string | number;
  frequence: string;
  actif: boolean;
  prochaineExecution?: string;
  sourceNumero?: string;
  destNumero?: string;
  sourceClientNom?: string;
  sourceClientPrenom?: string;
  destClientNom?: string;
  destClientPrenom?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editTransfer?: ScheduledTransfer | null;
}

type Frequence = 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

const FREQUENCES: { value: Frequence; label: string; description: string }[] = [
  { value: 'ONCE', label: 'Une seule fois', description: 'Exécution unique à la date prévue' },
  { value: 'DAILY', label: 'Quotidien', description: 'Chaque jour à la même heure' },
  { value: 'WEEKLY', label: 'Hebdomadaire', description: 'Une fois par semaine' },
  { value: 'MONTHLY', label: 'Mensuel', description: 'Une fois par mois' },
];

const getOwnerName = (compte: Compte) => {
  const nom = compte.clientNom || compte.client_nom || compte.userNom || compte.user_nom || '';
  const prenom = compte.clientPrenom || compte.client_prenom || compte.userPrenom || compte.user_prenom || '';
  return `${prenom} ${nom}`.trim() || 'Compte';
};

const getNumero = (compte: Compte) => compte.numeroCompte || compte.numero_compte || '';

export default function ScheduledTransferFormModal({ isOpen, onClose, onSuccess, editTransfer }: Props) {
  const isEditing = !!editTransfer;

  // Form state
  const [sourceCompteId, setSourceCompteId] = useState('');
  const [destCompteId, setDestCompteId] = useState('');
  const [destAccountNumber, setDestAccountNumber] = useState('');
  const [montant, setMontant] = useState('');
  const [frequence, setFrequence] = useState<Frequence>('MONTHLY');
  const [prochaineExecution, setProchaineExecution] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [searchingSource, setSearchingSource] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');
  const [sourceComptes, setSourceComptes] = useState<Compte[]>([]);
  const [destComptes, setDestComptes] = useState<Compte[]>([]);
  const [selectedSource, setSelectedSource] = useState<Compte | null>(null);
  const [selectedDest, setSelectedDest] = useState<Compte | null>(null);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [destVerified, setDestVerified] = useState<{ found: boolean; ownerName?: string } | null>(null);
  const [verifyingDest, setVerifyingDest] = useState(false);

  // Initialize form when editing
  useEffect(() => {
    if (editTransfer && isOpen) {
      setMontant(String(editTransfer.montant));
      setFrequence((editTransfer.frequence?.toUpperCase() || 'MONTHLY') as Frequence);
      if (editTransfer.prochaineExecution) {
        setProchaineExecution(editTransfer.prochaineExecution.split('T')[0]);
      }
      // For editing, we'd need to fetch the source and dest comptes
      // For now, just show the numbers
      setDestAccountNumber(editTransfer.destNumero || '');
    }
  }, [editTransfer, isOpen]);

  // Reset form when closing
  useEffect(() => {
    if (!isOpen) {
      setSourceCompteId('');
      setDestCompteId('');
      setDestAccountNumber('');
      setMontant('');
      setFrequence('MONTHLY');
      setProchaineExecution('');
      setSelectedSource(null);
      setSelectedDest(null);
      setSourceSearch('');
      setDestSearch('');
      setDestVerified(null);
    }
  }, [isOpen]);

  // Search source accounts
  const searchSourceComptes = useCallback(async (search: string) => {
    if (!search || search.length < 2) {
      setSourceComptes([]);
      return;
    }
    setSearchingSource(true);
    try {
      const result = await compteEpargneApi.getAll({ search, limit: 10 });
      setSourceComptes(result?.data || []);
    } catch (err) {
      console.error('Error searching source comptes:', err);
    } finally {
      setSearchingSource(false);
    }
  }, []);

  // Search dest accounts
  const searchDestComptes = useCallback(async (search: string) => {
    if (!search || search.length < 2) {
      setDestComptes([]);
      return;
    }
    setSearchingDest(true);
    try {
      const result = await compteEpargneApi.getAll({ search, limit: 10 });
      setDestComptes(result?.data || []);
    } catch (err) {
      console.error('Error searching dest comptes:', err);
    } finally {
      setSearchingDest(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sourceSearch && !selectedSource) {
        searchSourceComptes(sourceSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sourceSearch, selectedSource, searchSourceComptes]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (destSearch && !selectedDest) {
        searchDestComptes(destSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [destSearch, selectedDest, searchDestComptes]);

  // Verify destination account number
  const verifyDestAccount = useCallback(async () => {
    if (!destAccountNumber || destAccountNumber.length < 5) {
      setDestVerified(null);
      return;
    }
    setVerifyingDest(true);
    try {
      const result = await compteEpargneApi.checkAccountNumber(destAccountNumber);
      setDestVerified(result);
    } catch (err) {
      setDestVerified({ found: false });
    } finally {
      setVerifyingDest(false);
    }
  }, [destAccountNumber]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (destAccountNumber && !selectedDest) {
        verifyDestAccount();
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [destAccountNumber, selectedDest, verifyDestAccount]);

  const handleSelectSource = (compte: Compte) => {
    setSelectedSource(compte);
    setSourceCompteId(compte.id);
    setSourceSearch(getNumero(compte));
    setShowSourceDropdown(false);
    setSourceComptes([]);
  };

  const handleSelectDest = (compte: Compte) => {
    setSelectedDest(compte);
    setDestCompteId(compte.id);
    setDestSearch(getNumero(compte));
    setDestAccountNumber('');
    setShowDestDropdown(false);
    setDestComptes([]);
    setDestVerified(null);
  };

  const clearSource = () => {
    setSelectedSource(null);
    setSourceCompteId('');
    setSourceSearch('');
  };

  const clearDest = () => {
    setSelectedDest(null);
    setDestCompteId('');
    setDestSearch('');
    setDestAccountNumber('');
    setDestVerified(null);
  };

  // Validation
  const errors = useMemo(() => {
    const errs: Record<string, string> = {};

    if (!sourceCompteId && !selectedSource) {
      errs.source = 'Compte source requis';
    }

    if (!destCompteId && !selectedDest && !destAccountNumber) {
      errs.dest = 'Compte destinataire requis';
    }

    if (destAccountNumber && destVerified && !destVerified.found) {
      errs.dest = 'Compte destinataire introuvable';
    }

    const montantNum = parseFloat(montant);
    if (!montant || isNaN(montantNum) || montantNum <= 0) {
      errs.montant = 'Montant invalide';
    } else if (montantNum < 100) {
      errs.montant = 'Montant minimum: 100 FCFA';
    }

    if (sourceCompteId && destCompteId && sourceCompteId === destCompteId) {
      errs.dest = 'Source et destination identiques';
    }

    return errs;
  }, [sourceCompteId, destCompteId, selectedSource, selectedDest, destAccountNumber, destVerified, montant]);

  const isValid = Object.keys(errors).length === 0 && (sourceCompteId || selectedSource) && (destCompteId || selectedDest || (destAccountNumber && destVerified?.found));

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    try {
      const payload: any = {
        sourceCompteId: sourceCompteId || selectedSource?.id,
        montant: parseFloat(montant),
        scheduled: true,
        frequence: frequence,
      };

      // Use either destCompteId or destAccountNumber
      if (destCompteId || selectedDest?.id) {
        payload.destinationCompteId = destCompteId || selectedDest?.id;
      } else if (destAccountNumber) {
        payload.destinationAccountNumber = destAccountNumber;
      }

      if (isEditing && editTransfer) {
        // Update existing
        await compteEpargneApi.updateScheduledTransfer(editTransfer.id, {
          montant: parseFloat(montant),
          frequence: frequence.toLowerCase() as any,
          prochaineExecution: prochaineExecution || null,
        });
        toast.success('Virement programmé mis à jour');
      } else {
        // Create new using createTransfer with scheduled: true
        await compteEpargneApi.createTransfer(payload);
        toast.success('Virement programmé créé');
      }

      onSuccess();
      onClose();
    } catch (err) {
      toast.error(handleApiError(err, 'Erreur lors de la création'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <CalendarClock className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isEditing ? 'Modifier le virement' : 'Nouveau virement programmé'}
              </h2>
              <p className="text-xs text-slate-400">
                {isEditing ? 'Modifiez les paramètres du virement' : 'Automatisez vos transferts entre comptes'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Source Account */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Compte source
            </label>
            <div className="relative">
              {selectedSource ? (
                <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-600">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{getOwnerName(selectedSource)}</p>
                    <p className="text-xs text-slate-400">{getNumero(selectedSource)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-400">
                      {formatMoney(Number(selectedSource.solde))}
                    </p>
                  </div>
                  <button onClick={clearSource} className="p-1 hover:bg-slate-700 rounded">
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={sourceSearch}
                      onChange={(e) => {
                        setSourceSearch(e.target.value);
                        setShowSourceDropdown(true);
                      }}
                      onFocus={() => setShowSourceDropdown(true)}
                      placeholder="Rechercher par nom ou numéro..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                    />
                    {searchingSource && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />
                    )}
                  </div>

                  {showSourceDropdown && sourceComptes.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {sourceComptes.map((compte) => (
                        <button
                          key={compte.id}
                          onClick={() => handleSelectSource(compte)}
                          className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center gap-3 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                            <User className="w-4 h-4 text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{getOwnerName(compte)}</p>
                            <p className="text-xs text-slate-500">{getNumero(compte)}</p>
                          </div>
                          <p className="text-xs font-medium text-emerald-400">{formatMoney(Number(compte.solde))}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            {errors.source && <p className="mt-1 text-xs text-red-400">{errors.source}</p>}
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="p-2 bg-slate-800 rounded-full">
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Destination Account */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Compte destinataire
            </label>

            {selectedDest ? (
              <div className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-600">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{getOwnerName(selectedDest)}</p>
                  <p className="text-xs text-slate-400">{getNumero(selectedDest)}</p>
                </div>
                <button onClick={clearDest} className="p-1 hover:bg-slate-700 rounded">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Search mode */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={destSearch}
                    onChange={(e) => {
                      setDestSearch(e.target.value);
                      setShowDestDropdown(true);
                      setDestAccountNumber('');
                    }}
                    onFocus={() => setShowDestDropdown(true)}
                    placeholder="Rechercher ou saisir le numéro..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                  {searchingDest && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />
                  )}
                </div>

                {showDestDropdown && destComptes.length > 0 && (
                  <div className="absolute z-10 w-[calc(100%-2rem)] bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {destComptes.map((compte) => (
                      <button
                        key={compte.id}
                        onClick={() => handleSelectDest(compte)}
                        className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center gap-3 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                          <User className="w-4 h-4 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{getOwnerName(compte)}</p>
                          <p className="text-xs text-slate-500">{getNumero(compte)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Or direct number input */}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="flex-1 h-px bg-slate-700" />
                  <span>ou saisir le numéro</span>
                  <div className="flex-1 h-px bg-slate-700" />
                </div>

                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={destAccountNumber}
                    onChange={(e) => {
                      setDestAccountNumber(e.target.value);
                      setDestSearch('');
                      setDestVerified(null);
                    }}
                    placeholder="Numéro de compte (ex: EP-2025-001234)"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                  {verifyingDest && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" />
                  )}
                  {destVerified && !verifyingDest && (
                    destVerified.found ? (
                      <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                    )
                  )}
                </div>

                {destVerified?.found && destVerified.ownerName && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Titulaire: {destVerified.ownerName}
                  </p>
                )}
              </div>
            )}
            {errors.dest && <p className="mt-1 text-xs text-red-400">{errors.dest}</p>}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Montant
            </label>
            <div className="relative">
              <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                inputMode="numeric"
                value={montant}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setMontant(val);
                }}
                placeholder="0"
                className="w-full pl-10 pr-16 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-lg font-bold placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">FCFA</span>
            </div>
            {errors.montant && <p className="mt-1 text-xs text-red-400">{errors.montant}</p>}
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Fréquence
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCES.map((freq) => (
                <button
                  key={freq.value}
                  type="button"
                  onClick={() => setFrequence(freq.value)}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    frequence === freq.value
                      ? 'bg-cyan-500/20 border-cyan-500/50 ring-1 ring-cyan-500/30'
                      : 'bg-slate-800 border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <p className={`text-sm font-medium ${frequence === freq.value ? 'text-cyan-400' : 'text-white'}`}>
                    {freq.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{freq.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Next execution (optional for new, shows for edit) */}
          {isEditing && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Prochaine exécution
              </label>
              <input
                type="date"
                value={prochaineExecution}
                onChange={(e) => setProchaineExecution(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}

          {/* Summary */}
          {isValid && montant && parseFloat(montant) > 0 && (
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <p className="text-xs text-cyan-400 mb-1">Résumé</p>
              <p className="text-sm text-white">
                {formatMoney(parseFloat(montant))} transféré{' '}
                {FREQUENCES.find(f => f.value === frequence)?.label.toLowerCase() || ''}
              </p>
              {frequence !== 'ONCE' && (
                <p className="text-xs text-slate-400 mt-1">
                  Volume mensuel estimé: {formatMoney(
                    parseFloat(montant) * (
                      frequence === 'DAILY' ? 30 :
                      frequence === 'WEEKLY' ? 4 :
                      1
                    )
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-bold rounded-lg hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isEditing ? 'Mise à jour...' : 'Création...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {isEditing ? 'Mettre à jour' : 'Planifier'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
