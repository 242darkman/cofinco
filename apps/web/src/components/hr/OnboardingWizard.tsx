import React, { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { UserPlus, CheckCircle, Circle, X, ArrowRight, FileText, Calendar, DollarSign, Building, Briefcase, ClipboardCheck, AlertCircle, User } from 'lucide-react';
import { Button, Modal, FormField, SelectField, Badge } from '../ui';
import { toast } from '../../lib/toast';
import { hrApi } from '../../lib/api-client';

interface OnboardingItem {
  name: string;
  required: boolean;
  category?: string;
}

interface OnboardingInstance {
  id: string;
  candidatureId: number;
  employeId?: string;
  completedItems: Array<{ name: string; completedAt: string; completedBy?: string; notes?: string }>;
  statut: string;
  startedAt: string;
  completedAt?: string;
  checklist?: {
    id: string;
    nom: string;
    items: OnboardingItem[];
  };
  candidat?: {
    nom: string;
    prenom: string;
    email?: string;
    telephone?: string;
    poste?: string;
  };
}

interface OnboardingWizardProps {
  candidatureId: number;
  candidat: {
    nom: string;
    prenom: string;
    email?: string;
    telephone?: string;
    poste?: string;
  };
  agenceId?: string;
  onComplete?: (employeId: string) => void;
  onClose: () => void;
}

export default function OnboardingWizard({
  candidatureId,
  candidat,
  agenceId,
  onComplete,
  onClose,
}: OnboardingWizardProps) {
  const [instance, setInstance] = useState<OnboardingInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [completingItem, setCompletingItem] = useState<string | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [converting, setConverting] = useState(false);

  const [employeeData, setEmployeeData] = useState({
    poste: candidat.poste || '',
    departementId: '',
    salaireBase: '',
    dateEmbauche: new Date().toISOString().split('T')[0],
  });

  const [departments, setDepartments] = useState<Array<{ id: string; nom: string }>>([]);

  useEffect(() => {
    fetchOnboardingInstance();
    fetchDepartments();
  }, [candidatureId]);

  const fetchOnboardingInstance = async () => {
    setLoading(true);
    try {
      const instances = await hrApi.getOnboardingInstances({ candidatureId });
      if (instances && instances.length > 0) {
        // Get the active instance
        const activeInstance = instances.find(i => i.statut === 'IN_PROGRESS') || instances[0];
        setInstance(activeInstance);
      }
    } catch (error) {
      console.error('Error fetching onboarding instance:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/departments');
      if (res.ok) {
        const data = await res.json();
        setDepartments(data || []);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const handleStartOnboarding = async () => {
    setStarting(true);
    try {
      const result = await hrApi.startOnboarding(candidatureId);
      if (result.instance) {
        setInstance(result.instance);
        toast.success('Onboarding démarré');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors du démarrage');
    } finally {
      setStarting(false);
    }
  };

  const handleCompleteItem = async (itemName: string) => {
    if (!instance) return;
    setCompletingItem(itemName);
    try {
      const result = await hrApi.completeOnboardingItem(instance.id, itemName);
      if (result.instance) {
        setInstance(result.instance);
        toast.success(`"${itemName}" complété`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    } finally {
      setCompletingItem(null);
    }
  };

  const handleUncompleteItem = async (itemName: string) => {
    if (!instance) return;
    setCompletingItem(itemName);
    try {
      const result = await hrApi.uncompleteOnboardingItem(instance.id, itemName);
      if (result.instance) {
        setInstance(result.instance);
      }
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    } finally {
      setCompletingItem(null);
    }
  };

  const handleConvertToEmployee = async () => {
    if (!instance || !employeeData.salaireBase) {
      toast.error('Veuillez remplir tous les champs requis');
      return;
    }
    setConverting(true);
    try {
      const result = await hrApi.convertToEmployee(instance.id, {
        poste: employeeData.poste,
        departementId: employeeData.departementId || undefined,
        salaireBase: parseFloat(employeeData.salaireBase),
        dateEmbauche: employeeData.dateEmbauche,
      });

      toast.success('Employé créé');
      setShowConvertModal(false);
      onComplete?.(result.employe?.id);
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la conversion');
    } finally {
      setConverting(false);
    }
  };

  const getProgress = () => {
    if (!instance?.checklist?.items) return 0;
    const totalRequired = instance.checklist.items.filter(i => i.required).length;
    const completedRequired = instance.checklist.items
      .filter(i => i.required)
      .filter(i => instance.completedItems?.some(c => c.name === i.name))
      .length;
    return totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;
  };

  const isItemCompleted = (itemName: string) => {
    return instance?.completedItems?.some(c => c.name === itemName) || false;
  };

  const canConvert = () => {
    if (!instance?.checklist?.items) return false;
    const requiredItems = instance.checklist.items.filter(i => i.required);
    return requiredItems.every(i => isItemCompleted(i.name));
  };

  const groupedItems = () => {
    if (!instance?.checklist?.items) return {};
    return instance.checklist.items.reduce((acc, item) => {
      const cat = item.category || 'Général';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {} as Record<string, OnboardingItem[]>);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" tone="current" className="text-status-warning" />
      </div>
    );
  }

  // If no instance exists, show start button
  if (!instance) {
    return (
      <div className="text-center py-8">
        <UserPlus size={48} className="mx-auto text-content-muted mb-4" />
        <h3 className="text-lg font-semibold text-content-primary mb-2">Démarrer l'onboarding</h3>
        <p className="text-sm text-content-muted mb-6 max-w-sm mx-auto">
          Commencez le processus d'intégration pour {candidat.prenom} {candidat.nom}.
          Vous pourrez suivre les étapes et convertir le candidat en employé.
        </p>
        <Button
          variant="primary"
          onClick={handleStartOnboarding}
          disabled={starting}
        >
          {starting ? <Spinner size="xs" tone="current" className="mr-2" /> : <UserPlus size={16} className="mr-2" />}
          Démarrer l'onboarding
        </Button>
      </div>
    );
  }

  // If instance is completed or cancelled
  if (instance.statut === 'COMPLETED') {
    return (
      <div className="text-center py-8">
        <CheckCircle size={48} className="mx-auto text-status-success mb-4" />
        <h3 className="text-lg font-semibold text-content-primary mb-2">Onboarding terminé</h3>
        <p className="text-sm text-content-muted">
          {candidat.prenom} {candidat.nom} a été converti en employé.
        </p>
      </div>
    );
  }

  if (instance.statut === 'CANCELLED') {
    return (
      <div className="text-center py-8">
        <AlertCircle size={48} className="mx-auto text-status-danger mb-4" />
        <h3 className="text-lg font-semibold text-content-primary mb-2">Onboarding annulé</h3>
        <Button variant="primary" onClick={handleStartOnboarding} disabled={starting}>
          Recommencer
        </Button>
      </div>
    );
  }

  const progress = getProgress();
  const grouped = groupedItems();

  return (
    <div className="space-y-4">
      {/* Header with progress */}
      <div className="bg-surface/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-status-warning-bg rounded-full flex items-center justify-center">
              <User size={20} className="text-status-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-content-primary">{candidat.prenom} {candidat.nom}</h3>
              <p className="text-xs text-content-muted">{candidat.poste || 'Poste à définir'}</p>
            </div>
          </div>
          <Badge
            variant={progress === 100 ? 'success' : 'warning'}
            value={`${progress}%`}
            size="sm"
          />
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-linear-to-r from-status-warning to-status-warning transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Checklist items grouped by category */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h4 className="text-xs font-semibold text-content-muted uppercase tracking-wider mb-2 flex items-center gap-2">
              <ClipboardCheck size={12} />
              {category}
            </h4>
            <div className="space-y-1">
              {items.map((item) => {
                const completed = isItemCompleted(item.name);
                const isLoading = completingItem === item.name;

                return (
                  <button
                    key={item.name}
                    onClick={() => completed ? handleUncompleteItem(item.name) : handleCompleteItem(item.name)}
                    disabled={isLoading}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition ${
                      completed
                        ? 'bg-status-success-bg border-status-success/30 hover:bg-status-success-bg'
                        : 'bg-surface/50 border-edge hover:bg-surface'
                    }`}
                  >
                    <div className={`flex-shrink-0 ${completed ? 'text-status-success' : 'text-content-muted'}`}>
                      {isLoading ? (
                        <Spinner size="sm" tone="current" />
                      ) : completed ? (
                        <CheckCircle size={18} />
                      ) : (
                        <Circle size={18} />
                      )}
                    </div>
                    <span className={`flex-1 text-left text-sm ${completed ? 'text-status-success' : 'text-content-secondary'}`}>
                      {item.name}
                    </span>
                    {item.required && !completed && (
                      <Badge variant="warning" value="Requis" size="xs" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Convert button */}
      <div className="pt-4 border-t border-edge">
        <Button
          variant="success"
          className="w-full"
          onClick={() => setShowConvertModal(true)}
          disabled={!canConvert()}
        >
          <ArrowRight size={16} className="mr-2" />
          Convertir en employé
        </Button>
        {!canConvert() && (
          <p className="text-xs text-content-muted text-center mt-2">
            Complétez tous les éléments requis pour continuer
          </p>
        )}
      </div>

      {/* Convert Modal */}
      <Modal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        title="Convertir en employé"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-surface/50 rounded-lg p-3 flex items-center gap-3">
            <UserPlus size={20} className="text-status-success" />
            <div>
              <p className="text-sm font-medium text-content-primary">{candidat.prenom} {candidat.nom}</p>
              <p className="text-xs text-content-muted">Sera créé comme nouvel employé</p>
            </div>
          </div>

          <FormField
            label="Poste"
            name="poste"
            type="text"
            value={employeeData.poste}
            onChange={(e) => setEmployeeData({ ...employeeData, poste: e.target.value })}
            placeholder="Ex: Agent de caisse"
            required
          />

          <SelectField
            label="Département"
            name="departementId"
            value={employeeData.departementId}
            onChange={(e) => setEmployeeData({ ...employeeData, departementId: e.target.value })}
            options={[
              { value: '', label: '-- Sélectionner --' },
              ...departments.map(d => ({ value: d.id, label: d.nom }))
            ]}
          />

          <FormField
            label="Salaire de base (FCFA)"
            name="salaireBase"
            inputMode="numeric"
            pattern="[0-9]*"
            value={employeeData.salaireBase}
            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setEmployeeData({ ...employeeData, salaireBase: v }); }}
            placeholder="Ex: 150000"
            required
          />

          <FormField
            label="Date d'embauche"
            name="dateEmbauche"
            type="date"
            value={employeeData.dateEmbauche}
            onChange={(e) => setEmployeeData({ ...employeeData, dateEmbauche: e.target.value })}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-edge">
            <Button variant="secondary" onClick={() => setShowConvertModal(false)}>
              Annuler
            </Button>
            <Button
              variant="success"
              onClick={handleConvertToEmployee}
              disabled={converting || !employeeData.salaireBase || !employeeData.poste}
            >
              {converting ? <Spinner size="xs" tone="current" className="mr-2" /> : <CheckCircle size={14} className="mr-2" />}
              Créer l'employé
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
