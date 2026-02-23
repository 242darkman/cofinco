import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUpdateMyProfile } from '../../hooks/hr/useMonEspace';
import { useUserProfile } from '../../hooks/useUserProfile';
import { Button, FormField, SelectField } from '../ui';
import { Users, Wallet, Save, Banknote, Smartphone, Building2, FileCheck, Pencil, X } from 'lucide-react';
import { formatPhoneNumber } from '../../lib/format';

const SITUATION_FAMILIALE_OPTIONS = [
  { value: 'CELIBATAIRE', label: 'Celibataire' },
  { value: 'MARIE', label: 'Marie(e)' },
  { value: 'VEUF', label: 'Veuf/Veuve' },
  { value: 'DIVORCE', label: 'Divorce(e)' },
];

const SITUATION_LABELS: Record<string, string> = Object.fromEntries(
  SITUATION_FAMILIALE_OPTIONS.map(o => [o.value, o.label]),
);

const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Especes' },
  { value: 'TRANSFER', label: 'Virement bancaire' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CHECK', label: 'Cheque' },
];

const PAYMENT_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map(o => [o.value, o.label]),
);

const PAYMENT_ICONS: Record<string, React.ElementType> = {
  CASH: Banknote,
  TRANSFER: Building2,
  MOBILE_MONEY: Smartphone,
  CHECK: FileCheck,
};

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-content-muted uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-content-primary font-medium">{value || '—'}</p>
    </div>
  );
}

