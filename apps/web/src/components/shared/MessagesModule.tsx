/**
 * MessagesModule — façade préservant le chemin d'import historique
 * (imports lazy dans MicroflexPlatform et routes-config).
 *
 * Les responsabilités sont découpées dans `./messages/` :
 * - `useMessagesModule.ts` : état, hooks serveur V2, WebSocket, gestionnaires ;
 * - `ConversationSidebar.tsx` / `ChatHeader.tsx` / `MessageList.tsx` /
 *   `MessageBubble.tsx` / `MessageComposer.tsx` : affichage ;
 * - `GroupCreationModal.tsx` : création de groupe ;
 * - `message-utils.ts` / `emoji.ts` : utilitaires et constantes.
 */

export { default } from './messages/MessagesModule';
export type { MessagesModuleProps } from './messages/useMessagesModule';
