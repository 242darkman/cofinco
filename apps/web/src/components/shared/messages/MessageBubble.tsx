/**
 * Bulle d'un message non système : contenus texte, image et fichier,
 * réactions, actions au survol (réagir, modifier, supprimer) et
 * sélecteur de réactions.
 */

import { Smile, Check, CheckCheck, Edit2, Trash2, FileText, Download } from 'lucide-react';
import { ALLOWED_REACTION_EMOJIS } from '@shared/schema';
import type { MessageV2 } from '../../../hooks/useMessagesV2';
import { resolveStorageUrl } from '../../../lib/format';
import { getMetadata } from './message-utils';
import type { MessagesModuleController } from './useMessagesModule';

interface MessageBubbleProps {
  msg: MessageV2;
  controller: MessagesModuleController;
}

/** Badge de réactions accroché sous la bulle. */
function ReactionsBadge({ msg, isMe, controller }: MessageBubbleProps & { isMe: boolean }) {
  if (msg.reactions.length === 0) return null;
  return (
    <div className={`absolute -bottom-4 ${isMe ? 'right-2' : 'left-2'} flex gap-0.5 bg-surface rounded-full px-1.5 py-0.5 shadow-lg border border-edge`}>
      {msg.reactions.map((r) => (
        <button key={r.emoji} onClick={() => controller.handleToggleReaction(msg.id, r.emoji, r.hasReacted)} className={`text-sm transition-transform hover:scale-110 ${r.hasReacted ? 'opacity-100' : 'opacity-70'}`}>
          {r.emoji}{r.count > 1 && <span className="text-[10px] text-content-muted ml-0.5">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Nom de l'expéditeur (groupes uniquement, messages reçus). */
function SenderName({ msg, isMe, controller }: MessageBubbleProps & { isMe: boolean }) {
  if (isMe || controller.activeConv?.type !== 'GROUP') return null;
  return (
    <p className="text-xs font-semibold text-status-info mb-1">
      {msg.sender.prenom ? `${msg.sender.prenom} ${msg.sender.nom}` : msg.sender.nom}
    </p>
  );
}

export function MessageBubble({ msg, controller }: MessageBubbleProps) {
  const {
    currentUserId,
    showReactionsFor, setShowReactionsFor,
    setPreviewFile,
    isMessageRead,
    handleToggleReaction,
    handleEditMessage,
    handleDeleteMessage,
  } = controller;

  const isMe = msg.senderId === currentUserId;
  const time = new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative max-w-[85%] md:max-w-[75%] lg:max-w-[60%]">

      {msg.contentType === 'IMAGE' ? (
        /* ── Message image — carte épurée, sans bulle ── */
        <div className="relative">
          <SenderName msg={msg} isMe={isMe} controller={controller} />
          <div
            className="relative cursor-pointer overflow-hidden rounded-2xl border border-edge/40 shadow-sm hover:shadow-md transition-shadow"
            onClick={() => { const meta = getMetadata(msg); setPreviewFile({
              url: resolveStorageUrl(meta.url || msg.content || ''),
              name: meta.filename || 'Image',
              mimeType: meta.mimeType || 'image/jpeg',
            }); }}
          >
            <img
              src={resolveStorageUrl(getMetadata(msg).url || msg.content || '')}
              alt={getMetadata(msg).filename || 'Image'}
              className="max-w-[280px] sm:max-w-[320px] rounded-2xl object-cover"
            />
            {/* Horodatage en superposition */}
            <div className="absolute bottom-1.5 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
              <span className="text-[10px] text-white/90">{time}</span>
              {isMe && (
                isMessageRead(msg) ? (
                  <CheckCheck size={12} className="text-white/90" />
                ) : (
                  <Check size={12} className="text-white/60" />
                )
              )}
            </div>
          </div>
          <ReactionsBadge msg={msg} isMe={isMe} controller={controller} />
        </div>

      ) : msg.contentType === 'FILE' ? (
        /* ── Message fichier — carte compacte, sans URL brute ── */
        <div className="relative">
          <SenderName msg={msg} isMe={isMe} controller={controller} />
          <button
            onClick={() => { const meta = getMetadata(msg); setPreviewFile({
              url: resolveStorageUrl(meta.url || msg.content || ''),
              name: meta.filename || 'Fichier',
              mimeType: meta.mimeType,
            }); }}
            className={`flex items-center gap-3 p-3 rounded-2xl border transition-colors w-full text-left ${
              isMe
                ? 'bg-status-info/90 border-status-info/30 hover:bg-status-info'
                : 'bg-surface-elevated/80 border-edge/40 hover:bg-surface-elevated'
            }`}
          >
            <div className={`p-2.5 rounded-xl ${isMe ? 'bg-white/15' : 'bg-accent/10'}`}>
              <FileText size={20} className={isMe ? 'text-white' : 'text-accent'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isMe ? 'text-white' : 'text-content-primary'}`}>
                {getMetadata(msg).filename || 'Fichier'}
              </p>
              <p className={`text-[11px] ${isMe ? 'text-white/60' : 'text-content-muted'}`}>
                {getMetadata(msg).size ? `${(getMetadata(msg).size! / 1024).toFixed(0)} Ko` : 'Fichier'}
                {' · '}{time}
                {isMe && (isMessageRead(msg) ? ' ✓✓' : ' ✓')}
              </p>
            </div>
            <Download size={16} className={isMe ? 'text-white/50' : 'text-content-muted'} />
          </button>
          <ReactionsBadge msg={msg} isMe={isMe} controller={controller} />
        </div>

      ) : (
        /* ── Message texte — bulle standard style iPhone ── */
        <div className={`
          relative px-4 py-2.5 text-[15px] leading-relaxed
          ${isMe
            ? 'bg-gradient-to-br from-status-info to-status-info text-white rounded-[20px] rounded-br-[4px]'
            : 'bg-surface-elevated/80 text-content-primary rounded-[20px] rounded-bl-[4px]'
          }
        `}>
          {/* Pointe de la bulle */}
          <svg
            className={`absolute bottom-0 w-3 h-3 ${
              isMe
                ? '-right-1.5 text-status-info'
                : '-left-1.5 text-content-secondary/80 -scale-x-100'
            }`}
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <path d="M0 0 L12 0 L12 12 Q6 12 0 6 Z" />
          </svg>

          <SenderName msg={msg} isMe={isMe} controller={controller} />

          <p className="whitespace-pre-wrap">{msg.content}</p>

          {/* Horodatage et statut de lecture */}
          <div className={`flex items-center gap-1.5 justify-end mt-1 text-[11px] ${isMe ? 'text-status-info-text' : 'text-content-muted'}`}>
            {msg.editedAt && <span className="italic">modifié</span>}
            <span>{time}</span>
            {isMe && (
              isMessageRead(msg) ? (
                <CheckCheck size={14} className="text-white" />
              ) : (
                <Check size={14} className="text-status-info-text/70" />
              )
            )}
          </div>

          <ReactionsBadge msg={msg} isMe={isMe} controller={controller} />
        </div>
      )}

      {/* Actions au survol — positionnées près de la bulle */}
      <div className={`absolute ${isMe ? '-left-1 -translate-x-full' : '-right-1 translate-x-full'} top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-surface-base/90 backdrop-blur-sm rounded-lg px-1 py-0.5 shadow-lg border border-edge-subtle`}>
        <button
          onClick={() => setShowReactionsFor(showReactionsFor === msg.id ? null : msg.id)}
          className="p-1.5 text-content-muted hover:text-status-warning rounded transition-colors"
          title="Réagir"
        >
          <Smile size={14} />
        </button>
        {isMe && msg.contentType === 'TEXT' && (
          <>
            <button
              onClick={() => handleEditMessage(msg)}
              className="p-1.5 text-content-muted hover:text-status-info rounded transition-colors"
              title="Modifier"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => handleDeleteMessage(msg.id)}
              className="p-1.5 text-content-muted hover:text-status-danger rounded transition-colors"
              title="Supprimer"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>

      {/* Sélecteur de réactions */}
      {showReactionsFor === msg.id && (
        <div className={`absolute ${isMe ? 'right-0' : 'left-0'} -top-12 z-50 bg-surface border border-edge rounded-xl px-2 py-1.5 flex gap-1 shadow-xl`}>
          {ALLOWED_REACTION_EMOJIS.map((emoji) => {
            const existing = msg.reactions.find((r) => r.emoji === emoji);
            return (
              <button
                key={emoji}
                onClick={() => handleToggleReaction(msg.id, emoji, existing?.hasReacted || false)}
                className={`p-1 text-lg hover:scale-125 transition-transform rounded ${existing?.hasReacted ? 'bg-accent/10' : ''}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
