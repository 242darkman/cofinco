import { Router } from "express";
import { requireAuth } from "@/middleware/auth";
import { checkPermission } from "@/middleware/permissions";
import { validateRequest } from "@/middleware/validation";
import { creditInvestigationService } from "@/services/credit-investigation-service";
import { 
  AssignInvestigationRequest,
  SubmitInvestigationRequest,
  ReviewInvestigationRequest,
  CreateActivityRequest,
  UpdateActivityRequest,
  ReassignActivityRequest,
  SyncRequest
} from "@shared/types/credit-investigation.types";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { upload } from "@/middleware/upload";
import multer from "multer";

const router = Router();

// ============================================
// INVESTIGATION ROUTES
// ============================================

/**
 * Get all investigations (with filters)
 */
router.get(
  "/investigations",
  requireAuth,
  checkPermission("read", "Investigation"),
  async (req, res) => {
    try {
      const { status, agentId, agenceId, fromDate, toDate, page = 1, limit = 20 } = req.query;
      
      // Build filter conditions based on user role
      const filters: any = {};
      
      if (status) filters.status = status;
      if (agentId) filters.agentId = agentId;
      
      // Agents can only see their own investigations
      if (req.user?.role === "agent_terrain") {
        filters.agentId = req.user.id;
      }
      
      // Agency-level filtering
      if (agenceId || req.user?.agenceId) {
        filters.agenceId = agenceId || req.user.agenceId;
      }
      
      if (fromDate) filters.fromDate = new Date(fromDate as string);
      if (toDate) filters.toDate = new Date(toDate as string);

      const investigations = await creditInvestigationService.getInvestigations(
        filters,
        Number(page),
        Number(limit)
      );

      res.json({
        success: true,
        data: investigations,
        page: Number(page),
        limit: Number(limit),
      });
    } catch (error: any) {
      logger.error("Failed to fetch investigations", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch investigations",
      });
    }
  }
);

/**
 * Get single investigation details
 */
router.get(
  "/investigations/:id",
  requireAuth,
  checkPermission("read", "Investigation"),
  async (req, res) => {
    try {
      const investigation = await creditInvestigationService.getInvestigationDetails(
        req.params.id
      );

      // Check access rights
      if (req.user?.role === "agent_terrain" && investigation.assignedAgentId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to view this investigation",
        });
      }

      res.json({
        success: true,
        data: investigation,
      });
    } catch (error: any) {
      logger.error("Failed to fetch investigation", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch investigation",
      });
    }
  }
);

/**
 * Assign investigation to agent
 */
const assignInvestigationSchema = z.object({
  investigationId: z.string().uuid(),
  agentId: z.string().uuid(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  dueDate: z.string(),
  notes: z.string().optional(),
});

router.post(
  "/investigations/assign",
  requireAuth,
  checkPermission("update", "Investigation"),
  validateRequest(assignInvestigationSchema),
  async (req, res) => {
    try {
      const investigation = await creditInvestigationService.assignInvestigation(
        req.body as AssignInvestigationRequest,
        req.user!.id
      );

      res.json({
        success: true,
        data: investigation,
        message: "Investigation assigned successfully",
      });
    } catch (error: any) {
      logger.error("Failed to assign investigation", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to assign investigation",
      });
    }
  }
);

/**
 * Submit investigation results (agent)
 */
const submitInvestigationSchema = z.object({
  businessActivityVerified: z.boolean(),
  businessType: z.string().optional(),
  businessAge: z.number().optional(),
  businessLocation: z.string().optional(),
  businessStability: z.string().optional(),
  estimatedMonthlyIncome: z.number(),
  estimatedDailyIncome: z.number().optional(),
  incomeVerificationMethod: z.string(),
  incomeConsistency: z.string(),
  householdSize: z.number().optional(),
  dependents: z.number().optional(),
  housingType: z.string().optional(),
  monthlyExpenses: z.number().optional(),
  repaymentCapacityAssessment: z.number(),
  debtToIncomeRatio: z.number().optional(),
  existingLoans: z.array(z.object({
    institution: z.string(),
    amount: z.number(),
    monthlyPayment: z.number(),
  })).optional(),
  collateralOffered: z.array(z.object({
    type: z.string(),
    description: z.string(),
    estimatedValue: z.number(),
  })).optional(),
  guarantors: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phoneNumber: z.string(),
    incomeLevel: z.string().optional(),
  })).optional(),
  references: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phoneNumber: z.string(),
  })).optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"]),
  riskFactors: z.array(z.string()).optional(),
  agentRecommendation: z.enum(["APPROVE", "APPROVE_WITH_CAUTION", "REDUCE_AMOUNT", "REJECT"]),
  recommendedAmount: z.number().optional(),
  agentComments: z.string().optional(),
  investigationLat: z.number().optional(),
  investigationLng: z.number().optional(),
  investigationAccuracy: z.number().optional(),
});

