import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUpdateMyProfile } from '../../hooks/hr/useMonEspace';
import { Card, Button, FormField, SelectField } from '../ui';
import { User, Building2, CreditCard, Save, Info } from 'lucide-react';

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

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatFCFA(value: number | string | null | undefined): string {
  if (value == null) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString('fr-FR') + ' FCFA';
}

export default function MonProfilEditor() {
  const { updateProfile, isUpdating } = useUpdateMyProfile();

  const { data: profile } = useQuery<any>({
    queryKey: ['/api/user/profile'],
    queryFn: () =>
      fetch('/api/user/profile', { credentials: 'include' }).then((r) => r.json()),
  });

  const { data: empData } = useQuery<any>({
    queryKey: ['/api/hr/my/profile-data'],
    queryFn: () =>
      fetch('/api/hr/my/profile', { credentials: 'include' })
        .then((r) => r.json())
        .catch(() => null),
  });

  // Editable fields
  const [telephone, setTelephone] = useState('');
  const [emailPerso, setEmailPerso] = useState('');
  const [adresse, setAdresse] = useState('');
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

  // Initialize form from profile + empData
  useEffect(() => {
    if (profile) {
      setTelephone(profile.telephone || '');
      setEmailPerso(profile.email || '');
      setAdresse(profile.adresse || '');
    }
  }, [profile]);

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
      telephone: telephone || undefined,
      email: emailPerso || undefined,
      adresse: adresse || undefined,
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

  // Derive read-only info
  const fullName = profile?.fullName || empData?.nom || '-';
  const matricule = empData?.matricule || '-';
  const poste = empData?.poste || empData?.positionTitle || '-';
  const departement = empData?.departement || empData?.departmentName || '-';
  const typeContrat = empData?.typeContrat || '-';
  const dateEmbauche = empData?.dateEmbauche;
  const salaireBase = empData?.salaireBase;

  return (
    <div className="space-y-6">
      {/* Read-only section */}
      <Card className="bg-surface-subtle">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-accent/10">
            <User className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-content-primary">Informations professionnelles</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Info className="h-3.5 w-3.5 text-content-muted" />
              <p className="text-xs text-content-muted">
                Ces informations sont gerees par les RH
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReadOnlyField label="Nom complet" value={fullName} />
          <ReadOnlyField label="Matricule" value={matricule} />
          <ReadOnlyField label="Poste" value={poste} />
          <ReadOnlyField label="Departement" value={departement} />
          <ReadOnlyField label="Type de contrat" value={typeContrat} />
          <ReadOnlyField label="Date d'embauche" value={formatDate(dateEmbauche)} />
          <ReadOnlyField label="Salaire de base" value={formatFCFA(salaireBase)} />
        </div>
      </Card>

      {/* Editable section */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-accent/10">
            <Building2 className="h-5 w-5 text-accent" />
          </div>
          <h3 className="text-lg font-bold text-content-primary">Informations personnelles</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Telephone"
            name="telephone"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="+243 ..."
          />
          <FormField
            label="Email personnel"
            name="emailPerso"
            type="email"
            value={emailPerso}
            onChange={(e) => setEmailPerso(e.target.value)}
            placeholder="votre@email.com"
          />
          <FormField
            label="Adresse"
            name="adresse"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            placeholder="Votre adresse"
            containerClassName="sm:col-span-2"
          />
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

      {/* Bank info */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-accent/10">
            <CreditCard className="h-5 w-5 text-accent" />
          </div>
          <h3 className="text-lg font-bold text-content-primary">Coordonnees bancaires</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Payment details textarea */}
        <div className="mt-4">
          <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
            Details de paiement
          </label>
          <textarea
            value={paymentDetails}
            onChange={(e) => setPaymentDetails(e.target.value)}
            placeholder="Numero Mobile Money, informations complementaires..."
            rows={3}
            className="w-full px-4 py-2 bg-input-bg border border-input-border rounded-lg text-input-text text-sm placeholder:text-input-placeholder focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors duration-200"
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
        >
          Enregistrer les modifications
        </Button>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-sm font-medium text-content-primary">{value}</p>
    </div>
  );
}
