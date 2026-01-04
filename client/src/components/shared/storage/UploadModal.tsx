import React from 'react';
import { Upload } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  isUploading: boolean;
  progress: number;
}

export default function UploadModal({ 
  isOpen, onClose, onUpload, isUploading, progress 
}: UploadModalProps) {
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Téléverser un fichier"
      size="sm"
    >
      <div className="space-y-4">
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:bg-slate-50 dark:hover:bg-slate-700/50 transition bg-slate-50/50 dark:bg-slate-800/50">
          <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            Glissez un fichier ici ou cliquez pour parcourir
          </p>
          <div onClick={() => document.getElementById('file-upload-input')?.click()}>
            <Button type="button" className="pointer-events-none">
              Choisir un fichier
            </Button>
            <input
              id="file-upload-input"
              type="file"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>

        {isUploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Téléversement en cours...</span>
              <span>{progress}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isUploading}>
            Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
