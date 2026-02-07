import { db } from "@/db";
import { 
  creditInvestigations,
  agentActivities,
  investigationHistory,
  type CreditInvestigation,
  type AgentActivity,
  type InsertCreditInvestigation,
  type InsertAgentActivity,
  type InsertInvestigationHistory
} from "@shared/schema/credit-investigations";
import { demandesCredit } from "@shared/schema/finance";
import { clients } from "@shared/schema/clients";
import { users } from "@shared/schema/auth";
import { eq, and, or, desc, asc, isNull, gte, lte, sql } from "drizzle-orm";
import { 
  type AssignInvestigationRequest,
  type SubmitInvestigationRequest,
  type ReviewInvestigationRequest,
  type InvestigationWithDetails,
  type ActivityWithDetails,
  type InvestigationMetrics,
  type AgentPerformanceMetrics,
  type InvestigationAssignedEvent,
  type InvestigationSubmittedEvent,
  type InvestigationReviewedEvent,
  type OfflineInvestigationData,
  type SyncRequest,
  type SyncResponse
} from "@shared/types/credit-investigation.types";
import { NotificationService } from "./notification-service";
import { RealtimeService } from "./realtime-service";
import { logger } from "@/lib/logger";
import { MinioService } from "./minio-service";
import { EventEmitter } from "events";
import { CustomError } from "@/types/errors";

export class CreditInvestigationService extends EventEmitter {
  private notificationService: NotificationService;
  private realtimeService: RealtimeService;
  private minioService: MinioService;

  constructor() {
    super();
    this.notificationService = new NotificationService();
    this.realtimeService = new RealtimeService();
    this.minioService = new MinioService();
  }

  // ============================================
  // INVESTIGATION MANAGEMENT
  // ============================================

  /**
   * Create investigation when credit application is submitted
   */
  async createInvestigation(creditApplicationId: string, agenceId: string): Promise<CreditInvestigation> {
    try {
      // Get credit application details
      const [application] = await db
        .select()
        .from(demandesCredit)
        .where(eq(demandesCredit.id, creditApplicationId))
        .limit(1);

      if (!application) {
        throw new CustomError("Credit application not found", 404);
      }

      // Create investigation record
      const [investigation] = await db
        .insert(creditInvestigations)
        .values({
          creditApplicationId,
          clientId: application.clientId,
          agenceId,
          investigationStatus: "PENDING_ASSIGNMENT",
          requestedAmount: application.montantDemande,
          creditPurpose: application.objetCredit,
          repaymentFrequency: application.frequenceRemboursement,
          durationValue: application.dureeValeur,
          durationUnit: application.dureeUnite,
        })
        .returning();

      // Log history
      await this.logHistory(investigation.id, "CREATED", null, "PENDING_ASSIGNMENT", null, "System");

      logger.info(`Investigation created for credit application ${creditApplicationId}`);
      
      return investigation;
    } catch (error) {
      logger.error("Failed to create investigation", error);
      throw error;
    }
  }

