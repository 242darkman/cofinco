import React, { useState, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useQuery } from '@tanstack/react-query';
import { FolderOpen, Users, Clock, DollarSign, Hash, Percent, BarChart3 } from 'lucide-react';
import { Card, StatCard, SelectField, EmptyState, ProgressBar, TabGroup } from '../../ui';
import {
  useProjects,
  useProjectCostSummary,
  useEmployeeTimeAllocation,
  type Project,
  type CostSummary,
  type TimeAllocation,
} from '../../../hooks/hr/useProjectTime';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

function formatHours(h: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(h);
}

// ---------- Section: Couts par projet ----------

function CostByProject({ projects }: { projects: Project[] }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const { summary, isLoading } = useProjectCostSummary(selectedProjectId || null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: `${p.code} - ${p.nom}` })),
    [projects],
  );

  const budgetPercent = useMemo(() => {
    if (!summary || !selectedProject?.budgetHeures) return null;
    return Math.round((summary.totalHeures / selectedProject.budgetHeures) * 100);
  }, [summary, selectedProject]);

  return (
    <div className="space-y-4">
      <SelectField
        label="Projet"
        name="project-select"
        placeholder="Sélectionner un projet..."
        icon={FolderOpen}
        options={projectOptions}
        value={selectedProjectId}
        onChange={(e) => setSelectedProjectId(e.target.value)}
      />

      {!selectedProjectId && (
        <EmptyState
          icon={BarChart3}
          title="Aucun projet sélectionné"
          description="Sélectionnez un projet pour afficher le résumé des coûts et la répartition par employé."
        />
      )}

      {selectedProjectId && isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="sm" />
        </div>
      )}

      {summary && !isLoading && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Total heures" value={formatHours(summary.totalHeures)} icon={Clock} color="primary" />
            <StatCard title="Total coût" value={formatCurrency(summary.totalCout)} icon={DollarSign} color="success" />
            <StatCard title="Nombre d'entrées" value={summary.nbEntries} icon={Hash} color="neutral" />
            <StatCard
              title="Budget consommé"
              value={budgetPercent !== null ? `${budgetPercent}%` : 'N/A'}
              icon={Percent}
              color={budgetPercent !== null && budgetPercent > 100 ? 'danger' : 'warning'}
              subtitle={budgetPercent === null ? 'Aucun budget défini' : undefined}
            />
          </div>

          {/* Budget progress */}
          {budgetPercent !== null && selectedProject?.budgetHeures && (
            <Card padding="sm">
              <ProgressBar
                value={summary.totalHeures}
                max={selectedProject.budgetHeures}
                label="Consommation du budget heures"
                showPercentage
                showValue
                color={budgetPercent > 100 ? 'danger' : budgetPercent > 80 ? 'warning' : 'primary'}
                size="md"
              />
            </Card>
          )}

          {/* Table: repartition par employe */}
          <Card padding="none">
            <div className="px-4 py-3 border-b border-edge">
              <h4 className="text-sm font-semibold text-content-primary">Répartition par employé</h4>
            </div>

            {summary.byEmployee.length === 0 ? (
              <p className="text-content-muted text-sm text-center py-8">Aucune donnée disponible.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge bg-surface-elevated/40">
                      <th className="text-left px-4 py-2 text-content-secondary font-medium">Employé</th>
                      <th className="text-right px-4 py-2 text-content-secondary font-medium">Heures</th>
                      <th className="text-right px-4 py-2 text-content-secondary font-medium">Coût (FCFA)</th>
                      <th className="px-4 py-2 text-content-secondary font-medium text-right w-40">% du total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byEmployee.map((emp) => {
                      const pct = summary.totalHeures > 0
                        ? Math.round((emp.totalHeures / summary.totalHeures) * 100)
                        : 0;
                      return (
                        <tr key={emp.employeId} className="border-b border-edge-subtle last:border-0 hover:bg-surface-elevated/30 transition-colors">
                          <td className="px-4 py-2.5 text-content-primary font-medium">{emp.employeNom}</td>
                          <td className="px-4 py-2.5 text-right text-content-secondary">{formatHours(emp.totalHeures)}</td>
                          <td className="px-4 py-2.5 text-right text-content-secondary">{formatCurrency(emp.totalCout)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 justify-end">
                              <ProgressBar value={pct} size="sm" color="primary" className="flex-1 max-w-24" />
                              <span className="text-content-muted text-xs w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ---------- Section: Allocation temps employe ----------

interface Employee {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
}

function AllocationByEmployee() {
  const [selectedEmployeId, setSelectedEmployeId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employes'],
    queryFn: async () => {
      const res = await fetch('/api/employes', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((e: any) => ({
        id: e.id,
        nom: e.user?.nom || '',
        prenom: e.user?.prenom || '',
        matricule: e.matricule || '',
      }));
    },
  });

  const { allocation, isLoading } = useEmployeeTimeAllocation(
    selectedEmployeId || null,
    dateFrom || undefined,
    dateTo || undefined,
  );

  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e.id, label: `${e.matricule} - ${e.nom} ${e.prenom}` })),
    [employees],
  );

  return (
    <div className="space-y-4">
      <SelectField
        label="Employé"
        name="employee-select"
        placeholder="Sélectionner un employé..."
        icon={Users}
        options={employeeOptions}
        value={selectedEmployeId}
        onChange={(e) => setSelectedEmployeId(e.target.value)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="date-from" className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
            Date début
          </label>
          <input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full h-10 sm:h-11 px-4 bg-input-bg border border-input-border rounded-lg text-input-text text-sm focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors"
          />
        </div>
        <div>
          <label htmlFor="date-to" className="block text-xs sm:text-sm font-semibold text-content-secondary mb-2">
            Date fin
          </label>
          <input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full h-10 sm:h-11 px-4 bg-input-bg border border-input-border rounded-lg text-input-text text-sm focus:outline-none focus:ring-2 focus:border-input-focus focus:ring-input-focus/30 transition-colors"
          />
        </div>
      </div>

      {!selectedEmployeId && (
        <EmptyState
          icon={Users}
          title="Aucun employé sélectionné"
          description="Sélectionnez un employé pour afficher la répartition de son temps par projet."
        />
      )}

      {selectedEmployeId && isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="sm" />
        </div>
      )}

      {allocation && !isLoading && (
        <>
          <StatCard
            title="Total heures sur la période"
            value={formatHours(allocation.totalHeures)}
            icon={Clock}
            color="primary"
          />

          <Card padding="none">
            <div className="px-4 py-3 border-b border-edge">
              <h4 className="text-sm font-semibold text-content-primary">Répartition par projet</h4>
            </div>

            {allocation.byProject.length === 0 ? (
              <p className="text-content-muted text-sm text-center py-8">Aucune donnée disponible.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge bg-surface-elevated/40">
                      <th className="text-left px-4 py-2 text-content-secondary font-medium">Projet</th>
                      <th className="text-right px-4 py-2 text-content-secondary font-medium">Heures</th>
                      <th className="text-right px-4 py-2 text-content-secondary font-medium">Coût (FCFA)</th>
                      <th className="px-4 py-2 text-content-secondary font-medium text-right w-40">% du total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocation.byProject.map((proj) => {
                      const pct = allocation.totalHeures > 0
                        ? Math.round((proj.totalHeures / allocation.totalHeures) * 100)
                        : 0;
                      return (
                        <tr key={proj.projetId} className="border-b border-edge-subtle last:border-0 hover:bg-surface-elevated/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="text-accent font-mono text-xs">{proj.projetCode}</span>
                            <span className="text-content-primary font-medium ml-2">{proj.projetNom}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-content-secondary">{formatHours(proj.totalHeures)}</td>
                          <td className="px-4 py-2.5 text-right text-content-secondary">{formatCurrency(proj.totalCout)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 justify-end">
                              <ProgressBar value={pct} size="sm" color="primary" className="flex-1 max-w-24" />
                              <span className="text-content-muted text-xs w-8 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ---------- Main component ----------

const tabs = [
  { key: 'projet', label: 'Par projet', icon: FolderOpen },
  { key: 'employe', label: 'Par employé', icon: Users },
];

export default function ReportingTab() {
  const [activeTab, setActiveTab] = useState('projet');
  const { projects } = useProjects();

  return (
    <div className="space-y-6">
      <TabGroup
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        variant="pills"
        size="sm"
      />

      {activeTab === 'projet' && <CostByProject projects={projects} />}
      {activeTab === 'employe' && <AllocationByEmployee />}
    </div>
  );
}
