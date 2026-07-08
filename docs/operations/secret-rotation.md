# Rotation et réponse aux secrets exposés

Le fichier `.env` a été suivi dans l'historique Git avant son retrait. Considérer toute valeur sensible qui y a figuré comme potentiellement compromise, même si le dépôt est privé.

## Rotation initiale obligatoire

1. Inventorier les secrets présents dans toutes les révisions de `.env` sans les copier dans un ticket ou un journal.
2. Révoquer puis recréer les secrets de session, OTP, limites offline, PostgreSQL, Redis, MinIO, SMTP, SMS et Mobile Money.
3. Mettre à jour les GitHub Environments et les coffres de secrets On-Premise.
4. Redéployer l'application et invalider sessions, refresh tokens et clés fournisseur concernées.
5. Vérifier les journaux d'accès depuis la première publication du secret.
6. Conserver une preuve de rotation ne contenant jamais la valeur secrète.

Réécrire l'historique Git ne remplace pas la rotation. Une purge d'historique nécessite une coordination explicite avec tous les clones, tags, forks et artefacts.

## Politique continue

- Rotation planifiée au moins tous les 90 jours pour les secrets applicatifs critiques.
- Rotation immédiate après départ d'un administrateur, suspicion d'accès ou exposition CI.
- Secrets distincts par environnement et par client On-Premise.
- Aucun secret dans une variable Vite, une image Docker, un log ou un fichier suivi.
- Secret scanning bloquant sur chaque pull request.
