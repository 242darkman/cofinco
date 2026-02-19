import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, UserPlus, Phone, Briefcase, WifiOff, MapPin, User, TrendingUp, Clock, ArrowRight, ArrowLeft, Check, FileText, Building2, Store } from 'lucide-react';
import { prospectionApi, arrondissementApi, marcheApi, villeApi } from '../../lib/api-client';
import { useToast } from '@/hooks/use-toast';
import SearchableSelect, { type SearchableSelectOption } from '../ui/SearchableSelect';
import { ANCIENNETE_ACTIVITE_OPTIONS } from '@shared/enum/status-constants';

interface ProspectionFormModalProps {
  isOpen: boolean;
  agentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  nomProspect: string;
  prenomProspect: string;
  telephoneProspect: string;
  sexe: string;
  adresseProspect: string;
  villeId: string;
  arrondissementId: string;
  marcheId: string;
  typeActivite: string;
  activitePrincipale: string;
  ancienneteActivite: string;
  descriptionActivite: string;
  typeRevenu: string;
  revenuEstime: string;
  revenuJournalier: string;
  chiffreAffairesMensuel: string;
  commentairesAgent: string;
  observations: string;
}

const OFFLINE_STORAGE_KEY = 'offline_prospections';
const TOTAL_STEPS = 3;

const TYPES_ACTIVITE = [
  'Commerce général', 'Commerce alimentaire', 'Commerce vestimentaire',
  'Agriculture', 'Élevage', 'Artisanat', 'Transport', 'Services',
  'Restaurant/Bar', 'Salon de coiffure', 'Autre',
];

const STEP_META = [
  { num: 1, label: 'Identité', icon: User },
  { num: 2, label: 'Activité', icon: Briefcase },
  { num: 3, label: 'Finance', icon: TrendingUp },
];

