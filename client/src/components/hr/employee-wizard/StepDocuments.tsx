import React from 'react';
import { CreditCard, BookUser, FileQuestion, FileText, Info } from 'lucide-react';
import FormField from '../../ui/FormField';
import SearchableSelect from '../../ui/SearchableSelect';
import SmartDocumentUpload, { type UploadedDocument } from '../../ui/SmartDocumentUpload';

interface StepDocumentsProps {
  formData: any;
  updateField: (field: string, value: string | null) => void;
  editingEmploye: any | null;
  paysList: Array<{ id: string; nomFr: string; nomEn: string; iso2: string | null }>;
  uploadedDocs: Record<string, any>;
  handleDocumentChange: (type: string, doc: any) => void;
  entityId: string;
}

const getFlagEmoji = (iso2: string | null) => {
  if (!iso2) return undefined;
  return String.fromCodePoint(...[...iso2.toUpperCase()].map(c => c.charCodeAt(0) + 127397));
};

const StepDocuments: React.FC<StepDocumentsProps> = ({
  formData,
  updateField,
  editingEmploye,
  paysList,
  uploadedDocs,
  handleDocumentChange,
  entityId,
}) => {
  const idTypes = [
    {
      value: 'CNI',
      label: 'CNI',
      description: 'Carte Nationale d\'Identité',
      icon: CreditCard,
    },
    {
      value: 'PASSPORT',
      label: 'Passeport',
      description: 'Passeport',
      icon: BookUser,
    },
    {
      value: 'OTHER',
      label: 'Autre',
      description: 'Autre pièce',
      icon: FileQuestion,
    },
  ];

  const paysOptions = paysList.map(p => ({
    value: p.id,
    label: p.nomFr,
    emoji: getFlagEmoji(p.iso2),
    searchText: `${p.nomFr} ${p.nomEn} ${p.iso2 || ''}`.toLowerCase(),
  }));

  const showDigitalDocuments = formData.typePiece === 'CNI' || formData.typePiece === 'PASSPORT';
  const showVerso = formData.typePiece === 'CNI';

  return (
    <div className="space-y-6">
      {/* Pièce d'identité Section */}
      <div className="bg-accent/10 border border-accent/20 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-5 h-5 text-accent" />
          <h3 className="text-lg font-semibold text-content-primary">
            Pièce d'identité
          </h3>
        </div>
        <p className="text-sm text-content-secondary mb-6">
          Document officiel d'identification de l'employé
        </p>

        {/* ID Type Selection */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {idTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = formData.typePiece === type.value;

            return (
              <button
                key={type.value}
                type="button"
                onClick={() => updateField('typePiece', type.value)}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-edge bg-surface hover:border-accent/50'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <Icon className={`w-6 h-6 ${isSelected ? 'text-accent' : 'text-content-secondary'}`} />
                  <div className="text-center">
                    <div className={`font-medium ${isSelected ? 'text-accent' : 'text-content-primary'}`}>
                      {type.label}
                    </div>
                    <div className="text-xs text-content-muted mt-1">
                      {type.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ID Details Fields */}
        {formData.typePiece && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Numéro de Pièce"
                name="numeroPiece"
                type="text"
                value={formData.numeroPiece || ''}
                onChange={(e) => updateField('numeroPiece', e.target.value)}
                required={formData.typePiece === 'CNI' || formData.typePiece === 'PASSPORT'}
                placeholder={
                  formData.typePiece === 'CNI'
                    ? 'Ex: 123456789'
                    : formData.typePiece === 'PASSPORT'
                    ? 'Ex: AB1234567'
                    : 'Numéro du document'
                }
              />

              <FormField
                label="Date d'Expiration"
                name="dateExpirationPiece"
                type="date"
                value={formData.dateExpirationPiece || ''}
                onChange={(e) => updateField('dateExpirationPiece', e.target.value)}
                placeholder="JJ/MM/AAAA"
              />
            </div>

            <SearchableSelect
              label="Pays d'Émission"
              name="paysEmissionId"
              value={formData.paysEmissionId || ''}
              onChange={(value) => updateField('paysEmissionId', value)}
              options={paysOptions}
              placeholder="Sélectionner le pays d'émission"
            />
          </div>
        )}
      </div>

      {/* Documents numérisés Section */}
      {showDigitalDocuments && (
        <div className="bg-surface/30 border border-edge rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-5 h-5 text-accent" />
            <h3 className="text-lg font-semibold text-content-primary">
              Documents numérisés
            </h3>
          </div>

          <div className={`grid ${showVerso ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mt-4`}>
            <SmartDocumentUpload
              label={formData.typePiece === 'PASSPORT' ? 'Page Principale' : 'Recto'}
              documentType="ID_CARD_FRONT"
              existingDocument={uploadedDocs.ID_CARD_FRONT}
              isPrivate={true}
              fileType="kyc"
              entityType="employe"
              entityId={entityId}
              aspectRatio="card"
              watermarkIcon="front"
              accept="image/png,image/jpeg,image/jpg,application/pdf"
              ctaText={formData.typePiece === 'PASSPORT' ? 'Scanner la Page Principale' : 'Scanner le Recto'}
              onUploadComplete={(doc) => handleDocumentChange('ID_CARD_FRONT', doc)}
              onRemove={() => handleDocumentChange('ID_CARD_FRONT', null)}
            />

            {showVerso && (
              <SmartDocumentUpload
                label="Verso"
                documentType="ID_CARD_BACK"
                existingDocument={uploadedDocs.ID_CARD_BACK}
                isPrivate={true}
                fileType="kyc"
                entityType="employe"
                entityId={entityId}
                aspectRatio="card"
                watermarkIcon="back"
                accept="image/png,image/jpeg,image/jpg,application/pdf"
                ctaText="Scanner le Verso"
                onUploadComplete={(doc) => handleDocumentChange('ID_CARD_BACK', doc)}
                onRemove={() => handleDocumentChange('ID_CARD_BACK', null)}
              />
            )}
          </div>
        </div>
      )}

      {/* Info Note */}
      <div className="bg-status-info-bg border border-status-info/20 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-status-info mt-0.5 flex-shrink-0" />
          <p className="text-sm text-content-secondary">
            Les documents d'identité sont requis pour la conformité RH et le dossier personnel de l'employé.
          </p>
        </div>
      </div>
    </div>
  );
};

export default StepDocuments;
