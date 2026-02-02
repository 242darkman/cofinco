# Système de Synchronisation Hybride - WebSocket + Polling

## Vue d'ensemble

Le système utilise une stratégie **hybride intelligente** qui combine:
- ✨ **WebSocket** pour notifications temps réel (prioritaire)
- 🔄 **Polling** comme backup fiable (adaptatif)

Cette approche garantit une UX optimale tout en maintenant la robustesse.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  SYSTÈME HYBRIDE                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐          ┌──────────────┐               │
│  │  WebSocket   │ Priority │   Polling    │ Backup        │
│  │  (Temps Réel)│ ──────>  │  (Sécurité)  │               │
│  └──────────────┘          └──────────────┘               │
│         │                         │                         │
│         │  Événement détecté      │  Vérifie toutes les    │
│         │  → Refetch immédiat     │  30s (WS actif) ou     │
│         │  → Toast notification   │  10s (WS inactif)      │
│         │                         │                         │
│         └─────────┬───────────────┘                         │
│                   ▼                                         │
│         ┌──────────────────┐                               │
│         │  React Query     │                               │
│         │  (Single Source) │                               │
│         └──────────────────┘                               │
│                   │                                         │
│                   ▼                                         │
│         ┌──────────────────┐                               │
│         │  UI Update       │                               │
│         └──────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

## Hook Principal: `usePendingSessionSync`

**Fichier:** `client/src/hooks/finance/usePendingSessionSync.ts`

### Paramètres

```typescript
interface UsePendingSessionSyncOptions {
  enabled: boolean;                    // Active/désactive la sync
  onStatusChange?: (                   // Callback sur changement
    prevStatus: string | null,
    newStatus: string
  ) => void;
}
```

### Retour

```typescript
interface UsePendingSessionSyncResult {
  pendingSession: SessionCaisse | null;  // Session en attente
  isLoading: boolean;                     // État chargement
  refetch: () => void;                    // Force refresh
  isWebSocketConnected: boolean;          // État connexion WS
}
```

### Utilisation

```typescript
const {
  pendingSession,
  isLoading,
  refetch,
  isWebSocketConnected
} = usePendingSessionSync({
  enabled: !sessionActive,
  onStatusChange: (prev, current) => {
    if (prev === 'REQUESTING_FUNDS' && current === 'FUNDS_DISPATCHED') {
      // Auto-ouvrir modal
      setShowOuverture(true);
    }
  }
});
```

## Stratégie de Polling Adaptatif

### Intervalles selon état WebSocket

| État WebSocket | Intervalle | Raison |
|---------------|-----------|---------|
| ✅ **Connecté** | **30 secondes** | WS notifie en temps réel, polling = backup |
| ❌ **Déconnecté** | **10 secondes** | Polling = seul moyen de détection |
| 🌐 **En arrière-plan** | **Continue** | Détecte changements même si onglet inactif |

### Code

```typescript
refetchInterval: isConnected ? 30000 : 10000,
refetchIntervalInBackground: true,
staleTime: 5000, // Évite refetch si WS vient de notifier
```

## Événements WebSocket

### 1. CAISSE_UPDATE

**Envoyé par:** `server/services/caisse/session-opening-service.ts:550`

```typescript
ws.broadcastToAggregate('caisse', transfert.caisseId, {
  type: 'CAISSE_UPDATE',
  payload: {
    caisseId: transfert.caisseId,
    type: 'FUNDS_DISPATCHED',    // ou 'FUNDS_REJECTED'
    sessionId: session.id,
    montant: Number(transfert.montant),
  }
});
```

**Quand:** Coffre valide ou rejette une demande d'ouverture

**Action frontend:**
- Refetch immédiat de la session
- Toast notification avec montant
- Auto-ouverture modal si validé

### 2. OPENING_REQUEST_VALIDATED

**Type générique:** Pour compatibilité avec anciennes versions

**Action frontend:**
- Refetch session
- Pas de toast (CAISSE_UPDATE le fait déjà)

### 3. OPENING_REQUEST_REJECTED

**Type générique:** Pour compatibilité

**Action frontend:**
- Refetch session
- Toast erreur avec raison

## Évitement des Doublons

### Problème

WebSocket et polling peuvent déclencher des refetch simultanés.

### Solution

**Timestamp de dernière notification WS**

```typescript
const lastWebSocketUpdateRef = useRef<number>(0);

// Dans listener WebSocket
if (payload?.type === 'FUNDS_DISPATCHED') {
  lastWebSocketUpdateRef.current = Date.now();
  refetch();
}

// Dans détection changement status
const timeSinceWsUpdate = Date.now() - lastWebSocketUpdateRef.current;
const wasRecentlyNotifiedByWs = timeSinceWsUpdate < 2000;

if (!wasRecentlyNotifiedByWs) {
  // Ne pas re-toast si WS a déjà notifié
}
```

**StaleTime React Query**

```typescript
staleTime: 5000  // Données considérées fraîches pendant 5s
```

Si WS notifie → refetch → données fraîches
→ Polling 3s après ne refetch pas (stale = false)

## Indicateurs Visuels

### Badge de statut

```typescript
<div className="inline-flex items-center gap-2 px-3 py-1 ...">
  <Timer size={12} className="animate-spin" />
  {isWebSocketConnected ? 'Temps Réel Actif' : 'Vérification Active'}
</div>
```

**États:**
- 🟢 **"Temps Réel Actif"** = WebSocket connecté, notifications instantanées
- 🟡 **"Vérification Active"** = Polling actif, vérif toutes les 10s

