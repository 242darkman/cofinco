import React from 'react';
import Modal from '@/components/ui/Modal';
import FormField from '@/components/ui/FormField';
import Button from '@/components/ui/Button';

interface NewFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderName: string;
  setFolderName: (name: string) => void;
  onCreate: () => void;
}

export default function NewFolderModal({ 
  isOpen, onClose, folderName, setFolderName, onCreate 
}: NewFolderModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nouveau dossier"
      size="sm"
    >
      <div className="space-y-4">
        <FormField
          label="Nom du dossier"
          name="folderName"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="Entrez le nom du dossier"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={onCreate}>
            Créer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
