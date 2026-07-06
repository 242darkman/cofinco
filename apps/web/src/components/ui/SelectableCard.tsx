import React from 'react';
import Card from './Card';

interface SelectableCardProps {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  testId?: string;
}

export default function SelectableCard({
  selected = false,
  onClick,
  children,
  className = '',
  disabled = false,
  testId
}: SelectableCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      data-testid={testId}
      className={`
        text-left transition-all duration-300 group outline-none focus:ring-2 focus:ring-accent rounded-xl w-full h-full
        ${selected ? 'ring-2 ring-accent scale-105' : 'hover:scale-105 hover:-translate-y-1'}
        ${disabled ? 'opacity-50 cursor-not-allowed hover:scale-100 hover:translate-y-0' : 'cursor-pointer'}
        ${className}
      `}
    >
      <Card 
        className={`
          h-full p-4 border-edge transition-colors duration-300
          ${selected ? 'bg-surface border-accent/50' : 'bg-surface/50 hover:bg-surface'}
        `}
      >
        {children}
      </Card>
    </button>
  );
}
