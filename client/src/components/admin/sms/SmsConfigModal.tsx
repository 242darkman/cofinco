import React, { useState } from 'react';
import { Eye, EyeOff, AlertTriangle, CheckCircle, X, Settings } from 'lucide-react';
import { Button, Card, FormField } from '../../ui';

interface SmsConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: string;
  providerLabel: string;
  fields: Array<{ key: string; label: string; placeholder: string; type?: string }>;
  onSubmit: (provider: string, config: Record<string, string>) => Promise<void>;
}

export default function SmsConfigModal({ isOpen, onClose, provider, providerLabel, fields, onSubmit }: SmsConfigModalProps) {
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      await onSubmit(provider, configForm);
      setSuccess('Configuration sauvegardée !');
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setError(err.error || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg shadow-2xl">
        <Card.Header className="flex justify-between items-center bg-slate-800 border-b border-slate-700">
          <h3 className="text-xl font-bold flex items-center gap-2">
             <Settings className="w-5 h-5 text-blue-400"/> 
             Configurer {providerLabel}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={24}/></button>
        </Card.Header>
        <Card.Content className="space-y-4 max-h-[80vh] overflow-y-auto">
          {error && <div className="p-3 bg-red-900/50 text-red-200 rounded-lg flex items-center gap-2"><AlertTriangle size={16}/> {error}</div>}
          {success && <div className="p-3 bg-green-900/50 text-green-200 rounded-lg flex items-center gap-2"><CheckCircle size={16}/> {success}</div>}
          
          <form id="configForm" onSubmit={handleSubmit} className="space-y-4">
            {fields?.map(field => (
              <FormField
                key={field.key}
                label={field.label}
                name={field.key}
                type={field.type === 'password' && !showPasswords[field.key] ? 'password' : 'text'}
                placeholder={field.placeholder}
                value={configForm[field.key] || ''}
                onChange={(e) => setConfigForm({...configForm, [field.key]: e.target.value})}
                rightIcon={field.type === 'password' ? (showPasswords[field.key] ? EyeOff : Eye) : undefined}
                onRightIconClick={() => setShowPasswords({...showPasswords, [field.key]: !showPasswords[field.key]})}
              />
            ))}
          </form>
        </Card.Content>
        <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-800/50">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="configForm" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Sauvegarder'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
