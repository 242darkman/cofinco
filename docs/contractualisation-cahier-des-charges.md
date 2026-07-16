# Contractualisation des produits — Cahier des charges

> Document de cadrage pour la future feature « Génération de contrats ». Objectif :
> à chaque souscription d'un produit, produire un **contrat professionnel imprimable**
> (multi-pages, avec toutes les clauses), signé par les deux parties, opposable de
> bonne foi et devant la loi.
>
> ⚠️ Ce document décrit le **périmètre produit et technique**. Il ne constitue pas un
> avis juridique : les clauses exactes et mentions obligatoires doivent être validées
> par un juriste au regard de la réglementation applicable (microfinance zone
> **CEMAC / COBAC**, droit des contrats et **sûretés OHADA**).

---

## 1. Principes directeurs

1. **Opposabilité** : un frais, un taux ou une pénalité n'est réclamable que s'il figure
   dans un document accepté et signé par le client. Rien d'implicite.
2. **Snapshot immuable** : à la souscription, le contrat **fige** les termes du jour
   (taux, barème, commissions). Si les tarifs changent ensuite, le contrat déjà signé
   n'est pas affecté. C'est ce qui le rend juridiquement solide.
3. **Versionnement des modèles** : chaque modèle de contrat est versionné par produit et
   par tenant (marque blanche). On sait toujours quelle version a été signée.
4. **Traçabilité** : statut (brouillon → à signer → signé → archivé), horodatage,
   identité du signataire et de l'agent, lien vers le produit concerné.
5. **Réutilisation** : s'appuyer sur l'infrastructure d'impression existante
   (`components/ui/printable/*`, style `@media print` / `@page`) et le branding tenant.

---

## 2. Matrice principale — Produit → Contrat

Légende priorité : **P0** = juridiquement indispensable · **P1** = fortement recommandé · **P2** = confort.

| Produit (module) | Type de document | Priorité | Déclencheur de génération | Clauses / mentions obligatoires | Annexes |
|---|---|---|---|---|---|
| **Compte épargne** (`SAVINGS`) | Convention de compte épargne | P0 | Validation de l'ouverture du compte | Identité des parties ; taux de rémunération ; capitalisation des intérêts ; conditions et plafonds de retrait ; frais de tenue ; durée / résiliation ; clôture | Grille tarifaire ; barème d'intérêts |
| **Compte courant** (`CURRENT`) | Convention de compte courant | P0 | Validation de l'ouverture | Fonctionnement du compte ; découvert autorisé ou non ; moyens de paiement ; frais de tenue et commissions ; conditions de clôture | Grille tarifaire |
| **Compte bloqué / dépôt à terme** (`BLOCKED`) | Contrat de dépôt à terme | P0 | Validation de l'ouverture | Montant ; **durée de blocage** ; taux ; **pénalité de retrait anticipé** ; sort à l'échéance (reconduction ou restitution) | Échéance de déblocage |
| **Crédit** (`PERSONAL` / `REAL_ESTATE` / `COMMERCIAL`) | Contrat de prêt | P0 | Décision d'octroi / avant décaissement | Montant ; **taux et TEG** ; durée ; fréquence de remboursement ; frais de dossier ; assurance éventuelle ; **garanties/sûretés** ; pénalités de retard ; **déchéance du terme** ; remboursement anticipé | **Tableau d'amortissement** (existe déjà) ; acte de caution / gage / hypothèque / nantissement |
| **Tontine** — groupe | Règlement intérieur du groupe | P0 | Création / activation de la tontine | Montant de cotisation ; fréquence ; ordre de distribution ; pénalités ; règles d'exclusion / remplacement ; frais d'entrée / sortie ; gouvernance (rôles) | Calendrier des tours |
| **Tontine** — membre | Bulletin d'adhésion individuel | P0 | Adhésion d'un membre | Acceptation du règlement ; engagement de cotisation ; position dans l'ordre ; conséquences en cas de défaut | Règlement intérieur (réf.) |
| **Carte de pointage** | Contrat d'épargne par cases | P0 | Ouverture de la carte | Montant fixe par case ; nombre de cases (31) ; absence d'échéance ; **modalité et montant exact de la commission de gestion au retrait** (`A = M×N − M`) ; conditions de clôture | — |
| **Épargne programmée / versements auto** | Mandat de prélèvement / d'ordre permanent | P1 | Mise en place du versement automatique | Autorisation de prélèvement ; montant ; périodicité ; **révocabilité** ; compte source | — |
| **Virements programmés** | Mandat d'ordre permanent | P1 | Création du virement récurrent | Bénéficiaire ; montant ; périodicité ; conditions de suspension | — |
| **Transfert d'argent** | Mandat / reçu de transfert + CGU | P1 | Émission du transfert | Émetteur / bénéficiaire ; montant ; frais ; délai ; responsabilité et recours | CGU du service |
| **Portefeuille Mobile Money** | Conditions d'utilisation | P2 | Activation du portefeuille | Frais ; plafonds ; sécurité ; litiges | Grille tarifaire MM |

---

## 3. Socle contractuel transverse (tous produits)

Ces documents ne dépendent pas d'un produit mais conditionnent l'opposabilité de tous les autres.

