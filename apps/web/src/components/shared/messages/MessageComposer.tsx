/**
 * Zone de saisie : pièce jointe, bandeau d'édition, sélecteur d'emojis,
 * champ de texte et bouton d'envoi.
 */

import { Spinner } from '@/components/ui/Spinner';
import { Send, Paperclip, Smile, Edit2, X } from 'lucide-react';
import { MESSAGE_EMOJIS } from './emoji';
import type { MessagesModuleController } from './useMessagesModule';

export function MessageComposer({ controller }: { controller: MessagesModuleController }) {
  const {
    message, setMessage,
    editingMessage, setEditingMessage,
    showEmojiPicker, setShowEmojiPicker,
    uploadingFile,
    sending,
    fileInputRef,
    messageInputRef,
    handleSendMessage,
    handleInputChange,
    handleFileUpload,
  } = controller;

  return (
    <div className="p-4 bg-surface-base border-t border-edge w-full mb-0">
      {editingMessage && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-surface rounded-lg text-xs text-content-muted">
          <Edit2 size={12} className="text-accent" />
          <span className="flex-1 truncate">Modification du message</span>
          <button onClick={() => { setEditingMessage(null); setMessage(''); }} className="text-content-muted hover:text-content-primary">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 sm:gap-3 max-w-4xl mx-auto w-full">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/jpg,application/pdf"
          className="hidden"
          onChange={handleFileUpload}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="h-11 w-11 sm:h-12 sm:w-12 flex items-center justify-center text-content-muted hover:text-content-primary bg-surface hover:bg-surface-elevated rounded-xl transition-colors disabled:opacity-50 shrink-0"
        >
          {uploadingFile ? <Spinner size="sm" tone="current" /> : <Paperclip size={20} />}
        </button>

        <div className="flex-1 relative">
          {/* Panneau du sélecteur d'emojis */}
          {showEmojiPicker && (
            <div className="absolute bottom-full mb-2 left-0 right-0 sm:left-auto sm:right-0 sm:w-80 bg-surface-base border border-edge rounded-xl shadow-2xl p-3 z-50">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-edge">
                <span className="text-xs font-medium text-content-muted">Emojis</span>
                <button
                  onClick={() => setShowEmojiPicker(false)}
                  className="text-content-muted hover:text-content-primary"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                {MESSAGE_EMOJIS.map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setMessage(prev => prev + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-surface rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-surface-base border border-edge rounded-xl flex items-center px-3 sm:px-4 h-11 sm:h-12 focus-within:border-accent transition-colors">
            <textarea
              ref={messageInputRef}
              placeholder="Écrire un message..."
              className="w-full bg-transparent border-none outline-none text-content-primary text-sm resize-none py-2.5 max-h-32 placeholder:text-content-muted custom-scrollbar leading-normal"
              rows={1}
              value={message}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              style={{ minHeight: '20px' }}
            />
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`ml-2 transition-colors shrink-0 ${showEmojiPicker ? 'text-status-warning' : 'text-content-muted hover:text-status-warning'}`}
            >
              <Smile size={20} />
            </button>
          </div>
        </div>

        <button
          onClick={handleSendMessage}
          disabled={!message.trim() || sending}
          className="h-11 w-11 sm:h-12 sm:w-12 flex items-center justify-center bg-accent hover:bg-accent-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-accent/20 transition-transform active:scale-95 shrink-0"
        >
          {sending ? <Spinner size="sm" tone="current" /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );
}
