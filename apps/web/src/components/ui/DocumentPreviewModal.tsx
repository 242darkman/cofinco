import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, FileText } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  /** If provided, skips the fetch and uses this URL directly */
  preloadedUrl?: string;
  preloadedMimeType?: string;
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  documentId,
  documentName,
  preloadedUrl,
  preloadedMimeType,
}: DocumentPreviewModalProps) {
  const [url, setUrl] = useState<string | null>(preloadedUrl || null);
  const [mimeType, setMimeType] = useState<string | null>(preloadedMimeType || null);
  const [loading, setLoading] = useState(!preloadedUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || preloadedUrl) return;
    let cancelled = false;

    const fetchPreviewUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/hr/documents/${documentId}/preview-url`);
        if (!res.ok) throw new Error('Impossible de charger le document');
        const data = await res.json();
        if (!cancelled) {
          setUrl(data.url);
          setMimeType(data.mimeType);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPreviewUrl();
    return () => { cancelled = true; };
  }, [isOpen, documentId, preloadedUrl]);

  if (!isOpen) return null;

  const isPdf = mimeType?.includes('pdf') || documentName?.toLowerCase().endsWith('.pdf');
  const isImage = mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(documentName || '');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-base border border-edge rounded-xl w-full max-w-3xl max-h-[90vh] mx-4 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-accent shrink-0" />
            <h3 className="text-sm font-bold text-content-primary truncate">{documentName}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition"
                title="Ouvrir dans un nouvel onglet"
              >
                <ExternalLink size={16} />
              </a>
            )}
            {url && (
              <a
                href={url}
                download={documentName}
                className="p-2 text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition"
                title="Télécharger"
              >
                <Download size={16} />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-content-muted hover:text-content-primary hover:bg-surface rounded-lg transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Spinner size="sm" tone="accent" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-content-muted">
              <FileText size={32} className="mb-2 opacity-30" />
              <p className="text-sm">{error}</p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 px-4 py-2 bg-accent-secondary text-white rounded-lg text-sm font-medium hover:bg-accent-secondary-hover transition"
                >
                  Ouvrir le lien externe
                </a>
              )}
            </div>
          ) : isPdf && url ? (
            <iframe
              src={url}
              className="w-full h-full rounded-lg border border-edge bg-surface"
              style={{ minHeight: '500px' }}
              title={documentName}
            />
          ) : isImage && url ? (
            <div className="flex items-center justify-center h-full">
              <img
                src={url}
                alt={documentName}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          ) : url ? (
            <div className="flex flex-col items-center justify-center h-64 text-content-muted">
              <FileText size={48} className="mb-3 opacity-30" />
              <p className="text-sm mb-3">Aperçu non disponible pour ce type de fichier</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-accent-secondary text-white rounded-lg text-sm font-medium hover:bg-accent-secondary-hover transition flex items-center gap-2"
              >
                <Download size={14} />
                Télécharger
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
