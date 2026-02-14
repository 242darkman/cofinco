import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Palette, Upload, X, Eye, Sun, Moon, Check, RotateCcw, Type } from 'lucide-react';
import { useBranding, type BrandingConfig } from '../../contexts/BrandingContext';
import { useCurrency } from '../../contexts/CurrencyContext';

interface BrandingFormData {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  borderRadius: string;
}

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Nunito', label: 'Nunito' },
  { value: 'DM Sans', label: 'DM Sans' },
];

const RADIUS_OPTIONS = [
  { value: 'none', label: 'Aucun', preview: 'rounded-none' },
  { value: 'sm', label: 'Petit', preview: 'rounded-sm' },
  { value: 'md', label: 'Moyen', preview: 'rounded-md' },
  { value: 'lg', label: 'Grand', preview: 'rounded-lg' },
  { value: 'xl', label: 'Extra', preview: 'rounded-xl' },
];

/**
 * WCAG 2.1 relative luminance calculation
 */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * WCAG contrast ratio between two hex colors
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ContrastBadge({ foreground, background }: { foreground: string; background: string }) {
  const ratio = contrastRatio(foreground, background);
  const level = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA Large' : 'Insuffisant';
  const color =
    ratio >= 7
      ? 'text-status-success bg-status-success-bg border-status-success/30'
      : ratio >= 4.5
        ? 'text-status-success bg-status-success-bg border-status-success/30'
        : ratio >= 3
          ? 'text-status-warning bg-status-warning-bg border-status-warning/30'
          : 'text-status-danger bg-status-danger-bg border-status-danger/30';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border ${color}`}>
      {level} ({ratio.toFixed(1)}:1)
    </span>
  );
}

export default function AdminBrandingSettings() {
  const { branding } = useBranding();
  const { currency } = useCurrency();
  const [form, setForm] = useState<BrandingFormData>({
    appName: '',
    logoUrl: null,
    primaryColor: '#0f766e',
    accentColor: '#c2410c',
    fontFamily: 'Inter',
    borderRadius: 'lg',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState<'dark' | 'light'>('dark');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/branding');
      if (res.ok) {
        const data: BrandingConfig = await res.json();
        setForm({
          appName: data.appName || '',
          logoUrl: data.logoUrl,
          primaryColor: data.primaryColor || '#3b82f6',
          accentColor: data.accentColor || '#10b981',
          fontFamily: data.fontFamily || 'Inter',
          borderRadius: data.borderRadius || 'lg',
        });
      }
    } catch {
      toast.error('Erreur de chargement de la configuration branding');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type)) {
      toast.error('Format non supporte. Utilisez PNG, JPG, SVG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Le fichier ne doit pas depasser 2 Mo');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', 'misc');
      formData.append('entityType', 'user');
      formData.append('entityId', 'system-branding');

      const res = await fetch('/api/storage/entity/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload echoue');
      const data = await res.json();
      setForm(prev => ({ ...prev, logoUrl: data.url || data.key }));
      toast.success('Logo telecharge');
    } catch {
      toast.error('Erreur lors du telechargement du logo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.appName.trim()) {
      toast.error('Le nom de l\'application est obligatoire');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      toast.success('Branding mis a jour. Les changements sont appliques en temps reel.');
    } catch {
      toast.error('Erreur lors de la sauvegarde du branding');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm({
      appName: branding.appName,
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      fontFamily: branding.fontFamily,
      borderRadius: branding.borderRadius,
    });
  };

  const hasChanges =
    form.appName !== branding.appName ||
    form.logoUrl !== branding.logoUrl ||
    form.primaryColor !== branding.primaryColor ||
    form.accentColor !== branding.accentColor ||
    form.fontFamily !== branding.fontFamily ||
    form.borderRadius !== branding.borderRadius;

  const darkBg = '#0f172a';
  const lightBg = '#f8fafc';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-accent-bg rounded-lg">
          <Palette size={24} className="text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-content-primary">Branding & Identite visuelle</h2>
          <p className="text-sm text-content-muted mt-1">
            Personnalisez le nom, le logo et les couleurs de l'application.
            Les changements s'appliquent en temps reel a tous les utilisateurs connectes.
          </p>
        </div>
      </div>

      {/* App Name */}
      <div className="bg-surface/50 border border-edge rounded-lg p-4 space-y-3">
        <label className="block text-sm font-medium text-content-secondary">
          Nom de l'application
        </label>
        <input
          type="text"
          value={form.appName}
          onChange={(e) => setForm(prev => ({ ...prev, appName: e.target.value }))}
          placeholder="Mon Application"
          maxLength={50}
          className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary placeholder-content-muted focus:border-accent focus:outline-none"
        />
        <p className="text-xs text-content-muted">
          Affiche dans la barre laterale, l'ecran de connexion, les PDFs et les notifications.
        </p>
      </div>

      {/* Logo */}
      <div className="bg-surface/50 border border-edge rounded-lg p-4 space-y-3">
        <label className="block text-sm font-medium text-content-secondary">
          Logo
        </label>
        <div className="flex items-center gap-4">
          {form.logoUrl ? (
            <div className="relative group">
              <img
                src={form.logoUrl}
                alt="Logo"
                className="w-16 h-16 object-contain rounded-lg border border-edge bg-surface-base p-1"
              />
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, logoUrl: null }))}
                className="absolute -top-2 -right-2 p-1 bg-status-danger rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-lg border-2 border-dashed border-edge-strong flex items-center justify-center text-content-muted">
              <Upload size={20} />
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-xs font-medium text-accent bg-accent-bg border border-accent/30 rounded-lg hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              {uploading ? 'Telechargement...' : form.logoUrl ? 'Changer le logo' : 'Telecharger un logo'}
            </button>
            <p className="text-xs text-content-muted mt-1">PNG, JPG, SVG ou WebP. Max 2 Mo.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={handleLogoUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Colors */}
      <div className="bg-surface/50 border border-edge rounded-lg p-4 space-y-4">
        <label className="block text-sm font-medium text-content-secondary">
          Couleurs d'accent
        </label>

        <div className="grid grid-cols-2 gap-4">
          {/* Primary Color */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">Couleur principale</span>
              <ContrastBadge foreground={form.primaryColor} background={darkBg} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-edge cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                    setForm(prev => ({ ...prev, primaryColor: v }));
                  }
                }}
                maxLength={7}
                className="flex-1 px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm font-mono text-content-primary focus:border-accent focus:outline-none"
              />
            </div>
            <p className="text-xs text-content-muted">Boutons, liens, focus</p>
          </div>

          {/* Accent Color */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-content-muted">Couleur secondaire</span>
              <ContrastBadge foreground={form.accentColor} background={darkBg} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm(prev => ({ ...prev, accentColor: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-edge cursor-pointer bg-transparent"
              />
              <input
                type="text"
                value={form.accentColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                    setForm(prev => ({ ...prev, accentColor: v }));
                  }
                }}
                maxLength={7}
                className="flex-1 px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm font-mono text-content-primary focus:border-accent focus:outline-none"
              />
            </div>
            <p className="text-xs text-content-muted">Accents, badges, succes</p>
          </div>
        </div>

        {/* Light mode contrast */}
        <div className="pt-2 border-t border-edge-subtle">
          <div className="flex items-center gap-4 text-xs text-content-muted">
            <span>Contraste sur fond clair :</span>
            <span className="flex items-center gap-1">
              Principale <ContrastBadge foreground={form.primaryColor} background={lightBg} />
            </span>
            <span className="flex items-center gap-1">
              Secondaire <ContrastBadge foreground={form.accentColor} background={lightBg} />
            </span>
          </div>
        </div>
      </div>

      {/* Typography & Radius */}
      <div className="bg-surface/50 border border-edge rounded-lg p-4 space-y-4">
        <label className="block text-sm font-medium text-content-secondary">
          Typographie & Arrondis
        </label>

        <div className="grid grid-cols-2 gap-4">
          {/* Font */}
          <div className="space-y-2">
            <span className="text-xs text-content-muted flex items-center gap-1">
              <Type size={12} /> Police
            </span>
            <select
              value={form.fontFamily}
              onChange={(e) => setForm(prev => ({ ...prev, fontFamily: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-base/50 border border-edge-strong rounded-lg text-sm text-content-primary focus:border-accent focus:outline-none"
            >
              {FONT_OPTIONS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* Border Radius */}
          <div className="space-y-2">
            <span className="text-xs text-content-muted">Arrondis</span>
            <div className="flex gap-2">
              {RADIUS_OPTIONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, borderRadius: r.value }))}
                  className={`flex-1 py-2 text-xs font-medium border transition-all ${
                    form.borderRadius === r.value
                      ? 'border-accent bg-accent-bg text-accent'
                      : 'border-edge bg-surface-base/50 text-content-muted hover:border-edge-strong'
                  } ${r.preview}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview */}
      <div className="bg-surface/50 border border-edge rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-content-secondary flex items-center gap-2">
            <Eye size={14} /> Apercu en temps reel
          </label>
          <div className="flex items-center gap-1 bg-surface-base rounded-lg p-0.5 border border-edge-subtle">
            <button
              type="button"
              onClick={() => setPreviewMode('dark')}
              className={`p-1.5 rounded-md transition-colors ${previewMode === 'dark' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted'}`}
            >
              <Moon size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('light')}
              className={`p-1.5 rounded-md transition-colors ${previewMode === 'light' ? 'bg-surface-elevated text-content-primary' : 'text-content-muted'}`}
            >
              <Sun size={14} />
            </button>
          </div>
        </div>

        {/* Preview Card */}
        <div
          className={`rounded-xl border overflow-hidden transition-colors ${
            previewMode === 'dark'
              ? 'bg-[#0f172a] border-[#334155]'
              : 'bg-[#f8fafc] border-[#e2e8f0]'
          }`}
        >
          {/* Preview Sidebar */}
          <div className="flex">
            <div
              className={`w-48 p-3 border-r ${
                previewMode === 'dark'
                  ? 'bg-[#1e293b] border-[#334155]'
                  : 'bg-white border-[#e2e8f0]'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                {form.logoUrl ? (
                  <img src={form.logoUrl} alt="" className="w-6 h-6 rounded object-contain" />
                ) : (
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: form.primaryColor }}
                  >
                    {form.appName.charAt(0)}
                  </div>
                )}
                <span
                  className={`text-xs font-semibold truncate ${
                    previewMode === 'dark' ? 'text-white' : 'text-[#1e293b]'
                  }`}
                  style={{ fontFamily: form.fontFamily }}
                >
                  {form.appName || 'Mon App'}
                </span>
              </div>
              {['Dashboard', 'Clients', 'Caisse'].map((item, i) => (
                <div
                  key={item}
                  className={`text-[10px] px-2 py-1.5 rounded-md mb-0.5 ${
                    i === 0
                      ? 'text-white font-medium'
                      : previewMode === 'dark' ? 'text-[#94a3b8]' : 'text-[#64748b]'
                  }`}
                  style={i === 0 ? { backgroundColor: form.primaryColor + '20', color: form.primaryColor } : undefined}
                >
                  {item}
                </div>
              ))}
            </div>

            {/* Preview Content */}
            <div className="flex-1 p-3 space-y-2">
              <div
                className={`text-xs font-semibold ${previewMode === 'dark' ? 'text-white' : 'text-[#1e293b]'}`}
                style={{ fontFamily: form.fontFamily }}
              >
                Bienvenue sur {form.appName || 'Mon App'}
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 text-[10px] text-white rounded-md font-medium"
                  style={{
                    backgroundColor: form.primaryColor,
                    borderRadius: form.borderRadius === 'none' ? '0' : form.borderRadius === 'sm' ? '2px' : form.borderRadius === 'md' ? '6px' : form.borderRadius === 'xl' ? '12px' : '8px',
                  }}
                >
                  Bouton principal
                </button>
                <button
                  className="px-3 py-1 text-[10px] text-white rounded-md font-medium"
                  style={{
                    backgroundColor: form.accentColor,
                    borderRadius: form.borderRadius === 'none' ? '0' : form.borderRadius === 'sm' ? '2px' : form.borderRadius === 'md' ? '6px' : form.borderRadius === 'xl' ? '12px' : '8px',
                  }}
                >
                  Bouton accent
                </button>
              </div>
              <div
                className={`p-2 rounded-md border text-[10px] ${
                  previewMode === 'dark'
                    ? 'bg-[#1e293b] border-[#334155] text-[#94a3b8]'
                    : 'bg-white border-[#e2e8f0] text-[#64748b]'
                }`}
                style={{
                  borderRadius: form.borderRadius === 'none' ? '0' : form.borderRadius === 'sm' ? '2px' : form.borderRadius === 'md' ? '6px' : form.borderRadius === 'xl' ? '12px' : '8px',
                }}
              >
                <span style={{ color: form.primaryColor, fontWeight: 600 }}>12 450 000 {currency.symbol}</span>
                <span className="ml-1">— Solde total</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleReset}
          disabled={!hasChanges}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-content-muted hover:text-content-secondary transition-colors disabled:opacity-30"
        >
          <RotateCcw size={14} />
          Reinitialiser
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving || !form.appName.trim()}
          className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            hasChanges && form.appName.trim()
              ? 'bg-accent hover:bg-accent/80 text-white'
              : 'bg-surface-elevated text-content-muted cursor-not-allowed'
          }`}
        >
          <Check size={14} />
          {saving ? 'Enregistrement...' : 'Appliquer les changements'}
        </button>
      </div>
    </div>
  );
}
