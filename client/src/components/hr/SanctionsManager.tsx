import React, { useState } from 'react';
import { Plus, AlertTriangle, Calendar } from 'lucide-react';
import { Card, Button, Modal, FormField, SelectField, TextareaField, Badge, ResponsiveTable } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';

interface Sanction {
  id: number;
  employeId: string;
  employeNom: string;
  type: 'Avertissement' | 'Blâme' | 'Mise à pied' | 'Autre';
  motif: string;
  date: string;
  gravite: 'Faible' | 'Moyenne' | 'Grave';
}

interface SanctionsManagerProps {
  sanctions: Sanction[];
  onCreate: (data: {
    employeId: string;
    employeNom: string;
    type: string;
    motif: string;
    date: string;
    gravite: string;
  }) => Promise<boolean>;
}

export default function SanctionsManager({
  sanctions,
  onCreate
}: SanctionsManagerProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canCreateSanctions = hasPermission('rh', 'edit') || hasPermission('sanctions', 'create');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeId: '',
    employeNom: '',
    type: 'Avertissement',
    motif: '',
    date: '',
    gravite: 'Moyenne'
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sanctions.length / ITEMS_PER_PAGE);
  const paginatedSanctions = sanctions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await onCreate(formData);
    if (success) {
      setFormData({
        employeId: '',
        employeNom: '',
        type: 'Avertissement',
        motif: '',
        date: '',
        gravite: 'Moyenne'
      });
      setShowForm(false);
    }
  };

  const getGraviteColor = (gravite: string) => {
    switch (gravite) {
      case 'Faible': return 'info';
      case 'Moyenne': return 'warning';
      case 'Grave': return 'danger';
      default: return 'neutral';
    }
  };

  const columns = [
    {
      label: 'Employé',
      key: 'employeNom',
      primary: true,
      format: (val: string, item: Sanction) => (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <AlertTriangle size={18} className="text-orange-400" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-white text-sm truncate">{val}</div>
            <div className="text-[10px] text-slate-400">{item.type}</div>
          </div>
        </div>
      )
    },
    {
      label: 'Date',
      key: 'date',
      hideOnMobile: true,
      format: (val: string) => (
        <div className="flex items-center gap-1 text-xs text-slate-300">
          <Calendar size={12} className="text-slate-500" />
          <span>{new Date(val).toLocaleDateString('fr-FR')}</span>
        </div>
      )
    },
    {
      label: 'Motif',
      key: 'motif',
      hideOnMobile: true,
      format: (val: string) => (
        <span className="text-xs text-slate-300 line-clamp-2">{val}</span>
      )
    },
    {
      label: 'Gravité',
      key: 'gravite',
      format: (val: string) => (
        <Badge variant={getGraviteColor(val)} value={val} size="sm" />
      )
    }
  ];

  return (
    <div className="flex flex-col h-full space-y-2">
      {/* Compact Header Toolbar */}
      <div className="shrink-0 flex justify-between items-center p-1">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
           <AlertTriangle size={16} className="text-orange-400" />
           Sanctions Disciplinaires
        </h3>
        {canCreateSanctions && (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="h-8 text-xs px-3">
            <Plus size={14} />
            <span className="hidden sm:inline">Nouvelle Sanction</span>
          </Button>
        )}
      </div>

      {/* Main Content - Flex Grow */}
      <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-lg flex flex-col">
        <div className="flex-1 overflow-hidden">
          <ResponsiveTable
            data={paginatedSanctions}
            columns={columns}
            mobileBreakpoint="md"
            emptyMessage="Aucune sanction enregistrée."
            maxHeight="100%"
            pagination={{
              page: currentPage,
              totalPages,
              onPageChange: setCurrentPage
            }}
            density="compact"
            className="border-0 rounded-none h-full"
            headerClassName="bg-slate-900 sticky top-0"
          />
        </div>
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvelle Sanction Disciplinaire"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="Employé (ID)"
            name="employeId"
            type="text"
            value={formData.employeId}
            onChange={(e) => setFormData({ ...formData, employeId: e.target.value })}
            required
          />

          <FormField
            label="Nom Employé"
            name="employeNom"
            type="text"
            value={formData.employeNom}
            onChange={(e) => setFormData({ ...formData, employeNom: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Type de Sanction"
              name="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              options={[
                { value: 'Avertissement', label: 'Avertissement' },
                { value: 'Blâme', label: 'Blâme' },
                { value: 'Mise à pied', label: 'Mise à pied' },
                { value: 'Autre', label: 'Autre' }
              ]}
              required
            />

            <SelectField
              label="Gravité"
              name="gravite"
              value={formData.gravite}
              onChange={(e) => setFormData({ ...formData, gravite: e.target.value })}
              options={[
                { value: 'Faible', label: 'Faible' },
                { value: 'Moyenne', label: 'Moyenne' },
                { value: 'Grave', label: 'Grave' }
              ]}
              required
            />
          </div>

          <FormField
            label="Date"
            name="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          <TextareaField
            label="Motif"
            name="motif"
            value={formData.motif}
            onChange={(e) => setFormData({ ...formData, motif: e.target.value })}
            rows={4}
            required
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
            <Button type="submit" variant="danger">
              Enregistrer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
