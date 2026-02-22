import { useState, useEffect, useCallback } from 'react';

export interface RoleHierarchyNode {
  role: string;
  label: string;
  directPermissions: number;
  inheritedPermissions: number;
  children: string[];
  parents: string[];
}

export interface RoleHierarchyRelation {
  id: string;
  parentRole: string;
  childRole: string;
  createdAt: string;
}

/**
 * Calculate inherited permission counts via BFS on children
 */
function calculateInheritance(nodes: RoleHierarchyNode[]): RoleHierarchyNode[] {
  const nodeMap = new Map(nodes.map(n => [n.role, n]));

  const getInheritedCount = (role: string, visited = new Set<string>()): number => {
    if (visited.has(role)) return 0;
    visited.add(role);

    const node = nodeMap.get(role);
    if (!node) return 0;

    let inherited = 0;
    for (const childRole of node.children) {
      const childNode = nodeMap.get(childRole);
      if (childNode) {
        inherited += childNode.directPermissions;
        inherited += getInheritedCount(childRole, visited);
      }
    }
    return inherited;
  };

  return nodes.map(node => ({
    ...node,
    inheritedPermissions: getInheritedCount(node.role),
  }));
}

export function useRoleHierarchy() {
  const [nodes, setNodes] = useState<RoleHierarchyNode[]>([]);
  const [relations, setRelations] = useState<RoleHierarchyRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHierarchy = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/rbac/role-hierarchy', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération de la hiérarchie');
      }

      const data = await response.json();

      const nodesWithInheritance = calculateInheritance(
        data.nodes.map((n: Omit<RoleHierarchyNode, 'inheritedPermissions'>) => ({
          ...n,
          inheritedPermissions: 0,
        }))
      );

      setNodes(nodesWithInheritance);
      setRelations(data.relations || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  const addRelation = useCallback(async (parentRole: string, childRole: string) => {
    const response = await fetch('/api/rbac/role-hierarchy', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentRole, childRole }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Erreur lors de la création de la relation');
    }

    await fetchHierarchy();
  }, [fetchHierarchy]);

  const removeRelation = useCallback(async (id: string) => {
    const response = await fetch(`/api/rbac/role-hierarchy/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Erreur lors de la suppression de la relation');
    }

    await fetchHierarchy();
  }, [fetchHierarchy]);

  return { nodes, relations, loading, error, refresh: fetchHierarchy, addRelation, removeRelation };
}
