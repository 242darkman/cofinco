import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, Search, Clock, CheckCheck, Paperclip, Smile, MoreVertical, ArrowLeft, Loader2 } from 'lucide-react';
import { Card, Badge, SearchInput, IconButton, Button } from '../ui';
import { useConversations, useChat, useSendMessage, useSearchUsers } from '../../hooks/useMessages';
import { useWebSocket } from '../../hooks/useWebSocket';

/**
 * Formate un timestamp de message de manière intelligente :
 * - Aujourd'hui : "15:16"
 * - Hier : "Hier 15:16"
 * - Cette semaine : "Lun 15:16"
 * - Plus ancien : "25/12 15:16"
 */
function formatMessageTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  
  // Reset times to midnight for date comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - messageDay.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    // Aujourd'hui - juste l'heure
    return time;
  } else if (diffDays === 1) {
    // Hier
    return `Hier ${time}`;
  } else if (diffDays < 7) {
    // Cette semaine - nom du jour
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
    // Capitalize first letter
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${time}`;
  } else {
    // Plus ancien - date courte
    const shortDate = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    return `${shortDate} ${time}`;
  }
}

export default function MessagesModule() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Real-time hooks
  const { onlineUsers, typingUsers, sendTyping } = useWebSocket();
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Hooks
  const { data: conversations, isLoading: loadingConversations } = useConversations();
  const { data: messages, isLoading: loadingMessages } = useChat(selectedConversation);
  const { mutate: sendMessage, isPending: sending } = useSendMessage();
  const { data: searchResults } = useSearchUsers(searchQuery);

  const handleSendMessage = () => {
    if (messageInput.trim() && selectedConversation) {
      sendMessage(
        { receiverId: selectedConversation, content: messageInput.trim() },
        {
          onSuccess: () => {
             setMessageInput('');
             sendTyping(selectedConversation, false);
          }
        }
      );
    }
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    
    if (selectedConversation) {
        sendTyping(selectedConversation, true);
        
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        
        typingTimeoutRef.current = setTimeout(() => {
            sendTyping(selectedConversation, false);
        }, 2000);
    }
  };

  // Store selected contact info for header display (especially useful for new conversations from search)
  const [selectedContactInfo, setSelectedContactInfo] = useState<{name: string, role?: string, agence?: string} | null>(null);

  const handleSelectConversation = (id: string, name?: string, role?: string, agence?: string) => {
    setSelectedConversation(id);
    setSearchQuery(''); // Close search results
    setShowMobileChat(true);
    
    // Store contact info for display in header
    if (name) {
      setSelectedContactInfo({ name, role, agence });
    } else {
      // Find from conversations if available
      const conv = conversations?.find(c => c.partnerId === id);
      setSelectedContactInfo(conv ? { name: conv.partnerName } : null);
    }
  };

  const handleBackToMessages = () => {
    setShowMobileChat(false);
    setSelectedConversation(null);
    setSelectedContactInfo(null);
  };

  // Auto-scroll to bottom of chat
  useEffect(() => {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [messages]);

  // Determine what to show in the sidebar: Search results or Conversations
  const sidebarItems = searchQuery.length >= 2 ? searchResults || [] : conversations || [];

  return (
    <div className="h-[calc(100vh-12rem)] relative md:flex md:gap-4">
      {/* Conversation List */}
      <Card 
        className={`w-full md:w-80 flex flex-col h-full bg-slate-800/50 backdrop-blur-sm border-slate-700/50 ${showMobileChat ? 'hidden md:flex' : 'flex'}`}
        padding="none"
      >
        <div className="p-4 border-b border-slate-700/50">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <MessageCircle className="text-blue-400" />
            Messages
          </h2>
          <SearchInput
            placeholder="Rechercher (min 2 car.)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            className="w-full"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConversations && !searchQuery ? (
            <div className="p-4 text-center text-slate-400">
               <Loader2 className="animate-spin mx-auto mb-2" />
               Chargement...
            </div>
          ) : sidebarItems.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">
              {searchQuery ? "Aucun utilisateur trouvé" : "Aucune conversation"}
            </div>
          ) : (
            sidebarItems.map((item: any) => {
               // Determine if item is a Conversation or a raw User search result
               // API returns snake_case (partner_name), check both formats
               const isConversation = 'partner_name' in item || 'partnerName' in item;
               const id = isConversation ? (item.partner_id || item.partnerId) : item.id;
               
               // For display: get partner name from conversation or build from search result
               let name: string;
               if (isConversation) {
                 name = item.partner_name || item.partnerName || 'Utilisateur';
               } else {
                 // Search result - prefer nom+prenom
                 const nom = item.nom || '';
                 const prenom = item.prenom || '';
                 const fullName = `${nom} ${prenom}`.trim();
                 name = fullName || item.username || 'Utilisateur';
               }
               
               const avatar = isConversation ? (item.partner_avatar || item.partnerAvatar) : item.photoProfile;
               // Use real-time online status if available
               const isOnline = onlineUsers.has(id);
               const unread = isConversation ? Number(item.unread_count || item.unreadCount || 0) : 0;
               const lastMessage = isConversation ? item.content : null;
               const time = isConversation && (item.created_at || item.createdAt) ? formatMessageTime(item.created_at || item.createdAt) : null;
               const isTyping = typingUsers.get(id);
               
               // Extra info for search results or conversations
               const agence = item.agence || item.partner_agence;
               const role = item.role || item.partner_role;

               return (
                <button
                  key={id}
                  onClick={() => handleSelectConversation(id, name, role || undefined, agence || undefined)}
                  className={`w-full p-4 border-b border-slate-700/50 transition text-left group
                    ${selectedConversation === id ? 'bg-blue-600/20 border-l-2 border-l-blue-500' : 'hover:bg-slate-700/30'}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                        {name?.charAt(0)}
                      </div>
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-800 rounded-full shadow-sm"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`font-semibold text-sm truncate ${selectedConversation === id ? 'text-blue-400' : 'text-white'}`}>
                          {name}
                        </h3>
                        {time && <span className="text-xs text-slate-400">{time}</span>}
                      </div>
                      <div className="flex items-center justify-between">
                        {isTyping ? (
                             <p className="text-sm text-blue-400 italic animate-pulse">En train d'écrire...</p>
                        ) : lastMessage ? (
                            <p className="text-sm text-slate-400 truncate flex-1 block">
                            {lastMessage}
                            </p>
                        ) : (
                            <p className="text-sm text-slate-500 truncate">
                              {role && agence ? `${role} • ${agence}` : role || agence || 'Démarrer une discussion'}
                            </p>
                        )}
                        
                        {unread > 0 && (
                          <Badge variant="primary" size="sm" value={unread} className="ml-2" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
               );
            })
          )}
        </div>
      </Card>

      {/* Chat Area */}
      <Card 
        className={`flex-1 flex flex-col h-full bg-slate-800/50 backdrop-blur-sm border-slate-700/50 ${showMobileChat ? 'flex' : 'hidden md:flex'}`}
        padding="none"
      >
        {selectedConversation ? (
          <>
            <div className="p-3 sm:p-4 border-b border-slate-700/50 flex items-center justify-between bg-gradient-to-r from-slate-800/90 to-slate-800/70">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <IconButton 
                  icon={ArrowLeft} 
                  variant="ghost" 
                  className="md:hidden text-slate-400 -ml-2 flex-shrink-0"
                  onClick={handleBackToMessages}
                  aria-label="Retour aux messages"
                />
                
                {/* Avatar with online indicator */}
                <div className="relative flex-shrink-0">
                   <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                     {selectedContactInfo?.name?.charAt(0) || conversations?.find((c: any) => (c.partner_id || c.partnerId) === selectedConversation)?.partnerName?.charAt(0) || "?"}
                   </div>
                   {onlineUsers.has(selectedConversation) && (
                     <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-800 rounded-full"></div>
                   )}
                </div>
                
                {/* Contact info */}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white text-sm sm:text-base truncate">
                    {selectedContactInfo?.name || conversations?.find((c: any) => (c.partner_id || c.partnerId) === selectedConversation)?.partnerName || "Nouvelle conversation"}
                  </h3>
                  <div className="h-4 flex items-center">
                    {typingUsers.get(selectedConversation) ? (
                        <p className="text-xs text-blue-400 animate-pulse flex items-center gap-1">
                          <span className="flex gap-0.5">
                            <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                            <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                            <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                          </span>
                          écrit...
                        </p>
                    ) : onlineUsers.has(selectedConversation) ? (
                        <p className="text-xs text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                          En ligne
                        </p>
                    ) : (
                        <p className="text-xs text-slate-500">Hors ligne</p>
                    )}
                  </div>
                </div>
              </div>
              <IconButton 
                icon={MoreVertical} 
                variant="ghost" 
                className="text-slate-400 flex-shrink-0" 
                aria-label="Options"
              />
            </div>

            <div id="chat-container" className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/20 scroll-smooth">
              {loadingMessages ? (
                 <div className="flex justify-center p-4"><Loader2 className="animate-spin text-blue-500"/></div>
              ) : messages?.map((msg: any) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderId === selectedConversation ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[70%] ${msg.senderId === selectedConversation ? 'order-1' : 'order-2'}`}>
                    <div className="flex items-end gap-2">
                       {/* Avatar logic omitted for brevity in chat bubbles */}
                      <div
                        className={`rounded-2xl px-4 py-2 shadow-sm ${
                          msg.senderId !== selectedConversation // If it's NOT the partner, it's ME (justify-end)
                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-br-none'
                            : 'bg-slate-700 text-slate-100 rounded-bl-none'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 mt-1 text-[10px] sm:text-xs text-slate-500 ${msg.senderId !== selectedConversation ? 'justify-end pr-2' : 'justify-start pl-10'}`}>
                      <span>{formatMessageTime(msg.createdAt)}</span>
                      {msg.senderId !== selectedConversation && msg.read && (
                        <CheckCheck size={12} className="text-blue-400" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 sm:p-4 border-t border-slate-700/50 bg-slate-800/80">
              <div className="flex items-center gap-2">
                <IconButton 
                  icon={Paperclip} 
                  variant="ghost" 
                  className="text-slate-400 hidden sm:flex" 
                  aria-label="Joindre un fichier"
                />
                <IconButton 
                  icon={Smile} 
                  variant="ghost" 
                  className="text-slate-400 hidden sm:flex" 
                  aria-label="Insérer un émoji"
                />
                
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Écrire un message..."
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 sm:hidden flex gap-1">
                     <IconButton 
                       icon={Paperclip} 
                       variant="ghost" 
                       size="sm" 
                       className="text-slate-400" 
                       aria-label="Joindre un fichier"
                     />
                  </div>
                </div>

                <Button 
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || sending}
                  className="rounded-xl px-3 sm:px-4"
                >
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="sm:mr-2" />}
                  <span className="hidden sm:inline">Envoyer</span>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-900/10">
                <MessageCircle size={40} className="text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Sélectionnez une conversation</h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">
                Choisissez une conversation dans la liste pour commencer à discuter ou rechercher un contact.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

