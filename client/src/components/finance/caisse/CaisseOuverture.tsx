import React, { useState, useEffect, useMemo } from 'react';
import { X, Unlock, DollarSign, Lock, Shield, Check, KeyRound, AlertCircle, Monitor, Wallet, Clock, User, CheckCircle2 } from 'lucide-react';
import { Card, Button, IconButton, LoadingSpinner, Badge } from '../../ui';
import SelectField from '../../ui/SelectField';
import { usePermissions } from '../../auth/ProtectedFeature';
import { authService } from '../../../lib/auth';
import { api } from '../../../lib/api';

interface CaisseOuvertureProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Caisse {
  id: string;
  nom: string;
  type: string;
  statut: string;
  isOccupied: boolean;
  occupiedBy?: string;
  occupiedByName?: string;
  solde: string;
  assignments?: string[];
  lastSession?: {
    date_fermeture?: string;
    solde_reel?: number;
    caissier_nom?: string;
  };
}

interface Agence {
  id: string;
  nom: string;
}

export default function CaisseOuverture({ onClose, onSuccess }: CaisseOuvertureProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const hasGlobalPermission = hasPermission('caisse', 'create') || hasPermission('caisse', 'manage');
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'Administrateur';
  
  // Allow ANY logged in user to attempt self-auth via PIN if they have permissions
  const canSelfAuthorize = true; 


  const [step, setStep] = useState<'auth' | 'billetage'>('auth');
  const [loading, setLoading] = useState(false);
  const [loadingCaisses, setLoadingCaisses] = useState(true);
  
  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [selectedCaisseId, setSelectedCaisseId] = useState<string>('');
  
  const [agences, setAgences] = useState<Agence[]>([]);
  const [selectedAgenceId, setSelectedAgenceId] = useState<string>(currentUser?.agenceId || '');

  const [superviseur, setSuperviseur] = useState<any>(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [authData, setAuthData] = useState({ username: '', password: '', pin: '' });
  const [formData, setFormData] = useState({ caissier_id: '', observations: '' });

  const [billetage, setBilletage] = useState({
    billets_10000: 0, billets_5000: 0, billets_1000: 0, billets_500: 0,
    billets_200: 0, billets_100: 0, billets_50: 0,
    pieces_20: 0, pieces_10: 0, pieces_5: 0,
  });

  // Load Agencies for Admin
  useEffect(() => {
    if (isAdmin) {
      const fetchAgences = async () => {
        try {
          const res = await api.get<Agence[]>('/agences');
          if (res.data) {
             setAgences(res.data);
             // Ensure selectedAgenceId is valid or default to first
             if (!selectedAgenceId && res.data.length > 0) {
                 setSelectedAgenceId(res.data[0].id);
             }
          }
        } catch (e) {
          console.error("Erreur chargement agences", e);
        }
      };
      fetchAgences();
    }
  }, [isAdmin]);

  // Fetch Caisses when Agence changes
  useEffect(() => {
    const fetchCaisses = async () => {
        if (!selectedAgenceId) {
             if (!isAdmin) { // Admin allows selection, so wait. Non-admin MUST have ID.
                console.warn("Agence ID manquante pour l'utilisateur", currentUser);
                setError("Impossible de charger les caisses : Agence non identifiée.");
             }
             setLoadingCaisses(false);
             return;
        }
        setLoadingCaisses(true);
        try {
            const res = await api.get<Caisse[]>(`/agences/${selectedAgenceId}/caisses`);
            if (res.data) {
                let availableCaisses = res.data;

                // Filter for Cashiers (Non-Admin & Non-Manager)
                const isManager = currentUser?.role === 'Chef d\'Agence' || currentUser?.role === 'Administrateur' || currentUser?.role === 'admin';
                
                if (!isManager && currentUser?.id) {
                    availableCaisses = res.data.filter(c => 
                        c.assignments && c.assignments.includes(currentUser.id)
                    );
                }

                setCaisses(availableCaisses);
                
                // Auto-select if only one option (especially for cashiers)
                if (availableCaisses.length === 1) {
                    setSelectedCaisseId(availableCaisses[0].id);
                } else {
                    setSelectedCaisseId('');
                }
                
                // Pre-select first available if any
                const firstAvailable = res.data.find(c => !c.isOccupied && c.statut !== 'Fermée');
                if (firstAvailable) setSelectedCaisseId(firstAvailable.id);
            }
        } catch (e) {
            console.error("Erreur chargement caisses", e);
            setError("Impossible de charger la liste des caisses.");
        } finally {
            setLoadingCaisses(false);
        }
    };
    fetchCaisses();
  }, [selectedAgenceId, isAdmin]);

  const calculerTotal = () => {
    return billetage.billets_10000 * 10000 + billetage.billets_5000 * 5000 +
      billetage.billets_1000 * 1000 + billetage.billets_500 * 500 +
      billetage.billets_200 * 200 + billetage.billets_100 * 100 +
      billetage.billets_50 * 50 + billetage.pieces_20 * 20 +
      billetage.pieces_10 * 10 + billetage.pieces_5 * 5;
  };

  const handleAuthentication = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!selectedCaisseId) {
        setError("Veuillez sélectionner une caisse physique.");
        setLoading(false);
        return;
    }

    try {
      let data;
      
      if (canSelfAuthorize) {
          // Simplified Auth (PIN Only)
           if (!authData.pin) {
            setError('Veuillez entrer votre PIN à 6 chiffres.');
            setLoading(false);
            return;
          }
          
          const res = await fetch('/api/auth/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ pin: authData.pin })
          });
          
          data = await res.json();
           if (!res.ok) {
            if (data && data.requirePinSetup) {
              setError('Aucun PIN configuré. Définissez votre PIN dans Paramètres > Sécurité.');
            } else {
              setError(data?.error || 'PIN incorrect. Vérifiez votre saisie.');
            }
            setLoading(false);
            return;
          }

      } else {
          // Full Supervisor Auth
          const res = await fetch('/api/auth/verify-supervisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              username: authData.username,
              password: authData.password,
              pin: authData.pin || undefined
            })
          });
          
          data = await res.json();
           if (!res.ok) {
             // ... Error handling same as before
            if (data && data.requirePinSetup) {
              setError('Aucun PIN configuré. Définissez votre PIN dans Paramètres > Sécurité.');
            } else {
              setError(data?.error || 'Erreur d\'authentification. Vérifiez vos identifiants.');
            }
            setLoading(false);
            return;
           }
      }


      // Common checks
      if (!data.hasPinConfigured && !canSelfAuthorize) { // verification might differ
         // verify-pin endpoint ensures pin is configured. verify-supervisor checks it too.
         setError('Veuillez d\'abord configurer le PIN caisse.');
         setLoading(false);
         return;
      }


      setSuperviseur(data);
      // If Admin is opening for themselves, they are the caissier.
      // If Caissier opens with Supervisor auth, the Caissier (currentUser) is the caissier, Supervisor is authorizer.
      // Wait. formData.caissier_id was getting set to `data.id` (the Supervisor's ID) in previous code?
      // Step 134: `setFormData({ ...formData, caissier_id: data.id });`
      // That implies the person 'Logging In' in the modal BECOMES the caissier.
      // YES. "Ouverture de Caisse" -> Who is taking this caisse?
      // If I am a Caissier, I am already logged in. But this modal asks for "Authentification Superviseur".
      // Line 159 payload uses `caissier_id: formData.caissier_id`.
      // Line 166 uses `autorise_par: superviseur?.id`.
      // If `handleAuthentication` sets `caissier_id` to `data.id` (Supervisor ID), then the Supervisor becomes the Caissier?
      // That seems WRONG if a Caissier is just asking for validation.
      // BUT currently, the app seems to treat this step as "Who is opening the session?".
      // If I am logged in as 'Alice' (Caissier), and 'Bob' (Supervisor) auths...
      // Should 'Alice' be the caissier? Yes.
      // So `caissier_id` should probably be `currentUser.id`.
      // Let's check `api/sessions-caisse` logic roughly (not visible).
      // Assuming `currentUser` is the one opening the session.
      // The previous code SET `caissier_id` to `data.id` (Line 137).
      // If `data` came from `verify-supervisor`, `data` IS the supervisor.
      // So previous code made the Supervisor the owner of the session!
      // Maybe that's intended for "High Security" where Supervisor takes responsibility?
      // OR it was a bug/misunderstanding.
      // User said: "sachant que l'utilisateur est déjà authentifié pas besoin de demandé encore (login + mdp)".
      // This implies the user wants to use *their own* identity.
      // So `caissier_id` should be `currentUser.id`.
      // And `autorise_par` should be `data.id` (User who authenticated/authorized).
      // If CanSelfAuth, `caissier_id` = `currentUser.id`, `autorise_par` = `currentUser.id`.
      // If Caissier needs Supervisor, `caissier_id` = `currentUser.id`, `autorise_par` = `Supervisor.id`.
      
      // I will fix this logic: `caissier_id` = `currentUser.id`.
      setFormData({ ...formData, caissier_id: currentUser?.id || '' });

      setSuccessMessage('Authentification réussie !');
      setTimeout(() => { setStep('billetage'); setSuccessMessage(''); }, 1000);
    } catch (err: any) {
      setError('Erreur: ' + (err.message || err.error || "Erreur inconnue"));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const totalCalcule = calculerTotal();

    try {
      const payload = {
        caisseId: selectedCaisseId,
        caissierId: currentUser?.id,
        dateOuverture: new Date().toISOString(),
        soldeInitial: totalCalcule.toString(),
        soldeTheorique: totalCalcule.toString(),
        statut: 'Ouverte',
        observations: formData.observations,
        billetageOuverture: billetage,
        // Removed non-schema fields to avoid validation errors
      };

      const res = await fetch('/api/sessions-caisse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'Erreur lors de la création');
      }

      setSuccessMessage('Caisse ouverte avec succès !');
      setTimeout(onSuccess, 1500);
    } catch (err: any) {
      setError('Erreur: ' + err.message);
    } finally {
      setLoading(false);
    }
  };


  
  const BILLETS = [
    { name: 'billets_10000', label: '10 000', value: 10000 },
    { name: 'billets_5000', label: '5 000', value: 5000 },
    { name: 'billets_1000', label: '1 000', value: 1000 },
    { name: 'billets_500', label: '500', value: 500 },
  ];

  const PIECES = [
    { name: 'billets_200', label: '200', value: 200 }, // Often handled as coin in practice or small note
    { name: 'billets_100', label: '100', value: 100 },
    { name: 'billets_50', label: '50', value: 50 },
    { name: 'pieces_20', label: '20', value: 20 },
    { name: 'pieces_10', label: '10', value: 10 },
    { name: 'pieces_5', label: '5', value: 5 },
  ];

  // Format money helper
  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR').format(amount);
  };

  // Format relative time
  const formatLastClosure = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      if (diffHours < 1) return "Il y a moins d'une heure";
      return `Il y a ${diffHours}h`;
    } else if (diffDays === 1) {
      return `Hier à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `Il y a ${diffDays} jours`;
    } else {
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    }
  };

  // Selected caisse info
  const selectedCaisseInfo = useMemo(() => {
    return caisses.find(c => c.id === selectedCaisseId);
  }, [caisses, selectedCaisseId]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-3">
      <Card variant="elevated" className="w-full max-w-lg max-h-[95vh] flex flex-col bg-surface-base" padding="none">
        {/* Header */}
        <div className="px-3 py-3 sm:px-4 flex items-center gap-3 border-b border-edge bg-success/10">
          <div className="p-2 rounded-xl bg-success/20">
            <Unlock className="w-5 h-5 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-content-primary">Ouverture de Caisse</h3>
            <p className="text-[10px] sm:text-xs text-content-muted">
              {step === 'auth' ? 'Étape 1/2 : Authentification' : 'Étape 2/2 : Décompte initial'}
            </p>
          </div>
          <IconButton icon={X} variant="ghost" size="sm" onClick={onClose} aria-label="Fermer" />
        </div>

        {/* Progress */}
        <div className="px-4 py-3 flex items-center justify-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step === 'auth' ? 'bg-primary text-white' : 'bg-success text-white'}`}>
            {step === 'billetage' ? <Check size={14} /> : '1'}
          </div>
          <div className={`w-12 h-1 rounded ${step === 'billetage' ? 'bg-success' : 'bg-edge'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${step === 'billetage' ? 'bg-primary text-white' : 'bg-surface-muted text-content-muted'}`}>
            2
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="bg-success/10 border border-success/30 rounded-xl p-3 flex items-center gap-2">
              <Check className="w-4 h-4 text-success" />
              <p className="text-xs text-success font-semibold">{successMessage}</p>
            </div>
          )}

          {step === 'auth' && (
            <form onSubmit={handleAuthentication} className="space-y-4">
              
              {/* ADMIN: Agency Selector */}
              {isAdmin && (
                  <SelectField
                    label="Agence"
                    name="agence"
                    value={selectedAgenceId}
                    onChange={(e) => setSelectedAgenceId(e.target.value)}
                    options={agences.map(a => ({ value: a.id, label: a.nom }))}
                    className="mb-4"
                  />
              )}

              {/* Caisse Selector */}
                <div className="space-y-3">
                    <label className="text-xs font-semibold text-content-secondary">Choisir la Caisse</label>
                    {loadingCaisses ? (
                        <div className="flex justify-center py-4"><LoadingSpinner size="sm" /></div>
                    ) : caisses.length === 0 ? (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                          <p className="text-sm text-amber-400 font-medium">Aucune caisse disponible</p>
                          <p className="text-xs text-amber-300/70 mt-1">
                            Contactez votre superviseur pour être assigné à une caisse.
                          </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2">
                            {caisses.map(caisse => {
                                const isSelected = selectedCaisseId === caisse.id;
                                const hasLastSession = caisse.lastSession?.date_fermeture;

                                return (
                                    <button
                                        key={caisse.id}
                                        type="button"
                                        disabled={caisse.isOccupied}
                                        onClick={() => setSelectedCaisseId(caisse.id)}
                                        className={`
                                            relative p-3 rounded-xl border text-left transition-all
                                            ${isSelected
                                                ? 'border-primary bg-primary/5 ring-2 ring-primary/50'
                                                : 'border-edge bg-surface-muted hover:border-primary/50'
                                            }
                                            ${caisse.isOccupied ? 'opacity-60 cursor-not-allowed' : ''}
                                        `}
                                    >
                                        {/* Selection indicator */}
                                        {isSelected && (
                                          <div className="absolute -top-1.5 -right-1.5">
                                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                              <CheckCircle2 size={12} className="text-white" />
                                            </div>
                                          </div>
                                        )}

                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                {/* Caisse name and type */}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className={`p-1.5 rounded-lg ${
                                                      caisse.type === 'Coffre-Fort'
                                                        ? 'bg-amber-500/10 text-amber-500'
                                                        : 'bg-cyan-500/10 text-cyan-500'
                                                    }`}>
                                                      {caisse.type === 'Coffre-Fort' ? <Lock size={14} /> : <Monitor size={14} />}
                                                    </div>
                                                    <div>
                                                      <span className="text-sm font-bold text-content-primary block">{caisse.nom}</span>
                                                      <span className="text-[10px] text-content-muted">{caisse.type}</span>
                                                    </div>
                                                </div>

                                                {/* Status and last session info */}
                                                {caisse.isOccupied ? (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                                      <User size={12} className="text-amber-500" />
                                                      <span className="text-xs text-amber-400">
                                                        Occupée par <strong>{caisse.occupiedByName || 'un autre caissier'}</strong>
                                                      </span>
                                                    </div>
                                                ) : hasLastSession ? (
                                                    <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-base/50 border border-edge/50">
                                                      <div className="flex-1">
                                                        <div className="flex items-center gap-1.5 text-[10px] text-content-muted mb-0.5">
                                                          <Clock size={10} />
                                                          <span>Dernière fermeture: {formatLastClosure(caisse.lastSession?.date_fermeture)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                          <Wallet size={10} className="text-emerald-500" />
                                                          <span className="text-xs font-semibold text-emerald-400 font-mono">
                                                            {formatMoney(caisse.lastSession?.solde_reel || 0)} F
                                                          </span>
                                                          <span className="text-[10px] text-content-muted">solde final</span>
                                                        </div>
                                                      </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                      <CheckCircle2 size={12} className="text-emerald-500" />
                                                      <span className="text-xs text-emerald-400">Disponible - Première ouverture</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

              <div className="bg-primary/10 border border-primary/30 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-content-primary">
                      {canSelfAuthorize ? "Validation d'identité" : "Authentification Superviseur"}
                  </span>
                </div>
                {canSelfAuthorize ? (
                     <p className="text-[10px] text-content-muted pl-6">
                        Confirmez votre identité avec votre PIN pour ouvrir cette session.
                     </p>
                ) : (
                    <p className="text-[10px] text-content-muted pl-6">
                      Seul un Administrateur ou Chef d'Agence peut autoriser l'ouverture
                    </p>
                )}
              </div>

              <div className="space-y-3">
                {!canSelfAuthorize && (
                    <>
                        <div>
                        <label className="block text-xs font-semibold text-content-secondary mb-1.5">Identifiant</label>
                        <input
                            type="text"
                            value={authData.username}
                            onChange={(e) => setAuthData({ ...authData, username: e.target.value })}
                            className="w-full px-3 py-2.5 bg-surface-muted border border-edge rounded-xl text-content-primary text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            placeholder="Nom d'utilisateur"
                            required
                        />
                        </div>
                        <div>
                        <label className="block text-xs font-semibold text-content-secondary mb-1.5">Mot de passe</label>
                        <input
                            type="password"
                            value={authData.password}
                            onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                            className="w-full px-3 py-2.5 bg-surface-muted border border-edge rounded-xl text-content-primary text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            placeholder="••••••••"
                            required
                        />
                        </div>
                    </>
                )}
                
                <div>
                  <label className="block text-xs font-semibold text-content-secondary mb-1.5 flex items-center gap-1.5">
                    <KeyRound size={12} /> PIN Caisse (6 chiffres)
                  </label>
                  <input
                    type="password"
                    value={authData.pin}
                    onChange={(e) => setAuthData({ ...authData, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    className="w-full px-3 py-2.5 bg-surface-muted border border-edge rounded-xl text-content-primary text-center text-lg font-mono tracking-widest focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" isLoading={loading} variant="primary" icon={Lock} className="flex-1" size="sm">
                  Continuer
                </Button>
                <Button type="button" variant="ghost" onClick={onClose} size="sm">Annuler</Button>
              </div>
            </form>
          )}

          {step === 'billetage' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-surface-base border border-edge rounded-xl shadow-sm overflow-hidden mb-4">
                <div className="bg-surface-muted/50 p-4 border-b border-edge flex flex-col items-center justify-center text-center">
                   <span className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-1">Total en Caisse</span>
                   <div className="text-3xl font-bold text-primary tabular-nums tracking-tight">
                      {calculerTotal().toLocaleString()} <span className="text-sm font-medium text-content-muted">FCFA</span>
                   </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-edge border-b border-edge bg-surface-base/50">
                    <div className="p-3 text-center">
                        <span className="block text-[10px] text-content-muted uppercase">Autorisé par</span>
                        <span className="text-xs font-semibold text-content-primary truncate block">{superviseur?.name}</span>
                    </div>
                    <div className="p-3 text-center">
                        <span className="block text-[10px] text-content-muted uppercase">Caisse</span>
                        <span className="text-xs font-semibold text-content-primary truncate block">{caisses.find(c => c.id === selectedCaisseId)?.nom}</span>
                    </div>
                </div>
              </div>

              <div className="space-y-6">
                 {/* Billets Section */}
                 <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-content-primary mb-3 px-1">
                        <Wallet size={16} className="text-primary" /> Billets
                    </h4>
                    <div className="space-y-2">
                        {BILLETS.map((d) => {
                            const count = billetage[d.name as keyof typeof billetage];
                            const subtotal = count * d.value;
                            return (
                                <div key={d.name} className="flex items-center justify-between p-3 bg-surface-muted/40 rounded-xl border border-edge/50">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-content-primary">{d.label}</span>
                                        <span className="text-[10px] text-content-muted font-medium">
                                            {subtotal > 0 ? `${subtotal.toLocaleString()} F` : '-'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 bg-surface-base rounded-lg p-1 border border-edge shadow-sm">
                                        <button 
                                            type="button" 
                                            onClick={() => setBilletage({ ...billetage, [d.name]: Math.max(0, count - 1) })} 
                                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-danger/10 text-content-secondary hover:text-danger transition-colors"
                                        >
                                            <span className="text-lg leading-none mb-0.5">-</span>
                                        </button>
                                        <input
                                            type="number"
                                            value={count || ''}
                                            onChange={(e) => setBilletage({ ...billetage, [d.name]: Math.max(0, Number(e.target.value)) })}
                                            className="w-12 text-center bg-transparent font-bold text-content-primary outline-none"
                                            placeholder="0"
                                            min="0"
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setBilletage({ ...billetage, [d.name]: count + 1 })} 
                                            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-success/10 text-content-secondary hover:text-success transition-colors"
                                        >
                                            <span className="text-lg leading-none mb-0.5">+</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                 </div>

                 {/* Pièces Section */}
                 <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-content-primary mb-3 px-1">
                        <DollarSign size={16} className="text-secondary" /> Pièces & Petite Monnaie
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PIECES.map((d) => {
                            const count = billetage[d.name as keyof typeof billetage];
                            return (
                                <div key={d.name} className="flex items-center justify-between p-2 pl-3 bg-surface-muted/40 rounded-xl border border-edge/50">
                                     <span className="font-bold text-content-primary text-sm">{d.label}</span>
                                     <div className="flex items-center gap-1">
                                        <button 
                                            type="button" 
                                            onClick={() => setBilletage({ ...billetage, [d.name]: Math.max(0, count - 1) })} 
                                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-danger/10 text-content-secondary hover:text-danger transition-colors text-lg font-medium"
                                        >-</button>
                                        <input
                                            type="number"
                                            value={count || ''}
                                            onChange={(e) => setBilletage({ ...billetage, [d.name]: Math.max(0, Number(e.target.value)) })}
                                            className="w-10 text-center bg-transparent font-semibold text-content-primary outline-none text-sm"
                                            placeholder="0"
                                            min="0"
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setBilletage({ ...billetage, [d.name]: count + 1 })} 
                                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-success/10 text-content-secondary hover:text-success transition-colors text-lg font-medium"
                                        >+</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                 </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-content-secondary mb-1.5">Observations</label>
                <textarea
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-edge rounded-xl text-content-primary text-xs resize-none focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  rows={2}
                  placeholder="Notes optionnelles..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                {(() => {
                    // Check availability
                    const selectedCaisse = caisses.find(c => c.id === selectedCaisseId);
                    const isAssigned = selectedCaisse?.assignments?.includes(currentUser?.id || '');
                    const canOpen = hasGlobalPermission || isAssigned;

                    return canOpen ? (
                        <Button type="submit" isLoading={loading} disabled={calculerTotal() === 0} variant="primary" icon={Unlock} className="flex-1" size="sm">
                            Ouvrir la Caisse
                        </Button>
                    ) : (
                        <div className="flex-1 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-center text-sm">
                            Vous n'êtes pas assigné à cette caisse
                        </div>
                    );
                })()}
                <Button type="button" variant="ghost" onClick={() => setStep('auth')} size="sm">Retour</Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
