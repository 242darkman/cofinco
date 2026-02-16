import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, AlertCircle, ArrowLeftRight, Lock,
  ArrowDown, Send, FileText, Shield
} from 'lucide-react';
import { compteEpargneApi } from '../../../lib/api-client';
import { getAccountBalance, getAccountUiConfig } from '../../../lib/account-config';
import { toast } from '../../../lib/toast';
import { currencySymbol, formatMoney } from '@shared/config/currency';
import { Badge, Button, FormField, SearchableSelect, SelectField, Switch, TabGroup } from '../../ui';

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

const formatAccountNumber = (compte: Compte) => compte.numeroCompte || '';

const formatClientName = (compte: Compte) =>
  compte.clients ? `${compte.clients.nom} ${compte.clients.prenom || ''}`.trim() : 'Client';

function StepHeader({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-2 sm:gap-2.5 mb-2 sm:mb-3">
      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-accent/10 flex items-center justify-center text-[10px] sm:text-[11px] font-bold text-accent">
        {number}
      </div>
      <h3 className="text-sm font-semibold text-content-primary">{title}</h3>
    </div>
  );
}

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
  const sourceClientId = sourceAccount?.clientId;

  const ownAccounts = useMemo(() => {
    if (!sourceClientId) return [];
    return accounts.filter((account) => account.clientId === sourceClientId);
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
      const subLabel = `${formatClientName(account)} • ${formatMoney(balance)}`;

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
      const subLabel = `${formatClientName(account)} • ${formatMoney(balance)}`;
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

  // Summary computed values
  const sourceBalance = sourceAccount ? getAccountBalance(sourceAccount) : 0;
  const parsedAmount = parseFloat(amount) || 0;
  const balanceAfter = sourceBalance - parsedAmount;
  const isInsufficientBalance = !!sourceAccount && parsedAmount > 0 && balanceAfter < 0;

  const destinationAccount = useMemo(
    () => accounts.find(a => a.id === destinationAccountId),
    [accounts, destinationAccountId]
  );

  const hasDestination = destinationTab === 'own' ? !!destinationAccountId : beneficiaryStatus === 'found';
  const isFormComplete = !!sourceAccount && hasDestination && parsedAmount > 0;

  const canSubmit =
    sourceAccount &&
    sourceConfig?.canTransferOut &&
    parseFloat(amount) > 0 &&
    !isInsufficientBalance &&
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
            ? `Virement programmé. Prochaine exécution: ${new Date(nextExecution).toLocaleString('fr-FR')}`
            : 'Virement programmé avec succès.'
        );
      } else {
        toast.success('Virement exécuté avec succès.');
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

  const submitLabel = submitting
    ? 'Traitement en cours...'
    : scheduled
      ? 'Programmer le virement'
      : 'Confirmer et exécuter';

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden">
      {/* Scrollable form area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-3 sm:p-4 md:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 sm:gap-6 lg:gap-8">

            {/* ── Left Column: Form ── */}
            <div className="lg:col-span-3 space-y-5 sm:space-y-6 lg:space-y-8">

              {/* Step 1: Source Account */}
              <section>
                <StepHeader number={1} title="Compte source" />

                <SearchableSelect
                  label="Sélectionner le compte à débiter"
                  name="source_account"
                  options={sourceOptions}
                  value={sourceAccountId}
                  onChange={(value) => setSourceAccountId(String(value))}
                  isLoading={loadingAccounts}
                  placeholder="Rechercher par numéro ou nom du client..."
                />

                {sourceAccount && sourceConfig && (
                  <div className="mt-2.5 sm:mt-3 flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-surface border border-edge transition-all">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-content-muted font-medium">Solde disponible</p>
                      <p className={`text-base sm:text-lg font-bold ${sourceBalance > 0 ? 'text-content-primary' : 'text-status-danger'}`}>
                        {formatMoney(sourceBalance, { showCurrency: false })} <span className="text-xs font-normal text-content-muted">{currencySymbol()}</span>
                      </p>
                    </div>
                    <Badge value={sourceConfig.type} variant="primary" size="sm" />
                  </div>
                )}

                {sourceAccount && sourceConfig && !sourceConfig.canTransferOut && (
                  <div className="mt-2 rounded-lg border border-status-warning/30 bg-status-warning-bg p-3 text-xs text-status-warning-text flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Ce compte est bloqué pour les virements sortants.</p>
                      {sourceConfig.canUnlock && (
                        <button
                          type="button"
                          onClick={handleUnlock}
                          disabled={unlocking}
                          className="mt-1.5 inline-flex items-center gap-1 font-semibold hover:text-content-primary underline transition-colors"
                        >
                          <Lock size={12} />
                          {unlocking ? 'Déblocage...' : 'Débloquer ce compte'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Step 2: Destination */}
              <section className={!sourceAccount ? 'opacity-40 pointer-events-none select-none' : ''}>
                <StepHeader number={2} title="Destinataire" />

                {!sourceAccount ? (
                  <p className="text-xs text-content-muted italic">Sélectionnez d'abord un compte source</p>
                ) : (
                  <>
                    <TabGroup
                      activeTab={destinationTab}
                      onTabChange={(key) => setDestinationTab(key as DestinationTab)}
                      tabs={[
                        { key: 'own', label: 'Mes Comptes' },
                        { key: 'beneficiary', label: 'Bénéficiaire' },
                      ]}
                      variant="pills"
                      size="sm"
                      className="w-full mb-3"
                    />

                    {destinationTab === 'own' ? (
                      <SearchableSelect
                        label="Compte à créditer"
                        name="destination_account"
                        options={destinationOptions}
                        value={destinationAccountId}
                        onChange={(value) => setDestinationAccountId(String(value))}
                        placeholder="Sélectionner un compte du même client"
                      />
                    ) : (
                      <div className="space-y-2">
                        <FormField
                          label="Numéro de compte du bénéficiaire"
                          name="beneficiary_account"
                          value={beneficiaryAccountNumber}
                          onChange={(e) => setBeneficiaryAccountNumber(e.target.value)}
                          placeholder="Ex: CC-034..."
                        />

                        <div className="h-6 flex items-center">
                          {beneficiaryStatus === 'loading' && (
                            <p className="text-xs text-content-muted animate-pulse">Vérification du compte...</p>
                          )}
                          {beneficiaryStatus === 'found' && (
                            <div className="flex items-center gap-2 text-xs text-status-success font-medium">
                              <CheckCircle2 size={14} />
                              <span>{beneficiaryName}</span>
                            </div>
                          )}
                          {beneficiaryStatus === 'not_found' && (
                            <div className="flex items-center gap-2 text-xs text-status-danger">
                              <AlertCircle size={14} />
                              <span>Compte introuvable. Vérifiez le numéro.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* Step 3: Amount & Options */}
              <section>
                <StepHeader number={3} title="Montant & options" />

                <div className="space-y-4">
                  {/* Premium amount input */}
                  <div>
                    <label className="block text-xs font-semibold text-content-secondary mb-1.5">Montant du virement</label>
                    <div className={`relative flex items-center rounded-xl border-2 transition-colors overflow-hidden ${
                      isInsufficientBalance
                        ? 'border-status-danger/50 bg-status-danger-bg/30'
                        : 'border-edge bg-surface focus-within:border-accent'
                    }`}>
                      <input
                        type="number"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent px-3 sm:px-4 py-3 sm:py-4 text-xl sm:text-2xl font-bold text-content-primary text-center outline-none placeholder:text-content-muted/30 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="absolute right-4 text-sm font-semibold text-content-muted pointer-events-none">{currencySymbol()}</span>
                    </div>
                  </div>

                  {/* Insufficient balance warning */}
                  {isInsufficientBalance && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-status-danger-bg border border-status-danger/20 text-xs text-status-danger">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>Solde insuffisant. Il manque <strong>{formatMoney(Math.abs(balanceAfter))}</strong></span>
                    </div>
                  )}

                  {/* Scheduled toggle */}
                  <div className="flex items-center justify-between rounded-xl border border-edge bg-surface px-3 sm:px-4 py-2.5 sm:py-3">
                    <div>
                      <p className="text-sm font-medium text-content-primary">Virement programmé</p>
                      <p className="text-[10px] text-content-muted">Planifier une exécution récurrente</p>
                    </div>
                    <Switch checked={scheduled} onChange={setScheduled} ariaLabel="Programmer le virement" />
                  </div>

                  {/* Frequency selector (animated reveal) */}
                  {scheduled && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                      <SelectField
                        label="Fréquence d'exécution"
                        name="frequency"
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as Frequency)}
                        options={frequencyOptions}
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* ── Right Column: Summary Panel ── */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-4 space-y-3">
                <div className={`rounded-xl border bg-surface p-3.5 sm:p-5 space-y-3 sm:space-y-4 transition-colors ${
                  isFormComplete && !isInsufficientBalance ? 'border-accent/30' : 'border-edge'
                }`}>
                  <h3 className="font-semibold text-sm text-content-primary flex items-center gap-2">
                    <FileText size={16} className="text-accent" />
                    Résumé du virement
                  </h3>

                  {!isFormComplete ? (
                    /* Empty state */
                    <div className="text-center py-6 sm:py-10">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-3 sm:mb-4 rounded-full bg-surface-subtle flex items-center justify-center">
                        <ArrowLeftRight size={22} className="text-content-muted" />
                      </div>
                      <p className="text-sm text-content-muted">Remplissez le formulaire</p>
                      <p className="text-xs text-content-muted mt-1">Le résumé apparaîtra ici</p>
                    </div>
                  ) : (
                    /* Full summary */
                    <>
                      {/* Source → Destination flow */}
                      <div className="space-y-1.5">
                        {/* Source (debit) */}
                        <div className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-status-danger-bg/50">
                          <div className="w-8 h-8 rounded-full bg-status-danger/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-status-danger">D</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-content-muted uppercase tracking-wide">Débit</p>
                            <p className="text-sm font-semibold text-content-primary truncate">{formatAccountNumber(sourceAccount!)}</p>
                            <p className="text-xs text-content-muted truncate">{formatClientName(sourceAccount!)}</p>
                          </div>
                        </div>

                        <div className="flex justify-center py-0.5">
                          <ArrowDown size={16} className="text-content-muted" />
                        </div>

                        {/* Destination (credit) */}
                        <div className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-status-success-bg/50">
                          <div className="w-8 h-8 rounded-full bg-status-success/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-status-success">C</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-content-muted uppercase tracking-wide">Crédit</p>
                            <p className="text-sm font-semibold text-content-primary truncate">
                              {destinationTab === 'own' && destinationAccount
                                ? formatAccountNumber(destinationAccount)
                                : beneficiaryAccountNumber}
                            </p>
                            <p className="text-xs text-content-muted truncate">
                              {destinationTab === 'own' && destinationAccount
                                ? formatClientName(destinationAccount)
                                : beneficiaryName}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Transaction details */}
                      <div className="border-t border-edge pt-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-content-muted">Montant</span>
                          <span className="text-base font-bold text-content-primary">{formatMoney(parsedAmount)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-content-muted">Frais</span>
                          <span className="text-xs font-medium text-status-success">Aucun</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-content-muted">Type</span>
                          <Badge
                            value={destinationTab === 'own' ? 'Interne' : 'Tiers'}
                            variant={destinationTab === 'own' ? 'info' : 'primary'}
                            size="xs"
                            rawValue
                          />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-content-muted">Exécution</span>
                          <span className="text-xs font-medium text-content-primary">
                            {scheduled ? frequencyOptions.find(f => f.value === frequency)?.label : 'Immédiate'}
                          </span>
                        </div>
                        {scheduled && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-content-muted">Mode</span>
                            <Badge value="Programmé" variant="warning" size="xs" rawValue />
                          </div>
                        )}
                      </div>

                      {/* Balance after operation */}
                      <div className="border-t border-edge pt-4">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-content-muted">Solde après opération</span>
                          <span className={`text-sm font-bold ${isInsufficientBalance ? 'text-status-danger' : 'text-status-success'}`}>
                            {formatMoney(balanceAfter)}
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Security indicator */}
                <div className="flex items-center justify-center gap-1.5 py-1">
                  <Shield size={11} className="text-content-muted" />
                  <span className="text-[10px] text-content-muted">Transaction sécurisée et chiffrée</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom: Submit */}
      <div className="shrink-0 px-3 sm:px-4 py-2.5 sm:py-3 border-t border-edge bg-surface">
        <div>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full h-11 sm:h-12 text-sm"
            variant="primary"
            icon={Send}
            isLoading={submitting}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
