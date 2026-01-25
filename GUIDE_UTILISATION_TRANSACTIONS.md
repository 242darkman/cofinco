# 🚀 Guide d'Utilisation - Système Transactionnel Unifié

## Vue d'ensemble

Le système Cofinco utilise maintenant un **point d'entrée unique** pour toutes les transactions de guichet. Plus besoin de gérer plusieurs endpoints différents!

---

## 🎯 Pour les Développeurs Frontend

### Endpoint Unique
```typescript
POST /api/transactions/process
```

### Cas d'Usage

#### 1️⃣ Dépôt sur Compte Épargne

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 50000,
  paymentMethod: "CASH",
  natureOperation: "DEPOSIT_SAVINGS",
  compteId: "uuid-du-compte",
  description: "Dépôt mensuel janvier"
});
```

#### 2️⃣ Retrait sur Compte Courant

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 25000,
  paymentMethod: "CASH",
  natureOperation: "WITHDRAWAL_CURRENT",
  compteId: "uuid-du-compte",
  description: "Retrait courses"
});
```

#### 3️⃣ Cotisation Tontine

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 10000,
  paymentMethod: "CASH",
  natureOperation: "TONTINE_CONTRIBUTION",
  tontineId: "uuid-de-la-tontine",
  description: "Cotisation tour 3"
});
```

#### 4️⃣ Retrait Tontine (Distribution)

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 120000,
  paymentMethod: "CASH",
  natureOperation: "TONTINE_WITHDRAWAL",
  tontineId: "uuid-de-la-tontine",
  membreId: "uuid-du-membre",
  description: "Distribution tour 3"
});
```

#### 5️⃣ Encaissement Divers

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 5000,
  paymentMethod: "CASH",
  natureOperation: "MISC_COLLECTION",
  description: "Vente de carnets d'épargne"
});
```

#### 6️⃣ Décaissement Divers

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 15000,
  paymentMethod: "CASH",
  natureOperation: "MISC_DISBURSEMENT",
  description: "Achat fournitures de bureau"
});
```

#### 7️⃣ Paiement par Mobile Money

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 30000,
  paymentMethod: "MOBILE_MONEY",
  natureOperation: "DEPOSIT_SAVINGS",
  compteId: "uuid-du-compte",
  numeroTelephone: "237690123456",
  numeroTransaction: "MM-TX-123456789",
  description: "Dépôt via MTN MoMo"
});
```

#### 8️⃣ Virement Bancaire

```typescript
const response = await transactionApi.process({
  clientId: "uuid-du-client",
  amount: 100000,
  paymentMethod: "TRANSFER",
  natureOperation: "DEPOSIT_SAVINGS",
  compteId: "uuid-du-compte",
  referenceExterne: "VIR-2024-001",
  description: "Virement Afriland First Bank"
});
```

---

## 📱 Exemple Complet dans un Composant React

```typescript
import { useState } from 'react';
import { transactionApi } from '@/lib/api-client';
import { toast } from '@/lib/toast';
import { TypeOperationCaisse, MethodePaiement } from '@shared/enum/status-constants';

