import { useState, useEffect } from 'react';

export interface Module {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  isActive: boolean;
  orderIndex: number;
  createdAt?: string;
}

export function useModules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/modules');
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des modules');
      }
      const data = await response.json();
      setModules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur serveur');
      console.error('Erreur fetch modules:', err);
    } finally {
      setLoading(false);
    }
  };

  const getModulesByCategory = (category: string) => {
    return modules.filter(m => m.category === category);
  };

  const getActiveModules = () => {
    return modules.filter(m => m.isActive);
  };

  useEffect(() => {
    fetchModules();
  }, []);

  return {
    modules,
    loading,
    error,
    fetchModules,
    getModulesByCategory,
    getActiveModules
  };
}
