import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Loader2, UserPlus, Building2 } from 'lucide-react';
import { employeApi } from '../../lib/api-client';
import { resolveStorageUrl } from '@/lib/format';
import type { EmployeeConversionData } from './CreateClientModal';

interface SelectEmployeeForConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (employee: EmployeeConversionData) => void;
}

export default function SelectEmployeeForConversionModal({ isOpen, onClose, onSelect }: SelectEmployeeForConversionModalProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await employeApi.getAll();
        // Filtrer : uniquement ceux qui n'ont PAS encore de profil client
        const eligible = (data || []).filter((emp: any) => {
          const typeCompte = emp.user?.typeCompte || emp.typeCompte;
          return typeCompte === 'employe';
        });
        // Dédupliquer par ID
        const map = new Map<string, any>();
        for (const emp of eligible) {
          if (!map.has(emp.id)) map.set(emp.id, emp);
        }
        setEmployees(Array.from(map.values()));
      } catch (err) {
        console.error('Error loading employees for conversion', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return employees;
    const q = searchTerm.toLowerCase();
    return employees.filter((emp: any) => {
      const nom = (emp.user?.nom || emp.nom || '').toLowerCase();
      const prenom = (emp.user?.prenom || emp.prenom || '').toLowerCase();
      const matricule = (emp.matricule || '').toLowerCase();
      return nom.includes(q) || prenom.includes(q) || matricule.includes(q) || `${prenom} ${nom}`.includes(q);
    });
  }, [employees, searchTerm]);

  const handleSelect = (emp: any) => {
    onSelect({
      userId: emp.user?.id || emp.userId,
      nom: emp.user?.nom || emp.nom || '',
      prenom: emp.user?.prenom || emp.prenom || '',
      email: emp.user?.email || emp.email || null,
      telephone: emp.user?.telephone || emp.phone || null,
      sexe: (emp.user?.sexe || emp.sexe || null) as 'M' | 'F' | null,
      dateNaissance: emp.user?.dateNaissance || emp.dateNaissance || null,
      adresse: emp.user?.adresse || emp.adresse || null,
      agenceId: emp.agenceId || null,
    });
  };

  const getInitials = (nom: string, prenom: string) =>
    `${(prenom || '').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg max-h-[90vh] bg-surface-base border border-edge rounded-xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-edge flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-content-primary flex items-center gap-2">
              <UserPlus size={20} className="text-accent" />
              Convertir un employé en client
            </h2>
            <p className="text-xs text-content-muted mt-0.5">
              Sélectionnez un employé sans profil client
            </p>
          </div>
          <button onClick={onClose} className="p-1">
            <X className="text-content-muted hover:text-content-primary w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 sm:px-6 py-3 border-b border-edge flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="Rechercher par nom ou matricule..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-surface-base border border-edge rounded-xl text-sm text-content-primary placeholder:text-content-muted focus:ring-2 focus:ring-accent focus:border-accent outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-content-muted">
              <UserPlus size={32} className="mb-2 opacity-40" />
              <p className="text-sm font-medium">
                {employees.length === 0 ? 'Aucun employé éligible' : 'Aucun résultat'}
              </p>
              <p className="text-xs mt-1">
                {employees.length === 0
                  ? 'Tous les employés ont déjà un profil client.'
                  : 'Essayez un autre terme de recherche.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-edge">
              {filtered.map((emp: any) => {
                const nom = emp.user?.nom || emp.nom || '';
                const prenom = emp.user?.prenom || emp.prenom || '';
                const photo = emp.user?.photoProfile || emp.photoProfile;
                const agenceNom = emp.agence?.nom || '';
                const role = emp.user?.role || emp.roleSystem || '';

                return (
                  <button
                    key={emp.id}
                    onClick={() => handleSelect(emp)}
                    className="w-full px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-surface-subtle transition-colors text-left"
                  >
                    {/* Avatar */}
                    {photo ? (
                      <img
                        src={resolveStorageUrl(photo)}
                        alt={`${prenom} ${nom}`}
                        className="w-10 h-10 rounded-full object-cover border border-edge flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">
                        {getInitials(nom, prenom)}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-content-primary truncate">
                        {prenom} {nom}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-content-muted">
                        <span className="font-mono">{emp.matricule}</span>
                        {agenceNom && (
                          <>
                            <span className="text-edge">·</span>
                            <span className="flex items-center gap-1">
                              <Building2 size={10} />
                              {agenceNom}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Role badge */}
                    {role && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 flex-shrink-0">
                        {role.replace(/_/g, ' ')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-edge flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-content-muted">
            {filtered.length} employé{filtered.length > 1 ? 's' : ''} éligible{filtered.length > 1 ? 's' : ''}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-content-muted hover:text-content-primary hover:bg-surface transition"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
