import type { 
  CreditInvestigation, 
  AgentActivity, 
  InvestigationHistory,
  InvestigationTemplate
} from "@shared/schema/credit-investigations";
import type { User } from "@shared/schema/auth";
import type { Client } from "@shared/schema/clients";
import type { DemandeCredit } from "@shared/schema/finance";

// ============================================
// INVESTIGATION TYPES
// ============================================

export type InvestigationStatus = 
  | "PENDING_ASSIGNMENT"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "REVIEWED"
  | "CLOSED";

export type AgentRecommendation = 
  | "APPROVE"
  | "APPROVE_WITH_CAUTION"
  | "REDUCE_AMOUNT"
  | "REJECT";

export type RiskLevel = 
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

export type ActivityType = 
  | "PROSPECTION"
  | "CREDIT_INVESTIGATION"
  | "COLLECTION"
  | "CLIENT_VISIT"
  | "DOCUMENT_PICKUP"
  | "OTHER";

export type ActivityPriority = 
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "URGENT";

export type ActivityStatus = 
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "OVERDUE";

// ============================================
// INVESTIGATION DTOs
// ============================================

export interface AssignInvestigationRequest {
  investigationId: string;
  agentId: string;
  priority?: ActivityPriority;
  dueDate: string;
  notes?: string;
}

export interface SubmitInvestigationRequest {
  investigationId: string;
  
  // Business verification
  businessActivityVerified: boolean;
  businessType?: string;
  businessAge?: number;
  businessLocation?: string;
  businessStability?: string;
  
  // Income assessment
  estimatedMonthlyIncome: number;
  estimatedDailyIncome?: number;
  incomeVerificationMethod: string;
  incomeConsistency: string;
  
  // Household situation
  householdSize?: number;
  dependents?: number;
  housingType?: string;
  monthlyExpenses?: number;
  
  // Repayment capacity
  repaymentCapacityAssessment: number;
  debtToIncomeRatio?: number;
  existingLoans?: Array<{
    institution: string;
    amount: number;
    monthlyPayment: number;
  }>;
  
  // Collateral and references
  collateralOffered?: Array<{
    type: string;
    description: string;
    estimatedValue: number;
  }>;
  guarantors?: Array<{
    name: string;
    relationship: string;
    phoneNumber: string;
    incomeLevel?: string;
  }>;
  references?: Array<{
    name: string;
    relationship: string;
    phoneNumber: string;
  }>;
  
  // Risk assessment
  riskLevel: RiskLevel;
  riskFactors?: string[];
  
  // Agent recommendation
  agentRecommendation: AgentRecommendation;
  recommendedAmount?: number;
  agentComments?: string;
  
  // Supporting documents
  fieldPhotos?: Array<{
    url: string;
    description: string;
    timestamp: string;
  }>;
  supportingDocuments?: Array<{
    type: string;
    url: string;
    uploadedAt: string;
  }>;
  
  // Geolocation
  investigationLat?: number;
  investigationLng?: number;
  investigationAccuracy?: number;
}

export interface ReviewInvestigationRequest {
  investigationId: string;
  approved: boolean;
  supervisorNotes?: string;
  requiresAdditionalInvestigation?: boolean;
  additionalInvestigationReason?: string;
}

// ============================================
// ACTIVITY DTOs
// ============================================

export interface CreateActivityRequest {
  agentId: string;
  activityType: ActivityType;
  title: string;
  description?: string;
  priority: ActivityPriority;
  dueDate: string;
  
  // Reference to related entity
  referenceId?: string;
  referenceTable?: string;
  
  // Location
  plannedLocation?: string;
  plannedLat?: number;
  plannedLng?: number;
  
  metadata?: Record<string, any>;
}

export interface UpdateActivityRequest {
  activityId: string;
  status?: ActivityStatus;
  outcome?: string;
  notes?: string;
  attachments?: Array<{
    type: string;
    url: string;
    description?: string;
  }>;
  
  // Execution details
  executionLat?: number;
  executionLng?: number;
  executionAccuracy?: number;
  durationMinutes?: number;
  distanceKm?: number;
  
  // Performance
  customerSatisfaction?: number;
  performanceScore?: number;
}

export interface ReassignActivityRequest {
  activityId: string;
  newAgentId: string;
  reason: string;
}

// ============================================
// RESPONSE TYPES
// ============================================

export interface InvestigationWithDetails extends CreditInvestigation {
  client?: Client;
  assignedAgent?: User;
  creditApplication?: DemandeCredit;
  reviewedByUser?: User;
  assignedByUser?: User;
}

