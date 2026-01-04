import React, { useState, useRef, useEffect } from 'react';
import { User, Settings, LogOut, ChevronDown, Check } from 'lucide-react';
import { authService } from '../../lib/auth';
import { useLocation } from 'wouter';

interface UserProfileDropdownProps {
  user: {
    nom?: string;
    prenom?: string;
    email?: string;
    role?: string;
    photo_url?: string;
  };
  onProfileClick: () => void;
  onSettingsClick: () => void;
  onLogout: () => void;
  className?: string;
}

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({ 
  user, 
  onProfileClick, 
  onSettingsClick,
  onLogout,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const initials = (user?.nom || 'A').charAt(0).toUpperCase();

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative flex items-center gap-2 md:gap-3 p-1.5 md:p-2 rounded-xl transition-all duration-300
          ${isOpen 
            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40' 
            : 'hover:bg-slate-800/80 text-slate-300 hover:text-white'
          }
        `}
        aria-label="Menu utilisateur"
        aria-expanded={isOpen}
      >
        <div className="w-8 h-8 md:w-9 md:h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-lg shadow-blue-900/20 border border-blue-500/30">
          {initials}
        </div>
        
        <div className="hidden md:flex flex-col items-start sr-only sm:not-sr-only">
          <span className="text-xs font-bold leading-tight">{user?.nom || 'Admin'} {user?.prenom}</span>
          <span className="text-[10px] opacity-60 font-medium tracking-wide uppercase">{user?.role || 'Administrateur'}</span>
        </div>
        
        <ChevronDown size={14} className={`opacity-50 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 z-[100] w-72 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-2 shadow-2xl ring-1 ring-white/10">
            {/* Header info */}
            <div className="p-3 mb-2 border-b border-white/5 mx-1">
               <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-inner">
                    {initials}
                  </div>
                  <div className="overflow-hidden">
                    <h4 className="font-bold text-white truncate">{user?.nom} {user?.prenom}</h4>
                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  </div>
               </div>
               <div className="flex items-center gap-2">
                 <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider rounded-md">
                   {user?.role}
                 </span>
                 <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-bold uppercase tracking-wider rounded-md flex items-center gap-1.5">
                   <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                    </span>
                   En ligne
                 </span>
               </div>
            </div>

            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onProfileClick();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-200 group"
              >
                <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-slate-700 transition-colors text-slate-400 group-hover:text-blue-400">
                   <User size={16} />
                </div>
                <span>Mon Profil</span>
              </button>

              <button
                onClick={() => {
                  setIsOpen(false);
                  onSettingsClick();
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-200 group"
              >
                <div className="p-2 rounded-lg bg-slate-800 group-hover:bg-slate-700 transition-colors text-slate-400 group-hover:text-blue-400">
                   <Settings size={16} />
                </div>
                <span>Paramètres</span>
               </button>

               <div className="h-px bg-white/5 my-1 mx-2" />

               <button
                  onClick={() => {
                    setIsOpen(false);
                    onLogout();
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 group"
                >
                  <div className="p-2 rounded-lg bg-red-500/10 group-hover:bg-red-500/20 transition-colors text-red-500">
                     <LogOut size={16} />
                  </div>
                  <span>Déconnexion</span>
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfileDropdown;
