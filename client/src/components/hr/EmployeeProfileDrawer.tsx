import React from 'react';
import {
  X, User, MapPin, Briefcase, Mail, Phone, CreditCard,
  MoreVertical, CheckCircle, Ban, Calendar, MessageCircle
} from 'lucide-react';
import { Employe } from '../../hooks/hr/useEmployes';
import { resolveStorageUrl } from '@/lib/format';
import { StatutUser } from '@shared/enum/status-constants';

interface EmployeeProfileDrawerProps {
  employee: Employe;
  onClose: () => void;
  onEdit?: (employee: Employe) => void;
}

export default function EmployeeProfileDrawer({ employee, onClose, onEdit }: EmployeeProfileDrawerProps) {
  // Helper to get initials
  const getInitials = (nom: string, prenom: string) => {
    return `${(nom || '').charAt(0)}${(prenom || '').charAt(0)}`.toUpperCase();
  };

  // Helper to translate status
  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      [StatutUser.ACTIVE]: 'Actif',
      [StatutUser.INACTIVE]: 'Inactif',
      [StatutUser.SUSPENDED]: 'Suspendu',
      'Congé': 'Congé'
    };
    return statusMap[status] || status;
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" 
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-slate-950 h-full shadow-2xl border-l border-slate-800 flex flex-col animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* HEADER GRAPHIQUE */}
        <div className="relative h-40 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950">
           <button 
             onClick={onClose} 
             className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-md"
           >
             <X size={20} />
           </button>
           
           <div className="absolute -bottom-10 left-8 flex items-end gap-4">
              <div className="w-24 h-24 rounded-2xl bg-slate-900 border-4 border-slate-950 overflow-hidden shadow-2xl">
                 {employee.photoProfile ? (
                   <img 
                     src={resolveStorageUrl(employee.photoProfile)} 
                     alt={`${employee.nom} ${employee.prenom}`}
                     className="w-full h-full object-cover" 
                   />
                 ) : (
                   <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-indigo-700 text-2xl font-bold text-white">
                     {getInitials(employee.nom, employee.prenom)}
                   </div>
                 )}
              </div>
              <div className="mb-2">
                 <h2 className="text-xl font-bold text-white">{employee.nom} {employee.prenom}</h2>
                 <p className="text-indigo-400 font-medium text-sm">{employee.poste || 'Non défini'}</p>
              </div>
           </div>
        </div>

        {/* CONTENU DU DOSSIER */}
        <div className="flex-1 overflow-y-auto pt-14 px-8 pb-8 space-y-8">
           
           {/* Actions Rapides Contextuelles */}
           <div className="flex gap-3">
             <button 
               onClick={() => onEdit && onEdit(employee)}
               className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-900/20"
             >
               Modifier Profil
             </button>
             <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm border border-slate-700 flex items-center gap-2">
               <MessageCircle size={16} />
               <span className="hidden sm:inline">Message</span>
             </button>
             <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700">
               <MoreVertical size={18} />
             </button>
           </div>

           {/* Block 1: Info Pro */}
           <Section title="Informations Professionnelles" icon={Briefcase}>
              <GridItem label="Matricule" value={employee.matricule} mono />
              <GridItem label="Département" value={employee.departement || 'N/A'} />
              <GridItem label="Date d'embauche" value={formatDate(employee.dateEmbauche)} icon={Calendar} />
              <GridItem 
                label="Statut" 
                value={<StatusBadge status={getStatusLabel(employee.statut)} />} 
              />
              <GridItem label="Type Contrat" value={employee.typeContrat} badge />
              <GridItem label="Manager" value={employee.managerNom || 'Aucun'} />
           </Section>

           {/* Block 2: Info Perso */}
           <Section title="Coordonnées & Personnel" icon={User}>
              <GridItem label="Email" value={employee.email || 'Non renseigné'} icon={Mail} />
              <GridItem label="Téléphone" value={employee.phone || 'Non renseigné'} icon={Phone} />
              <GridItem label="Date de naissance" value={formatDate(employee.dateNaissance)} icon={Calendar} />
              <GridItem label="Sexe" value={employee.sexe === 'M' ? 'Masculin' : 'Féminin'} />
              <GridItem 
                label="Adresse" 
                value={employee.adresse ? `${employee.adresse}${employee.ville ? ', ' + employee.ville : ''}` : 'Non renseignée'} 
                icon={MapPin} 
                fullWidth 
              />
           </Section>

           {/* Block 3: Financier */}
           <Section title="Données Financières" icon={CreditCard}>
              <div className="col-span-2 p-4 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center">
                 <div>
                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Salaire de Base</div>
                    <div className="text-2xl font-bold text-emerald-400">
                      {parseFloat(employee.salaireBase || '0').toLocaleString()} FCFA
                    </div>
                    {employee.modeCalculPaie && (
                      <div className="text-xs text-slate-400 mt-1">
                        Mode: {employee.modeCalculPaie === 'MONTHLY' ? 'Mensuel' : employee.modeCalculPaie === 'DAILY' ? 'Journalier' : 'Horaire'}
                      </div>
                    )}
                 </div>
                 <div className="text-right">
                    <div className="text-xs text-slate-500 mb-1">N° CNSS</div>
                    <div className="text-sm text-white font-mono">
                      {employee.numeroCnss || 'Non renseigné'}
                    </div>
                 </div>
              </div>
           </Section>

           {/* Block 4: Agence (if applicable) */}
           {employee.agenceId && (
             <Section title="Affectation" icon={MapPin}>
               <GridItem label="Agence" value="Agence principale" fullWidth />
             </Section>
           )}
        </div>
      </div>
    </div>
  );
}

// --- SOUS-COMPOSANTS ---

function Section({ title, icon: Icon, children }: { 
  title: string; 
  icon: React.ElementType; 
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
       <div className="flex items-center gap-2 text-slate-400 border-b border-slate-800 pb-2">
         <Icon size={18} />
         <h3 className="text-sm font-bold uppercase tracking-wider">{title}</h3>
       </div>
       <div className="grid grid-cols-2 gap-4">
         {children}
       </div>
    </div>
  );
}

function GridItem({ 
  label, 
  value, 
  icon: Icon, 
  fullWidth, 
  mono, 
  badge 
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  fullWidth?: boolean;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div className={`space-y-1 ${fullWidth ? 'col-span-2' : ''}`}>
       <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
         {Icon && <Icon size={12} />} {label}
       </div>
       <div className={`text-sm text-slate-200 font-medium ${
         mono ? 'font-mono bg-slate-900 px-2 py-1 rounded w-fit text-slate-400 border border-slate-800' : ''
       } ${
         badge ? 'bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded text-xs w-fit border border-indigo-500/20 uppercase font-bold' : ''
       }`}>
         {value}
       </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'Actif';
  const isSuspended = status === 'Suspendu';
  
  const getStyles = () => {
    if (isActive) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (isSuspended) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
  };
  
  const getIcon = () => {
    if (isActive) return <CheckCircle size={12} />;
    return <Ban size={12} />;
  };
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStyles()}`}>
      {getIcon()}
      {status}
    </span>
  );
}
