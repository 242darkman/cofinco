import { useState, useEffect, lazy, Suspense, useCallback } from 'react';
import { toast } from 'sonner';
import LoginPage from './components/auth/LoginPage';
import ErrorBoundary from './components/shared/ErrorBoundary';
import LoadingScreen from './components/ui/LoadingScreen';
import AppShell from './components/layout/AppShell';
import { authService } from './lib/auth';
import { LocationTracker } from '@/components/agent/LocationTracker';
import { FeatureFlagsProvider } from './contexts/FeatureFlagsContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { AgenceProvider } from './contexts/AgenceContext';
import { UpdatePrompt } from './components/shared/UpdatePrompt';

// Lazy load heavy components
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

    // Nettoyer l'état
    setCurrentUser(null);
    setIsAuthenticated(false);
    setShowSeasonalWelcome(false);
    setShowLoadingAfterLogin(false);
    setShowConnectedSuccess(false);
  }, []);

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
  }, [handleSessionExpired]);

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
    // Réinitialiser le message d'expiration de session
    setSessionExpiredMessage(null);

    // Afficher le cercle de chargement pendant 1.5 secondes
    setTimeout(() => {
      setShowLoadingAfterLogin(false);
      setShowConnectedSuccess(true);
      setShowSeasonalWelcome(true);

      // Afficher "Connecté" pendant 3 secondes
      setTimeout(() => {
        setShowConnectedSuccess(false);
      }, 3000);
    }, 1500);
  };

  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return <LoadingScreen showLogo={true} message="Chargement de COFIN&CO-M..." />;
  }

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={handleLogin}
        sessionExpiredMessage={sessionExpiredMessage}
      />
    );
  }

  // Afficher le cercle de chargement après connexion
  if (showLoadingAfterLogin) {
    return <LoadingScreen showLogo={true} message="Connexion en cours..." />;
  }

  // Afficher le message "Connecté" avec le check vert
  if (showConnectedSuccess) {
    return (
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
    );
  }

  return (
    <FeatureFlagsProvider>
      <AgenceProvider>
        <WebSocketProvider>
          <ErrorBoundary>
            <UpdatePrompt />
            <LocationTracker />
            <Suspense fallback={null}>
              {isAuthenticated && showSeasonalWelcome && (
                <SeasonalWelcome
                  userName={currentUser?.prenom || currentUser?.username}
                  onComplete={() => setShowSeasonalWelcome(false)}
                />
              )}
            </Suspense>
            <Suspense fallback={<LoadingScreen showLogo={true} message="Chargement du module..." />}>
              {authService.isAgentCaisse() ? (
                <AgentCaisseInterface
                  agentId={currentUser.id}
                  onLogout={handleLogout}
                />
              ) : (
                <COFINPlatform currentUser={currentUser} onLogout={handleLogout} />
              )}
            </Suspense>
          </ErrorBoundary>
        </WebSocketProvider>
      </AgenceProvider>
    </FeatureFlagsProvider>
  );
}

export default App;
