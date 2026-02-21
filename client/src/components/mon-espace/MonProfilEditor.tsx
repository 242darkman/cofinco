import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUpdateMyProfile } from '../../hooks/hr/useMonEspace';
import { Card, Button, FormField, SelectField } from '../ui';
import { Users, CreditCard, Save } from 'lucide-react';

const SITUATION_FAMILIALE_OPTIONS = [
  { value: 'CELIBATAIRE', label: 'Celibataire' },
  { value: 'MARIE', label: 'Marie(e)' },
  { value: 'VEUF', label: 'Veuf/Veuve' },
  { value: 'DIVORCE', label: 'Divorce(e)' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'CASH', label: 'Especes' },
  { value: 'TRANSFER', label: 'Virement bancaire' },
  { value: 'MOBILE_MONEY', label: 'Mobile Money' },
  { value: 'CHECK', label: 'Cheque' },
];

export default function MonProfilEditor() {
  const { updateProfile, isUpdating } = useUpdateMyProfile();

  const { data: empData } = useQuery<any>({
    queryKey: ['/api/hr/my/profile-data'],
    queryFn: () =>
      fetch('/api/hr/my/profile', { credentials: 'include' })
        .then((r) => r.json())
        .catch(() => null),
  });

  // Family info
  const [situationFamiliale, setSituationFamiliale] = useState('');
  const [nombreEnfants, setNombreEnfants] = useState(0);

  // Bank info
  const [paymentMethod, setPaymentMethod] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [accountKey, setAccountKey] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');

  useEffect(() => {
    if (empData) {
      setSituationFamiliale(empData.situationFamiliale || '');
      setNombreEnfants(empData.nombreEnfantsCharge || 0);
      setPaymentMethod(empData.paymentMethod || '');
      setBankName(empData.bankName || '');
      setBankCode(empData.bankCode || '');
      setBranchCode(empData.branchCode || '');
      setBankAccountNumber(empData.bankAccountNumber || '');
      setAccountKey(empData.accountKey || '');
      setPaymentDetails(empData.paymentDetails || '');
    }
  }, [empData]);

  const handleSave = async () => {
    await updateProfile({
      situationFamiliale: situationFamiliale || undefined,
      nombreEnfantsCharge: nombreEnfants,
      paymentMethod: paymentMethod || undefined,
      bankName: bankName || undefined,
      bankCode: bankCode || undefined,
      branchCode: branchCode || undefined,
      bankAccountNumber: bankAccountNumber || undefined,
      accountKey: accountKey || undefined,
      paymentDetails: paymentDetails || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Situation familiale */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <Users className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-base font-bold text-content-primary">Situation familiale</h3>
        </div>

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
            label="Nombre d'enfants a charge"
            name="nombreEnfants"
            type="number"
            min={0}
            value={nombreEnfants}
            onChange={(e) => setNombreEnfants(parseInt(e.target.value) || 0)}
          />
        </div>
      </Card>

      {/* Coordonnees bancaires */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <CreditCard className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-base font-bold text-content-primary">Coordonnees bancaires</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SelectField
            label="Mode de paiement"
            name="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={PAYMENT_METHOD_OPTIONS}
            placeholder="Selectionner..."
          />
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

        <div className="mt-3">
          <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-1.5">
            Details de paiement
          </label>
          <textarea
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            placeholder="Numero Mobile Money, informations complementaires..."
            rows={2}
            className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
          />
        </div>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={Save}
          onClick={handleSave}
          isLoading={isUpdating}
          size="sm"
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