function PaymentForm() {
  const [loading, setLoading] = useState(false);

  const handleDeposit = async (clientId: string, compteId: string, amount: number) => {
    try {
      setLoading(true);

      const result = await transactionApi.process({
        clientId,
        amount,
        paymentMethod: MethodePaiement.CASH,
        natureOperation: TypeOperationCaisse.DEPOSIT_SAVINGS,
        compteId,
        description: "Dépôt épargne"
      });

      toast.success(`Transaction réussie! Référence: ${result.mouvement.reference}`);

      // Le système a automatiquement:
      // ✅ Créé un mouvementFinancier
      // ✅ Créé une transactionCompte
      // ✅ Créé une operationCaisse
      // ✅ Mis à jour le solde du compte
      // ✅ Mis à jour le solde de la session caisse

    } catch (error: any) {
      toast.error(error.message || "Erreur lors de la transaction");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={() => handleDeposit(...)}>
      {loading ? "Traitement..." : "Effectuer Dépôt"}
    </button>
  );
}
```

---

## 🛡️ Gestion des Erreurs

Le système retourne des erreurs claires et exploitables:

### Erreur: Session Caisse Non Ouverte
```json
{
  "error": "Aucune session de caisse ouverte pour cet agent"
}
```
**Solution:** L'agent doit d'abord ouvrir sa session caisse.

### Erreur: Fonds Insuffisants en Caisse
```json
{
  "error": "Fonds insuffisants en caisse. Disponible: 30000"
}
```
**Solution:** Demander un réapprovisionnement au coffre.

### Erreur: Solde Compte Insuffisant
```json
{
  "error": "Solde insuffisant. Disponible: 15000, Demandé: 20000"
}
```
**Solution:** Informer le client et proposer un montant inférieur.

### Erreur: Client Non Trouvé
```json
{
  "error": "Client requis"
}
```
**Solution:** Vérifier que le `clientId` est correct.

### Erreur: Compte Non Trouvé
```json
{
  "error": "Compte introuvable"
}
```
**Solution:** Vérifier que le `compteId` correspond à un compte actif.

---

## 🧪 Tester l'Architecture

### Méthode 1: Script de Test Automatisé

```bash
# Installer les dépendances si nécessaire
npm install

# Lancer le script de test
npx tsx server/test-global-transaction.ts
```

Ce script va:
1. ✅ Créer un dépôt épargne
2. ✅ Créer un retrait épargne
3. ✅ Créer un encaissement divers
4. ✅ Vérifier que toutes les `operationsCaisse` sont créées
5. ✅ Vérifier que le solde caisse est correct

### Méthode 2: Test Manuel via cURL

```bash
# 1. Se connecter et récupérer le token
TOKEN=$(curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r '.token')

# 2. Effectuer un dépôt épargne
curl -X POST http://localhost:5000/api/transactions/process \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "votre-client-uuid",
    "amount": 50000,
    "paymentMethod": "CASH",
    "natureOperation": "DEPOSIT_SAVINGS",
    "compteId": "votre-compte-uuid",
    "description": "Test dépôt"
  }' | jq
```

### Méthode 3: Vérification en Base de Données

```sql
-- 1. Vérifier le mouvement financier (Grand Livre)
SELECT *
FROM mouvements_financiers
WHERE client_id = 'uuid-du-client'
ORDER BY created_at DESC
LIMIT 5;

-- 2. Vérifier l'opération caisse (Historique Guichet)
SELECT
  oc.reference,
  oc.type_operation,
  oc.montant,
  oc.description,
  mf.reference AS mouvement_ref,
  sc.id AS session_id
FROM operations_caisse oc
LEFT JOIN mouvements_financiers mf ON oc.mouvement_id = mf.id
LEFT JOIN sessions_caisse sc ON oc.session_id = sc.id
WHERE oc.session_id = (
  SELECT id FROM sessions_caisse
  WHERE statut = 'OPEN'
  ORDER BY opened_at DESC
  LIMIT 1
)
ORDER BY oc.created_at DESC
LIMIT 10;

