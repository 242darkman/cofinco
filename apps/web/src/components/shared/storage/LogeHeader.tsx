import React from 'react';
import { Cloud, Lock, Upload, FolderPlus } from 'lucide-react';
import Button from '@/components/ui/Button';

interface LogeHeaderProps {
  onLock: () => void;
  onUpload: () => void;
  onNewFolder: () => void;
}

export default function LogeHeader({ onLock, onUpload, onNewFolder }: LogeHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-status-info to-accent rounded-xl shadow-lg shrink-0">
          <Cloud className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Loge - Stockage Cloud</h1>
          <p className="text-content-muted">Centre de stockage centralisé - Capacité 4 TB</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        <Button
          onClick={onLock}
          variant="secondary"
          className="bg-status-warning-bg text-status-warning border-status-warning/30 hover:bg-status-warning-bg"
          icon={Lock}
        >
          Verrouiller
        </Button>
        <Button
          onClick={onUpload}
          className="bg-linear-to-r from-status-info to-accent hover:opacity-90 shadow-lg text-white"
          icon={Upload}
        >
          Téléverser
        </Button>
        <Button
          onClick={onNewFolder}
          variant="outline"
          className="bg-surface-elevated text-content-secondary border-edge-strong"
          icon={FolderPlus}
        >
          Nouveau dossier
        </Button>
      </div>
    </div>
  );
}
