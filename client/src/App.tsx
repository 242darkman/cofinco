import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import LoginPage from './components/auth/LoginPage';
import ErrorBoundary from './components/shared/ErrorBoundary';
import LoadingScreen from './components/ui/LoadingScreen';
import AppShell from './components/layout/AppShell';
import { authService } from './lib/auth';
import { getReturnTo, getPostLoginDestination } from './lib/navigation';
import LocationTracker from '@/components/agent/LocationTracker';
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { AgenceProvider } from './contexts/AgenceContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { AbilityProvider } from './contexts/AbilityContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { SessionProvider } from './contexts/SessionContext';
import { UpdatePrompt } from './components/shared/UpdatePrompt';
import { useServerHealth } from './contexts/ServerHealthContext';
import { useNetwork } from './contexts/NetworkContext';
import NetworkOverlay from './components/shared/NetworkOverlay';
import NetworkBanner from './components/shared/NetworkBanner';
import SessionExpirationWarning from './components/shared/SessionExpirationWarning';

// Lazy load heavy components
const COFINPlatform = lazy(() => import('./COFINPlatform'));
const AgentCaisseInterface = lazy(() => import('./components/agent/AgentCaisseInterface'));
const SeasonalWelcome = lazy(() => import('./components/shared/SeasonalWelcome'));

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
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

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
    console.log('Session expired, logging out...', reason);

    // Afficher un toast d'erreur avec la raison
    const message = reason || 'Votre session a expiré. Veuillez vous reconnecter.';
    toast.error(message, {
      duration: 5000,
      id: 'session-expired', // Évite les doublons
    });

    // Sauvegarder le message pour l'afficher sur la page de login
    setSessionExpiredMessage(message);

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

  const handleLogin = (user: any) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setShowLoadingAfterLogin(true);
    setSessionExpiredMessage(null);

    // Capturer returnTo AVANT que l'URL change
    const returnTo = getReturnTo();

    preloadProfilePhoto(user?.photoProfile);

    // Afficher le cercle de chargement pendant 1.5 secondes
    setTimeout(() => {
      setShowLoadingAfterLogin(false);
      setShowConnectedSuccess(true);
      setShowSeasonalWelcome(true);

      // Afficher "Connecté" pendant 3 secondes
      setTimeout(() => {
        setShowConnectedSuccess(false);
        const destination = getPostLoginDestination(user?.role || '', returnTo);
        // replace: true pour ne pas empiler login dans l'historique
        setLocation(destination, { replace: true });
      }, 3000);
    }, 1500);
  };
  
  // Rediriger /login vers / si déjà authentifié (évite URL incohérente)
  useEffect(() => {
    if (isAuthenticated && location === '/login') {
      setLocation('/', { replace: true });
    }
  }, [isAuthenticated, location, setLocation]);

  const handleLogout = () => {
    authService.logout();
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
        <LoadingScreen showLogo={true} message="Chargement de COFIN&CO-M..." />
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
        <LoadingScreen showLogo={true} message="Connexion en cours..." />
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
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center p-1">
                <img
                  src="/cofin-logo.png"
                  alt="COFIN Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Connexion réussie</h1>
                <p className="text-sm text-slate-400">Bienvenue, {currentUser?.prenom || currentUser?.username || 'Utilisateur'}</p>
              </div>
            </div>
          )}
        >
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <div className="relative mb-6">
                <div
                  className="w-24 h-24 mx-auto rounded-full border-4 border-emerald-500 flex items-center justify-center"
                  style={{
                    animation: 'scaleIn 0.3s ease-out',
                    boxShadow: '0 0 30px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <svg
                    className="w-12 h-12 text-emerald-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ animation: 'checkmark 0.4s ease-out 0.2s both' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Connecté</h3>
              <p className="text-slate-400">Chargement de l’espace de travail…</p>
            </div>
          </div>
          <style>{`
            @keyframes scaleIn {
              0% { transform: scale(0); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes checkmark {
              0% { stroke-dasharray: 0 100; opacity: 0; }
              100% { stroke-dasharray: 100 100; opacity: 1; }
            }
          `}</style>
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
            <PermissionsProvider>
              <AbilityProvider>
                <SessionProvider
                  onSessionInvalid={(reason) => {
                    handleSessionExpired(reason);
                  }}
                >
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
                          <COFINPlatform currentUser={currentUser} onLogout={handleLogout} onUserUpdate={refreshCurrentUser} />
                        )}
                      </Suspense>
                    </div>
                  </ErrorBoundary>
                </SessionProvider>
              </AbilityProvider>
            </PermissionsProvider>
          </WebSocketProvider>
        </AgenceProvider>
      </FeatureFlagsProvider>
      {/* Full-screen overlay only for prolonged offline or API down */}
      <NetworkOverlay isOpen={showNetworkOverlay} isChecking={isChecking} onRetry={forceRetry} />
    </>
  );
}

const AppWrapper = () => (
    <LanguageProvider>
      <App />
    </LanguageProvider>
);

export default AppWrapper;
