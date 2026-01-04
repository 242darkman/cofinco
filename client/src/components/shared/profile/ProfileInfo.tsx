import React from 'react';
import { User, Mail, Phone, Building, Calendar, Save } from 'lucide-react';
import { UserData } from '../../../hooks/useUserProfile';
import Card from '../../ui/Card';
import Button from '../../ui/Button';

interface ProfileInfoProps {
  user: UserData;
  editing: boolean;
  saving: boolean;
  formData: any;
  setFormData: (data: any) => void;
  onSave: () => void;
  onCancel: () => void;
  getRoleLabel: (role: string) => string;
}

export default function ProfileInfo({ 
  user, editing, saving, formData, setFormData, onSave, onCancel, getRoleLabel 
}: ProfileInfoProps) {
  
  const renderField = (label: string, value: string | undefined, icon?: React.ElementType, isEditable = true, fieldName?: string, type = 'text') => {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-300">
          {label}
        </label>
        {editing && isEditable && fieldName ? (
          <input
            type={type}
            value={formData[fieldName]}
            onChange={(e) => setFormData({ ...formData, [fieldName]: e.target.value })}
            className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all duration-200"
            data-testid={`input-${fieldName}`}
          />
        ) : (
          <div className="text-white bg-slate-700/30 px-4 py-2.5 rounded-lg flex items-center gap-2 border border-slate-700/50">
            {icon && (() => { const Icon = icon; return <Icon size={16} className="text-slate-400 shrink-0" />; })()}
            <span className={fieldName === 'username' ? 'font-mono' : ''}>
              {value || 'Non renseigné'}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-700 pb-4">
        <User size={24} className="text-cyan-400" />
        Informations Personnelles
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        {renderField('Nom', user.nom, undefined, true, 'nom')}
        {renderField('Prénom', user.prenom, undefined, true, 'prenom')}
        {renderField('Email', user.email, Mail, true, 'email', 'email')}
        {renderField('Téléphone', user.telephone, Phone, true, 'telephone', 'tel')}
        {renderField('Nom d\'utilisateur', user.username, undefined, true, 'username')}
        {renderField('Rôle', getRoleLabel(user.role), undefined, false)}
        
        {user.agence && renderField('Agence', user.agence, Building, false)}
        
        {user.createdAt && (
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-300">
              Membre depuis
            </label>
            <div className="text-white bg-slate-700/30 px-4 py-2.5 rounded-lg flex items-center gap-2 border border-slate-700/50">
              <Calendar size={16} className="text-slate-400 shrink-0" />
              <span>{new Date(user.createdAt).toLocaleDateString('fr-FR')}</span>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-700">
          <Button onClick={onCancel} variant="ghost">
            Annuler
          </Button>
          <Button
            onClick={onSave}
            isLoading={saving}
            variant="primary"
            icon={Save}
          >
            Enregistrer
          </Button>
        </div>
      )}
    </Card>
  );
}
