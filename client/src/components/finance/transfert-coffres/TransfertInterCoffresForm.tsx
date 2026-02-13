import React, { useState, useMemo } from 'react';
import { StatutCoffre } from '@shared/enum/status-constants';
import {
  X,
  Vault,
  ArrowRight,
  Package,
  Users,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Send,
  Calendar,
  Clock,
  FileText,
} from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { toast } from '../../../lib/toast';
import { formatMoney } from '../../../lib/format';
import { currencyCode } from '@shared/config/currency';

interface CoffreFort {
  id: string;
  code: string;
  nom: string;
  ownerType: 'AGENCE' | 'SIEGE';
  solde: string;
  plafondEncaisse?: string;
  soldeMinimum?: string;
  statut: string;
  agenceNom?: string;
}

interface TransfertInterCoffresFormProps {
  coffres: CoffreFort[];
  onClose: () => void;
  onSuccess: (transfert: any) => void;
}

interface AgentTransport {
  nom: string;
  contact: string;
}

export default function TransfertInterCoffresForm({
  coffres,
  onClose,
  onSuccess,
}: TransfertInterCoffresFormProps) {
  // Form state
  const [coffreSourceId, setCoffreSourceId] = useState('');
  const [coffreDestinationId, setCoffreDestinationId] = useState('');
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [typeConditionnement, setTypeConditionnement] = useState('Sac scellé');
  const [numeroScelle, setNumeroScelle] = useState('');
  const [dateTransfert, setDateTransfert] = useState(new Date().toISOString().split('T')[0]);
  const [heureDepart, setHeureDepart] = useState('');
  const [agentsTransport, setAgentsTransport] = useState<AgentTransport[]>([
    { nom: '', contact: '' },
    { nom: '', contact: '' },
  ]);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get active coffres
  const activeCoffres = useMemo(() => {
    return coffres.filter(c => c.statut === StatutCoffre.ACTIVE);
  }, [coffres]);

  // Get selected coffres
  const coffreSource = useMemo(() => {
    return activeCoffres.find(c => c.id === coffreSourceId);
  }, [activeCoffres, coffreSourceId]);

  const coffreDestination = useMemo(() => {
    return activeCoffres.find(c => c.id === coffreDestinationId);
  }, [activeCoffres, coffreDestinationId]);

  // Calculate validation
  const validation = useMemo(() => {
    const result: { valid: boolean; warnings: string[]; errors: string[] } = {
      valid: true,
      warnings: [],
      errors: [],
    };

    const montantNum = parseFloat(montant) || 0;

    if (coffreSource && montantNum > 0) {
      const soldeSource = parseFloat(coffreSource.solde) || 0;
      const soldeMinSource = parseFloat(coffreSource.soldeMinimum || '0') || 0;

      if (montantNum > soldeSource) {
        result.errors.push(`Solde insuffisant. Disponible: ${formatMoney(soldeSource)}`);
        result.valid = false;
      } else if (soldeSource - montantNum < soldeMinSource) {
        result.errors.push(`Le solde après transfert serait inférieur au minimum requis (${formatMoney(soldeMinSource)})`);
        result.valid = false;
      }
    }

    if (coffreDestination && montantNum > 0) {
      const soldeDest = parseFloat(coffreDestination.solde) || 0;
      const plafondDest = parseFloat(coffreDestination.plafondEncaisse || '0') || 0;

      if (plafondDest > 0 && soldeDest + montantNum > plafondDest) {
        result.errors.push(`Le plafond du coffre destination serait dépassé (${formatMoney(plafondDest)})`);
        result.valid = false;
      }
    }

    // Montant minimum recommandé
    if (montantNum > 0 && montantNum < 10000) {
      result.warnings.push('Montant inférieur au minimum recommandé (10 000 XAF)');
    }

    // Montant élevé
    if (montantNum >= 2000000) {
      result.warnings.push('Montant élevé - Double approbation requise');
    }

    return result;
  }, [coffreSource, coffreDestination, montant]);

  // Add agent
  const addAgent = () => {
    setAgentsTransport([...agentsTransport, { nom: '', contact: '' }]);
  };

  // Remove agent
  const removeAgent = (index: number) => {
    if (agentsTransport.length > 2) {
      setAgentsTransport(agentsTransport.filter((_, i) => i !== index));
    }
  };

  // Update agent
  const updateAgent = (index: number, field: 'nom' | 'contact', value: string) => {
    const updated = [...agentsTransport];
    updated[index][field] = value;
    setAgentsTransport(updated);
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!coffreSourceId) newErrors.coffreSource = 'Sélectionnez un coffre source';
    if (!coffreDestinationId) newErrors.coffreDestination = 'Sélectionnez un coffre destination';
    if (coffreSourceId === coffreDestinationId) newErrors.coffreDestination = 'Source et destination doivent être différents';

    const montantNum = parseFloat(montant) || 0;
    if (montantNum <= 0) newErrors.montant = 'Le montant doit être positif';

    if (!motif || motif.trim().length < 10) newErrors.motif = 'Le motif doit contenir au moins 10 caractères';

    if (typeConditionnement === 'Sac scellé' && !numeroScelle) {
      newErrors.numeroScelle = 'Le numéro de scellé est obligatoire pour un sac scellé';
    }

    const validAgents = agentsTransport.filter(a => a.nom.trim() && a.contact.trim());
    if (validAgents.length < 2) {
      newErrors.agentsTransport = 'Au moins 2 agents de transport sont requis';
    }

    if (!validation.valid) {
      validation.errors.forEach((err, i) => {
        newErrors[`validation_${i}`] = err;
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent, submitImmediately: boolean = false) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    const loadingId = toast.loading('Création du transfert...');

    try {
      const validAgents = agentsTransport.filter(a => a.nom.trim() && a.contact.trim());

      const response = await fetch('/api/transferts-inter-coffres/transferts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          coffreSourceId,
          coffreDestinationId,
          montant: parseFloat(montant),
          devise: currencyCode(),
          motif: motif.trim(),
          typeConditionnement,
          numeroScelle: typeConditionnement === 'Sac scellé' ? numeroScelle : undefined,
          dateTransfert,
          heureDepart: heureDepart || undefined,
          agentsTransport: validAgents,
        }),
      });

      const result = await response.json();
      toast.dismiss(loadingId);

      if (!result.success) {
        toast.error(result.error || 'Erreur lors de la création');
        return;
      }

      // If submitImmediately, also submit the transfer
      if (submitImmediately) {
        const submitLoadingId = toast.loading('Soumission du transfert...');
        const submitResponse = await fetch(`/api/transferts-inter-coffres/transferts/${result.transfert.id}/submit`, {
          method: 'POST',
          credentials: 'include',
        });
        const submitResult = await submitResponse.json();
        toast.dismiss(submitLoadingId);

        if (!submitResult.success) {
          toast.warning('Transfert créé mais non soumis: ' + (submitResult.error || 'Erreur'));
        } else {
          toast.success('Transfert créé et soumis avec succès');
        }
      } else {
        toast.success('Brouillon de transfert créé');
      }

      onSuccess(result.transfert);
    } catch (error) {
      toast.dismiss(loadingId);
      toast.error('Erreur lors de la création du transfert');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl max-h-[95vh] sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-5 duration-300">
        {/* Header */}
        <header className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-10 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
              <Vault size={20} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Nouveau Transfert Inter-Coffres</h2>
              <p className="text-xs text-slate-400">Initier un mouvement sécurisé entre coffres-forts</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="rounded-full text-slate-400 hover:text-white h-10 w-10 p-0"
          >
            <X size={20} />
          </Button>
        </header>

        {/* Form */}
        <form onSubmit={(e) => handleSubmit(e, false)} className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {/* Source & Destination */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <ArrowRight size={16} className="text-cyan-400" />
              Coffres Source et Destination
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Source */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Coffre Source *</label>
                <select
                  value={coffreSourceId}
                  onChange={(e) => setCoffreSourceId(e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${
                    errors.coffreSource ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
                  }`}
                >
                  <option value="">Sélectionner...</option>
                  {activeCoffres.map((coffre) => (
                    <option key={coffre.id} value={coffre.id} disabled={coffre.id === coffreDestinationId}>
                      {coffre.agenceNom || coffre.nom} - {formatMoney(parseFloat(coffre.solde))}
                    </option>
                  ))}
                </select>
                {coffreSource && (
                  <div className="text-xs text-slate-500">
                    Solde: <span className="text-emerald-400 font-medium">{formatMoney(parseFloat(coffreSource.solde))}</span>
                  </div>
                )}
                {errors.coffreSource && <p className="text-xs text-red-400">{errors.coffreSource}</p>}
              </div>

              {/* Destination */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Coffre Destination *</label>
                <select
                  value={coffreDestinationId}
                  onChange={(e) => setCoffreDestinationId(e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${
                    errors.coffreDestination ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
                  }`}
                >
                  <option value="">Sélectionner...</option>
                  {activeCoffres.map((coffre) => (
                    <option key={coffre.id} value={coffre.id} disabled={coffre.id === coffreSourceId}>
                      {coffre.agenceNom || coffre.nom} - {formatMoney(parseFloat(coffre.solde))}
                    </option>
                  ))}
                </select>
                {coffreDestination && (
                  <div className="text-xs text-slate-500">
                    Solde actuel: <span className="text-white">{formatMoney(parseFloat(coffreDestination.solde))}</span>
                    {coffreDestination.plafondEncaisse && (
                      <span className="ml-2">
                        / Plafond: {formatMoney(parseFloat(coffreDestination.plafondEncaisse))}
                      </span>
                    )}
                  </div>
                )}
                {errors.coffreDestination && <p className="text-xs text-red-400">{errors.coffreDestination}</p>}
              </div>
            </div>
          </section>

          {/* Montant */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase">Montant (XAF) *</label>
            <div className="relative">
              <input
                type="number"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0"
                className={`w-full pl-4 pr-16 py-4 bg-slate-950 border rounded-xl text-2xl font-bold text-white focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all ${
                  errors.montant ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">XAF</span>
            </div>
            {errors.montant && <p className="text-xs text-red-400">{errors.montant}</p>}

            {/* Validation messages */}
            {validation.errors.length > 0 && (
              <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl space-y-1">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-400 flex items-center gap-2">
                    <AlertTriangle size={12} /> {err}
                  </p>
                ))}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                {validation.warnings.map((warn, i) => (
                  <p key={i} className="text-xs text-amber-400 flex items-center gap-2">
                    <AlertTriangle size={12} /> {warn}
                  </p>
                ))}
              </div>
            )}
          </section>

          {/* Motif */}
          <section className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase">Motif du transfert *</label>
            <textarea
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Décrivez la raison de ce transfert (min. 10 caractères)..."
              rows={3}
              className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 outline-none resize-none transition-all ${
                errors.motif ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
              }`}
            />
            <div className="flex justify-between text-xs">
              {errors.motif && <p className="text-red-400">{errors.motif}</p>}
              <p className={`ml-auto ${motif.length >= 10 ? 'text-emerald-400' : 'text-slate-500'}`}>
                {motif.length}/10 min
              </p>
            </div>
          </section>

          {/* Date & Heure */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <Calendar size={16} className="text-cyan-400" />
              Date et Heure
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Date du transfert *</label>
                <input
                  type="date"
                  value={dateTransfert}
                  onChange={(e) => setDateTransfert(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Heure de départ prévue</label>
                <input
                  type="time"
                  value={heureDepart}
                  onChange={(e) => setHeureDepart(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
          </section>

          {/* Conditionnement */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
              <Package size={16} className="text-cyan-400" />
              Conditionnement & Sécurité
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400 uppercase">Type de conditionnement *</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Sac scellé', 'Mallette', 'Enveloppe', 'Autre'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTypeConditionnement(type)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        typeConditionnement === type
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {typeConditionnement === 'Sac scellé' && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-400 uppercase">Numéro de scellé *</label>
                  <input
                    type="text"
                    value={numeroScelle}
                    onChange={(e) => setNumeroScelle(e.target.value)}
                    placeholder="Ex: SC-2026-00123"
                    className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 outline-none ${
                      errors.numeroScelle ? 'border-red-500' : 'border-slate-700 focus:border-cyan-500'
                    }`}
                  />
                  {errors.numeroScelle && <p className="text-xs text-red-400">{errors.numeroScelle}</p>}
                </div>
              )}
            </div>
          </section>

          {/* Agents de Transport */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2">
                <Users size={16} className="text-cyan-400" />
                Agents de Transport (min. 2)
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addAgent}
                className="text-cyan-400 hover:bg-cyan-500/10"
              >
                <Plus size={16} className="mr-1" /> Ajouter
              </Button>
            </div>

            {errors.agentsTransport && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle size={12} /> {errors.agentsTransport}
              </p>
            )}

            <div className="space-y-3">
              {agentsTransport.map((agent, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={agent.nom}
                      onChange={(e) => updateAgent(index, 'nom', e.target.value)}
                      placeholder="Nom complet"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
                    />
                    <input
                      type="text"
                      value={agent.contact}
                      onChange={(e) => updateAgent(index, 'contact', e.target.value)}
                      placeholder="Téléphone"
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 outline-none"
                    />
                  </div>
                  {agentsTransport.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAgent(index)}
                      className="text-red-400 hover:bg-red-500/10 h-10 w-10 p-0 rounded-xl"
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Summary */}
          {coffreSource && coffreDestination && parseFloat(montant) > 0 && (
            <section className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
              <h4 className="text-sm font-semibold text-white">Résumé du transfert</h4>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-400">{coffreSource.agenceNom || coffreSource.nom}</span>
                <ArrowRight size={16} className="text-cyan-400" />
                <span className="text-white font-medium">{coffreDestination.agenceNom || coffreDestination.nom}</span>
              </div>
              <div className="text-2xl font-bold text-white">{formatMoney(parseFloat(montant))}</div>
              <div className="text-xs text-slate-400">
                Conditionnement: {typeConditionnement}
                {numeroScelle && ` - Scellé: ${numeroScelle}`}
              </div>
            </section>
          )}
        </form>

        {/* Footer */}
        <footer className="p-5 border-t border-slate-800 bg-slate-900/95 backdrop-blur sticky bottom-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={loading}
            >
              Annuler
            </Button>
            <div className="flex-1 flex gap-3">
              <Button
                type="button"
                onClick={(e) => handleSubmit(e, false)}
                disabled={loading || !validation.valid}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white"
              >
                <FileText size={18} className="mr-2" />
                Sauvegarder brouillon
              </Button>
              <Button
                type="button"
                onClick={(e) => handleSubmit(e, true)}
                disabled={loading || !validation.valid}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-500/20"
              >
                <Send size={18} className="mr-2" />
                {loading ? 'Traitement...' : 'Soumettre'}
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
