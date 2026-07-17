import { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Button, Switch } from "@/components/ui";
import { Save, ShieldAlert, AlertTriangle, Clock, Coins, FileCheck, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { coffreApi } from '@/lib/api-client';
import { cn } from "../../../lib/utils";

interface CoffreAdminPanelProps {
  agenceId: string;
}

interface ConfigState {
  seuilDoubleValidation: number;
  separationInitiateurValideur: boolean;
  verouillageApresEchec: boolean;
  horairesOuverture: { debut: string; fin: string };
  joursOuvrables: string[];
  tentativesMaxParJour: number;
  montantMaxTransfert: number | null;
  montantMinTransfert: number;
  plafondJournalierSortant: number | null;
  plafondJournalierEntrant: number | null;
  seuilSoldeMin: number;
  seuilSoldeCritique: number;
  alerteEmailActif: boolean;
  justificatifObligatoire: boolean;
  billetageObligatoireSiMontantSup: number | null;
  comptageDoublePersonne: boolean;
  actif: boolean;
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAYS_FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Scope Badge
const ScopeBadge = ({ type }: { type: 'global' | 'guichet' | 'audit' }) => {
  const styles = {
    global: "bg-status-info-bg text-status-info",
    guichet: "bg-status-info-bg text-status-info",
    audit: "bg-surface-subtle/40 text-content-muted"
  };
  const labels = { global: "Global", guichet: "Guichet", audit: "Audit" };
  return <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ml-1.5", styles[type])}>{labels[type]}</span>;
};

// Section Header
const SectionHeader = ({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) => (
  <div className="flex items-center gap-2 pb-2 border-b border-edge-subtle mb-2.5">
    <Icon className="h-3.5 w-3.5 text-accent" />
    <span className="text-xs font-bold text-content-primary uppercase tracking-wide">{title}</span>
    <span className="text-[11px] text-content-muted">— {desc}</span>
  </div>
);

// Toggle Row
const ToggleRow = ({ label, desc, checked, onChange, scope }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; scope?: 'global' | 'guichet' | 'audit';
}) => (
  <div className="flex items-center justify-between gap-2">
    <div className="min-w-0 flex-1">
      <span className="text-[11px] font-medium text-content-primary flex items-center">{label}{scope && <ScopeBadge type={scope} />}</span>
      <span className="text-[10px] text-content-muted block truncate">{desc}</span>
    </div>
    <Switch checked={checked} onChange={onChange} size="sm" />
  </div>
);

// Mini Input
const MiniInput = ({ label, value, onChange, placeholder }: {
  label: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string;
}) => (
  <div className="flex-1">
    <label className="text-[10px] text-content-muted uppercase block mb-1 truncate">{label}</label>
    <input
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => { e.target.value = e.target.value.replace(/[^0-9]/g, ''); onChange(e); }}
      placeholder={placeholder}
      className="w-full px-2 py-1.5 text-[11px] rounded border border-edge bg-surface-base/50 text-content-primary placeholder:text-content-muted focus:border-accent/50 focus:outline-none"
    />
  </div>
);

export function CoffreAdminPanel({ agenceId }: CoffreAdminPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState<ConfigState>({
    seuilDoubleValidation: 1000000,
    separationInitiateurValideur: true,
    verouillageApresEchec: true,
    horairesOuverture: { debut: "08:00", fin: "18:00" },
    joursOuvrables: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
    tentativesMaxParJour: 20,
    montantMaxTransfert: null,
    montantMinTransfert: 100,
    plafondJournalierSortant: null,
    plafondJournalierEntrant: null,
    seuilSoldeMin: 1000000,
    seuilSoldeCritique: 100000,
    alerteEmailActif: false,
    justificatifObligatoire: false,
    billetageObligatoireSiMontantSup: null,
    comptageDoublePersonne: false,
    actif: true
  });

  useEffect(() => { loadConfig(); }, [agenceId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await coffreApi.getConfig(agenceId);
      setConfig(prev => ({
        ...prev, ...data,
        seuilDoubleValidation: Number(data.seuilDoubleValidation || prev.seuilDoubleValidation),
        montantMaxTransfert: data.montantMaxTransfert ? Number(data.montantMaxTransfert) : null,
        seuilSoldeMin: Number(data.seuilSoldeMin || prev.seuilSoldeMin),
        seuilSoldeCritique: Number(data.seuilSoldeCritique || prev.seuilSoldeCritique),
        tentativesMaxParJour: Number(data.tentativesMaxParJour || prev.tentativesMaxParJour),
        montantMinTransfert: Number(data.montantMinTransfert || prev.montantMinTransfert),
        horairesOuverture: data.horairesOuverture || prev.horairesOuverture,
        joursOuvrables: data.joursOuvrables || prev.joursOuvrables,
      }));
    } catch { toast.error("Impossible de charger la configuration."); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await coffreApi.updateConfig({
        agenceId, ...config,
        seuilDoubleValidation: String(config.seuilDoubleValidation),
        tentativesMaxParJour: String(config.tentativesMaxParJour),
        montantMinTransfert: String(config.montantMinTransfert),
        seuilSoldeMin: String(config.seuilSoldeMin),
        seuilSoldeCritique: String(config.seuilSoldeCritique),
        montantMaxTransfert: config.montantMaxTransfert ? String(config.montantMaxTransfert) : null,
        plafondJournalierSortant: config.plafondJournalierSortant ? String(config.plafondJournalierSortant) : null,
        plafondJournalierEntrant: config.plafondJournalierEntrant ? String(config.plafondJournalierEntrant) : null,
        billetageObligatoireSiMontantSup: config.billetageObligatoireSiMontantSup ? String(config.billetageObligatoireSiMontantSup) : null,
      });
      toast.success("Configuration sauvegardée");
    } catch { toast.error("Échec de la sauvegarde"); }
    finally { setSaving(false); }
  };

  const toggleDay = (dayFull: string) => {
    setConfig(prev => ({
      ...prev,
      joursOuvrables: prev.joursOuvrables.includes(dayFull)
        ? prev.joursOuvrables.filter(d => d !== dayFull)
        : [...prev.joursOuvrables, dayFull]
    }));
  };

  if (loading) return <div className="flex justify-center p-6"><Spinner size="sm" tone="accent" /></div>;

  return (
    <div className="flex flex-col h-full p-2 space-y-2">
      {/* Warning Banner */}
      <div className="bg-status-warning-bg border border-status-warning/30 rounded px-3 py-1.5 flex gap-2 items-center shrink-0">
        <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
        <span className="font-semibold text-[11px] text-status-warning">Zone d'administration sensible</span>
      </div>

      {/* Main Grid - 2x2 */}
      <div className="flex-1 grid grid-cols-2 gap-2">
        {/* 1. Sécurité & Workflow */}
        <div className="bg-surface-base/40 border border-edge/40 rounded-lg p-3">
          <SectionHeader icon={ShieldAlert} title="Sécurité" desc="Workflow" />

          <ToggleRow
            label="Double Validation"
            desc="Validation supérieur requise"
            checked={config.separationInitiateurValideur}
            onChange={(c) => setConfig(p => ({ ...p, separationInitiateurValideur: c }))}
            scope="guichet"
          />

          <div className="flex gap-2 mt-2">
            <MiniInput label="Seuil (FCFA)" value={config.seuilDoubleValidation} onChange={(e) => setConfig(p => ({ ...p, seuilDoubleValidation: Number(e.target.value) }))} />
            <MiniInput label="Max/Jour" value={config.tentativesMaxParJour} onChange={(e) => setConfig(p => ({ ...p, tentativesMaxParJour: Number(e.target.value) }))} />
          </div>

          {/* Horaires inline */}
          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-edge-subtle">
            <Clock className="h-3 w-3 text-content-muted" />
            <input type="time" value={config.horairesOuverture.debut} onChange={(e) => setConfig(p => ({ ...p, horairesOuverture: { ...p.horairesOuverture, debut: e.target.value } }))}
              className="px-1.5 py-1 text-[11px] rounded border border-edge bg-surface-base/50 text-content-primary w-[70px]" />
            <span className="text-content-muted text-[11px]">→</span>
            <input type="time" value={config.horairesOuverture.fin} onChange={(e) => setConfig(p => ({ ...p, horairesOuverture: { ...p.horairesOuverture, fin: e.target.value } }))}
              className="px-1.5 py-1 text-[11px] rounded border border-edge bg-surface-base/50 text-content-primary w-[70px]" />
          </div>

          <div className="flex gap-1 mt-1.5">
            {DAYS.map((day, i) => (
              <button key={day} onClick={() => toggleDay(DAYS_FULL[i])}
                className={cn("flex-1 py-1 rounded text-[10px] font-medium transition-all",
                  config.joursOuvrables.includes(DAYS_FULL[i]) ? "bg-accent text-white" : "bg-surface text-content-muted hover:bg-surface-elevated"
                )}>
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Limites Financières */}
        <div className="bg-surface-base/40 border border-edge/40 rounded-lg p-3">
          <SectionHeader icon={Coins} title="Limites" desc="Plafonds" />

          <div className="grid grid-cols-2 gap-2">
            <MiniInput label="Min Transfert" value={config.montantMinTransfert} onChange={(e) => setConfig(p => ({ ...p, montantMinTransfert: Number(e.target.value) }))} />
            <MiniInput label="Max Transfert" placeholder="∞" value={config.montantMaxTransfert || ''} onChange={(e) => setConfig(p => ({ ...p, montantMaxTransfert: e.target.value ? Number(e.target.value) : null }))} />
            <MiniInput label="Plafond Sortant/J" placeholder="∞" value={config.plafondJournalierSortant || ''} onChange={(e) => setConfig(p => ({ ...p, plafondJournalierSortant: e.target.value ? Number(e.target.value) : null }))} />
            <MiniInput label="Plafond Entrant/J" placeholder="∞" value={config.plafondJournalierEntrant || ''} onChange={(e) => setConfig(p => ({ ...p, plafondJournalierEntrant: e.target.value ? Number(e.target.value) : null }))} />
          </div>
        </div>

        {/* 3. Alertes */}
        <div className="bg-surface-base/40 border border-edge/40 rounded-lg p-3">
          <SectionHeader icon={Bell} title="Alertes" desc="Seuils" />

          <ToggleRow
            label="Alertes Email"
            desc="Notifier admins"
            checked={config.alerteEmailActif}
            onChange={(c) => setConfig(p => ({ ...p, alerteEmailActif: c }))}
            scope="global"
          />

          <div className="mt-2 space-y-2">
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-status-warning">Alerte (Orange)</span>
                <span className="font-mono text-status-warning">{config.seuilSoldeMin.toLocaleString()} F</span>
              </div>
              <input type="range" min="0" max="10000000" step="100000" value={config.seuilSoldeMin}
                onChange={(e) => setConfig(p => ({ ...p, seuilSoldeMin: Number(e.target.value) }))}
                className="w-full h-1.5 bg-status-warning-bg rounded appearance-none cursor-pointer accent-amber-500" />
            </div>
            <div>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-status-danger">Critique (Rouge)</span>
                <span className="font-mono text-status-danger">{config.seuilSoldeCritique.toLocaleString()} F</span>
              </div>
              <input type="range" min="0" max="5000000" step="50000" value={config.seuilSoldeCritique}
                onChange={(e) => setConfig(p => ({ ...p, seuilSoldeCritique: Number(e.target.value) }))}
                className="w-full h-1.5 bg-status-danger-bg rounded appearance-none cursor-pointer accent-red-500" />
            </div>
          </div>
        </div>

        {/* 4. Audit */}
        <div className="bg-surface-base/40 border border-edge/40 rounded-lg p-3">
          <SectionHeader icon={FileCheck} title="Audit" desc="Conformité" />

          <div className="space-y-1.5">
            <ToggleRow label="Justificatif Obligatoire" desc="Document joint (Sortie)" checked={config.justificatifObligatoire}
              onChange={(c) => setConfig(p => ({ ...p, justificatifObligatoire: c }))} scope="guichet" />
            <ToggleRow label="Double Comptage" desc="Validation 2 personnes" checked={config.comptageDoublePersonne}
              onChange={(c) => setConfig(p => ({ ...p, comptageDoublePersonne: c }))} scope="audit" />
          </div>

          <div className="mt-2">
            <MiniInput label="Billetage obligatoire si >" placeholder="Optionnel"
              value={config.billetageObligatoireSiMontantSup || ''}
              onChange={(e) => setConfig(p => ({ ...p, billetageObligatoireSiMontantSup: e.target.value ? Number(e.target.value) : null }))} />
          </div>
        </div>
      </div>

      {/* Save Button - Bottom right corner */}
      <div className="absolute bottom-3 right-3">
        <Button onClick={handleSave} disabled={saving || loading} isLoading={saving}
          className="shadow-lg rounded-full px-4 py-2 h-auto text-[11px] font-semibold bg-accent hover:bg-accent/90">
          <Save className="mr-1.5 h-3.5 w-3.5" /> Enregistrer
        </Button>
      </div>
    </div>
  );
}
