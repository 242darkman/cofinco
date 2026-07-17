import { useState, useEffect } from 'react';
import { SkeletonForm } from '@/components/ui/Skeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { companyInfoQueryKey, type CompanyInfo } from '@/hooks/useCompanyInfo';

interface CompanyInfoForm {
  adresse: string;
  telephone: string;
  email: string;
  rccm: string;
  nif: string;
}

const EMPTY_FORM: CompanyInfoForm = { adresse: '', telephone: '', email: '', rccm: '', nif: '' };

function toForm(info: CompanyInfo | undefined): CompanyInfoForm {
  return {
    adresse: info?.adresse ?? '',
    telephone: info?.telephone ?? '',
    email: info?.email ?? '',
    rccm: info?.rccm ?? '',
    nif: info?.nif ?? '',
  };
}

/**
 * Informations légales de la société (reçus, factures, documents officiels).
 * L'identité visuelle — nom, logo et couleurs — est gérée dans l'onglet
 * « Tenant & Modules » (config tenant, source unique de vérité).
 */
export default function AdminCompanyInfoSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<CompanyInfo>({
    queryKey: companyInfoQueryKey,
    queryFn: async () => {
      const res = await fetch('/api/company-info');
      if (!res.ok) throw new Error('Erreur de chargement');
      return res.json();
    },
  });

  const [form, setForm] = useState<CompanyInfoForm>(EMPTY_FORM);
  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: CompanyInfoForm) => {
      const res = await fetch('/api/company-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      return (await res.json()) as CompanyInfo;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(companyInfoQueryKey, updated);
      toast.success('Informations société mises à jour.');
    },
    onError: () => toast.error('Erreur lors de la sauvegarde.'),
  });

  const baseline = toForm(data);
  const hasChanges = (Object.keys(form) as (keyof CompanyInfoForm)[]).some((k) => form[k] !== baseline[k]);

  const update = (key: keyof CompanyInfoForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  if (isLoading) {
    return (
      <SkeletonForm fields={5} />
    );
  }

  const inputClass =
    'w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent focus:outline-none';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-accent/10 rounded-lg">
          <Building2 size={24} className="text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-content-primary">Informations de la société</h2>
          <p className="text-sm text-content-muted mt-1">
            Ces informations apparaissent sur les reçus, factures et documents officiels.
            Le nom, le logo et les couleurs se règlent dans l’onglet « Tenant &amp; Modules ».
          </p>
        </div>
      </div>

      <div className="bg-surface/50 border border-edge rounded-lg p-4 grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <span className="text-xs text-content-muted">Adresse</span>
          <input
            type="text"
            value={form.adresse}
            onChange={(e) => update('adresse', e.target.value)}
            placeholder="Brazzaville, République du Congo"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-content-muted">Téléphone</span>
          <input
            type="text"
            value={form.telephone}
            onChange={(e) => update('telephone', e.target.value)}
            placeholder="+242 06 123 4567"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-content-muted">Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="contact@societe.com"
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-content-muted">RCCM</span>
          <input
            type="text"
            value={form.rccm}
            onChange={(e) => update('rccm', e.target.value)}
            placeholder="RCCM-BZV-..."
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-content-muted">NIF / NIU</span>
          <input
            type="text"
            value={form.nif}
            onChange={(e) => update('nif', e.target.value)}
            placeholder="NIF-..."
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setForm(toForm(data))}
          disabled={!hasChanges}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-content-muted hover:text-content-secondary transition-colors disabled:opacity-30"
        >
          <RotateCcw size={14} />
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={() => saveMutation.mutate(form)}
          disabled={!hasChanges || saveMutation.isPending}
          className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            hasChanges ? 'bg-accent hover:bg-accent/80 text-white' : 'bg-surface-elevated text-content-muted cursor-not-allowed'
          }`}
        >
          <Check size={14} />
          {saveMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