export interface ActivityWithDetails extends AgentActivity {
  assignedAgent?: User;
  assignedByUser?: User;
  previousAgent?: User;
}

export interface InvestigationSummary {
  id: string;
  clientName: string;
  requestedAmount: number;
  investigationStatus: InvestigationStatus;
  assignedAgentName?: string;
  dueDate?: string;
  submittedAt?: string;
  agentRecommendation?: AgentRecommendation;
  riskLevel?: RiskLevel;
}

export interface AgentActivitySummary {
  pendingCount: number;
  inProgressCount: number;
  completedTodayCount: number;
  overdueCount: number;
  upcomingActivities: ActivityWithDetails[];
}

export interface InvestigationMetrics {
  totalInvestigations: number;
  pendingAssignment: number;
  inProgress: number;
  completed: number;
  averageCompletionTime: number; // in hours
  approvalRate: number; // percentage
  byRiskLevel: Record<RiskLevel, number>;
  byRecommendation: Record<AgentRecommendation, number>;
}

export interface AgentPerformanceMetrics {
  agentId: string;
  agentName: string;
  totalInvestigations: number;
  completedInvestigations: number;
  averageCompletionTime: number; // in hours
  onTimeCompletionRate: number; // percentage
  accuracyScore: number; // 0-100
  customerSatisfactionAverage: number; // 1-5
  recommendationAccuracy: number; // percentage of recommendations followed
}

// ============================================
// REALTIME EVENTS
// ============================================

export interface InvestigationAssignedEvent {
  type: "INVESTIGATION_ASSIGNED";
  investigationId: string;
  agentId: string;
  clientName: string;
  requestedAmount: number;
  dueDate: string;
  priority: ActivityPriority;
}

export interface InvestigationSubmittedEvent {
  type: "INVESTIGATION_SUBMITTED";
  investigationId: string;
  agentId: string;
  agentName: string;
  clientName: string;
  recommendation: AgentRecommendation;
  riskLevel: RiskLevel;
}

export interface InvestigationReviewedEvent {
  type: "INVESTIGATION_REVIEWED";
  investigationId: string;
  reviewedBy: string;
  approved: boolean;
  requiresAdditionalInvestigation: boolean;
}

export interface ActivityAssignedEvent {
  type: "ACTIVITY_ASSIGNED";
  activityId: string;
  agentId: string;
  activityType: ActivityType;
  title: string;
  dueDate: string;
  priority: ActivityPriority;
}

export interface ActivityOverdueEvent {
  type: "ACTIVITY_OVERDUE";
  activityId: string;
  agentId: string;
  title: string;
  dueDate: string;
  hoursOverdue: number;
}

// ============================================
// OFFLINE SYNC TYPES
// ============================================

export interface OfflineInvestigationData {
  tempId: string;
  investigation: Partial<SubmitInvestigationRequest>;
  photos: Array<{
    tempId: string;
    base64: string;
    description: string;
  }>;
  createdAt: string;
  deviceId: string;
}

export interface OfflineActivityData {
  tempId: string;
  activity: Partial<UpdateActivityRequest>;
  attachments: Array<{
    tempId: string;
    base64: string;
    type: string;
  }>;
  createdAt: string;
  deviceId: string;
}

export interface SyncRequest {
  deviceId: string;
  investigations: OfflineInvestigationData[];
  activities: OfflineActivityData[];
  lastSyncTimestamp: string;
}

export interface SyncResponse {
  syncedInvestigations: Array<{
    tempId: string;
    serverId: string;
    status: "success" | "error";
    error?: string;
  }>;
  syncedActivities: Array<{
    tempId: string;
    serverId: string;
    status: "success" | "error";
    error?: string;
  }>;
  newAssignments: InvestigationWithDetails[];
  updatedActivities: ActivityWithDetails[];
  serverTimestamp: string;
}

// ============================================
// TEMPLATE TYPES
// ============================================

export interface InvestigationQuestion {
  id: string;
  question: string;
  type: "text" | "number" | "select" | "multiselect" | "boolean" | "date";
  options?: string[];
  required: boolean;
  weight: number;
  validationRules?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

export interface InvestigationCriteriaCategory {
  category: string;
  questions: InvestigationQuestion[];
}

export interface InvestigationTemplateData {
  name: string;
  description: string;
  creditType?: string;
  minAmount?: number;
  maxAmount?: number;
  evaluationCriteria: InvestigationCriteriaCategory[];
  scoringMatrix?: Record<string, any>;
}