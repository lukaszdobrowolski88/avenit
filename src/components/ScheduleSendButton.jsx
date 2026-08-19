import React, { useState } from 'react';
import { Send, Check, X, Clock } from 'lucide-react';
import { toast } from '../lib/toast';
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
        await hook.createAssignment({
          programId: program.id, teamType, roleKey: d.roleKey, roleLabel: d.roleLabel,
          assignedName: d.name, assignedEmail: d.email,
          assignedByEmail: currentUser?.email || '', assignedByName: currentUser?.name || 'Administrator',
          isSelfAssignment: false,
        });
      }
      // 2) Sprzątanie: usuń przypisania osób, których już nie ma w siatce.
      for (const a of assignments || []) {
        if (a.program_id !== program.id || a.team_type !== teamType) continue;
        if (!wanted.has(`${a.role_key}|${a.assigned_name}`)) {
          await hook.removeAssignment(program.id, teamType, a.role_key, a.assigned_name);
        }
      }
      // 3) Wyślij — scope po teamType; silnik dedupuje po email_sent_at (nie wyśle 2× tej samej osobie).
      const res = await hook.sendInvitesForProgram(program.id, teamType);
      await onRefresh?.();
      if (res?.success) {
        if (res.sent > 0) toast.success(`Wysłano powiadomienia: ${res.sent}`);
        else toast.info('Brak nowych osób do powiadomienia (sprawdź, czy mają e-mail w profilu).');
      } else {
        toast.error(res?.error || 'Nie udało się wysłać powiadomień.');
      }
    } catch (e) {
      toast.error(e.message || 'Błąd wysyłki powiadomień.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canSend && (
        <button onClick={send} disabled={loading}
          title={count ? 'Wyślij powiadomienia (mail + push) do przypisanych osób' : 'Brak nowych osób do powiadomienia'}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition ${loading ? 'opacity-60' : ''} ${count ? 'bg-gradient-to-r from-accent-primary to-accent-secondary text-white hover:shadow' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
          <Send size={12} /> {loading ? '...' : count ? `Wyślij (${count})` : 'Wyślij'}
        </button>
      )}
      {/* Status akceptacji — widoczny w grafiku, jak w Worship */}
      {sum.total > 0 && (
        <span className="inline-flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          {sum.accepted > 0 && <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400"><Check size={11} />{sum.accepted}</span>}
          {sum.pending > 0 && <span className="inline-flex items-center gap-0.5 text-amber-500"><Clock size={11} />{sum.pending}</span>}
          {sum.rejected > 0 && <span className="inline-flex items-center gap-0.5 text-red-500"><X size={11} />{sum.rejected}</span>}
        </span>
      )}
    </div>
  );
}
