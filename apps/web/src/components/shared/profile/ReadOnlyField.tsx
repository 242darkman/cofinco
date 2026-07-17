import React from 'react';

export interface ReadOnlyFieldProps {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
}

export function ReadOnlyField({ label, value, highlight }: ReadOnlyFieldProps) {
  return (
    <div className="flex flex-col">
      <div className="text-[10px] text-content-muted uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm font-semibold break-words ${highlight ? 'text-status-success' : 'text-content-primary'}`}>
        {value || <span className="text-content-muted font-normal">—</span>}
      </div>
    </div>
  );
}
