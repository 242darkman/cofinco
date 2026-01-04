import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, MapPin, Calendar, Target, Info, AlertTriangle } from 'lucide-react';
import { Modal, Button, FormField, SelectField, Card } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';

interface AgentTerrainFormProps {
  onClose: () => void;
  onSuccess: () => void;
  agent?: any;
}

export default function AgentTerrainForm({ onClose, onSuccess, agent }: AgentTerrainFormProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canSaveAgents = agent
    ? (hasPermission('agents_terrain', 'edit') || hasPermission('admin', 'manage'))
    : (hasPermission('agents_terrain', 'create') || hasPermission('admin', 'manage'));

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    nom: agent?.nom || '',
    prenom: agent?.prenom || '',
    phone: agent?.phone || '',
    email: agent?.email || '',
    zone_affectation: agent?.zone_affectation || agent?.zoneAffectation || '',
    statut: agent?.statut || 'Actif',
    objectif_mensuel: agent?.objectif_mensuel || agent?.objectifMensuel || '',
    date_embauche: agent?.date_embauche || agent?.dateEmbauche || new Date().toISOString().split('T')[0]
  });

  const [zones, setZones] = useState<string[]>([]);

  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    try {
      const response = await fetch('/api/zones');
      if (response.ok) {
        const data = await response.json();
        const formattedZones = data.map((z: any) => `${z.ville}/${z.nom}`);
        if (formattedZones.length > 0) {
            setZones(formattedZones);
        }
      }
    } catch (error) {
      console.error('Failed to fetch zones:', error);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nom.trim()) newErrors.nom = 'Le nom est requis';
    if (!formData.prenom.trim()) newErrors.prenom = 'Le prénom est requis';
    if (!formData.phone.trim()) newErrors.phone = 'Le téléphone est requis';
    if (!formData.zone_affectation) newErrors.zone_affectation = 'La zone est requise';
    if (formData.objectif_mensuel && parseFloat(formData.objectif_mensuel) < 0) {
      newErrors.objectif_mensuel = 'L\'objectif doit être positif';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      const agentData = {
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        telephone: formData.phone.trim(),
        email: formData.email.trim() || null,
        zoneAffectation: formData.zone_affectation,
        statut: formData.statut,
        objectifMensuel: formData.objectif_mensuel ? String(formData.objectif_mensuel) : '0',
        dateEmbauche: formData.date_embauche,
        performance: agent?.performance || 0,
        nombreClients: agent?.nombre_clients || agent?.nombreClients || 0
      };

      let response;
      if (agent) {
        response = await fetch(`/api/agents-terrain/${agent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(agentData)
        });
      } else {
        response = await fetch('/api/agents-terrain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(agentData)
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la sauvegarde');
      }

      onSuccess();
    } catch (error: any) {
      console.error('Erreur:', error);
      setErrors({ submit: error.error });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={agent ? 'Modifier l\'Agent' : 'Nouvel Agent de Terrain'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {errors.submit && (
          <div className="bg-status-danger/10 border border-status-danger text-status-danger px-4 py-3 rounded-lg text-sm">
            {errors.submit}
          </div>
        )}

        <Card padding="sm" className="bg-surface-base border-card-border/50">
           <div className="grid md:grid-cols-2 gap-4">
            <FormField
              label="Nom *"
              name="nom"
              icon={User}
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              error={errors.nom}
              placeholder="Ex: Mbala"
            />
            <FormField
              label="Prénom *"
              name="prenom"
              icon={User}
              value={formData.prenom}
              onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              error={errors.prenom}
              placeholder="Ex: Jean"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
             <div>
               <label className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
                 <Phone size={14} className="inline mr-1" />
                 Téléphone *
               </label>
               <div className="flex gap-2">
                 <div className="shrink-0 w-20 bg-surface-elevated text-content-primary px-3 py-2.5 rounded-lg border border-input-border flex items-center justify-center font-semibold text-sm">
                   +242
                 </div>
                 <div className="flex-1">
                    <FormField
                      label=""
                      name="phone"
                      value={(formData.phone || '').replace('+242', '').trim()}
                      onChange={(e) => {
                        const phoneNumber = e.target.value.replace(/[^\d]/g, '');
                        setFormData({ ...formData, phone: '+242' + phoneNumber });
                      }}
                      error={errors.phone}
                      placeholder="06 123 4567"
                      maxLength={11}
                      containerClassName="mb-0"
                    />
                 </div>
               </div>
             </div>

             <FormField
                label="Email"
                name="email"
                type="email"
                icon={Mail}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="agent@cofin.cd"
             />
          </div>
        </Card>

        <Card padding="sm" className="bg-surface-base border-card-border/50">
            <SelectField
              label="Zone d'Affectation *"
              name="zone_affectation"
              value={formData.zone_affectation}
              onChange={(e) => setFormData({ ...formData, zone_affectation: e.target.value })}
              options={[
                  { value: '', label: 'Sélectionner une zone' },
                  ...zones.map(z => ({ value: z, label: z }))
              ]}
              error={errors.zone_affectation}
              icon={MapPin}
            />

            <div className="grid md:grid-cols-2 gap-4 mt-4">
               <SelectField
                  label="Statut"
                  name="statut"
                  value={formData.statut}
                  onChange={(e) => setFormData({ ...formData, statut: e.target.value })}
                  options={[
                     { value: 'Actif', label: 'Actif' },
                     { value: 'En congé', label: 'En congé' },
                     { value: 'Suspendu', label: 'Suspendu' },
                     { value: 'Inactif', label: 'Inactif' }
                  ]}
               />
               <FormField
                  label="Date d'Embauche"
                  name="date_embauche"
                  type="date"
                  icon={Calendar}
                  value={formData.date_embauche}
                  onChange={(e) => setFormData({ ...formData, date_embauche: e.target.value })}
               />
            </div>
            
            <div className="mt-4">
               <FormField
                  label="Objectif Mensuel (FCFA)"
                  name="objectif_mensuel"
                  type="number"
                  icon={Target}
                  value={formData.objectif_mensuel}
                  onChange={(e) => setFormData({ ...formData, objectif_mensuel: e.target.value })}
                  error={errors.objectif_mensuel}
                  placeholder="500000"
                  min={0}
                  step={1000}
               />
            </div>
        </Card>

        <Card padding="sm" className="bg-blue-500/5 border-blue-500/20">
          <div className="flex items-start gap-3">
             <Info className="text-blue-400 shrink-0 mt-0.5" size={18} />
             <div>
                <h3 className="text-blue-400 font-semibold text-sm mb-1">Rôles de l'Agent</h3>
                <ul className="text-slate-400 text-xs sm:text-sm space-y-1 list-disc pl-4">
                  <li>Recouvrement des tontines et crédits</li>
                  <li>Encaissement des paiements clients</li>
                  <li>Prospection de nouveaux clients</li>
                  <li>Visites terrain et suivi clients</li>
                </ul>
             </div>
          </div>
        </Card>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            onClick={onClose}
            variant="ghost"
            fullWidth
            disabled={loading}
          >
            Annuler
          </Button>
          {canSaveAgents ? (
            <Button
              type="submit"
              isLoading={loading}
              variant="primary"
              fullWidth
            >
              {agent ? 'Mettre à Jour' : 'Créer l\'Agent'}
            </Button>
          ) : (
            <div className="flex-1 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg font-medium flex items-center justify-center gap-2">
              <AlertTriangle size={16} />
              Permission requise
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