  /**
   * Assign investigation to an agent
   */
  async assignInvestigation(
    request: AssignInvestigationRequest,
    assignedBy: string
  ): Promise<InvestigationWithDetails> {
    return await db.transaction(async (tx) => {
      try {
        // Get investigation
        const [investigation] = await tx
          .select()
          .from(creditInvestigations)
          .where(eq(creditInvestigations.id, request.investigationId))
          .limit(1);

        if (!investigation) {
          throw new CustomError("Investigation not found", 404);
        }

        if (investigation.investigationStatus !== "PENDING_ASSIGNMENT" && investigation.investigationStatus !== "ASSIGNED") {
          throw new CustomError("Investigation cannot be reassigned in current status", 400);
        }

        const previousStatus = investigation.investigationStatus;
        const previousAgentId = investigation.assignedAgentId;

        // Update investigation assignment
        const [updatedInvestigation] = await tx
          .update(creditInvestigations)
          .set({
            assignedAgentId: request.agentId,
            assignedAt: new Date(),
            assignedBy,
            investigationStatus: "ASSIGNED",
            updatedAt: new Date(),
          })
          .where(eq(creditInvestigations.id, request.investigationId))
          .returning();

        // Create agent activity
        const [activity] = await tx
          .insert(agentActivities)
          .values({
            assignedAgentId: request.agentId,
            agenceId: investigation.agenceId,
            activityType: "CREDIT_INVESTIGATION",
            referenceId: request.investigationId,
            referenceTable: "credit_investigations",
            title: `Enquête crédit - ${investigation.requestedAmount} FCFA`,
            description: request.notes || `Enquête pour demande de crédit de ${investigation.requestedAmount} FCFA`,
            priority: request.priority || "MEDIUM",
            dueDate: new Date(request.dueDate),
            status: "PENDING",
            assignedBy,
            assignedAt: new Date(),
            previousAgentId: previousAgentId || undefined,
          })
          .returning();

        // Log history
        await this.logHistoryTx(
          tx,
          request.investigationId,
          "ASSIGNED",
          previousStatus,
          "ASSIGNED",
          request.notes,
          assignedBy
        );

        // Get complete details
        const enqueteWithDetails = await this.getEnqueteWithDetails(request.investigationId, tx);

        // Send real-time notification to agent
        const assignedEvent: InvestigationAssignedEvent = {
          type: "INVESTIGATION_ASSIGNED",
          investigationId: request.investigationId,
          agentId: request.agentId,
          clientName: investigationWithDetails.client?.nom || "Unknown",
          requestedAmount: Number(investigation.requestedAmount),
          dueDate: request.dueDate,
          priority: request.priority || "MEDIUM",
        };

        await this.realtimeService.sendToUser(request.agentId, assignedEvent);

        // Create push notification
        await this.notificationService.createNotification({
          userId: request.agentId,
          type: "INVESTIGATION_ASSIGNED",
          title: "Nouvelle enquête assignée",
          message: `Une enquête crédit de ${investigation.requestedAmount} FCFA vous a été assignée`,
          data: {
            investigationId: request.investigationId,
            activityId: activity.id,
          },
        });

        logger.info(`Investigation ${request.investigationId} assigned to agent ${request.agentId}`);

        return investigationWithDetails;
      } catch (error) {
        logger.error("Failed to assign investigation", error);
        throw error;
      }
    });
  }

