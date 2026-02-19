import React from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, FormField, SelectField } from '../../../ui';
import { RELATION_REFERENCE_OPTIONS } from '@shared/enum/status-constants';
import { EMPTY_REFERENCE } from '../constants';
import type { ReferencePersonne } from '../types';

function capitalizeWords(str: string): string {
  return str.replace(/(^|\s)\S/g, c => c.toUpperCase());
}

interface ReferencesEditorProps {
  references: ReferencePersonne[];
  onChange: (refs: ReferencePersonne[]) => void;
  errors: Record<string, string>;
}

export default function ReferencesEditor({ references, onChange, errors }: ReferencesEditorProps) {
  const [expanded, setExpanded] = React.useState<number | null>(references.length > 0 ? 0 : null);

  const addRef = () => {
    if (references.length >= 3) return;
    onChange([...references, { ...EMPTY_REFERENCE }]);
    setExpanded(references.length);
  };

  const removeRef = (idx: number) => {
    onChange(references.filter((_, i) => i !== idx));
    setExpanded(null);
  };

  const updateRef = (idx: number, field: keyof ReferencePersonne, value: string) => {
    const updated = [...references];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-content-primary">
          Personnes de référence ({references.length}/3)
        </h4>
        {references.length < 3 && (
          <Button variant="ghost" size="xs" icon={Plus} onClick={addRef}>
            Ajouter
          </Button>
        )}
      </div>

      {references.length === 0 && (
        <div className="flex flex-col items-center py-6 border border-dashed border-edge rounded-xl">
          <svg className="w-16 h-16 mb-3" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="18" r="7" className="stroke-content-muted/30" strokeWidth="1.5"/>
            <path d="M8 40c0-6.627 5.373-12 12-12s12 5.373 12 12" className="stroke-content-muted/30" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="44" cy="18" r="7" className="stroke-content-muted/30" strokeWidth="1.5"/>
            <path d="M32 40c0-6.627 5.373-12 12-12s12 5.373 12 12" className="stroke-content-muted/30" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="32" cy="50" r="6" className="fill-accent/10 stroke-accent/50" strokeWidth="1.5"/>
            <path d="M32 47v6M29 50h6" className="stroke-accent/50" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p className="text-xs text-content-muted mb-0.5">Aucune référence ajoutée</p>
          <p className="text-[10px] text-content-muted/60">Cliquez sur "Ajouter" pour en ajouter une</p>
        </div>
      )}

      {references.map((ref, idx) => (
        <div key={idx} className="border border-edge rounded-lg overflow-hidden">
          {/* Header */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded(expanded === idx ? null : idx)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(expanded === idx ? null : idx); } }}
            className="w-full flex items-center justify-between px-3 py-2 bg-surface-subtle/50 text-xs hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <span className="font-medium text-content-primary">
              {ref.nom ? `${ref.nom} ${ref.prenom}`.trim() : `Référence ${idx + 1}`}
              {ref.relation && (
                <span className="ml-1.5 text-content-muted font-normal">
                  ({RELATION_REFERENCE_OPTIONS.find(o => o.value === ref.relation)?.label || ref.relation})
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeRef(idx); }}
                className="p-1 text-status-danger/60 hover:text-status-danger"
              >
                <Trash2 size={14} />
              </button>
              {expanded === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>

          {/* Body */}
          {expanded === idx && (
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  label="Nom" name={`ref_${idx}_nom`} value={ref.nom}
                  onChange={(e) => updateRef(idx, 'nom', e.target.value.toUpperCase())}
                  error={errors[`ref_${idx}_nom`]} className="py-1"
                />
                <FormField
                  label="Prénom" name={`ref_${idx}_prenom`} value={ref.prenom}
                  onChange={(e) => updateRef(idx, 'prenom', capitalizeWords(e.target.value))}
                  className="py-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  label="Téléphone" name={`ref_${idx}_telephone`} type="tel" value={ref.telephone}
                  onChange={(e) => updateRef(idx, 'telephone', e.target.value)}
                  error={errors[`ref_${idx}_telephone`]} className="py-1"
                />
                <SelectField
                  label="Relation" name={`ref_${idx}_relation`} value={ref.relation}
                  onChange={(e) => updateRef(idx, 'relation', e.target.value)}
                  options={RELATION_REFERENCE_OPTIONS} placeholder="Choisir..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  label="Adresse" name={`ref_${idx}_adresse`} value={ref.adresse}
                  onChange={(e) => updateRef(idx, 'adresse', e.target.value)}
                  className="py-1"
                />
                <FormField
                  label="Profession" name={`ref_${idx}_profession`} value={ref.profession}
                  onChange={(e) => updateRef(idx, 'profession', e.target.value)}
                  className="py-1"
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
