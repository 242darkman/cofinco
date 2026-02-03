import React, { useState, useEffect } from 'react';
import { Key, Shield, ArrowLeft } from 'lucide-react';
import { Card, Button, LoadingSpinner } from '../ui';
import TabGroup from '@/components/ui/TabGroup';
import AccessCodeManager from './access-codes/AccessCodeManager';
import PermissionDelegationManager from './access-codes/PermissionDelegationManager';
import { SecurityCode, CaisseAuthorization, User } from './access-codes/types';

interface AdminCaisseAccessCodesProps {
  onClose: () => void;
}

export default function AdminCaisseAccessCodes({ onClose }: AdminCaisseAccessCodesProps) {
  const [activeTab, setActiveTab] = useState('codes');
  const [codes, setCodes] = useState<SecurityCode[]>([]);
  const [permissions, setPermissions] = useState<CaisseAuthorization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [codesRes, authorizationsRes, usersRes] = await Promise.all([
        fetch('/api/caisse/access-codes', { credentials: 'include' }),
        fetch('/api/caisse/authorizations', { credentials: 'include' }),
        fetch('/api/users', { credentials: 'include' })
      ]);

      if (codesRes.ok) setCodes(await codesRes.json());
      if (authorizationsRes.ok) setPermissions(await authorizationsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async (formData: any) => {
    const res = await fetch('/api/caisse/access-codes/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        codeType: formData.codeType || 'EMERGENCY',
        expiresInHours: formData.expiresInHours || 8,
        maxUsages: formData.maxUsages || 1,
        authorizationDurationHours: formData.authorizationDurationHours || 4,
        description: formData.description || undefined,
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Erreur lors de la génération' };
    }
    // Reload data after generation
    await loadData();
    return data;
  };

  const handleRevokeCode = async (codeId: string) => {
    const res = await fetch(`/api/caisse/access-codes/${codeId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (res.ok) await loadData();
  };

  const handleRevokePermission = async (permId: string, reason?: string) => {
    const res = await fetch(`/api/caisse/authorizations/${permId}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason })
    });
    if (res.ok) await loadData();
  };

  return (
    <div className="space-y-4">
      {/* Header - Clean & Professional */}
      <Card className="bg-slate-900 border-slate-800 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-emerald-500/20 rounded-lg flex-shrink-0">
              <Key className="text-emerald-400" size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white truncate">Codes d'Accès Caisse</h2>
              <p className="text-[10px] sm:text-xs text-slate-500 truncate">Gérer les codes de sécurité</p>
            </div>
          </div>
          <Button
            variant="ghost"
            icon={ArrowLeft}
            onClick={onClose}
            size="sm"
            className="flex-shrink-0 text-slate-400 hover:text-white"
          >
            <span className="hidden sm:inline">Retour</span>
          </Button>
        </div>
      </Card>

      {/* Tabs */}
      <TabGroup
        tabs={[
          { key: 'codes', label: 'Codes', icon: Key },
          { key: 'permissions', label: 'Autorisations', icon: Shield }
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Content */}
      {loading ? (
        <Card className="bg-slate-900 border-slate-800 py-12">
          <div className="flex justify-center">
            <LoadingSpinner size="lg" />
          </div>
        </Card>
      ) : (
        <>
          {activeTab === 'codes' && (
            <AccessCodeManager
              codes={codes}
              users={users}
              onRefresh={loadData}
              onRevoke={handleRevokeCode}
              onGenerate={handleGenerateCode}
            />
          )}

          {activeTab === 'permissions' && (
            <PermissionDelegationManager
              permissions={permissions}
              users={users}
              onRefresh={loadData}
              onRevoke={handleRevokePermission}
            />
          )}
        </>
      )}
    </div>
  );
}
