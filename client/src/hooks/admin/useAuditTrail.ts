/**
 * Hook for audit trail functionality
 * Provides fetching, filtering, and rollback capabilities
 */

import { useState, useCallback } from 'react';
import { auditApi } from '../../lib/api-client';
import { toast, handleApiError } from '../../lib/toast';

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  userNom?: string;
  userPrenom?: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, any> | null;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  isRollbackable?: boolean;
  rolledBackAt?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  statut: string;
  riskLevel: string;
  createdAt: string;
}

export interface AuditFilters {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  statut?: string;
  riskLevel?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface SettingsVersion {
  id: string;
  settingsType: string;
  version: number;
  snapshot: Record<string, any>;
  changedBy: string | null;
  changerName?: string | null;
  changedAt: string;
  changeReason: string | null;
  isCurrent: boolean;
}

export interface ImportBatch {
  id: string;
  importType: string;
  fileName: string | null;
  totalRecords: number;
  createdRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  failedRecords: number;
  status: 'COMPLETED' | 'ROLLED_BACK' | 'PARTIAL';
  importerName?: string | null;
  importedAt: string;
}

export function useAuditTrail() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const fetchLogs = useCallback(async (filters: AuditFilters = {}) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};

      if (filters.page) params.page = String(filters.page);
      if (filters.limit) params.limit = String(filters.limit);
      if (filters.userId) params.userId = filters.userId;
      if (filters.action) params.action = filters.action;
      if (filters.resource) params.resource = filters.resource;
      if (filters.statut) params.statut = filters.statut;
      if (filters.riskLevel) params.riskLevel = filters.riskLevel;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;

      const response = await auditApi.getAll(params);

      // Handle both paginated and non-paginated responses
      if (response?.data && Array.isArray(response.data)) {
        setLogs(response.data);
        setTotal(response.total || response.data.length);
        setPage(response.page || 1);
        setTotalPages(response.totalPages || 1);
      } else if (Array.isArray(response)) {
        setLogs(response);
        setTotal(response.length);
        setPage(1);
        setTotalPages(1);
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des logs'));
    } finally {
      setLoading(false);
    }
  }, []);

  const rollback = useCallback(async (auditLogId: string): Promise<boolean> => {
    try {
      const response = await auditApi.rollback(auditLogId);

      if (response?.success) {
        toast.success('Action annulée avec succès');
        return true;
      } else {
        toast.error(response?.error || 'Impossible d\'annuler cette action');
        return false;
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'annulation'));
      return false;
    }
  }, []);

  return {
    logs,
    loading,
    total,
    page,
    totalPages,
    fetchLogs,
    rollback,
    setPage,
  };
}

export function useSettingsHistory() {
  const [versions, setVersions] = useState<SettingsVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (settingsType: string) => {
    setLoading(true);
    try {
      const response = await auditApi.getSettingsHistory(settingsType);
      setVersions(response || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement de l\'historique'));
    } finally {
      setLoading(false);
    }
  }, []);

  const restoreVersion = useCallback(
    async (settingsType: string, version: number): Promise<Record<string, any> | null> => {
      try {
        const response = await auditApi.restoreSettingsVersion(settingsType, version);

        if (response?.success) {
          toast.success(`Paramètres restaurés vers la version ${version}`);
          return response.snapshot ?? null;
        } else {
          toast.error(response?.error || 'Impossible de restaurer cette version');
          return null;
        }
      } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors de la restauration'));
        return null;
      }
    },
    []
  );

  return {
    versions,
    loading,
    fetchHistory,
    restoreVersion,
  };
}

export function usePermissionAudit() {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(
    async (entityType?: 'role' | 'user', entityId?: string) => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (entityType) params.entityType = entityType;
        if (entityId) params.entityId = entityId;

        const response = await auditApi.getPermissionAuditHistory(params);
        setHistory(response || []);
      } catch (error) {
        toast.error(handleApiError(error, 'Erreur lors du chargement de l\'historique'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    history,
    loading,
    fetchHistory,
  };
}

export function useImportBatches() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBatches = useCallback(async (importType?: string) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (importType) params.importType = importType;

      const response = await auditApi.getImportBatches(params);
      setBatches(response || []);
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors du chargement des imports'));
    } finally {
      setLoading(false);
    }
  }, []);

  const rollbackBatch = useCallback(async (batchId: string): Promise<boolean> => {
    try {
      const response = await auditApi.rollbackImportBatch(batchId);

      if (response?.success) {
        toast.success(`Import annulé - ${response.deletedCount} enregistrements supprimés`);
        return true;
      } else {
        toast.error(response?.error || 'Impossible d\'annuler cet import');
        return false;
      }
    } catch (error) {
      toast.error(handleApiError(error, 'Erreur lors de l\'annulation'));
      return false;
    }
  }, []);

  return {
    batches,
    loading,
    fetchBatches,
    rollbackBatch,
  };
}
