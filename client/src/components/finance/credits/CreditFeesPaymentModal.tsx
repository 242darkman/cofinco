import React, { useState, useEffect } from 'react';
import { DollarSign, AlertCircle, CheckCircle, X, Wallet, ArrowRight, Shield, Building, User } from 'lucide-react';
import { Modal, Button, FormField, SelectField, Badge } from '../../ui';
import { useDemandes } from '../../../hooks/credits/useDemandes';
import { computeSessionStatus, formatMoney } from '../../../lib/format';
import { toast } from 'sonner';
import { sessionCaisseApi, authApi } from '../../../lib/api-client';
import { UniversalPaymentSuccessModal } from '../caisse/shared/UniversalPaymentSuccessModal';
import { ReceiptData } from '../../ui/printable/ReceiptTemplate';
import { SystemRole, normalizeRole } from '@shared/types/roles';

interface CreditFeesPaymentModalProps {
  demande: any;
  onClose: () => void;
  onSuccess: () => void;
  onNavigate?: (module: string, sub?: string, data?: any) => void;
}

export default function CreditFeesPaymentModal({ demande, onClose, onSuccess, onNavigate }: CreditFeesPaymentModalProps) {
  const { payerFrais } = useDemandes();
  
  // Utiliser les frais du plan s'ils sont définis, sinon 10% du montant
  const calculatedFee = demande.montant_frais_engagement 
    ? parseFloat(demande.montant_frais_engagement) 
    : (demande.montant_demande || 0) * 0.10;

  const [amount, setAmount] = useState(calculatedFee.toString()); 
  const [method, setMethod] = useState('Espèces');
  const [loading, setLoading] = useState(false);
  
  // Success modal state
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [paidFacture, setPaidFacture] = useState<any>(null);
  const [factureId, setFactureId] = useState<string | undefined>(undefined);

  // Sync amount when demande is available
  useEffect(() => {
    if (demande?.montant_demande) {
      const calculatedFee = demande.montant_frais_engagement 
        ? parseFloat(demande.montant_frais_engagement) 
        : (demande.montant_demande || 0) * 0.10;
      setAmount(calculatedFee.toString());
    }
  }, [demande?.montant_demande, demande?.montant_frais_engagement]);

  // Session State
  const [checkingSession, setCheckingSession] = useState(true);
  const [userSession, setUserSession] = useState<any>(null); // The user's own session
  const [takenSession, setTakenSession] = useState<any>(null); // The session user decided to take over
  const [userRole, setUserRole] = useState<SystemRole>(SystemRole.CLIENT);
  
  // Caisse List State
  const [showCaisseList, setShowCaisseList] = useState(false);
  const [agencyCaisses, setAgencyCaisses] = useState<any[]>([]);
  const [loadingCaisses, setLoadingCaisses] = useState(false);

  // Opening Caisse State
  const [openingCaisseId, setOpeningCaisseId] = useState<string | null>(null);
  const [soldeInitial, setSoldeInitial] = useState('0');
  const [loadingOpen, setLoadingOpen] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      setCheckingSession(true);
      const [session, user] = await Promise.all([
        sessionCaisseApi.getActive(),
        authApi.getMe()
      ]);
      
      const status = session ? (session.computedStatus || computeSessionStatus(session)) : null;
      setUserSession(status === 'OPEN' ? session : null);
      setUserRole(normalizeRole(user?.role) || SystemRole.CLIENT);
    } catch (e) {
      console.error("Error checking session", e);
    } finally {
      setCheckingSession(false);
    }
  };

  const activeSession = takenSession || userSession;

  const handlePayment = async () => {
    setLoading(true);
    try {
      // If we took a session, pass its ID. otherwise pass nothing (backend uses user's active session)
      const targetSessionId = takenSession?.id;
      const result = await payerFrais(demande.id, parseFloat(amount), method, targetSessionId);
      if (result.success) {
        toast.success(`Frais de ${formatMoney(parseFloat(amount))} payés avec succès`);
        if (result.facture) {
          // Show success modal with facture
          setPaidFacture(result.facture);
          setFactureId(result.facture.id); // Store factureId
          setShowSuccessModal(true);
        }
        onSuccess();
        // Don't close immediately if showing success modal, let the modal handle it or user close it
        if (!result.facture) {
            onClose();
        }
      }
    } catch (error) {
       console.error(error);
       toast.error("Erreur lors du paiement des frais");
    } finally {
      setLoading(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    onClose();
  };

  const fetchAgencyCaisses = async () => {
      let agenceId = demande.clients?.agenceId;
      // Fallback logic could go here
      
      if (!agenceId) {
          toast.error("Agence du client introuvable");
          return;
      }

      setLoadingCaisses(true);
      setShowCaisseList(true);
      try {
          const response = await fetch(`/api/caisses/status?agenceId=${agenceId}`);
          if (response.ok) {
              const data = await response.json();
              setAgencyCaisses(data);
          }
      } catch (e) {
          console.error("Error fetching caisses", e);
          toast.error("Erreur chargement caisses");
      } finally {
          setLoadingCaisses(false);
      }
  };

  const handleTakeControl = (caisse: any) => {
      if (caisse.active_session) {
          // Already open, just take it
          setTakenSession(caisse.active_session);
          setShowCaisseList(false);
          toast.success(`Caisse "${caisse.nom}" prise en main`);
      } else {
          // Closed, need to open
          setOpeningCaisseId(caisse.id);
      }
  };

  const confirmOpenCaisse = async () => {
      if (!openingCaisseId) return;
      setLoadingOpen(true);
      try {
          const response = await fetch('/api/sessions-caisse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caisseId: openingCaisseId, soldeInitial: parseFloat(soldeInitial) })
          });
          
          if (response.ok) {
              const newSession = await response.json();
              // Backend returns session, we format it slightly if needed, but usually it matches
              // We need it to look like `active_session`
              const caisse = agencyCaisses.find(c => c.id === openingCaisseId);
              
              const sessionObj = {
                  ...newSession,
                  caisse_nom: caisse?.nom,
                  // We just opened it, so we are the cashier
                  caissier_nom: 'Moi' 
              };
              
              setTakenSession(sessionObj);
              setOpeningCaisseId(null);
              setShowCaisseList(false);
              toast.success("Caisse ouverte et prise en main");
          } else {
              toast.error("Erreur ouverture caisse");
          }
      } catch (e) {
          console.error(e);
          toast.error("Erreur technique");
      } finally {
          setLoadingOpen(false);
      }
  };

  const isAdmin = userRole === SystemRole.ADMIN || userRole === SystemRole.CHEF_AGENCE;

  return (
    <>
    <Modal isOpen={true} onClose={onClose} title="Paiement des Frais d'Engagement" size="md">
        <div className="space-y-6">
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <div className="text-sm text-slate-400">Demande</div>
                        <div className="font-bold text-white text-lg">{demande.numero_demande}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-slate-400">Montant Crédit</div>
                         <div className="font-bold text-emerald-400">{formatMoney(demande.montant_demande)}</div>
                    </div>
                </div>
                 <div className="text-sm text-slate-400 flex items-center gap-2 mt-2">
                    Client: <span className="text-white font-medium">{demande.clients?.nom} {demande.clients?.prenom}</span> 
                    <Badge value={demande.clients?.agence || 'N/A'} variant="neutral" className="text-xs py-0 px-2" />
                 </div>
            </div>

            {checkingSession ? (
                <div className="py-8 text-center text-slate-400 animate-pulse">Vérification de la caisse...</div>
            ) : !activeSession && !showCaisseList ? (
                <div className="space-y-4">
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex flex-col items-center text-center gap-2">
                        <Wallet className="text-amber-500 mb-1" size={32} />
                        <h3 className="font-bold text-amber-500">Aucune Caisse Active</h3>
                        <div className="text-sm text-amber-200/80">
                             Pour encaisser, il faut une caisse active.
                        </div>
                    </div>
                    
                    {isAdmin && (
                        <Button variant="outline" onClick={fetchAgencyCaisses} className="w-full justify-center border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10">
                            <Shield size={16} className="mr-2" />
                            Prendre en main une caisse ({demande.clients?.agence || 'Agence Client'})
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Active Session Display */}
                    {activeSession && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex justify-between items-center text-emerald-400 text-sm">
                            <div className="flex gap-3">
                                <CheckCircle className="shrink-0" size={18} />
                                <div>
                                    <p className="font-medium">Caisse: {activeSession.caisse_nom || 'Ma Caisse'} {takenSession ? '(Prise en main)' : ''}</p>
                                    <p className="text-xs opacity-80 mt-0.5 pointer-events-none">Caissier: {activeSession.caissier_nom}</p>
                                </div>
                            </div>
                            {isAdmin && !showCaisseList && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-emerald-500/20" onClick={fetchAgencyCaisses}>Changer</Button>
                            )}
                        </div>
                    )}

                    {/* Caisse Selection List */}
                    {showCaisseList && (
                        <div className="bg-slate-900 rounded-lg border border-slate-700 p-4 animate-in fade-in zoom-in-95">
                            <div className="flex justify-between mb-3">
                                <h4 className="text-sm font-medium text-slate-300">Choisir une caisse ({demande.clients?.agence})</h4>
                                <button onClick={() => setShowCaisseList(false)}><X size={16} className="text-slate-500" /></button>
                            </div>
                            
                            {loadingCaisses ? (
                                <div className="text-center py-4 text-slate-500 text-sm">Chargement...</div>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                    {agencyCaisses.map(c => (
                                        <div key={c.id} className="flex items-center justify-between p-3 rounded bg-slate-800 border border-slate-700">
                                            <div>
                                                <div className="text-sm font-medium text-white">{c.nom}</div>
                                                <div className="text-xs text-slate-400 flex items-center gap-1">
                                                    {c.active_session ? (
                                                        <span className="text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/> Ouverte ({c.active_session.caissier_nom})</span>
                                                    ) : (
                                                        <span className="text-slate-500 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-500"/> Fermée</span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {openingCaisseId === c.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number" 
                                                        className="w-20 bg-slate-950 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                                                        placeholder="Solde Init"
                                                        value={soldeInitial}
                                                        onChange={e => setSoldeInitial(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <Button size="sm" variant="primary" className="h-7 text-xs" onClick={confirmOpenCaisse} disabled={loadingOpen}>OK</Button>
                                                </div>
                                            ) : (
                                                <Button size="sm" variant="outline" className="h-7 text-xs border-slate-600 hover:bg-slate-700" onClick={() => handleTakeControl(c)}>
                                                    {c.active_session ? 'Choisir' : 'Ouvrir'}
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {!showCaisseList && !showConfirm && (
                        <>
                             <FormField 
                                label="Montant Frais (10% - Fixe)" 
                                name="amount"
                                value={amount ? `${Number(amount).toLocaleString()} FCFA` : ''} 
                                readOnly
                                disabled
                                icon={DollarSign}
                                className="bg-slate-800/30 border-slate-700/50 text-slate-500 font-bold text-lg opacity-80 cursor-not-allowed"
                             />
    
                             <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-300">Méthode de Paiement</label>
                                <select
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 px-3 text-white focus:outline-none focus:border-emerald-500 shadow-sm"
                                >
                                    <option value="Espèces">Espèces</option>
                                    <option value="Mobile Money">Mobile Money</option>
                                    <option value="Virement">Virement</option>
                                </select>
                             </div>
                             
                             <div className="flex gap-3 justify-end pt-4">
                                <Button variant="ghost" onClick={onClose} disabled={loading}>Annuler</Button>
                                <Button 
                                    variant="primary" 
                                    onClick={() => setShowConfirm(true)} 
                                    disabled={loading || !amount || (!activeSession && !isAdmin)}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[160px]"
                                >
                                    Suivant
                                </Button>
                            </div>
                        </>
                    )}

                    {showConfirm && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 text-center">
                                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <AlertCircle className="text-emerald-500" size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">Confirmation du paiement</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    Vous êtes sur le point de procéder au paiement automatique des frais d'engagement.
                                </p>
                            </div>

                            <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4 space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Montant à payer</span>
                                    <span className="text-white font-bold text-lg">{formatMoney(parseFloat(amount))}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Mode de paiement</span>
                                    <Badge value={method} variant="neutral" />
                                </div>
                                <div className="h-px bg-slate-700/50 my-1" />
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Caisse utilisée</span>
                                    <span className="text-emerald-400 font-medium">{activeSession?.caisse_nom || 'Ma Caisse'}</span>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end">
                                <Button 
                                    variant="ghost" 
                                    onClick={() => setShowConfirm(false)}
                                    disabled={loading}
                                >
                                    Retour
                                </Button>
                                <Button 
                                    variant="primary" 
                                    onClick={handlePayment}
                                    isLoading={loading}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-[140px]"
                                >
                                    Payer {formatMoney(parseFloat(amount))}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    </Modal>

    {/* Success Modal with Invoice/Receipt */}
    {showSuccessModal && paidFacture && (
      <UniversalPaymentSuccessModal
        isOpen={showSuccessModal}
        onClose={handleSuccessClose}
        data={{
          title: 'Reçu de Paiement',
          reference: paidFacture.numero || `FRAIS-${demande.numero_demande}`,
          date: paidFacture.date_facture || new Date(),
          type: 'Frais d\'Engagement',
          client: demande.clients ? {
            nom: demande.clients.nom || '',
            prenom: demande.clients.prenom || '',
            telephone: demande.clients.phone || demande.clients.telephone,
          } : undefined,
          items: [{
            description: `Frais d'engagement - Demande de crédit N° ${demande.numero_demande}`,
            montant: parseFloat(paidFacture.montant_total || amount),
          }],
          total: parseFloat(paidFacture.montant_total || amount),
          modePaiement: method,
          devise: 'FCFA',
          notes: `Demande de crédit: ${formatMoney(demande.montant_demande)}`,
        } as ReceiptData}
        factureId={factureId}
      />
    )}
    </>
  );
}
