# Exceptions temporaires de dépendances

Les exceptions ci-dessous sont contrôlées par `npm run security:audit`. Une exception expirée ou une nouvelle vulnérabilité haute/critique bloque la CI.

_Aucune exception active à ce jour._

## Historique

### `xlsx` — résolue définitivement (dépendance supprimée au profit d'ExcelJS)

- Résolution finale : la dépendance `xlsx` (SheetJS) a été entièrement retirée du projet. Les exports Excel utilisent désormais `exceljs` (registre npm, licence MIT) via `apps/web/src/lib/excel-export.ts` côté web et directement dans les services côté API ; les exports CSV utilisent `papaparse`. Plus aucune dépendance hors registre npm.

#### Étape intermédiaire (historique) — migration vers SheetJS 0.20.3

- Avis couverts : `GHSA-4r6h-8v6p-xvw6` (prototype pollution) et `GHSA-5pgg-2g8v-p4x9` (ReDoS).
- Résolution : migration de `xlsx@0.18.5` (dernière version publiée sur le registre npm, sans correctif) vers la distribution SheetJS maintenue `0.20.3`, servie par le CDN officiel `https://cdn.sheetjs.com`. La 0.19.3 corrige la prototype pollution et la 0.20.2 le ReDoS ; 0.20.3 embarque les deux.
- Vérification : `npm audit` ne remonte plus aucune vulnérabilité ; `npm run security:audit` passe sans exception.
- Note build/CI : la dépendance provient d'un tarball CDN (hors registre npm) ; son intégrité est verrouillée dans `package-lock.json`. Tout environnement exécutant `npm ci` (CI GitHub, build Docker) doit pouvoir joindre `cdn.sheetjs.com`.

Cette section reste à titre d'historique. Toute nouvelle exception doit être ajoutée dans `scripts/security/audit-dependencies.mjs` **et** documentée ci-dessus ; elle n'autorise pas son renouvellement silencieux.
