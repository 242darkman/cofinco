type ConnectivityCallback = (isOnline: boolean) => void;

class ConnectivityService {
  private isOnline: boolean = navigator.onLine;
  private callbacks: Set<ConnectivityCallback> = new Set();
  private pingInterval: number | null = null;
  private lastPingSuccess: number = Date.now();
  private pingEndpoint: string = '/api/health';
  private pingIntervalMs: number = 30000;
  private offlineThresholdMs: number = 60000;

  constructor() {
    this.setupEventListeners();
    this.startPingMonitor();
    console.log('[Connectivity] Service initialisé, statut:', this.isOnline ? 'En ligne' : 'Hors ligne');
  }

  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      console.log('[Connectivity] Événement online détecté');
      this.updateStatus(true);
    });

    window.addEventListener('offline', () => {
      console.log('[Connectivity] Événement offline détecté');
      this.updateStatus(false);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkConnectivity();
      }
    });
  }

  private startPingMonitor(): void {
    this.pingInterval = window.setInterval(() => {
      this.checkConnectivity();
    }, this.pingIntervalMs);

    this.checkConnectivity();
  }

  private async checkConnectivity(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.pingEndpoint, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.lastPingSuccess = Date.now();
        if (!this.isOnline) {
          console.log('[Connectivity] Connexion rétablie via ping');
          this.updateStatus(true);
        }
      } else {
        this.handlePingFailure();
      }
    } catch (error) {
      this.handlePingFailure();
    }
  }

  private handlePingFailure(): void {
    const timeSinceLastSuccess = Date.now() - this.lastPingSuccess;
    if (timeSinceLastSuccess > this.offlineThresholdMs && this.isOnline) {
      console.log('[Connectivity] Ping échoué, passage hors ligne');
      this.updateStatus(false);
    }
  }

  private updateStatus(online: boolean): void {
    if (this.isOnline !== online) {
      this.isOnline = online;
      console.log('[Connectivity] Statut changé:', online ? 'En ligne' : 'Hors ligne');
      this.notifyCallbacks();
    }
  }

  private notifyCallbacks(): void {
    this.callbacks.forEach(callback => {
      try {
        callback(this.isOnline);
      } catch (error) {
        console.error('[Connectivity] Erreur dans callback:', error);
      }
    });
  }

  public getStatus(): boolean {
    return this.isOnline;
  }

  public subscribe(callback: ConnectivityCallback): () => void {
    this.callbacks.add(callback);
    
    setTimeout(() => {
      if (this.callbacks.has(callback)) {
        callback(this.isOnline);
      }
    }, 0);
    
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public async waitForOnline(timeoutMs: number = 30000): Promise<boolean> {
    if (this.isOnline) return true;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      const unsubscribe = this.subscribe((online) => {
        if (online) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  public forceCheck(): void {
    this.checkConnectivity();
  }

  public destroy(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    this.callbacks.clear();
  }
}

export const connectivityService = new ConnectivityService();

export function useConnectivity(): boolean {
  return connectivityService.getStatus();
}

export default connectivityService;
