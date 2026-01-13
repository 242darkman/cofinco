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
    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-card transition-all duration-200 shadow-sm hover:shadow-md">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-lg">{title}</div>
            {description && <div className="text-sm text-muted-foreground font-normal mt-0.5">{description}</div>}
          </div>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-5 space-y-6 border-t border-slate-100 dark:border-slate-800">
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
  <div className="flex items-center justify-between py-2">
    <div className="space-y-0.5 pr-4">
      <label className="text-base font-medium flex items-center">
        {label}
        {scope && <ScopeBadge type={scope} />}
      </label>
      <div className="text-xs text-muted-foreground leading-snug">{description}</div>
    </div>
    <Switch checked={checked} onChange={onChange} />
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
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      
      {/* Header Warning */}
      <div className="bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex gap-4 items-start">
        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
        </div>
        <div>
          <h4 className="font-semibold text-amber-800 dark:text-amber-400">Zone d'administration sensible</h4>
          <p className="text-sm text-amber-700 dark:text-amber-500 mt-1 leading-relaxed">
            Les modifications appliquées ici impactent immédiatement toutes les opérations de coffre et de transfert pour cette agence.
          </p>
        </div>
      </div>

      {/* 1. Sécurité & Workflow */}
      <ConfigSection 
        title="Sécurité et Workflow" 
        icon={ShieldAlert} 
        defaultOpen
        description="Gérez les accès, les horaires et les règles de validation"
      >
        <ConfigToggle 
            label="Double Validation"
            description="Exiger une validation par un supérieur pour les montants importants"
            checked={config.separationInitiateurValideur}
            onChange={(c) => setConfig(p => ({ ...p, separationInitiateurValideur: c }))}
            scope="guichet"
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <FormField 
                label="Seuil Double Validation (FCFA)"
                name="seuilDoubleValidation"
                type="number"
                value={config.seuilDoubleValidation}
                onChange={(e) => setConfig(p => ({ ...p, seuilDoubleValidation: Number(e.target.value) }))}
                helperText={<div className="flex items-center gap-2 mt-1">
                  <ScopeBadge type="guichet" />
                  <span>Validation requise au-delà de ce montant</span>
                </div>}
            />
            <FormField 
                label="Tentatives Max / Jour"
                name="tentativesMax"
                type="number"
                value={config.tentativesMaxParJour}
                onChange={(e) => setConfig(p => ({ ...p, tentativasMaxParJour: Number(e.target.value) }))}
                helperText={<div className="flex items-center gap-2 mt-1">
                   <ScopeBadge type="global" />
                   <span>Blocage automatique après X échecs</span>
                </div>}
            />
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <h5 className="font-medium mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" /> Horaires d'Ouverture <ScopeBadge type="global" />
            </h5>
            <div className="flex gap-4 mb-4">
                <div className="flex-1">
                    <label className="text-xs font-semibold mb-1 block">Ouverture</label>
                    <input 
                        type="time" 
                        value={config.horairesOuverture.debut}
                        onChange={(e) => setConfig(p => ({ ...p, horairesOuverture: { ...p.horairesOuverture, debut: e.target.value } }))}
                        className="w-full p-2 rounded-md border bg-background"
                    />
                </div>
                <div className="flex-1">
                    <label className="text-xs font-semibold mb-1 block">Fermeture</label>
                    <input 
                        type="time" 
                        value={config.horairesOuverture.fin}
                        onChange={(e) => setConfig(p => ({ ...p, horairesOuverture: { ...p.horairesOuverture, fin: e.target.value } }))}
                        className="w-full p-2 rounded-md border bg-background"
                    />
                </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
                {DAYS.map(day => (
                    <button
                        key={day}
                        onClick={() => toggleDay(day)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-medium transition-all text-white", // Increased specificity for text color
                            config.joursOuvrables.includes(day) 
                                ? "bg-primary shadow-sm hover:bg-primary/90" 
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200"
                        )}
                        style={config.joursOuvrables.includes(day) ? { color: 'white' } : {}} // Forced inline style fallback
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
        description="Plafonds et montants autorisés pour les transferts"
      >
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField 
                label="Montant Min par Transfert"
                name="minTransfert"
                type="number"
                value={config.montantMinTransfert}
                onChange={(e) => setConfig(p => ({ ...p, montantMinTransfert: Number(e.target.value) }))}
                helperText={<div className="flex items-center gap-2 mt-1"><ScopeBadge type="guichet" /></div>}
            />
             <FormField 
                label="Montant Max par Transfert"
                name="maxTransfert"
                type="number"
                placeholder="Illimité"
                value={config.montantMaxTransfert || ''}
                onChange={(e) => setConfig(p => ({ ...p, montantMaxTransfert: e.target.value ? Number(e.target.value) : null }))}
                helperText={<div className="flex items-center gap-2 mt-1"><ScopeBadge type="guichet" /></div>}
            />
             <FormField 
                label="Plafond Journalier Sortant"
                name="plafondOut"
                type="number"
                placeholder="Illimité"
                value={config.plafondJournalierSortant || ''}
                onChange={(e) => setConfig(p => ({ ...p, plafondJournalierSortant: e.target.value ? Number(e.target.value) : null }))}
                helperText={<div className="flex items-center gap-2 mt-1"><ScopeBadge type="global" /> <span>Tous débits confondus</span></div>}
            />
             <FormField 
                label="Plafond Journalier Entrant"
                name="plafondIn"
                type="number"
                placeholder="Illimité"
                value={config.plafondJournalierEntrant || ''}
                onChange={(e) => setConfig(p => ({ ...p, plafondJournalierEntrant: e.target.value ? Number(e.target.value) : null }))}
                helperText={<div className="flex items-center gap-2 mt-1"><ScopeBadge type="global" /> <span>Tous crédits confondus</span></div>}
            />
         </div>
      </ConfigSection>

      {/* 3. Alertes et Surveillance */}
      <ConfigSection 
        title="Alertes et Seuils" 
        icon={Bell}
        description="Configuration des niveaux d'alerte sur le solde"
      >
         <ConfigToggle 
            label="Alertes Email"
            description="Envoyer des emails aux administrateurs en cas d'alerte critique"
            checked={config.alerteEmailActif}
            onChange={(c) => setConfig(p => ({ ...p, alerteEmailActif: c }))}
            scope="global"
         />

         <div className="grid grid-cols-1 gap-6 pt-2">
            <div>
                 <label className="text-sm font-medium mb-2 block text-amber-600">Seuil d'Alerte Basse (Orange)</label>
                 <div className="flex gap-4 items-center">
                    <input 
                        type="range" min="0" max="10000000" step="100000"
                        value={config.seuilSoldeMin}
                        onChange={(e) => setConfig(p => ({ ...p, seuilSoldeMin: Number(e.target.value) }))}
                        className="flex-1 h-2 bg-amber-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="font-mono text-sm w-32 text-right">{config.seuilSoldeMin.toLocaleString()} FCFA</span>
                 </div>
            </div>

            <div>
                 <label className="text-sm font-medium mb-2 block text-red-600">Seuil Critique (Rouge)</label>
                 <div className="flex gap-4 items-center">
                    <input 
                        type="range" min="0" max="5000000" step="50000"
                        value={config.seuilSoldeCritique}
                        onChange={(e) => setConfig(p => ({ ...p, seuilSoldeCritique: Number(e.target.value) }))}
                        className="flex-1 h-2 bg-red-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="font-mono text-sm w-32 text-right">{config.seuilSoldeCritique.toLocaleString()} FCFA</span>
                 </div>
            </div>
         </div>
      </ConfigSection>

      {/* 4. Audit et Conformité */}
      <ConfigSection 
        title="Audit et Conformité" 
        icon={FileCheck}
        description="Traçabilité et règles de conformité"
      >
        <ConfigToggle 
            label="Justificatif Obligatoire"
            description="Exiger un document joint pour tout mouvement sortant"
            checked={config.justificatifObligatoire}
            onChange={(c) => setConfig(p => ({ ...p, justificatifObligatoire: c }))}
            scope="guichet"
        />
        <ConfigToggle 
            label="Double Comptage"
            description="Exiger la validation de deux personnes pour les inventaires"
            checked={config.comptageDoublePersonne}
            onChange={(c) => setConfig(p => ({ ...p, comptageDoublePersonne: c }))}
            scope="audit"
        />
         <div className="pt-2">
            <FormField 
                label="Billetage obligatoire si montant >"
                name="billetageLimit"
                type="number"
                placeholder="Toujours optionnel"
                value={config.billetageObligatoireSiMontantSup || ''}
                onChange={(e) => setConfig(p => ({ ...p, billetageObligatoireSiMontantSup: e.target.value ? Number(e.target.value) : null }))}
                helperText={<div className="flex items-center gap-2 mt-1">
                   <ScopeBadge type="audit" />
                   <span>Exiger le détail des billets pour les gros montants</span>
                </div>}
            />
         </div>
      </ConfigSection>

       {/* Floating Save Button on Mobile, regular on Desktop if preferred, but here sticky bottom is nice */}
       <div className="fixed bottom-6 left-0 right-0 px-4 md:static md:p-0 flex justify-center z-50 pointer-events-none">
            <Button 
                onClick={handleSave} 
                className={cn(
                    "shadow-xl rounded-full px-8 py-6 text-lg font-semibold pointer-events-auto transition-transform active:scale-95",
                    saving ? "opacity-80" : "hover:scale-105"
                )}
                disabled={saving || loading}
                isLoading={saving}
            >
                <Save className="mr-2 h-5 w-5" />
                Enregistrer la configuration
            </Button>
       </div>

    </div>
  );
}
