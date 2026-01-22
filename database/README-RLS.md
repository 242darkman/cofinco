# Row Level Security (RLS) - Documentation

## Vue d'ensemble

Ce document décrit l'implémentation de la Row Level Security (RLS) PostgreSQL pour la plateforme COFIN. La RLS fournit une couche de sécurité supplémentaire au niveau de la base de données pour garantir l'isolation des données par agence.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Requête HTTP                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Express Middleware                                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. Auth (setupAuth)                                       │  │
│  │    - Vérifie la session                                   │  │
│  │    - Attache req.user                                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 2. Agence Access (requireAgenceIdAccess)                  │  │
│  │    - Vérifie l'accès à l'agence                           │  │
│  │    - Définit req.selectedAgenceId                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 3. DB Context (setDbContext)                              │  │
│  │    - Construit le contexte RLS                            │  │
│  │    - Attache req.rlsContext                               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Route Handler                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ withDbContext(req, async () => {                          │  │
│  │   // Contexte RLS appliqué                                │  │
│  │   return db.select().from(clients);                       │  │
│  │ });                                                       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PostgreSQL avec RLS                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Variables de session:                                     │  │
│  │   app.current_agency_id = 'uuid-agence'                   │  │
│  │   app.is_admin = 'false'                                  │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Politique RLS (clients):                                  │  │
│  │   USING (has_agency_access(agence_id))                    │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ Résultat filtré automatiquement                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

### 1. Appliquer les politiques SQL

```bash
# Mode test (dry-run)
npx tsx scripts/apply-rls-policies.ts --dry-run

# Application réelle
npx tsx scripts/apply-rls-policies.ts

# Vérifier le statut
npx tsx scripts/apply-rls-policies.ts --status
```

### 2. Le middleware est automatiquement activé

Le middleware `setDbContext` est ajouté dans `server/index.ts` après l'authentification.

## Utilisation dans les routes

### Option 1: withDbContext (recommandé pour les opérations simples)

```typescript
import { withDbContext } from "./middleware/db-context";

router.get("/clients", async (req, res) => {
  const clients = await withDbContext(req, async () => {
    return db.select().from(clients);
  });
  res.json(clients);
});
```

### Option 2: withDbContextTransaction (pour les transactions)

```typescript
import { withDbContextTransaction } from "./middleware/db-context";

router.post("/clients", async (req, res) => {
  const result = await withDbContextTransaction(req, async (tx) => {
    const [client] = await tx.insert(clients).values(req.body).returning();
    await tx.insert(comptes).values({ clientId: client.id, ... });
    return client;
  });
  res.json(result);
});
```

### Option 3: Middleware dédié (pour routes critiques)

```typescript
import { requireRLSContext } from "./middleware/db-context";

router.get("/clients/:id/comptes",
  requireRLSContext, // Vérifie que le contexte est défini
  async (req, res) => {
    const comptes = await withDbContext(req, async () => {
      return db.select().from(comptes).where(eq(comptes.clientId, req.params.id));
    });
    res.json(comptes);
  }
);
```

## Variables de session PostgreSQL

| Variable | Description | Valeurs |
|----------|-------------|---------|
| `app.current_agency_id` | UUID de l'agence courante | UUID ou chaîne vide |
| `app.is_admin` | Indicateur admin | `'true'` ou `'false'` |

### Manipulation manuelle (pour tests)

```sql
-- Définir le contexte
SELECT set_config('app.current_agency_id', 'uuid-agence', false);
SELECT set_config('app.is_admin', 'false', false);

-- Vérifier le contexte
SELECT current_setting('app.current_agency_id', true);
SELECT current_setting('app.is_admin', true);

-- Tester les fonctions helper
SELECT current_agency_id();
SELECT is_admin_context();
SELECT has_agency_access('uuid-agence'::uuid);
```

## Tables avec RLS activé

### Tier 1: Tables avec `agence_id` direct

