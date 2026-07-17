/**
 * Module de messagerie — composition : barre latérale, zone de discussion
 * (en-tête, messages, saisie), modale de groupe et aperçu de fichier.
 */

import { Send } from 'lucide-react';
import DocumentPreviewModal from '../../ui/DocumentPreviewModal';
import { useMessagesModule, type MessagesModuleProps } from './useMessagesModule';
import { ConversationSidebar } from './ConversationSidebar';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { GroupCreationModal } from './GroupCreationModal';

export type { MessagesModuleProps } from './useMessagesModule';

export default function MessagesModule(props: MessagesModuleProps) {
  const controller = useMessagesModule(props);
  const { selectedConversationId, showGroupModal, previewFile, setPreviewFile } = controller;

  return (
    <div className="flex flex-1 min-h-0 bg-surface-base overflow-hidden text-content-primary font-sans rounded-2xl border border-edge shadow-2xl">

      {/* 1. BARRE LATÉRALE */}
      <ConversationSidebar controller={controller} />

      {/* 2. ZONE DE DISCUSSION */}
      <div className={`
        flex-col flex-1 bg-surface-base relative
        ${!selectedConversationId ? 'hidden md:flex' : 'flex'}
      `}>
        {!selectedConversationId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-content-muted bg-surface-base/50">
            <div className="w-24 h-24 bg-surface-base rounded-full flex items-center justify-center mb-6 shadow-xl shadow-black/20">
              <Send size={40} className="ml-2 opacity-50 text-accent" />
            </div>
            <p className="text-lg font-medium text-content-muted">Sélectionnez une conversation</p>
            <p className="text-sm text-content-muted mt-2">pour commencer à discuter</p>
          </div>
        ) : (
          <>
            <ChatHeader controller={controller} />
            <MessageList controller={controller} />
            <MessageComposer controller={controller} />
          </>
        )}
      </div>

      {/* MODALE DE CRÉATION DE GROUPE */}
      {showGroupModal && <GroupCreationModal controller={controller} />}

      {/* APERÇU FICHIER/IMAGE — rendu conditionnel pour réinitialiser l'état à chaque ouverture */}
      {previewFile && (
        <DocumentPreviewModal
          isOpen
          onClose={() => setPreviewFile(null)}
          documentId=""
          documentName={previewFile.name}
          preloadedUrl={previewFile.url}
          preloadedMimeType={previewFile.mimeType}
        />
      )}
    </div>
  );
}
