import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Search,
  ArrowRight,
  Clock,
  Banknote,
  Loader2,
  CheckCircle,
  AlertCircle,
  User,
  Building2,
  Repeat,
  Wallet,
} from 'lucide-react';
import { compteEpargneApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';
import { formatMoney } from '../../lib/format';

interface Compte {
  id: string;
  numeroCompte: string;
  typeCompte: string;
  solde: number | string;
  soldeCourant?: number | string;
  // Nested client object from API
  clients?: {
    id?: string;
    nom?: string;
    prenom?: string;
    telephone?: string;
    email?: string;
  };
  // Legacy flat fields (for compatibility)
  clientNom?: string;
  clientPrenom?: string;
  userNom?: string;
  userPrenom?: string;
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

const FREQUENCES: { value: Frequence; label: string; shortLabel: string }[] = [
  { value: 'ONCE', label: 'Une fois', shortLabel: 'Une fois' },
  { value: 'DAILY', label: 'Quotidien', shortLabel: 'Quotidien' },
  { value: 'WEEKLY', label: 'Hebdomadaire', shortLabel: 'Hebdo' },
  { value: 'MONTHLY', label: 'Mensuel', shortLabel: 'Mensuel' },
];

const getOwnerName = (compte: Compte) => {
  // Check nested clients object first (from API response)
  const nom = compte.clients?.nom || compte.clientNom || compte.userNom || '';
  const prenom = compte.clients?.prenom || compte.clientPrenom || compte.userPrenom || '';
  return `${prenom} ${nom}`.trim() || 'Titulaire';
};

const getNumero = (compte: Compte) => compte.numeroCompte || '';

const getSolde = (compte: Compte) => {
  const solde = compte.soldeCourant || compte.solde || 0;
  return Number(solde);
};

// Get default datetime (now + 1 hour, rounded to nearest 15 min)
const getDefaultDateTime = () => {
  const now = new Date();
  now.setHours(now.getHours() + 1);
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  return now.toISOString().slice(0, 16);
};

export default function ScheduledTransferFormModal({ isOpen, onClose, onSuccess, editTransfer }: Props) {
  const isEditing = !!editTransfer;

  // Form state
  const [sourceCompteId, setSourceCompteId] = useState('');
  const [destCompteId, setDestCompteId] = useState('');
  const [destAccountNumber, setDestAccountNumber] = useState('');
  const [montant, setMontant] = useState('');
  const [frequence, setFrequence] = useState<Frequence>('MONTHLY');
  const [startDateTime, setStartDateTime] = useState(getDefaultDateTime());

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
        setStartDateTime(editTransfer.prochaineExecution.slice(0, 16));
      }
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
      setStartDateTime(getDefaultDateTime());
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
      errs.montant = 'Min: 100 FCFA';
    }

    if (!startDateTime) {
      errs.startDateTime = 'Date requise';
    }

    if (sourceCompteId && destCompteId && sourceCompteId === destCompteId) {
      errs.dest = 'Source et destination identiques';
    }

    return errs;
  }, [sourceCompteId, destCompteId, selectedSource, selectedDest, destAccountNumber, destVerified, montant, startDateTime]);

  const isValid = Object.keys(errors).length === 0 &&
    (sourceCompteId || selectedSource) &&
    (destCompteId || selectedDest || (destAccountNumber && destVerified?.found)) &&
    startDateTime;

  // Cron summary helper
  const getCronSummary = () => {
    if (!startDateTime || !montant || parseFloat(montant) <= 0) {
      return "Configurez les paramètres du virement...";
    }

    const date = new Date(startDateTime);
    const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dayOfWeek = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    const dayOfMonth = date.getDate();

    switch (frequence) {
      case 'DAILY':
        return `Chaque jour à ${timeStr}, à partir du ${dateStr}.`;
      case 'WEEKLY':
        return `Chaque ${dayOfWeek} à ${timeStr}, à partir du ${dateStr}.`;
      case 'MONTHLY':
        return `Le ${dayOfMonth} de chaque mois à ${timeStr}, à partir du ${dateStr}.`;
      default:
        return `Exécution unique le ${dateStr} à ${timeStr}.`;
    }
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    setLoading(true);
    try {
      const payload: any = {
        sourceCompteId: sourceCompteId || selectedSource?.id,
        montant: parseFloat(montant),
        scheduled: true,
        frequence: frequence,
        prochaineExecution: new Date(startDateTime).toISOString(),
      };

      // Use either destCompteId or destAccountNumber
      if (destCompteId || selectedDest?.id) {
        payload.destinationCompteId = destCompteId || selectedDest?.id;
      } else if (destAccountNumber) {
        payload.destinationAccountNumber = destAccountNumber;
      }

      if (isEditing && editTransfer) {
        await compteEpargneApi.updateScheduledTransfer(editTransfer.id, {
          montant: parseFloat(montant),
          frequence: frequence.toLowerCase() as any,
          prochaineExecution: startDateTime || null,
        });
        toast.success('Virement programmé mis à jour');
      } else {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* HEADER */}
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl">
              <Clock className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isEditing ? 'Modifier le virement' : 'Virement Programmé'}
              </h2>
              <p className="text-xs text-slate-400">Automatisation des transferts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500 hover:text-white" />
          </button>
        </div>

        {/* BODY - Compact & Aligned */}
        <div className="p-6 space-y-5">

          {/* 1. FLUX (Source -> Dest) */}
          <div className="flex flex-col md:flex-row items-stretch gap-3">
            {/* Source Account */}
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">
                Compte Source
              </label>
              <div className="relative">
                {selectedSource ? (
                  <div className="h-14 flex items-center gap-2 px-3 bg-slate-900 border border-emerald-500/50 rounded-xl">
                    <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{getNumero(selectedSource)}</p>
                      <p className="text-[10px] text-slate-400 truncate">{getOwnerName(selectedSource)}</p>
                    </div>
                    <span className="text-xs text-emerald-400 font-medium">{formatMoney(getSolde(selectedSource))}</span>
                    <button onClick={clearSource} className="p-1 hover:bg-slate-800 rounded">
                      <X className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={sourceSearch}
                      onChange={(e) => {
                        setSourceSearch(e.target.value);
                        setShowSourceDropdown(true);
                      }}
                      onFocus={() => setShowSourceDropdown(true)}
                      onBlur={() => setTimeout(() => setShowSourceDropdown(false), 200)}
                      placeholder="Rechercher..."
                      className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 text-white text-sm placeholder:text-slate-600 focus:border-indigo-500 outline-none"
                    />
                    {searchingSource && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 animate-spin" />
                    )}
                    {showSourceDropdown && sourceComptes.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {sourceComptes.map((compte) => (
                          <button
                            key={compte.id}
                            onClick={() => handleSelectSource(compte)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center gap-3 transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            <User className="w-4 h-4 text-slate-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{getOwnerName(compte)}</p>
                              <p className="text-xs text-slate-500">{getNumero(compte)}</p>
                            </div>
                            <p className="text-xs font-medium text-emerald-400">{formatMoney(getSolde(compte))}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {errors.source && <p className="text-[10px] text-red-400 ml-1">{errors.source}</p>}
            </div>

            {/* Arrow Connector */}
            <div className="flex items-center justify-center pt-6">
              <div className="hidden md:flex p-2 text-slate-600">
                <ArrowRight className="w-5 h-5" />
              </div>
              <div className="md:hidden p-2 text-slate-600 rotate-90">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>

            {/* Destination Account */}
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">
                Bénéficiaire
              </label>
              <div className="relative">
                {selectedDest ? (
                  <div className="h-14 flex items-center gap-2 px-3 bg-slate-900 border border-emerald-500/50 rounded-xl">
                    <User className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{getNumero(selectedDest)}</p>
                      <p className="text-[10px] text-slate-400 truncate">{getOwnerName(selectedDest)}</p>
                    </div>
                    <button onClick={clearDest} className="p-1 hover:bg-slate-800 rounded">
                      <X className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                ) : destAccountNumber && destVerified?.found ? (
                  <div className="h-14 flex items-center gap-2 px-3 bg-slate-900 border border-emerald-500/50 rounded-xl">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{destAccountNumber}</p>
                      <p className="text-[10px] text-slate-400 truncate">{destVerified.ownerName || 'Titulaire vérifié'}</p>
                    </div>
                    <button onClick={clearDest} className="p-1 hover:bg-slate-800 rounded">
                      <X className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={destSearch || destAccountNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        // If looks like account number (starts with EP- or contains numbers)
                        if (val.startsWith('EP-') || /^\d/.test(val)) {
                          setDestAccountNumber(val);
                          setDestSearch('');
                        } else {
                          setDestSearch(val);
                          setDestAccountNumber('');
                          setShowDestDropdown(true);
                        }
                      }}
                      onFocus={() => setShowDestDropdown(true)}
                      onBlur={() => setTimeout(() => setShowDestDropdown(false), 200)}
                      placeholder="Nom ou N° compte..."
                      className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-10 text-white text-sm placeholder:text-slate-600 focus:border-indigo-500 outline-none"
                    />
                    {(searchingDest || verifyingDest) && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 animate-spin" />
                    )}
                    {destVerified && !verifyingDest && destAccountNumber && (
                      destVerified.found ? (
                        <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                      )
                    )}
                    {showDestDropdown && destComptes.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                        {destComptes.map((compte) => (
                          <button
                            key={compte.id}
                            onClick={() => handleSelectDest(compte)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-700 flex items-center gap-3 transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            <User className="w-4 h-4 text-slate-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white truncate">{getOwnerName(compte)}</p>
                              <p className="text-xs text-slate-500">{getNumero(compte)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {errors.dest && <p className="text-[10px] text-red-400 ml-1">{errors.dest}</p>}
            </div>
          </div>

          {/* 2. CONFIG (Montant & Date Cron) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Montant */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">
                Montant (FCFA)
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
                  className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-16 text-white font-bold placeholder:text-slate-600 focus:border-indigo-500 outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">FCFA</span>
              </div>
              {errors.montant && <p className="text-[10px] text-red-400 ml-1">{errors.montant}</p>}
            </div>

            {/* Date & Heure Début (Cron Trigger) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">
                Démarrer le
              </label>
              <input
                type="datetime-local"
                value={startDateTime}
                onChange={(e) => setStartDateTime(e.target.value)}
                className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl px-4 text-white text-sm focus:border-indigo-500 outline-none"
              />
              {errors.startDateTime && <p className="text-[10px] text-red-400 ml-1">{errors.startDateTime}</p>}
            </div>
          </div>

          {/* 3. FRÉQUENCE (Segmented Control - Single Line) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">
              Répétition
            </label>
            <div className="grid grid-cols-4 gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-700">
              {FREQUENCES.map((freq) => (
                <button
                  key={freq.value}
                  type="button"
                  onClick={() => setFrequence(freq.value)}
                  className={`
                    h-10 rounded-lg text-xs font-bold transition-all flex items-center justify-center
                    ${frequence === freq.value
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'}
                  `}
                >
                  <span className="hidden sm:inline">{freq.label}</span>
                  <span className="sm:hidden">{freq.shortLabel}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-6 bg-slate-900 border-t border-slate-800 space-y-4">
          {/* Cron Summary Banner */}
          <div className="flex items-start gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
            <Repeat className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-indigo-400 block mb-0.5">Résumé de la planification</span>
              <span className="text-indigo-200">{getCronSummary()}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid || loading}
              className="h-12 px-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEditing ? 'Mise à jour...' : 'Planification...'}
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  {isEditing ? 'Mettre à jour' : 'Planifier'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
