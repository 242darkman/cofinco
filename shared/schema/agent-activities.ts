import { pgTable, text, integer, numeric, boolean, timestamp, uuid, json, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";
import { agences } from "./agences";
import { 
  activityTypeEnum, 
  activityPriorityEnum,
  activityStatusEnum
} from "@shared/enum/enums";

// ============================================
// AGENT ACTIVITIES (ACTIVITÉS AGENT GÉNÉRIQUES)
// ============================================

export const agentActivities = pgTable(
  "agent_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    // Agent assigné
    assignedAgentId: uuid("assigned_agent_id").notNull().references(() => users.id),
    agenceId: uuid("agence_id").notNull().references(() => agences.id),
    
    // Type et référence
    activityType: activityTypeEnum("activity_type").notNull(),
    referenceId: uuid("reference_id"), // ID de l'entité liée (prospect, enquete_credit, etc.)
    referenceTable: text("reference_table"), // Table de référence
    
    // Détails de l'activité
    title: text("title").notNull(),
    description: text("description"),
    
    // Priorité et échéance
    priority: activityPriorityEnum("priority").notNull().default("MEDIUM"),
    dueDate: timestamp("due_date").notNull(),
    reminderDate: timestamp("reminder_date"),
    
    // Statut
    status: activityStatusEnum("status").notNull().default("PENDING"),
    
    // Localisation prévue
    plannedLocation: text("planned_location"),
    plannedLat: numeric("planned_lat"),
    plannedLng: numeric("planned_lng"),
    
    // Exécution
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    
    // Résultat
    outcome: text("outcome"),
    notes: text("notes"),
    attachments: jsonb("attachments"), // [{type, url, description}]
    
    // Géolocalisation de l'exécution
    executionLat: numeric("execution_lat"),
    executionLng: numeric("execution_lng"),
    executionAccuracy: numeric("execution_accuracy"),
    executionGeoTimestamp: timestamp("execution_geo_timestamp"),
    
    // Durée et distance
    durationMinutes: integer("duration_minutes"),
    distanceKm: numeric("distance_km"),
    
    // Assignation
    assignedBy: uuid("assigned_by").notNull().references(() => users.id),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
    
    // Réassignation
    previousAgentId: uuid("previous_agent_id").references(() => users.id),
    reassignedAt: timestamp("reassigned_at"),
    reassignmentReason: text("reassignment_reason"),
    
    // Notification
    notificationSent: boolean("notification_sent").default(false),
    notificationSentAt: timestamp("notification_sent_at"),
    notificationRead: boolean("notification_read").default(false),
    notificationReadAt: timestamp("notification_read_at"),
    
    // Offline sync
    offlineCreated: boolean("offline_created").default(false),
    offlineSyncedAt: timestamp("offline_synced_at"),
    deviceId: text("device_id"),
    
    // Métriques
    customerSatisfaction: integer("customer_satisfaction"), // 1-5
    performanceScore: integer("performance_score"), // 0-100
    
    // Métadonnées
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    // Index pour recherche par agent
    idxAgent: index("idx_activity_agent").on(t.assignedAgentId),
    
    // Index pour recherche par statut
    idxStatus: index("idx_activity_status").on(t.status),
    
    // Index composite agent + statut (dashboard agent)
    idxAgentStatus: index("idx_activity_agent_status").on(t.assignedAgentId, t.status),
    
    // Index pour les activités à venir
    idxAgentDue: index("idx_activity_agent_due").on(t.assignedAgentId, t.dueDate),
    
    // Index pour la référence
    idxReference: index("idx_activity_reference").on(t.referenceTable, t.referenceId),
    
    // Index pour le type d'activité
    idxType: index("idx_activity_type").on(t.activityType),
    
    // Index pour les notifications non lues
    idxUnreadNotifications: index("idx_activity_unread_notif").on(t.assignedAgentId, t.notificationRead),
    
    // Index pour l'agence
    idxAgence: index("idx_activity_agence").on(t.agenceId),
    
    // Index pour les activités en retard
    idxOverdue: index("idx_activity_overdue").on(t.status, t.dueDate),
    
    // Index pour soft delete
    idxDeletedAt: index("idx_activity_deleted_at").on(t.deletedAt),
    
    // Index pour sync offline
    idxOfflineSync: index("idx_activity_offline_sync").on(t.offlineCreated, t.offlineSyncedAt),
  }),
);

// ============================================
// ACTIVITY HISTORY (AUDIT TRAIL)
// ============================================

export const activityHistory = pgTable(
  "activity_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    
    activityId: uuid("activity_id").notNull().references(() => agentActivities.id),
    
    action: text("action").notNull(), // CREATED, ASSIGNED, STARTED, COMPLETED, CANCELLED, etc.
    previousStatus: activityStatusEnum("previous_status"),
    newStatus: activityStatusEnum("new_status"),
    
    fieldChanges: jsonb("field_changes"), // {field: {old, new}}
    
    comment: text("comment"),
    
    performedBy: uuid("performed_by").notNull().references(() => users.id),
    performedAt: timestamp("performed_at").notNull().defaultNow(),
    
    // Géolocalisation de l'action
    actionLat: numeric("action_lat"),
    actionLng: numeric("action_lng"),
    actionAccuracy: numeric("action_accuracy"),
    
    deviceInfo: jsonb("device_info"), // {type, os, browser, ip}
  },
  (t) => ({
    idxActivity: index("idx_activity_history_activity").on(t.activityId),
    idxPerformedBy: index("idx_activity_history_performed_by").on(t.performedBy),
    idxPerformedAt: index("idx_activity_history_performed_at").on(t.performedAt),
  }),
);

// ============================================
// TYPES ET SCHEMAS ZOD
// ============================================

// Agent Activity Schema
export const insertAgentActivitySchema = createInsertSchema(agentActivities)
  .omit({ 
    id: true, 
    createdAt: true, 
    updatedAt: true, 
    deletedAt: true 
  })
  .extend({
    plannedLat: z.coerce.string().optional().nullable(),
    plannedLng: z.coerce.string().optional().nullable(),
    executionLat: z.coerce.string().optional().nullable(),
    executionLng: z.coerce.string().optional().nullable(),
  });

export type InsertAgentActivity = z.infer<typeof insertAgentActivitySchema>;
export type AgentActivity = typeof agentActivities.$inferSelect;

// Activity History Schema  
export const insertActivityHistorySchema = createInsertSchema(activityHistory)
  .omit({ 
    id: true,
    performedAt: true 
  });

export type InsertActivityHistory = z.infer<typeof insertActivityHistorySchema>;
export type ActivityHistory = typeof activityHistory.$inferSelect;