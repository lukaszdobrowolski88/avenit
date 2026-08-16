import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import BoardView from './BoardView';
import { importLegacyTasks } from './lib/legacyImport';

// Zabezpieczenie przed równoległym importem tego samego źródła.
const inflight = new Map();

// Osadza pojedynczą Tablicę odpowiadającą staremu modułowi zadań.
// Przy pierwszym wejściu adoptuje istniejący board (po source_kind) albo
// jednorazowo importuje stare zadania (źródło pozostaje nietknięte).
export default function ModuleBoard({ sourceKind, moduleKey = null, title }) {
  const [user, setUser] = useState({ email: '', name: '' });
  const [boardId, setBoardId] = useState(null);
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
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
        <Loader2 className="animate-spin" size={28} />
        <p className="text-sm">{phase === 'importing' ? 'Przenoszę zadania do nowej tablicy…' : 'Ładowanie tablicy…'}</p>
      </div>
    );
  }
  if (phase === 'error') {
    return <div className="text-center py-12 text-red-500 text-sm">Nie udało się otworzyć tablicy: {err}</div>;
  }
  return <BoardView boardId={boardId} userEmail={user.email} userName={user.name} embedded />;
}
