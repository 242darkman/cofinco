import React from 'react';
import { Key } from 'lucide-react';
import Card from '../../ui/Card';
import Button from '../../ui/Button';

interface SecuritySectionProps {
  onChangePasswordClick: () => void;
}

export default function SecuritySection({ onChangePasswordClick }: SecuritySectionProps) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-700 pb-4">
        <Key size={24} className="text-cyan-400" />
        Sécurité
      </h2>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-700/20 p-4 rounded-xl border border-slate-700/50">
        <div>
          <h3 className="text-white font-semibold">Mot de passe</h3>
          <p className="text-slate-400 text-sm mt-1">Dernière modification il y a 3 mois</p>
        </div>
        <Button
          onClick={onChangePasswordClick}
          variant="secondary"
          icon={Key}
        >
          Changer
        </Button>
      </div>
    </Card>
  );
}