| Document | Priorité | Déclencheur | Contenu clé |
|---|---|---|---|
| **Fiche d'entrée en relation / KYC** | P0 | Création du client | Identification complète ; justificatifs ; profil de risque |
| **Consentement données personnelles** | P0 | Création du client | Finalités du traitement ; durée de conservation ; droits du client ; base légale |
| **Conditions générales (CG)** | P0 | Première souscription | Cadre contractuel global de la relation |
| **Grille tarifaire** | P0 | Souscription (annexe) | Barème daté de tous les frais et commissions — **sans elle, aucun frais n'est opposable** |

---

## 4. Documents de cycle de vie (avenants et sorties)

| Document | Déclencheur | Rôle |
|---|---|---|
| **Avenant** | Modification d'un contrat en cours (taux, plafond, durée) | Tracer et faire accepter la modification |
| **Quittance / attestation de solde** | Solde d'un crédit ou clôture d'un produit | Preuve de l'extinction de la dette / du produit |
| **Mainlevée de garantie** | Fin de prêt garanti | Libérer la sûreté (caution, gage, hypothèque) |
| **Attestation de clôture de compte** | Clôture d'un compte | Preuve de la fin de la relation sur ce compte |

---

## 5. Clauses communes à tout contrat généré

À factoriser dans un « en-tête/pied » de modèle réutilisable :

- **Identité des parties** : client (état civil, pièce, coordonnées) et institution
  (dénomination, agrément, **RCCM**, **NIF**, adresse — déjà disponibles via `company-info`).
- **Objet** du contrat et produit concerné.
- **Conditions financières** : montants, taux, **TEG** le cas échéant, frais et commissions.
- **Durée**, conditions de **résiliation / clôture**.
- **Modalités** de versement et de retrait ; **pénalités**.
- **Protection des données personnelles**.
- **Règlement des litiges** et **for compétent**.
- **Date, lieu et signatures des deux parties** (voir §7).
- **Mentions légales** et numéro de version du modèle.

---

## 6. Architecture technique proposée

Aligner sur les conventions du dépôt (AGENTS.md) : architecture par feature, contrats
partagés dans `packages/shared`, services isolés côté `apps/api`, UI par feature côté
`apps/web`, et tests obligatoires.

### Modèle de données (esquisse)

- **`contract_templates`** : modèle versionné.
  `id, tenantId, productType (enum), version, title, bodyTemplate (clauses + variables),
  requiredSignatures, isActive, createdAt`.
  → Un seul modèle actif par (tenant, productType, version).

- **`contracts`** : instance signée, rattachée à un produit.
  `id, clientId, agenceId, productType, productRef (compteId | creditId | tontineId | carteId | …),
  templateId + templateVersion, termsSnapshot (JSONB immuable), status (DRAFT | PENDING_SIGNATURE | SIGNED | ARCHIVED | CANCELLED),
  pdfRef, signedAt, signedBy, createdBy, createdAt`.
  → `termsSnapshot` fige les termes du jour (taux, barème, commission) = opposabilité.

- **`contract_signatures`** (si multi-signataires) : `contractId, party (CLIENT | INSTITUTION | CAUTION), method, signedAt, evidence`.

### Services

- `contract-template-service` : résolution du modèle actif par produit/tenant.
- `contract-service` : génération d'un contrat à partir d'un déclencheur métier
  (fige le snapshot, statut initial), transition d'états, archivage.
- `contract-pdf-service` : rendu **PDF multi-pages** (réutiliser `printable` + `@page`).

### Intégration (déclencheurs)

Émettre la création du contrat depuis les points de souscription existants :
ouverture de compte, décision d'octroi de crédit, création/adhésion tontine,
ouverture de carte de pointage, mise en place de versement automatique. Un événement
métier → un contrat `DRAFT` prêt à imprimer/signer.

### Signature & conformité

- Options : **signature manuscrite scannée**, **signature électronique**, ou
  **validation OTP** (l'app a déjà de l'OTP) horodatée.
- Conserver l'horodatage, l'auteur, et une empreinte du PDF signé (intégrité).
- Archivage inaltérable et rattachement au dossier client.

---

## 7. Priorisation suggérée (phasage)

1. **MVP (P0)** : moteur générique + Convention de compte, Contrat de prêt (avec tableau
   d'amortissement déjà existant), Règlement + adhésion tontine, Contrat de carte de
   pointage, socle KYC/consentement + grille tarifaire.
2. **Phase 2 (P1)** : mandats de prélèvement (épargne programmée, virements), mandat de
   transfert, avenants, quittances et mainlevées.
3. **Phase 3 (P2)** : CGU Mobile Money, signatures électroniques avancées, archivage légal
   renforcé.

---

## 8. Points de vigilance

- **Ne pas faire dans cette branche** : c'est une feature transverse ; elle mérite sa
  propre branche après le merge de la carte de pointage.
- **Immuabilité juridique** : ne jamais recalculer les termes d'un contrat signé à partir
  des tarifs courants — toujours lire le `termsSnapshot`.
- **Multi-tenant / marque blanche** : modèles et mentions légales par tenant.
- **Validation juridique** : faire relire les modèles par un juriste (CEMAC/COBAC, OHADA)
  avant production.
