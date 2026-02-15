# COFINCO Mobile

Application mobile COFINCO (Expo SDK 54 + React Native).

## Stack

- **Framework** : Expo SDK 54, Expo Router (file-based routing)
- **UI** : NativeWind v4 (Tailwind CSS pour React Native)
- **Data** : TanStack Query v5 (server state), Zustand v5 (local state)
- **Auth** : Cookies de session (API existante) + biometrie (expo-local-authentication)
- **Forms** : React Hook Form + Zod
- **Push** : expo-notifications
- **QR** : expo-camera + react-native-qrcode-svg
- **Real-time** : WebSocket natif

## Dev local (Docker)

```bash
# Depuis la racine du projet
docker compose up mobile
```

Le serveur Expo est accessible sur `http://localhost:8081`.

## Dev local (sans Docker)

```bash
cd mobile
npm install
npx expo start
```

Configurer l'URL de l'API :
```bash
EXPO_PUBLIC_API_URL=http://localhost:5001 npx expo start
```

## Connexion device physique

1. Installer **Expo Go** sur le device
2. Scanner le QR code affiche par Metro
3. Ou utiliser `npx expo start --tunnel` en Docker

## EAS Build

```bash
# Dev build (avec dev client)
eas build --profile development --platform ios

# Preview (distribution interne)
eas build --profile preview --platform all

# Production
eas build --profile production --platform all
```

## Structure

```
app/                    # Expo Router (file-based)
  (auth)/login.tsx      # Ecran de connexion
  (tabs)/               # Navigation bottom tabs
    index.tsx           # Dashboard (accueil)
    accounts.tsx        # Liste des comptes
    notifications.tsx   # Centre de notifications
    profile.tsx         # Profil et preferences
  account/[id].tsx      # Detail d'un compte
  transaction/[id].tsx  # Detail d'une transaction
  qr/generate.tsx       # Generer un QR de paiement
  qr/scan.tsx           # Scanner un QR de paiement
components/             # Composants reutilisables
  ui/                   # Composants de base (Button, Card, Input...)
  accounts/             # Composants comptes
  transactions/         # Composants transactions
  dashboard/            # Composants dashboard
  notifications/        # Composants notifications
hooks/                  # React Query hooks
stores/                 # Zustand stores (auth, settings)
lib/                    # Utilitaires (API client, WebSocket, push...)
constants/              # Tokens de design, cles de query
```

## Imports partages

Le mobile importe les types purs depuis `@shared/types/mobile` :

```typescript
import { formatMoney, SystemRole, getRoleLabel } from '@shared/types/mobile';
```

Les modules `@shared/schema/*` (Drizzle ORM) ne doivent PAS etre importes directement.

## Checklist Store

### iOS
- [ ] Icone 1024x1024
- [ ] Screenshots (6.7", 6.5", 5.5")
- [ ] Privacy strings (camera, FaceID, notifications)
- [ ] HTTPS/ATS ok
- [ ] Pas de crash au launch

### Android
- [ ] Adaptive icon
- [ ] Permissions minimales
- [ ] versionCode increment
- [ ] Back button fonctionne

### General
- [ ] Politique de confidentialite accessible
- [ ] Dark mode fonctionne
- [ ] Accessibilite (labels, contrastes)
- [ ] Pas de secret en dur
