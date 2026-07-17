/**
 * Champs spécifiques à la destination d'une évacuation de coffre :
 * banque, coffre central ou transporteur.
 */

import { TypeDestinationEvacuation } from '@shared/enum/status-constants';
import { formatMoney } from '../../../lib/format';
import type { CreateEvacuationController } from './useCreateEvacuation';

export function CreateEvacuationDestinationFields({ controller }: { controller: CreateEvacuationController }) {
  const {
    typeDestination,
    errors,
    banqueNom, setBanqueNom,
    banqueCompte, setBanqueCompte,
    banqueNumeroComptable, setBanqueNumeroComptable,
    coffreDestinationId, setCoffreDestinationId,
    transporteurNom, setTransporteurNom,
    transporteurContact, setTransporteurContact,
    transporteurReference, setTransporteurReference,
    destinationCoffres,
  } = controller;

  if (typeDestination === TypeDestinationEvacuation.BANQUE) {
    return (
      <div className="space-y-4 p-5 bg-surface/30 border border-edge/40 rounded-xl">
        <div className="space-y-2">
          <label className="text-xs font-medium text-content-muted uppercase">Nom de la banque *</label>
          <input
            type="text"
            value={banqueNom}
            onChange={(e) => setBanqueNom(e.target.value)}
            placeholder="Ex: BGFI Bank, Afriland First Bank..."
            className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
              errors.banqueNom ? 'border-status-danger' : 'border-edge focus:border-accent'
            }`}
          />
          {errors.banqueNom && <p className="text-[10px] text-status-danger mt-1">{errors.banqueNom}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-content-muted uppercase">Numéro de compte *</label>
          <input
            type="text"
            value={banqueCompte}
            onChange={(e) => setBanqueCompte(e.target.value)}
            placeholder="Numéro de compte bancaire"
            className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
              errors.banqueCompte ? 'border-status-danger' : 'border-edge focus:border-accent'
            }`}
          />
          {errors.banqueCompte && <p className="text-[10px] text-status-danger mt-1">{errors.banqueCompte}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-content-muted uppercase">N° comptable (GL)</label>
          <input
            type="text"
            value={banqueNumeroComptable}
            onChange={(e) => setBanqueNumeroComptable(e.target.value)}
            placeholder="512"
            className="w-full px-4 py-3 bg-input-bg border border-edge rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
          />
        </div>
      </div>
    );
  }

  if (typeDestination === TypeDestinationEvacuation.COFFRE_CENTRAL) {
    return (
      <div className="space-y-2 p-5 bg-surface/30 border border-edge/40 rounded-xl">
        <label className="text-xs font-medium text-content-muted uppercase">Coffre destination *</label>
        <select
          value={coffreDestinationId}
          onChange={(e) => setCoffreDestinationId(e.target.value)}
          className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
            errors.coffreDestinationId ? 'border-status-danger' : 'border-edge focus:border-accent'
          }`}
        >
          <option value="">Sélectionner un coffre...</option>
          {destinationCoffres.map(c => (
            <option key={c.id} value={c.id}>
              {c.nom} ({c.code}) — {formatMoney(c.solde)}
            </option>
          ))}
        </select>
        {errors.coffreDestinationId && <p className="text-[10px] text-status-danger mt-1">{errors.coffreDestinationId}</p>}
      </div>
    );
  }

  if (typeDestination === TypeDestinationEvacuation.TRANSPORTEUR) {
    return (
      <div className="space-y-4 p-5 bg-surface/30 border border-edge/40 rounded-xl">
        <div className="space-y-2">
          <label className="text-xs font-medium text-content-muted uppercase">Nom du transporteur *</label>
          <input
            type="text"
            value={transporteurNom}
            onChange={(e) => setTransporteurNom(e.target.value)}
            placeholder="Ex: Brinks, Prosegur..."
            className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
              errors.transporteurNom ? 'border-status-danger' : 'border-edge focus:border-accent'
            }`}
          />
          {errors.transporteurNom && <p className="text-[10px] text-status-danger mt-1">{errors.transporteurNom}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-content-muted uppercase">Contact *</label>
          <input
            type="text"
            value={transporteurContact}
            onChange={(e) => setTransporteurContact(e.target.value)}
            placeholder="Numéro ou email"
            className={`w-full px-4 py-3 bg-input-bg border rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 outline-none transition-all ${
              errors.transporteurContact ? 'border-status-danger' : 'border-edge focus:border-accent'
            }`}
          />
          {errors.transporteurContact && <p className="text-[10px] text-status-danger mt-1">{errors.transporteurContact}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-content-muted uppercase">Référence contrat (optionnel)</label>
          <input
            type="text"
            value={transporteurReference}
            onChange={(e) => setTransporteurReference(e.target.value)}
            placeholder="N° contrat ou référence"
            className="w-full px-4 py-3 bg-input-bg border border-edge rounded-xl text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent/30 focus:border-accent outline-none transition-all"
          />
        </div>
      </div>
    );
  }

  return null;
}
