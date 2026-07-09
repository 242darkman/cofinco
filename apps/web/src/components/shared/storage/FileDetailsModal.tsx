import React from 'react';
import { Download } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Document, formatFileSize } from '@/hooks/useLoge';

interface FileDetailsModalProps {
  document: Document | null;
  onClose: () => void;
}

export default function FileDetailsModal({ document, onClose }: FileDetailsModalProps) {
  if (!document) return null;

  return (
    <Modal
      isOpen={!!document}
      onClose={onClose}
      title="Détails du document"
      size="md"
    >
      <div className="space-y-4">
        <div className="space-y-0 text-sm">
          <div className="flex justify-between py-3 border-b border-edge">
            <span className="text-content-muted">Nom</span>
            <span className="font-medium text-content-primary truncate max-w-[200px]">{document.nom}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-edge">
            <span className="text-content-muted">Type</span>
            <span className="font-medium text-content-primary capitalize">{document.type}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-edge">
            <span className="text-content-muted">Catégorie</span>
            <span className="font-medium text-content-primary capitalize">{document.categorie}</span>
          </div>
          {document.taille !== undefined && (
            <div className="flex justify-between py-3 border-b border-edge">
              <span className="text-content-muted">Taille</span>
              <span className="font-medium text-content-primary">{formatFileSize(document.taille)}</span>
            </div>
          )}
          <div className="flex justify-between py-3 border-b border-edge">
            <span className="text-content-muted">Visibilité</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              document.visibilite === 'public' 
                ? 'bg-status-success-bg text-status-success'
                : 'bg-surface-muted text-content-secondary-elevated'
            }`}>
              {document.visibilite}
            </span>
          </div>
          <div className="flex justify-between py-3 border-b border-edge">
            <span className="text-content-muted">Créé le</span>
            <span className="font-medium text-content-primary">
              {new Date(document.createdAt).toLocaleDateString('fr-FR', { 
                day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
              })}
            </span>
          </div>
        </div>

        {document.objectPath && document.type === 'fichier' && (
          <div className="pt-2">
            <Button
              onClick={() => window.open(document.objectPath, '_blank')}
              fullWidth
              icon={Download}
            >
              Télécharger
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
