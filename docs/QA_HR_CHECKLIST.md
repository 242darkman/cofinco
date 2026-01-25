# Module RH - Checklist QA Production

## 1. Base de données

### Tables créées
- [ ] `leave_balances` existe avec toutes les colonnes
- [ ] `hr_audit_log` existe avec toutes les colonnes
- [ ] `payroll_config` existe avec toutes les colonnes
- [ ] `horaires_travail` existe avec toutes les colonnes

### Index de performance
- [ ] `idx_leave_balances_employe` créé
- [ ] `idx_demandes_conges_employe` créé
- [ ] `idx_demandes_conges_statut` créé
- [ ] `idx_bulletins_paie_employe` créé
- [ ] `idx_bulletins_paie_mois` créé
- [ ] `idx_presences_employe_date` créé
- [ ] `idx_hr_audit_entity` créé
- [ ] `idx_hr_audit_date` créé

### Configuration initiale
- [ ] `payroll_config` global initialisé avec valeurs par défaut
- [ ] Soldes congés initialisés pour employés actifs (année courante)
- [ ] Fonctions SQL helper créées (`calculate_business_days`, `check_leave_overlap`, `get_leave_balance`)

---

## 2. Congés (Leave Management)

### Création de demande
- [ ] POST `/api/hr/conges` valide les champs obligatoires
- [ ] Validation: `dateFin >= dateDebut`
- [ ] Validation: Pas de chevauchement avec congés existants (PENDING/APPROVED)
- [ ] Validation: Solde suffisant pour congé annuel
- [ ] Jours en attente ajoutés à `leave_balances.pending`
- [ ] Direction auto-approuvée
- [ ] Audit log créé
- [ ] WebSocket event `hr:conge:created` émis

### Approbation
- [ ] PATCH `/api/hr/conges/:id/approve` vérifie permissions RBAC
- [ ] Vérification hiérarchie manager (subordonnés uniquement)
- [ ] Statut change de PENDING à APPROVED
- [ ] `leave_balances.used` incrémenté, `pending` décrémenté
- [ ] Audit log avec actor info
- [ ] WebSocket event `hr:conge:approved` émis

### Rejet
- [ ] PATCH `/api/hr/conges/:id/reject` exige un commentaire
- [ ] Statut change de PENDING à REJECTED
- [ ] `leave_balances.pending` décrémenté (jours libérés)
- [ ] Audit log avec severity 'warning'
- [ ] WebSocket event `hr:conge:rejected` émis

### Consultation solde
- [ ] GET `/api/hr/conges/balance/:employeId` retourne solde correct
- [ ] Calcul: `acquired + carryOver - used - pending`
- [ ] Historique multi-années disponible

---

## 3. Paie (Payroll)

### Configuration
- [ ] GET `/api/hr/paie/config` retourne config active
- [ ] Config globale utilisée si pas de config agence
- [ ] Taux CNSS configurables (employé/patronal)
- [ ] Tranches IPR configurables (JSON)
- [ ] Prime transport configurable

### Génération
- [ ] POST `/api/hr/paie/generate` valide format mois (YYYY-MM)
- [ ] Génération pour tous employés actifs
- [ ] Calcul salaire selon mode (MONTHLY/HOURLY/DAILY)
- [ ] Prime ancienneté calculée (2%/an, max 30%)
- [ ] Avantages employé inclus
- [ ] Heures supplémentaires calculées
- [ ] CNSS employé/patronal calculé
- [ ] IPR calculé selon tranches
- [ ] Bulletins créés en statut DRAFT
- [ ] Skip si bulletin existe déjà pour le mois
- [ ] WebSocket event `hr:paie:generated` émis

### Validation
- [ ] PATCH `/api/hr/paie/validate` change statut DRAFT → VALIDATED
- [ ] Bulk update supporté
- [ ] Audit log créé
- [ ] WebSocket event émis

### Paiement
- [ ] PATCH `/api/hr/paie/pay` change statut VALIDATED → PAID
- [ ] Date de paiement enregistrée
- [ ] Bulk update supporté
- [ ] Audit log avec severity 'critical'
- [ ] WebSocket event `hr:paie:paid` émis

### Calculs (vérifier avec exemples)
- [ ] Salaire 1,000,000 CDF mensuel:
  - Brut = 1,050,000 (avec transport 50k)
  - CNSS employé = 52,500 (5%)
  - Base imposable = 997,500
  - IPR = ~71,025 (selon tranches)
  - Net = ~926,475

---

## 4. Présence

### Pointage
- [ ] POST `/api/hr/presence/checkin` crée enregistrement présence
- [ ] POST `/api/hr/presence/checkout` met à jour heure départ
- [ ] Heures travaillées calculées automatiquement
- [ ] POST `/api/hr/presence/start-break` enregistre pause début
- [ ] POST `/api/hr/presence/end-break` enregistre pause fin
- [ ] WebSocket events émis

### Statistiques
- [ ] GET `/api/hr/presence/today` retourne stats du jour
- [ ] Comptage par statut (Présent, Absent, Retard, Congé, Mission)
- [ ] GET `/api/hr/presence/by-status/:status` retourne liste employés

---

## 5. Formations

### Performance (N+1 fix)
- [ ] GET `/api/hr/formations` utilise JOIN + GROUP BY
- [ ] Pas de requête par formation pour compter participants
- [ ] Pagination supportée

### Participants
- [ ] Validation capacité max avant ajout
- [ ] WebSocket events pour ajout/retrait participants

---

## 6. Audit Trail

