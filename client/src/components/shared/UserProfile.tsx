
import React from 'react';
import { User } from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import LoadingScreen from '../ui/LoadingScreen';
import ProfileHeader from './profile/ProfileHeader';
import ProfileInfo from './profile/ProfileInfo';
import SecuritySection from './profile/SecuritySection';
import PasswordChangeModal from './profile/PasswordChangeModal';

export default function UserProfile() {
  const {
    user, loading, editing, setEditing, saving,
    showPasswordModal, setShowPasswordModal,
    formData, setFormData,
    passwordData, setPasswordData,
    passwordError, setPasswordError,
    handleSaveProfile, handleChangePassword,
    getFullName, getRoleLabel
  } = useUserProfile();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
           <User size={40} className="text-slate-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Session expirée</h3>
        <p className="text-slate-400">Veuillez vous reconnecter pour accéder à votre profil.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
      <ProfileHeader 
        user={user}
        editing={editing}
        onToggleEdit={() => {
          if (editing) {
            setFormData({
              nom: user.nom || '',
              prenom: user.prenom || '',
              email: user.email || '',
              telephone: user.telephone || '',
              username: user.username || ''
            });
          }
          setEditing(!editing);
        }}
        getFullName={getFullName}
        getRoleLabel={getRoleLabel}
      />

      <ProfileInfo 
        user={user}
        editing={editing}
        saving={saving}
        formData={formData}
        setFormData={setFormData}
        onSave={handleSaveProfile}
        onCancel={() => {
          setEditing(false);
          setFormData({
            nom: user.nom || '',
            prenom: user.prenom || '',
            email: user.email || '',
            telephone: user.telephone || '',
            username: user.username || ''
          });
        }}
        getRoleLabel={getRoleLabel}
      />

      <SecuritySection 
        onChangePasswordClick={() => setShowPasswordModal(true)}
      />

      <PasswordChangeModal 
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordError('');
          setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        }}
        passwordData={passwordData}
        setPasswordData={setPasswordData}
        error={passwordError}
        onSubmit={handleChangePassword}
      />
    </div>
  );
}

