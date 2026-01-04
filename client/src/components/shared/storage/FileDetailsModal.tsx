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
          <div className="flex justify-between py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Nom</span>
            <span className="font-medium text-slate-800 dark:text-white truncate max-w-[200px]">{document.nom}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Type</span>
            <span className="font-medium text-slate-800 dark:text-white capitalize">{document.type}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Catégorie</span>
            <span className="font-medium text-slate-800 dark:text-white capitalize">{document.categorie}</span>
          </div>
          {document.taille !== undefined && (
            <div className="flex justify-between py-3 border-b border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">Taille</span>
              <span className="font-medium text-slate-800 dark:text-white">{formatFileSize(document.taille)}</span>
            </div>
          )}
          <div className="flex justify-between py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Visibilité</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              document.visibilite === 'public' 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
            }`}>
              {document.visibilite}
            </span>
          </div>
          <div className="flex justify-between py-3 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Créé le</span>
            <span className="font-medium text-slate-800 dark:text-white">
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
