import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pickSourceBoard } from '@avenit/shared/src/lib/taskLinks.js';
import { supabase } from '../../lib/supabase';
import Spinner from '../../components/Spinner';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import BoardView from './BoardView';
import { importLegacyTasks, backfillLegacyTasks, needsLegacyBackfill } from './lib/legacyImport';
import { tr } from '../../i18n';

// Zabezpieczenie przed równoległym importem tego samego źródła (serwer i tak blokuje, ale jedna
// karta nie musi wysyłać kilku żądań, gdy zakładka zamontuje się dwa razy).
const inflight = new Map();
// Uzupełnianie starych tablic (osoby + komentarze) — raz na sesję per źródło, w tle.
const backfillRuns = new Map();

// Link z powiadomienia (wzmianka w komentarzu) prowadzi na stronę modułu z ?item=<id>.
// Moduł otwiera wtedy zakładkę Zadania (hasItemDeepLink), a tablica — to zadanie.
export function hasItemDeepLink() {
  try { return new URLSearchParams(window.location.search).has('item'); } catch { return false; }
}
// Odczyt jednorazowy: parametr znika z adresu, żeby powrót na zakładkę nie otwierał zadania ponownie.
function takeItemDeepLink() {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('item');
    if (!id) return null;
    url.searchParams.delete('item');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return id;
  } catch { return null; }
}

// Tabela z członkami zespołu per moduł — do zawężenia pickera „Osoby" na osadzonej tablicy.
// Nazwy są niejednolite historycznie (media_team vs *_members), stąd mapa + fallback.
// homegroups → null: tablica jest ponad grupami, więc nie zawężamy.
const MEMBER_TABLES = { media: 'media_team', mlodziezowka: 'mlodziezowka_members', atmosfera: 'atmosfera_members' };
function memberTableFor(moduleKey) {
  if (!moduleKey || moduleKey === 'homegroups') return null;
  return MEMBER_TABLES[moduleKey] || `custom_${moduleKey}_members`;
}

// Osadza pojedynczą Tablicę odpowiadającą staremu modułowi zadań.
// Przy pierwszym wejściu adoptuje istniejący board (po source_kind) albo jednorazowo importuje
// stare zadania na serwerze (fn board-import-legacy; źródło pozostaje nietknięte). Tablica
// zaimportowana dawniej w przeglądarce (bez osób i komentarzy) jest raz uzupełniana w tle.
// Karta jak pozostałe zakładki modułów (Grafik, Liderzy…): biała sekcja z tytułem zakładki.
const CARD = 'bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-colors duration-300';

export default function ModuleBoard({ sourceKind, moduleKey = null, title, heading = tr('Zadania'), card = true }) {
  const [user, setUser] = useState({ email: '', name: '' });
  const [boardId, setBoardId] = useState(null);
  const [scopeEmails, setScopeEmails] = useState(null); // null = brak zawężenia (pełna lista)
  const [phase, setPhase] = useState('resolving'); // resolving | importing | ready | error
  const [err, setErr] = useState('');
  const [attempt, setAttempt] = useState(0); // „Spróbuj ponownie” po błędzie
  const [initialItemId, setInitialItemId] = useState(takeItemDeepLink);
  // Link z powiadomienia, gdy strona modułu jest już otwarta (zmienia się tylko ?item=).
  const { search } = useLocation();
  useEffect(() => { const id = takeItemDeepLink(); if (id) setInitialItemId(id); }, [search]);
  const [refreshKey, setRefreshKey] = useState(0); // przeładowanie tablicy po uzupełnieniu w tle

  useEffect(() => {
    let alive = true;
    setPhase('resolving');
    setErr('');
    // Uzupełnienie w tle (nie blokuje tablicy); gdy coś doszło — przeładuj ją raz.
    const runBackfill = () => {
      if (!backfillRuns.has(sourceKind)) {
        backfillRuns.set(sourceKind, backfillLegacyTasks({ sourceKind }).catch(() => ({ changed: false })));
      }
      backfillRuns.get(sourceKind).then((res) => { if (alive && res?.changed) setRefreshKey((n) => n + 1); });
    };
    (async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        let name = u.email;
        const { data } = await supabase.from('app_users').select('full_name, name').eq('email', u.email).maybeSingle();
        if (data) name = data.full_name || data.name || u.email;
        setUser({ email: u.email, name });
      }

      // Zawężenie pickera „Osoby" do członków modułu (best-effort; brak tabeli → pełna lista).
      const memberTable = memberTableFor(moduleKey);
      if (memberTable) {
        try {
          const { data: mem, error } = await supabase.from(memberTable).select('email');
          const emails = (mem || []).map(m => m.email).filter(Boolean);
          // Błąd (supabase zwraca go, nie rzuca) albo pusty skład → pełna lista zamiast PUSTEGO
          // wyboru osób, w którym nie dało się nikogo przypisać.
          setScopeEmails(error || !emails.length ? null : emails);
        } catch { setScopeEmails(null); }
      }

      try {
        // Ta sama tablica, którą wybiera serwer (board-import-legacy): najpierw utworzona przez import
        // (created_by 'system:board-import'), potem najstarsza — gdyby kiedyś powstały dwie.
        const { data: candidates } = await supabase.from('boards').select('*').eq('source_kind', sourceKind)
          .order('created_at', { ascending: true }).limit(10);
        const picked = pickSourceBoard(candidates);
        const found = picked ? [picked] : null;
        if (found && found.length) {
          if (!alive) return;
          setBoardId(found[0].id);
          setPhase('ready');
          if (needsLegacyBackfill(found[0])) runBackfill();
          return;
        }

        setPhase('importing');
        if (!inflight.has(sourceKind)) {
          inflight.set(sourceKind, importLegacyTasks({ sourceKind, title }).finally(() => inflight.delete(sourceKind)));
        }
        const res = await inflight.get(sourceKind);
        if (!alive) return;
        setBoardId(res.boardId);
        setPhase('ready');
        // Tablica już była (np. nie widać jej przez /api/db) — uzupełnij, jeśli serwer o to prosi.
        if (res.backfillNeeded) runBackfill();
      } catch (e) {
        if (!alive) return;
        setErr(e.message);
        setPhase('error');
      }
    })();
    return () => { alive = false; };
  }, [sourceKind, moduleKey, title, attempt]);

  // card=false: już w karcie (układ z kreatora modułów) — bez drugiej ramki i tytułu.
  // Gotowa tablica sama rysuje nagłówek zakładki (tytuł + widoki + akcje w jednym rzędzie).
  const Wrap = card ? 'section' : 'div';
  const plainHeading = card && heading && phase !== 'ready';
  return (
    <Wrap className={card ? CARD : undefined}>
      {plainHeading && <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-5">{heading}</h2>}
      {phase === 'resolving' || phase === 'importing' ? (
        <Spinner center size={28} label={phase === 'importing' ? tr('Przenoszę zadania do nowej tablicy…') : tr('Ładowanie tablicy…')} />
      ) : phase === 'error' ? (
        <EmptyState icon={AlertTriangle} title={tr('Nie udało się otworzyć zadań')} subtitle={err}
          action={<Button variant="outline" icon={RefreshCw} onClick={() => setAttempt((n) => n + 1)}>{tr('Spróbuj ponownie')}</Button>} />
      ) : (
        <BoardView key={`${boardId}:${refreshKey}`} boardId={boardId} userEmail={user.email} userName={user.name} scopeEmails={scopeEmails} embedded
          heading={card ? heading : null} initialItemId={initialItemId} />
      )}
    </Wrap>
  );
}
