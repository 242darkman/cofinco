import React from 'react';
import { LayoutDashboard, PiggyBank, ArrowLeftRight, Menu } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../auth/ProtectedFeature';
import { AppModule } from '@shared/config/rbac';

interface MobileBottomNavProps {
  currentModule: string;
  onModuleChange: (module: string) => void;
  onMenuToggle: () => void;
  menuOpen?: boolean;
  transferDisabled?: boolean;
}

const NAV_ITEMS: Array<{ key: string; labelKey: string; icon: typeof LayoutDashboard; requiredModule?: AppModule }> = [
  { key: 'dashboard', labelKey: 'menuDashboard', icon: LayoutDashboard, requiredModule: 'Dashboard' },
  { key: 'comptes', labelKey: 'menuCompte', icon: PiggyBank, requiredModule: 'Comptes' },
  { key: 'transfert', labelKey: 'menuTransfert', icon: ArrowLeftRight, requiredModule: 'Communications' },
];

export default function MobileBottomNav({
  currentModule,
  onModuleChange,
  onMenuToggle,
  menuOpen = false,
  transferDisabled = false,
}: MobileBottomNavProps) {
  const { t } = useLanguage();
  const { canAccessModule } = usePermissions();

  // Filter items based on RBAC permissions
  const accessibleItems = NAV_ITEMS.filter(item =>
    !item.requiredModule || canAccessModule(item.requiredModule)
  );

  // Calculate grid columns dynamically (accessible items + menu button)
  const gridCols = accessibleItems.length + 1;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-edge bg-surface-base/95 backdrop-blur supports-[backdrop-filter]:bg-surface-base/80"
      aria-label="Navigation mobile"
    >
      <div className={`grid px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)]`} style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
        {accessibleItems.map((item) => {
          const isActive = currentModule === item.key;
          const isDisabled = item.key === 'transfert' && transferDisabled;
          const Icon = item.icon;

          return (
            <button
              key={item.key}
              onClick={() => {
                if (isDisabled) return;
                onModuleChange(item.key);
              }}
              className={[
                'flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition',
                isActive ? 'text-accent' : 'text-content-muted',
                isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:text-content-primary',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
              disabled={isDisabled}
            >
              <Icon size={18} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}

        <button
          onClick={onMenuToggle}
          className={[
            'flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition',
            menuOpen ? 'text-accent' : 'text-content-muted',
            'hover:text-content-primary',
          ].join(' ')}
          aria-expanded={menuOpen}
          aria-label="Ouvrir le menu"
        >
          <Menu size={18} />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
