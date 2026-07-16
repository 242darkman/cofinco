import React, { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, Mail, Edit2, Eye, Save, X, Check, AlertTriangle,
  Loader2, Search, ToggleLeft, ToggleRight, Code, FileText,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { Button, Badge, FormField, Modal, TextareaField } from '../../ui';
import { notificationTemplatesApi, SmsTemplate, EmailTemplate } from '../../../lib/api-client';
import { toast } from '../../../lib/toast';
import { usePermissions } from '../../auth/ProtectedFeature';
import NotificationPreview from './NotificationPreview';

type TemplateType = 'sms' | 'email';

interface EditFormData {
  nom: string;
  contenu?: string;
  subject?: string;
  contenuHtml?: string;
  contenuText?: string;
  placeholders: string;
  description: string;
  actif: boolean;
}

export default function NotificationTemplatesAdmin() {
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('settings', 'manage') || hasPermission('admin', 'manage');

  const [activeTab, setActiveTab] = useState<TemplateType>('sms');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<(SmsTemplate | EmailTemplate) | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<(SmsTemplate | EmailTemplate) | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>({
    nom: '',
    contenu: '',
    subject: '',
    contenuHtml: '',
    contenuText: '',
    placeholders: '',
    description: '',
    actif: true,
  });

  // Pagination state
  const [smsPage, setSmsPage] = useState(1);
  const [emailPage, setEmailPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Fetch SMS templates
  const { data: smsTemplates = [], isLoading: loadingSms } = useQuery({
    queryKey: ['sms-templates'],
    queryFn: notificationTemplatesApi.getSmsTemplates,
  });

  // Fetch Email templates
  const { data: emailTemplates = [], isLoading: loadingEmail } = useQuery({
    queryKey: ['email-templates'],
    queryFn: notificationTemplatesApi.getEmailTemplates,
  });

  const templates = activeTab === 'sms' ? smsTemplates : emailTemplates;
  const isLoading = activeTab === 'sms' ? loadingSms : loadingEmail;

  const filteredTemplates = templates.filter(t =>
    t.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  );

  // Reset page when search term or tab changes
  const currentPage = activeTab === 'sms' ? smsPage : emailPage;
  const setCurrentPage = activeTab === 'sms' ? setSmsPage : setEmailPage;

  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setSmsPage(1);
    setEmailPage(1);
  };

  // Reset page when tab changes
  const handleTabChange = (tab: TemplateType) => {
    setActiveTab(tab);
  };

  // Paginated templates
  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTemplates.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTemplates, currentPage]);

  const totalPages = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);

  const handleEdit = useCallback((template: SmsTemplate | EmailTemplate) => {
    setEditingTemplate(template);
    if ('contenu' in template) {
      // SMS template
      setEditForm({
        nom: template.nom,
        contenu: template.contenu,
        placeholders: template.placeholders || '',
        description: template.description || '',
        actif: template.actif,
      });
    } else {
      // Email template
      setEditForm({
        nom: template.nom,
        subject: template.subject,
        contenuHtml: template.contenuHtml,
        contenuText: template.contenuText,
        placeholders: template.placeholders || '',
        description: template.description || '',
        actif: template.actif,
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingTemplate) return;

    setSaving(true);
    try {
      if (activeTab === 'sms') {
        await notificationTemplatesApi.updateSmsTemplate(editingTemplate.id, {
          nom: editForm.nom,
          contenu: editForm.contenu,
          placeholders: editForm.placeholders,
          description: editForm.description,
          actif: editForm.actif,
        });
        queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      } else {
        await notificationTemplatesApi.updateEmailTemplate(editingTemplate.id, {
          nom: editForm.nom,
          subject: editForm.subject,
          contenuHtml: editForm.contenuHtml,
          contenuText: editForm.contenuText,
          placeholders: editForm.placeholders,
          description: editForm.description,
          actif: editForm.actif,
        });
        queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      }
      toast.success('Template mis a jour');
      setEditingTemplate(null);
    } catch (error: any) {
      toast.error(error.message || 'Erreur lors de la mise a jour');
    } finally {
      setSaving(false);
    }
  }, [editingTemplate, editForm, activeTab, queryClient]);

  const handleToggleActive = useCallback(async (template: SmsTemplate | EmailTemplate) => {
    try {
      if (activeTab === 'sms') {
        await notificationTemplatesApi.updateSmsTemplate(template.id, { actif: !template.actif });
        queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
      } else {
        await notificationTemplatesApi.updateEmailTemplate(template.id, { actif: !template.actif });
        queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      }
      toast.success(template.actif ? 'Template desactive' : 'Template active');
    } catch (error: any) {
      toast.error(error.message || 'Erreur');
    }
  }, [activeTab, queryClient]);

  const getPlaceholdersList = (placeholders?: string) => {
    if (!placeholders) return [];
    return placeholders.split(',').map(p => p.trim()).filter(Boolean);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-content-primary flex items-center gap-2">
            <FileText size={20} className="text-status-info" />
            Templates de Notification
          </h2>
          <p className="text-xs text-content-muted mt-1">
            Gerez les modeles SMS et Email pour les notifications automatiques
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-edge">
        <button
          onClick={() => handleTabChange('sms')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'sms'
              ? 'text-accent border-accent'
              : 'text-content-muted border-transparent hover:text-content-primary'
          }`}
        >
          <MessageSquare size={16} />
          SMS ({smsTemplates.length})
        </button>
        <button
          onClick={() => handleTabChange('email')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'email'
              ? 'text-status-info border-status-info'
              : 'text-content-muted border-transparent hover:text-content-primary'
          }`}
        >
          <Mail size={16} />
          Email ({emailTemplates.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
        <input
          type="text"
          placeholder="Rechercher par code ou nom..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-status-info focus:outline-none"
        />
      </div>

      {/* Templates list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-surface-base/50 rounded-lg border border-edge">
          <FileText size={40} className="mx-auto text-content-muted mb-3" />
          <p className="text-sm text-content-muted">Aucun template trouve</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Results count */}
          <div className="flex items-center justify-between text-xs text-content-muted">
            <span>
              {filteredTemplates.length} template{filteredTemplates.length > 1 ? 's' : ''}
              {searchTerm && ` pour "${searchTerm}"`}
            </span>
            <span>
              Affichage {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredTemplates.length)} sur {filteredTemplates.length}
            </span>
          </div>

          {paginatedTemplates.map((template) => {
            const placeholders = getPlaceholdersList(template.placeholders);
            const isSms = 'contenu' in template;

            return (
              <div
                key={template.id}
                className={`bg-surface-base/50 border rounded-lg p-4 transition ${
                  template.actif ? 'border-edge' : 'border-edge/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded ${isSms ? 'bg-accent/10' : 'bg-status-info-bg'}`}>
                        {isSms ? (
                          <MessageSquare size={14} className="text-accent" />
                        ) : (
                          <Mail size={14} className="text-status-info" />
                        )}
                      </div>
                      <span className="font-mono text-sm text-status-info">{template.code}</span>
                      <Badge
                        variant={template.actif ? 'success' : 'neutral'}
                        value={template.actif ? 'Actif' : 'Inactif'}
                        size="xs"
                      />
                    </div>

                    <h4 className="text-sm font-medium text-content-primary mb-1">{template.nom}</h4>

                    {template.description && (
                      <p className="text-xs text-content-muted mb-2 line-clamp-1">{template.description}</p>
                    )}

                    {/* Preview content */}
                    <div className="bg-surface/50 rounded p-2 mb-2">
                      <p className="text-xs text-content-muted line-clamp-2 font-mono">
                        {isSms ? (template as SmsTemplate).contenu : (template as EmailTemplate).contenuText}
                      </p>
                    </div>

                    {/* Placeholders */}
                    {placeholders.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {placeholders.map((p, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 bg-status-info-bg text-status-info text-[10px] rounded font-mono"
                          >
                            {`{{${p}}}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="p-2 text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition"
                      title="Apercu"
                    >
                      <Eye size={16} />
                    </button>
                    {canEdit && (
                      <>
                        <button
                          onClick={() => handleEdit(template)}
                          className="p-2 text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition"
                          title="Modifier"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(template)}
                          className={`p-2 rounded-lg transition ${
                            template.actif
                              ? 'text-status-success hover:bg-status-success-bg'
                              : 'text-content-muted hover:bg-surface-elevated'
                          }`}
                          title={template.actif ? 'Desactiver' : 'Activer'}
                        >
                          {template.actif ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-edge">
              <span className="text-xs text-content-muted">
                Page {currentPage} sur {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded hover:bg-surface-elevated/50 disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 text-xs rounded ${
                        currentPage === pageNum
                          ? activeTab === 'sms' ? 'bg-accent-secondary text-white' : 'bg-status-info text-white'
                          : 'hover:bg-surface-elevated/50 text-content-muted'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded hover:bg-surface-elevated/50 disabled:opacity-30 disabled:cursor-not-allowed text-content-muted"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={!!editingTemplate}
        onClose={() => setEditingTemplate(null)}
        title={`Modifier le template ${activeTab.toUpperCase()}`}
        size="lg"
      >
        {editingTemplate && (
          <div className="space-y-4">
            <div className="bg-surface/50 rounded-lg p-3">
              <span className="text-xs text-content-muted">Code</span>
              <p className="font-mono text-status-info">{editingTemplate.code}</p>
            </div>

            <FormField
              label="Nom"
              name="nom"
              value={editForm.nom}
              onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
              required
            />

            {activeTab === 'sms' ? (
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">
                  Contenu SMS
                </label>
                <textarea
                  value={editForm.contenu || ''}
                  onChange={(e) => setEditForm({ ...editForm, contenu: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info"
                />
                <p className="text-xs text-content-muted mt-1">
                  {(editForm.contenu || '').length} caracteres
                  {(editForm.contenu || '').length > 160 && (
                    <span className="text-status-warning ml-2">
                      ({Math.ceil((editForm.contenu || '').length / 160)} SMS)
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <>
                <FormField
                  label="Sujet"
                  name="subject"
                  value={editForm.subject || ''}
                  onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-2">
                    Contenu HTML
                  </label>
                  <textarea
                    value={editForm.contenuHtml || ''}
                    onChange={(e) => setEditForm({ ...editForm, contenuHtml: e.target.value })}
                    rows={8}
                    className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-2">
                    Contenu Texte (fallback)
                  </label>
                  <textarea
                    value={editForm.contenuText || ''}
                    onChange={(e) => setEditForm({ ...editForm, contenuText: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 bg-surface border border-edge rounded-lg text-sm text-content-primary font-mono focus:ring-1 focus:ring-status-info"
                  />
                </div>
              </>
            )}

            <FormField
              label="Variables (separees par virgule)"
              name="placeholders"
              value={editForm.placeholders}
              onChange={(e) => setEditForm({ ...editForm, placeholders: e.target.value })}
              placeholder="clientName,amount,date"
            />

            <FormField
              label="Description"
              name="description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.actif}
                onChange={(e) => setEditForm({ ...editForm, actif: e.target.checked })}
                className="w-4 h-4 rounded border-edge-strong bg-surface text-status-info focus:ring-status-info"
              />
              <span className="text-sm text-content-secondary">Template actif</span>
            </label>

            <div className="flex justify-end gap-3 pt-4 border-t border-edge">
              <Button variant="secondary" onClick={() => setEditingTemplate(null)}>
                Annuler
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : <Save size={14} className="mr-2" />}
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Preview Modal */}
      {previewTemplate && (
        <Modal
          isOpen={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          title="Apercu du template"
          size="lg"
        >
          <NotificationPreview
            template={{
              id: previewTemplate.id,
              code: previewTemplate.code,
              name: previewTemplate.nom,
              channel: 'contenu' in previewTemplate ? 'SMS' : 'EMAIL',
              content: 'contenu' in previewTemplate
                ? (previewTemplate as SmsTemplate).contenu
                : (previewTemplate as EmailTemplate).contenuHtml,
              subject: 'subject' in previewTemplate ? (previewTemplate as EmailTemplate).subject : undefined,
              placeholders: getPlaceholdersList(previewTemplate.placeholders),
            }}
            onClose={() => setPreviewTemplate(null)}
          />
        </Modal>
      )}
    </div>
  );
}
