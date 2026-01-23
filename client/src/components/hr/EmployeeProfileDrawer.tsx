import React, { useState } from 'react';
import {
  X, User, MapPin, Briefcase, Mail, Phone, CreditCard,
  MoreVertical, CheckCircle, Ban, Calendar, MessageCircle,
  Loader2, FileText, KeyRound, LogOut, Archive, History, Shield
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
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

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

  // Handle chat opening with window.location
  const handleOpenChat = async () => {
    setIsLoadingChat(true);
    try {
      // Navigate to messages page with user ID
      await new Promise(resolve => setTimeout(resolve, 300)); // Small delay for UX
      window.location.href = `/messages?userId=${employee.id}`;
    } catch (error) {
      console.error('Erreur ouverture chat:', error);
      setIsLoadingChat(false);
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
           <div className="flex gap-3 relative">
             <button 
               onClick={() => onEdit && onEdit(employee)}
               className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-colors shadow-lg shadow-indigo-900/20"
             >
               Modifier Profil
             </button>
             
             {/* Message Button with Chat Integration */}
             <button 
               onClick={handleOpenChat}
               disabled={isLoadingChat}
               className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm border border-slate-700 flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-wait"
             >
               {isLoadingChat ? (
                 <Loader2 size={18} className="animate-spin text-indigo-400" />
               ) : (
                 <MessageCircle size={18} />
               )}
               <span className="hidden sm:inline">Message</span>
             </button>
             
             {/* Options Menu */}
             <div className="relative">
               <button 
                 onClick={() => setMenuOpen(!isMenuOpen)}
                 className={`px-3 py-2.5 rounded-xl border transition-colors ${
                   isMenuOpen 
                     ? 'bg-slate-700 border-slate-600 text-white' 
                     : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                 }`}
               >
                 <MoreVertical size={20} />
               </button>

               {/* Enhanced Dropdown Menu */}
               {isMenuOpen && (
                 <>
                   <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                   <div className="absolute right-0 top-12 z-20 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 animate-in fade-in zoom-in-95 origin-top-right">
                     
                     {/* Section Administration */}
                     <div className="px-3 py-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Administration</div>
                     <MenuItem 
                       icon={FileText} 
                       label="Gérer les documents" 
                       onClick={() => { console.log('Docs'); setMenuOpen(false); }} 
                     />
                     <MenuItem 
                       icon={History} 
                       label="Historique d'activité" 
                       onClick={() => { console.log('History'); setMenuOpen(false); }} 
                     />
                     
                     <div className="my-1 border-t border-slate-800" />
                     
                     {/* Section Sécurité */}
                     <div className="px-3 py-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Sécurité</div>
                     <MenuItem 
                       icon={KeyRound} 
                       label="Réinitialiser le mot de passe" 
                       onClick={() => { console.log('Reset pwd'); setMenuOpen(false); }} 
                     />
                     <MenuItem 
                       icon={LogOut} 
                       label="Forcer la déconnexion" 
                       onClick={() => { console.log('Force logout'); setMenuOpen(false); }} 
                     />

                     <div className="my-1 border-t border-slate-800" />

                     {/* Section Danger */}
                     <MenuItem 
                       icon={Ban} 
                       label="Suspendre le compte" 
                       color="text-amber-500 hover:bg-amber-500/10" 
                       onClick={() => { 
                         if (confirm('Êtes-vous sûr de vouloir suspendre ce compte ?')) {
                           console.log('Suspend'); 
                           setMenuOpen(false);
                         }
                       }} 
                     />
                     <MenuItem 
                       icon={Archive} 
                       label="Archiver (Départ)" 
                       color="text-red-500 hover:bg-red-500/10" 
                       onClick={() => { 
                         if (confirm('Êtes-vous sûr de vouloir archiver cet employé ?')) {
                           console.log('Archive'); 
                           setMenuOpen(false);
                         }
                       }} 
                     />
                   </div>
                 </>
               )}
             </div>
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
           {(employee.agenceId || employee.agence) && (
             <Section title="Affectation" icon={MapPin}>
               <div className="col-span-2">
                 <div className="text-xs text-slate-500 font-medium mb-2">Agence</div>
                 <div className="flex items-center gap-2">
                   <div className="text-sm text-slate-200 font-medium">
                     {employee.agence?.nom || 'Agence principale'}
                   </div>
                   {employee.agence?.typeAgence && (
                     <AgencyTypeBadge type={employee.agence.typeAgence} />
                   )}
                 </div>
                 {employee.agence?.codeAgence && (
                   <div className="text-xs text-slate-500 font-mono mt-1">
                     Code: {employee.agence.codeAgence}
                   </div>
                 )}
               </div>
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

function AgencyTypeBadge({ type }: { type: 'MAIN' | 'SECONDARY' | 'KIOSK' }) {
  const getTypeInfo = () => {
    switch (type) {
      case 'MAIN':
        return {
          label: 'Principale',
          colors: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
        };
      case 'SECONDARY':
        return {
          label: 'Secondaire',
          colors: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        };
      case 'KIOSK':
        return {
          label: 'Kiosque',
          colors: 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        };
      default:
        return {
          label: type,
          colors: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        };
    }
  };

  const typeInfo = getTypeInfo();

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${typeInfo.colors}`}>
      {typeInfo.label}
    </span>
  );
}

function MenuItem({ 
  icon: Icon, 
  label, 
  onClick, 
  color = "text-slate-300 hover:bg-slate-800 hover:text-white" 
}: {
  icon: React.ElementType;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  color?: string;
}) {
  return (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${color}`}
    >
      <Icon size={16} /> {label}
    </button>
  );
}
