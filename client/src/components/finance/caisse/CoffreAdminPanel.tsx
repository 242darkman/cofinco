import { useState, useEffect } from 'react';
import { Card, Button, Switch, FormField, Badge } from "@/components/ui";
import { 
  Loader2, Save, ShieldAlert, AlertTriangle, Clock, 
  Coins, FileCheck, Lock, Bell, ChevronDown, ChevronUp 
} from 'lucide-react';
import { toast } from 'sonner';
import { coffreApi } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from "../../../lib/utils";

interface CoffreAdminPanelProps {
  agenceId: string;
}

interface ConfigState {
  // Security
  seuilDoubleValidation: number;
  separationInitiateurValideur: boolean;
  verouillageApresEchec: boolean;
  horairesOuverture: { debut: string; fin: string };
  joursOuvrables: string[];
  tentativesMaxParJour: number;

  // Limits
  montantMaxTransfert: number | null;
  montantMinTransfert: number;
  plafondJournalierSortant: number | null;
  plafondJournalierEntrant: number | null;

  // Alerts
  seuilSoldeMin: number;
  seuilSoldeCritique: number;
  alerteEmailActif: boolean;

  // Audit
  justificatifObligatoire: boolean;
  billetageObligatoireSiMontantSup: number | null;
  comptageDoublePersonne: boolean;

  actif: boolean;
}

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Scope Badge Component
const ScopeBadge = ({ type }: { type: 'global' | 'guichet' | 'audit' }) => {
  const styles = {
    global: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200",
    guichet: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200",
    audit: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200"
  };
  
  const labels = {
    global: "Sécurité Globale",
    guichet: "Opérations Guichet",
    audit: "Audit & Trace"
  };

  return (
    <span className={cn("text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ml-2 align-middle", styles[type])}>
      {labels[type]}
    </span>
  );
};

