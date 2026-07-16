/**
 * Modale d'ouverture d'une carte de pointage.
 *
 * Le client choisit librement son montant fixe par case (ex. 1500, 2000,
 * 5000 FCFA) — figé à l'ouverture. Un client peut détenir plusieurs cartes
 * actives en parallèle. La recherche client interroge l'API (debounce).
 */

import React, { useEffect, useState } from 'react';
import { Search, UserCheck } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/contexts/CurrencyContext';
import { clientApi } from '@/lib/api-client';
import { useCreateCartePointage } from '@/hooks/use-cartes-pointage';

interface ClientOption {
  id: string;
  nom: string;
  prenom?: string | null;
  telephone?: string | null;
}

interface CreateCarteModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pré-sélection du client (ouverture depuis la fiche client). */
  clientInitial?: ClientOption | null;
}

/** Montants suggérés fréquents en microfinance (le champ reste libre). */
const MONTANTS_SUGGERES = ['500', '1000', '1500', '2000', '5000'];

export const CreateCarteModal: React.FC<CreateCarteModalProps> = ({ isOpen, onClose, clientInitial }) => {
  const { toast } = useToast();
  const { fmt, currency } = useCurrency();
  const creer = useCreateCartePointage();

  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState<ClientOption[]>([]);
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [client, setClient] = useState<ClientOption | null>(clientInitial ?? null);
  const [montant, setMontant] = useState('');

  // Réinitialisation à chaque ouverture (pas d'état résiduel entre deux cartes).
  useEffect(() => {
    if (isOpen) {
      setClient(clientInitial ?? null);
      setMontant('');
      setRecherche('');
      setResultats([]);
    }
  }, [isOpen, clientInitial]);

  // Recherche client avec debounce (réseau faible : pas de requête par frappe).
  useEffect(() => {
    if (!recherche || recherche.length < 2 || client) {
      setResultats([]);
      return;
    }
    const timer = setTimeout(() => {
      setRechercheEnCours(true);
      clientApi
        .search(recherche, { perPage: 8 })
        .then((res: any) => setResultats((res?.data ?? []) as ClientOption[]))
        .catch(() => setResultats([]))
        .finally(() => setRechercheEnCours(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [recherche, client]);

  const montantValide = /^\d+(\.\d{1,2})?$/.test(montant) && Number(montant) > 0;

  const handleSubmit = () => {
    if (!client || !montantValide) return;
    creer.mutate(
      { clientId: client.id, unitAmount: montant },
      {
        onSuccess: (carte) => {
          toast({
            title: 'Carte ouverte',
            description: `Référence ${carte.reference} — ${fmt(carte.unitAmount)} par case`,
            variant: 'success',
          });
          onClose();
        },
        onError: (error) => {
          toast({ title: 'Ouverture refusée', description: error.message, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nouvelle carte de pointage"
      subtitle="31 cases — montant fixe par case, sans date d'expiration"
      size="md"
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={creer.isPending}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1"
            isLoading={creer.isPending}
            disabled={!client || !montantValide}
          >
            Ouvrir la carte
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Sélection du client */}
        <div>
          <label htmlFor="cdp-recherche-client" className="mb-1 block text-sm font-medium text-content-primary">
            Client
          </label>
          {client ? (
            <div className="flex items-center justify-between rounded-lg border border-accent bg-accent/5 p-3">
              <div className="flex items-center gap-2 text-sm">
                <UserCheck className="h-4 w-4 text-accent" />
                <span className="font-medium text-content-primary">
                  {[client.prenom, client.nom].filter(Boolean).join(' ')}
                </span>
                {client.telephone && <span className="text-content-muted">{client.telephone}</span>}
              </div>
              {!clientInitial && (
                <Button variant="ghost" size="sm" onClick={() => setClient(null)}>
                  Changer
                </Button>
              )}
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" />
                <Input
                  id="cdp-recherche-client"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Rechercher un client (nom, téléphone…)"
                  className="pl-9"
                />
              </div>
              {(resultats.length > 0 || rechercheEnCours) && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-edge bg-surface shadow-lg">
                  {rechercheEnCours && (
                    <li className="p-2 text-sm text-content-muted">Recherche…</li>
                  )}
                  {resultats.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full p-2 text-left text-sm hover:bg-surface-muted"
                        onClick={() => setClient(c)}
                      >
                        <span className="font-medium text-content-primary">
                          {[c.prenom, c.nom].filter(Boolean).join(' ')}
                        </span>
                        {c.telephone && <span className="ml-2 text-content-muted">{c.telephone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Montant fixe par case */}
        <div>
          <label htmlFor="cdp-montant" className="mb-1 block text-sm font-medium text-content-primary">
            Montant fixe par case ({currency.code})
          </label>
          <Input
            id="cdp-montant"
            inputMode="decimal"
            value={montant}
            onChange={(e) => setMontant(e.target.value.replace(',', '.'))}
            placeholder="Ex : 1500"
            error={montant.length > 0 && !montantValide}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MONTANTS_SUGGERES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMontant(m)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  montant === m
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-edge text-content-secondary hover:bg-surface-muted'
                }`}
              >
                {fmt(m)}
              </button>
            ))}
          </div>
          {montant.length > 0 && !montantValide && (
            <p className="mt-1 text-xs text-status-danger">Montant invalide (nombre positif attendu)</p>
          )}
          <p className="mt-2 text-xs text-content-muted">
            Ce montant est définitif : chaque versement pointera une case de cette valeur.
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default CreateCarteModal;