router.post(
  "/investigations/:id/submit",
  requireAuth,
  checkPermission("update", "Investigation"),
  validateRequest(submitInvestigationSchema),
  async (req, res) => {
    try {
      const investigation = await creditInvestigationService.submitInvestigation(
        req.params.id,
        req.body as SubmitInvestigationRequest,
        req.user!.id
      );

      res.json({
        success: true,
        data: investigation,
        message: "Investigation submitted successfully",
      });
    } catch (error: any) {
      logger.error("Failed to submit investigation", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to submit investigation",
      });
    }
  }
);

/**
 * Review investigation (supervisor)
 */
const reviewInvestigationSchema = z.object({
  approved: z.boolean(),
  supervisorNotes: z.string().optional(),
  requiresAdditionalInvestigation: z.boolean().optional(),
  additionalInvestigationReason: z.string().optional(),
});

router.post(
  "/investigations/:id/review",
  requireAuth,
  checkPermission("approve", "Investigation"),
  validateRequest(reviewInvestigationSchema),
  async (req, res) => {
    try {
      const investigation = await creditInvestigationService.reviewInvestigation(
        {
          investigationId: req.params.id,
          ...req.body,
        } as ReviewInvestigationRequest,
        req.user!.id
      );

      res.json({
        success: true,
        data: investigation,
        message: "Investigation reviewed successfully",
      });
    } catch (error: any) {
      logger.error("Failed to review investigation", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to review investigation",
      });
    }
  }
);

/**
 * Upload investigation photos
 */
router.post(
  "/investigations/:id/photos",
  requireAuth,
  checkPermission("update", "Investigation"),
  upload.array("photos", 10),
  async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No photos provided",
        });
      }

      const photos = await creditInvestigationService.uploadInvestigationPhotos(
        req.params.id,
        files,
        req.user!.id
      );

      res.json({
        success: true,
        data: photos,
        message: "Photos uploaded successfully",
      });
    } catch (error: any) {
      logger.error("Failed to upload photos", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to upload photos",
      });
    }
  }
);

// ============================================
// ACTIVITY ROUTES
// ============================================

/**
 * Get agent activities
 */
router.get(
  "/activities",
  requireAuth,
  async (req, res) => {
    try {
      const { status, activityType, fromDate, toDate } = req.query;
      
      const filters: any = {};
      if (status) filters.status = status;
      if (activityType) filters.activityType = activityType;
      if (fromDate) filters.fromDate = new Date(fromDate as string);
      if (toDate) filters.toDate = new Date(toDate as string);

      const activities = await creditInvestigationService.getAgentActivities(
        req.user!.id,
        filters
      );

      res.json({
        success: true,
        data: activities,
      });
    } catch (error: any) {
      logger.error("Failed to fetch activities", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch activities",
      });
    }
  }
);

/**
 * Create activity
 */
const createActivitySchema = z.object({
  agentId: z.string().uuid(),
  activityType: z.enum(["PROSPECTION", "CREDIT_INVESTIGATION", "COLLECTION", "CLIENT_VISIT", "DOCUMENT_PICKUP", "OTHER"]),
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.string(),
  referenceId: z.string().uuid().optional(),
  referenceTable: z.string().optional(),
  plannedLocation: z.string().optional(),
  plannedLat: z.number().optional(),
  plannedLng: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

router.post(
  "/activities",
  requireAuth,
  checkPermission("create", "Activity"),
  validateRequest(createActivitySchema),
  async (req, res) => {
    try {
      const activity = await creditInvestigationService.createActivity(
        req.body as CreateActivityRequest,
        req.user!.id
      );

      res.json({
        success: true,
        data: activity,
        message: "Activity created successfully",
      });
    } catch (error: any) {
      logger.error("Failed to create activity", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to create activity",
      });
    }
  }
);

/**
 * Update activity status
 */
const updateActivitySchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"]).optional(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
  executionLat: z.number().optional(),
  executionLng: z.number().optional(),
  executionAccuracy: z.number().optional(),
  durationMinutes: z.number().optional(),
  distanceKm: z.number().optional(),
  customerSatisfaction: z.number().min(1).max(5).optional(),
  performanceScore: z.number().min(0).max(100).optional(),
});

