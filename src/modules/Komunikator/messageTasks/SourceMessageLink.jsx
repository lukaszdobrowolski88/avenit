// Panel zadania: „Z wiadomości” — zadanie utworzone z wiadomości czatu (board_items.source_message_id,
// migracja 114). Link otwiera rozmowę na tej wiadomości; nadawcę i fragment pokazujemy, gdy osoba
// jest w tej rozmowie (odczyt messages przez /api/db — tylko moje rozmowy), inaczej sam link.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { messageLinkPath } from '@avenit/shared/src/lib/messageTasks.js';
import { savedPreview } from './api';

export default function SourceMessageLink({ item }) {
  const messageId = item?.source_message_id || null;
  const conversationId = item?.source_conversation_id || null;
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setMsg(null);
    if (!messageId) return undefined;
    let alive = true;
    supabase.from('messages').select('id, thread_root_id, sender_email, content, attachments, message_type, deleted_at').eq('id', messageId).maybeSingle()
      .then(async ({ data }) => {
        if (!alive || !data || data.deleted_at) return;
        const { data: u } = await supabase.from('app_users').select('email, full_name').eq('email', data.sender_email).maybeSingle();
        if (alive) setMsg({ ...data, senderName: u?.full_name || data.sender_email });
      }, () => {});
    return () => { alive = false; };
  }, [messageId]);

  if (!messageId || !conversationId) return null;
  const preview = msg ? savedPreview(msg) : null;
  return (
    <Link to={messageLinkPath(conversationId, messageId, msg?.thread_root_id || null)}
      className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
      <MessageSquare size={15} className="mt-0.5 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-gray-700 dark:text-gray-200">
          {msg ? tr('Z wiadomości od {name}', { name: msg.senderName }) : tr('Z wiadomości')}
        </span>
        {preview && (preview.text || preview.attLabel) && (
          <span className="block text-xs text-gray-500 dark:text-gray-400 line-clamp-2 break-words">{preview.text || preview.attLabel}</span>
        )}
        <span className="block text-xs font-medium text-accent-primary-dark dark:text-accent-primary-light mt-0.5">{tr('Otwórz w Komunikatorze')}</span>
      </span>
    </Link>
  );
}
