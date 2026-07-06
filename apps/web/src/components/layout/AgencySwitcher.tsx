import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Agency {
  agenceId: string;
  agenceNom: string;
  agenceCode: string;
  typeAgence: string;
  isPrimary: boolean;
  role: string | null;
}

interface MyAgenciesResponse {
  agencies: Agency[];
  currentAgenceId: string | null;
  isMultiAgency: boolean;
}

export default function AgencySwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<MyAgenciesResponse>({
    queryKey: ['my-agencies'],
    queryFn: async () => {
      const res = await fetch('/api/auth/my-agencies', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch agencies');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading || !data) return null;

  const { agencies, currentAgenceId, isMultiAgency } = data;

  if (agencies.length === 0) return null;

  const currentAgency = agencies.find(a => a.agenceId === currentAgenceId);
  const displayName = currentAgency?.agenceNom || 'Agence';

  // Single agency — show static badge
  if (!isMultiAgency) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-subtle text-content-secondary text-xs font-medium">
        <Building2 size={13} />
        <span className="truncate max-w-[140px]">{displayName}</span>
      </div>
    );
  }

  // Multi-agency — show dropdown
  async function handleSwitch(agenceId: string) {
    if (agenceId === currentAgenceId) {
      setOpen(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/switch-agency', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agenceId }),
      });
      if (!res.ok) throw new Error('Switch failed');
      // Invalidate all queries to refresh data with new agency scope
      queryClient.invalidateQueries();
      setOpen(false);
    } catch (err) {
      console.error('Failed to switch agency:', err);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-subtle-elevated text-content-secondary text-xs font-medium transition-colors border border-edge-subtle"
      >
        <Building2 size={13} />
        <span className="truncate max-w-[140px]">{displayName}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[220px] rounded-lg border border-edge bg-surface-elevated shadow-lg py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
            Mes agences
          </div>
          {agencies.map(agency => (
            <button
              key={agency.agenceId}
              onClick={() => handleSwitch(agency.agenceId)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                agency.agenceId === currentAgenceId
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-content-primary hover:bg-surface-subtle'
              }`}
            >
              <Building2 size={14} className={agency.agenceId === currentAgenceId ? 'text-accent' : 'text-content-muted'} />
              <div className="flex-1 min-w-0">
                <div className="truncate">{agency.agenceNom}</div>
                <div className="text-[10px] text-content-muted">{agency.agenceCode}</div>
              </div>
              {agency.agenceId === currentAgenceId && <Check size={14} className="text-accent shrink-0" />}
              {agency.isPrimary && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium shrink-0">
                  Principal
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
