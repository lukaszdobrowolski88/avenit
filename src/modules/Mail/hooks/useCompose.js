import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

const INITIAL_DRAFT = {
  to: [],
  cc: [],
  bcc: [],
  subject: '',
  body_html: '',
  body_text: '',
  attachments: [],
  in_reply_to: null,
  thread_id: null
};

export default function useCompose(accountId, userEmail) {
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [savedDraftId, setSavedDraftId] = useState(null);

  // Aktualizuj pole draft
  const updateDraft = useCallback((field, value) => {
    setDraft(prev => ({ ...prev, [field]: value }));
  }, []);

  // Resetuj draft
  const resetDraft = useCallback(() => {
    setDraft(INITIAL_DRAFT);
    setSavedDraftId(null);
    setError(null);
  }, []);

  // Ustaw draft z istniejącej wiadomości (odpowiedź/przekaż)
  const setFromMessage = useCallback((message, mode = 'reply') => {
    if (mode === 'reply') {
      setDraft({
        ...INITIAL_DRAFT,
        to: [message.from_email],
        subject: message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject}`,
        body_html: `<br><br><div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px;">
          <p><strong>Od:</strong> ${message.from_name || message.from_email}</p>
          <p><strong>Data:</strong> ${new Date(message.received_at).toLocaleString('pl-PL')}</p>
          <p><strong>Temat:</strong> ${message.subject}</p>
          <br>
          ${message.body_html || message.body_text || ''}
        </div>`,
        in_reply_to: message.message_id,
        thread_id: message.thread_id || message.id
      });
    } else if (mode === 'replyAll') {
      const allRecipients = [
        message.from_email,
        ...(message.to_emails || []),
        ...(message.cc_emails || [])
      ].filter(email => email !== userEmail);

      setDraft({
        ...INITIAL_DRAFT,
        to: [message.from_email],
        cc: allRecipients.filter(e => e !== message.from_email),
        subject: message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject}`,
        body_html: `<br><br><div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px;">
          <p><strong>Od:</strong> ${message.from_name || message.from_email}</p>
          <p><strong>Data:</strong> ${new Date(message.received_at).toLocaleString('pl-PL')}</p>
          <p><strong>Temat:</strong> ${message.subject}</p>
          <br>
          ${message.body_html || message.body_text || ''}
        </div>`,
        in_reply_to: message.message_id,
        thread_id: message.thread_id || message.id
      });
    } else if (mode === 'forward') {
      setDraft({
        ...INITIAL_DRAFT,
        subject: message.subject.startsWith('Fwd:') ? message.subject : `Fwd: ${message.subject}`,
        body_html: `<br><br><div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 10px;">
          <p><strong>---------- Przekazana wiadomość ----------</strong></p>
          <p><strong>Od:</strong> ${message.from_name || message.from_email}</p>
          <p><strong>Data:</strong> ${new Date(message.received_at).toLocaleString('pl-PL')}</p>
          <p><strong>Temat:</strong> ${message.subject}</p>
          <p><strong>Do:</strong> ${message.to_emails?.join(', ') || ''}</p>
          <br>
          ${message.body_html || message.body_text || ''}
        </div>`,
        attachments: message.attachments || []
      });
    }
  }, [userEmail]);

  // Zapisz jako szkic
  const saveDraft = useCallback(async (folderId) => {
    if (!accountId || !folderId) return null;

    try {
      const draftData = {
        account_id: accountId,
        folder_id: folderId,
        from_email: userEmail,
        to_emails: draft.to,
        cc_emails: draft.cc,
        bcc_emails: draft.bcc,
        subject: draft.subject || '(brak tematu)',
        body_html: draft.body_html,
        body_text: stripHtml(draft.body_html),
        snippet: stripHtml(draft.body_html).substring(0, 200),
        is_draft: true,
        in_reply_to: draft.in_reply_to,
        thread_id: draft.thread_id
      };

      let result;
      if (savedDraftId) {
        // Aktualizuj istniejący
        const { data, error: updateError } = await supabase
          .from('mail_messages')
          .update(draftData)
          .eq('id', savedDraftId)
          .select()
          .single();

        if (updateError) throw updateError;
        result = data;
      } else {
        // Utwórz nowy
        const { data, error: insertError } = await supabase
          .from('mail_messages')
          .insert(draftData)
          .select()
          .single();

        if (insertError) throw insertError;
        result = data;
        setSavedDraftId(result.id);
      }

      return result;
    } catch (err) {
      console.error('Error saving draft:', err);
      setError(err.message);
      return null;
    }
  }, [accountId, userEmail, draft, savedDraftId]);

  // Wyślij wiadomość
  const sendMessage = useCallback(async (sentFolderId) => {
    if (!accountId || draft.to.length === 0) {
      setError('Brak odbiorców');
      return false;
    }

    try {
      setSending(true);
      setError(null);

      // Wywołaj Edge Function do wysłania
      const { data, error: sendError } = await supabase.functions.invoke(
        'send-mail',
        {
          body: {
            account_id: accountId,
            to: draft.to,
            cc: draft.cc,
            bcc: draft.bcc,
            subject: draft.subject || '(brak tematu)',
            body_html: draft.body_html,
            body_text: stripHtml(draft.body_html),
            in_reply_to: draft.in_reply_to,
            thread_id: draft.thread_id,
            attachments: draft.attachments.map(a => ({
              id: a.id,
              filename: a.filename,
              storage_path: a.storage_path
            }))
          }
        }
      );

      if (sendError) throw sendError;

      // Usuń szkic jeśli istnieje
      if (savedDraftId) {
        await supabase
          .from('mail_messages')
          .delete()
          .eq('id', savedDraftId);
      }

      // Resetuj
      resetDraft();

      return true;
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);
      return false;
    } finally {
      setSending(false);
    }
  }, [accountId, draft, savedDraftId, resetDraft]);

  // Upload załącznika
  const uploadAttachment = useCallback(async (file) => {
    if (!userEmail) return null;

    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${userEmail}/drafts/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('mail-attachments')
        .upload(path, file);

      if (uploadError) throw uploadError;

      const attachment = {
        id: `temp_${timestamp}`,
        filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        storage_path: path
      };

      setDraft(prev => ({
        ...prev,
        attachments: [...prev.attachments, attachment]
      }));

      return attachment;
    } catch (err) {
      console.error('Error uploading attachment:', err);
      setError(err.message);
      return null;
    }
  }, [userEmail]);

  // Usuń załącznik
  const removeAttachment = useCallback(async (attachmentId) => {
    const attachment = draft.attachments.find(a => a.id === attachmentId);

    if (attachment?.storage_path && attachmentId.startsWith('temp_')) {
      // Usuń z storage
      await supabase.storage
        .from('mail-attachments')
        .remove([attachment.storage_path]);
    }

    setDraft(prev => ({
      ...prev,
      attachments: prev.attachments.filter(a => a.id !== attachmentId)
    }));
  }, [draft.attachments]);

  // Dodaj podpis
  const addSignature = useCallback((signature) => {
    if (!signature) return;

    setDraft(prev => ({
      ...prev,
      body_html: prev.body_html + `<br><br>${signature}`
    }));
  }, []);

  return {
    draft,
    sending,
    error,
    savedDraftId,
    updateDraft,
    resetDraft,
    setFromMessage,
    saveDraft,
    sendMessage,
    uploadAttachment,
    removeAttachment,
    addSignature
  };
}

// Helper - usuń HTML
function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}
