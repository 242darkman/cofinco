import React, { useState } from 'react';
import { Shield, UserPlus, Users, Clock, Building2, AlertTriangle } from 'lucide-react';
import { SystemRole, getRoleLabel, normalizeRole } from '@shared/types/roles';
import Modal from '@/components/ui/Modal';
import FormField from '@/components/ui/FormField';
import SelectField from '@/components/ui/SelectField';
import Button from '@/components/ui/Button';
import { User } from './types';
import { usePermissions } from '@/components/auth/ProtectedFeature';

interface GrantPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onGrant: (data: any) => Promise<any>;
}

export default function GrantPermissionModal({ isOpen, onClose, users, onGrant }: GrantPermissionModalProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canGrantPermissions = hasPermission('permissions', 'create') || hasPermission('admin', 'manage');

  const [formData, setFormData] = useState({
    userId: '',
    agence: '',
    maxCodeDurationHours: 8,
    validUntilDays: 30
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onGrant(formData);
      handleClose();
    } catch (error) {
      console.error('Error granting permission:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      userId: '',
      agence: '',
      maxCodeDurationHours: 8,
      validUntilDays: 30
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Accorder une délégation">
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-600/20 rounded-lg">
          <UserPlus className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Nouvelle délégation</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400">Autorisez un chef d'agence à générer des codes</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <SelectField
          label="Bénéficiaire (Chef d'agence)"
          name="userId"
          value={formData.userId}
          onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
          options={[
            { value: '', label: '-- Choisir --' },
            ...users.filter(u => normalizeRole(u.role) === SystemRole.CHEF_AGENCE).map(user => ({
              value: user.id,
              label: `${user.nom} (${getRoleLabel(user.role)})`
            }))
          ]}
        />
        
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Durée max des codes (h)" name="maxCodeDurationHours">
             <div className="relative">
                <input
                  type="number"
                  name="maxCodeDurationHours"
                  min="1"
                  max="24"
                  value={formData.maxCodeDurationHours}
                  onChange={(e) => setFormData({ ...formData, maxCodeDurationHours: parseInt(e.target.value) || 8 })}
                   className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
             </div>
          </FormField>
          <FormField label="Validité délégation (jours)" name="validUntilDays">
            <input
              type="number"
              name="validUntilDays"
              min="1"
              max="365"
              value={formData.validUntilDays}
              onChange={(e) => setFormData({ ...formData, validUntilDays: parseInt(e.target.value) || 30 })}
              className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
        </div>

        <FormField label="Restriction Agence (Optionnel)" name="agence">
          <input
            type="text"
            name="agence"
            value={formData.agence}
            onChange={(e) => setFormData({ ...formData, agence: e.target.value })}
            placeholder="Toutes les agences"
             className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </FormField>

        {formData.userId && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded-lg p-4 text-sm">
             <p className="text-slate-600 dark:text-slate-400">
               L'utilisateur pourra générer des codes valides <strong className="text-slate-900 dark:text-white">{formData.maxCodeDurationHours}h</strong>.
               Cette permission expirera dans <strong className="text-slate-900 dark:text-white">{formData.validUntilDays} jours</strong>.
             </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={handleClose}>Annuler</Button>
          {canGrantPermissions ? (
            <Button
              type="submit"
              variant="primary"
              icon={Shield}
              isLoading={loading}
              disabled={!formData.userId}
            >
              Accorder
            </Button>
          ) : (
            <div className="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle size={16} />
              Permission requise
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
