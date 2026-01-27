# Plan: GL Wiring Complet (PR-0 a PR-5)

## PR-0 — Schema Foundation

### 0.1 — Nouveaux champs `mouvements_financiers`
**Fichier**: `shared/schema/finance.ts` (table mouvementsFinanciers, ligne ~360)

Ajouter 3 colonnes:
```
requiresGlPosting: boolean, default true
glPostingStatus: text, default 'PENDING'   // PENDING | POSTED | FAILED | SKIPPED
glPostingError: text, nullable
```

Ajouter 2 index:
```
idx_mouvements_agence_created (agenceId, createdAt)
idx_mouvements_agence_module_ref (agenceId, sourceModule, reference)
```

### 0.2 — Nouveaux champs `gl_posting_links`
**Fichier**: `shared/schema/accounting.ts` (table glPostingLinks, ligne ~175)

Ajouter colonnes:
```
mouvementId: uuid, nullable, FK -> mouvementsFinanciers
status: text, default 'POSTED'   // POSTED | FAILED
attempts: integer, default 1
lastAttemptAt: timestamp, default now
nextRetryAt: timestamp, nullable
errorMessage: text, nullable
```

Ajouter contrainte unique:
```
uq_gl_posting_links_source (agenceId, sourceType, sourceId)
```

### 0.3 — Nouveaux enum values
**Fichier**: `shared/enum/enums.ts`

`sourceModuleEnum` — ajouter: `"RH_PAYROLL"`, `"COFFRE_TRANSFER"`, `"INTER_COFFRE"`
`typePaiementTerrainEnum` — ajouter: `"COFFRE_TO_CAISSE"`, `"CAISSE_TO_COFFRE"`, `"COFFRE_TO_COFFRE"`, `"SESSION_OPENING_FLOAT"`, `"SESSION_CLOSING_TRANSFER"`, `"PAYROLL_ENGAGEMENT"`, `"PAYROLL_PAYMENT"`, `"SALARY_ADVANCE"`, `"FINANCIAL_PENALTY"`
`typeEvenementEnum` — ajouter: `"GL_POSTING_FAILED"`

### 0.4 — Type SourceModule dans ledger.ts
**Fichier**: `server/services/ledger.ts` (ligne 25)

Ajouter `"RH_PAYROLL" | "COFFRE_TRANSFER" | "INTER_COFFRE"` au type SourceModule.

### 0.5 — Migration Drizzle
Generer migration via `npx drizzle-kit generate` apres toutes les modifs schema.

---

## PR-1 — Fiabilisation GL (Option A: Synchrone)

### Justification du choix synchrone
- Plus simple, plus atomique (rollback total si GL echoue)
- Le pattern outbox/worker/DLQ peut etre ajoute plus tard comme PR-1b
- Les champs `glPostingStatus`/`glPostingError` permettent deja le monitoring et le retry manuel

### 1.1 — postFromMouvement: throw au lieu de return null
**Fichier**: `server/services/accounting-posting-service.ts`

- Creer `AccountingRuleNotFoundError extends Error` (exporte)
- Ligne ~532: remplacer `return null` quand no rule par `throw new AccountingRuleNotFoundError(...)`
- Ligne ~543: remplacer `return null` quand account not found par `throw new Error("GL account not found: ...")`
- Le retour `null` pour idempotency (deja poste) reste OK — c'est le seul cas valide

### 1.2 — executeWithLedger: posting synchrone
**Fichier**: `server/services/ledger.ts`

Remplacer le fire-and-forget (lignes 561-567):
```
// AVANT: fire-and-forget
postToGeneralLedger(mouvement, ...).catch(err => console.warn(...));

// APRES: synchrone dans la transaction
// 1. Creer mouvement avec glPostingStatus='PENDING'
// 2. Dans la meme transaction, appeler postFromMouvement()
// 3. Si succes: update mouvement.glPostingStatus = 'POSTED'
// 4. Si AccountingRuleNotFoundError:
//    - Si mouvement.requiresGlPosting=true -> rollback (throw)
//    - Si requiresGlPosting=false -> set glPostingStatus='SKIPPED', continuer
// 5. Si autre erreur: set glPostingStatus='FAILED' + glPostingError, rollback
```

