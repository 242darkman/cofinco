/**
 * Tab Leader Election
 *
 * Ensures only one tab runs sync operations at a time, preventing
 * duplicate requests and wasted bandwidth — critical for Congo's
 * limited connectivity.
 *
 * Uses BroadcastChannel for coordination:
 * - Each tab sends heartbeats every 3s
 * - The tab with the lowest tabId (first to claim) is the leader
 * - If the leader stops heartbeating for 5s, another tab takes over
 * - Leader status is exposed via isLeader() and onChange callbacks
 */

const CHANNEL_NAME = 'cofin-leader';
const HEARTBEAT_INTERVAL_MS = 3000;
const LEADER_TIMEOUT_MS = 5000;

type LeaderChangeCallback = (isLeader: boolean) => void;

class TabLeaderElection {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private leaderId: string | null = null;
  private leaderLastSeen = 0;
  private heartbeatTimer: number | null = null;
  private checkTimer: number | null = null;
  private callbacks: Set<LeaderChangeCallback> = new Set();
  private _isLeader = false;

  constructor() {
    this.tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      // No BroadcastChannel support — this tab is always the leader
      this._isLeader = true;
      return;
    }

    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (event) => this.handleMessage(event.data);

    // Claim leadership immediately
    this.sendHeartbeat();

    // Start periodic heartbeat
    this.heartbeatTimer = window.setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);

    // Periodically check if leader is still alive
    this.checkTimer = window.setInterval(() => this.checkLeaderAlive(), HEARTBEAT_INTERVAL_MS);

    // Handle tab close — resign leadership
    window.addEventListener('beforeunload', this.handleUnload);
  }

  isLeader(): boolean {
    return this._isLeader;
  }

  onChange(callback: LeaderChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  destroy(): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    if (this.checkTimer !== null) clearInterval(this.checkTimer);
    window.removeEventListener('beforeunload', this.handleUnload);

    if (this._isLeader && this.channel) {
      this.channel.postMessage({ type: 'resign', tabId: this.tabId });
    }

    this.channel?.close();
    this.channel = null;
  }

  private handleUnload = () => {
    if (this._isLeader && this.channel) {
      this.channel.postMessage({ type: 'resign', tabId: this.tabId });
    }
  };

  private sendHeartbeat(): void {
    this.channel?.postMessage({ type: 'heartbeat', tabId: this.tabId });

    // If no known leader, claim it
    if (!this.leaderId) {
      this.becomeLeader();
    }

    // Update own heartbeat
    if (this._isLeader) {
      this.leaderLastSeen = Date.now();
    }
  }

  private handleMessage(data: { type: string; tabId: string }): void {
    if (!data || data.tabId === this.tabId) return;

    if (data.type === 'heartbeat') {
      if (this.leaderId === data.tabId) {
        // Leader is alive
        this.leaderLastSeen = Date.now();
      } else if (!this.leaderId || data.tabId < this.leaderId) {
        // Another tab is claiming leadership with a lower ID
        this.leaderId = data.tabId;
        this.leaderLastSeen = Date.now();
        if (this._isLeader) {
          this.yieldLeadership();
        }
      }
    } else if (data.type === 'resign' && data.tabId === this.leaderId) {
      // Current leader resigned — try to take over
      this.leaderId = null;
      this.leaderLastSeen = 0;
      this.becomeLeader();
    }
  }

  private checkLeaderAlive(): void {
    if (this._isLeader) return;

    if (this.leaderId && Date.now() - this.leaderLastSeen > LEADER_TIMEOUT_MS) {
      // Leader is dead — take over
      if (import.meta.env.DEV) console.log(`[TabLeader] Leader ${this.leaderId.slice(0, 8)} timed out, taking over`);
      this.leaderId = null;
      this.becomeLeader();
    }
  }

  private becomeLeader(): void {
    if (this._isLeader) return;
    this._isLeader = true;
    this.leaderId = this.tabId;
    this.leaderLastSeen = Date.now();
    if (import.meta.env.DEV) console.log(`[TabLeader] This tab is now the leader (${this.tabId.slice(0, 8)})`);
    this.notifyCallbacks();
  }

  private yieldLeadership(): void {
    if (!this._isLeader) return;
    this._isLeader = false;
    if (import.meta.env.DEV) console.log(`[TabLeader] Yielded leadership to ${this.leaderId?.slice(0, 8)}`);
    this.notifyCallbacks();
  }

  private notifyCallbacks(): void {
    for (const cb of this.callbacks) {
      try {
        cb(this._isLeader);
      } catch (err) {
        console.error('[TabLeader] Callback error:', err);
      }
    }
  }
}

export const tabLeader = new TabLeaderElection();
