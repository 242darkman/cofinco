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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-base border border-edge rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge">
          <div className="flex items-center gap-2">
            <Vault size={16} className="text-status-info" />
            <h2 className="text-sm font-semibold text-content-primary">Nouvelle évacuation de coffre</h2>
          </div>
          <button onClick={onClose} className="p-1 text-content-muted hover:text-content-primary transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Coffre source */}
          <div>
            <label className="block text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1.5">
              Coffre source
            </label>
            <select
              value={coffreSourceId}
              onChange={(e) => setCoffreSourceId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary focus:outline-none focus:border-status-info/50"
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
          <div>
            <label className="block text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1.5">
              Montant (FCFA)
            </label>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              value={montant}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setMontant(v); }}
              placeholder="0"
              className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
            />
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
          <div>
            <label className="block text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1.5">
              Type de destination
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: TypeDestinationEvacuation.BANQUE, label: 'Banque', icon: Building2 },
                { value: TypeDestinationEvacuation.COFFRE_CENTRAL, label: 'Coffre Central', icon: Vault },
                { value: TypeDestinationEvacuation.TRANSPORTEUR, label: 'Transporteur', icon: Truck },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTypeDestination(opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition ${
                    typeDestination === opt.value
                      ? 'border-status-info/50 bg-status-info-bg text-status-info'
                      : 'border-edge bg-surface/50 text-content-muted hover:border-edge-strong'
                  }`}
                >
                  <opt.icon size={16} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Destination-specific fields */}
          {typeDestination === TypeDestinationEvacuation.BANQUE && (
            <div className="space-y-3 p-3 bg-surface/30 border border-edge/40 rounded-lg">
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">Nom de la banque</label>
                <input
                  type="text"
                  value={banqueNom}
                  onChange={(e) => setBanqueNom(e.target.value)}
                  placeholder="Ex: BGFI Bank, Afriland First Bank..."
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                />
                {errors.banqueNom && <p className="text-[10px] text-status-danger mt-1">{errors.banqueNom}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">Numéro de compte</label>
                <input
                  type="text"
                  value={banqueCompte}
                  onChange={(e) => setBanqueCompte(e.target.value)}
                  placeholder="Numéro de compte bancaire"
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                />
                {errors.banqueCompte && <p className="text-[10px] text-status-danger mt-1">{errors.banqueCompte}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">N° comptable (GL)</label>
                <input
                  type="text"
                  value={banqueNumeroComptable}
                  onChange={(e) => setBanqueNumeroComptable(e.target.value)}
                  placeholder="512"
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                />
              </div>
            </div>
          )}

          {typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL && (
            <div className="p-3 bg-surface/30 border border-edge/40 rounded-lg">
              <label className="block text-[10px] font-bold text-content-muted mb-1">Coffre destination</label>
              <select
                value={coffreDestinationId}
                onChange={(e) => setCoffreDestinationId(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary focus:outline-none focus:border-status-info/50"
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
            <div className="space-y-3 p-3 bg-surface/30 border border-edge/40 rounded-lg">
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">Nom du transporteur</label>
                <input
                  type="text"
                  value={transporteurNom}
                  onChange={(e) => setTransporteurNom(e.target.value)}
                  placeholder="Ex: Brinks, Prosegur..."
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                />
                {errors.transporteurNom && <p className="text-[10px] text-status-danger mt-1">{errors.transporteurNom}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">Contact</label>
                <input
                  type="text"
                  value={transporteurContact}
                  onChange={(e) => setTransporteurContact(e.target.value)}
                  placeholder="Numéro ou email"
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                />
                {errors.transporteurContact && <p className="text-[10px] text-status-danger mt-1">{errors.transporteurContact}</p>}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-content-muted mb-1">Référence contrat (optionnel)</label>
                <input
                  type="text"
                  value={transporteurReference}
                  onChange={(e) => setTransporteurReference(e.target.value)}
                  placeholder="N° contrat ou référence"
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50"
                />
              </div>
            </div>
          )}

          {/* Motif */}
          <div>
            <label className="block text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1.5">
              Motif d'évacuation
            </label>
            <select
              value={motifEvacuation}
              onChange={(e) => setMotifEvacuation(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary focus:outline-none focus:border-status-info/50"
            >
              {Object.entries(MOTIF_EVACUATION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Motif detail */}
          <div>
            <label className="block text-[10px] font-bold text-content-muted uppercase tracking-widest mb-1.5">
              Détails / Justification
            </label>
            <textarea
              value={motifDetail}
              onChange={(e) => setMotifDetail(e.target.value)}
              placeholder="Décrivez la raison de cette évacuation (min 10 caractères)..."
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-xs text-content-primary placeholder:text-content-muted focus:outline-none focus:border-status-info/50 resize-none"
            />
            <p className="text-[10px] text-content-muted mt-1">{motifDetail.length}/10 caractères minimum</p>
            {errors.motifDetail && <p className="text-[10px] text-status-danger mt-1">{errors.motifDetail}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t border-edge">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Annuler
          </Button>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setSubmitAndSend(false); handleSubmit(); }}
              disabled={loading}
            >
              <FileText size={12} className="mr-1" />
              {loading && !submitAndSend ? 'Création...' : 'Brouillon'}
            </Button>
            <Button
              size="sm"
              onClick={() => { setSubmitAndSend(true); handleSubmit(); }}
              disabled={loading}
            >
              <Send size={12} className="mr-1" />
              {loading && submitAndSend ? 'Envoi...' : 'Créer & Soumettre'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
