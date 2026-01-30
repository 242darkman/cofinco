/**
 * TreasuryReconciliationPanel — Panneau de réconciliation GL vs Opérationnel
 *
 * Affiche:
 * - Statut de réconciliation en temps réel
 * - Derniers résultats par agence
 * - Bouton de réconciliation manuelle
 * - Alertes actives
 */

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Building2,
  Clock,
  Activity,
  Database,
  TrendingUp,
} from "lucide-react";
import { Card, Button, Badge } from "../ui";
import { api } from "../../lib/api-client";
import { formatMoney } from "../../lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Types
interface ReconciliationSummary {
  ok: number;
  minor: number;
  major: number;
  critical: number;
  totalEcartAbsolu: number;
}

interface ReconciliationResult {
  agenceId: string;
  agenceNom: string;
  codeAgence: string;
  glTotal: number;
  operationalTotal: number;
  ecart: number;
  status: "OK" | "MINOR" | "MAJOR" | "CRITICAL";
  details: {
    coffresGL: number;
    coffresOperational: number;
    caissesGL: number;
    caissesOperational: number;
  };
  timestamp: string;
}

interface ReconciliationReport {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalAgences: number;
  results: ReconciliationResult[];
  summary: ReconciliationSummary;
  globalReconciliation?: {
    glTotal: number;
    operationalTotal: number;
    ecart: number;
    status: "OK" | "MINOR" | "MAJOR" | "CRITICAL";
  };
}

interface ReconciliationStatus {
  isRunning: boolean;
  lastReport: {
    runId: string;
    completedAt: string;
    durationMs: number;
    totalAgences: number;
    summary: ReconciliationSummary;
    globalStatus?: string;
  } | null;
}

// Status badge colors
const STATUS_STYLES = {
  OK: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-400",
    icon: CheckCircle,
  },
  MINOR: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-400",
    icon: AlertTriangle,
  },
  MAJOR: {
    bg: "bg-orange-100 dark:bg-orange-900/30",
    text: "text-orange-700 dark:text-orange-400",
    icon: AlertCircle,
  },
  CRITICAL: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400",
    icon: XCircle,
  },
};

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// API
const reconciliationApi = {
  getStatus: async (): Promise<ReconciliationStatus> => {
    return api.get("/api/treasury/v2/reconciliation/status");
  },
  getReport: async (): Promise<ReconciliationReport> => {
    return api.get("/api/treasury/v2/reconciliation/report");
  },
  runReconciliation: async (): Promise<{ success: boolean; report: ReconciliationReport }> => {
    return api.post("/api/treasury/v2/reconciliation/run");
  },
};

// Component
export function TreasuryReconciliationPanel() {
  const queryClient = useQueryClient();
  const [showDetails, setShowDetails] = useState(false);

  // Query: Status
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["treasury", "reconciliation", "status"],
    queryFn: reconciliationApi.getStatus,
    refetchInterval: 30000, // Refresh every 30s
  });

  // Query: Full report
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ["treasury", "reconciliation", "report"],
    queryFn: reconciliationApi.getReport,
    enabled: showDetails,
  });

  // Mutation: Run reconciliation
  const runMutation = useMutation({
    mutationFn: reconciliationApi.runReconciliation,
    onSuccess: (data) => {
      toast.success("Réconciliation terminée", {
        description: `${data.report.totalAgences} agences réconciliées`,
      });
      queryClient.invalidateQueries({ queryKey: ["treasury", "reconciliation"] });
    },
    onError: (error: any) => {
      toast.error("Erreur lors de la réconciliation", {
        description: error.message,
      });
    },
  });

  // Listen for WebSocket events
  useEffect(() => {
    const handleReconciliationComplete = () => {
      queryClient.invalidateQueries({ queryKey: ["treasury", "reconciliation"] });
    };

    window.addEventListener("treasury-reconciliation-complete", handleReconciliationComplete);
    return () => {
      window.removeEventListener("treasury-reconciliation-complete", handleReconciliationComplete);
    };
  }, [queryClient]);

  const summary = status?.lastReport?.summary;
  const globalStatus = status?.lastReport?.globalStatus as keyof typeof STATUS_STYLES | undefined;
  const statusStyle = globalStatus ? STATUS_STYLES[globalStatus] : STATUS_STYLES.OK;
  const StatusIcon = statusStyle.icon;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Réconciliation Treasury</h3>
          <Badge variant="outline" className="text-xs">GL vs Opérationnel</Badge>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending || status?.isRunning}
        >
          <RefreshCw className={cn("h-4 w-4 mr-1", (runMutation.isPending || status?.isRunning) && "animate-spin")} />
          {status?.isRunning ? "En cours..." : "Réconcilier"}
        </Button>
      </div>

      {/* Status Cards */}
      {statusLoading ? (
        <div className="animate-pulse h-20 bg-muted rounded-lg" />
      ) : status?.lastReport ? (
        <div className="space-y-3">
          {/* Global Status */}
          <div className={cn("rounded-lg p-3 flex items-center justify-between", statusStyle.bg)}>
            <div className="flex items-center gap-2">
              <StatusIcon className={cn("h-5 w-5", statusStyle.text)} />
              <div>
                <p className={cn("font-medium", statusStyle.text)}>
                  Statut: {globalStatus || "OK"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(status.lastReport.completedAt)} • {status.lastReport.durationMs}ms
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono font-bold">
                {status.lastReport.totalAgences} agences
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          {summary && (
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-green-700 dark:text-green-400">{summary.ok}</p>
                <p className="text-xs text-muted-foreground">OK</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{summary.minor}</p>
                <p className="text-xs text-muted-foreground">Mineurs</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{summary.major}</p>
                <p className="text-xs text-muted-foreground">Majeurs</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-red-700 dark:text-red-400">{summary.critical}</p>
                <p className="text-xs text-muted-foreground">Critiques</p>
              </div>
            </div>
          )}

          {/* Total Ecart */}
          {summary && summary.totalEcartAbsolu > 0 && (
            <div className="bg-muted/50 rounded-lg p-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Écart total absolu:</span>
              <span className="font-mono font-bold text-orange-600">{formatMoney(summary.totalEcartAbsolu)}</span>
            </div>
          )}

          {/* Toggle Details */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? "Masquer le détail" : "Voir le détail par agence"}
          </Button>

          {/* Detailed Results */}
          {showDetails && report && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {report.results
                .filter((r) => r.status !== "OK")
                .sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))
                .map((result) => {
                  const style = STATUS_STYLES[result.status];
                  const Icon = style.icon;
                  return (
                    <div
                      key={result.agenceId}
                      className={cn("rounded-lg p-2 flex items-center justify-between", style.bg)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", style.text)} />
                        <div>
                          <p className="text-sm font-medium">{result.agenceNom}</p>
                          <p className="text-xs text-muted-foreground">
                            GL: {formatMoney(result.glTotal)} | Op: {formatMoney(result.operationalTotal)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn("font-mono font-bold text-sm", style.text)}>
                          {result.ecart > 0 ? "+" : ""}{formatMoney(result.ecart)}
                        </p>
                      </div>
                    </div>
                  );
                })}

              {report.results.filter((r) => r.status === "OK").length > 0 && (
                <p className="text-xs text-center text-muted-foreground mt-2">
                  {report.results.filter((r) => r.status === "OK").length} agence(s) sans écart
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Aucune réconciliation effectuée</p>
          <p className="text-xs">Cliquez sur "Réconcilier" pour lancer</p>
        </div>
      )}
    </Card>
  );
}

export default TreasuryReconciliationPanel;
