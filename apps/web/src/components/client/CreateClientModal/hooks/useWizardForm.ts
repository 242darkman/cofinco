import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_FORM_DATA, DEFAULT_FILES, AUTO_SAVE_KEY } from '../constants';
import type { CreateClientFormData, FileState, EmployeeConversionData } from '../types';

function buildFromEmployee(emp: EmployeeConversionData): CreateClientFormData {
  const phoneRaw = emp.telephone
    ? emp.telephone.replace(/^\+242/, '').replace(/[^\d]/g, '')
    : '';
  return {
    ...DEFAULT_FORM_DATA,
    nom: emp.nom || '',
    prenom: emp.prenom || '',
    sexe: emp.sexe || 'M',
    dateNaissance: emp.dateNaissance || '',
    telephoneRaw: phoneRaw,
    telephone: emp.telephone || (phoneRaw ? `+242${phoneRaw}` : ''),
    email: emp.email || '',
    adresseDomicile: emp.adresse || '',
    agenceId: emp.agenceId || '',
    clientOrigin: 'EMPLOYEE_CONVERSION',
  };
}

export function useWizardForm(fromEmployee?: EmployeeConversionData) {
  const isConversion = !!fromEmployee;

  const [formData, setFormData] = useState<CreateClientFormData>(() => {
    if (fromEmployee) return buildFromEmployee(fromEmployee);
    const saved = sessionStorage.getItem(AUTO_SAVE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_FORM_DATA, ...parsed };
      } catch { /* ignore */ }
    }
    return { ...DEFAULT_FORM_DATA };
  });

  const [files, setFiles] = useState<FileState>({ ...DEFAULT_FILES });

  // Auto-save debounced (skip for conversion mode)
  useEffect(() => {
    if (isConversion) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(formData));
    }, 500);
    return () => clearTimeout(timer);
  }, [formData, isConversion]);

  const updateField = useCallback((key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(AUTO_SAVE_KEY);
  }, []);

  const resetForm = useCallback(() => {
    setFormData(fromEmployee ? buildFromEmployee(fromEmployee) : { ...DEFAULT_FORM_DATA });
    setFiles({ ...DEFAULT_FILES });
  }, [fromEmployee]);

  return { formData, setFormData, files, setFiles, updateField, clearDraft, resetForm };
}
