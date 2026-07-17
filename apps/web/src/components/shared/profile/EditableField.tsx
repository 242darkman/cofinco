import React, { useState } from 'react';
import { PenLine, Check, X, AlertCircle } from 'lucide-react';
import LoadingSpinner from '../../ui/LoadingSpinner';
import { formatPhoneInput, stripPhoneFormat } from '../../../lib/format';

// ==================== VALIDATION HELPERS ====================
export const validateEmail = (email: string): string | null => {
  if (!email) return null; // Empty is allowed
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Format email invalide';
  }
  return null;
};

export const validatePhone = (phone: string): string | null => {
  if (!phone) return null;
  // Allow formats: +242 06 123 4567, 06 123 4567, 0612345678, +242612345678
  const phoneRegex = /^[+]?[\d\s-]{6,20}$/;
  if (!phoneRegex.test(phone)) {
    return 'Format téléphone invalide';
  }
  return null;
};

// ==================== EDITABLE FIELD COMPONENT ====================
export interface EditableFieldProps {
  label: string;
  value?: string;
  icon: React.ElementType;
  onSave: (value: string) => Promise<boolean>;
  editable?: boolean;
  type?: string;
  placeholder?: string;
  validation?: 'email' | 'phone' | 'none';
}

export function EditableField({ label, value, icon: Icon, onSave, editable = true, type = 'text', placeholder, validation = 'none' }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validate on change
  const handleChange = (newValue: string) => {
    const cleaned = validation === 'phone' ? stripPhoneFormat(newValue) : newValue;
    setTempValue(cleaned);

    // Real-time validation
    let error: string | null = null;
    if (validation === 'email') {
      error = validateEmail(cleaned);
    } else if (validation === 'phone') {
      error = validatePhone(cleaned);
    }
    setValidationError(error);
  };

  const handleSave = async () => {
    // Final validation before save
    let error: string | null = null;
    if (validation === 'email') {
      error = validateEmail(tempValue);
    } else if (validation === 'phone') {
      error = validatePhone(tempValue);
    }

    if (error) {
      setValidationError(error);
      return;
    }

    setSaving(true);
    const success = await onSave(tempValue);
    setSaving(false);
    if (success) {
      setIsEditing(false);
      setValidationError(null);
    }
  };

  const handleCancel = () => {
    setTempValue(value || '');
    setIsEditing(false);
    setValidationError(null);
  };

  // --- MODE ÉDITION (Compact) ---
  if (isEditing) {
    return (
      <div className="animate-in fade-in zoom-in-95 duration-200 bg-surface-base/50 p-1.5 -m-1.5 rounded-lg border border-accent/20">
        <label className="block text-[10px] font-medium text-accent mb-1 ml-1">
          {label}
        </label>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type={type}
              className={`w-full h-8 bg-surface-base border rounded-md pl-2 pr-2 text-xs text-content-primary focus:outline-none focus:ring-1 transition-all ${
                validationError
                  ? 'border-status-danger focus:ring-status-danger/20'
                  : 'border-accent focus:ring-accent/20'
              }`}
              value={validation === 'phone' ? formatPhoneInput(tempValue) : tempValue}
              onChange={e => handleChange(e.target.value)}
              autoFocus
              placeholder={placeholder || `...`}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !!validationError}
            className="h-8 w-8 flex items-center justify-center bg-status-success hover:bg-status-success text-white rounded-md transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Valider"
          >
            {saving ? <LoadingSpinner size="sm" /> : <Check size={14} strokeWidth={3} />}
          </button>

          <button
            onClick={handleCancel}
            className="h-8 w-8 flex items-center justify-center bg-surface hover:bg-surface-elevated text-content-muted hover:text-content-primary rounded-md border border-edge transition-colors"
            title="Annuler"
          >
            <X size={14} />
          </button>
        </div>

        {/* Validation error message */}
        {validationError && (
          <div className="mt-1 flex items-center gap-1 text-[9px] text-status-danger">
            <AlertCircle size={10} />
            <span>{validationError}</span>
          </div>
        )}
      </div>
    );
  }

  // --- MODE LECTURE (Compact) ---
  return (
    <div className="group flex items-center justify-between p-2 hover:bg-surface/50 rounded-lg transition-colors border border-transparent hover:border-edge/50 cursor-default -mx-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 p-1.5 bg-surface-base rounded-md text-content-muted border border-edge group-hover:border-edge group-hover:text-accent transition-colors">
          <Icon size={14} />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-content-muted font-medium mb-1">{label}</div>
          <div className="text-sm font-semibold text-content-primary leading-tight break-words">{validation === 'phone' && value ? formatPhoneInput(value) : (value || 'Non renseigné')}</div>
        </div>
      </div>
      
      {editable && (
        <button 
          onClick={() => setIsEditing(true)} 
          className="opacity-0 group-hover:opacity-100 p-1.5 text-accent hover:bg-accent/10 hover:text-accent rounded transition-all transform scale-90 group-hover:scale-100"
        >
          <PenLine size={14} />
        </button>
      )}
    </div>
  );
}