-- 3. Vérifier la cohérence du solde caisse
SELECT
  id,
  montant_ouverture,
  montant_fermeture_theorique,
  (
    montant_ouverture + COALESCE(
      (SELECT SUM(CAST(montant AS DECIMAL))
       FROM operations_caisse
       WHERE session_id = sessions_caisse.id
       AND type_operation IN ('DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'MISC_COLLECTION', 'TONTINE_CONTRIBUTION')
      ), 0
    ) - COALESCE(
      (SELECT SUM(CAST(montant AS DECIMAL))
       FROM operations_caisse
       WHERE session_id = sessions_caisse.id
       AND type_operation IN ('WITHDRAWAL_SAVINGS', 'WITHDRAWAL_CURRENT', 'MISC_DISBURSEMENT', 'TONTINE_WITHDRAWAL')
      ), 0
    )
  ) AS solde_calcule
FROM sessions_caisse
WHERE statut = 'OPEN'
ORDER BY opened_at DESC
LIMIT 1;
```

---

## 📊 Afficher l'Historique de Caisse

### Backend: Route GET

```typescript
// server/routes/caisse-agent.ts
router.get('/sessions/:sessionId/operations', requireAuth, async (req, res) => {
  const { sessionId } = req.params;

  const operations = await db.query.operationsCaisse.findMany({
    where: eq(operationsCaisse.sessionId, sessionId),
    orderBy: desc(operationsCaisse.createdAt),
    with: {
      mouvement: true,
      client: {
        columns: {
          id: true,
          nom: true,
          prenom: true
        }
      }
    }
  });

  res.json(operations);
});
```

### Frontend: Composant Historique

```typescript
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api-client';

function HistoriqueCaisse({ sessionId }: { sessionId: string }) {
  const [operations, setOperations] = useState([]);

  useEffect(() => {
    const fetchOperations = async () => {
      const data = await apiRequest(`/caisse-agent/sessions/${sessionId}/operations`);
      setOperations(data);
    };
    fetchOperations();
  }, [sessionId]);

  return (
    <div className="space-y-2">
      <h3 className="font-bold">Historique de Caisse</h3>
      {operations.map(op => (
        <div key={op.id} className="border p-3 rounded">
          <div className="flex justify-between">
            <span>{op.description}</span>
            <span className={op.typeOperation.includes('DEPOSIT') ? 'text-green-600' : 'text-red-600'}>
              {op.typeOperation.includes('DEPOSIT') ? '+' : '-'}{op.montant} FCFA
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {op.client?.nom} {op.client?.prenom} • {new Date(op.createdAt).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔍 Debugging

### Activer les Logs Détaillés

```typescript
// server/services/global-transaction-service.ts (ligne 126)
console.log('🔄 Processing transaction:', {
  natureOperation: payload.natureOperation,
  amount: payload.amount,
  paymentMethod: payload.paymentMethod,
  clientId: payload.clientId
});
```

### Vérifier les Transactions en Cours

```sql
-- Voir toutes les transactions PENDING (bloquées)
SELECT
  mf.reference,
  mf.montant,
  mf.date_operation,
  mf.statut,
  mf.source_module
FROM mouvements_financiers mf
WHERE mf.statut = 'PENDING'
ORDER BY mf.created_at DESC;
```

### Rollback Manuel (si nécessaire)

```sql
-- Annuler une transaction spécifique
BEGIN;

-- 1. Supprimer l'opération caisse
DELETE FROM operations_caisse
WHERE mouvement_id = 'uuid-du-mouvement';

-- 2. Supprimer la transaction compte
DELETE FROM transactions_compte
WHERE mouvement_id = 'uuid-du-mouvement';

-- 3. Marquer le mouvement comme CANCELLED
UPDATE mouvements_financiers
SET statut = 'CANCELLED'
WHERE id = 'uuid-du-mouvement';

-- 4. Recalculer les soldes
-- (À faire manuellement selon le contexte)

COMMIT;
```

---

## 📝 Checklist de Déploiement

Avant de déployer en production:

- [ ] ✅ Tous les tests passent (`npx tsx server/test-global-transaction.ts`)
- [ ] ✅ Les `operationsCaisse` sont créées pour TOUS les types d'opérations CASH
- [ ] ✅ Les soldes de caisse sont corrects après plusieurs transactions
- [ ] ✅ Les erreurs de validation fonctionnent (session fermée, fonds insuffisants, etc.)
- [ ] ✅ Le frontend affiche correctement l'historique de caisse
- [ ] ✅ Les reçus sont générés et sauvegardés dans le Loge
- [ ] ✅ Les WebSockets notifient les changements en temps réel
- [ ] ✅ La documentation est à jour (ARCHITECTURE_TRANSACTIONNELLE.md)

---

## 🆘 Support

Pour toute question ou problème:

1. **Lire la documentation:** [ARCHITECTURE_TRANSACTIONNELLE.md](ARCHITECTURE_TRANSACTIONNELLE.md)
2. **Vérifier les logs:** `tail -f logs/app.log`
3. **Tester avec le script:** `npx tsx server/test-global-transaction.ts`
4. **Consulter le code source:**
   - Service: [`server/services/global-transaction-service.ts`](server/services/global-transaction-service.ts)
   - Routes: [`server/routes/transactions.ts`](server/routes/transactions.ts)

---

**Dernière mise à jour:** 2024-01-24
**Version:** 1.0 Production-Ready ✅
