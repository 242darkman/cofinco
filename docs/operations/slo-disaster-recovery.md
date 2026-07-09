# SLO, continuité et reprise MicroFlex

## Objectifs initiaux

| Indicateur | Objectif mensuel | Mesure |
| --- | ---: | --- |
| Disponibilité API hors maintenance planifiée | 99,9 % | réponses non-5xx / réponses totales |
| Latence API P95 | < 2 s | `http_request_duration_seconds` |
| Latence API P99 | < 5 s | `http_request_duration_seconds` |
| Intégrité GL | 100 % | aucune divergence non acquittée |
| RPO PostgreSQL | 24 h maximum, cible 1 h | âge de la dernière sauvegarde restaurable |
| RTO service | 4 h maximum | durée du dernier exercice de reprise |

Les alertes de burn-rate préviennent avant l'épuisement du budget d'erreur. Une alerte GL critique bloque les opérations concernées jusqu'à réconciliation.

## Responsabilités

- Astreinte applicative : diagnostic API, workers et déploiement.
- Responsable base de données : sauvegarde, restauration et migrations.
- Responsable sécurité : incident secret, accès, preuve et notification.
- Responsable métier : validation des soldes, écritures et reprise des opérations.

Chaque déploiement client doit nommer ces rôles et leurs moyens de contact dans un document non versionné avec le code.

## Procédure de reprise

1. Déclarer l'incident, geler les écritures et conserver les journaux.
2. Identifier le dernier point cohérent entre base, stockage objet et fournisseurs externes.
3. Restaurer la sauvegarde dans une base isolée avec `scripts/vps/restore-db.sh`.
4. Exécuter les migrations, `npm run audit:integrity`, `npm run gl:contracts` et la réconciliation.
5. Faire valider les soldes par le responsable métier.
6. Basculer le trafic, surveiller les SLO et documenter les opérations rejouées.
7. Produire un post-mortem sans recherche de culpabilité avec actions datées.

## Exercices obligatoires

- Mensuel : vérifier présence, checksum et copie hors site des sauvegardes.
- Trimestriel : restaurer une sauvegarde sur une infrastructure isolée et mesurer RPO/RTO.
- Semestriel : exercice complet de perte de base ou de VPS.
- Après modification du backup, du chiffrement ou des migrations : exercice de restauration avant production.

Une sauvegarde qui n'a jamais été restaurée ne constitue pas une preuve de reprise.
