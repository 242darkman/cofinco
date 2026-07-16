import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-accent/10 to-accent-secondary/10 rounded-2xl flex items-center justify-center mb-6">
        <Icon size={40} className="text-accent" />
      </div>
      <h3 className="text-xl font-bold text-content-primary mb-2">{title}</h3>
      <p className="text-content-muted max-w-md mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-gradient-to-r from-accent to-accent-secondary hover:from-accent-primary-hover hover:to-accent-secondary-hover text-white rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