export default function MonProfilEditor() {
  const { updateProfile, isUpdating } = useUpdateMyProfile();
  const { user } = useUserProfile();

  const { data: empData } = useQuery<any>({
    queryKey: ['/api/hr/my/profile'],
    queryFn: async () => {
      const r = await fetch('/api/hr/my/profile', { credentials: 'include' });
      if (!r.ok) return null;
      return r.json();
    },
  });

  // Edit mode per section
  const [editingFamily, setEditingFamily] = useState(false);
  const [editingPayment, setEditingPayment] = useState(false);

  // Family info
  const [situationFamiliale, setSituationFamiliale] = useState('');
  const [nombreEnfants, setNombreEnfants] = useState(0);

  // Bank info
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [accountKey, setAccountKey] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');

  // Sync from server data
  useEffect(() => {
    if (empData) {
      setSituationFamiliale(empData.situationFamiliale || '');
      setNombreEnfants(empData.nombreEnfantsCharge || 0);
      setPaymentMethod(empData.paymentMethod || 'CASH');
      setBankName(empData.bankName || '');
      setBankCode(empData.bankCode || '');
      setBranchCode(empData.branchCode || '');
      setBankAccountNumber(empData.bankAccountNumber || '');
      setAccountKey(empData.accountKey || '');
      setPaymentDetails(empData.paymentDetails || '');
    }
  }, [empData]);

  const resetFamily = () => {
    setSituationFamiliale(empData?.situationFamiliale || '');
    setNombreEnfants(empData?.nombreEnfantsCharge || 0);
    setEditingFamily(false);
  };

  const resetPayment = () => {
    setPaymentMethod(empData?.paymentMethod || 'CASH');
    setBankName(empData?.bankName || '');
    setBankCode(empData?.bankCode || '');
    setBranchCode(empData?.branchCode || '');
    setBankAccountNumber(empData?.bankAccountNumber || '');
    setAccountKey(empData?.accountKey || '');
    setPaymentDetails(empData?.paymentDetails || '');
    setEditingPayment(false);
  };

  const handleSaveFamily = async () => {
    await updateProfile({
      situationFamiliale: situationFamiliale || undefined,
      nombreEnfantsCharge: nombreEnfants,
    });
    setEditingFamily(false);
  };

  const handleSavePayment = async () => {
    await updateProfile({
      paymentMethod: paymentMethod || 'CASH',
      bankName: paymentMethod === 'TRANSFER' ? bankName || undefined : undefined,
      bankCode: paymentMethod === 'TRANSFER' ? bankCode || undefined : undefined,
      branchCode: paymentMethod === 'TRANSFER' ? branchCode || undefined : undefined,
      bankAccountNumber: paymentMethod === 'TRANSFER' ? bankAccountNumber || undefined : undefined,
      accountKey: paymentMethod === 'TRANSFER' ? accountKey || undefined : undefined,
      paymentDetails: paymentDetails || undefined,
    });
    setEditingPayment(false);
  };

  // Derived display values
  const PayIcon = PAYMENT_ICONS[paymentMethod] || Wallet;

  return (
    <div className="space-y-4">
      {/* Situation familiale */}
      <div className="bg-surface-base border border-edge rounded-xl p-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-edge mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-accent/10 rounded-lg">
              <Users size={15} className="text-accent" />
            </div>
            <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
              Situation familiale
            </h3>
          </div>
          {!editingFamily && (
            <button
              onClick={() => setEditingFamily(true)}
              className="flex items-center gap-1 text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              <Pencil size={11} />
              Modifier
            </button>
          )}
        </div>

        {editingFamily ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                label="Situation familiale"
                name="situationFamiliale"
                value={situationFamiliale}
                onChange={(e) => setSituationFamiliale(e.target.value)}
                options={SITUATION_FAMILIALE_OPTIONS}
                placeholder="Selectionner..."
              />
              <FormField
                label="Nombre de personnes a charge"
                name="nombreEnfants"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={nombreEnfants}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setNombreEnfants(v === '' ? 0 : parseInt(v, 10));
                }}
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <Button size="sm" variant="outline" icon={X} onClick={resetFamily}>
                Annuler
              </Button>
              <Button size="sm" variant="primary" icon={Save} onClick={handleSaveFamily} isLoading={isUpdating}>
                Enregistrer
              </Button>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ReadOnlyField label="Situation familiale" value={SITUATION_LABELS[situationFamiliale] || situationFamiliale} />
            <ReadOnlyField label="Nombre de personnes a charge" value={String(nombreEnfants)} />
          </div>
        )}
      </div>

      {/* Versement du salaire */}
      <div className="bg-surface-base border border-edge rounded-xl p-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-edge mb-1.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-status-info/10 rounded-lg">
              <Wallet size={15} className="text-status-info" />
            </div>
            <h3 className="text-xs font-bold text-content-secondary uppercase tracking-wider">
              Versement du salaire
            </h3>
          </div>
          {!editingPayment && (
            <button
              onClick={() => setEditingPayment(true)}
              className="flex items-center gap-1 text-[10px] font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              <Pencil size={11} />
              Modifier
            </button>
          )}
        </div>

        {editingPayment ? (
          <>
            <p className="text-[11px] text-content-muted mb-3">
              Choisissez comment vous souhaitez recevoir votre salaire. Ce choix sera applique lors de chaque paiement.
            </p>

            {/* Payment method selector as visual cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {PAYMENT_METHOD_OPTIONS.map((opt) => {
                const Icon = PAYMENT_ICONS[opt.value] || Wallet;
                const isSelected = paymentMethod === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPaymentMethod(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all duration-150 ${
                      isSelected
                        ? 'border-accent bg-accent/5 shadow-sm'
                        : 'border-edge hover:border-edge hover:bg-surface-subtle'
                    }`}
                  >
                    <Icon
                      size={20}
                      className={isSelected ? 'text-accent' : 'text-content-muted'}
                    />
                    <span
                      className={`text-[11px] font-semibold leading-tight text-center ${
                        isSelected ? 'text-accent' : 'text-content-secondary'
                      }`}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic content based on payment method */}
            {paymentMethod === 'CASH' && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-status-warning-bg/50 border border-status-warning/20">
                <Banknote size={16} className="text-status-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-status-warning">Paiement en especes</p>
                  <p className="text-[11px] text-content-secondary mt-0.5">
                    Votre salaire sera verse directement en caisse. Presentez-vous au guichet avec votre piece d'identite le jour du paiement.
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'MOBILE_MONEY' && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-status-info-bg/50 border border-status-info/20">
                <Smartphone size={16} className="text-status-info shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-status-info">Paiement par Mobile Money</p>
                  <p className="text-[11px] text-content-secondary mt-0.5">
                    Le virement sera effectue sur le numero de telephone associe a votre profil
                    {user?.telephone ? (
                      <span className="font-semibold text-content-primary"> ({formatPhoneNumber(user.telephone)})</span>
                    ) : (
                      <span className="text-status-warning font-medium"> — aucun numero renseigne, veuillez mettre a jour votre profil</span>
                    )}.
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'CHECK' && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent/5 border border-accent/20">
                <FileCheck size={16} className="text-accent shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-accent">Paiement par cheque</p>
                  <p className="text-[11px] text-content-secondary mt-0.5">
                    Un cheque sera emis a votre nom. Vous serez notifie lorsqu'il sera disponible au retrait.
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'TRANSFER' && (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-status-success-bg/50 border border-status-success/20">
                  <Building2 size={16} className="text-status-success shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-status-success">Virement bancaire</p>
                    <p className="text-[11px] text-content-secondary mt-0.5">
                      Renseignez vos coordonnees bancaires ci-dessous pour recevoir votre salaire par virement.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <FormField
                    label="Banque"
                    name="bankName"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Nom de la banque"
                  />
                  <FormField
                    label="Code banque"
                    name="bankCode"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    placeholder="Code banque"
                  />
                  <FormField
                    label="Code agence"
                    name="branchCode"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    placeholder="Code agence"
                  />
                  <FormField
                    label="N. de compte"
                    name="bankAccountNumber"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value)}
                    placeholder="Numero de compte"
                  />
                  <FormField
                    label="Cle RIB"
                    name="accountKey"
                    value={accountKey}
                    onChange={(e) => setAccountKey(e.target.value)}
                    placeholder="Cle RIB"
                  />
                </div>
              </div>
            )}

            {/* Additional payment details */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-content-secondary mb-1.5">
                Informations complementaires
              </label>
              <textarea
                value={paymentDetails}
                onChange={(e) => setPaymentDetails(e.target.value)}
                placeholder="Precisions supplementaires (optionnel)..."
                rows={2}
                className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
              />
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <Button size="sm" variant="outline" icon={X} onClick={resetPayment}>
                Annuler
              </Button>
              <Button size="sm" variant="primary" icon={Save} onClick={handleSavePayment} isLoading={isUpdating}>
                Enregistrer
              </Button>
            </div>
          </>
        ) : (
          /* Read-only payment view */
          <div className="mt-2 space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-subtle border border-edge-subtle">
              <div className="p-2 bg-accent/10 rounded-lg">
                <PayIcon size={18} className="text-accent" />
              </div>
              <div>
                <p className="text-xs font-semibold text-content-primary">
                  {PAYMENT_LABELS[paymentMethod] || paymentMethod}
                </p>
                <p className="text-[10px] text-content-muted">Mode de reception actuel</p>
              </div>
            </div>

            {paymentMethod === 'TRANSFER' && (bankName || bankAccountNumber) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {bankName && <ReadOnlyField label="Banque" value={bankName} />}
                {bankCode && <ReadOnlyField label="Code banque" value={bankCode} />}
                {branchCode && <ReadOnlyField label="Code agence" value={branchCode} />}
                {bankAccountNumber && <ReadOnlyField label="N. de compte" value={bankAccountNumber} />}
                {accountKey && <ReadOnlyField label="Cle RIB" value={accountKey} />}
              </div>
            )}

            {paymentDetails && (
              <ReadOnlyField label="Informations complementaires" value={paymentDetails} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
