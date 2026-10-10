import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  Calendar as CalIcon, ChevronLeft, ChevronRight,
  Plus, CheckCircle, Clock, Video, Music, X, Save,
  Users, HeartHandshake, Home, Baby, Trash2,
  MapPin, Search, Check,
  LayoutGrid, List, LayoutList, Columns, CalendarPlus, ListTodo,
  Filter, Church
} from 'lucide-react';
import CustomSelect from '../components/CustomSelect';
import Modal from '../components/Modal';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import { CreateEventModal } from './Events/EventsModule';
import { useCampusQuery } from '../hooks/useCampusQuery';
import { useModules } from '../hooks/useModules';
import { useModuleCalendars } from '../hooks/useModuleLabel';
import { useT } from '../i18n';
import { tr, appLocale } from '../i18n';
import { toast } from '../lib/toast';
import { TimeField } from '../components/pickers';
import { confirmDialog } from '../lib/dialog';
import { ChoiceList, ChoiceRow } from '../components/ChoiceList';
import * as LucideIcons from 'lucide-react';
import { EventFormatBadge, isOnlineFormat, formatLabel } from './Events/eventFormat';
import CustomDatePicker from '../components/CustomDatePicker';  // wspólne pole daty (wcześniej lokalna kopia bez ramki pola)
import {
  boardItemToTask, loadCalendarTaskBoard, loadMyAssignedItems, saveCalendarTask, deleteCalendarTask, isAccessError,
  resolveTaskItem,
} from './Boards/lib/calendarTasks';
import { taskItemLink } from '@avenit/shared/src/lib/taskLinks.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';

// --- POMOCNICZE (czyste funkcje — testy w CalendarModule.test.js) ---

const pad2 = (n) => String(n).padStart(2, '0');
// Dzień LOKALNY 'YYYY-MM-DD' (toISOString dawał dzień UTC — między 00:00 a 02:00 „wczoraj”).
export const localYmd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hhmm = (v) => (v ? String(v).slice(0, 5) : '');

// 'YYYY-MM-DD' (+ opcjonalnie 'HH:MM') → Date w czasie lokalnym, bez przesunięcia przez UTC.
export function localDateTime(dateStr, timeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return null;
  const [hh, mm] = String(timeStr || '').split(':').map(Number);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh || 0, mm || 0);
}

// Godzina końca nie może być przed (ani równa) początkiem — porównanie 'HH:MM'.
export const endNotAfterStart = (start, end) => {
  const s = hhmm(start);
  const e = hhmm(end);
  return !!(s && e && e <= s);
};

// Zadanie: due_date bywa TIMESTAMPTZ (pełny znacznik) albo DATE ('YYYY-MM-DD'); godzina lokalna
// jest w osobnej kolumnie due_time — to ona jest źródłem prawdy (dawniej czytaliśmy godzinę
// z ciągu UTC, więc 10:00 pokazywało się jako 08:00, a każde „Zapisz” przesuwało o 2 h).
export function readTaskWhen(task) {
  const raw = task?.due_date;
  if (!raw) return null;
  const s = String(raw);
  let date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    date = localDateTime(s);
  } else {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    date = d;
  }
  let time = hhmm(task.due_time);
  if (!time && s.length > 10 && !/T00:00(:00(\.0+)?)?(Z|[+-]00(:?00)?)?$/.test(s)) {
    time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  const ymd = localYmd(date);
  return { ymd, time, date: localDateTime(ymd, time) };
}

