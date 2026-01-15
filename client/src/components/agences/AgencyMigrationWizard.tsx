import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Building2, Users, Receipt, AlertTriangle, CheckCircle, 
  ArrowRight, Loader2, ArrowRightLeft, Shield 
} from 'lucide-react';
import { Modal, Button, SearchableSelect, ProgressBar, Badge } from '../ui';
import { api } from '../../lib/api-client';
import { toast } from 'sonner';

interface Agency {
  id: string;
  nom: string;
  ville?: string;
  codeAgence: string;
}

interface MigrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  sourceAgence: Agency;
  onSuccess: () => void;
}

const STEPS = [
  { id: 'clients', title: 'Clients', icon: Users },
  { id: 'employees', title: 'Personnel', icon: Building2 },
  { id: 'treasury', title: 'Trésorerie', icon: Receipt },
  { id: 'confirm', title: 'Confirmation', icon: Shield }
];

export function AgencyMigrationWizard({ isOpen, onClose, sourceAgence, onSuccess }: MigrationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetClients, setTargetClients] = useState<string | number>('');
  const [targetEmployees, setTargetEmployees] = useState<string | number>('');
  const [targetTreasury, setTargetTreasury] = useState<string | number>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [migrationId, setMigrationId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Fetch available agencies (excluding source)
  const { data: agences } = useQuery({
    queryKey: ['agences', 'migration', sourceAgence.id],
    queryFn: async () => {
      const res = await api.get<Agency[]>('/api/agences?statut=Actif');
      return res.filter((a: Agency) => a.id !== sourceAgence.id);
    },
    enabled: isOpen
  });

  // Poll migration status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (migrationId) {
      interval = setInterval(async () => {
        try {
          const status = await api.get<{ status: string; progress: number; error?: string }>(`/api/agences/migrations/${migrationId}/status`);
          setProgress(status.progress);
          
          if (status.status === 'COMPLETED') {
            clearInterval(interval);
            toast.success('Migration terminée avec succès');
            onSuccess();
            onClose();
          } else if (status.status === 'FAILED') {
            clearInterval(interval);
            toast.error(`Erreur: ${status.error}`);
            setIsSubmitting(false);
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [migrationId, onClose, onSuccess]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      startMigration();
    }
  };

  const startMigration = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.post<{ id: string }>(`/api/agences/${sourceAgence.id}/migrate`, {
        targetAgenceClients: targetClients,
        targetAgenceEmployes: targetEmployees,
        targetAgenceCoffre: targetTreasury
      });
      setMigrationId(res.id);
    } catch (error) {
      toast.error("Impossible de démarrer la migration");
      setIsSubmitting(false);
    }
  };

  const agencyOptions = agences?.map((a: Agency) => ({
    value: a.id,
    label: a.nom,
    subLabel: a.ville || a.codeAgence
  })) || [];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return !!targetClients;
      case 1: return !!targetEmployees;
      case 2: return !!targetTreasury;
      default: return true;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={`Fermeture et Migration : ${sourceAgence.nom}`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Stepper Header */}
        <div className="flex justify-between relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-700 -z-10" />
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;

            return (
              <div key={step.id} className="flex flex-col items-center bg-slate-800 px-2">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors
                  ${isActive ? 'border-blue-500 bg-blue-500/20 text-blue-400' : 
                    isCompleted ? 'border-green-500 bg-green-500/20 text-green-400' : 
                    'border-slate-600 bg-slate-800 text-slate-500'}
                `}>
                  <Icon size={20} />
                </div>
                <span className={`text-xs mt-2 font-medium ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="min-h-[200px] py-4">
            {isSubmitting ? (
                <div className="flex flex-col items-center justify-center p-8 space-y-4">
                    <Loader2 className="animate-spin text-blue-500" size={48} />
                    <h3 className="text-xl font-bold text-white">Migration en cours...</h3>
                    <div className="w-full max-w-xs">
                        <ProgressBar value={progress} max={100} color="primary" size="md" />
                    </div>
                    <p className="text-slate-400 text-center">
                        Ne fermez pas cette fenêtre. Opération en arrière-plan.<br/>
                        Transférés: {progress}%
                    </p>
                </div>
            ) : (
                <>
                {currentStep === 0 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-blue-500/10 p-4 rounded-lg flex gap-3 border border-blue-500/20 font-sans">
                            <Users className="text-blue-400 shrink-0" />
                            <div>
                                <h4 className="font-bold text-blue-400">Transfert de la Clientèle</h4>
                                <p className="text-sm text-slate-300">
                                    Veuillez sélectionner l'agence qui reprendra la gestion des clients actifs de {sourceAgence.nom}.
                                </p>
                            </div>
                        </div>
                        <SearchableSelect
                            label="Agence de destination (Clients)"
                            name="targetClients"
                            value={targetClients}
                            onChange={(val) => setTargetClients(val)}
                            options={agencyOptions}
                            placeholder="Rechercher une agence..."
                        />
                    </div>
                )}

                {currentStep === 1 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-purple-500/10 p-4 rounded-lg flex gap-3 border border-purple-500/20 font-sans">
                            <Building2 className="text-purple-400 shrink-0" />
                            <div>
                                <h4 className="font-bold text-purple-400">Réaffectation du Personnel</h4>
                                <p className="text-sm text-slate-300">
                                    Les employés actuels seront rattachés administrativement à la nouvelle agence sélectionnée.
                                </p>
                            </div>
                        </div>
                        <SearchableSelect
                            label="Agence d'affectation (Employés)"
                            name="targetEmployees"
                            value={targetEmployees}
                            onChange={(val) => setTargetEmployees(val)}
                            options={agencyOptions}
                            placeholder="Rechercher une agence..."
                        />
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                        <div className="bg-amber-500/10 p-4 rounded-lg flex gap-3 border border-amber-500/20 font-sans">
                            <Receipt className="text-amber-400 shrink-0" />
                            <div>
                                <h4 className="font-bold text-amber-400">Transfert de Fonds (Trésorerie)</h4>
                                <p className="text-sm text-slate-300">
                                    Le solde restant du coffre-fort sera transféré comptablement vers le coffre de l'agence cible.
                                </p>
                            </div>
                        </div>
                        <SearchableSelect
                            label="Agence de destination (Fonds)"
                            name="targetTreasury"
                            value={targetTreasury}
                            onChange={(val) => setTargetTreasury(val)}
                            options={agencyOptions}
                            placeholder="Rechercher une agence (ex: Siège)..."
                        />
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                         <div className="bg-red-500/10 p-4 rounded-lg flex gap-3 border border-red-500/20">
                            <AlertTriangle className="text-red-400 shrink-0" />
                            <div>
                                <h4 className="font-bold text-red-400">Attention : Action Irréversible</h4>
                                <p className="text-sm text-slate-300">
                                    Une fois validée, l'agence <strong>{sourceAgence.nom}</strong> sera définitivement fermée et ses données migrées.
                                </p>
                            </div>
                        </div>

                        <div className="bg-slate-900 rounded-lg p-4 space-y-3 border border-slate-700">
                            <h4 className="font-medium text-white border-b border-slate-700 pb-2">Récapitulatif</h4>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Clients vers :</span>
                                <span className="text-white">{agences?.find((a: Agency) => a.id === targetClients)?.nom}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Employés vers :</span>
                                <span className="text-white">{agences?.find((a: Agency) => a.id === targetEmployees)?.nom}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400">Fonds vers :</span>
                                <span className="text-white">{agences?.find((a: Agency) => a.id === targetTreasury)?.nom}</span>
                            </div>
                        </div>
                    </div>
                )}
                </>
            )}
        </div>

        {/* Footer */}
        {!isSubmitting && (
            <div className="flex justify-between pt-4 border-t border-slate-700">
            <Button
                variant="outline"
                onClick={currentStep === 0 ? onClose : () => setCurrentStep(prev => prev - 1)}
            >
                {currentStep === 0 ? 'Annuler' : 'Retour'}
            </Button>
            
            <Button
                variant={currentStep === 3 ? 'danger' : 'primary'}
                onClick={handleNext}
                disabled={!canProceed()}
                icon={currentStep === 3 ? AlertTriangle : ArrowRight}
            >
                {currentStep === STEPS.length - 1 ? 'Confirmer la Migration' : 'Suivant'}
            </Button>
            </div>
        )}
      </div>
    </Modal>
  );
}