### Logging
- [ ] Actions congés loggées (created, approved, rejected)
- [ ] Actions paie loggées (generated, validated, paid)
- [ ] Actions sanctions loggées
- [ ] Changements salaire loggés
- [ ] Actor info (userId, name, role) enregistré
- [ ] Diff old/new values calculé

### Consultation
- [ ] GET `/api/hr/audit` accessible (RBAC)
- [ ] Filtrage par entityType, entityId
- [ ] Pagination supportée

---

## 7. Temps Réel (WebSocket)

### Events émis
| Action | Event |
|--------|-------|
| Création congé | `hr:conge:created` |
| Approbation congé | `hr:conge:approved` |
| Rejet congé | `hr:conge:rejected` |
| Checkin présence | `hr:presence:checkin` |
| Checkout présence | `hr:presence:checkout` |
| Génération paie | `hr:paie:generated` |
| Validation paie | `hr:paie:validated` |
| Paiement paie | `hr:paie:paid` |
| Nouvelle formation | `hr:formation:created` |
| Nouvelle sanction | `hr:sanction:created` |

### Frontend
- [ ] `useHrRealtime` hook fonctionne
- [ ] Queries React Query invalidées automatiquement
- [ ] Indicateur sync affiché dans UI
- [ ] Cross-tab sync vérifié
- [ ] Reconnexion WebSocket après déconnexion

---

## 8. Permissions RBAC

### Endpoints protégés
- [ ] `/api/hr/conges` - `hr.conges.view`
- [ ] POST `/api/hr/conges` - `hr.conges.create`
- [ ] PATCH `/api/hr/conges/:id/approve` - `hr.conges.approve`
- [ ] PATCH `/api/hr/conges/:id/reject` - `hr.conges.reject`
- [ ] POST `/api/hr/paie/generate` - `hr.paie.generate`
- [ ] PATCH `/api/hr/paie/validate` - `hr.paie.validate`
- [ ] PATCH `/api/hr/paie/pay` - `hr.paie.pay`
- [ ] GET `/api/hr/audit` - `hr.audit.view`

### UI Components
- [ ] Boutons masqués si pas de permission
- [ ] Onglets masqués si pas de permission
- [ ] Actions masquées dynamiquement si permission révoquée

---

## 9. Interface Utilisateur

### CongesManager
- [ ] Indicateur sync (Wifi icon + status text)
- [ ] Carte solde congés affichée
- [ ] Calcul jours demandés en temps réel
- [ ] Erreur si solde insuffisant (client-side)
- [ ] Modal rejet avec commentaire obligatoire
- [ ] Stats cards compactes

### PaieManager (à vérifier)
- [ ] Workflow DRAFT → VALIDATED → PAID visible
- [ ] Export PDF fonctionne
- [ ] Historique bulletins consultable

### Général
- [ ] Vues compactes (moins de scroll)
- [ ] Mobile responsive
- [ ] Toast notifications pour events temps réel

---

## 10. Tests Automatisés

### Tests unitaires
- [ ] `calculateBusinessDays` - cas normaux et edge cases
- [ ] `calculateIPR` - toutes les tranches
- [ ] `calculateSeniorityBonus` - cap à 30%
- [ ] `validateLeaveRequest` - overlap, balance, dates

### Tests intégration (à ajouter)
- [ ] Workflow complet congé
- [ ] Workflow complet paie
- [ ] Concurrence (deux approbations simultanées)

---

## 11. Legacy Cleanup

### caissePin
- [ ] Colonne marquée DEPRECATED dans schema
- [ ] Pas d'UI pour modifier PIN dans module RH
- [ ] Migration vers `caisse_security_codes` documentée

---

## 12. Performance

### Queries
- [ ] Liste employés < 500ms (1000 employés)
- [ ] Liste congés < 200ms
- [ ] Génération paie < 30s (500 employés)
- [ ] Pas de N+1 queries (vérifier logs)

### Frontend
- [ ] Initial render < 1s
- [ ] Query cache utilisé
- [ ] Stale time configuré

---

## Scénarios de Test

### Scénario 1: Demande de congé complète
1. Employé crée demande congé 5 jours
2. Vérifier solde décrémenté (pending)
3. Manager approuve
4. Vérifier solde (used incrémenté, pending décrémenté)
5. Vérifier audit log

### Scénario 2: Congé refusé
1. Employé crée demande
2. Manager rejette avec commentaire
3. Vérifier solde restored (pending décrémenté)
4. Vérifier employé voit le commentaire

### Scénario 3: Chevauchement
1. Créer congé 15-20 janvier (approuvé)
2. Essayer de créer congé 18-25 janvier
3. Vérifier erreur OVERLAP retournée

### Scénario 4: Solde insuffisant
1. Employé avec 5 jours de solde
2. Demander 10 jours
3. Vérifier erreur INSUFFICIENT_BALANCE

### Scénario 5: Paie mensuelle
1. Générer paie pour mois courant
2. Vérifier tous les employés actifs ont un bulletin
3. Valider les bulletins
4. Marquer comme payés
5. Vérifier audit trail complet

### Scénario 6: Temps réel cross-tab
1. Ouvrir deux onglets sur page congés
2. Créer congé dans onglet 1
3. Vérifier onglet 2 mis à jour sans refresh

---

## Sign-Off

| Testeur | Date | Environnement | Statut |
|---------|------|---------------|--------|
|         |      |               |        |
|         |      |               |        |

## Notes

_Observations, bugs trouvés ou suggestions:_

---

## Historique des versions

| Version | Date | Changements |
|---------|------|-------------|
| 1.0     |      | Version initiale production-ready |