// Zapis terminu zadania: lokalna data + godzina z jawnym przesunięciem strefy, np.
// '2026-10-11T10:00:00+02:00' — poprawne dla TIMESTAMPTZ, a kolumna DATE weźmie z tego sam dzień.
export function taskDueDateValue(dateStr, timeStr) {
  const d = localDateTime(dateStr, timeStr || '00:00');
  if (!d) return null;
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  const sign = off >= 0 ? '+' : '-';
  return `${String(dateStr).slice(0, 10)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}

// Moduł wydarzenia → „kalendarz” (filtr po lewej). Wydarzenia ogólne i programy = 'program'.
const MODULE_TEAM = {
  worship: { emoji: '🎵', team: 'worship' },
  media: { emoji: '🎬', team: 'media' },
  atmosfera: { emoji: '💚', team: 'atmosfera' },
  kids: { emoji: '👶', team: 'kids' },
  homegroups: { emoji: '🏠', team: 'groups' },
  mlodziezowka: { emoji: '🎉', team: 'mlodziezowka' },
};
const isModuleKey = (k) => k && k !== 'general' && k !== 'program';

// Jedna lista wpisów kalendarza z czterech źródeł. Klucze z prefiksem (ev_/prog_/task_/bi_) —
// id programu i wydarzenia mogą być równe, a React gubił wtedy wpisy (zdublowany klucz).
// Program podpięty do wydarzenia (events.program_id) nie jest osobnym wpisem — to plan tego
// wydarzenia (wcześniej ta sama niedziela była w kalendarzu dwa razy).
// tasks: zadania kalendarza (elementy tablicy „Zadania”, boardItemToTask); boardItems: elementy
// innych tablic przypisane do mnie (fn my-board-items) — tylko do podglądu, klik → element.
export function buildCalendarEntries({ programs = [], events = [], tasks = [], boardItems = [] } = {}) {
  const all = [];
  const linked = new Set((events || []).map((e) => e?.program_id).filter((v) => v != null).map(String));

  (events || []).forEach((ev) => {
    if (!ev?.date) return;
    const date = localDateTime(ev.date, ev.time);
    if (!date || isNaN(date.getTime())) return;
    const raw = { ...ev, due_time: hhmm(ev.time), end_time: hhmm(ev.end_time) };
    if (isModuleKey(ev.module_key)) {
      const meta = MODULE_TEAM[ev.module_key] || { emoji: '📅', team: ev.module_key };
      all.push({ id: `ev_${ev.id}`, type: 'event', team: meta.team, title: `${meta.emoji} ${ev.title || ''}`.trim(), date, raw });
    } else {
      all.push({ id: `ev_${ev.id}`, type: 'event', team: 'program', title: ev.title || tr('Wydarzenie'), date, raw });
    }
  });

  (programs || []).forEach((p) => {
    if (!p?.date || linked.has(String(p.id))) return;
    const date = localDateTime(p.date);
    if (!date) return;
    all.push({ id: `prog_${p.id}`, type: 'program', team: 'program', title: p.title || tr('Program nabożeństwa'), date, raw: { ...p, due_time: '', end_time: '' } });
  });

  (tasks || []).forEach((t) => {
    const when = readTaskWhen(t);
    if (!when) return;
    all.push({
      id: `task_${t.id}`,
      type: 'task',
      team: t.team || 'media',
      title: t.title,
      date: when.date,
      status: t.status,
      done: !!t.done,
      // „Surowa” data i godzina lokalna do edycji (ModalAddTask).
      raw: calendarTaskRaw(t, when),
    });
  });

  (boardItems || []).forEach((it) => {
    const date = localDateTime(it?.date);
    if (!date) return;
    // Link z jednej reguły (taskLinks.js): zadanie służby → moduł ?item=, Kalendarz → /wydarzenia?item=,
    // reszta → Projekty. Ścieżka modułu z serwera (app_modules.path), gdy jest.
    const paths = it.module_key && it.module_path ? { [it.module_key]: it.module_path } : {};
    const link = it.board_id != null
      ? taskItemLink({ id: it.board_id, module_key: it.module_key, source_kind: it.source_kind }, it.id, paths)
      : it.link;
    all.push({
      id: `bi_${it.id}`,
      type: 'board_item',
      // Tablica służby → kolor/filtr tej służby; Projekty → poza filtrami (zawsze widoczne).
      team: MODULE_TEAM[it.module_key]?.team || 'boards',
      title: it.name || tr('Zadanie'),
      date,
      status: it.status?.title || '',
      done: !!it.done || isDoneLabel(it.status),
      raw: { id: it.id, title: it.name || '', description: it.board_name || '', due_time: '', end_time: '', link, board_name: it.board_name },
    });
  });

  return all;
}

// Zadanie kalendarza → dane okna zadania (lokalna data i godzina, bez przesunięcia strefy).
export function calendarTaskRaw(t, when = readTaskWhen(t)) {
  return { ...t, due_date: when?.ymd || t?.due_date || null, due_time: when?.time || '', end_time: hhmm(t?.end_time) };
}

// --- KONFIGURACJA ZESPOŁÓW I DANYCH ---

// Etykiety tu to tylko zapas — na ekranie pokazujemy nazwę modułu z Ustawień (teamLabel).
const TEAMS = {
  program: { label: tr('Ogólne i nabożeństwa'), color: 'pink', icon: Music },
  media: { label: tr('Media'), color: 'orange', icon: Video },
  atmosfera: { label: tr('Atmosfera'), color: 'teal', icon: HeartHandshake },
  worship: { label: tr('Uwielbienie'), color: 'purple', icon: Music },
  kids: { label: tr('Dzieci'), color: 'yellow', icon: Baby },
  groups: { label: tr('Grupy domowe'), color: 'blue', icon: Home },
  mlodziezowka: { label: tr('Młodzieżówka'), color: 'rose', icon: Users },
};
// Klucz „kalendarza” → klucz modułu (do nazwy z app_modules).
const TEAM_MODULE = { media: 'media', atmosfera: 'atmosfera', worship: 'worship', kids: 'kids', groups: 'homegroups', mlodziezowka: 'mlodziezowka' };
// Kolor kalendarza = kropka (bez pionowych pasków-akcentów).
const DOT = {
  pink: 'bg-accent-primary-light', orange: 'bg-accent-secondary-light', purple: 'bg-purple-500',
  teal: 'bg-teal-500', blue: 'bg-blue-500', yellow: 'bg-amber-500', rose: 'bg-rose-500', gray: 'bg-gray-400',
};
const dotClass = (team) => DOT[TEAMS[team]?.color] || DOT.gray;

// --- HELPERY UI ---



const CustomTimePicker = ({ value, onChange, placeholder = tr('Wybierz'), invalid = false }) => {
  return (
    <div className="relative w-full">
      <TimeField
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={`w-full h-[42px] px-3 bg-white dark:bg-gray-800 border rounded-xl text-sm text-gray-700 dark:text-gray-200 font-medium hover:border-accent-primary-light focus:border-accent-primary-light focus:ring-2 focus:ring-accent-primary-light/20 outline-none transition cursor-pointer ${invalid ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`}
      />
    </div>
  );
};

const getDaysInMonth = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  return { days, firstDay: firstDay === 0 ? 6 : firstDay - 1 };
};

const FieldError = ({ children }) => (children ? <p className="text-xs text-red-600 dark:text-red-400 mt-1 ml-1" role="alert">{children}</p> : null);

// --- MODAL WYBORU TYPU (WYDARZENIE VS ZADANIE) ---

export const ModalSelectType = ({ date, onClose, onSelectTask, onSelectEvent }) => {
  const t = useT();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Co chcesz dodać?')}
      subtitle={date ? localDateTime(date).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' }) : t('Wybierz typ')}
      icon={Plus}
      size="sm"
      closeOnBackdrop={false}
    >
      <div className="p-3 sm:p-4">
        <ChoiceList>
          <ChoiceRow data-tour="cal-type-event" primary icon={CalendarPlus} title={t('Wydarzenie')}
            description={t('Nabożeństwo, spotkanie, próba')} onClick={onSelectEvent} />
          <ChoiceRow icon={ListTodo} title={t('Zadanie')}
            description={t('Coś do zrobienia na ten dzień')} onClick={onSelectTask} />
        </ChoiceList>
      </div>
    </Modal>
  );
};

// --- MODAL WYBORU KALENDARZA WYDARZENIA ---

// Znane kalendarze służb (nazwa i ikona na ekranie = nazwa i ikona modułu z Ustawień, tu tylko zapas).
export const MINISTRY_CALENDARS = [
  { key: 'worship', iconName: 'Music', title: tr('Uwielbienie'), description: tr('Próby, koncerty, nabożeństwa') },
  { key: 'media', iconName: 'Video', title: tr('Media'), description: tr('Produkcje, streaming, szkolenia') },
  { key: 'atmosfera', iconName: 'Coffee', title: tr('Atmosfera'), description: tr('Spotkania, integracje') },
  { key: 'kids', iconName: 'Baby', title: tr('Dzieci'), description: tr('Zajęcia, warsztaty, wycieczki') },
  { key: 'homegroups', iconName: 'Home', title: tr('Grupy domowe'), description: tr('Spotkania grupowe') },
  { key: 'mlodziezowka', iconName: 'Flame', title: tr('Młodzieżówka'), description: tr('Wydarzenia młodzieżowe') }
];
const calendarIcon = (name) => LucideIcons[name] || CalIcon;

export const ModalSelectEventCategory = ({ date, ministries, onClose, onSelectCategory, onSelectMinistry }) => {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={tr('Wybierz kalendarz')}
      subtitle={date ? localDateTime(date).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' }) : ''}
      icon={CalendarPlus}
      size="sm"
      closeOnBackdrop={false}
    >
      <div className="p-3 sm:p-4">
        {/* Nabożeństwo - zawsze na górze. Tworzy WYDARZENIE (grafik służb jest na wydarzeniu,
            program podpina się na jego stronie) — nic nie zapisuje, zanim klikniesz „Utwórz”. */}
        <ChoiceList>
          <ChoiceRow primary icon={Church} title={tr('Nabożeństwo')}
            description={tr('Grafik służb i program dodasz na stronie wydarzenia')}
            onClick={() => onSelectCategory('nabożeństwo')} />
        </ChoiceList>

        {/* Kalendarze służb — dynamicznie: wszystkie moduły z zakładką „Wydarzenia" */}
        <ChoiceList label={tr('Kalendarze służb')}>
          {(ministries || MINISTRY_CALENDARS).map((ministry) => (
            <ChoiceRow key={ministry.key} icon={calendarIcon(ministry.iconName)} title={ministry.title}
              description={ministry.description} onClick={() => onSelectMinistry(ministry.key)} />
          ))}
        </ChoiceList>
      </div>
    </Modal>
  );
};

// --- TASK MODAL ---

// Zadanie kalendarza = element tablicy „Zadania” — osoba przypisana trafia do kolumny „Osoby”.
// Kilka osób (przypisanych w tablicy) pokazujemy jako jedną opcję; bez zmiany wyboru zostają wszyscy.
const MANY = '__many__';
function assigneeOptions(people, current, t) {
  const opts = [{ value: '', label: t('Nie przypisano') }];
  if (current.length > 1) opts.push({ value: MANY, label: current.map((p) => p.name || p.email).join(', ') });
  const seen = new Set();
  for (const p of [...current, ...(people || [])]) {
    const key = String(p?.email || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    opts.push({ value: p.email, label: p.name || p.email });
  }
  return opts;
}

const ModalAddTask = ({ initialTask, teamOptions, people = [], onClose, onSave, onDelete }) => {
  const t = useT();
  const currentPeople = Array.isArray(initialTask?.people) ? initialTask.people : [];
  const [assignee, setAssignee] = useState(() => (currentPeople.length > 1 ? MANY : (currentPeople[0]?.email || '')));
  const [task, setTask] = useState(() => ({
    title: '',
    description: '',
    team: 'media',
    due_date: localYmd(),
    due_time: '10:00',
    end_time: '11:00',
    location: '',
    status: 'Do zrobienia',
    ...(initialTask || {}),
  }));
  const [errors, setErrors] = useState({});

  useEffect(() => {
      if (initialTask) {
          setTask((prev) => ({
              ...prev,
              ...initialTask,
              location: initialTask.location || '',
              description: initialTask.description || '',
              end_time: initialTask.end_time || ''
          }));
      }
  }, [initialTask]);

  // Zapis: walidacja przy polach, okno zamyka się DOPIERO po udanym zapisie (rodzic zwraca true).
  const handleSubmit = async () => {
    const next = {};
    if (!task.title?.trim()) next.title = tr('Podaj tytuł zadania.');
    if (!task.due_date) next.due_date = tr('Wybierz datę.');
    if (endNotAfterStart(task.due_time, task.end_time)) next.end_time = tr('Koniec musi być później niż początek.');
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
        title: task.title.trim(),
        description: task.description || '',
        team: task.team || 'media',
        due_date: taskDueDateValue(task.due_date, task.due_time),
        due_time: task.due_time || null,
        end_time: task.end_time || null,
        location: task.location || '',
        status: task.status || 'Do zrobienia'
    };
    // Osoba: zapisujemy tylko zmieniony wybór (inaczej przypisania z tablicy zostają bez zmian).
    const initialAssignee = currentPeople.length > 1 ? MANY : (currentPeople[0]?.email || '');
    if (assignee !== initialAssignee && assignee !== MANY) {
      const pool = [...currentPeople, ...people];
      const p = assignee ? pool.find((x) => x.email === assignee) : null;
      payload.assignee_touched = true;
      payload.assignee = p ? { email: p.email, name: p.name || p.email, avatar_url: p.avatar_url || null } : null;
    }

    if (task.id) payload.id = task.id;

    if (await onSave(payload)) onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={task.id ? t('Edytuj zadanie') : t('Nowe zadanie')}
      icon={task.id ? CheckCircle : Plus}
      closeOnBackdrop={false}
      footer={<>
        {task.id && onDelete && <Button variant="danger" icon={Trash2} className="mr-auto" onClick={() => onDelete(task)}>{tr('Usuń')}</Button>}
        <Button variant="secondary" onClick={onClose}>{t('Anuluj')}</Button>
        <Button icon={Save} onClick={handleSubmit}>{t('Zapisz')}</Button>
      </>}
    >
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="cal-task-title" className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Tytuł')}</label>
          <input id="cal-task-title" autoFocus aria-invalid={!!errors.title || undefined} className={`w-full px-3 py-2 border rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-accent-primary/20 outline-none ${errors.title ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`} value={task.title} onChange={e => setTask({...task, title: e.target.value})} placeholder={t('Co jest do zrobienia?')} />
          <FieldError>{errors.title}</FieldError>
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Kategoria')}</label><CustomSelect value={task.team} onChange={v => setTask({...task, team: v})} options={teamOptions} /></div>
           <div><label htmlFor="cal-task-location" className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Miejsce')}</label><div className="relative"><MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" /><input id="cal-task-location" className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm" value={task.location || ''} onChange={e => setTask({...task, location: e.target.value})} placeholder={t('np. Biuro')} /></div></div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Data')}</label>
          <CustomDatePicker value={task.due_date} onChange={(val) => setTask(prev => ({...prev, due_date: val}))} invalid={!!errors.due_date} />
          <FieldError>{errors.due_date}</FieldError>
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Godzina rozpoczęcia')}</label><CustomTimePicker value={task.due_time} onChange={v => setTask({...task, due_time: v})} placeholder={tr('Od')} /></div>
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Godzina zakończenia')}</label>
             <CustomTimePicker value={task.end_time} onChange={v => setTask({...task, end_time: v})} placeholder={tr('Do')} invalid={!!errors.end_time} />
             <FieldError>{errors.end_time}</FieldError>
           </div>
        </div>
        <div>
          <label id="cal-task-assignee" className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Przypisana osoba')}</label>
          <CustomSelect aria-labelledby="cal-task-assignee" value={assignee} onChange={(v) => setAssignee(v ?? '')}
            options={assigneeOptions(people, currentPeople, t)} placeholder={t('Wybierz osobę...')} />
        </div>
        <div><label htmlFor="cal-task-desc" className="block text-xs font-bold text-gray-500 uppercase mb-1">{t('Opis')}</label><textarea id="cal-task-desc" className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white text-sm h-24 resize-none" value={task.description || ''} onChange={e => setTask({...task, description: e.target.value})} placeholder={t('Szczegóły zadania...')} /></div>
      </div>
    </Modal>
  );
};

const EventBadge = ({ event, onClick }) => {
  // Zadanie z tablicy Projektów (poza kalendarzami służb) — neutralny chip.
  const teamConfig = TEAMS[event.team] || (event.type === 'board_item' ? { color: 'gray' } : TEAMS.media);
  const colors = {
    gray: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    orange: "bg-accent-secondary-lighter text-accent-secondary border-accent-secondary-lighter",
    pink: "bg-accent-primary-lighter text-accent-primary border-accent-primary-lighter",
    purple: "bg-purple-100 text-purple-700 border-purple-200",
    yellow: "bg-yellow-100 text-yellow-700 border-yellow-200",
    teal: "bg-teal-100 text-teal-700 border-teal-200",
    rose: "bg-rose-100 text-rose-700 border-rose-200",
  };
  const style = colors[teamConfig.color] || colors.orange;
  const start = event.raw?.due_time || '';
  const timeDisplay = start ? (event.raw?.end_time ? `${start}–${event.raw.end_time}` : start) : '';

  // Chip min. 12 px (było 10/9 px — „Naboże…” nieczytelne); godzina w podpowiedzi i w nazwie dla czytników.
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(event); }}
      title={timeDisplay ? `${event.title} · ${timeDisplay}` : event.title}
      className={`w-full text-left text-xs px-1.5 py-1 rounded-md border mb-1 cursor-pointer truncate flex items-center gap-1 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 ${style}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50 shrink-0" aria-hidden="true" />
      {start && <span className="opacity-70 tabular-nums shrink-0">{start}</span>}
      <span className={`truncate font-medium ${event.done ? 'line-through opacity-60' : ''}`}>{event.title}</span>
      {isOnlineFormat(event.raw?.format) && (
        <LucideIcons.Video size={12} className="shrink-0 opacity-70" aria-label={formatLabel(event.raw.format)} />
      )}
      {event.done && <span className="sr-only">{tr('Gotowe')}</span>}
    </button>
  );
};

// --- MAIN MODULE ---


export default function CalendarModule({ embedded = false } = {}) {
  const t = useT();
  const navigate = useNavigate();
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const { modules: allModules, tabs: allTabs } = useModules();
  const calMap = useModuleCalendars();
  const moduleByKey = useMemo(() => new Map((allModules || []).map((m) => [m.key, m])), [allModules]);
  // Nazwa kalendarza = nazwa modułu z Ustawień (zamiast „Małe Avenit” / „Media Team” na sztywno).
  const teamLabel = (key) => {
    const mk = TEAM_MODULE[key];
    const lbl = mk ? moduleByKey.get(mk)?.label : null;
    return lbl || TEAMS[key]?.label || moduleByKey.get(key)?.label || key || tr('Wydarzenie');
  };
  // Picker „Wybierz kalendarz" = znane kalendarze (o ile moduł nie jest wyłączony) + KAŻDY
  // włączony moduł z zakładką „Wydarzenia" (component_type='events').
  const ministryCalendars = useMemo(() => {
    const list = [];
    MINISTRY_CALENDARS.forEach((c) => {
      const m = moduleByKey.get(c.key);
      if (m && !m.is_enabled) return;
      list.push({ ...c, title: m?.label || c.title, iconName: m?.icon || c.iconName });
    });
    const have = new Set(MINISTRY_CALENDARS.map((m) => m.key));
    (allModules || []).forEach((m) => {
      if (have.has(m.key) || !m.is_enabled) return;
      if (!(allTabs[m.id] || []).some((tb) => tb.component_type === 'events')) return;
      list.push({ key: m.key, iconName: m.icon || 'CalendarDays', title: m.label || m.key, description: '' });
    });
    return list;
  }, [allModules, allTabs, moduleByKey]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [visibleTeams, setVisibleTeams] = useState(() => {
    let saved = null;
    try { saved = localStorage.getItem('calendarVisibleTeams'); } catch { saved = null; }
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sprawdź czy wszystkie klucze są prawidłowe
        const validKeys = Object.keys(TEAMS);
        const filtered = parsed.filter(key => validKeys.includes(key));
        return filtered.length > 0 ? filtered : validKeys;
      } catch {
        return Object.keys(TEAMS);
      }
    }
    return Object.keys(TEAMS);
  });
  const [modals, setModals] = useState({
    addTask: null,
    selectType: null,      // { date: 'YYYY-MM-DD' } - modal wyboru typu
    selectCategory: null,  // { date: 'YYYY-MM-DD' } - modal wyboru kalendarza wydarzenia
    createEvent: null,     // { date, title?, module_key?, event_type? } - wspólny formularz „Nowe wydarzenie”
  });
  const [view, setView] = useState('month');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [searchQuery, setSearchQuery] = useState('');

  // Śledzenie rozmiaru okna dla responsywności
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Zapisz wybrane kalendarze do localStorage przy każdej zmianie
  useEffect(() => {
    try { localStorage.setItem('calendarVisibleTeams', JSON.stringify(visibleTeams)); } catch { /* tryb prywatny */ }
  }, [visibleTeams]);

  useEffect(() => {
      fetchEvents();
  }, [currentDate.getMonth(), selectedCampusId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zadania kalendarza = elementy tablicy „Zadania” (dawna tabela `tasks` przeniesiona raz przez
  // serwer). Ref, bo potrzebny tylko przy zapisie/usuwaniu — bez dodatkowych przerysowań.
  const taskBoardRef = useRef(null); // { board, columns, items, groupId } | null
  const [taskPeople, setTaskPeople] = useState([]); // lista osób do „Przypisana osoba” w oknie zadania
  const meRef = useRef({ email: null, name: null });

  const fetchEvents = async () => {
    const [progRes, evRes, taskRes, assigned] = await Promise.all([
      withCampusFilter(supabase.from('programs').select('id, title, date, campus_id, type_id')),
      withCampusFilter(supabase.from('events').select('id, title, module_key, event_type, date, time, end_time, location, description, program_id, campus_id, is_archived, format')),
      loadCalendarTaskBoard().then((board) => ({ board }), (error) => ({ error })),
      loadMyAssignedItems(),
    ]);
    const taskBoard = taskRes.board || null;
    taskBoardRef.current = taskBoard;
    const taskErr = taskRes.error && !isAccessError(taskRes.error) ? taskRes.error : null;
    if (progRes.error || taskErr || evRes.error) {
      toast.error(progRes.error || taskErr || evRes.error, { fallback: tr('Nie udało się wczytać całego kalendarza. Odśwież stronę.') });
    }
    const tasks = taskBoard ? taskBoard.items.map((it) => boardItemToTask(it, taskBoard.columns)) : [];
    // Zadania tablicy kalendarza są już wyżej (edytowalne) — bez dubli z „przypisanych mi”.
    const boardItems = (assigned || []).filter((it) => !taskBoard || String(it.board_id) !== String(taskBoard.board.id));
    setEvents(buildCalendarEntries({ programs: progRes.data || [], events: evRes.data || [], tasks, boardItems }));
    setBoardLoads((n) => n + 1);
  };

  // ?item=<id> (powiadomienie, Pulpit, wyszukiwarka, wydarzenie): zadanie Kalendarza → jego okno
  // (i miesiąc z terminem); zadanie z innej tablicy → jego miejsce wg taskItemLink (moduł/Projekty).
  // Parametr znika z adresu po obsłużeniu — powrót do Kalendarza nie otwiera zadania ponownie.
  const [searchParams, setSearchParams] = useSearchParams();
  const itemParam = searchParams.get('item');
  const [boardLoads, setBoardLoads] = useState(0);
  const handledItemRef = useRef(null);
  // Obsługa linku nie może przepaść, gdy w trakcie dojdzie kolejne wczytanie kalendarza (zmiana
  // zależności) — przerywamy tylko po odmontowaniu.
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!itemParam || !boardLoads || handledItemRef.current === itemParam) return;
    handledItemRef.current = itemParam;
    const clearParam = () => setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('item');
      return next;
    }, { replace: true });
    (async () => {
      const board = taskBoardRef.current;
      const local = board?.items.find((it) => String(it.id) === String(itemParam));
      if (local) {
        const task = boardItemToTask(local, board.columns);
        const when = readTaskWhen(task);
        if (when?.date) setCurrentDate(new Date(when.date.getFullYear(), when.date.getMonth(), 1));
        setModals((m) => ({ ...m, addTask: calendarTaskRaw(task, when) }));
        clearParam();
        return;
      }
      const found = await resolveTaskItem(itemParam);
      if (!mountedRef.current) return;
      if (found?.board && String(found.board.id) !== String(board?.board?.id ?? '')) {
        const paths = Object.fromEntries((allModules || []).filter((m) => m?.key && m.path).map((m) => [m.key, m.path]));
        const link = taskItemLink(found.board, itemParam, paths);
        // Inna tablica „Zadania” Kalendarza prowadziłaby tu z powrotem — wtedy tylko komunikat.
        if (!/^\/(wydarzenia|calendar)\?/.test(link)) { navigate(link, { replace: true }); return; }
      }
      toast.info(tr('Nie znaleziono tego zadania albo nie masz do niego dostępu.'));
      clearParam();
    })();
  }, [itemParam, boardLoads]); // eslint-disable-line react-hooks/exhaustive-deps

  // Osoby do wyboru w oknie zadania (jak picker „Osoby” w tablicy: aktywne konta) + ja (dziennik).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (user?.email) meRef.current = { email: user.email, name: null };
        const { data } = await supabase.from('app_users').select('email, full_name, name, avatar_url').eq('is_active', true).order('full_name');
        if (!alive) return;
        const list = (data || []).filter((u) => u.email).map((u) => ({ email: u.email, name: u.full_name || u.name || u.email, avatar_url: u.avatar_url || null }));
        setTaskPeople(list);
        const mine = list.find((p) => p.email === meRef.current.email);
        if (mine) meRef.current = { email: mine.email, name: mine.name };
      } catch { /* bez listy — wybór osoby pusty, reszta działa */ }
    })();
    return () => { alive = false; };
  }, []);

  // Zapis zadania — zwraca true/false, modal zamyka się tylko po sukcesie.
  const handleSaveTask = async (taskData) => {
      const id = taskData.id;
      let board = taskBoardRef.current;
      if (!board) {
        try { board = await loadCalendarTaskBoard(); taskBoardRef.current = board; } catch { board = null; }
      }
      const { error } = board
        ? await saveCalendarTask(board, taskData, { userEmail: meRef.current.email, userName: meRef.current.name })
        : { error: { message: tr('Nie udało się zapisać zadania. Spróbuj ponownie.') } };
      if (error) {
          toast.error(error, { fallback: tr('Nie udało się zapisać zadania. Spróbuj ponownie.') });
          return false;
      }
      toast.success(id ? tr('Zapisano zadanie') : tr('Dodano zadanie'));
      fetchEvents();
      return true;
  };

  const handleDeleteTask = async (task) => {
      const ok = await confirmDialog({
        title: tr('Usunąć zadanie?'),
        message: tr('Zadanie „{title}” zniknie z kalendarza. Tej operacji nie można cofnąć.', { title: task?.title || '' }),
        isDelete: true,
      });
      if (!ok) return;
      const { error } = await deleteCalendarTask(task.id);
      if (error) {
        toast.error(error, { fallback: tr('Nie udało się usunąć zadania.') });
        return;
      }
      toast.success(tr('Usunięto zadanie'));
      setModals((m) => ({ ...m, addTask: null }));
      fetchEvents();
  };

  // Flow dodawania: kliknięcie na + otwiera modal wyboru typu
  const handleAddClick = (dateStr) => {
    setModals((m) => ({ ...m, selectType: { date: dateStr } }));
  };

  // Po wyborze "Wydarzenie" - otwórz modal kalendarza
  const handleSelectEvent = () => {
    setModals((m) => ({ ...m, selectType: null, selectCategory: { date: m.selectType?.date } }));
  };

  // Po wyborze "Zadanie" - otwórz modal zadania
  const handleSelectTask = () => {
    setModals((m) => ({
      ...m,
      selectType: null,
      addTask: { due_date: m.selectType?.date || localYmd(), due_time: '10:00', end_time: '11:00', team: 'media' }
    }));
  };

  // Typ „nabożeństwo” z konfiguracji kalendarza ogólnego (jeśli admin go nazwał inaczej), inaczej domyślny.
  const serviceEventType = () => {
    const types = calMap?.general?.types || [];
    const hit = types.find((x) => /nabo[zż]e[nń]stw/i.test(`${x?.value || ''} ${x?.label || ''}`));
    return hit?.value || 'nabożeństwo';
  };

  // „Nabożeństwo” → ten sam formularz co „Nowe wydarzenie” (z datą i nazwą). NIC nie zapisujemy,
  // dopóki użytkownik nie kliknie „Utwórz” — dawniej sam wybór kafla tworzył pusty program.
  const handleSelectCategory = (category) => {
    if (String(category).toLowerCase() !== 'nabożeństwo') return;
    setModals((m) => ({
      ...m,
      selectCategory: null,
      createEvent: { date: m.selectCategory?.date || '', title: tr('Nabożeństwo'), event_type: serviceEventType(), time: '10:00' },
    }));
  };

  // Kalendarz służby → ten sam formularz z ustawionym modułem.
  const handleSelectMinistry = (ministryKey) => {
    setModals((m) => ({
      ...m,
      selectCategory: null,
      createEvent: { date: m.selectCategory?.date || '', module_key: ministryKey },
    }));
  };

  // Klik w kalendarzu: wydarzenie → jego strona (jeden edytor zamiast starego modala),
  // program bez wydarzenia → edytor programu, zadanie → okno zadania, zadanie z innej tablicy →
  // ten element (moduł z ?item=… albo Projekty).
  const handleEventClick = (ev) => {
    if (ev.type === 'task') { setModals((m) => ({ ...m, addTask: ev.raw })); return; }
    if (ev.type === 'board_item') { if (ev.raw?.link) navigate(ev.raw.link); return; }
    if (ev.type === 'program') { navigate(`/programs/${ev.raw.id}`); return; }
    navigate(`/wydarzenie/${ev.raw.id}`);
  };

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const { days, firstDay } = getDaysInMonth(currentDate);
  const daysArray = Array.from({ length: days }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDay });
  const filteredEvents = events.filter(e => {
    // Filtruj po widocznych kalendarzach (kalendarze spoza listy — np. własne moduły — zawsze widoczne)
    if (TEAMS[e.team] && !visibleTeams.includes(e.team)) return false;

    // Filtruj po wyszukiwaniu
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const titleMatch = e.title?.toLowerCase().includes(query);
      const descMatch = e.raw?.description?.toLowerCase().includes(query);
      const locationMatch = e.raw?.location?.toLowerCase().includes(query);
      const teamMatch = teamLabel(e.team)?.toLowerCase().includes(query);
      return titleMatch || descMatch || locationMatch || teamMatch;
    }

    return true;
  });
  const taskTeamOptions = Object.keys(TEAMS).filter((k) => k !== 'program').map((k) => ({ value: k, label: teamLabel(k) }));

  // --- RENDER LOGIC FOR VIEWS ---

  // Wrapper dla mobilnego widoku schedule z własnym stanem
  const MobileScheduleWrapper = () => {
    const [selectedDate, setSelectedDateLocal] = useState(currentDate);
    const [mobileViewMode, setMobileViewMode] = useState('day');
    const [mobileSearchExpanded, setMobileSearchExpanded] = useState(false);
    const mobileSearchRef = useRef(null);

    const getWeekDays = () => {
      const curr = new Date(selectedDate);
      // Oblicz poniedziałek tego tygodnia
      // getDay() zwraca 0 dla niedzieli, 1 dla poniedziałku, itd.
      const dayOfWeek = curr.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Dla niedzieli cofamy się o 6 dni
      const monday = new Date(curr);
      monday.setDate(curr.getDate() + mondayOffset);

      return Array.from({length: 7}, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      });
    };

    const weekDays = getWeekDays();
    const dayEvents = filteredEvents.filter(e =>
      e.date.getDate() === selectedDate.getDate() &&
      e.date.getMonth() === selectedDate.getMonth() &&
      e.date.getFullYear() === selectedDate.getFullYear()
    );

    const hours = Array.from({length: 17}, (_, i) => i + 6);

    const getEventPosition = (ev) => {
      let h, m;
      if (ev.raw?.due_time) {
        [h, m] = ev.raw.due_time.split(':').map(Number);
      } else {
        h = ev.date.getHours() || 10;
        m = ev.date.getMinutes() || 0;
      }
      return { hour: h, minute: m };
    };

    return (
      <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
        {/* Header z miesiącem */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {selectedDate.toLocaleDateString(appLocale(), { month: 'long' })}
                <span className="text-accent-primary-light ml-2">{selectedDate.getFullYear()}</span>
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* Search button - rozwijalna lupka */}
              <button
                onClick={() => { setMobileSearchExpanded(true); setTimeout(() => mobileSearchRef.current?.focus(), 100); }}
                className={`p-2 rounded-xl transition ${searchQuery ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
              >
                <Search size={18} />
              </button>
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-600 dark:text-gray-400"
              >
                <Filter size={18} />
              </button>
            </div>
          </div>

          {/* Rozwinięty pasek wyszukiwania */}
          {mobileSearchExpanded && (
            <div className="relative mb-3 animate-in slide-in-from-top duration-200">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={mobileSearchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => { if (!searchQuery) setMobileSearchExpanded(false); }}
                placeholder={t('Szukaj wydarzeń...')}
                className="w-full pl-9 pr-9 py-2.5 bg-gray-100 dark:bg-gray-800 border border-accent-primary-light dark:border-accent-primary-light rounded-xl text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none transition"
              />
              <button
                onClick={() => { setSearchQuery(''); setMobileSearchExpanded(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {searchQuery && !mobileSearchExpanded && (
            <p className="text-xs text-accent-primary dark:text-accent-primary-light font-medium mb-2">
              {tr('Znaleziono {n} wydarzeń', { n: filteredEvents.length })}
            </p>
          )}

          {/* Przełącznik widoku */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-4">
            {[
              { id: 'day', label: t('Dzień'), icon: LayoutList },
              { id: 'week', label: t('Tydzień'), icon: Columns },
              { id: 'month', label: t('Miesiąc'), icon: LayoutGrid },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setMobileViewMode(v.id)}
                className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                  mobileViewMode === v.id
                    ? 'bg-white dark:bg-gray-700 text-accent-primary dark:text-accent-primary-light shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                <v.icon size={14} />
                {v.label}
              </button>
            ))}
          </div>

          {/* Mini kalendarz tygodniowy z nawigacją */}
          <div className="flex items-center gap-2 mb-2">
            {/* Strzałka wstecz */}
            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 7);
                setSelectedDateLocal(newDate);
                setCurrentDate(newDate);
              }}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex-shrink-0"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Dni tygodnia */}
            <div className="flex-1 grid grid-cols-7 gap-1">
              {weekDays.map((d, i) => {
                const isSelected = d.getDate() === selectedDate.getDate() &&
                                   d.getMonth() === selectedDate.getMonth();
                const isToday = d.getDate() === new Date().getDate() &&
                                d.getMonth() === new Date().getMonth() &&
                                d.getFullYear() === new Date().getFullYear();
                const hasEvents = filteredEvents.some(e =>
                  e.date.getDate() === d.getDate() &&
                  e.date.getMonth() === d.getMonth() &&
                  e.date.getFullYear() === d.getFullYear()
                );

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedDateLocal(d);
                      setCurrentDate(d);
                    }}
                    className={`flex flex-col items-center py-1.5 rounded-xl transition ${
                      isSelected
                        ? 'bg-accent-primary-light text-white shadow-lg shadow-accent-primary-light/30'
                        : isToday
                          ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    <span className={`text-[11px] font-medium uppercase ${isSelected ? 'text-accent-primary-lighter' : 'text-gray-400 dark:text-gray-500'}`}>
                      {d.toLocaleDateString(appLocale(), { weekday: 'short' }).slice(0, 2)}
                    </span>
                    <span className="text-base font-bold">
                      {d.getDate()}
                    </span>
                    {hasEvents && !isSelected && (
                      <div className="w-1 h-1 rounded-full bg-accent-primary-light mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Strzałka w przód */}
            <button
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 7);
                setSelectedDateLocal(newDate);
                setCurrentDate(newDate);
              }}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex-shrink-0"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Zawartość w zależności od trybu */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {/* WIDOK DNIA - Lista wydarzeń */}
          {mobileViewMode === 'day' && (
            <div className="p-3">
              {/* Nagłówek dnia */}
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                {selectedDate.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>

              {dayEvents.length > 0 ? (
                <div className="space-y-2">
                  {dayEvents.map(ev => {
                    return (
                      <div
                        key={ev.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleEventClick(ev)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEventClick(ev); } }}
                        className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer active:scale-[0.98] transition flex gap-2.5"
                      >
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dotClass(ev.team)}`} aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{ev.title}</h4>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {ev.raw?.due_time
                              ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time)
                              : tr('Cały dzień')} • {teamLabel(ev.team)}
                          </p>
                          {ev.raw?.location && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate flex items-center gap-1">
                              <MapPin size={12} aria-hidden="true" /> {ev.raw.location}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={CalIcon}
                  title={t('Brak wydarzeń')}
                  compact
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Plus}
                      className="pointer-events-auto"
                      onClick={() => {
                        const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
                        handleAddClick(dateStr);
                      }}
                    >
                      {tr('Dodaj wydarzenie')}
                    </Button>
                  }
                />
              )}
            </div>
          )}

          {/* WIDOK TYGODNIA */}
          {mobileViewMode === 'week' && (
            <div className="p-3 space-y-3">
              {weekDays.map(d => {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const dayEventsForWeek = filteredEvents.filter(e =>
                  e.date.getDate() === d.getDate() &&
                  e.date.getMonth() === d.getMonth() &&
                  e.date.getFullYear() === d.getFullYear()
                );
                const isToday = d.getDate() === new Date().getDate() &&
                                d.getMonth() === new Date().getMonth() &&
                                d.getFullYear() === new Date().getFullYear();
                const isSelected = d.getDate() === selectedDate.getDate() &&
                                   d.getMonth() === selectedDate.getMonth();

                return (
                  <div
                    key={d.toString()}
                    className={`p-3 rounded-xl border transition ${
                      isSelected
                        ? 'border-accent-primary-light dark:border-accent-primary bg-accent-primary-lightest/50 dark:bg-accent-primary-darkest/20'
                        : isToday
                          ? 'border-accent-primary-lighter dark:border-accent-primary-dark bg-accent-primary-lightest/30 dark:bg-accent-primary-darkest/10'
                          : 'border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={() => {
                      setSelectedDateLocal(d);
                      setCurrentDate(d);
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                        isSelected
                          ? 'bg-accent-primary-light text-white'
                          : isToday
                            ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/50 text-accent-primary dark:text-accent-primary-light'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}>
                        {d.getDate()}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm text-gray-800 dark:text-white">
                          {d.toLocaleDateString(appLocale(), { weekday: 'long' })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {d.toLocaleDateString(appLocale(), { day: 'numeric', month: 'long' })}
                        </div>
                      </div>
                      {dayEventsForWeek.length > 0 && (
                        <span className="px-2 py-0.5 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light text-xs font-medium rounded-full">
                          {dayEventsForWeek.length}
                        </span>
                      )}
                    </div>
                    {dayEventsForWeek.length > 0 && (
                      <div className="space-y-1.5 ml-13">
                        {dayEventsForWeek.slice(0, 3).map(ev => {
                          return (
                            <div
                              key={ev.id}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); handleEventClick(ev); }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleEventClick(ev); } }}
                              className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700"
                            >
                              <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(ev.team)}`} aria-hidden="true" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{ev.title}</p>
                                <p className="text-[11px] text-gray-500">{ev.raw?.due_time ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time) : ''}</p>
                              </div>
                            </div>
                          );
                        })}
                        {dayEventsForWeek.length > 3 && (
                          <p className="text-xs text-gray-400 text-center">{tr('+{n} więcej', { n: dayEventsForWeek.length - 3 })}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Lista wydarzeń w wybranym dniu pod tygodniem */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                  {selectedDate.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {dayEvents.length > 0 ? (
                  <div className="space-y-2">
                    {dayEvents.map(ev => {
                      return (
                        <div
                          key={ev.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleEventClick(ev)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEventClick(ev); } }}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer active:scale-[0.98] transition"
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(ev.team)}`} aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{ev.title}</p>
                            <p className="text-xs text-gray-500">
                              {ev.raw?.due_time ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time) : ''} • {teamLabel(ev.team)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={CalIcon} title={t('Brak wydarzeń w tym dniu')} compact />
                )}
              </div>
            </div>
          )}

          {/* WIDOK MIESIĄCA */}
          {mobileViewMode === 'month' && (
            <div className="p-3">
              {/* Nagłówek dni tygodnia */}
              <div className="grid grid-cols-7 mb-2">
                {[tr('Pn'), tr('Wt'), tr('Śr'), tr('Cz'), tr('Pt'), tr('So'), tr('Nd')].map(d => (
                  <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Siatka dni */}
              <div className="grid grid-cols-7 gap-1">
                {emptyDays.map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
                {daysArray.map(d => {
                  const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
                  const dayEventsMonth = filteredEvents.filter(e =>
                    e.date.getDate() === d &&
                    e.date.getMonth() === currentDate.getMonth() &&
                    e.date.getFullYear() === currentDate.getFullYear()
                  );
                  const isToday = d === new Date().getDate() &&
                                  currentDate.getMonth() === new Date().getMonth() &&
                                  currentDate.getFullYear() === new Date().getFullYear();
                  const isSelected = d === selectedDate.getDate() &&
                                     currentDate.getMonth() === selectedDate.getMonth();

                  return (
                    <button
                      key={d}
                      onClick={() => {
                        const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
                        setSelectedDateLocal(newDate);
                        // NIE zmieniaj currentDate - to by przełączyło tydzień w mini kalendarzu
                      }}
                      className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition ${
                        isSelected
                          ? 'bg-accent-primary-light text-white'
                          : isToday
                            ? 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="text-sm font-medium">{d}</span>
                      {dayEventsMonth.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {dayEventsMonth.slice(0, 3).map((ev, idx) => {
                            return (
                              <div
                                key={idx}
                                className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : dotClass(ev.team)}`}
                              />
                            );
                          })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Lista wydarzeń w wybranym dniu poniżej kalendarza */}
              {(() => {
                // Użyj selectedDate dla wydarzeń, ale tylko jeśli jest w aktualnym miesiącu
                const monthDayEvents = filteredEvents.filter(e =>
                  e.date.getDate() === selectedDate.getDate() &&
                  e.date.getMonth() === selectedDate.getMonth() &&
                  e.date.getFullYear() === selectedDate.getFullYear()
                );
                return (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">
                  {selectedDate.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                {monthDayEvents.length > 0 ? (
                  <div className="space-y-2">
                    {monthDayEvents.map(ev => {
                      return (
                        <div
                          key={ev.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleEventClick(ev)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEventClick(ev); } }}
                          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl cursor-pointer active:scale-[0.98] transition"
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass(ev.team)}`} aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{ev.title}</p>
                            <p className="text-xs text-gray-500">
                              {ev.raw?.due_time ? (ev.raw?.end_time ? `${ev.raw.due_time} - ${ev.raw.end_time}` : ev.raw.due_time) : ''} • {teamLabel(ev.team)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={CalIcon} title={t('Brak wydarzeń')} compact />
                )}
              </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* FAB */}
        <button
          onClick={() => {
            const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}-${String(selectedDate.getDate()).padStart(2,'0')}`;
            handleAddClick(dateStr);
          }}
          className="absolute bottom-4 right-4 w-12 h-12 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-xl shadow-lg shadow-accent-primary-light/40 flex items-center justify-center text-white active:scale-95 transition"
        >
          <Plus size={22} />
        </button>
      </div>
    );
  };

  const renderMonthView = () => {
    const dayNames = [
      { short: tr('Pn'), full: tr('Poniedziałek') },
      { short: tr('Wt'), full: tr('Wtorek') },
      { short: tr('Śr'), full: tr('Środa') },
      { short: tr('Cz'), full: tr('Czwartek') },
      { short: tr('Pt'), full: tr('Piątek') },
      { short: tr('So'), full: tr('Sobota') },
      { short: tr('Nd'), full: tr('Niedziela') },
    ];

    return (
      <>
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {dayNames.map(d => (
            <div key={d.short} className="py-2 lg:py-3 text-center text-[10px] lg:text-xs font-bold text-gray-500 uppercase">
              <span className="lg:hidden">{d.short}</span>
              <span className="hidden lg:inline">{d.full}</span>
            </div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-7 auto-rows-fr bg-gray-200 dark:bg-gray-700 gap-px overflow-y-auto custom-scrollbar">
          {emptyDays.map((_, i) => <div key={`em-${i}`} className="bg-gray-50/50 dark:bg-gray-900/50" />)}
          {daysArray.map(d => {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const dayEvents = filteredEvents.filter(e => e.date.getDate() === d && e.date.getMonth() === currentDate.getMonth() && e.date.getFullYear() === currentDate.getFullYear());
            return (
              <div key={d} className="bg-white dark:bg-gray-900 min-h-[60px] lg:min-h-[100px] p-1 lg:p-2 relative group hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                <div className="flex justify-between items-center mb-0.5 lg:mb-1">
                  <span className={`text-xs lg:text-sm font-bold w-5 h-5 lg:w-7 lg:h-7 flex items-center justify-center rounded-full ${d === new Date().getDate() && currentDate.getMonth() === new Date().getMonth() ? 'bg-accent-primary text-white' : 'text-gray-700 dark:text-gray-300'}`}>{d}</span>
                  <button onClick={() => handleAddClick(dateStr)} aria-label={tr('Dodaj w dniu {d}', { d })} title={tr('Dodaj')} className="opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 p-0.5 lg:p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400"><Plus size={14} /></button>
                </div>
                <div className="space-y-0.5 lg:space-y-1 overflow-y-auto max-h-[40px] lg:max-h-[100px] custom-scrollbar">
                  {/* Mobile: pokaż max 2 wydarzenia */}
                  <div className="lg:hidden">
                    {dayEvents.slice(0, 2).map(ev => (
                      <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[11px] text-gray-400 text-center">+{dayEvents.length - 2}</div>
                    )}
                  </div>
                  {/* Desktop: pokaż wszystkie */}
                  <div className="hidden lg:block">
                    {dayEvents.map(ev => (
                      <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
          {Array.from({ length: (42 - (days + firstDay)) % 7 }).map((_, i) => <div key={`end-${i}`} className="bg-gray-50/50 dark:bg-gray-900/50" />)}
        </div>
      </>
    );
  };

  const renderWeekView = () => {
    const curr = new Date(currentDate);
    const first = curr.getDate() - curr.getDay() + 1;
    const weekDays = Array.from({length: 7}, (_, i) => new Date(new Date(curr).setDate(first + i)));

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop: 7 kolumn */}
        <div className="hidden lg:block flex-1 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
            {weekDays.map(d => (
              <div key={d.toString()} className="py-3 text-center border-r border-gray-100 dark:border-gray-700/50 last:border-0">
                <div className="text-xs text-gray-500 uppercase mb-1">{d.toLocaleDateString(appLocale(), {weekday: 'short'})}</div>
                <div className={`text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center mx-auto ${d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth() ? 'bg-accent-primary text-white' : 'text-gray-800 dark:text-white'}`}>
                  {d.getDate()}
                </div>
              </div>
            ))}
          </div>
          <div className="h-[calc(100%-70px)] grid grid-cols-7 divide-x divide-gray-100 dark:divide-gray-700/50 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900">
            {weekDays.map(d => {
              const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              const dayEvents = filteredEvents.filter(e => e.date.getDate() === d.getDate() && e.date.getMonth() === d.getMonth() && e.date.getFullYear() === d.getFullYear());
              return (
                <div key={d.toString()} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition min-h-[200px]">
                  {dayEvents.map(ev => <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />)}
                  <button onClick={() => handleAddClick(dateStr)} className="w-full mt-2 py-2 text-xs text-gray-300 hover:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg transition flex items-center justify-center gap-1"><Plus size={12}/> {t('Dodaj')}</button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mobile: lista dni */}
        <div className="lg:hidden flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900 p-3 space-y-3">
          {weekDays.map(d => {
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const dayEvents = filteredEvents.filter(e => e.date.getDate() === d.getDate() && e.date.getMonth() === d.getMonth() && e.date.getFullYear() === d.getFullYear());
            const isToday = d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth();
            return (
              <div key={d.toString()} className={`p-3 rounded-xl border ${isToday ? 'border-accent-primary-light dark:border-accent-primary bg-accent-primary-lightest/50 dark:bg-accent-primary-darkest/20' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${isToday ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                    {d.getDate()}
                  </div>
                  <div>
                    <div className="font-medium text-gray-800 dark:text-white">{d.toLocaleDateString(appLocale(), {weekday: 'long'})}</div>
                    <div className="text-xs text-gray-500">{d.toLocaleDateString(appLocale(), {day: 'numeric', month: 'long'})}</div>
                  </div>
                  <button onClick={() => handleAddClick(dateStr)} className="ml-auto p-2 text-gray-400 hover:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition">
                    <Plus size={18} />
                  </button>
                </div>
                {dayEvents.length > 0 ? (
                  <div className="space-y-1.5 ml-13">
                    {dayEvents.map(ev => <EventBadge key={ev.id} event={ev} onClick={() => handleEventClick(ev)} />)}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 ml-13">{t('Brak wydarzeń')}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  };

  const renderDayView = () => {
      const dayEvents = filteredEvents.filter(e => e.date.getDate() === currentDate.getDate() && e.date.getMonth() === currentDate.getMonth() && e.date.getFullYear() === currentDate.getFullYear());
      const hours = Array.from({length: 15}, (_, i) => i + 8); // 08:00 - 22:00

      return (
        <div className="flex-1 bg-white dark:bg-gray-900 overflow-y-auto custom-scrollbar flex">
            {/* Nagłówek z datą na mobile */}
            <div className="lg:hidden absolute top-0 left-0 right-0 p-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800 z-30">
                <div className="text-center">
                    <div className="font-bold text-gray-800 dark:text-white">{currentDate.toLocaleDateString(appLocale(), {weekday: 'long'})}</div>
                    <div className="text-sm text-gray-500">{currentDate.toLocaleDateString(appLocale(), {day: 'numeric', month: 'long', year: 'numeric'})}</div>
                </div>
            </div>

            {/* Lewa kolumna godzin */}
            <div className="w-10 lg:w-16 flex-shrink-0 border-r border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900 mt-14 lg:mt-0">
                {hours.map(h => (
                    <div key={h} className="h-[60px] lg:h-[80px] border-b border-gray-100 dark:border-gray-800 text-right pr-1 lg:pr-3 pt-1 lg:pt-2 text-[10px] lg:text-xs text-gray-400 font-medium relative">
                        {String(h).padStart(2, '0')}:00
                    </div>
                ))}
            </div>

            {/* Prawa kolumna zdarzeń */}
            <div className="flex-1 relative min-h-[900px] lg:min-h-[1200px] mt-14 lg:mt-0">
                {/* Linie poziome */}
                {hours.map(h => (
                    <div key={h} className="h-[60px] lg:h-[80px] border-b border-gray-100 dark:border-gray-800/50 w-full absolute" style={{top: (h-8) * (isDesktop ? 80 : 60)}}></div>
                ))}

                {/* Zdarzenia */}
                {dayEvents.map(ev => {
                    // Pobieranie godziny z raw data jeśli dostępne, lub z daty
                    let h, m;
                    if (ev.raw.due_time) {
                        [h, m] = ev.raw.due_time.split(':').map(Number);
                    } else {
                        h = ev.date.getHours();
                        m = ev.date.getMinutes();
                    }

                    const startMin = (Math.max(8, h) - 8) * 60 + m;
                    const hourHeight = isDesktop ? 80 : 60;
                    const top = (startMin / 60) * hourHeight;

                    return (
                        <div
                            key={ev.id}
                            onClick={() => handleEventClick(ev)}
                            className={`absolute left-1 lg:left-2 right-1 lg:right-2 rounded-lg lg:rounded-xl p-2 lg:p-3 shadow-sm border cursor-pointer hover:shadow-md transition z-10 ${ev.team === 'program' ? 'bg-accent-primary-lightest border-accent-primary-lighter text-accent-primary-dark' : 'bg-blue-50 border-blue-200 text-blue-800'}`}
                            style={{ top: `${top}px`, height: isDesktop ? '70px' : '55px' }}
                        >
                            <div className="flex items-center gap-1 lg:gap-2 text-[10px] lg:text-xs font-bold opacity-70 mb-0.5 lg:mb-1">
                                <Clock size={10} className="lg:w-3 lg:h-3"/>
                                {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}{ev.raw?.end_time ? ` - ${ev.raw.end_time}` : ''}
                            </div>
                            <div className="font-bold truncate text-xs lg:text-base">{ev.title}</div>
                            <div className="text-[10px] lg:text-xs opacity-60 truncate hidden lg:block">{teamLabel(ev.team)}</div>
                        </div>
                    );
                })}

                {/* Aktualna godzina (linia) */}
                {currentDate.getDate() === new Date().getDate() && (
                    <div
                        className="absolute w-full border-t-2 border-red-400 z-20 flex items-center"
                        style={{ top: `${((new Date().getHours() - 8) * 60 + new Date().getMinutes()) / 60 * (isDesktop ? 80 : 60)}px` }}
                    >
                        <div className="w-2 h-2 bg-red-400 rounded-full -ml-1"></div>
                    </div>
                )}
            </div>
        </div>
      )
  };

  const renderListView = () => {
      const sortedEvents = [...filteredEvents].sort((a,b) => a.date - b.date);
      return (
        <div className="flex-1 bg-white dark:bg-gray-900 overflow-y-auto custom-scrollbar p-3 lg:p-6">
             <div className="max-w-4xl mx-auto space-y-1 lg:space-y-2">
                 {sortedEvents.map(ev => (
                     <div key={ev.id} role="button" tabIndex={0} onClick={() => handleEventClick(ev)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEventClick(ev); } }} className="flex items-center gap-2 lg:gap-4 p-2 lg:p-3 rounded-lg lg:rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer transition">
                         <div className="w-12 lg:w-16 text-center flex-shrink-0">
                             <div className="text-[10px] lg:text-xs text-gray-400 uppercase font-bold">{ev.date.toLocaleDateString(appLocale(), {month: 'short'})}</div>
                             <div className="text-lg lg:text-xl font-bold text-gray-800 dark:text-white">{ev.date.getDate()}</div>
                         </div>
                         <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass(ev.team)}`} aria-hidden="true" />
                         <div className="flex-1 min-w-0">
                             <h4 className="font-bold text-sm lg:text-base text-gray-800 dark:text-gray-200 truncate">{ev.title}</h4>
                             <div className="text-[10px] lg:text-xs text-gray-500 flex gap-2 lg:gap-3 mt-0.5 flex-wrap">
                                 <span className="truncate">{teamLabel(ev.team)}</span>
                                 {ev.raw?.due_time && <span>• {ev.raw.due_time}{ev.raw?.end_time ? ` - ${ev.raw.end_time}` : ''}</span>}
                                 {isOnlineFormat(ev.raw?.format) && <EventFormatBadge format={ev.raw.format} />}
                             </div>
                         </div>
                     </div>
                 ))}
                 {sortedEvents.length === 0 && <EmptyState icon={CalIcon} title={t('Brak wydarzeń w tym miesiącu')} />}
             </div>
        </div>
      )
  }

  return (
    <div className={`${embedded ? 'h-full' : 'h-[calc(100vh-3rem)]'} flex flex-col gap-2 lg:gap-4`}>
      {/* MOBILE VIEW - Nowy widok kalendarza */}
      <div className="lg:hidden h-full">
        {MobileScheduleWrapper()}
      </div>

      {/* DESKTOP VIEW - Stary layout */}
      <div className="hidden lg:flex lg:flex-col lg:gap-4 h-full">
        {/* HEADER */}
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
           {!embedded && <PageHeader cover={false} moduleKey="calendar" icon={CalIcon} title={t('Wydarzenia')} subtitle={tr('Wydarzenia i zadania w kalendarzu')} />}

           {/* Search bar - pełne pole */}
           <div className="flex-1 max-w-md mx-4">
             <div className="relative">
               <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input
                 type="text"
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 placeholder={t('Szukaj wydarzeń...')}
                 className="w-full pl-10 pr-10 py-2 bg-gray-100 dark:bg-gray-700 border border-transparent focus:border-accent-primary-light dark:focus:border-accent-primary-light rounded-xl text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20 transition"
               />
               {searchQuery && (
                 <button
                   onClick={() => setSearchQuery('')}
                   className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                 >
                   <X size={16} />
                 </button>
               )}
             </div>
             {searchQuery && (
               <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-1">
                 {tr('Znaleziono {n} wydarzeń', { n: filteredEvents.length })}
               </p>
             )}
           </div>

           {/* View switcher */}
           <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
              {[
                { id: 'month', icon: LayoutGrid, label: t('Miesiąc') },
                { id: 'week', icon: Columns, label: t('Tydzień') },
                { id: 'day', icon: LayoutList, label: t('Dzień') },
                // Osadzony w „Wydarzeniach” — tam jest już widok Lista (nie dublujemy drugiej „Listy”).
                ...(embedded ? [] : [{ id: 'list', icon: List, label: t('Lista') }]),
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition ${view === v.id ? 'bg-white dark:bg-gray-800 text-accent-primary dark:text-accent-primary-light shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  title={v.label}
                >
                   <v.icon size={16} /> <span>{v.label}</span>
                </button>
              ))}
           </div>
        </div>

        <div className="flex-1 flex gap-6 overflow-hidden relative">
        {/* SIDEBAR - tylko desktop */}
        <div className="w-64 flex-shrink-0 flex flex-col gap-6">
          <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <span className="font-bold text-lg text-gray-800 dark:text-white capitalize">{currentDate.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' })}</span>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronLeft size={16} /></button>
                <button onClick={nextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-2">{[tr('Pon'), tr('Wt'), tr('Śr'), tr('Czw'), tr('Pt'), tr('Sob'), tr('Nd')].map(d => <div key={d} className="py-1">{d.charAt(0)}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
              {emptyDays.map((_, i) => <div key={`e-${i}`} />)}
              {daysArray.map(d => (
                <div key={d} onClick={() => { setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), d)); setSidebarOpen(false); }} className={`h-8 w-8 flex items-center justify-center text-sm rounded-full cursor-pointer hover:bg-accent-primary-lightest dark:hover:bg-gray-700 ${d === currentDate.getDate() ? 'bg-accent-primary text-white font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                  {d}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-y-auto">
            <h3 className="font-bold text-gray-500 uppercase text-xs mb-4 tracking-wider">{t('Twoje kalendarze')}</h3>
            <div className="space-y-2">
              {Object.entries(TEAMS).map(([key, cfg]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition select-none">
                  <input
                    type="checkbox"
                    className="w-5 h-5 rounded border-gray-300 text-accent-primary focus:ring-accent-primary-light rounded cursor-pointer accent-accent-primary"
                    checked={visibleTeams.includes(key)}
                    onChange={() => setVisibleTeams(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{teamLabel(key)}</span>
                </label>
              ))}
            </div>
            <button data-tour="cal-add" onClick={() => { handleAddClick(localYmd()); setSidebarOpen(false); }} className="w-full mt-6 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold rounded-xl shadow-lg shadow-accent-primary-light/30 flex items-center justify-center gap-2 hover:shadow-accent-primary-light/50 transition transform hover:-translate-y-0.5">
              <Plus size={18} /> {tr('Dodaj')}
            </button>
          </div>
        </div>

        {/* MAIN CALENDAR CONTENT */}
        <div className="flex-1 bg-white dark:bg-gray-900/50 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
          {view === 'month' && renderMonthView()}
          {view === 'week' && renderWeekView()}
          {view === 'day' && renderDayView()}
          {view === 'list' && renderListView()}
        </div>
        </div>
      </div>

      {/* Mobile Filter Modal */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="absolute inset-0"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl p-6 pb-8 animate-in slide-in-from-bottom duration-300">
            {/* Handle bar */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />

            <div className="flex items-center justify-between mb-6 mt-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Filter size={20} className="text-accent-primary" />
                {tr('Filtry kalendarza')}
              </h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6">
              <h3 className="font-bold text-gray-500 uppercase text-xs mb-3 tracking-wider">{t('Twoje kalendarze')}</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(TEAMS).map(([key, cfg]) => {
                  const isActive = visibleTeams.includes(key);
                  const TeamIcon = cfg.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setVisibleTeams(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key])}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition ${
                        isActive
                          ? 'border-accent-primary-light bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <TeamIcon size={18} />
                      <span className="text-sm font-medium truncate">{teamLabel(key)}</span>
                      {isActive && <Check size={16} className="ml-auto text-accent-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setVisibleTeams(Object.keys(TEAMS))}
                className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                {tr('Wybierz wszystkie')}
              </button>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex-1 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-bold rounded-xl shadow-lg shadow-accent-primary-light/30"
              >
                {tr('Gotowe')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale */}
      {modals.selectType && (
        <ModalSelectType
          date={modals.selectType.date}
          onClose={() => setModals((m) => ({ ...m, selectType: null }))}
          onSelectTask={handleSelectTask}
          onSelectEvent={handleSelectEvent}
        />
      )}

      {modals.selectCategory && (
        <ModalSelectEventCategory
          date={modals.selectCategory.date}
          ministries={ministryCalendars}
          onClose={() => setModals((m) => ({ ...m, selectCategory: null }))}
          onSelectCategory={handleSelectCategory}
          onSelectMinistry={handleSelectMinistry}
        />
      )}

      {/* Ten sam formularz co „Nowe wydarzenie” w module Wydarzenia — po utworzeniu otwiera stronę wydarzenia. */}
      {modals.createEvent && (
        <CreateEventModal
          initial={modals.createEvent}
          onClose={() => setModals((m) => ({ ...m, createEvent: null }))}
        />
      )}

      {modals.addTask && (
        <ModalAddTask
          initialTask={modals.addTask}
          teamOptions={taskTeamOptions}
          people={taskPeople}
          onClose={() => setModals((m) => ({ ...m, addTask: null }))}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  );
}
