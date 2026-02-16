# Cofinco - Instructions pour Claude

## Theming & Design Tokens

**Ne jamais utiliser de couleurs Tailwind brutes** (ex: `text-blue-400`, `bg-emerald-500/10`, `border-red-500/30`).

Toujours utiliser les **tokens sémantiques** définis dans `tailwind.config.js` et `client/src/index.css` :

- **Surfaces** : `bg-surface`, `bg-surface-elevated`, `bg-surface-subtle`, `bg-surface-subtle-elevated`
- **Texte** : `text-content-primary`, `text-content-secondary`, `text-content-muted`
- **Bordures** : `border-edge`, `border-edge-subtle`
- **Statuts** : `text-status-success`, `bg-status-danger-bg`, `border-status-warning/30`, `text-status-info`
- **Accent** : `bg-accent`, `text-accent`, `border-accent`, `from-accent`, `to-accent`
- **Inputs** : `bg-input`, `border-input-border`, `focus:border-input-focus`
- **Cards** : `bg-card`, `border-card-border`
- **Header/Sidebar** : `bg-header`, `bg-sidebar`, `text-sidebar-text`

Les tokens supportent automatiquement le light et dark mode via les variables CSS.

## Environnement

Tout est **dockerisé**. Ne pas tenter d'exécuter node/npm/npx en local. Utiliser `docker compose exec app <commande>` pour lancer des commandes (build, db:push, etc.).

## Règle fondamentale

**Les nouvelles fonctionnalités ne doivent jamais casser l'existant.** Toujours préserver le comportement actuel lors d'ajouts ou modifications. En cas de doute sur l'impact d'un changement, demander confirmation avant de procéder.
