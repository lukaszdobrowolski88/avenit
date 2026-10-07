import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import MailSidebar from './components/MailSidebar';
import MessageList from './components/MessageList';
import MessageView from './components/MessageView';
import ComposeModal from './components/ComposeModal';
import MailSettingsModal from './components/MailSettingsModal';
import useMailAccounts from './hooks/useMailAccounts';
import useFolders from './hooks/useFolders';
import useMessages from './hooks/useMessages';
import useCompose from './hooks/useCompose';
import useRealtimeMail from './hooks/useRealtimeMail';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { Mail as MailIcon, RefreshCw } from 'lucide-react';

export default function MailModule() {
  // Adres zalogowanej osoby (z sesji — bez cache w localStorage, który mógł należeć do kogoś innego).
  const [userEmail, setUserEmail] = useState(null);
  const [userChecked, setUserChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (alive) setUserEmail(data?.user?.email || null); })
      .catch(() => {})
      .finally(() => { if (alive) setUserChecked(true); });
    return () => { alive = false; };
  }, []);

  // Hooki
  const {
    accounts,
    defaultAccount,
    loading: accountsLoading,
    error: accountsError,
    retry: retryAccounts,
    ensureInternalAccount,
    createExternalAccount,
    updateAccount,
    deleteAccount,
    updateSignature,
    testConnection,
    setSystemDefault,
    setDefaultAccount,
    syncMail
  } = useMailAccounts(userEmail);

  // Aktywne konto (wybrane przez użytkownika lub domyślne)
  const [activeAccountId, setActiveAccountId] = useState(null);
  const activeAccount = accounts.find(a => a.id === activeAccountId) || defaultAccount;

  // Ustaw aktywne konto gdy załadują się konta
  useEffect(() => {
    if (accounts.length > 0 && !activeAccountId) {
      // Preferuj konto zewnętrzne jeśli istnieje
      const externalAccount = accounts.find(a => a.account_type === 'external');
      setActiveAccountId(externalAccount?.id || defaultAccount?.id || accounts[0]?.id);
    }
  }, [accounts, activeAccountId, defaultAccount?.id]);

  const {
    folders,
    loading: foldersLoading,
    inboxFolder,
    draftsFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    recalculateCounts
  } = useFolders(activeAccount?.id);

  // Stan UI
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedLabelId, setSelectedLabelId] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'sidebar' | 'list' | 'message'

  // Etykiety
  const [labels, setLabels] = useState([]);

  // Ustaw domyślny folder (inbox)
  useEffect(() => {
    if (inboxFolder && !selectedFolderId) {
      setSelectedFolderId(inboxFolder.id);
    }
  }, [inboxFolder, selectedFolderId]);

  // Wiadomości dla wybranego folderu
  const {
    messages,
    loading: messagesLoading,
    hasMore,
    refetch: refetchMessages,
    loadMore,
    getMessage,
    markAsRead,
    toggleStar,
    moveToFolder,
    deleteMessages,
    toggleLabel,
    searchMessages
  } = useMessages(activeAccount?.id, selectedFolderId);

  // Compose
  const {
    draft,
    sending,
    updateDraft,
    resetDraft,
    setFromMessage,
    saveDraft,
    sendMessage,
    uploadAttachment,
    removeAttachment,
    addSignature
  } = useCompose(activeAccount?.id, userEmail);

  // Realtime
  useRealtimeMail(
    activeAccount?.id,
    (newMsg) => {
      // Nowa wiadomość
      if (newMsg.folder_id === selectedFolderId) {
        refetchMessages();
      }
      recalculateCounts();
    },
    (updatedMsg) => {
      // Zaktualizowana wiadomość
      if (updatedMsg.id === selectedMessageId) {
        setSelectedMessage(updatedMsg);
      }
    },
    null
  );

  // Wykrywanie mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Pobierz etykiety
  useEffect(() => {
    const fetchLabels = async () => {
      if (!activeAccount?.id) return;

      const { data } = await supabase
        .from('mail_labels')
        .select('*')
        .eq('account_id', activeAccount.id)
        .order('name');

      setLabels(data || []);
    };

    fetchLabels();
  }, [activeAccount?.id]);

  // Utwórz konto wewnętrzne jeśli nie istnieje — tylko gdy odczyt się udał (bez błędu),
  // a hook i tak pozwala na jedną próbę (koniec pętli zapisów przy błędzie schematu).
  useEffect(() => {
    if (userEmail && accounts.length === 0 && !accountsLoading && !accountsError) {
      ensureInternalAccount();
    }
  }, [userEmail, accounts, accountsLoading, accountsError, ensureInternalAccount]);

  // Wybierz folder
  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    setSelectedLabelId(null);
    setSelectedMessageId(null);
    setSelectedMessage(null);
    if (isMobileView) {
      setMobileView('list');
    }
  };

  // Wybierz etykietę (wyszukiwanie)
  const handleSelectLabel = async (labelId) => {
    setSelectedLabelId(labelId);
    setSelectedFolderId(null);
    // TODO: Wyszukaj wiadomości z tą etykietą
  };

  // Wybierz wiadomość
  const handleSelectMessage = useCallback(async (messageId) => {
    // Wyczyść poprzednią wiadomość i pokaż loading
    setSelectedMessage(null);
    setSelectedMessageId(messageId);
    setMessageLoading(true);

    if (isMobileView) {
      setMobileView('message');
    }

    try {
      // Pobierz pełną wiadomość
      const fullMessage = await getMessage(messageId);
      setSelectedMessage(fullMessage);

      // Oznacz jako przeczytane
      if (fullMessage && !fullMessage.is_read) {
        await markAsRead(messageId);
        recalculateCounts();
      }
    } finally {
      setMessageLoading(false);
    }
  }, [getMessage, markAsRead, recalculateCounts, isMobileView]);

  // Wróć (mobile)
  const handleBack = () => {
    if (mobileView === 'message') {
      setMobileView('list');
      setSelectedMessageId(null);
      setSelectedMessage(null);
    } else if (mobileView === 'list') {
      setMobileView('sidebar');
    }
  };

  // Compose - odpowiedz
  const handleReply = (message) => {
    setFromMessage(message, 'reply');
    setShowCompose(true);
  };

  const handleReplyAll = (message) => {
    setFromMessage(message, 'replyAll');
    setShowCompose(true);
  };

  const handleForward = (message) => {
    setFromMessage(message, 'forward');
    setShowCompose(true);
  };

  // Compose - nowa wiadomość
  const handleCompose = () => {
    resetDraft();
    setShowCompose(true);
  };

  // Wyślij wiadomość
  const handleSend = async () => {
    const success = await sendMessage();
    if (success) {
      toast.success(tr('Wiadomość wysłana.'));
      setShowCompose(false);
      refetchMessages();
      recalculateCounts();
    }
  };

  // Zapisz szkic
  const handleSaveDraft = async () => {
    if (draftsFolder) {
      await saveDraft(draftsFolder.id);
    }
  };

  // Pobierz załącznik
  const handleDownloadAttachment = async (attachment) => {
    try {
      const { data, error } = await supabase.storage
        .from('mail-attachments')
        .download(attachment.storage_path);

      if (error) throw error;

      // Utwórz link do pobrania
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading attachment:', err);
    }
  };

  // Utwórz etykietę
  const handleCreateLabel = async (name, color) => {
    if (!activeAccount?.id) return;

    const { data, error } = await supabase
      .from('mail_labels')
      .insert({
        account_id: activeAccount.id,
        name,
        color
      })
      .select()
      .single();

    if (!error && data) {
      setLabels(prev => [...prev, data]);
    }
  };

  // Aktualizuj kolor etykiety
  const handleUpdateLabelColor = async (labelId, color) => {
    await supabase
      .from('mail_labels')
      .update({ color })
      .eq('id', labelId);

    setLabels(prev => prev.map(l =>
      l.id === labelId ? { ...l, color } : l
    ));
  };

  // Usuń etykietę
  const handleDeleteLabel = async (labelId) => {
    await supabase
      .from('mail_labels')
      .delete()
      .eq('id', labelId);

    setLabels(prev => prev.filter(l => l.id !== labelId));
  };

  // Pobierz nazwę aktualnego folderu
  const currentFolderName = folders.find(f => f.id === selectedFolderId)?.name || 'Poczta';

  // Brak adresu e-mail w koncie — poczta nie ma do czego się podpiąć.
  if (userChecked && !userEmail) {
    return (
      <div className="h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-7rem)] -m-4 lg:-m-6 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <EmptyState
          icon={MailIcon}
          title={tr('Twoje konto nie ma adresu e-mail')}
          subtitle={tr('Poczta działa dla kont z adresem e-mail. Poproś administratora o jego uzupełnienie.')}
        />
      </div>
    );
  }

  // Błąd odczytu lub założenia skrzynki — komunikat i ponowienie zamiast wiecznego „Ładowania”.
  if (accountsError && accounts.length === 0 && !accountsLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-7rem)] -m-4 lg:-m-6 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <EmptyState
          icon={MailIcon}
          title={tr('Nie udało się otworzyć poczty')}
          subtitle={tr('Spróbuj ponownie za chwilę. Jeśli problem wróci, daj znać administratorowi.')}
          action={<Button icon={RefreshCw} onClick={retryAccounts}>{tr('Spróbuj ponownie')}</Button>}
        />
      </div>
    );
  }

  // Loading
  if (!userChecked || (accountsLoading && !defaultAccount) || (accounts.length === 0 && !accountsError)) {
    return (
      <div className="h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-7rem)] -m-4 lg:-m-6 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Spinner label={tr('Ładowanie poczty...')} />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-7rem)] -m-4 lg:-m-6 flex relative bg-gray-50 dark:bg-gray-900 rounded-xl lg:rounded-xl overflow-hidden shadow-lg border border-gray-200/50 dark:border-gray-700">
      {/* Sidebar */}
      <div
        className={`
          ${isMobileView ? 'absolute inset-0 z-20' : 'w-64 flex-shrink-0'}
          ${isMobileView && mobileView !== 'sidebar' ? 'hidden' : ''}
        `}
      >
        <MailSidebar
          folders={folders}
          labels={labels}
          accounts={accounts}
          activeAccountId={activeAccount?.id}
          onSelectAccount={(accountId) => {
            setActiveAccountId(accountId);
            setSelectedFolderId(null);
            setSelectedMessageId(null);
            setSelectedMessage(null);
          }}
          selectedFolderId={selectedFolderId}
          selectedLabelId={selectedLabelId}
          onSelectFolder={handleSelectFolder}
          onSelectLabel={handleSelectLabel}
          onCreateFolder={createFolder}
          onCreateLabel={handleCreateLabel}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onUpdateLabelColor={handleUpdateLabelColor}
          onDeleteLabel={handleDeleteLabel}
          onOpenSettings={() => setShowSettings(true)}
          onCompose={handleCompose}
          loading={foldersLoading}
        />
      </div>

      {/* Lista wiadomości */}
      <div
        className={`
          ${isMobileView ? 'absolute inset-0 z-10' : 'w-96 flex-shrink-0'}
          ${isMobileView && mobileView !== 'list' ? 'hidden' : ''}
        `}
      >
        <MessageList
          messages={messages}
          folders={folders}
          labels={labels}
          selectedMessageId={selectedMessageId}
          onSelectMessage={handleSelectMessage}
          onToggleStar={toggleStar}
          onMarkAsRead={markAsRead}
          onMoveToFolder={moveToFolder}
          onDelete={deleteMessages}
          onToggleLabel={toggleLabel}
          onRefresh={refetchMessages}
          onSearch={searchMessages}
          loading={messagesLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          folderName={currentFolderName}
        />
      </div>

      {/* Podgląd wiadomości */}
      <div
        className={`
          flex-1
          ${isMobileView ? 'absolute inset-0 z-10' : ''}
          ${isMobileView && mobileView !== 'message' ? 'hidden' : ''}
        `}
      >
        <MessageView
          key={selectedMessageId || 'empty'}
          message={selectedMessage}
          folders={folders}
          labels={labels}
          onBack={isMobileView ? handleBack : null}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onToggleStar={toggleStar}
          onMoveToFolder={(id, folderId) => {
            moveToFolder(id, folderId);
            setSelectedMessageId(null);
            setSelectedMessage(null);
          }}
          onDelete={(id) => {
            deleteMessages(id);
            setSelectedMessageId(null);
            setSelectedMessage(null);
          }}
          onToggleLabel={toggleLabel}
          onDownloadAttachment={handleDownloadAttachment}
          loading={messageLoading}
        />
      </div>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        draft={draft}
        templates={[]}
        signature={activeAccount?.signature}
        onUpdateDraft={updateDraft}
        onSend={handleSend}
        onSaveDraft={handleSaveDraft}
        onUploadAttachment={uploadAttachment}
        onRemoveAttachment={removeAttachment}
        onAddSignature={addSignature}
        onSelectTemplate={(template) => {
          updateDraft('subject', template.subject || '');
          updateDraft('body_html', template.body_html || '');
        }}
        sending={sending}
      />

      {/* Settings Modal */}
      <MailSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        accounts={accounts}
        onCreateExternalAccount={async (accountData) => {
          await createExternalAccount({
            email: accountData.external_email,
            imapHost: accountData.imap_host,
            imapPort: accountData.imap_port,
            smtpHost: accountData.smtp_host,
            smtpPort: accountData.smtp_port,
            password: accountData.password
          });
        }}
        onUpdateAccount={async (accountId, accountData) => {
          await updateAccount(accountId, {
            imap_host: accountData.imap_host,
            imap_port: accountData.imap_port,
            smtp_host: accountData.smtp_host,
            smtp_port: accountData.smtp_port,
            password: accountData.password || undefined
          });
        }}
        onDeleteAccount={deleteAccount}
        onTestConnection={testConnection}
        onSetSystemDefault={setSystemDefault}
        onSyncMail={async (accountId) => {
          const result = await syncMail(accountId);
          if (result.success) {
            refetchMessages();
            recalculateCounts();
          }
          return result;
        }}
      />

      {/* Mobile bottom navigation */}
      {isMobileView && mobileView === 'list' && (
        <button
          onClick={() => setMobileView('sidebar')}
          className="absolute bottom-4 left-4 z-30 p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
