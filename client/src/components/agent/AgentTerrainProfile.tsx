import React, { useState, useEffect, useRef } from 'react';
import { X, User, Phone, Mail, MapPin, Calendar, Target, TrendingUp, Users, DollarSign, CheckCircle, Clock, Camera, Loader2 } from 'lucide-react';
import { Button, Card, Badge, TabGroup } from '../ui';
import { resolveStorageUrl } from '../../lib/format';

interface AgentTerrainProfileProps {
  agentId: string;
  onClose: () => void;
  onEdit: () => void;
}

export default function AgentTerrainProfile({ agentId, onClose, onEdit }: AgentTerrainProfileProps) {
  const [agent, setAgent] = useState<any>(null);
  const [visites, setVisites] = useState<any[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({
    visitesTotal: 0,
    visitesEffectuees: 0,
    visitesPlanifiees: 0,
    collecteTotal: 0,
    collecteMois: 0,
    clientsProspectes: 0
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadAgentData();
  }, [agentId]);

  const loadAgentData = async () => {
    setLoading(true);

    try {
      const [agentRes, visitesRes] = await Promise.all([
        fetch(`/api/agents-terrain/${agentId}`, { credentials: 'include' }),
        fetch(`/api/agents-terrain/${agentId}/visites`, { credentials: 'include' })
      ]);

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgent(agentData);

        // Fetch employe data to get photo
        const employeId = agentData.employeId;
        if (employeId) {
          try {
            const employeRes = await fetch(`/api/employes/${employeId}`, { credentials: 'include' });
            if (employeRes.ok) {
              const employeData = await employeRes.json();
              const photo = employeData.user?.photoProfile || employeData.photoProfile;
              if (photo) setPhotoUrl(photo);
            }
          } catch {
            // Photo not available, use initials fallback
          }
        }
      }

      if (visitesRes.ok) {
        const visitesData = await visitesRes.json();
        const safeVisites = Array.isArray(visitesData) ? visitesData : [];
        setVisites(safeVisites);

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const calculatedStats = {
          visitesTotal: safeVisites.length,
          visitesEffectuees: safeVisites.filter((v: any) => v.statut === 'Effectuée').length,
          visitesPlanifiees: safeVisites.filter((v: any) => v.statut === 'Planifiée').length,
          collecteTotal: safeVisites.reduce((sum: number, v: any) => sum + (v.montantCollecte || 0), 0),
          collecteMois: safeVisites
            .filter((v: any) => {
              const vDate = new Date(v.dateVisite);
              return vDate.getMonth() === currentMonth && vDate.getFullYear() === currentYear;
            })
            .reduce((sum: number, v: any) => sum + (v.montantCollecte || 0), 0),
          clientsProspectes: safeVisites.filter((v: any) => v.typeVisite === 'Prospection').length
        };

        setStats(calculatedStats);
      }
    } catch (error) {
      console.error('Erreur chargement données agent:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent) return;

    const employeId = agent.employeId;
    if (!employeId) {
      alert('Impossible de mettre à jour la photo: agent non lié à un employé');
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', 'profile');
      formData.append('entityType', 'user');
      formData.append('entityId', employeId);

      const uploadRes = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (!uploadRes.ok) throw new Error('Erreur upload');
      const uploadData = await uploadRes.json();
      const newPhotoUrl = uploadData.url || uploadData.path;

      // Update employe's user photo
      const patchRes = await fetch(`/api/employes/${employeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ photoProfile: newPhotoUrl })
      });

      if (patchRes.ok) {
        setPhotoUrl(newPhotoUrl);
      }
    } catch (error) {
      console.error('Erreur upload photo:', error);
      alert('Erreur lors du téléversement de la photo');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Non défini';
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? 'Non défini' : date.toLocaleDateString('fr-FR');
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
        <div className="text-white animate-pulse">Chargement...</div>
      </div>
    );
  }

  if (!agent) return null;

  const tauxReussite = stats.visitesTotal > 0
    ? Math.round((stats.visitesEffectuees / stats.visitesTotal) * 100)
    : 0;

  const objectifMensuel = agent.objectifMensuel || 0;
  const objectifAtteint = objectifMensuel > 0
    ? Math.round((stats.collecteMois / objectifMensuel) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4 backdrop-blur-sm">
      <div className="bg-surface-base w-full sm:max-w-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-theme-lg animate-in slide-in-from-bottom duration-300">

        {/* Header Compact */}
        <div className="p-4 border-b border-edge flex items-center justify-between gap-3 bg-surface-base shrink-0 sm:rounded-t-2xl">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative group">
              {photoUrl ? (
                <img
                  src={resolveStorageUrl(photoUrl)}
                  alt={`${agent.nom} ${agent.prenom}`}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-blue-500/30 shadow-lg shadow-blue-500/20"
                />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm sm:text-base shrink-0 shadow-lg shadow-blue-500/20">
                  {agent.nom?.charAt(0)}{agent.prenom?.charAt(0)}
                </div>
              )}
              <input
                ref={photoInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
              >
                {uploadingPhoto ? (
                  <Loader2 size={16} className="text-white animate-spin" />
                ) : (
                  <Camera size={16} className="text-white" />
                )}
              </button>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-content-primary truncate">
                {agent.nom} {agent.prenom}
              </h2>
              <p className="text-xs text-content-muted truncate flex items-center gap-1">
                <MapPin size={12} />
                {agent.zoneAffectation || 'Zone non définie'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
             <Button size="sm" variant="primary" onClick={onEdit} icon={User}>
                Modifier
             </Button>
             <button
                onClick={onClose}
                className="p-2 text-content-muted hover:text-content-primary transition-colors"
                aria-label="Fermer"
             >
                <X size={24} />
             </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 pt-4 shrink-0 bg-surface-base">
          <TabGroup
            activeTab={activeTab}
            onTabChange={setActiveTab}
            variant="pills"
            size="sm"
            tabs={[
              { key: 'overview', label: "Vue d'ensemble", icon: User },
              { key: 'visites', label: `Visites (${stats.visitesTotal})`, icon: MapPin },
              { key: 'performance', label: 'Performance', icon: TrendingUp },
            ]}
          />
        </div>

        {/* Content Scrollable */}
        <div className="p-4 overflow-y-auto bg-surface-muted/50 grow">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <Card padding="sm">
                <Card.Header className="text-sm uppercase tracking-wider text-content-muted mb-3 flex items-center gap-2">
                   <User size={14} /> Informations
                </Card.Header>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                       <Phone size={16} />
                    </div>
                    <div className="min-w-0">
                       <p className="text-xs text-content-muted">Téléphone</p>
                       <p className="font-medium text-content-primary truncate">{agent.phone || agent.telephone || '--'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0">
                       <MapPin size={16} />
                    </div>
                    <div className="min-w-0">
                       <p className="text-xs text-content-muted">Zone</p>
                       <p className="font-medium text-content-primary truncate">{agent.zoneAffectation || '--'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                       <Calendar size={16} />
                    </div>
                    <div className="min-w-0">
                       <p className="text-xs text-content-muted">Date d'embauche</p>
                       <p className="font-medium text-content-primary truncate">{formatDate(agent.dateEmbauche)}</p>
                    </div>
                  </div>

                  <div className="pt-2">
                     <Badge value={agent.statut} size="md" />
                  </div>
                </div>
              </Card>

              <Card padding="sm">
                 <Card.Header className="text-sm uppercase tracking-wider text-content-muted mb-3 flex items-center gap-2">
                    <CheckCircle size={14} /> Rôles & Responsabilités
                 </Card.Header>
                 <ul className="space-y-2">
                    {[
                      'Recouvrement tontines et crédits',
                      'Encaissement paiements clients',
                      'Prospection nouveaux clients',
                      'Visites terrain et suivi'
                    ].map((role, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-content-secondary bg-surface-base p-2 rounded border border-edge">
                         <div className="mt-0.5 min-w-[16px]"><CheckCircle size={14} className="text-status-success" /></div>
                         <span className="leading-snug">{role}</span>
                      </li>
                    ))}
                 </ul>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Card padding="sm" className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-500/20">
                   <div className="text-blue-400 mb-1"><Users size={20} /></div>
                   <div className="text-2xl font-bold text-content-primary">{agent.nombreClients || 0}</div>
                   <div className="text-xs text-content-muted">Clients Portefeuille</div>
                </Card>
                <Card padding="sm" className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 border-emerald-500/20">
                   <div className="text-emerald-400 mb-1"><DollarSign size={20} /></div>
                   <div className="text-lg font-bold text-content-primary truncate">{stats.collecteTotal.toLocaleString()} FCFA</div>
                   <div className="text-xs text-content-muted">Collecte Totale</div>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'visites' && (
            <div className="space-y-3">
              {visites.length === 0 ? (
                <div className="text-center py-12 text-content-muted flex flex-col items-center">
                   <MapPin className="w-12 h-12 mb-2 opacity-20" />
                   <p>Aucune visite enregistrée</p>
                </div>
              ) : (
                visites.map(visite => (
                  <Card key={visite.id} padding="sm" className="hover:border-primary/50 cursor-default">
                    <div className="flex justify-between items-start gap-2 mb-2">
                       <div>
                          <p className="font-semibold text-content-primary">{visite.clients?.nom || visite.clientNom || 'Client'}</p>
                          <div className="flex items-center gap-1 text-xs text-content-muted mt-0.5">
                             <Calendar size={10} />
                             {formatDate(visite.dateVisite)}
                          </div>
                       </div>
                       <Badge value={visite.statut} size="sm" />
                    </div>
                    <div className="flex items-center justify-between text-xs border-t border-edge pt-2 mt-2">
                       <span className="px-2 py-0.5 rounded bg-surface-elevated border border-edge text-content-secondary">
                          {visite.typeVisite}
                       </span>
                       {(visite.montantCollecte) > 0 && (
                          <span className="font-mono font-bold text-status-success">
                             {(visite.montantCollecte).toLocaleString()} F
                          </span>
                       )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {activeTab === 'performance' && (
             <div className="space-y-4">
                <Card padding="sm">
                   <div className="flex justify-between items-end mb-2">
                      <div>
                         <p className="text-xs text-content-muted">Objectif Mensuel</p>
                         <p className="text-xl font-bold text-content-primary">{objectifMensuel.toLocaleString()} FCFA</p>
                      </div>
                      <Badge value={`${objectifAtteint}%`} variant={objectifAtteint >= 100 ? 'success' : 'primary'} />
                   </div>
                   <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden mb-1">
                      <div
                         className={`h-full rounded-full transition-all duration-500 ease-out ${
                            objectifAtteint >= 100 ? 'bg-status-success' : 'bg-primary'
                         }`}
                         style={{ width: `${Math.min(objectifAtteint, 100)}%` }}
                      />
                   </div>
                   <p className="text-right text-xs text-content-muted">
                      {stats.collecteMois.toLocaleString()} FCFA réalisés
                   </p>
                </Card>

                <Card padding="sm">
                   <div className="flex justify-between items-end mb-2">
                      <div>
                         <p className="text-xs text-content-muted">Taux de Réussite Visites</p>
                         <p className="text-xl font-bold text-content-primary">{tauxReussite}%</p>
                      </div>
                      <div className="p-1.5 rounded bg-surface-elevated text-content-secondary">
                         <Target size={16} />
                      </div>
                   </div>
                   <div className="w-full bg-surface-elevated rounded-full h-2 overflow-hidden mb-1">
                      <div
                         className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500 ease-out"
                         style={{ width: `${tauxReussite}%` }}
                      />
                   </div>
                   <div className="flex justify-between text-xs text-content-muted">
                      <span>{stats.visitesEffectuees} effectuées</span>
                      <span>Sur {stats.visitesTotal} planifiées</span>
                   </div>
                </Card>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
