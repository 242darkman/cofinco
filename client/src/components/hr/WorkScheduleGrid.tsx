import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Save, Plus, Trash2 } from 'lucide-react';
import { Card, Button, FormField } from '../ui';

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

interface WorkScheduleGridProps {
  employeId: string;
}

export default function WorkScheduleGrid({ employeId }: WorkScheduleGridProps) {
  const [horaires, setHoraires] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchHoraires();
  }, [employeId]);

  const fetchHoraires = async () => {
    try {
      const res = await fetch(`/api/hr/horaires/${employeId}`);
      if (res.ok) {
        const data = await res.json();
        setHoraires(data);
      }
    } catch (e) {
      console.error("Erreur chargement horaires:", e);
    }
  };

  const handleAddJour = (jourSemaine: number) => {
    const newHoraire = {
      jourSemaine,
      heureDebut: '08:00',
      heureFin: '17:00',
      pauseMinutes: 60,
      actif: true,
      isNew: true
    };
    setHoraires([...horaires, newHoraire]);
  };

  const handleUpdateHoraire = (index: number, field: string, value: any) => {
    const updated = [...horaires];
    updated[index] = { ...updated[index], [field]: value };
    setHoraires(updated);
  };

  const handleDeleteHoraire = async (index: number) => {
    const horaire = horaires[index];
    if (horaire.id) {
      try {
        await fetch(`/api/hr/horaires/${horaire.id}`, { method: 'DELETE' });
      } catch (e) {
        console.error("Erreur suppression:", e);
      }
    }
    setHoraires(horaires.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      for (const horaire of horaires) {
        if (horaire.isNew) {
          await fetch('/api/hr/horaires', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeId,
              jourSemaine: horaire.jourSemaine,
              heureDebut: horaire.heureDebut,
              heureFin: horaire.heureFin,
              pauseMinutes: horaire.pauseMinutes
            })
          });
        }
      }
      alert('Horaires sauvegardés');
      fetchHoraires();
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const getHoraireForDay = (jourSemaine: number) => {
    return horaires.filter(h => h.jourSemaine === jourSemaine);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="w-6 h-6 text-blue-400" />
        <h3 className="text-base sm:text-lg font-bold text-white">Emploi du Temps</h3>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="space-y-4">
          {/* Mobile: Stack days vertically */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {JOURS.map((jour, index) => {
              const horairesDuJour = getHoraireForDay(index);
              return (
                <div key={index} className="bg-slate-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-white text-sm">{jour}</h4>
                    <button
                      onClick={() => handleAddJour(index)}
                      className="p-1 hover:bg-slate-700 rounded transition"
                    >
                      <Plus size={16} className="text-emerald-400" />
                    </button>
                  </div>

                  {horairesDuJour.length === 0 ? (
                    <div className="text-xs text-slate-500 text-center py-2">Repos</div>
                  ) : (
                    <div className="space-y-2">
                      {horairesDuJour.map((horaire, hIndex) => {
                        const globalIndex = horaires.findIndex(h => h === horaire);
                        return (
                          <div key={hIndex} className="bg-slate-700 rounded p-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <Clock size={12} className="text-slate-400" />
                              <input
                                type="time"
                                value={horaire.heureDebut}
                                onChange={(e) => handleUpdateHoraire(globalIndex, 'heureDebut', e.target.value)}
                                className="bg-slate-600 text-white text-xs px-2 py-1 rounded flex-1"
                              />
                              <span className="text-slate-400 text-xs">→</span>
                              <input
                                type="time"
                                value={horaire.heureFin}
                                onChange={(e) => handleUpdateHoraire(globalIndex, 'heureFin', e.target.value)}
                                className="bg-slate-600 text-white text-xs px-2 py-1 rounded flex-1"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-400">Pause:</span>
                                <input
                                  type="number"
                                  value={horaire.pauseMinutes}
                                  onChange={(e) => handleUpdateHoraire(globalIndex, 'pauseMinutes', parseInt(e.target.value))}
                                  className="bg-slate-600 text-white text-xs px-2 py-1 rounded w-16"
                                />
                                <span className="text-xs text-slate-400">min</span>
                              </div>
                              <button
                                onClick={() => handleDeleteHoraire(globalIndex)}
                                className="p-1 hover:bg-slate-600 rounded transition"
                              >
                                <Trash2 size={12} className="text-red-400" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            variant="primary"
            fullWidth
            icon={Save}
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Sauvegarde...' : 'Enregistrer l\'emploi du temps'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
