import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] bg-slate-950 p-6 animate-in fade-in duration-500">
          <Card className="max-w-md w-full p-8 border-slate-800 shadow-xl text-center">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 mx-auto animate-pulse">
              <AlertCircle size={40} className="text-red-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">
              Une erreur est survenue
            </h2>
            
            <p className="text-slate-400 mb-8 leading-relaxed">
              {this.state.error?.message || 'Une erreur inattendue s\'est produite. Nos équipes ont été notifiées.'}
            </p>

            <Button
              onClick={() => window.location.reload()}
              variant="primary"
              fullWidth
              size="lg"
              icon={RefreshCw}
            >
              Recharger la page
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
