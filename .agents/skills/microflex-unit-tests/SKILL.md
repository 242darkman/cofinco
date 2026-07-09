---
name: microflex-unit-tests
description: Écrire, réparer ou renforcer les tests unitaires Vitest de MicroFlex. Utiliser pour une nouvelle règle métier, un bug à reproduire, une validation, un calcul, une machine d'état, un hook ou utilitaire, des cas limites, une régression, ou pour améliorer des tests fragiles dans tests/unit.
---

# Tests unitaires MicroFlex

Lire `AGENTS.md` et le code testé. Un test doit protéger un comportement observable ou un invariant métier, pas recopier l'implémentation.

## Choisir le bon niveau

- Rester unitaire pour une règle pure, un calcul, une validation, un état ou un mapping.
- Passer en intégration si le comportement dépend réellement de PostgreSQL, Express, une transaction ou plusieurs couches.
- Utiliser les tests de contrat pour le ledger et la comptabilité.
- Ne pas transformer un test d'intégration en amas de mocks pour le faire entrer artificiellement dans `tests/unit`.

## Construire les cas

1. Reproduire le bug par un test échouant avant la correction, si applicable.
2. Couvrir le cas nominal, les bornes, l'entrée invalide et le refus métier important.
3. Pour une transition, tester les transitions permises et interdites.
4. Pour un montant, tester zéro, arrondi, grande valeur, valeur négative interdite et répétition si pertinente.
5. Pour un flag ou une permission, tester activé/désactivé et autorisé/interdit.

## Écrire des tests robustes

- Suivre Arrange, Act, Assert sans commentaires superflus.
- Nommer le comportement et le résultat attendu.
- Utiliser des données minimales et explicites ; éviter les fixtures géantes.
- Mock seulement aux frontières non déterministes : temps, réseau, fournisseur externe, stockage ou DB.
- Restaurer mocks, timers et variables d'environnement après chaque test.
- Ne pas dépendre de l'ordre, de l'heure locale, du réseau ou d'une base implicite.
- Préférer une fabrique typée à des objets incomplets forcés avec `as any`.
- Vérifier le résultat et les effets de bord essentiels, pas chaque appel interne.
- Ne jamais assouplir une assertion uniquement pour obtenir du vert.

## Valider

Lancer d'abord le fichier ciblé :

```bash
npx vitest run tests/unit/<fichier>.test.ts
```

Puis lancer `npm run check`. Exécuter `npm run test:unit` si le changement touche un contrat partagé, un helper central ou plusieurs features. Signaler explicitement tout test non exécutable et sa dépendance manquante.
