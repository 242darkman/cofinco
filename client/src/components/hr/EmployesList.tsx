import React from 'react';
import { Edit2, Trash2, Phone, Briefcase } from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes'; // Assuming this hook exists and exports Employe
import { SearchInput, Badge, ResponsiveTable, Button, Card } from '../ui';
import { usePermissions } from '../auth/ProtectedFeature';
import { resolveStorageUrl } from '@/lib/format';

interface EmployesListProps {
  employes: Employe[];
  loading: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onEdit: (employe: Employe) => void;
  onDelete: (id: string) => void;
  getStatutColor: (statut: string) => string;
}

export default function EmployesList({
  employes,
  loading,
  searchTerm,
  onSearchChange,
  onEdit,
  onDelete,
  getStatutColor
}: EmployesListProps) {
  // RBAC permissions
  const { hasPermission } = usePermissions();
  const canEditEmployees = hasPermission('rh', 'edit') || hasPermission('users', 'edit');
  const canDeleteEmployees = hasPermission('rh', 'delete') || hasPermission('users', 'delete');

  // Pagination
  const [currentPage, setCurrentPage] = React.useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const totalPages = Math.ceil(employes.length / ITEMS_PER_PAGE);
  const paginatedEmployes = employes.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const columns = [
    {
      label: 'Employé',
      key: 'nom',
      primary: true,
      format: (val: string, item: Employe) => (
        <div className="flex items-center gap-3">
          {item.photoProfile ? (
            <img
              src={resolveStorageUrl(item.photoProfile)}
              alt={`${item.nom} ${item.prenom}`}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0 shadow-sm border-2 border-slate-600"
            />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm">
              {(item.nom || '').charAt(0)}{(item.prenom || '').charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-white truncate text-sm sm:text-base">
              {item.nom} {item.prenom}
            </div>
            {item.phone && (
                <div className="text-[11px] sm:text-xs text-slate-400 flex items-center gap-1">
                  <Phone size={11} />
                  {item.phone}
                </div>
            )}
          </div>
        </div>
      )
    },
    {
      label: 'Matricule',
      key: 'matricule',
      format: (val: string) => <Badge variant="neutral" value={val} className="font-mono text-xs" />
    },
    {
      label: 'Poste',
      key: 'poste',
      hideOnMobile: true,
      format: (val: string) => (
        <div className="flex items-center gap-1.5">
          <Briefcase size={14} className="text-slate-400" />
          <span className="text-sm text-slate-200 font-medium">{val || '-'}</span>
        </div>
      )
    },
    {
      label: 'Département',
      key: 'departement',
      hideOnMobile: true,
      format: (val: string) => <span className="text-sm text-slate-300">{val || '-'}</span>
    },
    {
      label: 'Statut',
      key: 'statut',
      format: (val: string) => {
         const statusMap: any = {
             'Actif': 'success',
             'Congé': 'warning',
             'Suspendu': 'danger'
         };
         return <Badge variant={statusMap[val] || 'neutral'} value={val} size="sm" />;
      }
    },
    {
        label: 'Salaire',
        key: 'salaireBase',
        hideOnMobile: true,
        format: (val: string) => <span className="font-mono text-emerald-400 font-medium text-sm bg-emerald-400/10 px-2 py-1 rounded">{parseFloat(val || '0').toLocaleString()} FCFA</span>
    },
    {
        label: 'Actions',
        key: 'actions',
        format: (_: any, item: Employe) => (
            <div className="flex gap-2 justify-end">
                {canEditEmployees && (
                  <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                      className="h-9 w-9 p-0 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 border border-blue-500/20 rounded-lg transition-all"
                      title="Modifier"
                  >
                      <Edit2 size={16} />
                  </Button>
                )}
                {canDeleteEmployees && (
                  <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                      className="h-9 w-9 p-0 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/20 rounded-lg transition-all"
                      title="Supprimer"
                  >
                      <Trash2 size={16} />
                  </Button>
                )}
            </div>
        )
    }
  ];

  return (
    <div className="space-y-4">
      <Card padding="sm" className="bg-slate-800/80 sticky top-0 z-10 backdrop-blur-md border border-slate-700 shadow-lg">
        <SearchInput
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher par nom, matricule ou poste..."
        />
      </Card>
      
      <Card padding="none" className="bg-slate-900/50 overflow-hidden border-slate-800 shadow-xl">
        <ResponsiveTable
            data={paginatedEmployes}
            columns={columns}
            loading={loading}
            mobileBreakpoint="lg"
            onRowClick={(item) => onEdit(item as Employe)}
            emptyMessage="Aucun employé trouvé."
            maxHeight="600px"
            pagination={{
              page: currentPage,
              totalPages,
              onPageChange: setCurrentPage
            }}
        />
      </Card>
    </div>
  );
}
