# Adoption des migrations Drizzle versionnées

MicroFlex utilise désormais `drizzle/` comme historique de migrations. Le conteneur `init` exécute `npm run db:migrate` et ne lance plus `drizzle-kit push --force`.

## Nouvelle base

Le baseline `0000_baseline.sql` crée le schéma complet. Aucune action manuelle n'est requise avant le premier lancement du conteneur `init`.

## Base existante

Ne pas lancer le baseline directement sur une base contenant déjà les tables MicroFlex.

1. Suspendre les écritures applicatives.
2. Réaliser et restaurer une sauvegarde dans un environnement isolé.
3. Comparer la base restaurée au schéma Drizzle actuel et corriger toute dérive.
4. Faire approuver le résultat par le responsable base de données et le responsable applicatif.
5. Marquer le baseline comme adopté dans la table Drizzle uniquement après cette validation.
6. Exécuter `npm run db:migrate` sur la copie, puis les tests d'intégrité, GL et de réconciliation.
7. Répéter la procédure en production avec une fenêtre de rollback documentée.

L'adoption du baseline est volontairement manuelle : marquer automatiquement une base historique comme compatible pourrait masquer une dérive de schéma ou une perte de données.

## Nouvelle évolution

```bash
npm run db:generate -- --name description_en_snake_case
npm run db:migrate
npm run check
npm run test:integration
npm run gl:contracts
```

Relire le SQL généré. Une suppression, un changement de type ou une contrainte renforcée doit suivre une migration expand/contract et disposer d'un plan de retour arrière.
