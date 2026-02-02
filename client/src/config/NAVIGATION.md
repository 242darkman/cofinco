# Système de Navigation avec URLs

## Vue d'ensemble

L'application Cofinco utilise maintenant un système de navigation basé sur des URLs professionnelles qui reflètent exactement où l'utilisateur se trouve dans l'application.

## Architecture

### Composants clés

1. **`config/routes.tsx`** - Configuration centralisée de toutes les routes
2. **`hooks/useAppNavigation.ts`** - Hook personnalisé pour la navigation
3. **Wouter** - Routeur léger (déjà installé) pour la gestion des URLs

### Fonctionnement

```
URL (/caisse/mobile-money)
    ↓
useAppNavigation (lit l'URL)
    ↓
{ currentModule: 'caisse', currentSubModule: 'mobile-money' }
    ↓
COFINPlatform (affiche le bon composant)
```

## Structure des URLs

### URLs principales

```
/                           → Tableau de bord
/clients                    → Gestion des clients
/clients/nouveau            → Nouveau client
/caisse                     → Caisse principale
/caisse/mobile-money        → Mobile Money
/caisse/especes             → Opérations espèces
/caisse/historique          → Historique
/credits                    → Gestion des crédits
/epargnes                   → Comptes d'épargne
/tontines                   → Gestion des tontines
/coffre-fort                → Coffre-Fort
/transferts                 → Transferts d'argent
/tresorerie                 → Trésorerie
/reconciliation             → Réconciliation Mobile Money
/comptabilite               → Comptabilité
/agent-terrain              → Agent de terrain
/validations                → Validations
/administration             → Administration
/profil                     → Profil utilisateur
/messages                   → Messagerie
```

## Utilisation

### Dans un composant

```typescript
import { useAppNavigation } from '@/hooks/useAppNavigation';

function MyComponent() {
  const { currentModule, currentSubModule, navigateToModule, isActive } = useAppNavigation();

  // Obtenir le module actuel
  console.log(currentModule); // 'caisse'
  console.log(currentSubModule); // 'mobile-money'

  // Naviguer vers un module
  const handleClick = () => {
    navigateToModule('caisse', 'mobile-money');
  };

  // Vérifier si on est sur un module
  const isCaisseActive = isActive('caisse');
  const isMoMoActive = isActive('caisse', 'mobile-money');

  return <button onClick={handleClick}>Aller à Mobile Money</button>;
}
```

### Ajouter une nouvelle route

1. **Ajouter la route dans `config/routes.tsx`**:

```typescript
{
  path: '/nouveau-module',
  moduleKey: 'nouveauModule',
  label: 'Nouveau Module',
  requireAuth: true,
}
```

2. **Ajouter le case dans `COFINPlatform.tsx`**:

```typescript
case 'nouveauModule':
  return (
    <Suspense fallback={<ModuleLoadingFallback moduleName="Nouveau Module" />}>
      <NouveauModule />
    </Suspense>
  );
```

3. **Mettre à jour `PLATFORM_MENU_ITEMS` si nécessaire**

### Navigation programmatique

```typescript
// Navigation simple
navigateToModule('caisse');

// Navigation avec sous-module
navigateToModule('caisse', 'mobile-money');

// Navigation avec données (pour compatibilité)
navigateToModule('messages', undefined, {
  chatUserId: '123',
  chatUserName: 'John Doe'
});
```

### Obtenir l'URL d'un module

```typescript
import { getPathForModule } from '@/config/routes';

const path = getPathForModule('caisse', 'mobile-money');
// → '/caisse/mobile-money'
```

## Avantages

1. **URLs professionnelles** - Pas d'IDs visibles, structure claire
2. **Bookmarkable** - Les utilisateurs peuvent sauvegarder des liens directs
3. **SEO-friendly** - Structure d'URL sémantique
4. **Breadcrumbs automatiques** - Le fil d'Ariane se met à jour automatiquement
5. **Navigation intuitive** - L'URL reflète la position dans l'app

## Compatibilité

Le système est rétrocompatible avec l'ancien système de navigation via événements:

```typescript
// Ancien système (toujours supporté)
window.dispatchEvent(
  new CustomEvent('navigate-module', {
    detail: { module: 'caisse', subModule: 'mobile-money' }
  })
);
```

## Notes techniques

- **Wouter** est déjà installé dans le projet (package.json)
- Pas besoin de Router Provider global
- Les hooks de wouter fonctionnent automatiquement
- La navigation préserve l'historique du navigateur
- Support du bouton "retour" du navigateur

## Maintenance

Pour modifier les URLs :
1. Mettre à jour `config/routes.tsx`
2. Tester la navigation
3. Vérifier que les breadcrumbs sont corrects