Concretement, deplacer l'appel `postFromMouvement()` DANS le callback de `db.transaction()`, apres la creation du mouvement et l'operation metier. Le `postToGeneralLedger()` wrapper async n'est plus necessaire pour les flux normaux.

### 1.3 — Nouveau helper: postGlForMouvement()
**Fichier**: `server/services/accounting-posting-service.ts`

Ajouter une fonction qui accepte un `tx` (transaction handle):
```typescript
export async function postGlForMouvement(
  tx: PgTransaction,
  mouvement: MouvementFinancier,
  agenceId: string,
  userId?: string,
  additionalMetadata?: Record<string, any>
): Promise<PostEntryResult | null>
```
Cette fonction fait le meme travail que `postFromMouvement()` mais dans une transaction fournie. Le code existant de `postFromMouvement` sera refactore pour utiliser cette version interne.

### 1.4 — Gestion glPostingStatus dans les mouvements
**Fichier**: `server/services/ledger.ts`

- `createMouvementFinancier()`: set `glPostingStatus: 'PENDING'`
- Apres posting reussi: `UPDATE mouvements_financiers SET glPostingStatus='POSTED'`
- Sur erreur: `UPDATE mouvements_financiers SET glPostingStatus='FAILED', glPostingError=message`

---

## PR-2 — Coffre / Inter-coffres GL

### 2.1 — Coffre transfer-executor: ajout GL posting
**Fichier**: `server/services/coffre/transfer-executor.ts`

Apres creation des 2 mouvements (debit + credit, lignes 117-156), ajouter:
```typescript
// Post GL pour le mouvement debit
await postGlForMouvement(tx, mouvementDebit, transfert.agenceId, executorId, {
  transfertId: transfert.id,
  type: isCoffreSource ? 'SORTIE_COFFRE' : 'SORTIE_CAISSE'
});

// Post GL pour le mouvement credit
await postGlForMouvement(tx, mouvementCredit, transfert.agenceId, executorId, {
  transfertId: transfert.id,
  type: !isCoffreSource ? 'ENTREE_COFFRE' : 'ENTREE_CAISSE'
});
```

Aussi: utiliser les nouveaux typePaiement dans les mouvements (`COFFRE_TO_CAISSE`, `CAISSE_TO_COFFRE`).

### 2.2 — Inter-coffre transfer-executor: ajout GL posting
**Fichier**: `server/services/transfert-inter-coffres/transfer-executor.ts`

- `executeDispatch()` (~ligne 159-172): apres creation mouvement source, ajouter postGlForMouvement
- `executeReceive()` (~ligne 307-326): apres creation mouvement dest, ajouter postGlForMouvement
- Si ecart: creer un 3eme mouvement pour l'ecart avec GL posting

### 2.3 — Accounting rules pour coffre
**Fichier**: seed ou migration SQL / ou via admin API

Regles minimales (OHADA):
| Code | eventType | journalCode | Debit | Credit | Description |
|------|-----------|-------------|-------|--------|-------------|
| COFFRE_TO_CAISSE_OUT | COFFRE_TO_CAISSE | OD | 521 | 571 | Transfert coffre vers caisse |
| CAISSE_TO_COFFRE_OUT | CAISSE_TO_COFFRE | OD | 571 | 521 | Transfert caisse vers coffre |
| COFFRE_TO_COFFRE_DISPATCH | COFFRE_TO_COFFRE | OD | 581 | 571 | Transit inter-coffres (depart) |
| COFFRE_TO_COFFRE_RECEIVE | COFFRE_TO_COFFRE | OD | 571 | 581 | Transit inter-coffres (reception) |

(521=Banques/Caisse, 571=Coffre-fort, 581=Virements internes de fonds)
Les numeros de comptes exacts seront a adapter au plan comptable existant.

### 2.4 — WebSocket events
Emettre `ACCOUNTING_UPDATE` en plus des `BALANCE_UPDATED` deja emis. Utiliser le broadcast WS existant dans le flow `executeWithLedger`.

