import React, { useState } from 'react';
import { Send, Check, X, Clock } from 'lucide-react';
import { toast } from '../lib/toast';
import { tr } from '../i18n';
import { deriveAssignments, assignmentFor, countToNotify, statusSummary } from '../lib/scheduleBridge';

// Przycisk „Wyślij" + status akceptacji do grafików zespołowych (MediaTeam/Kids/Atmosfera).
// Synchronizuje przypisania z siatki (produkcja) do schedule_assignments i woła TEN SAM silnik
// co Grupa Uwielbienia (send-assignment-invites: mail + push + linki Akceptuj/Odrzuć + dedup).
//   hook = useScheduleAssignments() (createAssignment/removeAssignment/sendInvitesForProgram)
export default function ScheduleSendButton({
  program, teamType, roleColumns, members, assignments,
  hook, currentUser, onRefresh, canSend = true, gridData,
}) {
  const [loading, setLoading] = useState(false);
  // gridData = obiekt siatki { roleKey: "Imię1, Imię2" } — różne pole per moduł
  // (MediaTeam: produkcja, Atmosfera: atmosfera_team, Kids: szkolka).
  const derived = deriveAssignments(gridData || program?.produkcja || {}, roleColumns, members);
  const count = countToNotify(derived, assignments, program.id, teamType);
  const sum = statusSummary(assignments, program.id, teamType);

  const send = async () => {
    setLoading(true);
    try {
      // 1) Sync: utwórz wiersze dla obecnie przypisanych osób z e-mailem (istniejących nie ruszamy).
      const wanted = new Set();
      for (const d of derived) {
        if (!d.email) continue;
        wanted.add(`${d.roleKey}|${d.name}`);
        if (assignmentFor(assignments, program.id, teamType, d.roleKey, d.name)) continue;
        const cr = await hook.createAssignment({
          programId: program.id, teamType, roleKey: d.roleKey, roleLabel: d.roleLabel,
          assignedName: d.name, assignedEmail: d.email,
          assignedByEmail: currentUser?.email || '', assignedByName: currentUser?.name || 'Administrator',
          isSelfAssignment: false,
        });
        // Nie połykaj cichej porażki (np. brak uprawnień) — inaczej „Wyślij (3)" kończy się
        // mylącym „Brak nowych osób", choć w bazie nic nie powstało.
        if (cr && cr.success === false) throw new Error(tr('Nie udało się zapisać przypisania. Sprawdź, czy masz uprawnienia do edycji grafiku.'));
      }
      // 2) Sprzątanie: usuń przypisania osób, których już nie ma w siatce.
      for (const a of assignments || []) {
        if (a.program_id !== program.id || a.team_type !== teamType) continue;
        if (!wanted.has(`${a.role_key}|${a.assigned_name}`)) {
          const rm = await hook.removeAssignment(program.id, teamType, a.role_key, a.assigned_name);
          // Nieusunięty wiersz = zaproszenie do osoby, której już nie ma w siatce — przerwij.
          if (rm && rm.success === false) throw new Error(tr('Nie udało się usunąć przypisania: {name}. Sprawdź, czy masz uprawnienia do edycji grafiku.', { name: a.assigned_name }));
        }
      }
      // 3) Wyślij — scope po teamType; silnik dedupuje po email_sent_at (nie wyśle 2× tej samej osobie).
      const res = await hook.sendInvitesForProgram(program.id, teamType);
      await onRefresh?.();
      if (res?.success) {
        if (res.sent > 0) toast.success(tr('Wysłano powiadomienia: {n}', { n: res.sent }));
        else if (res.failed > 0) toast.error(tr('Nie udało się wysłać powiadomień.'));
        else toast.info(tr('Brak nowych osób do powiadomienia (sprawdź, czy mają e-mail w profilu).'));
      } else if (res?.emailReady === false) {
        toast.error(tr('Wysyłka e-maili nie jest skonfigurowana. Skontaktuj się z administratorem.'));
      } else {
        toast.error(tr('Nie udało się wysłać powiadomień.'));
      }
    } catch (e) {
      toast.error(e.message || tr('Błąd wysyłki powiadomień.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canSend && (
        <button onClick={send} disabled={loading}
          title={count ? tr('Wyślij zaproszenia (e-mail i powiadomienie w aplikacji) osobom, które jeszcze ich nie dostały') : tr('Brak nowych osób do powiadomienia')}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition ${loading ? 'opacity-60' : ''} ${count ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow' : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
          <Send size={12} aria-hidden="true" /> {loading ? tr('Wysyłanie…') : count ? tr('Powiadom ({n})', { n: count }) : tr('Powiadom')}
        </button>
      )}
      {/* Status akceptacji — widoczny w grafiku, jak w Worship */}
      {sum.total > 0 && (
        <span className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          {sum.accepted > 0 && <span className="inline-flex items-center gap-0.5 text-green-700 dark:text-green-400" title={tr('Potwierdzone: {n}', { n: sum.accepted })} aria-label={tr('Potwierdzone: {n}', { n: sum.accepted })}><Check size={12} aria-hidden="true" />{sum.accepted}</span>}
          {sum.pending > 0 && <span className="inline-flex items-center gap-0.5 text-amber-700 dark:text-amber-400" title={tr('Czeka na odpowiedź: {n}', { n: sum.pending })} aria-label={tr('Czeka na odpowiedź: {n}', { n: sum.pending })}><Clock size={12} aria-hidden="true" />{sum.pending}</span>}
          {sum.rejected > 0 && <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400" title={tr('Odmówiło: {n}', { n: sum.rejected })} aria-label={tr('Odmówiło: {n}', { n: sum.rejected })}><X size={12} aria-hidden="true" />{sum.rejected}</span>}
        </span>
      )}
    </div>
  );
}
