import { useState, useEffect, useCallback } from 'react';

interface VersionResponse {
  version: string;
  environment: string;
}

interface UseAutoUpdateReturn {
  isUpdateAvailable: boolean;
  reloadPage: () => void;
  checkVersion: () => Promise<void>;
  currentVersion: string | null;
  latestVersion: string | null;
}

// Interval de vérification en ms (5 minutes)
const CHECK_INTERVAL = 5 * 60 * 1000;

export function useAutoUpdate(): UseAutoUpdateReturn {
  const [initialVersion, setInitialVersion] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  const checkVersion = useCallback(async () => {
    try {
      const response = await fetch('/api/version');
      if (!response.ok) return;

      const data: VersionResponse = await response.json();
      
      setLatestVersion(data.version);

      // Si c'est la première vérification, on stocke la version actuelle
      if (initialVersion === null) {
        setInitialVersion(data.version);
        return;
      }

      // Si on a déjà une version initiale et qu'elle diffère de la nouvelle
      if (initialVersion && data.version !== initialVersion) {
        setIsUpdateAvailable(true);
      }
    } catch (error) {
      console.error('Failed to check version:', error);
    }
  }, [initialVersion]);

  // Vérification initiale et périodique
  useEffect(() => {
    checkVersion();

    const interval = setInterval(checkVersion, CHECK_INTERVAL);

    // Vérifier aussi quand la fenêtre reprend le focus
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkVersion]);

  const reloadPage = () => {
    window.location.reload();
  };

  return {
    isUpdateAvailable,
    reloadPage,
    checkVersion,
    currentVersion: initialVersion,
    latestVersion
  };
}