  /**
   * Submit investigation results
   */
  async submitInvestigation(
    investigationId: string,
    data: SubmitInvestigationRequest,
    agentId: string
  ): Promise<InvestigationWithDetails> {
    return await db.transaction(async (tx) => {
      try {
        // Verify agent is assigned
        const [investigation] = await tx
          .select()
          .from(creditInvestigations)
          .where(eq(creditInvestigations.id, investigationId))
          .limit(1);

        if (!investigation) {
          throw new CustomError("Investigation not found", 404);
        }

        if (investigation.assignedAgentId !== agentId) {
          throw new CustomError("You are not assigned to this investigation", 403);
        }

        if (investigation.investigationStatus !== "ASSIGNED" && investigation.investigationStatus !== "IN_PROGRESS") {
          throw new CustomError("Investigation cannot be submitted in current status", 400);
        }

        // Upload photos if provided
        let fieldPhotosData = data.fieldPhotos;
        if (fieldPhotosData && fieldPhotosData.length > 0) {
          fieldPhotosData = await this.uploadFieldPhotos(investigationId, fieldPhotosData);
        }

        // Update investigation with results
        const [updatedInvestigation] = await tx
          .update(creditInvestigations)
          .set({
            investigationStatus: "SUBMITTED",
            businessActivityVerified: data.businessActivityVerified,
            businessType: data.businessType,
            businessAge: data.businessAge,
            businessLocation: data.businessLocation,
            businessStability: data.businessStability,
            estimatedMonthlyIncome: String(data.estimatedMonthlyIncome),
            estimatedDailyIncome: data.estimatedDailyIncome ? String(data.estimatedDailyIncome) : null,
            incomeVerificationMethod: data.incomeVerificationMethod,
            incomeConsistency: data.incomeConsistency,
            householdSize: data.householdSize,
            dependents: data.dependents,
            housingType: data.housingType,
            monthlyExpenses: data.monthlyExpenses ? String(data.monthlyExpenses) : null,
            repaymentCapacityAssessment: String(data.repaymentCapacityAssessment),
            debtToIncomeRatio: data.debtToIncomeRatio ? String(data.debtToIncomeRatio) : null,
            existingLoans: data.existingLoans || [],
            collateralOffered: data.collateralOffered || [],
            guarantors: data.guarantors || [],
            references: data.references || [],
            riskLevel: data.riskLevel,
            riskFactors: data.riskFactors,
            agentRecommendation: data.agentRecommendation,
            recommendedAmount: data.recommendedAmount ? String(data.recommendedAmount) : null,
            agentComments: data.agentComments,
            fieldPhotos: fieldPhotosData || [],
            supportingDocuments: data.supportingDocuments || [],
            investigationLat: data.investigationLat ? String(data.investigationLat) : null,
            investigationLng: data.investigationLng ? String(data.investigationLng) : null,
            investigationAccuracy: data.investigationAccuracy ? String(data.investigationAccuracy) : null,
            investigationGeoTimestamp: data.investigationLat ? new Date() : null,
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(creditInvestigations.id, investigationId))
          .returning();

        // Update related activity
        await tx
          .update(agentActivities)
          .set({
            status: "COMPLETED",
            completedAt: new Date(),
            outcome: data.agentRecommendation,
            notes: data.agentComments,
            executionLat: data.investigationLat ? String(data.investigationLat) : null,
            executionLng: data.investigationLng ? String(data.investigationLng) : null,
            executionAccuracy: data.investigationAccuracy ? String(data.investigationAccuracy) : null,
            executionGeoTimestamp: data.investigationLat ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(agentActivities.referenceId, investigationId),
              eq(agentActivities.activityType, "CREDIT_INVESTIGATION")
            )
          );

        // Log history
        await this.logHistoryTx(
          tx,
          investigationId,
          "SUBMITTED",
          investigation.investigationStatus,
          "SUBMITTED",
          `Recommendation: ${data.agentRecommendation}`,
          agentId
        );

        // Get complete details
        const investigationWithDetails = await this.getInvestigationWithDetails(investigationId, tx);

        // Notify supervisors
        const submittedEvent: InvestigationSubmittedEvent = {
          type: "INVESTIGATION_SUBMITTED",
          investigationId,
          agentId,
          agentName: investigationWithDetails.assignedAgent?.nom || "Unknown",
          clientName: investigationWithDetails.client?.nom || "Unknown", 
          recommendation: data.agentRecommendation,
          riskLevel: data.riskLevel,
        };

        await this.realtimeService.sendToAgency(investigation.agenceId, submittedEvent);

        logger.info(`Investigation ${investigationId} submitted by agent ${agentId}`);

        return investigationWithDetails;
      } catch (error) {
        logger.error("Failed to submit investigation", error);
        throw error;
      }
    });
  }

  /**
   * Review investigation (supervisor action)
   */
  async reviewInvestigation(
    request: ReviewInvestigationRequest,
    reviewerId: string
  ): Promise<InvestigationWithDetails> {
    return await db.transaction(async (tx) => {
      try {
        const [investigation] = await tx
          .select()
          .from(creditInvestigations)
          .where(eq(creditInvestigations.id, request.investigationId))
          .limit(1);

        if (!investigation) {
          throw new CustomError("Investigation not found", 404);
        }

        if (investigation.investigationStatus !== "SUBMITTED") {
          throw new CustomError("Investigation must be submitted before review", 400);
        }

        const newStatus = request.approved ? "REVIEWED" : "ASSIGNED";

        // Update investigation
        const [updatedInvestigation] = await tx
          .update(creditInvestigations)
          .set({
            investigationStatus: newStatus,
            reviewedAt: new Date(),
            reviewedBy: reviewerId,
            supervisorNotes: request.supervisorNotes,
            requiresAdditionalInvestigation: request.requiresAdditionalInvestigation || false,
            additionalInvestigationReason: request.additionalInvestigationReason,
            updatedAt: new Date(),
          })
          .where(eq(creditInvestigations.id, request.investigationId))
          .returning();

        // If requires additional investigation, create new activity
        if (request.requiresAdditionalInvestigation && investigation.assignedAgentId) {
          await tx
            .insert(agentActivities)
            .values({
              assignedAgentId: investigation.assignedAgentId,
              agenceId: investigation.agenceId,
              activityType: "CREDIT_INVESTIGATION",
              referenceId: request.investigationId,
              referenceTable: "credit_investigations",
              title: "Enquête complémentaire requise",
              description: request.additionalInvestigationReason,
              priority: "HIGH",
              dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
              status: "PENDING",
              assignedBy: reviewerId,
              assignedAt: new Date(),
            });
        }

        // Log history
        await this.logHistoryTx(
          tx,
          request.investigationId,
          request.approved ? "APPROVED" : "REQUIRES_ADDITIONAL_INVESTIGATION",
          investigation.investigationStatus,
          newStatus,
          request.supervisorNotes,
          reviewerId
        );

        // Get complete details
        const enqueteWithDetails = await this.getEnqueteWithDetails(request.investigationId, tx);

        // Notify agent
        if (investigation.assignedAgentId) {
          const reviewedEvent: InvestigationReviewedEvent = {
            type: "INVESTIGATION_REVIEWED",
            investigationId: request.investigationId,
            reviewedBy: reviewerId,
            approved: request.approved,
            requiresAdditionalInvestigation: request.requiresAdditionalInvestigation || false,
          };

          await this.realtimeService.sendToUser(investigation.assignedAgentId, reviewedEvent);
        }

        logger.info(`Investigation ${request.investigationId} reviewed by ${reviewerId}`);

        return investigationWithDetails;
      } catch (error) {
        logger.error("Failed to review investigation", error);
        throw error;
      }
    });
  }

  // ============================================
  // ACTIVITY MANAGEMENT
  // ============================================

  /**
   * Get agent activities
   */
  async getAgentActivities(
    agentId: string,
    filters?: {
      status?: string;
      activityType?: string;
      fromDate?: Date;
      toDate?: Date;
    }
  ): Promise<ActivityWithDetails[]> {
    try {
      let query = db
        .select({
          activity: agentActivities,
          assignedAgent: users,
        })
        .from(agentActivities)
        .leftJoin(users, eq(agentActivities.assignedAgentId, users.id))
        .where(
          and(
            eq(agentActivities.assignedAgentId, agentId),
            isNull(agentActivities.deletedAt)
          )
        );

      // Apply filters
      const conditions: any[] = [
        eq(agentActivities.assignedAgentId, agentId),
        isNull(agentActivities.deletedAt),
      ];

      if (filters?.status) {
        conditions.push(eq(agentActivities.status, filters.status as any));
      }

      if (filters?.activityType) {
        conditions.push(eq(agentActivities.activityType, filters.activityType as any));
      }

      if (filters?.fromDate) {
        conditions.push(gte(agentActivities.dueDate, filters.fromDate));
      }

      if (filters?.toDate) {
        conditions.push(lte(agentActivities.dueDate, filters.toDate));
      }

      const results = await db
        .select({
          activity: agentActivities,
          assignedAgent: users,
        })
        .from(agentActivities)
        .leftJoin(users, eq(agentActivities.assignedAgentId, users.id))
        .where(and(...conditions))
        .orderBy(asc(agentActivities.dueDate));

      return results.map(r => ({
        ...r.activity,
        assignedAgent: r.assignedAgent || undefined,
      }));
    } catch (error) {
      logger.error("Failed to get agent activities", error);
      throw error;
    }
  }

  /**
   * Update activity status
   */
  async updateActivityStatus(
    activityId: string,
    status: string,
    agentId: string,
    data?: {
      outcome?: string;
      notes?: string;
      executionLat?: number;
      executionLng?: number;
    }
  ): Promise<AgentActivity> {
    try {
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === "IN_PROGRESS") {
        updateData.startedAt = new Date();
      } else if (status === "COMPLETED") {
        updateData.completedAt = new Date();
      } else if (status === "CANCELLED") {
        updateData.cancelledAt = new Date();
      }

      if (data) {
        if (data.outcome) updateData.outcome = data.outcome;
        if (data.notes) updateData.notes = data.notes;
        if (data.executionLat) {
          updateData.executionLat = String(data.executionLat);
          updateData.executionLng = String(data.executionLng);
          updateData.executionGeoTimestamp = new Date();
        }
      }

      const [updated] = await db
        .update(agentActivities)
        .set(updateData)
        .where(
          and(
            eq(agentActivities.id, activityId),
            eq(agentActivities.assignedAgentId, agentId)
          )
        )
        .returning();

      if (!updated) {
        throw new CustomError("Activity not found or not assigned to you", 404);
      }

      // If activity is investigation-related, update investigation status
      if (updated.activityType === "CREDIT_INVESTIGATION" && updated.referenceId) {
        if (status === "IN_PROGRESS") {
          await db
            .update(creditInvestigations)
            .set({
              investigationStatus: "IN_PROGRESS",
              startedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(creditInvestigations.id, updated.referenceId));
        }
      }

      return updated;
    } catch (error) {
      logger.error("Failed to update activity status", error);
      throw error;
    }
  }

  // ============================================
  // OFFLINE SYNC
  // ============================================

  /**
   * Sync offline data
   */
  async syncOfflineData(syncRequest: SyncRequest): Promise<SyncResponse> {
    const response: SyncResponse = {
      syncedInvestigations: [],
      syncedActivities: [],
      newAssignments: [],
      updatedActivities: [],
      serverTimestamp: new Date().toISOString(),
    };

    // Process offline investigations
    for (const offlineData of syncRequest.investigations) {
      try {
        // Upload photos
        const uploadedPhotos = await this.uploadOfflinePhotos(offlineData.photos);

        // Submit investigation
        const investigation = await this.submitInvestigation(
          offlineData.investigation.investigationId!,
          {
            ...offlineData.investigation,
            fieldPhotos: uploadedPhotos,
          } as SubmitInvestigationRequest,
          syncRequest.deviceId
        );

        response.syncedInvestigations.push({
          tempId: offlineData.tempId,
          serverId: investigation.id,
          status: "success",
        });
      } catch (error: any) {
        response.syncedInvestigations.push({
          tempId: offlineData.tempId,
          serverId: "",
          status: "error",
          error: error.message,
        });
      }
    }

    // Process offline activities
    for (const offlineData of syncRequest.activities) {
      try {
        const activity = await this.updateActivityStatus(
          offlineData.activity.activityId!,
          offlineData.activity.status || "COMPLETED",
          syncRequest.deviceId,
          offlineData.activity as any
        );

        response.syncedActivities.push({
          tempId: offlineData.tempId,
          serverId: activity.id,
          status: "success",
        });
      } catch (error: any) {
        response.syncedActivities.push({
          tempId: offlineData.tempId,
          serverId: "",
          status: "error",
          error: error.message,
        });
      }
    }

    // Get new assignments since last sync
    const lastSync = new Date(syncRequest.lastSyncTimestamp);
    
    response.newAssignments = await this.getInvestigationsAssignedSince(
      syncRequest.deviceId,
      lastSync
    );

    response.updatedActivities = await this.getActivitiesUpdatedSince(
      syncRequest.deviceId,
      lastSync
    );

    return response;
  }

  // ============================================
  // METRICS & REPORTING
  // ============================================

  /**
   * Get investigation metrics
   */
  async getInvestigationMetrics(agenceId?: string): Promise<InvestigationMetrics> {
    try {
      const conditions: any[] = [isNull(creditInvestigations.deletedAt)];
      
      if (agenceId) {
        conditions.push(eq(creditInvestigations.agenceId, agenceId));
      }

      // Get counts by status
      const statusCounts = await db
        .select({
          status: creditInvestigations.investigationStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(creditInvestigations)
        .where(and(...conditions))
        .groupBy(creditInvestigations.investigationStatus);

      // Get counts by risk level
      const riskCounts = await db
        .select({
          riskLevel: creditInvestigations.riskLevel,
          count: sql<number>`count(*)::int`,
        })
        .from(creditInvestigations)
        .where(
          and(
            ...conditions,
            sql`${creditInvestigations.riskLevel} IS NOT NULL`
          )
        )
        .groupBy(creditInvestigations.riskLevel);

      // Get counts by recommendation
      const recommendationCounts = await db
        .select({
          recommendation: creditInvestigations.agentRecommendation,
          count: sql<number>`count(*)::int`,
        })
        .from(creditInvestigations)
        .where(
          and(
            ...conditions,
            sql`${creditInvestigations.agentRecommendation} IS NOT NULL`
          )
        )
        .groupBy(creditInvestigations.agentRecommendation);

      // Calculate average completion time
      const [avgTime] = await db
        .select({
          avgHours: sql<number>`AVG(EXTRACT(EPOCH FROM (${creditInvestigations.submittedAt} - ${creditInvestigations.assignedAt}))/3600)::float`,
        })
        .from(creditInvestigations)
        .where(
          and(
            ...conditions,
            sql`${creditInvestigations.submittedAt} IS NOT NULL`,
            sql`${creditInvestigations.assignedAt} IS NOT NULL`
          )
        );

      // Calculate approval rate
      const approvedCount = statusCounts.find(s => s.status === "REVIEWED")?.count || 0;
      const totalCompleted = statusCounts
        .filter(s => ["REVIEWED", "CLOSED"].includes(s.status))
        .reduce((sum, s) => sum + s.count, 0);

      const metrics: InvestigationMetrics = {
        totalInvestigations: statusCounts.reduce((sum, s) => sum + s.count, 0),
        pendingAssignment: statusCounts.find(s => s.status === "PENDING_ASSIGNMENT")?.count || 0,
        inProgress: statusCounts.find(s => s.status === "IN_PROGRESS")?.count || 0,
        completed: totalCompleted,
        averageCompletionTime: avgTime?.avgHours || 0,
        approvalRate: totalCompleted > 0 ? (approvedCount / totalCompleted) * 100 : 0,
        byRiskLevel: riskCounts.reduce((acc, r) => {
          if (r.riskLevel) acc[r.riskLevel as any] = r.count;
          return acc;
        }, {} as any),
        byRecommendation: recommendationCounts.reduce((acc, r) => {
          if (r.recommendation) acc[r.recommendation as any] = r.count;
          return acc;
        }, {} as any),
      };

      return metrics;
    } catch (error) {
      logger.error("Failed to get investigation metrics", error);
      throw error;
    }
  }

  /**
   * Get agent performance metrics
   */
  async getAgentPerformanceMetrics(
    agentId: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<AgentPerformanceMetrics> {
    try {
      const conditions: any[] = [
        eq(creditInvestigations.assignedAgentId, agentId),
        isNull(creditInvestigations.deletedAt),
      ];

      if (fromDate) {
        conditions.push(gte(creditInvestigations.assignedAt, fromDate));
      }

      if (toDate) {
        conditions.push(lte(creditInvestigations.assignedAt, toDate));
      }

      // Get agent details
      const [agent] = await db
        .select()
        .from(users)
        .where(eq(users.id, agentId))
        .limit(1);

      // Get investigation counts
      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          completed: sql<number>`count(case when ${creditInvestigations.investigationStatus} IN ('SUBMITTED', 'REVIEWED', 'CLOSED') then 1 end)::int`,
          onTime: sql<number>`count(case when ${creditInvestigations.submittedAt} <= ${creditInvestigations.assignedAt} + interval '48 hours' then 1 end)::int`,
        })
        .from(creditInvestigations)
        .where(and(...conditions));

      // Get average completion time
      const [avgTime] = await db
        .select({
          avgHours: sql<number>`AVG(EXTRACT(EPOCH FROM (${creditInvestigations.submittedAt} - ${creditInvestigations.assignedAt}))/3600)::float`,
        })
        .from(creditInvestigations)
        .where(
          and(
            ...conditions,
            sql`${creditInvestigations.submittedAt} IS NOT NULL`
          )
        );

      // Get customer satisfaction average
      const [satisfaction] = await db
        .select({
          avgSatisfaction: sql<number>`AVG(${agentActivities.customerSatisfaction})::float`,
        })
        .from(agentActivities)
        .where(
          and(
            eq(agentActivities.assignedAgentId, agentId),
            sql`${agentActivities.customerSatisfaction} IS NOT NULL`
          )
        );

      const metrics: AgentPerformanceMetrics = {
        agentId,
        agentName: agent?.nom || "Unknown",
        totalInvestigations: counts?.total || 0,
        completedInvestigations: counts?.completed || 0,
        averageCompletionTime: avgTime?.avgHours || 0,
        onTimeCompletionRate: counts?.total > 0 ? ((counts?.onTime || 0) / counts.total) * 100 : 0,
        accuracyScore: 85, // TODO: Calculate based on supervisor reviews
        customerSatisfactionAverage: satisfaction?.avgSatisfaction || 0,
        recommendationAccuracy: 75, // TODO: Calculate based on final credit decisions
      };

      return metrics;
    } catch (error) {
      logger.error("Failed to get agent performance metrics", error);
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getInvestigationWithDetails(
    investigationId: string,
    tx?: any
  ): Promise<InvestigationWithDetails> {
    const database = tx || db;
    
    const [result] = await database
      .select({
        investigation: creditInvestigations,
        client: clients,
        assignedAgent: users,
        creditApplication: demandesCredit,
      })
      .from(creditInvestigations)
      .leftJoin(clients, eq(creditInvestigations.clientId, clients.id))
      .leftJoin(users, eq(creditInvestigations.assignedAgentId, users.id))
      .leftJoin(demandesCredit, eq(creditInvestigations.creditApplicationId, demandesCredit.id))
      .where(eq(creditInvestigations.id, investigationId))
      .limit(1);

    return {
      ...result.investigation,
      client: result.client || undefined,
      assignedAgent: result.assignedAgent || undefined,
      creditApplication: result.creditApplication || undefined,
    };
  }

  private async logHistory(
    investigationId: string,
    action: string,
    previousStatus: any,
    newStatus: any,
    comment: string | null,
    performedBy: string
  ) {
    await db.insert(investigationHistory).values({
      investigationId,
      action,
      previousStatus,
      newStatus,
      comment,
      performedBy,
    });
  }

  private async logHistoryTx(
    tx: any,
    investigationId: string,
    action: string,
    previousStatus: any,
    newStatus: any,
    comment: string | null,
    performedBy: string
  ) {
    await tx.insert(investigationHistory).values({
      investigationId,
      action,
      previousStatus,
      newStatus,
      comment,
      performedBy,
    });
  }

  private async uploadFieldPhotos(
    investigationId: string,
    photos: Array<{ url: string; description: string; timestamp: string }>
  ) {
    // TODO: Implement photo upload to MinIO
    // For now, return as-is
    return photos;
  }

  private async uploadOfflinePhotos(
    photos: Array<{ tempId: string; base64: string; description: string }>
  ) {
    // TODO: Implement offline photo upload
    return [];
  }

  private async getInvestigationsAssignedSince(
    agentId: string,
    since: Date
  ): Promise<InvestigationWithDetails[]> {
    // TODO: Implement
    return [];
  }

  private async getActivitiesUpdatedSince(
    agentId: string,
    since: Date
  ): Promise<ActivityWithDetails[]> {
    // TODO: Implement
    return [];
  }
}

export const creditInvestigationService = new CreditInvestigationService();