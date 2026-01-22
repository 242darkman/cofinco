import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, Settings, LogOut, ChevronDown, Activity, Building2 } from 'lucide-react';
import { getRoleLabel } from '@shared/types/roles';

interface UserProfileDropdownProps {
  user: {
    nom?: string;
    prenom?: string;
    email?: string;
    role?: string;
    photo_url?: string;
    agence?: string;
  };
  onProfileClick: () => void;
  onSettingsClick: () => void;
  onActivityClick?: () => void;
  onLogout: () => void;
  className?: string;
}

// Composant MenuItem réutilisable
interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon: Icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 p-3 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer group"
  >
    <Icon size={18} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
    <span className="group-hover:text-white transition-colors">{label}</span>
  </button>
);

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({
  user,
  onProfileClick,
  onSettingsClick,
  onActivityClick,
  onLogout,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculer la position du menu
  const updateMenuPosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 12, // mt-3 = 12px
        right: window.innerWidth - rect.right,
      });
    }
  };

  // Mise à jour de la position à l'ouverture et au resize
  useEffect(() => {
    if (isOpen) {
      updateMenuPosition();
      window.addEventListener('resize', updateMenuPosition);
      window.addEventListener('scroll', updateMenuPosition, true);
    }
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen]);

  // Gestion du clic extérieur pour fermer le menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Gestion de la touche Escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Génération des initiales
  const getInitials = () => {
    const nom = user?.nom?.charAt(0) || '';
    const prenom = user?.prenom?.charAt(0) || '';
    return (nom + prenom).toUpperCase() || 'U';
  };

  // Nom complet
  const fullName = [user?.prenom, user?.nom].filter(Boolean).join(' ') || 'Utilisateur';

  // Contenu du menu dropdown
  const dropdownMenu = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: menuPosition.top,
        right: menuPosition.right,
        zIndex: 99999,
      }}
      className="w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      role="menu"
      aria-orientation="vertical"
    >
      {/* ZONE 1: HEADER IDENTITÉ */}
      <div className="p-4 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-4">
          {/* Avatar plus grand */}
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt={fullName}
              className="w-12 h-12 rounded-full object-cover border-2 border-slate-600"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg border border-indigo-500/30">
              {getInitials()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Nom complet */}
            <h4 className="text-white font-medium truncate">{fullName}</h4>

            {/* Rôle */}
            <p className="text-xs text-slate-400 truncate">
              {getRoleLabel(user?.role || '')}
            </p>

            {/* Email */}
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {user?.email}
            </p>

            {/* Badge Agence */}
            {user?.agence && (
              <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                <Building2 size={10} className="text-slate-400" />
                <span className="text-[10px] text-slate-300">{user.agence}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ZONE 2: NAVIGATION */}
      <div className="p-2 space-y-1">
        <MenuItem
          icon={User}
          label="Mon Profil"
          onClick={() => {
            setIsOpen(false);
            onProfileClick();
          }}
        />
        <MenuItem
          icon={Settings}
          label="Paramètres"
          onClick={() => {
            setIsOpen(false);
            onSettingsClick();
          }}
        />
        {onActivityClick && (
          <MenuItem
            icon={Activity}
            label="Journal d'activité"
            onClick={() => {
              setIsOpen(false);
              onActivityClick();
            }}
          />
        )}
      </div>

      {/* ZONE 3: FOOTER */}
      <div className="p-2 border-t border-slate-800">
        <button
          onClick={() => {
            setIsOpen(false);
            onLogout();
          }}
          className="w-full flex items-center gap-3 p-3 rounded-lg text-sm text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors group"
          role="menuitem"
        >
          <LogOut size={16} className="group-hover:text-rose-400 transition-colors" />
          <span>Déconnexion</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      {/* TRIGGER ÉPURÉ */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pr-2 rounded-full hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        aria-label="Menu utilisateur"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <div className="relative">
          {/* Avatar */}
          {user?.photo_url ? (
            <img
              src={user.photo_url}
              alt={fullName}
              className="w-8 h-8 rounded-full object-cover border-2 border-slate-700"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold border-2 border-slate-700">
              {getInitials()}
            </div>
          )}
          {/* Indicateur de statut en ligne */}
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
        </div>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* MENU FLOTTANT - Rendu via Portal pour garantir le z-index */}
      {isOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            {dropdownMenu}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default UserProfileDropdown;
