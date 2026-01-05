import React, { useState } from 'react';
import { Search, Smartphone, TrendingUp, TrendingDown, Loader2, X, CheckCircle, ArrowRight } from 'lucide-react';
import { OTPValidationSimple } from '../../auth/OTPValidationSimple';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';

interface Client {
  id: string;
  nom: string;
  prenom: string;
  numero_compte?: string;
  telephone: string;
  email?: string;
  phone?: string;
}

type TypeOperation = 'Dépôt' | 'Retrait';
type Operateur = 'Airtel Money' | 'MTN Mobile Money';
type TypeDepot = 'Compte Courant' | 'Compte Épargne' | 'Compte Bloqué' | 'Cotisation Tontine' | 'Remboursement Crédit';
type TypeRetrait = 'Retrait Compte Courant' | 'Retrait Épargne' | 'Décaissement Crédit' | 'Distribution Tontine';

interface CaisseMobileMoneyProps {
  sessionId: string;
  onTransactionComplete: () => void;
}

export default function CaisseMobileMoney({ sessionId, onTransactionComplete }: CaisseMobileMoneyProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [typeOperation, setTypeOperation] = useState<TypeOperation | null>(null);
  const [typeDepot, setTypeDepot] = useState<TypeDepot | null>(null);
  const [typeRetrait, setTypeRetrait] = useState<TypeRetrait | null>(null);
  const [operateur, setOperateur] = useState<Operateur>('Airtel Money');
  const [montant, setMontant] = useState('');
  const [numeroTransaction, setNumeroTransaction] = useState('');
  const [frais, setFrais] = useState('0');
  const [loading, setLoading] = useState(false);
  const [showOTP, setShowOTP] = useState(false);
  const [otpData, setOtpData] = useState<any>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const operateurs = [
    { name: 'Airtel Money' as Operateur, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/50', logo: '/airtel-logo.png' },
    { name: 'MTN Mobile Money' as Operateur, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/50', logo: '/mtn-logo.png' }
  ];

  const rechercherClient = async () => {
    if (!searchTerm.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/clients/search?q=${encodeURIComponent(searchTerm)}&limit=1`);
      if (!response.ok) throw new Error('Erreur recherche');
      const clients = await response.json();

      if (clients && clients.length > 0) {
        setSelectedClient(clients[0]);
      } else {
        // Simple visual feedback could be added here
      }
    } catch (error: any) {
      console.error('Erreur recherche client:', error);
    } finally {
      setLoading(false);
    }
  };

  const preparerOperation = async () => {
    if (!typeOperation || !montant || parseFloat(montant) <= 0 || !numeroTransaction) {
      return;
    }

    if (typeOperation === 'Dépôt' && !typeDepot) return;
    if (typeOperation === 'Retrait' && !typeRetrait) return;

    setLoading(true);
    try {
      const reference = `MM-${new Date().getTime()}`;
      const montantNum = parseFloat(montant);
      const fraisNum = parseFloat(frais);
      const typeDetaille = typeOperation === 'Dépôt' ? typeDepot : typeRetrait;

      const operationData = {
        session_id: sessionId,
        client_id: selectedClient!.id,
        type_operation: typeOperation,
        sous_type_operation: typeDetaille,
        montant: montantNum,
        mode_paiement: operateur,
        type_paiement: 'Mobile Money',
        reference: reference,
        description: `${typeOperation} ${operateur} - ${typeDetaille}`,
        numero_transaction: numeroTransaction,
        numero_telephone: selectedClient!.telephone || selectedClient!.phone,
        client_info: {
          nom: selectedClient!.nom,
          prenom: selectedClient!.prenom,
          telephone: selectedClient!.telephone || selectedClient!.phone
        }
      };

      const mobileMoneyData = {
        session_id: sessionId,
        operateur: operateur,
        numero_telephone: selectedClient!.telephone || selectedClient!.phone,
        numero_transaction: numeroTransaction,
        montant: montantNum,
        frais: fraisNum,
        type_operation: typeOperation,
        statut: 'Validé'
      };

      setOtpData({
        operation: operationData,
        mobileMoney: mobileMoneyData,
        type: 'caisse_mobile_money'
      });

      setShowOTP(true);
    } catch (error: any) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const validerOperation = async (code: string) => {
    try {
      setLoading(true);

      const mmResponse = await fetch('/api/mobile-money-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otpData.mobileMoney)
      });
      if (!mmResponse.ok) throw new Error('Erreur transaction mobile money');

      const opResponse = await fetch('/api/operations-caisse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...otpData.operation,
          montant: String(otpData.operation.montant)
        })
      });
      if (!opResponse.ok) throw new Error('Erreur opération caisse');

      await fetch(`/api/sessions-caisse/${sessionId}/update-solde`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: typeOperation,
          montant: parseFloat(montant)
        })
      });

      setSuccessMessage(`${typeOperation} ${operateur} de ${parseFloat(montant).toLocaleString()} FCFA effectué avec succès !`);

      setTimeout(() => {
        reinitialiserFormulaire();
        onTransactionComplete();
      }, 2000);

    } catch (error: any) {
      console.error('Erreur validation:', error);
    } finally {
      setLoading(false);
      setShowOTP(false);
    }
  };

  const reinitialiserFormulaire = () => {
    setSelectedClient(null);
    setTypeOperation(null);
    setTypeDepot(null);
    setTypeRetrait(null);
    setMontant('');
    setNumeroTransaction('');
    setFrais('0');
    setSearchTerm('');
    setSuccessMessage('');
    setOtpData(null);
  };

  return (
    <div className="flex flex-col justify-center min-h-[calc(100vh-160px)] p-4 font-sans selection:bg-emerald-500/30">
      <div className="w-full max-w-sm mx-auto">
        <Card className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 shadow-2xl shadow-emerald-900/10 rounded-2xl overflow-hidden ring-1 ring-white/5">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 bg-slate-900/50">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <Smartphone size={20} />
              </span>
              Mobile Money
            </h2>
            <p className="text-xs text-slate-400 mt-1 pl-11">Transactions numériques sécurisées</p>
          </div>

          <div className="p-5 space-y-6">
            {successMessage ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
                  <CheckCircle size={32} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Transaction Réussie!</h3>
                <p className="text-emerald-400/90 text-sm">{successMessage}</p>
              </div>
            ) : (
              <>
                {/* Client Search */}
                {!selectedClient ? (
                  <div className="space-y-4 animate-in slide-in-from-right duration-300">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                        <Search size={18} />
                      </div>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && rechercherClient()}
                        placeholder="Rechercher un client..."
                        className="w-full bg-slate-950/50 border border-slate-800 text-white text-sm rounded-xl py-3.5 pl-10 pr-4 placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all outline-none"
                      />
                    </div>
                    <Button 
                      onClick={rechercherClient} 
                      disabled={loading || !searchTerm.trim()}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 rounded-xl font-medium shadow-lg shadow-emerald-500/20 transition-all"
                    >
                      {loading ? <Loader2 size={18} className="animate-spin" /> : 'Rechercher'}
                    </Button>
                    <p className="text-xs text-center text-slate-500">
                      Recherchez par nom, prénom ou numéro de téléphone
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    {/* Selected Client Card */}
                    <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 flex items-start justify-between group">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold text-sm">
                          {selectedClient.nom.charAt(0)}{selectedClient.prenom.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm group-hover:text-emerald-400 transition-colors">
                            {selectedClient.nom} {selectedClient.prenom}
                          </p>
                          <p className="text-xs text-slate-400 font-mono">
                            {selectedClient.telephone || selectedClient.phone}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={reinitialiserFormulaire}
                        className="text-slate-500 hover:text-white transition-colors p-1"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    {/* Operator Selection */}
                    <div className="grid grid-cols-2 gap-3">
                      {operateurs.map((op) => (
                        <div
                          key={op.name}
                          onClick={() => setOperateur(op.name)}
                          className={`
                            cursor-pointer rounded-xl p-3 border transition-all duration-200 relative overflow-hidden
                            ${operateur === op.name 
                              ? `${op.bg} ${op.border} ring-1 ring-offset-0` 
                              : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}
                          `}
                        >
                          <div className="flex flex-col items-center gap-2">
                             {/* Placeholder for Logo if not available, usually an icon */}
                             <div className={`w-8 h-8 rounded-full flex items-center justify-center ${operateur === op.name ? 'bg-white/20' : 'bg-slate-800'}`}>
                                <Smartphone size={16} className={op.color} />
                             </div>
                             <span className={`text-xs font-medium text-center ${operateur === op.name ? 'text-white' : 'text-slate-400'}`}>
                               {op.name.replace(' Mobile Money', '').replace(' Money', '')}
                             </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Operation Type */}
                    <div className="grid grid-cols-2 gap-3">
                      {(['Dépôt', 'Retrait'] as TypeOperation[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setTypeOperation(type)}
                          className={`
                            h-12 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 transition-all
                            ${typeOperation === type
                              ? type === 'Dépôt' 
                                ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                                : 'bg-red-500/10 border-red-500/50 text-red-400'
                              : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800'}
                          `}
                        >
                          {type === 'Dépôt' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                          {type}
                        </button>
                      ))}
                    </div>

                    {/* Sub Type Selection */}
                    {typeOperation && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider ml-1">Type de compte</label>
                        <div className="flex flex-wrap gap-2">
                          {(typeOperation === 'Dépôt' 
                            ? ['Compte Courant', 'Compte Épargne', 'Compte Bloqué', 'Cotisation Tontine', 'Remboursement Crédit'] 
                            : ['Retrait Compte Courant', 'Retrait Épargne', 'Décaissement Crédit', 'Distribution Tontine']
                           ).map((subType: any) => (
                            <button
                              key={subType}
                              onClick={() => typeOperation === 'Dépôt' ? setTypeDepot(subType) : setTypeRetrait(subType)}
                              className={`
                                px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                                ${(typeOperation === 'Dépôt' ? typeDepot : typeRetrait) === subType
                                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                                  : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-600'}
                              `}
                            >
                              {subType}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Amount & Transaction Inputs */}
                    {typeOperation && (typeDepot || typeRetrait) && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                        <div className="space-y-3">
                          <div className="relative">
                            <label className="text-xs text-slate-500 mb-1 block">Montant</label>
                            <input
                              type="number"
                              value={montant}
                              onChange={(e) => setMontant(e.target.value)}
                              placeholder="0"
                              className="w-full bg-slate-950/50 border border-slate-800 text-white text-lg font-bold rounded-xl py-3 pl-4 pr-12 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-700"
                            />
                            <div className="absolute right-4 bottom-3.5 text-xs font-bold text-slate-500">FCFA</div>
                          </div>

                          <div className="relative">
                            <label className="text-xs text-slate-500 mb-1 block">Référence Transaction</label>
                            <input
                              type="text"
                              value={numeroTransaction}
                              onChange={(e) => setNumeroTransaction(e.target.value)}
                              placeholder="ID Transaction (SMS)"
                              className="w-full bg-slate-950/50 border border-slate-800 text-white text-sm rounded-xl py-3 px-4 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-700 font-mono"
                            />
                          </div>

                          <div className="flex items-center gap-4">
                             <div className="flex-1">
                                <label className="text-xs text-slate-500 mb-1 block">Frais (Optionnel)</label>
                                <input
                                  type="number"
                                  value={frais}
                                  onChange={(e) => setFrais(e.target.value)}
                                  className="w-full bg-slate-950/50 border border-slate-800 text-slate-300 text-sm rounded-xl py-2.5 px-4 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                                />
                             </div>
                             {/* Summary Badge */}
                             <div className="flex-1 flex justify-end items-end h-full pb-1">
                                <Badge variant="neutral" className="bg-slate-800/50 border-slate-700 text-slate-400" value={`Total: ${((parseFloat(montant) || 0) + (parseFloat(frais) || 0)).toLocaleString()}`} />
                             </div>
                          </div>
                        </div>

                        <Button
                          onClick={preparerOperation}
                          disabled={loading || !montant || parseFloat(montant) <= 0 || !numeroTransaction}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 rounded-xl font-bold shadow-lg shadow-emerald-500/20 mt-4"
                        >
                          {loading ? <Loader2 className="animate-spin" /> : <div className="flex items-center gap-2"><span>Valider</span> <ArrowRight size={18} /></div>}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {showOTP && otpData && selectedClient && (
        <OTPValidationSimple
          isOpen={showOTP}
          onClose={() => setShowOTP(false)}
          onValidate={(isValid) => {
            if (isValid) {
              validerOperation('valid');
            }
          }}
          phoneNumber={selectedClient.telephone || selectedClient.phone || ''}
          generatedCode="123456"
          operationType={`${typeOperation} ${operateur}`}
          amount={parseFloat(montant)}
        />
      )}
    </div>
  );
}
