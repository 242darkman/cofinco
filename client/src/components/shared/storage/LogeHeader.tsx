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
        <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shrink-0">
          <Cloud className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Loge - Stockage Cloud</h1>
          <p className="text-slate-500 dark:text-slate-400">Centre de stockage centralisé - Capacité 4 TB</p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        <Button
          onClick={onLock}
          variant="secondary"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
          icon={Lock}
        >
          Verrouiller
        </Button>
        <Button
          onClick={onUpload}
          className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90 shadow-lg text-white"
          icon={Upload}
        >
          Téléverser
        </Button>
        <Button
          onClick={onNewFolder}
          variant="outline"
          className="bg-white dark:bg-slate-700 text-slate-700 dark:text-white border-slate-200 dark:border-slate-600"
          icon={FolderPlus}
        >
          Nouveau dossier
        </Button>
      </div>
    </div>
  );
}
