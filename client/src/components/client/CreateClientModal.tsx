
import React, { useState, useEffect, useRef } from 'react';
import {
  User, MapPin, Briefcase, FileText, Camera, ChevronRight,
  ChevronLeft, Save, X, UploadCloud, Check, File as FileIcon
} from 'lucide-react';
import { agenceApi, employeApi } from '../../lib/api-client';
import { isAdminRole, SystemRole } from '@shared/types/roles';
import { useUserProfile } from '../../hooks/useUserProfile';
import { StatutAgence } from '@shared/enum/status-constants';

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}

export default function CreateClientModal({ isOpen, onClose, onSave }: CreateClientModalProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data State
  const [formData, setFormData] = useState({
    // Step 1
    nom: '', 
    prenom: '', 
    dateNaissance: '', 
    sexe: 'M',
    
    // Step 2
    telephoneRaw: '', // stored without prefix for input
    telephone: '', // full phone with prefix
    email: '',
    ville: 'Brazzaville', 
    adresse: '',
    
    // Step 3
    profession: '', 
    secteurId: '', // Type Marche ID
    revenu: '', 
    segment: 'Standard',
    agenceId: '',
    agentReferentId: '',
    
    // Step 4 (Docs)
    files: { photo: null, cniRecto: null, cniVerso: null } as any
  });

  // Reference Data State
  const { user } = useUserProfile();
  const isAdmin = isAdminRole(user?.role);
  const [agences, setAgences] = useState<{ id: string; nom: string }[]>([]);
  const [typesMarches, setTypesMarches] = useState<{id: string; nom: string}[]>([]);
  const [agentsReferents, setAgentsReferents] = useState<{ id: string; nom: string; prenom: string }[]>([]);

  // Load Reference Data
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        // Types Marchés
        const resMarkets = await fetch('/api/types-marches', { credentials: 'include' });
        if (resMarkets.ok) setTypesMarches(await resMarkets.json());

        // Agences (if admin)
        if (isAdmin) {
          const resAgences = await agenceApi.getAll({ statut: StatutAgence.ACTIVE });
          setAgences(resAgences);
        }

        // Agents
        const allEmployees = await employeApi.getAll();
        const agents = (allEmployees || []).filter((emp: any) => {
          const role = emp.roleSystem || emp.user?.role;
          return role === 'terrain' || role === 'chef_agence' ||
                 role === SystemRole.AGENT_TERRAIN || role === SystemRole.CHEF_AGENCE;
        }).map((emp: any) => ({
          id: emp.id,
          nom: emp.user?.nom || emp.nom || '',
          prenom: emp.user?.prenom || emp.prenom || '',
        }));
        setAgentsReferents(agents);

      } catch (err) {
        console.error("Error loading reference data", err);
      }
    };
    loadData();
  }, [isOpen, isAdmin]);

  // Handlers
  const updatedField = (key: string, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d]/g, '');
    updatedField('telephoneRaw', raw);
    updatedField('telephone', `+242${raw}`);
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    // Map fit to legacy structure expected by ClientModule/Service
    const payload = {
      nom: formData.nom,
      prenom: formData.prenom,
      dateNaissance: formData.dateNaissance,
      sexe: formData.sexe,
      
      telephone: formData.telephone,
      email: formData.email,
      ville: formData.ville,
      adresseDomicile: formData.adresse, // mapping to correct field
      
      profession: formData.profession,
      typeMarcheId: formData.secteurId,
      revenuMensuel: formData.revenu,
      segment: formData.segment,
      
      agenceId: formData.agenceId || user?.agenceId, // Fallback to user agency if not admin
      agentReferentId: formData.agentReferentId,
      
      // TODO: Handle File Uploads securely in real flow
      // For now passing as placeholder or separate upload logic would be needed
    };

    try {
      await onSave(payload);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">

      <div className="w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] bg-slate-950 border border-slate-800 rounded-xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* 1. HEADER (Stepper) */}
        <div className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 py-3 sm:py-4 flex-shrink-0">
           <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-white">Nouveau Client</h2>
              <button onClick={onClose} className="p-1"><X className="text-slate-500 hover:text-white w-5 h-5 sm:w-6 sm:h-6" /></button>
           </div>

           {/* Progress Steps */}
           <div className="flex justify-between relative px-1 sm:px-4">
              <div className="absolute top-1/2 left-1 right-1 sm:left-4 sm:right-4 h-0.5 bg-slate-800 -z-0"></div>
              <StepItem num={1} icon={User} label="Identité" current={step} />
              <StepItem num={2} icon={MapPin} label="Contact" current={step} />
              <StepItem num={3} icon={Briefcase} label="Profil Pro" current={step} />
              <StepItem num={4} icon={FileText} label="KYC & Docs" current={step} />
           </div>
        </div>

        {/* 2. BODY (Scrollable on mobile) */}
        <div className="p-4 sm:p-6 md:p-8 flex-1 flex flex-col justify-center relative overflow-y-auto min-h-0">
           
           {/* STEP 1: IDENTITÉ */}
           {step === 1 && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 animate-in slide-in-from-right fade-in duration-300">
                <Input label="Nom" placeholder="Ex: Dupont" value={formData.nom} onChange={e => updatedField('nom', e.target.value)} />
                <Input label="Prénom" placeholder="Ex: Jean" value={formData.prenom} onChange={e => updatedField('prenom', e.target.value)} />

                <Input label="Date de Naissance" type="date" value={formData.dateNaissance} onChange={e => updatedField('dateNaissance', e.target.value)} />
                <Select label="Sexe" value={formData.sexe} onChange={e => updatedField('sexe', e.target.value)}>
                   <option value="M">Masculin</option>
                   <option value="F">Féminin</option>
                </Select>

                <div className="col-span-1 sm:col-span-2 mt-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                   <p className="text-xs text-indigo-300 flex items-center gap-2">
                     <Check size={14} /> Assurez-vous que les informations correspondent strictement à la pièce d'identité.
                   </p>
                </div>
             </div>
           )}

           {/* STEP 2: CONTACT */}
           {step === 2 && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 animate-in slide-in-from-right fade-in duration-300">
                <div className="col-span-1 sm:col-span-2">
                   <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Téléphone *</label>
                   <div className="flex h-11 sm:h-12">
                      <span className="bg-slate-900 border border-slate-700 border-r-0 rounded-l-xl px-3 sm:px-4 flex items-center text-slate-400 text-sm font-mono">+242</span>
                      <input
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-r-xl px-3 sm:px-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-600 font-mono"
                        placeholder="06 000 0000"
                        value={formData.telephoneRaw}
                        onChange={handlePhoneChange}
                      />
                   </div>
                </div>

                <Input label="Email (Optionnel)" type="email" placeholder="client@email.com" value={formData.email} onChange={e => updatedField('email', e.target.value)} />
                <Input label="Ville / Localité" value={formData.ville} onChange={e => updatedField('ville', e.target.value)} />

                <div className="col-span-1 sm:col-span-2">
                   <Input label="Adresse Domicile" placeholder="Quartier, Avenue, N°..." value={formData.adresse} onChange={e => updatedField('adresse', e.target.value)} />
                </div>
             </div>
           )}

           {/* STEP 3: PROFIL PRO */}
           {step === 3 && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 animate-in slide-in-from-right fade-in duration-300">
                <Input label="Profession / Activité" placeholder="Ex: Commerçant" value={formData.profession} onChange={e => updatedField('profession', e.target.value)} />
                <Select
                  label="Secteur d'activité"
                  value={formData.secteurId}
                  onChange={e => updatedField('secteurId', e.target.value)}
                >
                   <option value="">Sélectionner...</option>
                   {typesMarches.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
                </Select>

                <Input label="Revenu Mensuel (Est.)" type="number" placeholder="0" suffix="FCFA" value={formData.revenu} onChange={e => updatedField('revenu', e.target.value)} />
                <Select label="Segment Client" value={formData.segment} onChange={e => updatedField('segment', e.target.value)}>
                   <option value="Standard">Standard</option>
                   <option value="Premium">Premium</option>
                   <option value="VIP">VIP</option>
                   <option value="Entreprise">Entreprise</option>
                </Select>

                <div className="col-span-1 sm:col-span-2 pt-4 border-t border-slate-800 mt-2">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                      {isAdmin ? (
                        <Select label="Agence de rattachement" value={formData.agenceId} onChange={e => updatedField('agenceId', e.target.value)}>
                           <option value="">Sélectionner...</option>
                           {agences.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                        </Select>
                      ) : (
                         <div className="opacity-50 cursor-not-allowed">
                            <Input label="Agence" value={user?.agence || ''} disabled />
                         </div>
                      )}

                      <Select label="Agent Référent" value={formData.agentReferentId} onChange={e => updatedField('agentReferentId', e.target.value)}>
                         <option value="">Sélectionner...</option>
                         {agentsReferents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                      </Select>
                   </div>
                </div>
             </div>
           )}

           {/* STEP 4: KYC & DOCS */}
           {step === 4 && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 animate-in slide-in-from-right fade-in h-full content-start">

                {/* Photo Profil */}
                <PhotoUpload
                  file={formData.files.photo}
                  onFileChange={(file) => setFormData(prev => ({
                    ...prev,
                    files: { ...prev.files, photo: file }
                  }))}
                />

                {/* Info Box */}
                 <div className="col-span-1 flex flex-col justify-center order-first sm:order-none">
                    <div className="p-3 sm:p-4 bg-slate-900 border border-slate-800 rounded-xl">
                       <h4 className="text-sm font-bold text-white mb-2">Documents Requis</h4>
                       <ul className="text-xs text-slate-400 space-y-1">
                          <li className="flex gap-2"><Check size={12} className={formData.files.cniRecto ? "text-emerald-500" : "text-emerald-500"}/> Pièce d'identité valide</li>
                          <li className="flex gap-2"><Check size={12} className={formData.files.photo ? "text-emerald-500" : "text-emerald-500"}/> Photo claire et récente</li>
                          <li className="flex gap-2"><Check size={12} className="text-slate-600"/> Justificatif de domicile (Opt.)</li>
                       </ul>
                    </div>
                 </div>

                {/* CNI Grid */}
                <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <DocUpload
                     label="CNI / Passeport (Recto)"
                     file={formData.files.cniRecto}
                     onFileChange={(file) => setFormData(prev => ({
                       ...prev,
                       files: { ...prev.files, cniRecto: file }
                     }))}
                   />
                   <DocUpload
                     label="CNI / Passeport (Verso)"
                     file={formData.files.cniVerso}
                     onFileChange={(file) => setFormData(prev => ({
                       ...prev,
                       files: { ...prev.files, cniVerso: file }
                     }))}
                   />
                </div>
             </div>
           )}

        </div>

        {/* 3. FOOTER (Navigation) */}
        <div className="p-3 sm:p-4 md:p-6 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-0 flex-shrink-0">
           <button
             onClick={() => step > 1 && setStep(step - 1)}
             className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center justify-center gap-2 text-sm sm:text-base order-2 sm:order-1 ${step === 1 ? 'invisible hidden sm:flex' : ''}`}
           >
              <ChevronLeft size={18} /> <span className="hidden xs:inline">Précédent</span><span className="xs:hidden">Retour</span>
           </button>

           <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 order-1 sm:order-2">
              <button
                onClick={onClose}
                className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition text-sm font-medium"
              >
                Annuler
              </button>

              {step < 4 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 text-sm sm:text-base"
                >
                   Suivant <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-wait text-sm sm:text-base"
                >
                   {isSubmitting ? 'Enregistrement...' : <> <Save size={18} /> <span className="hidden sm:inline">Enregistrer Client</span><span className="sm:hidden">Enregistrer</span> </>}
                </button>
              )}
           </div>
        </div>

      </div>
    </div>
  );
}

// --- Sub-Components Uniformes ---

function StepItem({ num, icon: Icon, label, current }: { num: number, icon: any, label: string, current: number }) {
  const active = current >= num;
  const isCurrent = current === num;
  return (
    <div className="relative z-10 flex flex-col items-center gap-1 sm:gap-2 w-14 sm:w-20">
       <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-300 ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800 text-slate-500 border border-slate-700'} ${isCurrent ? 'ring-2 sm:ring-4 ring-indigo-500/20 scale-105 sm:scale-110' : ''}`}>
          <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
       </div>
       <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider text-center leading-tight ${active ? 'text-white' : 'text-slate-600'}`}>{label}</span>
    </div>
  )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  suffix?: string;
}

function Input({ label, suffix, className, ...props }: InputProps) {
  return (
    <div className="w-full">
       <label className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase mb-1 sm:mb-1.5 block">{label}</label>
       <div className="relative">
          <input className={`w-full h-11 sm:h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 sm:px-4 text-sm sm:text-base text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all ${className}`} {...props} />
          {suffix && <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] sm:text-xs font-bold bg-slate-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded">{suffix}</span>}
       </div>
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

function Select({ label, children, ...props }: SelectProps) {
  return (
    <div className="w-full">
       <label className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase mb-1 sm:mb-1.5 block">{label}</label>
       <div className="relative">
         <select className="w-full h-11 sm:h-12 bg-slate-900 border border-slate-700 rounded-xl px-3 sm:px-4 text-sm sm:text-base text-white focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer" {...props}>
            {children}
         </select>
         <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
           <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
             <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
           </svg>
         </div>
       </div>
    </div>
  )
}

function PhotoUpload({ file, onFileChange }: { file: File | null; onFileChange: (file: File | null) => void }) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const isPdf = file?.type === 'application/pdf';

  useEffect(() => {
    if (file && !isPdf) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreview(null);
    }
  }, [file, isPdf]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    onFileChange(selected);
  };

  const openCamera = async () => {
    setCameraError(null);
    setShowCameraModal(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      setCameraStream(stream);

      // Wait for video element to be ready
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      }, 100);
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Accès à la caméra refusé. Veuillez autoriser l\'accès dans les paramètres.'
          : 'Impossible d\'accéder à la caméra. Essayez d\'importer une photo.'
      );
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const capturedFile = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
          onFileChange(capturedFile);
          closeCamera();
        }
      }, 'image/jpeg', 0.9);
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
    setCameraError(null);
  };

  return (
    <div className="col-span-1 flex flex-col gap-2">
       <label className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase">Photo de Profil</label>

       {/* Hidden file inputs */}
       <input
         ref={cameraInputRef}
         type="file"
         accept="image/*"
         capture="user"
         className="hidden"
         onChange={handleFileChange}
       />
       <input
         ref={fileInputRef}
         type="file"
         accept="image/*,.pdf,application/pdf"
         className="hidden"
         onChange={handleFileChange}
       />

       {/* Preview or Upload Zone */}
       <div className={`flex-1 min-h-[120px] sm:min-h-[140px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors overflow-hidden ${
         file
           ? 'border-emerald-500/50 bg-emerald-500/5'
           : 'border-slate-700 bg-slate-900/50'
       }`}>
          {file ? (
            isPdf ? (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-800/50 p-3 sm:p-4">
                <FileIcon size={28} className="text-red-400 mb-2 sm:w-8 sm:h-8" />
                <span className="text-[11px] sm:text-xs text-slate-300 font-medium truncate max-w-[90%] px-2">{file.name}</span>
                <button
                  onClick={() => onFileChange(null)}
                  className="mt-2 sm:mt-3 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-[11px] sm:text-xs text-white transition"
                >
                  Supprimer
                </button>
              </div>
            ) : (
              <div className="relative w-full h-full group">
                <img src={preview!} alt="Photo" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity">
                  <button
                    onClick={() => onFileChange(null)}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-500 rounded-lg text-xs sm:text-sm text-white font-medium transition"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center p-3 sm:p-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-800 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                 <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500" />
              </div>

              {/* Two action buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={openCamera}
                  className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-[11px] sm:text-xs font-bold text-white transition flex items-center justify-center gap-1.5"
                >
                  <Camera size={14} /> <span className="whitespace-nowrap">Prendre photo</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-[11px] sm:text-xs font-bold text-white transition flex items-center justify-center gap-1.5"
                >
                  <UploadCloud size={14} /> Importer
                </button>
              </div>
            </div>
          )}
       </div>

       {/* Camera Modal */}
       {showCameraModal && (
         <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-2 sm:p-4">
           <div className="bg-slate-900 rounded-xl sm:rounded-2xl overflow-hidden max-w-lg w-full max-h-[90vh] flex flex-col">
             <div className="p-3 sm:p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
               <h3 className="text-white font-bold text-sm sm:text-base">Prendre une photo</h3>
               <button onClick={closeCamera} className="text-slate-400 hover:text-white p-1">
                 <X size={20} />
               </button>
             </div>

             <div className="relative aspect-[4/3] bg-black flex-shrink-0">
               {cameraError ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                   <Camera className="w-10 h-10 sm:w-12 sm:h-12 text-red-400 mb-3 sm:mb-4" />
                   <p className="text-red-400 text-xs sm:text-sm mb-3 sm:mb-4">{cameraError}</p>
                   <button
                     onClick={() => fileInputRef.current?.click()}
                     className="px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs sm:text-sm text-white font-medium"
                   >
                     Importer une photo à la place
                   </button>
                 </div>
               ) : (
                 <video
                   ref={videoRef}
                   autoPlay
                   playsInline
                   muted
                   className="w-full h-full object-cover"
                 />
               )}
               <canvas ref={canvasRef} className="hidden" />
             </div>

             {!cameraError && (
               <div className="p-3 sm:p-4 flex justify-center flex-shrink-0">
                 <button
                   onClick={capturePhoto}
                   className="w-14 h-14 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center hover:bg-slate-200 active:scale-95 transition shadow-lg"
                 >
                   <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-600 rounded-full" />
                 </button>
               </div>
             )}
           </div>
         </div>
       )}
    </div>
  );
}

function DocUpload({ label, file, onFileChange }: { label: string; file: File | null; onFileChange: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const isPdf = file?.type === 'application/pdf';

  useEffect(() => {
    if (file && !isPdf) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreview(null);
    }
  }, [file, isPdf]);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    onFileChange(selected);
  };

  return (
    <div className="flex-1 min-w-0">
       <label className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase mb-1 sm:mb-1.5 block truncate">{label}</label>
       <input
         ref={inputRef}
         type="file"
         accept="image/*,.pdf,application/pdf"
         capture="environment"
         className="hidden"
         onChange={handleChange}
       />
       <div
         onClick={handleClick}
         className={`h-20 sm:h-24 border border-dashed rounded-xl flex items-center justify-center gap-2 sm:gap-3 transition-all cursor-pointer group overflow-hidden ${
           file
             ? 'border-emerald-500/50 bg-emerald-500/5'
             : 'border-slate-700 bg-slate-900/30 hover:border-indigo-500 hover:bg-indigo-500/5 active:border-indigo-500 active:bg-indigo-500/5'
         }`}
       >
          {file ? (
            isPdf ? (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-800/30">
                <FileIcon className="w-5 h-5 sm:w-6 sm:h-6 text-red-400 mb-1" />
                <span className="text-[9px] sm:text-[10px] text-slate-400 truncate max-w-[90%] px-2">{file.name}</span>
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity">
                  <span className="text-[11px] sm:text-xs text-white font-medium">Changer</span>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full">
                <img src={preview!} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity">
                  <span className="text-[11px] sm:text-xs text-white font-medium">Changer</span>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 p-2">
              <UploadCloud className="w-5 h-5 sm:w-5 sm:h-5 text-slate-500 group-hover:scale-110 group-hover:text-indigo-400 transition-all"/>
              <span className="text-[10px] sm:text-xs text-slate-500 group-hover:text-indigo-400 text-center leading-tight">Scanner / Uploader</span>
            </div>
          )}
       </div>
    </div>
  )
}
