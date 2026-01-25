import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, ArrowLeftRight, Lock } from 'lucide-react';
import { compteEpargneApi } from '../../../lib/api-client';
import { getAccountBalance, getAccountUiConfig } from '../../../lib/account-config';
import { toast } from '../../../lib/toast';
import { Button, Card, FormField, SearchableSelect, SelectField, Switch, TabGroup } from '../../ui';

interface Compte {
  id: string;
  numero_compte?: string;
  numeroCompte?: string;
  type_compte?: string;
  typeCompte?: string;
  solde?: number;
  solde_courant?: number | string;
  soldeCourant?: number | string;
  statut?: string;
  blocage_actif?: boolean;
  blocageActif?: boolean;
  client_id?: string;
  clientId?: string;
  clients?: {
    nom: string;
    prenom?: string;
  } | null;
}

type DestinationTab = 'own' | 'beneficiary';
type Frequency = 'once' | 'daily' | 'weekly' | 'monthly';

const frequencyOptions = [
  { value: 'once', label: 'Une fois' },
  { value: 'daily', label: 'Tous les jours' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuel' },
];

const formatAccountNumber = (compte: Compte) => compte.numero_compte || compte.numeroCompte || '';

const formatClientName = (compte: Compte) =>
  compte.clients ? `${compte.clients.nom} ${compte.clients.prenom || ''}`.trim() : 'Client';

export default function TransactionFlow() {
  const [accounts, setAccounts] = useState<Compte[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationTab, setDestinationTab] = useState<DestinationTab>('own');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [beneficiaryAccountNumber, setBeneficiaryAccountNumber] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryStatus, setBeneficiaryStatus] = useState<'idle' | 'loading' | 'found' | 'not_found'>('idle');
  const [amount, setAmount] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>('once');
  const [unlocking, setUnlocking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true);
      try {
        const result = await compteEpargneApi.getAll({ page: 1, limit: 200 });
        setAccounts(Array.isArray(result.data) ? result.data : []);
      } catch (error) {
        toast.error('Erreur lors du chargement des comptes');
        setAccounts([]);
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, []);

  const sourceAccount = useMemo(
    () => accounts.find((account) => account.id === sourceAccountId),
    [accounts, sourceAccountId]
  );

  const sourceConfig = sourceAccount ? getAccountUiConfig(sourceAccount, 'staff') : null;
  const sourceClientId = sourceAccount?.client_id || sourceAccount?.clientId;

  const ownAccounts = useMemo(() => {
    if (!sourceClientId) return [];
    return accounts.filter((account) => (account.client_id || account.clientId) === sourceClientId);
  }, [accounts, sourceClientId]);

  useEffect(() => {
    setDestinationAccountId('');
    setBeneficiaryAccountNumber('');
    setBeneficiaryName('');
    setBeneficiaryStatus('idle');
  }, [destinationTab, sourceAccountId]);

  useEffect(() => {
    const trimmed = beneficiaryAccountNumber.trim();
    if (!trimmed || trimmed.length < 4) {
      setBeneficiaryStatus('idle');
      setBeneficiaryName('');
      return;
    }

    setBeneficiaryStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const result = await compteEpargneApi.checkAccountNumber(trimmed);
        setBeneficiaryName(result.ownerName || '');
        setBeneficiaryStatus('found');
      } catch (error) {
        setBeneficiaryName('');
        setBeneficiaryStatus('not_found');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [beneficiaryAccountNumber]);

  const sourceOptions = useMemo(() => {
    return accounts.map((account) => {
      const uiConfig = getAccountUiConfig(account, 'staff');
      const balance = getAccountBalance(account);
      const label = `${formatAccountNumber(account)} • ${uiConfig.type}`;
      const subLabel = `${formatClientName(account)} • ${balance.toLocaleString('fr-FR')} FCFA`;

      return {
        value: account.id,
        label,
        subLabel,
        disabled: !uiConfig.canTransferOut,
        disabledReason: uiConfig.isLocked ? 'Bloqué' : uiConfig.statusLabel,
      };
    });
  }, [accounts]);

  const destinationOptions = useMemo(() => {
    return ownAccounts.map((account) => {
      const uiConfig = getAccountUiConfig(account, 'staff');
      const balance = getAccountBalance(account);
      const label = `${formatAccountNumber(account)} • ${uiConfig.type}`;
      const subLabel = `${formatClientName(account)} • ${balance.toLocaleString('fr-FR')} FCFA`;
      const isSource = account.id === sourceAccountId;

      return {
        value: account.id,
        label,
        subLabel,
        disabled: isSource || !uiConfig.canReceive,
        disabledReason: isSource ? 'Compte source' : uiConfig.statusLabel,
      };
    });
  }, [ownAccounts, sourceAccountId]);

  const canSubmit =
    sourceAccount &&
    sourceConfig?.canTransferOut &&
    parseFloat(amount) > 0 &&
    (destinationTab === 'own'
      ? Boolean(destinationAccountId)
      : beneficiaryStatus === 'found');

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        sourceCompteId: sourceAccountId,
        destinationCompteId: destinationTab === "own" ? destinationAccountId : undefined,
        destinationAccountNumber:
          destinationTab === "beneficiary" ? beneficiaryAccountNumber.trim() : undefined,
        montant: Number(amount),
        scheduled: scheduled,
        frequence: scheduled ? frequency : undefined,
      };

      const result = await compteEpargneApi.createTransfer(payload);
      if (result?.scheduled) {
        const nextExecution = result.schedule?.prochaine_execution || result.schedule?.prochaineExecution;
        toast.success(
          nextExecution
            ? `Virement programme. Prochaine execution: ${new Date(nextExecution).toLocaleString('fr-FR')}`
            : 'Virement programme avec succes.'
        );
      } else {
        toast.success('Virement execute avec succes.');
      }

      setAmount('');
      setDestinationAccountId('');
      setBeneficiaryAccountNumber('');
      setBeneficiaryName('');
      setBeneficiaryStatus('idle');
      setScheduled(false);
      setFrequency('once');
    } catch (error: any) {
      toast.error(error?.message || 'Erreur lors du virement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlock = async () => {
    if (!sourceAccount || !sourceConfig?.canUnlock) return;
    setUnlocking(true);
    try {
      await compteEpargneApi.debloquer(sourceAccount.id, { motif: 'Déblocage via virement' });
      toast.success('Compte débloqué');
      const result = await compteEpargneApi.getAll({ page: 1, limit: 200 });
      setAccounts(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      toast.error('Impossible de débloquer ce compte');
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <Card className="flex flex-col h-full bg-slate-900 border-slate-800 p-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-cyan-400" />
            Moteur de Transaction Unifié
          </h2>
          <p className="text-xs text-slate-400">Virements internes et bénéficiaires.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Account Flow */}
          <div className="space-y-4">
              <SearchableSelect
                label="Compte source"
                name="source_account"
                options={sourceOptions}
                value={sourceAccountId}
                onChange={(value) => setSourceAccountId(String(value))}
                isLoading={loadingAccounts}
                placeholder="Sélectionner un compte"
              />

              {sourceAccount && sourceConfig && !sourceConfig.canTransferOut && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200 flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Fonds bloqués.</p>
                    {sourceConfig.canUnlock && (
                      <button
                        type="button"
                        onClick={handleUnlock}
                        disabled={unlocking}
                        className="mt-1 inline-flex items-center gap-1 font-semibold text-amber-100 hover:text-white underline"
                      >
                        <Lock size={12} />
                        {unlocking ? '...' : 'Débloquer'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <TabGroup
                  activeTab={destinationTab}
                  onTabChange={(key) => setDestinationTab(key as DestinationTab)}
                  tabs={[
                    { key: 'own', label: 'Mes Comptes' },
                    { key: 'beneficiary', label: 'Bénéficiaire' },
                  ]}
                  variant="pills"
                  size="sm"
                  className="w-full"
                />

                {destinationTab === 'own' ? (
                  <SearchableSelect
                    label="Compte destinataire"
                    name="destination_account"
                    options={destinationOptions}
                    value={destinationAccountId}
                    onChange={(value) => setDestinationAccountId(String(value))}
                    placeholder="Sélectionner un compte"
                    disabled={!sourceAccount}
                  />
                ) : (
                  <div className="space-y-2">
                    <FormField
                      label="N° Compte Bénéficiaire"
                      name="beneficiary_account"
                      value={beneficiaryAccountNumber}
                      onChange={(e) => setBeneficiaryAccountNumber(e.target.value)}
                      placeholder="Ex: CC-034..."
                    />

                    <div className="h-5">
                      {beneficiaryStatus === 'loading' && (
                        <p className="text-xs text-slate-400">Vérification...</p>
                      )}
                      {beneficiaryStatus === 'found' && (
                        <div className="flex items-center gap-2 text-xs text-emerald-300 font-medium">
                          <CheckCircle2 size={14} />
                          <span>{beneficiaryName}</span>
                        </div>
                      )}
                      {beneficiaryStatus === 'not_found' && (
                        <div className="flex items-center gap-2 text-xs text-red-400">
                          <AlertCircle size={14} />
                          <span>Introuvable</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
          </div>

          {/* Right Column: Transaction Details */}
          <div className="space-y-4 flex flex-col h-full">
               <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Montant (FCFA)"
                    name="amount"
                    type="number"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="font-mono"
                  />
                  <SelectField
                    label="Fréquence"
                    name="frequency"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as Frequency)}
                    options={frequencyOptions}
                    disabled={!scheduled}
                  />
               </div>

               <div className="flex items-center justify-between rounded border border-slate-700 bg-slate-800/30 px-3 py-2">
                 <div>
                   <p className="text-sm font-medium text-white">Virement programmé</p>
                   <p className="text-[10px] text-slate-400">Planifier une récurrence</p>
                 </div>
                 <Switch checked={scheduled} onChange={setScheduled} ariaLabel="Programmer" />
               </div>

               <div className="pt-2 mt-auto">
                 <Button
                   onClick={handleSubmit}
                   disabled={!canSubmit || submitting}
                   className="w-full h-10"
                   variant="primary"
                 >
                   {submitting ? 'Traitement...' : 'Lancer le virement'}
                 </Button>
               </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
