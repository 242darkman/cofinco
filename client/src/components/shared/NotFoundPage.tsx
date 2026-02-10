import { useAppNavigation } from '@/hooks/useAppNavigation';

export default function NotFoundPage() {
  const { navigateToModule } = useAppNavigation();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <h1 className="text-7xl font-bold text-slate-600 mb-4">404</h1>
      <h2 className="text-xl font-semibold text-content-primary mb-2">
        Page introuvable
      </h2>
      <p className="text-content-muted mb-8 max-w-md">
        L'adresse que vous avez saisie ne correspond à aucune page.
        Vérifiez l'URL ou retournez au tableau de bord.
      </p>
      <button
        onClick={() => navigateToModule('dashboard')}
        className="px-6 py-3 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
      >
        Retour au tableau de bord
      </button>
    </div>
  );
}