| Table | Colonne | Nullable |
|-------|---------|----------|
| `clients` | `agence_id` | Oui |
| `comptes` | `agence_id` | Oui |
| `credits` | `agence_id` | Oui |
| `demandes_credit` | `agence_id` | Non |
| `mouvements_financiers` | `agence_id` | Oui |
| `employes` | `agence_id` | Oui |

### Tier 2: Tables opérationnelles

| Table | Colonne | Nullable |
|-------|---------|----------|
| `caisses` | `agence_id` | Non |
| `sessions_caisse` | `agence_id` | Oui |
| `tontines` | `agence_id` | Oui |
| `paiements_terrain` | `agence_id` | Oui |

### Tier 3: Tables coffres

| Table | Colonne | Notes |
|-------|---------|-------|
| `coffres_forts` | `owner_id` | NULL = siège |
| `transferts_coffre` | via FK | Source ou destination |
| `transferts_inter_coffres` | via FK | Source ou destination |

### Tier 4: Tables héritées

| Table | Via FK |
|-------|--------|
| `agents_terrain` | `employes.agence_id` |
| `caisses_agent` | `agents_terrain → employes.agence_id` |
| `operations_terrain` | `agents_terrain → employes.agence_id` |
| `operations_caisse` | `sessions_caisse.agence_id` |
| `membres_tontine` | `tontines.agence_id` |
| `contributions_tontine` | `tontines.agence_id` |

## Comportement des politiques

### Règles générales

1. **Admin (ADMIN role)**: Accès à toutes les données (bypass RLS)
2. **Non-admin avec agence**: Accès uniquement aux données de leur agence
3. **Données sans agence (agence_id NULL)**: Accessibles par tous (données système)

### Opérations CRUD

| Opération | Admin | Non-Admin |
|-----------|-------|-----------|
| SELECT | Tout | Leur agence + NULL |
| INSERT | Tout | Leur agence uniquement |
| UPDATE | Tout | Leur agence uniquement |
| DELETE | Tout | Généralement interdit |

## Debug

### Activer les logs RLS

```bash
# Variable d'environnement
DEBUG_RLS=true npm run dev
```

### Vérifier le contexte en temps réel

```typescript
import { getRLSContextStatus } from "./middleware/db-context";

const status = await getRLSContextStatus();
console.log(status); // { currentAgencyId: "uuid", isAdmin: false }
```

### Tests unitaires

```typescript
import { setTestRLSContext, clearTestRLSContext } from "./middleware/db-context";

beforeEach(async () => {
  await setTestRLSContext("test-agency-uuid", false);
});

afterEach(async () => {
  await clearTestRLSContext();
});

test("should filter by agency", async () => {
  const clients = await db.select().from(clients);
  // Tous les clients retournés appartiennent à test-agency-uuid
});
```

## Sécurité

### Double couche de protection

1. **Couche Application**: Middleware `requireAgenceIdAccess` vérifie les droits
2. **Couche Base de données**: Politiques RLS filtrent les données

### Avantages

- Protection contre les bugs applicatifs
- Isolation garantie même en cas d'injection SQL
- Audit trail natif PostgreSQL
- Performance optimisée (filtrage au niveau BDD)

### Limitations

- Le pooling de connexions nécessite de re-définir le contexte à chaque requête
- Les superusers PostgreSQL bypasses RLS (utiliser un user dédié)
- Les données avec `agence_id NULL` sont accessibles par tous

## Maintenance

### Ajouter une nouvelle table

1. Ajouter `ALTER TABLE xxx ENABLE ROW LEVEL SECURITY;` dans `rls-policies.sql`
2. Créer les politiques SELECT/INSERT/UPDATE/DELETE
3. Relancer le script d'application

### Modifier une politique

1. Modifier la politique dans `rls-policies.sql`
2. Le script est idempotent (supprime et recrée les politiques)
3. Relancer le script d'application

### Désactiver RLS (urgence)

```sql
-- Désactiver temporairement sur une table
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;

-- Réactiver
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
```

## Références

- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [COFIN Middleware Documentation](../server/middleware/README.md)
