---
name: microflex-ui
description: Concevoir, implémenter ou revoir les interfaces React de MicroFlex. Utiliser pour créer une page, un formulaire, un tableau, un dashboard, une modale, un parcours métier, une vue responsive, une amélioration visuelle, une correction d'accessibilité ou l'intégration d'un feature flag et de la marque blanche dans apps/web.
---

# UI MicroFlex

Lire `AGENTS.md` et inspecter la feature, les composants UI et les écrans voisins avant de coder. Respecter le langage visuel existant sans produire une interface générique déconnectée du produit financier.

## Concevoir le parcours

1. Définir l'action principale, les informations indispensables et les permissions concernées.
2. Concevoir d'abord la hiérarchie, le flux clavier et les états, puis les détails visuels.
3. Prévoir chargement, vide, erreur, succès, absence de permission, hors ligne et réseau lent.
4. Réduire la densité cognitive : grouper par tâche, révéler progressivement et confirmer les opérations irréversibles.
5. Pour une opération financière, afficher montant, devise, source, destination, frais, statut et preuve de confirmation sans ambiguïté.

## Implémenter

- Réutiliser les composants, tokens, patterns de formulaire et icônes déjà présents.
- Utiliser les composants fonctionnels, hooks et TanStack Query ; garder l'état local près de son usage.
- Centraliser les appels API et clés de requête dans les services/hooks existants.
- Consommer la marque, le thème et les capacités via le contexte tenant ; ne rien coder en dur par client.
- Centraliser la décision d'un feature flag et conserver un défaut sûr quand la clé est absente.
- Ne jamais confondre masquage UI et autorisation : protéger aussi l'API.
- Préférer HTML sémantique, labels explicites, focus visible, ordre clavier logique et zones cliquables confortables.
- Préserver mobile, desktop et contenus longs ; éviter les dimensions rigides sans nécessité.
- Ne jamais exposer de secret dans une variable Vite ou le bundle.

## Vérifier

- Tester le parcours nominal et au moins un état d'échec.
- Vérifier les rôles autorisé et interdit lorsque la permission change.
- Vérifier les deux états de chaque feature flag modifié.
- Ajouter un test composant ou E2E lorsque l'interaction porte un risque métier.

Exécuter :

```bash
npm run check
npx vitest run <tests-concernés>
npm run build
```

Contrôler visuellement l'écran réel quand un navigateur local est disponible. Ne pas conclure sur le rendu à partir du code seul.
