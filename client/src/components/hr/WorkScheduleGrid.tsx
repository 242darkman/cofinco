import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Save, Plus, Trash2, FileDown, FileUp, ChevronDown } from 'lucide-react';
import { Card, Button, FormField, SelectField } from '../ui';
import { toast } from '../../lib/toast';

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

interface ShiftTemplate {
  id: string;
  nom: string;
  description?: string;
  horaires: { jourSemaine: number; heureDebut: string; heureFin: string; pauseMinutes: number }[];
}

interface WorkScheduleGridProps {
  employeId: string;
  agenceId?: string;
}

export default function WorkScheduleGrid({ employeId, agenceId }: WorkScheduleGridProps) {
  const [horaires, setHoraires] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    fetchHoraires();
    fetchTemplates();
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

  const fetchTemplates = async () => {
    try {
      const url = agenceId ? `/api/hr/shift-templates?agenceId=${agenceId}` : '/api/hr/shift-templates';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e) {
      console.error("Erreur chargement templates:", e);
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    if (!templateId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hr/shift-templates/${templateId}/apply/${employeId}`, {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('Modèle appliqué avec succès');
        fetchHoraires();
      } else {
        toast.error("Erreur lors de l'application du modèle");
      }
    } catch (e) {
      toast.error("Erreur lors de l'application du modèle");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('Veuillez saisir un nom pour le modèle');
      return;
    }
    if (horaires.length === 0) {
      toast.error('Aucun horaire à sauvegarder');
      return;
    }

    setSavingTemplate(true);
    try {
      const templateHoraires = horaires.map(h => ({
        jourSemaine: h.jourSemaine,
        heureDebut: h.heureDebut,
        heureFin: h.heureFin,
        pauseMinutes: h.pauseMinutes || 60,
      }));

      const res = await fetch('/api/hr/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: templateName,
          description: templateDescription || null,
          agenceId: agenceId || null,
          horaires: templateHoraires,
        }),
      });

      if (res.ok) {
        toast.success('Modèle sauvegardé avec succès');
        setShowSaveTemplate(false);
        setTemplateName('');
        setTemplateDescription('');
        fetchTemplates();
      } else {
        toast.error('Erreur lors de la sauvegarde du modèle');
      }
    } catch (e) {
      toast.error('Erreur lors de la sauvegarde du modèle');
    } finally {
      setSavingTemplate(false);
    }
  };

  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const checkOverlap = (jourSemaine: number, debut: string, fin: string, excludeIndex?: number): boolean => {
    const newStart = timeToMinutes(debut);
    const newEnd = timeToMinutes(fin);
    if (newStart >= newEnd) return false; // Invalid range, let validation handle it

    return horaires.some((h, i) => {
      if (i === excludeIndex) return false;
      if (h.jourSemaine !== jourSemaine) return false;
      const existStart = timeToMinutes(h.heureDebut);
      const existEnd = timeToMinutes(h.heureFin);
      // Overlap: newStart < existEnd AND newEnd > existStart
      return newStart < existEnd && newEnd > existStart;
    });
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

    if (checkOverlap(jourSemaine, newHoraire.heureDebut, newHoraire.heureFin)) {
      toast.error(`Chevauchement détecté pour ${JOURS[jourSemaine]}. Ajustez les horaires existants.`);
      return;
    }

    setHoraires([...horaires, newHoraire]);
  };

  const handleUpdateHoraire = (index: number, field: string, value: any) => {
    const updated = [...horaires];
    updated[index] = { ...updated[index], [field]: value };

    // Check overlap when time fields change
    if (field === 'heureDebut' || field === 'heureFin') {
      const entry = updated[index];
      if (entry.heureDebut && entry.heureFin) {
        if (timeToMinutes(entry.heureDebut) >= timeToMinutes(entry.heureFin)) {
          toast.error("L'heure de fin doit être après l'heure de début");
          return;
        }
        if (checkOverlap(entry.jourSemaine, entry.heureDebut, entry.heureFin, index)) {
          toast.error(`Chevauchement détecté pour ${JOURS[entry.jourSemaine]}`);
          return;
        }
      }
    }

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
      toast.success('Horaires sauvegardés');
      fetchHoraires();
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const getHoraireForDay = (jourSemaine: number) => {
    return horaires.filter(h => h.jourSemaine === jourSemaine);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-status-info" />
          <h3 className="text-base sm:text-lg font-bold text-content-primary">Emploi du Temps</h3>
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <select
              className="bg-surface-elevated text-content-primary text-sm px-3 py-2 rounded-lg border border-edge-strong focus:border-status-info"
              onChange={(e) => handleApplyTemplate(e.target.value)}
              defaultValue=""
            >
              <option value="" disabled>Appliquer un modèle...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.nom}</option>
              ))}
            </select>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={FileUp}
            onClick={() => setShowSaveTemplate(true)}
            disabled={horaires.length === 0}
          >
            <span className="hidden sm:inline">Sauvegarder modèle</span>
          </Button>
        </div>
      </div>

      {/* Save Template Modal */}
      {showSaveTemplate && (
        <Card className="p-4 bg-surface border border-status-info/30">
          <h4 className="text-sm font-bold text-content-primary mb-3">Sauvegarder comme modèle</h4>
          <div className="space-y-3">
            <FormField
              name="templateName"
              label="Nom du modèle"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Ex: Horaires standard bureau"
            />
            <FormField
              name="templateDescription"
              label="Description (optionnel)"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="Description du modèle"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowSaveTemplate(false)}>
                Annuler
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
              >
                {savingTemplate ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <div className="space-y-4">
          {/* Mobile: Stack days vertically */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {JOURS.map((jour, index) => {
              const horairesDuJour = getHoraireForDay(index);
              return (
                <div key={index} className="bg-surface rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-content-primary text-sm">{jour}</h4>
                    <button
                      onClick={() => handleAddJour(index)}
                      className="p-1 hover:bg-surface-elevated rounded transition"
                    >
                      <Plus size={16} className="text-status-success" />
                    </button>
                  </div>

                  {horairesDuJour.length === 0 ? (
                    <div className="text-xs text-content-muted text-center py-2">Repos</div>
                  ) : (
                    <div className="space-y-2">
                      {horairesDuJour.map((horaire, hIndex) => {
                        const globalIndex = horaires.findIndex(h => h === horaire);
                        return (
                          <div key={hIndex} className="bg-surface-elevated rounded p-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <Clock size={12} className="text-content-muted" />
                              <input
                                type="time"
                                value={horaire.heureDebut}
                                onChange={(e) => handleUpdateHoraire(globalIndex, 'heureDebut', e.target.value)}
                                className="bg-surface-subtle text-content-primary text-xs px-2 py-1 rounded flex-1"
                              />
                              <span className="text-content-muted text-xs">→</span>
                              <input
                                type="time"
                                value={horaire.heureFin}
                                onChange={(e) => handleUpdateHoraire(globalIndex, 'heureFin', e.target.value)}
                                className="bg-surface-subtle text-content-primary text-xs px-2 py-1 rounded flex-1"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-content-muted">Pause:</span>
                                <input
                                  type="number"
                                  value={horaire.pauseMinutes}
                                  onChange={(e) => handleUpdateHoraire(globalIndex, 'pauseMinutes', parseInt(e.target.value))}
                                  className="bg-surface-subtle text-content-primary text-xs px-2 py-1 rounded w-16"
                                />
                                <span className="text-xs text-content-muted">min</span>
                              </div>
                              <button
                                onClick={() => handleDeleteHoraire(globalIndex)}
                                className="p-1 hover:bg-surface-subtle rounded transition"
                              >
                                <Trash2 size={12} className="text-status-danger" />
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
