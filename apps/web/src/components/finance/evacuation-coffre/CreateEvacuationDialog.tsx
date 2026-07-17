import React, { useState, useMemo } from 'react';
import { StatutCoffre, TypeDestinationEvacuation, MotifEvacuation, MOTIF_EVACUATION_LABELS } from '@shared/enum/status-constants';
import {
  X,
  Vault,
  ArrowUpRight,
  Building2,
  Truck,
  AlertTriangle,
  Send,
  FileText,
  Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { toast } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';

interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  solde: string;
  statut: string;
  agenceNom?: string;
}

interface CreateEvacuationDialogProps {
  coffres: CoffreFort[];
  onClose: () => void;
  onSuccess: (evacuation: any) => void;
}

export default function CreateEvacuationDialog({
  coffres,
  onClose,
  onSuccess,
}: CreateEvacuationDialogProps) {
  // Form state
  const [coffreSourceId, setCoffreSourceId] = useState('');
  const [typeDestination, setTypeDestination] = useState<string>(TypeDestinationEvacuation.BANQUE);
  const [montant, setMontant] = useState('');
  const [motifEvacuation, setMotifEvacuation] = useState<string>(MotifEvacuation.EXCEDENT_ENCAISSE);
  const [motifDetail, setMotifDetail] = useState('');

  // Destination-specific fields
  const [banqueNom, setBanqueNom] = useState('');
  const [banqueCompte, setBanqueCompte] = useState('');
  const [banqueNumeroComptable, setBanqueNumeroComptable] = useState('512');
  const [coffreDestinationId, setCoffreDestinationId] = useState('');
  const [transporteurNom, setTransporteurNom] = useState('');
  const [transporteurContact, setTransporteurContact] = useState('');
  const [transporteurReference, setTransporteurReference] = useState('');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitAndSend, setSubmitAndSend] = useState(false);

  // Active coffres
  const activeCoffres = useMemo(() => {
    return coffres.filter(c => c.statut === StatutCoffre.ACTIVE);
  }, [coffres]);

  // Destination coffres (exclude source)
  const destinationCoffres = useMemo(() => {
    return activeCoffres.filter(c => c.id !== coffreSourceId);
  }, [activeCoffres, coffreSourceId]);

  const coffreSource = useMemo(() => {
    return activeCoffres.find(c => c.id === coffreSourceId);
  }, [activeCoffres, coffreSourceId]);

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!coffreSourceId) newErrors.coffreSourceId = 'Sélectionnez le coffre source';
    if (!montant || Number(montant) <= 0) newErrors.montant = 'Montant invalide';
    if (coffreSource && Number(montant) > Number(coffreSource.solde)) {
      newErrors.montant = `Montant supérieur au solde (${formatMoney(coffreSource.solde)})`;
    }
    if (motifDetail.trim().length < 10) newErrors.motifDetail = 'Détail trop court (min 10 caractères)';

    // Destination validation
    if (typeDestination === TypeDestinationEvacuation.BANQUE) {
      if (!banqueNom.trim()) newErrors.banqueNom = 'Nom de la banque requis';
      if (!banqueCompte.trim()) newErrors.banqueCompte = 'Numéro de compte requis';
    } else if (typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL) {
      if (!coffreDestinationId) newErrors.coffreDestinationId = 'Sélectionnez le coffre destination';
    } else if (typeDestination === TypeDestinationEvacuation.TRANSPORTEUR) {
      if (!transporteurNom.trim()) newErrors.transporteurNom = 'Nom du transporteur requis';
      if (!transporteurContact.trim()) newErrors.transporteurContact = 'Contact requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      const data: any = {
        coffreSourceId,
        typeDestination,
        montant: Number(montant),
        motifEvacuation,
        motifDetail: motifDetail.trim(),
      };

      if (typeDestination === TypeDestinationEvacuation.BANQUE) {
        data.banqueNom = banqueNom.trim();
        data.banqueCompte = banqueCompte.trim();
        data.banqueNumeroComptable = banqueNumeroComptable.trim() || undefined;
      } else if (typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL) {
        data.coffreDestinationId = coffreDestinationId;
      } else if (typeDestination === TypeDestinationEvacuation.TRANSPORTEUR) {
        data.transporteurNom = transporteurNom.trim();
        data.transporteurContact = transporteurContact.trim();
        data.transporteurReference = transporteurReference.trim() || undefined;
      }

      const res = await fetch('/api/evacuations-coffre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (result.success) {
        // Auto-submit if requested
        if (submitAndSend && result.data?.id) {
          const submitRes = await fetch(`/api/evacuations-coffre/${result.data.id}/submit`, {
            method: 'POST',
            credentials: 'include',
          });
          const submitResult = await submitRes.json();
          if (!submitResult.success) {
            toast.warning('Créée mais échec soumission: ' + (submitResult.error || ''));
          }
        }
        onSuccess(result.data);
      } else {
        toast.error(result.error || 'Erreur lors de la création');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-surface-base/90 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-surface-base border border-edge w-full max-w-4xl max-h-[95vh] sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-300">
        {/* Header */}
        <header className="p-5 border-b border-edge flex items-center justify-between sticky top-0 bg-surface-base/95 backdrop-blur z-10 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
              <Vault size={20} className="text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content-primary">Nouvelle évacuation de coffre</h2>
              <p className="text-xs text-content-muted mt-0.5">Veuillez renseigner les détails de l'évacuation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-content-muted hover:text-content-primary hover:bg-surface rounded-full transition-colors">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* Colonne Gauche */}
            <div className="space-y-6">
          {/* Coffre source */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Coffre source *</label>
            <select
              value={coffreSourceId}
              onChange={(e) => setCoffreSourceId(e.target.value)}
              className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                errors.coffreSourceId ? 'border-status-danger' : 'border-edge focus:border-accent'
              }`}
            >
              <option value="">Sélectionner un coffre...</option>
              {activeCoffres.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nom} ({c.code}) — {formatMoney(c.solde)}
                </option>
              ))}
            </select>
            {errors.coffreSourceId && <p className="text-[10px] text-status-danger mt-1">{errors.coffreSourceId}</p>}
          </div>

          {/* Montant */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Montant (FCFA) *</label>
            <div className="relative">
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={montant}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontant(v); }}
                placeholder="0"
                className={`w-full pl-4 pr-16 py-4 bg-input-bg border rounded-xl text-2xl font-bold text-content-primary focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                  errors.montant ? 'border-status-danger' : 'border-edge focus:border-accent'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-content-muted">FCFA</span>
            </div>
            {coffreSource && montant && (
              <p className="text-[10px] text-content-muted mt-1">
                Solde disponible: {formatMoney(coffreSource.solde)}
                {Number(montant) > Number(coffreSource.solde) && (
                  <span className="text-status-danger ml-1">— Insuffisant</span>
                )}
              </p>
            )}
            {errors.montant && <p className="text-[10px] text-status-danger mt-1">{errors.montant}</p>}
          </div>

          {/* Type destination */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Type de destination *</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: TypeDestinationEvacuation.BANQUE, label: 'Banque', icon: Building2 },
                { value: TypeDestinationEvacuation.COFFRE_CENTRAL, label: 'Coffre Central', icon: Vault },
                { value: TypeDestinationEvacuation.TRANSPORTEUR, label: 'Transporteur', icon: Truck },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTypeDestination(opt.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-sm font-medium transition-all ${
                    typeDestination === opt.value
                      ? 'bg-accent/10 text-accent border border-accent/50'
                      : 'bg-input-bg text-content-muted border border-edge hover:border-edge-strong'
                  }`}
                >
                  <opt.icon size={20} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Colonne Droite */}
        <div className="space-y-6">

          {/* Destination-specific fields */}
          {typeDestination === TypeDestinationEvacuation.BANQUE && (
            <div className="space-y-4 p-5 bg-surface/30 border border-edge/40 rounded-xl">
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Nom de la banque *</label>
                <input
                  type="text"
                  value={banqueNom}
                  onChange={(e) => setBanqueNom(e.target.value)}
                  placeholder="Ex: BGFI Bank, Afriland First Bank..."
                  className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                    errors.banqueNom ? 'border-status-danger' : 'border-edge focus:border-accent'
                  }`}
                />
                {errors.banqueNom && <p className="text-[10px] text-status-danger mt-1">{errors.banqueNom}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Numéro de compte *</label>
                <input
                  type="text"
                  value={banqueCompte}
                  onChange={(e) => setBanqueCompte(e.target.value)}
                  placeholder="Numéro de compte bancaire"
                  className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                    errors.banqueCompte ? 'border-status-danger' : 'border-edge focus:border-accent'
                  }`}
                />
                {errors.banqueCompte && <p className="text-[10px] text-status-danger mt-1">{errors.banqueCompte}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">N° comptable (GL)</label>
                <input
                  type="text"
                  value={banqueNumeroComptable}
                  onChange={(e) => setBanqueNumeroComptable(e.target.value)}
                  placeholder="512"
                  className="w-full px-4 py-3 bg-input-bg border border-edge rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
                />
              </div>
            </div>
          )}

          {typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL && (
            <div className="space-y-2 p-5 bg-surface/30 border border-edge/40 rounded-xl">
              <label className="text-xs font-medium text-content-muted uppercase">Coffre destination *</label>
              <select
                value={coffreDestinationId}
                onChange={(e) => setCoffreDestinationId(e.target.value)}
                className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                  errors.coffreDestinationId ? 'border-status-danger' : 'border-edge focus:border-accent'
                }`}
              >
                <option value="">Sélectionner un coffre...</option>
                {destinationCoffres.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.code}) — {formatMoney(c.solde)}
                  </option>
                ))}
              </select>
              {errors.coffreDestinationId && <p className="text-[10px] text-status-danger mt-1">{errors.coffreDestinationId}</p>}
            </div>
          )}

          {typeDestination === TypeDestinationEvacuation.TRANSPORTEUR && (
            <div className="space-y-4 p-5 bg-surface/30 border border-edge/40 rounded-xl">
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Nom du transporteur *</label>
                <input
                  type="text"
                  value={transporteurNom}
                  onChange={(e) => setTransporteurNom(e.target.value)}
                  placeholder="Ex: Brinks, Prosegur..."
                  className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                    errors.transporteurNom ? 'border-status-danger' : 'border-edge focus:border-accent'
                  }`}
                />
                {errors.transporteurNom && <p className="text-[10px] text-status-danger mt-1">{errors.transporteurNom}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Contact *</label>
                <input
                  type="text"
                  value={transporteurContact}
                  onChange={(e) => setTransporteurContact(e.target.value)}
                  placeholder="Numéro ou email"
                  className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
                    errors.transporteurContact ? 'border-status-danger' : 'border-edge focus:border-accent'
                  }`}
                />
                {errors.transporteurContact && <p className="text-[10px] text-status-danger mt-1">{errors.transporteurContact}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-content-muted uppercase">Référence contrat (optionnel)</label>
                <input
                  type="text"
                  value={transporteurReference}
                  onChange={(e) => setTransporteurReference(e.target.value)}
                  placeholder="N° contrat ou référence"
                  className="w-full px-4 py-3 bg-input-bg border border-edge rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
                />
              </div>
            </div>
          )}

          {/* Motif */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Motif d'évacuation *</label>
            <select
              value={motifEvacuation}
              onChange={(e) => setMotifEvacuation(e.target.value)}
              className="w-full px-4 py-3 bg-input-bg border border-edge rounded-xl text-content-primary focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
            >
              {Object.entries(MOTIF_EVACUATION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Motif detail */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-content-muted uppercase">Détails / Justification *</label>
            <textarea
              value={motifDetail}
              onChange={(e) => setMotifDetail(e.target.value)}
              placeholder="Décrivez la raison de cette évacuation (min 10 caractères)..."
              rows={4}
              className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none resize-none transition-all ${
                errors.motifDetail ? 'border-status-danger' : 'border-edge focus:border-accent'
              }`}
            />
            <div className="flex justify-between text-xs">
              {errors.motifDetail && <p className="text-status-danger">{errors.motifDetail}</p>}
              <p className={`ml-auto ${motifDetail.length >= 10 ? 'text-status-success' : 'text-content-muted'}`}>
                {motifDetail.length}/10 min
              </p>
            </div>
          </div>
          </div>
        </div>
        </div>

        {/* Footer */}
        <footer className="p-5 border-t border-edge bg-surface-base/95 backdrop-blur sticky bottom-0 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={onClose} disabled={loading} className="w-full sm:w-auto">
              Annuler
            </Button>
            <div className="flex-1 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => { setSubmitAndSend(false); handleSubmit(); }}
                disabled={loading}
                className="flex-1"
              >
                <FileText size={18} className="mr-2" />
                {loading && !submitAndSend ? 'Création...' : 'Brouillon'}
              </Button>
              <Button
                variant="primary"
                onClick={() => { setSubmitAndSend(true); handleSubmit(); }}
                disabled={loading}
                className="flex-1"
              >
                <Send size={18} className="mr-2" />
                {loading && submitAndSend ? 'Envoi...' : 'Créer & Soumettre'}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
