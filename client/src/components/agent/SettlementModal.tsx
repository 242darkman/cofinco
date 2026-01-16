import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  MapPin, 
  CheckCircle, 
  AlertTriangle, 
  CreditCard,
  Building2,
  Wallet,
  ArrowRight,
  Info
} from 'lucide-react';
import { Modal, Button, FormField, SelectField, TextareaField } from '@/components/ui';
import { caisseAgentApi, caisseApi } from '@/lib/api-client';
import { useLanguage } from '@/contexts/LanguageContext';
import Badge from '@/components/ui/Badge';
import { useToast } from '@/hooks/use-toast';

interface SettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  agentId: string;
}

export default function SettlementModal({ isOpen, onClose, onSuccess, agentId }: SettlementModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [caisses, setCaisses] = useState<any[]>([]);
  const [agentSummary, setAgentSummary] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remitFullAmount, setRemitFullAmount] = useState(false);
  
  const [formData, setFormData] = useState({
    destinationCaisseId: '',
    montant: '',
    observations: ''
  });

  useEffect(() => {
    if (isOpen && agentId) {
      loadData();
    }
  }, [isOpen, agentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [caissesData, summary] = await Promise.all([
        caisseApi.getStatus(),
        caisseAgentApi.getCaisseSummary(agentId)
      ]);
      setCaisses(caissesData.filter((c: any) => c.statut === 'Ouverte'));
      setAgentSummary(summary);
    } catch (error) {
       console.error('Erreur chargement données settlement:', error);
       toast({
         title: t('erreur'),
         description: "Impossible de charger les caisses disponibles.",
         variant: 'destructive',
       });
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.destinationCaisseId) newErrors.destinationCaisseId = "Sélectionnez une caisse de réception";
    
    const montantNum = parseFloat(formData.montant);
    if (!formData.montant || isNaN(montantNum) || montantNum <= 0) {
      newErrors.montant = "Montant invalide";
    } else if (agentSummary && montantNum > parseFloat(agentSummary.disponible)) {
      newErrors.montant = `Le montant dépasse votre solde disponible (${Number(agentSummary.disponible).toLocaleString()} FCFA)`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await caisseAgentApi.createSettlementCash({
        agentId,
        destinationCaisseId: formData.destinationCaisseId,
        montant: parseFloat(formData.montant),
        observations: formData.observations
      });

      toast({
        title: t('succes'),
        description: "Demande de remise envoyée pour validation.",
      });
      
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: t('erreur'),
        description: error.message || t('operationEchouee'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Remise des Fonds (Apurement)"
      size="md"
      footer={
        <div className="flex gap-2 w-full">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="flex-1">
            Annuler
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit} 
            isLoading={submitting}
            icon={CheckCircle}
            className="flex-1"
          >
            Confirmer la Remise
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Résumé Solde Agent */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 border border-slate-700 shadow-lg">
          <div className="flex justify-between items-start mb-4">
             <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Mon Solde Collecté</span>
                <div className="text-2xl font-bold text-white mt-1">
                   {agentSummary ? Number(agentSummary.valide).toLocaleString() : '...'} <span className="text-xs text-slate-400">FCFA</span>
                </div>
             </div>
             <div className="bg-cyan-500/20 p-2 rounded-lg">
                <Wallet className="text-cyan-400" size={20} />
             </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 border-t border-slate-700/50 pt-4">
             <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Validé</span>
                <div className="text-sm font-semibold text-cyan-400">
                    {agentSummary ? Number(agentSummary.valide).toLocaleString() : '0'}
                </div>
             </div>
             <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Disponible</span>
                <div className="text-sm font-semibold text-emerald-400">
                    {agentSummary ? Number(agentSummary.disponible).toLocaleString() : '0'}
                </div>
             </div>
          </div>
          
          {agentSummary && parseFloat(agentSummary.pendingOut) > 0 && (
             <div className="mt-3 flex items-center gap-2 text-[10px] text-amber-400/80 bg-amber-400/10 p-2 rounded border border-amber-400/20">
                <Info size={12} />
                <span>{Number(agentSummary.pendingOut).toLocaleString()} FCFA en attente de remise.</span>
             </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
           {/* Debug: Log received caisses */}
           {/* {console.log('Available Caisses:', caisses)} */}

           <SelectField
            label="Caisse de Réception *"
            name="destinationCaisseId"
            value={formData.destinationCaisseId}
            onChange={(e) => setFormData({ ...formData, destinationCaisseId: e.target.value })}
            options={caisses.map((c: any) => ({ 
                value: c.id, 
                label: `${c.nom} (${c.caissierNom || 'Auto'})` 
            }))}
            error={errors.destinationCaisseId}
            placeholder={caisses.length === 0 ? "Aucune caisse disponible" : "Sélectionner une caisse d'agence"}
            icon={Building2}
            disabled={caisses.length === 0}
          />

          <div className="space-y-2">
             <div className="flex items-center gap-2">
                <input
                   type="checkbox"
                   id="remitFull"
                   checked={remitFullAmount}
                   onChange={(e) => {
                      const isChecked = e.target.checked;
                      setRemitFullAmount(isChecked);
                      if (isChecked && agentSummary) {
                         setFormData(prev => ({ ...prev, montant: agentSummary.disponible.toString() }));
                         if (errors.montant) setErrors(prev => ({ ...prev, montant: '' }));
                      } else {
                         setFormData(prev => ({ ...prev, montant: '' }));
                      }
                   }}
                   className="w-4 h-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500/20"
                />
                <label htmlFor="remitFull" className="text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                   Remettre l'intégralité du montant disponible
                </label>
             </div>

             {!remitFullAmount && (
                <FormField
                   label="Montant de la Remise *"
                   name="montant"
                   type="number"
                   value={formData.montant}
                   onChange={(e) => setFormData({ ...formData, montant: e.target.value })}
                   error={errors.montant}
                   icon={DollarSign}
                   placeholder="Montant à remettre..."
                   min="0"
                />
             )}
          </div>

          <TextareaField
            label="Observations"
            name="observations"
            value={formData.observations}
            onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
            placeholder="Précisions si nécessaire..."
            rows={3}
          />

          <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                <ArrowRight size={20} />
             </div>
             <div className="flex-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Procédure de remise</p>
                <p className="text-[10px] text-slate-500">
                   Le caissier devra valider la réception physique de ces fonds pour apurer votre compte.
                </p>
             </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
