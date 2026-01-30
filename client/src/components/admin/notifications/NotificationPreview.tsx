/**
 * Notification Content Preview Component
 * Preview rendered notification content before sending
 */

import React, { useState, useEffect } from 'react';
import {
  Eye,
  MessageSquare,
  Mail,
  Bell,
  Smartphone,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { toast } from '../../../lib/toast';

export interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  channel: 'SMS' | 'EMAIL' | 'PUSH' | 'IN_APP';
  content: string;
  subject?: string;
  placeholders: string[];
}

export interface NotificationPreviewProps {
  template: NotificationTemplate;
  sampleData?: Record<string, string>;
  onClose?: () => void;
}

const CHANNEL_ICONS = {
  SMS: MessageSquare,
  EMAIL: Mail,
  PUSH: Bell,
  IN_APP: Smartphone,
};

const CHANNEL_COLORS = {
  SMS: 'text-cyan-400 bg-cyan-500/20',
  EMAIL: 'text-blue-400 bg-blue-500/20',
  PUSH: 'text-purple-400 bg-purple-500/20',
  IN_APP: 'text-emerald-400 bg-emerald-500/20',
};

export default function NotificationPreview({
  template,
  sampleData = {},
  onClose,
}: NotificationPreviewProps) {
  const [data, setData] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Initialize with sample data or empty strings
    const initialData: Record<string, string> = {};
    template.placeholders.forEach((placeholder) => {
      initialData[placeholder] = sampleData[placeholder] || '';
    });
    setData(initialData);
  }, [template, sampleData]);

  const renderContent = (content: string) => {
    let rendered = content;
    template.placeholders.forEach((placeholder) => {
      const value = data[placeholder] || `{{${placeholder}}}`;
      rendered = rendered.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
    });
    return rendered;
  };

  const getCharacterInfo = () => {
    const rendered = renderContent(template.content);
    const length = rendered.length;
    const smsCount = Math.ceil(length / 160);
    return { length, smsCount };
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(renderContent(template.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Contenu copié');
    } catch {
      toast.error('Impossible de copier');
    }
  };

  const Icon = CHANNEL_ICONS[template.channel];
  const charInfo = getCharacterInfo();

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden max-w-2xl w-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${CHANNEL_COLORS[template.channel]}`}>
            <Icon size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{template.name}</h3>
            <p className="text-sm text-slate-400">Code: {template.code}</p>
          </div>
        </div>

        <span className={`px-3 py-1 rounded-lg text-xs font-medium ${CHANNEL_COLORS[template.channel]}`}>
          {template.channel}
        </span>
      </div>

      {/* Variables Input */}
      {template.placeholders.length > 0 && (
        <div className="p-4 border-b border-slate-700 bg-slate-900/50">
          <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            Variables de test
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {template.placeholders.map((placeholder) => (
              <div key={placeholder}>
                <label className="block text-xs text-slate-400 mb-1">{placeholder}</label>
                <input
                  type="text"
                  value={data[placeholder] || ''}
                  onChange={(e) => setData({ ...data, [placeholder]: e.target.value })}
                  placeholder={`Valeur pour ${placeholder}`}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
            <Eye size={14} />
            Aperçu du message
          </h4>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            {copied ? 'Copié!' : 'Copier'}
          </button>
        </div>

        {/* Email Preview */}
        {template.channel === 'EMAIL' && template.subject && (
          <div className="mb-3">
            <label className="block text-xs text-slate-400 mb-1">Sujet</label>
            <div className="p-3 bg-slate-900 rounded-lg text-white">
              {renderContent(template.subject)}
            </div>
          </div>
        )}

        {/* Content Preview */}
        <div
          className={`p-4 rounded-lg ${
            template.channel === 'EMAIL'
              ? 'bg-white text-slate-800'
              : 'bg-slate-900 text-white'
          }`}
        >
          {template.channel === 'EMAIL' ? (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: renderContent(template.content) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm font-sans">
              {renderContent(template.content)}
            </pre>
          )}
        </div>

        {/* SMS Character Count */}
        {template.channel === 'SMS' && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{charInfo.length} caractères</span>
            <span
              className={charInfo.smsCount > 1 ? 'text-amber-400' : 'text-emerald-400'}
            >
              {charInfo.smsCount} SMS
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      {onClose && (
        <div className="p-4 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition"
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
