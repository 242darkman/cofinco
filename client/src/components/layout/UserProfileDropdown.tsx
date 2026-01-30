import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, LogOut, ChevronDown, Activity, Building2, Shield } from 'lucide-react';
import { getRoleLabel } from '@shared/types/roles';
import { resolveStorageUrl } from '../../lib/format';

interface UserProfileDropdownProps {
  user: {
    nom?: string;
    prenom?: string;
    email?: string;
    role?: string;
    photoProfile?: string;
    agence?: string;
  };
  onProfileClick: () => void;
  onActivityClick?: () => void;
  onSessionsClick?: () => void;
  onLogout: () => void;
  className?: string;
}

// Composant MenuItem réutilisable avec forward ref
interface MenuItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ icon: Icon, label, onClick, isActive }, ref) => (
    <button
      ref={ref}
      onClick={onClick}
      role="menuitem"
      tabIndex={isActive ? 0 : -1}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer group outline-none focus:ring-2 focus:ring-indigo-500/50 ${isActive ? 'bg-slate-800/50 ring-1 ring-indigo-500/50' : ''}`}
    >
      <Icon size={18} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
      <span className="group-hover:text-white transition-colors">{label}</span>
    </button>
  )
);
MenuItem.displayName = 'MenuItem';

// Skeleton loading pour la photo
const PhotoSkeleton: React.FC<{ size: 'sm' | 'lg' }> = ({ size }) => (
  <div
    className={`${size === 'sm' ? 'w-8 h-8' : 'w-12 h-12'} rounded-full bg-slate-700 animate-pulse`}
  />
);

// Composant Avatar avec gestion d'erreur et skeleton
interface AvatarProps {
  photoUrl?: string;
  fullName: string;
  initials: string;
  size: 'sm' | 'lg';
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ photoUrl, fullName, initials, size, className = '' }) => {
  const [imageState, setImageState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const imgRef = useRef<HTMLImageElement>(null);

  const resolvedUrl = photoUrl ? resolveStorageUrl(photoUrl) : null;

  // Précharger et vérifier l'état de l'image
  useEffect(() => {
    if (!resolvedUrl) {
      setImageState('idle');
      return;
    }

    // Vérifier si l'image est déjà en cache
    const img = new Image();
    img.src = resolvedUrl;

    if (img.complete && img.naturalWidth > 0) {
      // Image déjà en cache - afficher immédiatement
      setImageState('loaded');
    } else {
      // Image pas en cache - afficher skeleton
      setImageState('loading');

      img.onload = () => setImageState('loaded');
      img.onerror = () => setImageState('error');
    }

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [resolvedUrl]);

  const sizeClasses = size === 'sm'
    ? 'w-8 h-8 text-sm'
    : 'w-12 h-12 text-lg';

  const borderClasses = size === 'sm'
    ? 'border-2 border-slate-700'
    : 'border-2 border-slate-600';

  // Fallback vers initiales si pas d'URL ou erreur
  if (!resolvedUrl || imageState === 'error') {
    return (
      <div className={`${sizeClasses} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold ${borderClasses} ${className}`}>
        {initials}
      </div>
    );
  }

  // Skeleton pendant le chargement
  if (imageState === 'loading' || imageState === 'idle') {
    return <PhotoSkeleton size={size} />;
  }

  // Image chargée
  return (
    <img
      ref={imgRef}
      src={resolvedUrl}
      alt={fullName}
      className={`${sizeClasses} rounded-full object-cover ${borderClasses} ${className}`}
      onError={() => setImageState('error')}
    />
  );
};

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({
  user,
  onProfileClick,
  onActivityClick,
  onSessionsClick,
  onLogout,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Refs for menu items for focus management
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Build menu items array
  const menuItems = [
    { id: 'profile', label: 'Mon Profil', icon: User, onClick: onProfileClick },
    ...(onSessionsClick ? [{ id: 'sessions', label: 'Sessions actives', icon: Shield, onClick: onSessionsClick }] : []),
    ...(onActivityClick ? [{ id: 'activity', label: "Journal d'activité", icon: Activity, onClick: onActivityClick }] : []),
  ];
  const totalItems = menuItems.length + 1; // +1 for logout button

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

  // Gestion clavier: Escape, flèches haut/bas, Tab (focus trap)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          setIsOpen(false);
          triggerRef.current?.focus();
          break;

        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex(prev => (prev + 1) % totalItems);
          break;

        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex(prev => (prev - 1 + totalItems) % totalItems);
          break;

        case 'Tab':
          // Focus trap: prevent tab from leaving the menu
          event.preventDefault();
          if (event.shiftKey) {
            setActiveIndex(prev => (prev - 1 + totalItems) % totalItems);
          } else {
            setActiveIndex(prev => (prev + 1) % totalItems);
          }
          break;

        case 'Enter':
        case ' ':
          // Let the active button handle this
          break;

        case 'Home':
          event.preventDefault();
          setActiveIndex(0);
          break;

        case 'End':
          event.preventDefault();
          setActiveIndex(totalItems - 1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalItems]);

  // Focus management: focus active item when activeIndex changes
  useEffect(() => {
    if (isOpen && menuItemRefs.current[activeIndex]) {
      menuItemRefs.current[activeIndex]?.focus();
    }
  }, [activeIndex, isOpen]);

  // Reset active index when opening menu
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    }
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
          {/* Avatar plus grand avec skeleton et gestion d'erreur */}
          <Avatar
            photoUrl={user?.photoProfile}
            fullName={fullName}
            initials={getInitials()}
            size="lg"
          />

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
        {menuItems.map((item, index) => (
          <MenuItem
            key={item.id}
            ref={el => { menuItemRefs.current[index] = el; }}
            icon={item.icon}
            label={item.label}
            isActive={activeIndex === index}
            onClick={() => {
              setIsOpen(false);
              item.onClick();
            }}
          />
        ))}
      </div>

      {/* ZONE 3: FOOTER */}
      <div className="p-2 border-t border-slate-800">
        <button
          ref={el => { menuItemRefs.current[menuItems.length] = el; }}
          onClick={() => {
            setIsOpen(false);
            onLogout();
          }}
          className={`w-full flex items-center gap-3 p-3 rounded-lg text-sm text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors group ${activeIndex === menuItems.length ? 'bg-rose-500/10 ring-1 ring-rose-500/50 text-rose-400' : ''}`}
          role="menuitem"
          tabIndex={activeIndex === menuItems.length ? 0 : -1}
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
          {/* Avatar avec skeleton et gestion d'erreur */}
          <Avatar
            photoUrl={user?.photoProfile}
            fullName={fullName}
            initials={getInitials()}
            size="sm"
          />
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
