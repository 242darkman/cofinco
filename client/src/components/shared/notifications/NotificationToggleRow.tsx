import React from 'react';
import Switch from '../../ui/Switch';

interface NotificationToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  testId?: string;
}

export default function NotificationToggleRow({
  label,
  description,
  checked,
  onChange,
  testId
}: NotificationToggleRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1 pr-4">
        <p className="font-medium text-slate-200">{label}</p>
        <p className="text-sm text-slate-400">{description}</p>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        data-testid={testId}
      />
    </div>
  );
}