## Logs Console (Dev Mode)

Le hook génère des logs pour debug:

```
[WS] FUNDS_DISPATCHED received, refetching session...
[Session Status] REQUESTING_FUNDS → FUNDS_DISPATCHED (via WebSocket)
```

```
[Session Status] REQUESTING_FUNDS → FUNDS_DISPATCHED (via polling)
```

Aide à diagnostiquer quel mécanisme a détecté le changement.

## Cas d'Usage

### Scénario 1: WebSocket fonctionne parfaitement

```
T0:  Demande ouverture → REQUESTING_FUNDS
T5:  Coffre valide
     ↓
T5:  WebSocket notifie FUNDS_DISPATCHED
     → Refetch immédiat (< 1s)
     → Toast "Dotation approuvée"
     → Modal s'ouvre
T30: Polling vérifie (trouve déjà à jour via staleTime)
     → Pas de refetch inutile
```

**Latence:** < 1 seconde ✨

### Scénario 2: WebSocket déconnecté

```
T0:  Demande ouverture → REQUESTING_FUNDS
     WebSocket: ❌ Déconnecté
     Polling: ✅ Actif (10s)
T5:  Coffre valide
T10: Polling #1 détecte FUNDS_DISPATCHED
     → Refetch
     → Toast "Dotation approuvée"
     → Modal s'ouvre
```

**Latence:** Max 10 secondes 🔄

### Scénario 3: WebSocket reconnecte

```
T0:  WebSocket: ❌ Déconnecté (polling 10s)
T15: WebSocket: ✅ Reconnexion
     → Polling passe à 30s automatiquement
     → Refetch immédiat pour rattraper
T20: Événement arrive via WS
     → Traité instantanément
```

**Auto-adaptation:** Seamless ⚡

### Scénario 4: Perte de réseau temporaire

```
T0:  Demande ouverture
T5:  Coffre valide
     Réseau: ❌ Coupé (30 secondes)
T35: Réseau: ✅ Rétabli
     → WebSocket reconnecte
     → Polling refetch immédiat
     → Détecte FUNDS_DISPATCHED
     → Rattrape retard
```

**Récupération:** Automatique 🔄

## Avantages du Système Hybride

### 1. Performance Optimale

- **Latence < 1s** avec WebSocket
- Pas de charge serveur excessive (polling réduit)
- Notifications push instantanées

### 2. Robustesse Maximale

- Continue de fonctionner sans WebSocket
- Récupération automatique après coupure
- Pas de perte d'événements

### 3. Expérience Utilisateur

- Feedback immédiat (WS)
- Toujours informé (polling backup)
- Indicateurs visuels clairs
- Auto-navigation

### 4. Observabilité

- Logs détaillés (dev)
- Métriques d'état WebSocket
- Distinction source événement (WS vs polling)

## Monitoring & Debug

### Vérifier état WebSocket

```typescript
console.log('WebSocket connecté:', isWebSocketConnected);
```

### Forcer reconnexion

```javascript
// En dev tools
window.location.reload();
```

### Tester sans WebSocket

```javascript
// Simuler déconnexion
const ws = useWebSocket();
ws.socket?.close();
```

Le polling prend automatiquement le relais.

### Vérifier polling

Dans Network tab (DevTools):
- Chercher `GET /api/sessions-caisse/pending`
- Fréquence: 30s (WS actif) ou 10s (WS inactif)

## Performance

### Charge Serveur

**Avant (Polling seul, 10s):**
- 6 requêtes/min par utilisateur
- 360 requêtes/h pour 10 utilisateurs

**Après (Hybride, WS + 30s):**
- WebSocket: 0 requêtes (push)
- Polling backup: 2 requêtes/min
- 120 requêtes/h pour 10 utilisateurs (-67%) 📉

**Gain:** 67% de réduction + latence divisée par 10 🚀

### Latence Utilisateur

| Méthode | Latence Moyenne | Latence Max |
|---------|----------------|-------------|
| **Polling 10s** | 5s | 10s |
| **Polling 30s** | 15s | 30s |
| **WebSocket** | < 1s | < 1s ✨ |
| **Hybride** | < 1s | 10s (WS down) |

## Configuration

### Modifier intervalles

**Fichier:** `usePendingSessionSync.ts`

```typescript
// Plus agressif
refetchInterval: isConnected ? 20000 : 5000

// Plus économe
refetchInterval: isConnected ? 60000 : 15000
```

### Désactiver polling avec WS

```typescript
// Polling uniquement si WS déconnecté
refetchInterval: isConnected ? false : 10000
```

⚠️ **Risque:** Perte événements si WS rate un message

## Évolutions Futures

### 1. Heartbeat WebSocket

Vérifier connexion active:

```typescript
setInterval(() => {
  ws.send({ type: 'PING' });
}, 30000);
```

### 2. Exponential Backoff

Réduire polling si aucun événement:

```
10s → 20s → 30s → 60s
```

Reset à 10s si événement détecté.

### 3. Service Worker

Notifications même page fermée:

```typescript
navigator.serviceWorker.register('/sw.js');
```

### 4. WebRTC Data Channel

Alternative à WebSocket, plus robuste:

```typescript
const pc = new RTCPeerConnection();
const channel = pc.createDataChannel('session-sync');
```

## Conclusion

Le système hybride offre **le meilleur des deux mondes**:

✅ **Performance** de WebSocket quand disponible
✅ **Fiabilité** du polling en fallback
✅ **Adaptation** automatique selon contexte
✅ **Expérience** utilisateur optimale

**Zéro configuration requise** - fonctionne out of the box.