router.patch(
  "/activities/:id",
  requireAuth,
  validateRequest(updateActivitySchema),
  async (req, res) => {
    try {
      const activity = await creditInvestigationService.updateActivityStatus(
        req.params.id,
        req.body.status || "IN_PROGRESS",
        req.user!.id,
        req.body
      );

      res.json({
        success: true,
        data: activity,
        message: "Activity updated successfully",
      });
    } catch (error: any) {
      logger.error("Failed to update activity", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to update activity",
      });
    }
  }
);

/**
 * Reassign activity
 */
const reassignActivitySchema = z.object({
  newAgentId: z.string().uuid(),
  reason: z.string(),
});

router.post(
  "/activities/:id/reassign",
  requireAuth,
  checkPermission("update", "Activity"),
  validateRequest(reassignActivitySchema),
  async (req, res) => {
    try {
      const activity = await creditInvestigationService.reassignActivity(
        {
          activityId: req.params.id,
          ...req.body,
        } as ReassignActivityRequest,
        req.user!.id
      );

      res.json({
        success: true,
        data: activity,
        message: "Activity reassigned successfully",
      });
    } catch (error: any) {
      logger.error("Failed to reassign activity", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to reassign activity",
      });
    }
  }
);

// ============================================
// METRICS ROUTES
// ============================================

/**
 * Get investigation metrics
 */
router.get(
  "/metrics/investigations",
  requireAuth,
  checkPermission("read", "Investigation"),
  async (req, res) => {
    try {
      const { agenceId } = req.query;
      
      const metrics = await creditInvestigationService.getInvestigationMetrics(
        agenceId as string | undefined
      );

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error: any) {
      logger.error("Failed to fetch investigation metrics", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch investigation metrics",
      });
    }
  }
);

/**
 * Get agent performance metrics
 */
router.get(
  "/metrics/agent-performance/:agentId",
  requireAuth,
  checkPermission("read", "Investigation"),
  async (req, res) => {
    try {
      const { fromDate, toDate } = req.query;
      
      const metrics = await creditInvestigationService.getAgentPerformanceMetrics(
        req.params.agentId,
        fromDate ? new Date(fromDate as string) : undefined,
        toDate ? new Date(toDate as string) : undefined
      );

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error: any) {
      logger.error("Failed to fetch agent performance metrics", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch agent performance metrics",
      });
    }
  }
);

// ============================================
// OFFLINE SYNC ROUTES
// ============================================

/**
 * Sync offline data
 */
const syncSchema = z.object({
  deviceId: z.string(),
  investigations: z.array(z.object({
    tempId: z.string(),
    investigation: z.any(),
    photos: z.array(z.object({
      tempId: z.string(),
      base64: z.string(),
      description: z.string(),
    })),
    createdAt: z.string(),
    deviceId: z.string(),
  })),
  activities: z.array(z.object({
    tempId: z.string(),
    activity: z.any(),
    attachments: z.array(z.object({
      tempId: z.string(),
      base64: z.string(),
      type: z.string(),
    })),
    createdAt: z.string(),
    deviceId: z.string(),
  })),
  lastSyncTimestamp: z.string(),
});

router.post(
  "/sync",
  requireAuth,
  validateRequest(syncSchema),
  async (req, res) => {
    try {
      const syncResponse = await creditInvestigationService.syncOfflineData(
        req.body as SyncRequest
      );

      res.json({
        success: true,
        data: syncResponse,
        message: "Sync completed successfully",
      });
    } catch (error: any) {
      logger.error("Failed to sync offline data", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to sync offline data",
      });
    }
  }
);

/**
 * Get pending sync data
 */
router.get(
  "/sync/pending",
  requireAuth,
  async (req, res) => {
    try {
      const { lastSyncTimestamp } = req.query;
      
      const pendingData = await creditInvestigationService.getPendingSyncData(
        req.user!.id,
        lastSyncTimestamp ? new Date(lastSyncTimestamp as string) : undefined
      );

      res.json({
        success: true,
        data: pendingData,
      });
    } catch (error: any) {
      logger.error("Failed to fetch pending sync data", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Failed to fetch pending sync data",
      });
    }
  }
);

export default router;