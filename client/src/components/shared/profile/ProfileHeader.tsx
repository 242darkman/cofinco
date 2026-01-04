import React from 'react';
import { Edit2, X } from 'lucide-react';
import { UserData } from '../../../hooks/useUserProfile';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';

interface ProfileHeaderProps {
  user: UserData;
  editing: boolean;
  onToggleEdit: () => void;
  getFullName: () => string;
  getRoleLabel: (role: string) => string;
}

export default function ProfileHeader({ user, editing, onToggleEdit, getFullName, getRoleLabel }: ProfileHeaderProps) {
  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 shadow-lg shadow-blue-900/10">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-cyan-900/30 border-4 border-slate-800">
            {getFullName().charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{getFullName()}</h1>
            <p className="text-slate-400 font-medium">@{user.username}</p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge variant="info" value={getRoleLabel(user.role)} />
              <Badge 
                variant={user.actif !== false ? 'success' : 'danger'} 
                value={user.actif !== false ? 'Actif' : 'Inactif'} 
              />
            </div>
          </div>
        </div>
        <Button
          onClick={onToggleEdit}
          variant={editing ? "ghost" : "primary"}
          icon={editing ? X : Edit2}
        >
          {editing ? 'Annuler' : 'Modifier'}
        </Button>
      </div>
    </div>
  );
}
