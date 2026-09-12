import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import Spinner from '../../components/Spinner';
import BoardView from './BoardView';
import { importLegacyTasks } from './lib/legacyImport';

// Zabezpieczenie przed równoległym importem tego samego źródła.
const inflight = new Map();

// Tabela z członkami zespołu per moduł — do zawężenia pickera „Osoby" na osadzonej tablicy.
// Nazwy są niejednolite historycznie (media_team vs *_members), stąd mapa + fallback.
// homegroups → null: tablica jest ponad grupami, więc nie zawężamy.
const MEMBER_TABLES = { media: 'media_team', mlodziezowka: 'mlodziezowka_members', atmosfera: 'atmosfera_members' };
function memberTableFor(moduleKey) {
  if (!moduleKey || moduleKey === 'homegroups') return null;
  return MEMBER_TABLES[moduleKey] || `custom_${moduleKey}_members`;
}

// Osadza pojedynczą Tablicę odpowiadającą staremu modułowi zadań.
// Przy pierwszym wejściu adoptuje istniejący board (po source_kind) albo
// jednorazowo importuje stare zadania (źródło pozostaje nietknięte).
export default function ModuleBoard({ sourceKind, moduleKey = null, title }) {
  const [user, setUser] = useState({ email: '', name: '' });
  const [boardId, setBoardId] = useState(null);
  const [scopeEmails, setScopeEmails] = useState(null); // null = brak zawężenia (pełna lista)
  const [phase, setPhase] = useState('resolving'); // resolving | importing | ready | error
  const [err, setErr] = useState('');

  useEffect(() => {
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
          const { data: mem } = await supabase.from(memberTable).select('email');
          setScopeEmails((mem || []).map(m => m.email).filter(Boolean));
        } catch { setScopeEmails(null); }
      }

      try {
        const { data: found } = await supabase.from('boards').select('id').eq('source_kind', sourceKind).limit(1);
        if (found && found.length) { setBoardId(found[0].id); setPhase('ready'); return; }

        setPhase('importing');
        if (!inflight.has(sourceKind)) {
          inflight.set(sourceKind, importLegacyTasks({ sourceKind, moduleKey, title, userEmail: u?.email || null }));
        }
        const res = await inflight.get(sourceKind);
        inflight.delete(sourceKind);
        setBoardId(res.boardId);
        setPhase('ready');
      } catch (e) {
        inflight.delete(sourceKind);
        setErr(e.message);
        setPhase('error');
      }
    })();
  }, [sourceKind, moduleKey, title]);

  if (phase === 'resolving' || phase === 'importing') {
    return <Spinner center size={28} label={phase === 'importing' ? 'Przenoszę zadania do nowej tablicy…' : 'Ładowanie tablicy…'} />;
  }
  if (phase === 'error') {
    return <div className="text-center py-12 text-red-500 text-sm">Nie udało się otworzyć tablicy: {err}</div>;
  }
  return <BoardView boardId={boardId} userEmail={user.email} userName={user.name} scopeEmails={scopeEmails} embedded />;
}
