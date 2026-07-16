import React from 'react';
import { Spinner, type SpinnerSize } from './Spinner';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

/** Chargement de section : le `Spinner` unique, centré et accompagné d'un libellé. */
export default function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const spinnerSize: SpinnerSize = size === 'sm' ? 'sm' : size === 'lg' ? 'xl' : 'lg';

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <Spinner size={spinnerSize} />
      {text && <p className="text-content-muted text-sm">{text}</p>}
    </div>
  );
}
