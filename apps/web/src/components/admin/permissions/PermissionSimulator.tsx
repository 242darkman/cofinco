import { useState, useMemo } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Eye, ChevronDown, ChevronRight, Shield, Clock, UserCog, ShieldOff, Search, Users } from 'lucide-react';
import { Button, Badge, SearchableSelect } from '@/components/ui';
import { usePermissionSimulator, type SimulatedModule } from '@/hooks/admin/usePermissionSimulator';

interface PermissionSimulatorProps {
  users: Array<{ id: string; nom: string; prenom?: string; username?: string }>;
}

const SOURCE_LABELS: Record<string, string> = {
  ROLE: 'Rôle',
  TEMPORARY: 'Temporaire',
  OVERRIDE_GLOBAL: 'Override',
  OVERRIDE_AGENCE: 'Override agence',
  ADMIN: 'Admin',
  NONE: 'Aucune',
};

const SOURCE_STYLES: Record<string, string> = {
  ROLE: 'bg-accent/10 text-accent border-accent/20',
  TEMPORARY: 'bg-status-warning-bg text-status-warning border-status-warning/20',
  OVERRIDE_GLOBAL: 'bg-status-info-bg text-status-info border-status-info/20',
  OVERRIDE_AGENCE: 'bg-status-info-bg text-status-info border-status-info/20',
  ADMIN: 'bg-status-success-bg text-status-success border-status-success/20',
  NONE: 'bg-surface-subtle text-content-muted border-edge-subtle',
};

function ModuleAccordion({ module }: { module: SimulatedModule }) {
  const [expanded, setExpanded] = useState(false);
  const grantedCount = module.permissions.filter(p => p.granted).length;
  const totalCount = module.permissions.length;

  return (
    <div className="border border-edge-subtle rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-subtle hover:bg-surface-subtle-elevated transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown size={16} className="text-content-muted" /> : <ChevronRight size={16} className="text-content-muted" />}
          <span className="font-medium text-content-primary">{module.name}</span>
          <Badge variant="neutral" className="text-[10px]">{module.category}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-muted">{grantedCount}/{totalCount}</span>
          <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-status-success rounded-full transition-all"
              style={{ width: `${totalCount > 0 ? (grantedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-edge-subtle">
          {module.permissions.map(perm => (
            <div
              key={perm.id}
              className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                perm.granted ? 'bg-surface' : 'bg-surface opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {perm.granted ? (
                  <Shield size={14} className="text-status-success shrink-0" />
                ) : (
                  <ShieldOff size={14} className="text-content-muted shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-content-primary">{perm.name}</span>
                  <span className="ml-2 text-[11px] text-content-muted">{perm.code}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {perm.expiresAt && (
                  <span className="flex items-center gap-1 text-[10px] text-status-warning">
                    <Clock size={10} />
                    {new Date(perm.expiresAt).toLocaleDateString('fr-FR')}
                  </span>
                )}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${SOURCE_STYLES[perm.source] || SOURCE_STYLES.NONE}`}>
                  {SOURCE_LABELS[perm.source] || perm.source}
                  {perm.sourceRole && perm.source === 'ROLE' && (
                    <span className="ml-1 opacity-70">({perm.sourceRole})</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PermissionSimulator({ users: usersList }: PermissionSimulatorProps) {
  const {
    targetUserId, setTargetUserId,
    simulation, loading, error, simulate,
  } = usePermissionSimulator();

  const [searchTerm, setSearchTerm] = useState('');

  const userOptions = useMemo(() =>
    usersList.map(u => ({
      value: u.id,
      label: `${u.prenom || ''} ${u.nom}`.trim(),
      description: u.username || undefined,
    })),
    [usersList]
  );

  const filteredModules = useMemo(() => {
    if (!simulation || !searchTerm) return simulation?.modules || [];
    const term = searchTerm.toLowerCase();
    return simulation.modules
      .map(mod => ({
        ...mod,
        permissions: mod.permissions.filter(
          p => p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
        ),
      }))
      .filter(mod => mod.permissions.length > 0 || mod.name.toLowerCase().includes(term));
  }, [simulation, searchTerm]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge-subtle">
        <div className="flex items-center gap-2">
          <Eye size={18} className="text-accent" />
          <h3 className="font-semibold text-content-primary">Simulateur de Permissions</h3>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-b border-edge-subtle bg-surface-subtle">
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-sm">
            <SearchableSelect
              name="targetUser"
              options={userOptions}
              value={targetUserId}
              onChange={(value) => setTargetUserId(String(value))}
              placeholder="Sélectionner un utilisateur..."
            />
          </div>
          <Button
            onClick={simulate}
            disabled={!targetUserId || loading}
            size="sm"
          >
            {loading ? <Spinner size="xs" tone="current" className="mr-1" /> : <Eye size={14} className="mr-1" />}
            Simuler
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-status-danger-bg text-status-danger text-sm">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {!simulation && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-content-muted">
            <Users size={40} className="mb-3 opacity-50" />
            <p className="text-sm">Sélectionnez un utilisateur et cliquez sur "Simuler"</p>
            <p className="text-xs mt-1">pour voir ses permissions effectives</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Spinner size="sm" tone="accent" />
          </div>
        )}

        {simulation && !loading && (
          <>
            {/* User info + summary */}
            <div className="flex items-center gap-3 p-3 bg-surface-subtle rounded-lg border border-edge-subtle">
              <UserCog size={16} className="text-accent" />
              <div>
                <span className="font-medium text-content-primary">
                  {simulation.user.prenom} {simulation.user.nom}
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  {simulation.roles.map(r => (
                    <Badge key={r} variant="neutral" className="text-[10px]">{r}</Badge>
                  ))}
                  {simulation.isAdmin && <Badge className="text-[10px] bg-status-warning-bg text-status-warning">Admin</Badge>}
                </div>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-surface border border-edge-subtle text-center">
                <div className="text-xl font-bold text-content-primary">{simulation.summary.granted}</div>
                <div className="text-[11px] text-status-success">Accordées</div>
              </div>
              <div className="p-3 rounded-lg bg-surface border border-edge-subtle text-center">
                <div className="text-xl font-bold text-content-primary">{simulation.summary.denied}</div>
                <div className="text-[11px] text-status-danger">Refusées</div>
              </div>
              <div className="p-3 rounded-lg bg-surface border border-edge-subtle text-center">
                <div className="text-xl font-bold text-content-primary">{simulation.summary.bySource.role}</div>
                <div className="text-[11px] text-accent">Via rôle</div>
              </div>
              <div className="p-3 rounded-lg bg-surface border border-edge-subtle text-center">
                <div className="text-xl font-bold text-content-primary">{simulation.summary.bySource.override + simulation.summary.bySource.temporary}</div>
                <div className="text-[11px] text-status-info">Overrides/Temp</div>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
              <input
                type="text"
                placeholder="Filtrer par nom ou code de permission..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-input border border-input-border rounded-lg focus:border-input-focus focus:outline-none text-content-primary placeholder:text-content-muted"
              />
            </div>

            {/* Modules */}
            <div className="space-y-2">
              {filteredModules.map(mod => (
                <ModuleAccordion key={mod.id} module={mod} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
