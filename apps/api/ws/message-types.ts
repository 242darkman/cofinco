/**
 * Catalogue des messages WebSocket temps réel (`GlobalMessage`).
 *
 * SOURCE UNIQUE DE VÉRITÉ côté serveur — synchronisée avec
 * `apps/web/src/contexts/WebSocketContext.tsx`. Extrait de `ws-server.ts`
 * pour rester maintenable : ajouter un type d'événement = une ligne ici,
 * sans toucher au serveur. Ré-exporté par `ws-server.ts` (imports inchangés).
 */

export type GlobalMessage = {
  type:
    // =============================================
    // MESSAGERIE
    // =============================================
    // V1 - saisie encore utilisée pour les conversations directes.
    | "TYPING" | "READ_RECEIPT"
    // V2 - Conversations (routes/conversations.ts)
    | "CHAT_MESSAGE_V2" | "TYPING_V2" | "READ_UPDATE"
    | "CONVERSATION_UPDATE" | "MESSAGE_REACTION" | "MESSAGE_DELETED" | "MESSAGE_EDITED"
    | "SUBSCRIBE_CONVERSATION" | "UNSUBSCRIBE_CONVERSATION"
    | "SUBSCRIBED_CONVERSATION" | "UNSUBSCRIBED_CONVERSATION"

    // =============================================
    // SYSTÈME & NOTIFICATIONS
    // =============================================
    | "NOTIFICATION" | "PRESENCE" | "PRESENCE_UPDATE" | "ONLINE_USERS_LIST" | "DASHBOARD_UPDATE"
    | "LIVE_ACTIVITY" | "REALTIME_EVENT"
    | "SUBSCRIBED" | "UNSUBSCRIBED"

    // =============================================
    // MODULES MÉTIER
    // =============================================
    | "CREDIT_UPDATE" | "CLIENT_UPDATE" | "COMPTE_UPDATE"
    | "CAISSE_UPDATE" | "TONTINE_UPDATE" | "CARTE_POINTAGE_UPDATE" | "OPERATIONS_UPDATE"
    | "EMPLOYE_UPDATE" | "AGENCE_UPDATE" | "HR_UPDATE"
    | "ACCOUNTING_UPDATE" | "LIQUIDITY_CHANGED" | "SCORE_UPDATED"
    | "SETTINGS_UPDATE" | "RBAC_UPDATE"
    | "PRESETS_CHANGED"
    | "AGENT_MODULES_UPDATE"
    | "SESSION_AGENT_UPDATE"

    // =============================================
    // LOCALISATION (Agents terrain)
    // =============================================
    | "LOCATION_UPDATE" | "USER_LOCATION"

    // =============================================
    // SESSIONS & SÉCURITÉ
    // =============================================
    | "SESSION_TIMEOUT" | "SESSION_FORCE_CLOSED" | "SESSION_RISK_ALERT"
    | "SESSION_INVALID" | "MAINTENANCE_UPDATE" | "FORCE_LOGOUT"

    // =============================================
    // COFFRE-FORT
    // =============================================
    | "OPENING_REQUEST_CREATED" | "OPENING_REQUEST_VALIDATED" | "OPENING_REQUEST_REJECTED"
    | "REFUND_PENDING_CAISSE" | "REFUND_PAID"

    // =============================================
    // DEMANDES CAISSE (file centralisée)
    // =============================================
    | "CAISSE_REQUEST_CREATED" | "CAISSE_REQUEST_COMPLETED" | "CAISSE_REQUEST_CANCELLED"

    // =============================================
    // BALANCE & RÉCONCILIATION
    // =============================================
    | "BALANCE_UPDATED"
    | "BALANCE_ALERT" | "RECONCILIATION_COMPLETE" | "RECONCILIATION_ERROR"

    // =============================================
    // GARDE GL - OUVERTURE CAISSE SÉCURISÉE
    // =============================================
    | "CAISSE_OPENING_BLOCKED"        // Ouverture bloquée pour écart GL
    | "CAISSE_OPENING_WITH_ECART"     // Ouverture autorisée avec écart (justifiée ou journalisée uniquement)

    // =============================================
    // MONITORING FINANCIER & ALERTES
    // =============================================
    | "MONITORING_ALERT" | "MONITORING_ALERT_UPDATED" | "MONITORING_ALERT_DISMISSED"
    | "MONITORING_DASHBOARD" | "ALERT_CREATED"

    // =============================================
    // RAPPELS ET PLANIFICATIONS
    // =============================================
    | "SCHEDULE_UPDATED"

    // =============================================
    // VIREMENTS PROGRAMMÉS
    // =============================================
    | "SCHEDULED_TRANSFER_UPDATED" | "SCHEDULED_TRANSFER_EXECUTED"
    | "SCHEDULED_TRANSFERS_BATCH_COMPLETED"

    // =============================================
    // CRÉDITS & REMBOURSEMENTS
    // =============================================
    | "CREDIT_REPAYMENT_CREATED" | "CREDIT_SCHEDULE_UPDATED" | "CREDIT_BALANCE_UPDATED"
    | "REPAYMENT_ALLOCATED" | "REPAYMENT_REVERSED"

    // =============================================
    // TRÉSORERIE — RÉCONCILIATION
    // =============================================
    | "TREASURY_RECONCILIATION_ALERT" | "TREASURY_RECONCILIATION_COMPLETE"

    // =============================================
    // AUDIT & INTÉGRITÉ
    // =============================================
    | "INTEGRITY_AUDIT_ALERT"

    // =============================================
    // TRANSFERTS INTER-COFFRES
    // =============================================
    | "TRANSFERT_COFFRE_UPDATED"

    // =============================================
    // MIGRATION D'AGENCE
    // =============================================
    | "MIGRATION_PROGRESS" | "MIGRATION_STATUS"

    // =============================================
    // ÉCARTS DE CAISSE — APPROBATION
    // =============================================
    | "ECART_APPROVAL_REQUEST" | "ECART_APPROVAL_DECISION"

    // =============================================
    // RÉÉVALUATIONS CRÉDIT
    // =============================================
    | "REEVALUATION_UPDATE";

  payload: any;
};
