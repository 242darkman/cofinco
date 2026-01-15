/**
 * CaisseLiquidationWizard - Wizard en 3 étapes pour la liquidation intelligente
 */

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, ArrowRight, Check } from 'lucide-react';
import { compteEpargneApi } from '../../lib/api-client';

interface Destination {
  id: string;
  nom: string;
  type: 'COFFRE' | 'CAISSE';
  agenceId: string;
  soldeActuel?: string;
}

interface CaisseLiquidationWizardProps {
  isOpen: boolean;
  caisse: {
    id: string;
    nom: string;
    soldeActuel?: string;
  } | null;
  onComplete: () => void;
  onClose: () => void;
}

type Step = 1 | 2 | 3;

export function CaisseLiquidationWizard({
  isOpen,
  caisse,
  onComplete,
  onClose,
}: CaisseLiquidationWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [canDelete, setCanDelete] = useState(false);
  const [soldeActuel, setSoldeActuel] = useState('0');
  const [destinations, setDestinations] = useState<Destination[]>([]);
  
  const [selectedType, setSelectedType] = useState<'COFFRE' | 'CAISSE'>('COFFRE');
  const [selectedDestination, setSelectedDestination] = useState<string>('');

  useEffect(() => {
    if (isOpen && caisse) {
      checkLiquidation();
    }
  }, [isOpen, caisse]);

  const checkLiquidation = async () => {
    if (!caisse) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/caisses/${caisse.id}/liquidation/check`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur lors de la vérification');
      }
      
      const data = await response.json();
      setCanDelete(data.canDelete);
      setSoldeActuel(data.soldeActuel);
      setDestinations(data.availableDestinations || []);
      
      // Auto-select first destination
      if (data.availableDestinations?.length > 0) {
        const firstCoffre = data.availableDestinations.find((d: Destination) => d.type === 'COFFRE');
        if (firstCoffre) {
          setSelectedDestination(firstCoffre.id);
          setSelectedType('COFFRE');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const executeLiquidation = async () => {
    if (!caisse || !selectedDestination) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/caisses/${caisse.id}/liquidation/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          destinationType: selectedType,
          destinationId: selectedDestination,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erreur lors de la liquidation');
      }
      
      onComplete();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !caisse) return null;

  const coffres = destinations.filter(d => d.type === 'COFFRE');
  const caisses = destinations.filter(d => d.type === 'CAISSE');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Liquidation de Caisse - {caisse.nom}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps Indicator */}
        <div className="flex items-center justify-center gap-4 p-6 border-b border-gray-200 dark:border-gray-700">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                }`}
              >
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <ArrowRight
                  className={`w-4 h-4 ${
                    step > s ? 'text-blue-600' : 'text-gray-300'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Vérification */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Étape 1: Vérification
              </h3>
              
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600 dark:text-gray-400">Vérification en cours...</p>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Solde actuel: <strong>{parseFloat(soldeActuel).toLocaleString()} FCFA</strong>
                    </p>
                  </div>

                  {parseFloat(soldeActuel) === 0 ? (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        ✓ La caisse peut être supprimée directement (solde = 0)
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        <AlertCircle className="w-4 h-4 inline mr-2" />
                        Cette caisse contient des fonds. Un transfert est nécessaire avant suppression.
                      </p>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading || parseFloat(soldeActuel) === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuer vers le transfert
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Choix de destination */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Étape 2: Destination du transfert
              </h3>

              <div className="space-y-3">
                {/* Coffre Option */}
                {coffres.length > 0 && (
                  <div>
                    <label className="flex items-start gap-3 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                      <input
                        type="radio"
                        name="destinationType"
                        value="COFFRE"
                        checked={selectedType === 'COFFRE'}
                        onChange={() => {
                          setSelectedType('COFFRE');
                          setSelectedDestination(coffres[0].id);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          Coffre-Fort de l'Agence
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {coffres[0].nom}
                        </div>
                      </div>
                    </label>
                  </div>
                )}

                {/* Caisse Option */}
                {caisses.length > 0 && (
                  <div>
                    <label className="flex items-start gap-3 p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                      <input
                        type="radio"
                        name="destinationType"
                        value="CAISSE"
                        checked={selectedType === 'CAISSE'}
                        onChange={() => {
                          setSelectedType('CAISSE');
                          setSelectedDestination(caisses[0].id);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">
                          Vers une autre Caisse
                        </div>
                        {selectedType === 'CAISSE' && (
                          <select
                            value={selectedDestination}
                            onChange={(e) => setSelectedDestination(e.target.value)}
                            className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                          >
                            {caisses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nom}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selectedDestination}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuer
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Étape 3: Confirmation
              </h3>

              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Montant à transférer:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {parseFloat(soldeActuel).toLocaleString()} FCFA
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Destination:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {destinations.find(d => d.id === selectedDestination)?.nom}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-200">
                  ⚠️ Cette action est irréversible. La caisse sera supprimée après le transfert.
                </p>
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Retour
                </button>
                <button
                  onClick={executeLiquidation}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Liquidation...' : 'Confirmer et Supprimer'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
