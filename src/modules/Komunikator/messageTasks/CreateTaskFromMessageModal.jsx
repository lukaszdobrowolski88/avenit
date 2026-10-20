// „Utwórz zadanie” z wiadomości czatu. Nazwa = pierwsza linia wiadomości, opis = pełna treść +
// „Z wiadomości od X w <rozmowa>” + link do wiadomości. Tablica: zadania służby kanału (domyślnie),
// zadania Kalendarza albo tablica Projektów, w której mogę tworzyć zadania (ta sama reguła co
// serwer — globalnie albo w zakresie służby). Osoba: nikt / ja / autor wiadomości; termin opcjonalny.
// Zadanie pamięta wiadomość (board_items.source_message_id — migracja 114).
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import CustomSelect from '../../../components/CustomSelect';
import CustomDatePicker from '../../../components/CustomDatePicker';
import Spinner from '../../../components/Spinner';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { useAppModules } from '../../../hooks/useAppModules';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { messageTaskName } from '@avenit/shared/src/lib/messageTasks.js';
import { sameEmail, normEmail } from '../utils/chatLogic';
import { loadTaskTargets, createTaskFromMessage, taskDescriptionFor, conversationLabel } from './api';

const LABEL = 'block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1';
const INPUT = 'w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-gray-300/60 dark:focus:ring-gray-600/60';

export const modulePathsOf = (modules) => {
  const paths = {};
  for (const m of modules || []) if (m?.key && typeof m.path === 'string') paths[m.key] = m.path;
  return paths;
};

export default function CreateTaskFromMessageModal({ message, conversation, userEmail, onClose, onCreated }) {
  const navigate = useNavigate();
  const { canModule } = usePermissions();
  const { modules } = useAppModules();
  const [targets, setTargets] = useState(null); // null = wczytywanie
  const [targetKey, setTargetKey] = useState('');
  const [name, setName] = useState(() => messageTaskName(message?.content));
  const [person, setPerson] = useState('');
  const [due, setDue] = useState('');
  const [people, setPeople] = useState([]);

  const moduleLabel = useMemo(() => {
    const byKey = new Map((modules || []).map((m) => [m.key, m.label]));
    return (key) => byKey.get(key) || null;
  }, [modules]);

  useEffect(() => {
    let alive = true;
    loadTaskTargets(conversation, { canModule, moduleLabel }).then(
      (list) => {
        if (!alive) return;
        setTargets(list);
        setTargetKey((cur) => (list.some((t) => t.key === cur) ? cur : list[0]?.key || ''));
      },
      () => { if (alive) setTargets([]); },
    );
    return () => { alive = false; };
    // Odświeżenie obiektu rozmowy (lista rozmów) nie zmienia tablic — tylko id/rodzaj/służba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, conversation?.type, conversation?.ministry_key, conversation?.name, canModule, moduleLabel]);

  // Osoby do wyboru: ja i autor wiadomości (imiona z kont).
  const authorEmail = message?.sender_email || null;
  useEffect(() => {
    const emails = [userEmail, authorEmail].filter(Boolean);
    if (!emails.length) return undefined;
    let alive = true;
    supabase.from('app_users').select('email, full_name, name, avatar_url').in('email', emails).then(({ data }) => {
      if (!alive) return;
      const found = new Map((data || []).map((u) => [normEmail(u.email), u]));
      setPeople(emails.map((e) => {
        const u = found.get(normEmail(e));
        return { email: u?.email || e, name: u?.full_name || u?.name || e, ...(u?.avatar_url ? { avatar_url: u.avatar_url } : {}) };
      }));
    }, () => {});
    return () => { alive = false; };
  }, [userEmail, authorEmail]);

  const me = people.find((p) => sameEmail(p.email, userEmail)) || (userEmail ? { email: userEmail, name: userEmail } : null);
  const author = people.find((p) => sameEmail(p.email, authorEmail))
    || (authorEmail ? { email: authorEmail, name: message?.sender?.full_name || authorEmail } : null);
  const personOptions = [
    { value: '', label: tr('Bez osoby') },
    ...(me ? [{ value: 'me', label: tr('Ja') }] : []),
    ...(author && !sameEmail(author.email, userEmail) ? [{ value: 'author', label: tr('Autor wiadomości: {name}', { name: author.name }) }] : []),
  ];
  const target = (targets || []).find((t) => t.key === targetKey) || null;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!name.trim() || !target) return;
    const chosen = person === 'me' ? me : person === 'author' ? author : null;
    try {
      const title = target.moduleKey && moduleLabel(target.moduleKey)
        ? tr('Zadania — {name}', { name: moduleLabel(target.moduleKey) }) : tr('Zadania');
      const { item, board, columns } = await createTaskFromMessage({
        target, message, title,
        input: {
          name: name.trim(),
          description: taskDescriptionFor(message, conversation, author?.name || message?.sender?.full_name),
          due: due || null,
          people: chosen ? [chosen] : [],
        },
        userEmail, userName: me?.name || null,
      });
      const link = taskItemLink(board, item.id, modulePathsOf(modules));
      const status = columns.find((c) => c.type === 'status');
      const label = status ? (status.settings?.labels || []).find((l) => l.id === item.cells?.[status.id]) : null;
      onCreated?.({
        id: String(item.id), boardId: String(board.id), board, name: item.name,
        status: label ? { id: label.id, title: label.title || '', color: label.color || null } : null, done: false,
      });
      toast.success({ message: tr('Utworzono zadanie'), action: { label: tr('Otwórz zadanie'), onClick: () => navigate(link) } });
      onClose();
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się utworzyć zadania.') });
    }
  };

  return (
    <Modal isOpen onClose={onClose} icon={CheckSquare} title={tr('Utwórz zadanie')} subtitle={conversationLabel(conversation)} size="md" closeOnBackdrop={false}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button type="submit" form="message-task-form" icon={Save} disabled={!name.trim() || !target}>{tr('Utwórz zadanie')}</Button>
      </>}>
      <form id="message-task-form" onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label htmlFor="message-task-name" className={LABEL}>{tr('Nazwa')}</label>
          <input id="message-task-name" autoFocus className={INPUT} value={name} maxLength={200}
            onChange={(e) => setName(e.target.value.replace(/[\r\n]+/g, ' '))} placeholder={tr('Co jest do zrobienia?')} />
        </div>
        {targets === null ? (
          <Spinner center size={20} />
        ) : targets.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300" role="alert">
            {tr('Nie masz uprawnień do tworzenia zadań na żadnej tablicy. Poproś lidera lub administratora o dostęp.')}
          </p>
        ) : (
          <CustomSelect label={tr('Tablica')} value={targetKey} onChange={(v) => setTargetKey(v || '')}
            options={targets.map((t) => ({ value: t.key, label: t.label }))} />
        )}
        <CustomSelect label={tr('Osoba')} value={person} onChange={(v) => setPerson(v || '')} options={personOptions} />
        <div>
          <span className={LABEL}>{tr('Termin')}</span>
          <CustomDatePicker value={due} onChange={(v) => setDue(v || '')} aria-label={tr('Termin')} />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {tr('W opisie zadania znajdzie się treść wiadomości i link do niej.')}
        </p>
      </form>
    </Modal>
  );
}
