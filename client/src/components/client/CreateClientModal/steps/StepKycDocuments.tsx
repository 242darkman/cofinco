import React, { useState, useRef, useEffect } from 'react';
import { FormField, SelectField, SearchableSelect, Badge } from '../../../ui';
import { UploadCloud, File as FileIcon } from 'lucide-react';
import { TYPE_PIECE_OPTIONS } from '@shared/enum/status-constants';
import { toast } from '../../../../lib/toast';
import { validateFileSize } from '../../../../lib/file-validation';
import type { StepComponentProps } from '../types';

export default function StepKycDocuments({
  formData, updateField, errors, markTouched, isConversion, referenceData, files, setFiles,
}: StepComponentProps) {
  const paysOptions = referenceData.paysList.map(p => ({
    value: p.id,
    label: p.nomFr || p.nomEn,
    emoji: p.iso2 ? String.fromCodePoint(...[...p.iso2.toUpperCase()].map(c => c.charCodeAt(0) + 127397)) : undefined,
  }));
  const isCNI = formData.typePiece === 'CNI';
  const isPermis = formData.typePiece === 'PERMIS_CONDUIRE';
  const isCarteResident = formData.typePiece === 'CARTE_RESIDENT';
  const isPassport = formData.typePiece === 'PASSPORT';
  const expirationRequired = !isPermis;

  // Labels dynamiques pour les zones d'upload
  const frontLabel = isCNI ? 'CNI Recto'
    : isPermis ? 'Permis de conduire (Recto)'
    : isCarteResident ? 'Carte de résident (Recto)'
    : isPassport ? 'Passeport (page photo)'
    : 'Document (Recto)';
  const backLabel = isCNI ? 'CNI Verso'
    : isPermis ? 'Permis de conduire (Verso)'
    : isCarteResident ? 'Carte de résident (Verso)'
    : 'Document (Verso)';
  const hasTwoSides = isCNI || isPermis || isCarteResident;

  return (
    <div className="space-y-5">
      {/* KYC Status Badge */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-content-primary">Pièce d'identité & KYC</h4>
        <Badge rawValue size="sm">En attente</Badge>
      </div>

      {/* Type pièce & N° */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <SelectField
          label="Type de pièce" name="typePiece" value={formData.typePiece}
          onChange={(e) => updateField('typePiece', e.target.value)}
          options={TYPE_PIECE_OPTIONS} required
        />
        <FormField
          label="Numéro de pièce" name="numeroPiece" value={formData.numeroPiece}
          onChange={(e) => updateField('numeroPiece', e.target.value)}
          className="py-1" placeholder="N° du document" required
        />
      </div>

      {/* Date expiration & Pays émission */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FormField
          label={`Date d'expiration${!expirationRequired ? ' (optionnelle)' : ''}`}
          name="dateExpirationPiece" type="date"
          value={formData.dateExpirationPiece}
          onChange={(e) => updateField('dateExpirationPiece', e.target.value)}
          className="py-1" required={expirationRequired}
        />
        <SearchableSelect
          label="Pays d'émission" name="paysEmissionId"
          options={paysOptions}
          value={formData.paysEmissionId}
          onChange={(val) => updateField('paysEmissionId', val)}
          placeholder="Rechercher un pays..."
          required
        />
      </div>

      {/* Document uploads */}
      <div className="space-y-4">
        <h4 className="text-xs font-semibold text-content-primary">Documents</h4>

        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2">
          <DocUploadCard
            label={frontLabel}
            file={files?.idFront || null}
            onFileChange={(f) => setFiles?.(prev => ({ ...prev, idFront: f }))}
            required={!isConversion}
          />
          {hasTwoSides && (
            <DocUploadCard
              label={backLabel}
              file={files?.idBack || null}
              onFileChange={(f) => setFiles?.(prev => ({ ...prev, idBack: f }))}
              required={!isConversion && isCNI}
            />
          )}
        </div>

        <DocUploadCard
          label="Justificatif de domicile"
          file={files?.proofOfAddress || null}
          onFileChange={(f) => setFiles?.(prev => ({ ...prev, proofOfAddress: f }))}
        />
      </div>

      {isConversion && (
        <p className="text-[10px] text-content-muted bg-status-info-bg/30 border border-status-info/20 rounded-lg p-2">
          En mode conversion, les documents KYC sont optionnels car l'identité a déjà été vérifiée lors de la création du compte employé.
        </p>
      )}
    </div>
  );
}

/* ===== DocUploadCard ===== */

function DocUploadCard({ label, file, onFileChange, required }: {
  label: string;
  file: File | null;
  onFileChange: (f: File | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const isPdf = file?.type === 'application/pdf';

  useEffect(() => {
    if (file && !isPdf) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreview(null);
    }
  }, [file, isPdf]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (selected && !selected.type.startsWith('image/') && selected.type !== 'application/pdf') {
      toast.error('Format non supporté. Formats acceptés : JPG, PNG, PDF');
      e.target.value = '';
      return;
    }
    if (selected && !validateFileSize(selected)) {
      e.target.value = '';
      return;
    }
    onFileChange(selected);
  };

  return (
    <div>
      <label className="text-[10px] font-bold text-content-muted uppercase mb-1 block">
        {label}{required && <span className="text-status-danger ml-0.5">*</span>}
      </label>
      <input ref={inputRef} type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={handleChange} />
      <div
        onClick={() => inputRef.current?.click()}
        className={`h-20 border border-dashed rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer group overflow-hidden ${
          file
            ? 'border-status-success/50 bg-status-success/5'
            : 'border-edge bg-surface-base/30 hover:border-accent hover:bg-accent/5'
        }`}
      >
        {file ? (
          isPdf ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center">
              <FileIcon className="w-5 h-5 text-status-danger mb-1" />
              <span className="text-[9px] text-content-muted truncate max-w-[90%] px-2">{file.name}</span>
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <span className="text-[11px] text-white font-medium">Changer</span>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <img src={preview!} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <span className="text-[11px] text-white font-medium">Changer</span>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-1 p-2">
            <UploadCloud className="w-5 h-5 text-content-muted group-hover:text-accent transition" />
            <span className="text-[10px] text-content-muted group-hover:text-accent text-center">Scanner / Uploader</span>
          </div>
        )}
      </div>
    </div>
  );
}
