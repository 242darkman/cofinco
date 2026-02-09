import React, { useEffect } from 'react';

interface AppShellProps {
  isMobile: boolean;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  sidebar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
  bottomNav?: React.ReactNode;
  sidebarWidthOpen?: string;
  sidebarWidthClosed?: string;
  contentOffsetOpen?: string;
  contentOffsetClosed?: string;
}

export default function AppShell({
  isMobile,
  sidebarOpen,
  onCloseSidebar,
  sidebar,
  header,
  children,
  bottomNav,
  sidebarWidthOpen = 'w-64',
  sidebarWidthClosed = 'w-16',
  contentOffsetOpen = 'lg:ml-64',
  contentOffsetClosed = 'lg:ml-16'
}: AppShellProps) {
  const sidebarWidth = sidebarOpen ? sidebarWidthOpen : sidebarWidthClosed;
  const contentOffset = sidebarOpen ? contentOffsetOpen : contentOffsetClosed;
  const hasBottomNav = Boolean(bottomNav);

  // UX: close with Escape on mobile overlay
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseSidebar();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobile, sidebarOpen, onCloseSidebar]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (!isMobile) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : original || '';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isMobile, sidebarOpen]);

  return (
    <div className="relative h-[100svh] w-full bg-surface-base text-content-primary overflow-hidden transition-colors duration-300">
      {/* Mobile overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/50 dark:bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCloseSidebar}
        aria-hidden={!sidebarOpen}
      />

      {/* Sidebar */}
      <aside
        className={[
          'fixed left-0 top-0 z-50 h-[100svh] bg-sidebar-bg border-r border-sidebar-border',
          'flex flex-col overflow-hidden',
          'transition-all duration-300 ease-in-out',
          isMobile ? sidebarWidthOpen : sidebarWidth,
          isMobile ? (sidebarOpen ? 'translate-x-0' : '-translate-x-full invisible') : 'translate-x-0'
        ].join(' ')}
        role="navigation"
        aria-label="Sidebar"
      >
        {/* Safe area padding for modern phones */}
        <div className="h-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          {sidebar}
        </div>
      </aside>

      {/* Main content wrapper - uses flex to fill viewport */}
      <div
        className={[
          'flex flex-col h-full',
          'ml-0',
          contentOffset,
          'transition-[margin] duration-300'
        ].join(' ')}
      >
        {/* Fixed header */}
        <header className="shrink-0 z-30 border-b border-edge bg-surface-base/95 backdrop-blur supports-[backdrop-filter]:bg-surface-base/80 transition-colors duration-300">
          <div className="px-4 py-2.5 sm:px-5 sm:py-3 lg:px-6">
            {header}
          </div>
        </header>

        {/* Scrollable content area - takes remaining space */}
        <main
          className={[
            'flex-1 min-h-0 overflow-y-auto overscroll-contain bg-surface pro-scrollbar',
            isMobile && hasBottomNav ? 'pb-20' : ''
          ].join(' ')}
        >
          {/* Content wrapper */}
          <div className="px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6 flex flex-col h-full">
            {children}
          </div>

          {/* Bottom safe-area spacing for iOS */}
          <div className="h-[env(safe-area-inset-bottom)]" />
        </main>
      </div>

      {hasBottomNav && (
        <div className="lg:hidden">
          {bottomNav}
        </div>
      )}
    </div>
  );
}