---

## PR-3 — Sessions Caisse: GL manquant

### 3.1 — Ouverture session: GL pour dotation
**Fichier**: `server/services/caisse/session-opening-service.ts`

Dans `receiveFundsAndOpen()` (ligne ~680), apres `executeTransfert()`:
- Le transfert cree deja des mouvements via transfer-executor.ts
- Avec PR-2 applique, ces mouvements auront deja un GL posting
- Si ouverture directe sans transfert (`openDirectWithExistingFunds`): set `requiresGlPosting=false` (pas de variation de tresorerie)

### 3.2 — Fermeture session: GL pour transfert coffre
**Fichier**: `server/services/caisse/session-closing-service.ts`

Dans `finalizeClose()` (ligne ~495-567):
- Le transfert vers coffre (`montantVersCoffre > 0`) cree un `transfertsCoffreCaisse`
- Ce transfert sera execute via transfer-executor.ts → deja couvert par PR-2
- Pour l'ecart: le mouvement d'ecart (ligne ~958-974) utilise `createMouvementFinancier()` directement
  → Ajouter un appel `postGlForMouvement()` apres creation du mouvement d'ecart
  → eventType: `ADJUSTMENT`, comptes: 658 (charges) / 521 (caisse) ou 521 / 758 (produits) selon sens

### 3.3 — Accounting rules pour sessions
| Code | eventType | journalCode | Debit | Credit | Description |
|------|-----------|-------------|-------|--------|-------------|
| SESSION_DEFICIT | ADJUSTMENT | OD | 658 | 521 | Deficit caisse |
| SESSION_SURPLUS | ADJUSTMENT | OD | 521 | 758 | Excedent caisse |

---

## PR-4 — RH/Paie: Wiring GL complet

### 4.1 — Schema: ajouter lien bulletin -> GL
**Fichier**: `shared/schema/hr.ts`

Ajouter a `bulletinsPaie`:
```
engagementMouvementId: uuid, nullable    // mouvement cree a VALIDATED
paiementMouvementId: uuid, nullable      // mouvement cree a PAID
engagementEcritureId: uuid, nullable     // ecriture GL engagement
paiementEcritureId: uuid, nullable       // ecriture GL paiement
```

### 4.2 — HR service: posting a VALIDATED (engagement)
**Fichier**: `server/services/hr-service.ts` OU nouveau fichier `server/services/hr-accounting-service.ts`

Nouvelle fonction `postPayrollEngagement(tx, bulletin, agenceId, userId)`:
1. Creer mouvement via `createMouvementFinancier(tx, {...})`:
   - sourceModule: 'RH_PAYROLL'
   - typePaiement: 'PAYROLL_ENGAGEMENT'
   - montant: salaireBrut
   - metadata: { bulletinId, employeId, mois, composants: {base, primes, cnss, ipr} }
   - idempotencyKey: `PAYROLL-ENGAGE-${bulletinId}`
2. Poster GL via `postGlForMouvement(tx, mouvement, ...)`
3. Update bulletin: engagementMouvementId, engagementEcritureId

Ecritures GL a VALIDATED:
```
Debit 661 (Charges de personnel)     = salaireBrut
  Credit 421 (Personnel, rem. dues)  = salaireNet
  Credit 431 (Securite sociale)      = cnssEmploye + cnssPatronale
  Credit 441 (Etat, impots)          = ipr
```

Note: postFromMouvement ne supporte que 2 lignes (debit/credit). Pour les ecritures multi-lignes de paie, utiliser `postEntry()` directement avec un tableau de lignes.

### 4.3 — HR routes: hook VALIDATED
**Fichier**: `server/routes/hr.ts` (PATCH /paie/validate, ligne ~928)

Dans la boucle de validation des bulletins:
1. Ouvrir une transaction englobante
2. Pour chaque bulletin DRAFT -> VALIDATED:
   - Update statut
   - Appeler `postPayrollEngagement(tx, bulletin, agenceId, userId)`
3. Si GL echoue: rollback total

