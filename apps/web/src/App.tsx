import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { TenantLogo } from '@/components/branding/TenantLogo';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import LoginPage from './components/auth/LoginPage';
import ErrorBoundary from './components/shared/ErrorBoundary';
import LoadingScreen from './components/ui/LoadingScreen';
import { SuccessCheckmark } from './components/ui/SuccessCheckmark';
import AppShell from './components/layout/AppShell';
import { authService } from './lib/auth';
import { getReturnTo, getPostLoginDestination, buildLoginUrl } from './lib/navigation';
import { getSyncMonitor } from './services/SyncMonitorService';
import LocationTracker from '@/components/agent/LocationTracker';
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { AgenceProvider } from './contexts/AgenceContext';
import { AbilityProvider } from './contexts/AbilityContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { SessionProvider } from './contexts/SessionContext';
import { UpdatePrompt } from './components/shared/UpdatePrompt';
import { useServerHealth } from './contexts/ServerHealthContext';
import { useNetwork } from './contexts/NetworkContext';
import NetworkOverlay from './components/shared/NetworkOverlay';
import NetworkBanner from './components/shared/NetworkBanner';
import SessionExpirationWarning from './components/shared/SessionExpirationWarning';
import { useOfflineBus } from './hooks/useOfflineBus';
import { useDocumentBranding } from '@/hooks/useDocumentBranding';
import { OfflineProvider } from './contexts/OfflineContext';
import { TenantProvider } from './contexts/TenantContext';

// Lazy load heavy components
const MicroflexPlatform = lazy(() => import('./MicroflexPlatform'));
const AgentCaisseInterface = lazy(() => import('./components/agent/AgentCaisseInterface'));
const SeasonalWelcome = lazy(() => import('./components/shared/SeasonalWelcome'));

/**
 * Durées (ms) de la séquence post-login, centralisées pour ajuster finement le
 * temps d'attente perçu (~2 s cumulés) sans toucher à la logique.
 */
const POST_LOGIN_TIMINGS = {
  /** Écran « Connexion en cours… » — phase de sécurisation. */
  securing: 800,
  /** Écran « Connecté / Bienvenue » — phase de succès. */
  success: 1200,
} as const;

