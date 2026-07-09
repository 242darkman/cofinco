import { useState, useCallback, useEffect } from 'react';

export interface ConditionTemplate {
  id: string;
  name: string;
  description: string | null;
  conditionSchema: Record<string, unknown>;
  variables: unknown[];
  examples: Array<{ description: string; values: Record<string, unknown> }>;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useConditionTemplates() {
  const [templates, setTemplates] = useState<ConditionTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rbac/condition-templates', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des templates');
      }

      const data = await response.json();
      setTemplates(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const createTemplate = useCallback(async (data: {
    name: string;
    description?: string;
    conditionSchema: Record<string, unknown>;
    variables?: string[];
    examples?: Array<{ description: string; values: Record<string, unknown> }>;
  }) => {
    const response = await fetch('/api/rbac/condition-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la création');
    }

    const created = await response.json();
    setTemplates(prev => [created, ...prev]);
    return created;
  }, []);

  const updateTemplate = useCallback(async (id: string, data: Partial<Omit<ConditionTemplate, 'id' | 'isSystem' | 'createdAt' | 'updatedAt'>>) => {
    const response = await fetch(`/api/rbac/condition-templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la mise à jour');
    }

    const updated = await response.json();
    setTemplates(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    const response = await fetch(`/api/rbac/condition-templates/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok && response.status !== 204) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || 'Erreur lors de la suppression');
    }

    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    error,
    refresh: fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