// Reusable Section Component
const ConfigSection = ({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = false,
  description
}: { 
  title: string; 
  icon: any; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  description?: string; 
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-card transition-all duration-200 shadow-sm hover:shadow-md h-fit">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-primary/10 rounded-md text-primary shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-sm">{title}</div>
            {description && <div className="text-xs text-muted-foreground font-normal mt-0.5 line-clamp-1">{description}</div>}
          </div>
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-3 space-y-4 border-t border-slate-100 dark:border-slate-800">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Reusable Toggle Item
const ConfigToggle = ({
  label,
  description,
  checked,
  onChange,
  scope
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  scope?: 'global' | 'guichet' | 'audit';
}) => (
  <div className="flex items-center justify-between py-1.5">
    <div className="space-y-0.5 pr-4 flex-1">
      <label className="text-sm font-medium flex items-center">
        {label}
        {scope && <ScopeBadge type={scope} />}
      </label>
      <div className="text-[10px] text-muted-foreground leading-snug">{description}</div>
    </div>
    <Switch checked={checked} onChange={onChange} size="sm" />
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

  useEffect(() => {
    loadConfig();
  }, [agenceId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await coffreApi.getConfig(agenceId);
      // Merge with defaults to handle missing new fields safely
      setConfig(prev => ({
        ...prev,
        ...data,
        // Ensure numeric conversions
        seuilDoubleValidation: Number(data.seuilDoubleValidation || prev.seuilDoubleValidation),
        montantMaxTransfert: data.montantMaxTransfert ? Number(data.montantMaxTransfert) : null,
        seuilSoldeMin: Number(data.seuilSoldeMin || prev.seuilSoldeMin),
        seuilSoldeCritique: Number(data.seuilSoldeCritique || prev.seuilSoldeCritique),
        tentativesMaxParJour: Number(data.tentativesMaxParJour || prev.tentativesMaxParJour),
        montantMinTransfert: Number(data.montantMinTransfert || prev.montantMinTransfert),
        // Ensure JSON objects
        horairesOuverture: data.horairesOuverture || prev.horairesOuverture,
        joursOuvrables: data.joursOuvrables || prev.joursOuvrables,
      }));
    } catch (error) {
      console.error('Erreur chargement config:', error);
      toast.error("Impossible de charger la configuration.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        agenceId,
        ...config,
        // Convert numbers to strings for backend if needed
        seuilDoubleValidation: String(config.seuilDoubleValidation),
        tentativesMaxParJour: String(config.tentativesMaxParJour),
        montantMinTransfert: String(config.montantMinTransfert),
        seuilSoldeMin: String(config.seuilSoldeMin),
        seuilSoldeCritique: String(config.seuilSoldeCritique),
        montantMaxTransfert: config.montantMaxTransfert ? String(config.montantMaxTransfert) : null,
        plafondJournalierSortant: config.plafondJournalierSortant ? String(config.plafondJournalierSortant) : null,
        plafondJournalierEntrant: config.plafondJournalierEntrant ? String(config.plafondJournalierEntrant) : null,
        billetageObligatoireSiMontantSup: config.billetageObligatoireSiMontantSup ? String(config.billetageObligatoireSiMontantSup) : null,
      };

      await coffreApi.updateConfig(payload);
      toast.success("Configuration sauvegardée avec succès");
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast.error("Échec de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: string) => {
    setConfig(prev => {
      const exists = prev.joursOuvrables.includes(day);
      if (exists) return { ...prev, joursOuvrables: prev.joursOuvrables.filter(d => d !== day) };
      return { ...prev, joursOuvrables: [...prev.joursOuvrables, day] };
    });
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto px-1 pb-24 space-y-3 custom-scrollbar">
      
      {/* Header Warning - Compact */}
      <div className="bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex gap-3 items-center shrink-0">
        <div className="p-1.5 bg-amber-100 dark:bg-amber-900/50 rounded-full shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-amber-800 dark:text-amber-400 flex items-center gap-2">
            Zone d'administration sensible
          </h4>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-8">
        {/* 1. Sécurité & Workflow */}
        <ConfigSection 
          title="Sécurité et Workflow" 
          icon={ShieldAlert} 
          defaultOpen
          description="Contrôle d'accès et validation"
        >
          <ConfigToggle 
              label="Double Validation"
              description="Validation par supérieur requise"
              checked={config.separationInitiateurValideur}
              onChange={(c) => setConfig(p => ({ ...p, separationInitiateurValideur: c }))}
              scope="guichet"
          />
          
          <div className="grid grid-cols-2 gap-3 pt-1">
              <FormField 
                  label="Seuil Double Val. (FCFA)"
                  name="seuilDoubleValidation"
                  type="number"
                  value={config.seuilDoubleValidation}
                  onChange={(e) => setConfig(p => ({ ...p, seuilDoubleValidation: Number(e.target.value) }))}
                  className="mb-0"
              />
              <FormField 
                  label="Tentatives Max / Jour"
                  name="tentativesMax"
                  type="number"
                  value={config.tentativesMaxParJour}
                  onChange={(e) => setConfig(p => ({ ...p, tentativasMaxParJour: Number(e.target.value) }))}
                  className="mb-0"
              />
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <h5 className="font-medium mb-2 flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  Horaires d'Ouverture
              </h5>
              <div className="flex gap-2 mb-3">
                  <div className="flex-1">
                      <input 
                          type="time" 
                          value={config.horairesOuverture.debut}
                          onChange={(e) => setConfig(p => ({ ...p, horairesOuverture: { ...p.horairesOuverture, debut: e.target.value } }))}
                          className="w-full p-1.5 text-xs rounded-md border bg-background"
                      />
                  </div>
                  <div className="flex-1">
                      <input 
                          type="time" 
                          value={config.horairesOuverture.fin}
                          onChange={(e) => setConfig(p => ({ ...p, horairesOuverture: { ...p.horairesOuverture, fin: e.target.value } }))}
                          className="w-full p-1.5 text-xs rounded-md border bg-background"
                      />
                  </div>
              </div>
              
              <div className="flex flex-wrap gap-1.5">
                  {DAYS.map(day => (
                      <button
                          key={day}
                          onClick={() => toggleDay(day)}
                          className={cn(
                              "px-2 py-1 rounded text-[10px] font-medium transition-all",
                              config.joursOuvrables.includes(day) 
                                  ? "bg-primary text-primary-foreground shadow-sm" 
                                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200"
                          )}
                      >
                          {day.slice(0, 3)}
                      </button>
                  ))}
              </div>
          </div>
        </ConfigSection>

        {/* 2. Limites Financières */}
        <ConfigSection 
          title="Limites Financières" 
          icon={Coins}
          description="Plafonds et seuils"
          defaultOpen
        >
           <div className="grid grid-cols-2 gap-3">
              <FormField 
                  label="Min par Transfert"
                  name="minTransfert"
                  type="number"
                  value={config.montantMinTransfert}
                  onChange={(e) => setConfig(p => ({ ...p, montantMinTransfert: Number(e.target.value) }))}
                  className="mb-0"
              />
               <FormField 
                  label="Max par Transfert"
                  name="maxTransfert"
                  type="number"
                  placeholder="Illimité"
                  value={config.montantMaxTransfert || ''}
                  onChange={(e) => setConfig(p => ({ ...p, montantMaxTransfert: e.target.value ? Number(e.target.value) : null }))}
                  className="mb-0"
              />
               <FormField 
                  label="Plafond Sortant /Jour"
                  name="plafondOut"
                  type="number"
                  placeholder="Illimité"
                  value={config.plafondJournalierSortant || ''}
                  onChange={(e) => setConfig(p => ({ ...p, plafondJournalierSortant: e.target.value ? Number(e.target.value) : null }))}
                  className="mb-0"
              />
               <FormField 
                  label="Plafond Entrant /Jour"
                  name="plafondIn"
                  type="number"
                  placeholder="Illimité"
                  value={config.plafondJournalierEntrant || ''}
                  onChange={(e) => setConfig(p => ({ ...p, plafondJournalierEntrant: e.target.value ? Number(e.target.value) : null }))}
                  className="mb-0"
              />
           </div>
        </ConfigSection>

        {/* 3. Alertes et Surveillance */}
        <ConfigSection 
          title="Alertes et Seuils" 
          icon={Bell}
          description="Niveaux d'alerte solde"
          defaultOpen
        >
           <ConfigToggle 
              label="Alertes Email"
              description="Notifier les admins"
              checked={config.alerteEmailActif}
              onChange={(c) => setConfig(p => ({ ...p, alerteEmailActif: c }))}
              scope="global"
           />

           <div className="space-y-3 pt-1">
              <div>
                   <label className="text-xs font-medium mb-1.5 block text-amber-600 flex justify-between">
                      <span>Seuil Alerte (Orange)</span>
                      <span className="font-mono">{config.seuilSoldeMin.toLocaleString()} F</span>
                   </label>
                   <input 
                       type="range" min="0" max="10000000" step="100000"
                       value={config.seuilSoldeMin}
                       onChange={(e) => setConfig(p => ({ ...p, seuilSoldeMin: Number(e.target.value) }))}
                       className="w-full h-1.5 bg-amber-100 rounded-lg appearance-none cursor-pointer"
                   />
              </div>

              <div>
                   <label className="text-xs font-medium mb-1.5 block text-red-600 flex justify-between">
                      <span>Seuil Critique (Rouge)</span>
                      <span className="font-mono">{config.seuilSoldeCritique.toLocaleString()} F</span>
                   </label>
                   <input 
                       type="range" min="0" max="5000000" step="50000"
                       value={config.seuilSoldeCritique}
                       onChange={(e) => setConfig(p => ({ ...p, seuilSoldeCritique: Number(e.target.value) }))}
                       className="w-full h-1.5 bg-red-100 rounded-lg appearance-none cursor-pointer"
                   />
              </div>
           </div>
        </ConfigSection>

        {/* 4. Audit et Conformité */}
        <ConfigSection 
          title="Audit et Conformité" 
          icon={FileCheck}
          description="Traçabilité"
          defaultOpen
        >
          <ConfigToggle 
              label="Justificatif Obligatoire"
              description="Doc joint requis (Sortie)"
              checked={config.justificatifObligatoire}
              onChange={(c) => setConfig(p => ({ ...p, justificatifObligatoire: c }))}
              scope="guichet"
          />
          <ConfigToggle 
              label="Double Comptage"
              description="Inventaire à 2 personnes"
              checked={config.comptageDoublePersonne}
              onChange={(c) => setConfig(p => ({ ...p, comptageDoublePersonne: c }))}
              scope="audit"
          />
           <div className="pt-1">
              <FormField 
                  label="Billetage obligatoire si >"
                  name="billetageLimit"
                  type="number"
                  placeholder="Optionnel"
                  value={config.billetageObligatoireSiMontantSup || ''}
                  onChange={(e) => setConfig(p => ({ ...p, billetageObligatoireSiMontantSup: e.target.value ? Number(e.target.value) : null }))}
                  className="mb-0"
              />
           </div>
        </ConfigSection>
      </div>

       {/* Floating Save Button */}
       <div className="fixed bottom-4 right-4 z-50">
            <Button 
                onClick={handleSave} 
                className={cn(
                    "shadow-xl rounded-full px-6 py-3 h-auto text-sm font-semibold transition-transform active:scale-95 bg-primary hover:bg-primary/90 text-primary-foreground",
                    saving ? "opacity-80" : "hover:scale-105"
                )}
                disabled={saving || loading}
                isLoading={saving}
            >
                <Save className="mr-2 h-4 w-4" />
                Enregistrer
            </Button>
       </div>

    </div>
  );
}