/** Pause asynchrone (permet un flux post-login lisible en async/await). */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showSeasonalWelcome, setShowSeasonalWelcome] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoadingAfterLogin, setShowLoadingAfterLogin] = useState(false);
  const [showConnectedSuccess, setShowConnectedSuccess] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);
  const { isServerReachable, isChecking, checkHealth } = useServerHealth();
  const { status: networkStatus, isOffline, isApiDown, forceRetry } = useNetwork();
  const branding = useDocumentBranding();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Initialize OfflineBus reactors (cache invalidation, toasts, sync, limits, audit)
  useOfflineBus(isAuthenticated);

  // Show NetworkOverlay only for prolonged offline (not just unstable)
  // The NetworkBanner handles showing status for unstable connections
  const showNetworkOverlay = isOffline || (isApiDown && !isServerReachable);

  // Précharger l'image de profil pour qu'elle soit en cache
  const preloadProfilePhoto = useCallback((photoUrl: string | undefined) => {
    if (!photoUrl) return;

    // Résoudre l'URL complète
    let resolvedUrl = photoUrl;
    if (!photoUrl.startsWith('http') && !photoUrl.startsWith('/api/') && !photoUrl.startsWith('data:')) {
      resolvedUrl = `/api/storage/files/${photoUrl}`;
    }

    // Précharger l'image
    const img = new Image();
    img.src = resolvedUrl;
  }, []);

  // Handler pour la déconnexion automatique (session expirée, 401, etc.)
  const handleSessionExpired = useCallback((reason?: string) => {
    if (import.meta.env.DEV) console.log('Session expired, logging out...', reason);

    // Afficher un toast d'erreur avec la raison
    const message = reason || 'Votre session a expiré. Veuillez vous reconnecter.';
    toast.error(message, {
      duration: 5000,
      id: 'session-expired', // Évite les doublons
    });

    // Sauvegarder le message pour l'afficher sur la page de login
    setSessionExpiredMessage(message);

    // Arrêter le SyncMonitor pour éviter les heartbeats 401 sur la page de login
    getSyncMonitor().stop();

    // Nettoyer l'état et le cache
    setCurrentUser(null);
    setIsAuthenticated(false);
    setShowSeasonalWelcome(false);
    setShowLoadingAfterLogin(false);
    setShowConnectedSuccess(false);

    // Clear all React Query cache to prevent stale data
    queryClient.removeQueries();
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    // Configurer le callback d'expiration de session
    authService.setOnSessionExpired(() => {
      handleSessionExpired('Votre session a expiré. Veuillez vous reconnecter.');
    });

    // Vérifier l'authentification au démarrage via le serveur
    const checkAuth = async () => {
      try {
        const user = await authService.initialize();
        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
          // Précharger la photo de profil au démarrage
          preloadProfilePhoto(user?.photoProfile || undefined);
          // Réinitialiser le message d'expiration si connexion réussie
          setSessionExpiredMessage(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [handleSessionExpired, preloadProfilePhoto]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  /**
   * Séquence post-login en deux phases (~2 s), orchestrée en async/await :
   *  1. sécurisation (« Connexion en cours… »),
   *  2. succès (« Connecté / Bienvenue »),
   * puis entrée synchrone dans l'espace de travail + accueil saisonnier.
   */
  const handleLogin = async (user: any) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setSessionExpiredMessage(null);

    // Destination capturée AVANT tout changement d'URL.
    const returnTo = getReturnTo();
    preloadProfilePhoto(user?.photoProfile);

    // Phase 1 — sécurisation de la session.
    setShowLoadingAfterLogin(true);
    await wait(POST_LOGIN_TIMINGS.securing);

    // Phase 2 — confirmation de connexion.
    setShowLoadingAfterLogin(false);
    setShowConnectedSuccess(true);
    setShowSeasonalWelcome(true);
    await wait(POST_LOGIN_TIMINGS.success);

    // Entrée dans l'espace de travail (replace: pas d'empilement du login).
    setShowConnectedSuccess(false);
    setLocation(getPostLoginDestination(user?.role || '', returnTo), { replace: true });
  };
  
  // Sync URL avec l'état d'authentification
  useEffect(() => {
    const isOnLoginPage = location === '/login' || location.startsWith('/login?');
    if (isAuthenticated && isOnLoginPage) {
      // Rediriger /login vers / si déjà authentifié
      setLocation('/', { replace: true });
    } else if (!isAuthenticated && !isLoading && !isOnLoginPage) {
      // Rediriger vers /login si non authentifié (avec returnTo pour revenir après login)
      const loginUrl = buildLoginUrl(location !== '/' ? location : undefined);
      setLocation(loginUrl, { replace: true });
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  const handleLogout = () => {
    authService.logout();
    getSyncMonitor().stop();
    setCurrentUser(null);
    setIsAuthenticated(false);
    queryClient.removeQueries();
    queryClient.clear();
  };

  // Rafraîchir les données utilisateur (après mise à jour du profil)
  const refreshCurrentUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
        // Précharger la photo de profil mise à jour
        preloadProfilePhoto(userData?.photoProfile);
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
    }
  }, [preloadProfilePhoto]);

  if (isLoading) {
    return (
      <>
        <LoadingScreen showLogo={true} message={`Chargement de ${branding?.appName ?? 'l\'application'}...`} />
        <NetworkOverlay isOpen={showNetworkOverlay} isChecking={isChecking} onRetry={forceRetry} />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage
          onLoginSuccess={handleLogin}
          sessionExpiredMessage={sessionExpiredMessage}
        />
        <NetworkOverlay isOpen={showNetworkOverlay} isChecking={isChecking} onRetry={forceRetry} />
      </>
    );
  }

  // Afficher le cercle de chargement après connexion
  if (showLoadingAfterLogin) {
    return (
      <>
        <LoadingScreen showLogo={true} message="Connexion en cours..." progressDurationMs={POST_LOGIN_TIMINGS.securing} />
        <NetworkOverlay isOpen={showNetworkOverlay} isChecking={isChecking} onRetry={forceRetry} />
      </>
    );
  }

  // Afficher le message "Connecté" avec le check vert
  if (showConnectedSuccess) {
    return (
      <>
        <AppShell
          isMobile={isMobile}
          sidebarOpen={false}
          onCloseSidebar={() => {}}
          sidebarWidthOpen="w-0"
          sidebarWidthClosed="w-0"
          contentOffsetOpen="ml-0"
          contentOffsetClosed="ml-0"
          sidebar={null}
          header={(
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-surface rounded-lg flex items-center justify-center p-1">
                <TenantLogo className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-content-primary">Connexion réussie</h1>
                <p className="text-sm text-content-muted">Bienvenue, {currentUser?.prenom || currentUser?.username || 'Utilisateur'}</p>
              </div>
            </div>
          )}
        >
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <SuccessCheckmark />
              </div>
              <h3 className="mb-1 text-2xl font-bold text-slate-800 dark:text-slate-100">Connecté</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Chargement de l’espace de travail…</p>
            </div>
          </div>
        </AppShell>
        <NetworkOverlay isOpen={showNetworkOverlay} isChecking={isChecking} onRetry={forceRetry} />
      </>
    );
  }

  return (
    <>
      <FeatureFlagsProvider>
        <AgenceProvider>
          <WebSocketProvider>
              <AbilityProvider>
                <SessionProvider
                  onSessionInvalid={handleSessionExpired}
                >
                <OfflineProvider>
                  <ErrorBoundary>
                    <Toaster position="top-right" richColors closeButton />
                    {/* Network status banner - shows for unstable/offline/api_down */}
                    <NetworkBanner />
                    <UpdatePrompt />
                    <LocationTracker />
                    <SessionExpirationWarning />
                    <Suspense fallback={null}>
                      {isAuthenticated && showSeasonalWelcome && (
                        <SeasonalWelcome
                          userName={currentUser?.prenom || currentUser?.username}
                          onComplete={() => setShowSeasonalWelcome(false)}
                        />
                      )}
                    </Suspense>
                    {/* Add top padding when network banner is visible */}
                    <div className={networkStatus !== 'online' ? 'pt-14' : ''}>
                      <Suspense fallback={<LoadingScreen showLogo={true} message="Chargement du module..." />}>
                        {authService.isAgentCaisse() ? (
                          <AgentCaisseInterface
                            agentId={currentUser.id}
                            onLogout={handleLogout}
                          />
                        ) : (
                          <MicroflexPlatform currentUser={currentUser} onLogout={handleLogout} onUserUpdate={refreshCurrentUser} />
                        )}
                      </Suspense>
                    </div>
                  </ErrorBoundary>
                </OfflineProvider>
                </SessionProvider>
              </AbilityProvider>
          </WebSocketProvider>
        </AgenceProvider>
      </FeatureFlagsProvider>
      {/* Full-screen overlay only for prolonged offline or API down */}
      <NetworkOverlay isOpen={showNetworkOverlay} isChecking={isChecking} onRetry={forceRetry} />
    </>
  );
}

const AppWrapper = () => (
    <TenantProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </TenantProvider>
);

export default AppWrapper;