### 4.4 — HR service: posting a PAID (decaissement)
Nouvelle fonction `postPayrollPayment(tx, bulletin, agenceId, userId)`:
1. Creer mouvement:
   - sourceModule: 'RH_PAYROLL'
   - typePaiement: 'PAYROLL_PAYMENT'
   - montant: salaireNet
   - idempotencyKey: `PAYROLL-PAY-${bulletinId}`
2. Poster GL via `postEntry()`:
   ```
   Debit 421 (Personnel, rem. dues)  = salaireNet
     Credit 521 (Caisse) ou 512 (Banque) = salaireNet
   ```
3. Update bulletin: paiementMouvementId, paiementEcritureId

### 4.5 — HR routes: hook PAID
**Fichier**: `server/routes/hr.ts` (PATCH /paie/pay, ligne ~982)

Meme pattern: transaction englobante, pour chaque bulletin VALIDATED -> PAID, appeler postPayrollPayment().

### 4.6 — Accounting rules pour paie
| Code | eventType | journalCode | Debit | Credit | Description |
|------|-----------|-------------|-------|--------|-------------|
| PAYROLL_ENGAGEMENT | PAYROLL_ENGAGEMENT | OD | 661 | 421 | Engagement salaire (simplifie) |
| PAYROLL_PAYMENT_CASH | PAYROLL_PAYMENT | OD | 421 | 521 | Paiement salaire cash |
| PAYROLL_PAYMENT_BANK | PAYROLL_PAYMENT | OD | 421 | 512 | Paiement salaire banque |

Note: les ecritures d'engagement sont multi-lignes (charges / personnel / secu / impots), donc elles utiliseront `postEntry()` directement plutot que le systeme de rules a 2 lignes.

### 4.7 — WebSocket
Emettre `ACCOUNTING_UPDATE` apres chaque posting de bulletin.

---

## PR-5 — Observabilite & Coverage Gate

### 5.1 — Endpoint admin /api/comptabilite/coverage/report
**Fichier**: `server/routes/accounting.ts`

Nouveau endpoint GET qui retourne:
- Liste de tous les sourceModule existants dans mouvements_financiers
- Pour chacun: nombre total, nombre avec glPostingStatus=POSTED, FAILED, PENDING, SKIPPED
- Liste des mouvements FAILED avec details
- Liste des mouvements PENDING depuis > 5 minutes (anomalie)

### 5.2 — Endpoint admin /api/comptabilite/gl-health
Retourne:
- Nombre d'ecritures non-equilibrees (ne devrait pas exister)
- Nombre de gl_posting_links orphelins
- Dernier posting reussi (timestamp)
- Nombre total ecritures par journal

### 5.3 — Alerting basique
Dans `postGlForMouvement()`, si FAILED:
- Log error avec contexte complet
- Emettre event WS `GL_POSTING_FAILED` aux admins
- Incrementer compteur dans metadata du mouvement

---

## Ordre d'implementation

1. **PR-0** (schema) — requis par tout le reste
2. **PR-1** (fiabilisation) — changement critique dans ledger.ts + posting-service
3. **PR-2** (coffre GL) — utilise le nouveau postGlForMouvement()
4. **PR-3** (caisse sessions) — depend de PR-2 (les transferts coffre/caisse sont deja couverts)
5. **PR-4** (HR/Paie) — independant, peut etre parallelise avec PR-2/3
6. **PR-5** (observabilite) — une fois tout cable

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| Migration schema sur base existante | Les nouveaux champs ont des defaults, pas de breaking change |
| Rollback si GL echoue en PR-1 | Les transactions existantes qui n'ont pas de rules definies auront requiresGlPosting=false temporairement |
| Comptes OHADA incorrects | Les numeros de comptes (521, 571, 661, etc.) devront etre valides contre le plan comptable existant en base |
| Performance du posting synchrone | Le posting est une insertion DB simple, pas de I/O externe |
| Enum migration PostgreSQL | `ALTER TYPE ... ADD VALUE` est non-transactionnel en PG, attention a l'ordre dans la migration |
