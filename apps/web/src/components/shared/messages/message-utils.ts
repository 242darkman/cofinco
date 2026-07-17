/**
 * Utilitaires du module de messagerie : formatage des horodatages,
 * initiales et métadonnées typées des messages fichier/image.
 */

import type { MessageV2 } from '../../../hooks/useMessagesV2';

/** Forme des métadonnées pour les messages fichier/image. */
export interface MessageMetadata {
  url?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
}

/** Extrait les métadonnées typées d'un MessageV2 en toute sécurité. */
export function getMetadata(msg: MessageV2): MessageMetadata {
  return (msg.metadata || {}) as MessageMetadata;
}

export function formatMessageTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - messageDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return time;
  if (diffDays === 1) return `Hier ${time}`;
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${time}`;
  }
  const shortDate = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  return `${shortDate} ${time}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}