export default function ProspectionFormModal({ isOpen, agentId, onClose, onSuccess }: ProspectionFormModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  const [formData, setFormData] = useState<FormData>({
    nomProspect: '',
    prenomProspect: '',
    telephoneProspect: '',
    sexe: '',
    adresseProspect: '',
    villeId: '',
    arrondissementId: '',
    marcheId: '',
    typeActivite: '',
    activitePrincipale: '',
    ancienneteActivite: '',
    descriptionActivite: '',
    typeRevenu: 'Mensuel',
    revenuEstime: '',
    revenuJournalier: '',
    chiffreAffairesMensuel: '',
    commentairesAgent: '',
    observations: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Reference data
  const [villesList, setVillesList] = useState<any[]>([]);
  const [arrondissements, setArrondissements] = useState<any[]>([]);
  const [marches, setMarches] = useState<any[]>([]);
  const [loadingArrondissements, setLoadingArrondissements] = useState(false);
  const [loadingMarches, setLoadingMarches] = useState(false);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setErrors({});
      setFormData({
        nomProspect: '', prenomProspect: '', telephoneProspect: '', sexe: '',
        adresseProspect: '', villeId: '', arrondissementId: '', marcheId: '',
        typeActivite: '', activitePrincipale: '', ancienneteActivite: '',
        descriptionActivite: '', typeRevenu: 'Mensuel', revenuEstime: '',
        revenuJournalier: '', chiffreAffairesMensuel: '',
        commentairesAgent: '', observations: '',
      });
    }
  }, [isOpen]);

  // Load villes on mount and auto-select if single result
  useEffect(() => {
    if (!isOpen) return;
    villeApi.getAll({ actif: true }).then(data => {
      setVillesList(data);
      // Auto-select if only one city
      if (data.length === 1) {
        setFormData(prev => ({ ...prev, villeId: String(data[0].id) }));
      }
    }).catch(() => {});
  }, [isOpen]);

  // Cascade: ville → arrondissements
  useEffect(() => {
    if (!formData.villeId) { setArrondissements([]); return; }
    setLoadingArrondissements(true);
    arrondissementApi.getAll({ actif: true, villeId: formData.villeId })
      .then(setArrondissements)
      .catch(() => setArrondissements([]))
      .finally(() => setLoadingArrondissements(false));
  }, [formData.villeId]);

  // Cascade: arrondissement → marchés
  useEffect(() => {
    if (!formData.arrondissementId) { setMarches([]); return; }
    setLoadingMarches(true);
    marcheApi.getAll({ arrondissementId: formData.arrondissementId, actif: true })
      .then(setMarches)
      .catch(() => setMarches([]))
      .finally(() => setLoadingMarches(false));
  }, [formData.arrondissementId]);

  // Options for SearchableSelect
  const villeOptions: SearchableSelectOption[] = useMemo(() =>
    villesList.map((v: any) => ({ value: v.id, label: v.nom, subLabel: v.departementNom || v.departement_nom })),
    [villesList]);
  const arrondissementOptions: SearchableSelectOption[] = useMemo(() =>
    arrondissements
      .filter((a: any) => !formData.villeId || String(a.villeId) === String(formData.villeId))
      .map((a: any) => ({ value: a.id, label: a.nom })),
    [arrondissements, formData.villeId]);
  const marcheOptions: SearchableSelectOption[] = useMemo(() =>
    marches
      .filter((m: any) => !formData.arrondissementId || String(m.arrondissementId) === String(formData.arrondissementId))
      .map((m: any) => ({ value: m.id, label: m.nom })),
    [marches, formData.arrondissementId]);
  const activiteOptions: SearchableSelectOption[] = useMemo(() =>
    TYPES_ACTIVITE.map(t => ({ value: t, label: t })), []);
  const ancienneteOptions: SearchableSelectOption[] = useMemo(() =>
    ANCIENNETE_ACTIVITE_OPTIONS.map(o => ({ value: o.value, label: o.label })), []);

  const set = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  // Phone validation
  const validatePhone = (phone: string): boolean => /^(\+242|0)[456]\d{7}$/.test(phone.replace(/\s/g, ''));

  // Step validation
  const validateStep = (s: number): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (s === 1) {
      if (!formData.nomProspect.trim()) e.nomProspect = 'Nom requis';
      if (!formData.prenomProspect.trim()) e.prenomProspect = 'Prénom requis';
      if (!formData.telephoneProspect.trim()) e.telephoneProspect = 'Téléphone requis';
      else if (!validatePhone(formData.telephoneProspect)) e.telephoneProspect = 'Format invalide (06XXXXXXX)';
    }
    // Steps 2 & 3 have no mandatory fields
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast({ title: Object.values(e)[0], variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleNext = () => { if (validateStep(step)) setStep(s => Math.min(s + 1, TOTAL_STEPS)); };
  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  // Offline save
  const saveOffline = (data: any) => {
    try {
      const existing = localStorage.getItem(OFFLINE_STORAGE_KEY);
      const arr = existing ? JSON.parse(existing) : [];
      arr.push({ ...data, offlineId: Date.now(), savedAt: new Date().toISOString() });
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(arr));
      return true;
    } catch { return false; }
  };

  // Submit
  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    const payload = {
      agentId,
      nomProspect: formData.nomProspect.trim(),
      prenomProspect: formData.prenomProspect.trim() || undefined,
      telephoneProspect: formData.telephoneProspect.replace(/\s/g, ''),
      sexe: formData.sexe || undefined,
      adresseProspect: formData.adresseProspect.trim() || undefined,
      arrondissementId: formData.arrondissementId || undefined,
      marcheId: formData.marcheId || undefined,
      typeActivite: formData.typeActivite || undefined,
      activitePrincipale: formData.activitePrincipale.trim() || undefined,
      ancienneteActivite: formData.ancienneteActivite || undefined,
      descriptionActivite: formData.descriptionActivite.trim() || undefined,
      typeRevenu: formData.typeRevenu,
      revenuEstime: formData.revenuEstime.trim() || undefined,
      revenuJournalier: formData.revenuJournalier.trim() || undefined,
      chiffreAffairesMensuel: formData.chiffreAffairesMensuel.trim() || undefined,
      commentairesAgent: formData.commentairesAgent.trim() || undefined,
      observations: formData.observations.trim() || undefined,
      statut: 'REGISTERED',
    };

    setLoading(true);

    if (!navigator.onLine) {
      if (saveOffline(payload)) {
        toast({ title: 'Enregistré hors-ligne', description: `"${formData.nomProspect}" sauvegardé. Sync auto au retour.` });
        onSuccess(); onClose();
      } else {
        toast({ title: 'Erreur', description: 'Impossible de sauvegarder hors-ligne.', variant: 'destructive' });
      }
      setLoading(false);
      return;
    }

    try {
      await prospectionApi.create(payload);
      toast({ title: 'Prospect enregistré !', description: `${formData.nomProspect} ajouté` });
      onSuccess(); onClose();
    } catch (error: any) {
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        if (saveOffline(payload)) {
          toast({ title: 'Sauvegardé hors-ligne', description: 'Erreur réseau. Données sauvegardées.' });
          onSuccess(); onClose(); return;
        }
      }
      toast({ title: 'Erreur', description: error.message || "Impossible d'enregistrer.", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // ─── Step Indicator ───
  const StepDot = ({ s, label, Icon }: { s: number; label: string; Icon: any }) => {
    const done = step > s;
    const active = step === s;
    return (
      <div className="flex flex-col items-center gap-1 min-w-0">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
          done ? 'bg-accent text-white' :
          active ? 'bg-accent text-white ring-2 ring-accent/50 shadow-lg shadow-accent/30 scale-110' :
          'bg-surface text-content-muted border border-edge'
        }`}>
          {done ? <Check size={14} /> : <Icon size={14} />}
        </div>
        <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${
          active ? 'text-accent' : done ? 'text-content-muted' : 'text-content-muted'
        }`}>{label}</span>
      </div>
    );
  };

  // ─── Input helper ───
  const inputCls = (field?: keyof FormData) =>
    `w-full px-3 py-2.5 bg-surface border rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent transition-all ${
      field && errors[field] ? 'border-status-danger/60' : 'border-edge'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md bg-surface-base border-t sm:border border-edge sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">

        {/* ─── HEADER ─── */}
        <div className="bg-surface-base/80 border-b border-edge px-4 pt-4 pb-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/30">
                <UserPlus className="text-accent" size={16} />
              </div>
              <div>
                <h2 className="text-base font-bold text-content-primary leading-none">Nouvelle Prospection</h2>
                <p className="text-[10px] text-content-muted mt-0.5">Étape {step}/{TOTAL_STEPS}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surface flex items-center justify-center transition-colors border border-transparent hover:border-edge">
              <X size={16} className="text-content-muted" />
            </button>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-1">
            {STEP_META.map((sm, i) => (
              <React.Fragment key={sm.num}>
                <StepDot s={sm.num} label={sm.label} Icon={sm.icon} />
                {i < STEP_META.length - 1 && (
                  <div className="h-0.5 flex-1 bg-surface rounded-full overflow-hidden mx-1">
                    <div className={`h-full bg-accent transition-all duration-500 ease-out ${step > sm.num ? 'w-full' : 'w-0'}`} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Offline */}
        {!navigator.onLine && (
          <div className="mx-4 mt-3 px-3 py-2 bg-status-warning-bg border border-status-warning/20 rounded-lg flex items-center gap-2 flex-shrink-0">
            <WifiOff size={14} className="text-status-warning" />
            <span className="text-[10px] font-medium text-status-warning">Mode hors-ligne</span>
          </div>
        )}

        {/* ─── BODY ─── */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">

          {/* STEP 1 — Identité & Localisation */}
          {step === 1 && (
            <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
              {/* Nom + Téléphone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Nom *</label>
                  <input type="text" value={formData.nomProspect} onChange={e => set('nomProspect', e.target.value)}
                    placeholder="Ex: Makaya" className={inputCls('nomProspect')} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Téléphone *</label>
                  <input type="tel" value={formData.telephoneProspect} onChange={e => set('telephoneProspect', e.target.value)}
                    placeholder="06XXXXXXX" maxLength={12} className={inputCls('telephoneProspect')} />
                </div>
              </div>

              {/* Prénom + Sexe */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Prénom *</label>
                  <input type="text" value={formData.prenomProspect} onChange={e => set('prenomProspect', e.target.value)}
                    placeholder="Prénom" className={inputCls('prenomProspect')} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Sexe</label>
                  <div className="flex gap-1.5">
                    {[{ v: 'M', l: 'H' }, { v: 'F', l: 'F' }].map(o => (
                      <button key={o.v} type="button" onClick={() => set('sexe', formData.sexe === o.v ? '' : o.v)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                          formData.sexe === o.v
                            ? 'bg-accent/10 border-accent/50 text-accent'
                            : 'bg-surface border-edge text-content-muted hover:border-edge-strong'
                        }`}>{o.l}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Adresse */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Adresse</label>
                <input type="text" value={formData.adresseProspect} onChange={e => set('adresseProspect', e.target.value)}
                  placeholder="Quartier, rue..." className={inputCls()} />
              </div>

              {/* Localisation cascade */}
              <div className="bg-surface-base/50 p-3 rounded-xl border border-edge">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <MapPin size={12} className="text-accent" />
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Localisation</span>
                </div>
                
                <div className="space-y-2.5">
                  <SearchableSelect 
                    label="" 
                    name="villeId" 
                    options={villeOptions} 
                    value={formData.villeId}
                    onChange={v => { set('villeId', String(v)); set('arrondissementId', ''); set('marcheId', ''); }}
                    placeholder="Sélectionner la ville..." 
                    variant="dark" 
                    showAvatarInTrigger={false}
                    icon={MapPin}
                  />
                  
                  <SearchableSelect 
                    label="" 
                    name="arrondissementId" 
                    options={arrondissementOptions} 
                    value={formData.arrondissementId}
                    onChange={v => { set('arrondissementId', String(v)); set('marcheId', ''); }}
                    placeholder={!formData.villeId ? 'Sélectionnez une ville d\'abord' : 'Sélectionner l\'arrondissement...'}
                    disabled={!formData.villeId} 
                    isLoading={loadingArrondissements} 
                    variant="dark" 
                    showAvatarInTrigger={false}
                    icon={Building2}
                  />
                  
                  <SearchableSelect 
                    label="" 
                    name="marcheId" 
                    options={marcheOptions} 
                    value={formData.marcheId}
                    onChange={v => set('marcheId', String(v))}
                    placeholder={!formData.arrondissementId ? 'Sélectionnez un arrondissement d\'abord' : 'Sélectionner le marché...'}
                    disabled={!formData.arrondissementId} 
                    isLoading={loadingMarches} 
                    variant="dark" 
                    showAvatarInTrigger={false}
                    icon={Store}
                  />
                </div>
              </div>

            </div>
          )}

          {/* STEP 2 — Activité */}
          {step === 2 && (
            <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
              <SearchableSelect label="Type d'activité" name="typeActivite" options={activiteOptions}
                value={formData.typeActivite} onChange={v => set('typeActivite', String(v))}
                placeholder="Sélectionner..." variant="dark" showAvatarInTrigger={false} />

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Activité principale</label>
                <input type="text" value={formData.activitePrincipale} onChange={e => set('activitePrincipale', e.target.value)}
                  placeholder="Ex: Vente de vêtements" className={inputCls()} />
              </div>

              <SearchableSelect label="Ancienneté" name="ancienneteActivite" options={ancienneteOptions}
                value={formData.ancienneteActivite} onChange={v => set('ancienneteActivite', String(v))}
                placeholder="Sélectionner..." variant="dark" showAvatarInTrigger={false} />

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Description</label>
                <textarea value={formData.descriptionActivite} onChange={e => set('descriptionActivite', e.target.value)}
                  placeholder="Détails sur l'activité..." rows={3} className={`${inputCls()} resize-none`} />
              </div>
            </div>
          )}

          {/* STEP 3 — Finance & Notes */}
          {step === 3 && (
            <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
              {/* Revenue toggle */}
              <div className="space-y-2 bg-surface-base/50 p-3 rounded-xl border border-edge">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Revenus</span>
                  <div className="flex bg-surface p-0.5 rounded-lg border border-edge">
                    {['Mensuel', 'Journalier'].map(t => (
                      <button key={t} type="button" onClick={() => set('typeRevenu', t)}
                        className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                          formData.typeRevenu === t ? 'bg-accent text-white shadow' : 'text-content-muted hover:text-white'
                        }`}>{t}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {formData.typeRevenu === 'Journalier' ? (
                    <div className="space-y-1">
                      <label className="text-[10px] text-content-muted font-medium">Revenu/jour (FCFA)</label>
                      <input inputMode="numeric" pattern="[0-9]*" value={formData.revenuJournalier} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const j = e.target.value.replace(/[^0-9]/g, '');
                        const m = j ? (parseFloat(j) * 26).toString() : '';
                        setFormData(prev => ({ ...prev, revenuJournalier: j, revenuEstime: m }));
                      }} placeholder="Ex: 5 000" className={inputCls()} />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-[10px] text-content-muted font-medium">Revenu/mois (FCFA)</label>
                      <input inputMode="numeric" pattern="[0-9]*" value={formData.revenuEstime} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); set('revenuEstime', v); }}
                        placeholder="Ex: 150 000" className={inputCls()} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[10px] text-content-muted font-medium">CA mensuel (FCFA)</label>
                    <input inputMode="numeric" pattern="[0-9]*" value={formData.chiffreAffairesMensuel} onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ''); set('chiffreAffairesMensuel', v); }}
                      placeholder="Ex: 500 000" className={inputCls()} />
                  </div>
                </div>

                {formData.typeRevenu === 'Journalier' && formData.revenuJournalier && (
                  <div className="bg-accent/10 px-3 py-2 rounded-lg border border-accent/20 text-[10px] text-accent flex items-center gap-1.5">
                    <TrendingUp size={10} />
                    <span>{parseFloat(formData.revenuJournalier).toLocaleString()} × 26j = <b>{(parseFloat(formData.revenuJournalier) * 26).toLocaleString()} FCFA/mois</b></span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Commentaires agent</label>
                <textarea value={formData.commentairesAgent} onChange={e => set('commentairesAgent', e.target.value)}
                  placeholder="Notes de terrain..." rows={2} className={`${inputCls()} resize-none`} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-content-muted uppercase tracking-wider">Observations</label>
                <textarea value={formData.observations} onChange={e => set('observations', e.target.value)}
                  placeholder="Observations..." rows={2} className={`${inputCls()} resize-none`} />
              </div>
            </div>
          )}
        </div>

        {/* ─── FOOTER ─── */}
        <div className="border-t border-edge p-4 flex gap-3 flex-shrink-0 bg-surface-base/80">
          {step > 1 ? (
            <button type="button" onClick={handleBack}
              className="px-4 py-3 bg-surface hover:bg-surface-elevated border border-edge rounded-xl text-content-primary text-xs font-bold flex items-center gap-1.5 transition-colors">
              <ArrowLeft size={14} /> Retour
            </button>
          ) : (
            <button type="button" onClick={onClose}
              className="px-4 py-3 bg-surface hover:bg-surface-elevated border border-edge rounded-xl text-content-primary text-xs font-bold transition-colors">
              Annuler
            </button>
          )}

          {step < TOTAL_STEPS ? (
            <button type="button" onClick={handleNext}
              className="flex-1 py-3 bg-accent hover:bg-accent active:bg-accent rounded-xl text-white font-bold text-sm shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2">
              Suivant <ArrowRight size={14} />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="flex-1 py-3 bg-accent hover:bg-accent active:bg-accent rounded-xl text-white font-bold text-sm shadow-lg shadow-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              Valider la prospection
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
