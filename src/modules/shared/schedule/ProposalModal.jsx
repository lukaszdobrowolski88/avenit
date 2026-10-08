import React, { useEffect, useMemo, useState } from 'react';
import { Wand2, Check } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { tr } from '../../../i18n';

const shortDate = (ymd) => (ymd ? `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}` : '');

// Podgląd propozycji obsady (lineup.proposeLineups) — nic nie zapisuje, dopóki lider nie kliknie
// „Wstaw”. Każdą rolę można odznaczyć.
// proposals: [{ eventId, label, picks: [{ roleKey, roleLabel, names, info }], missing: [roleLabel] }]
export default function ProposalModal({ isOpen, onClose, proposals, onApply }) {
  const allKeys = useMemo(() => proposals.flatMap((p) => p.picks.map((x) => `${p.eventId}|${x.roleKey}`)), [proposals]);
  const [checked, setChecked] = useState(() => new Set(allKeys));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setChecked(new Set(allKeys)); }, [allKeys]);

  const toggle = (k) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const apply = async () => {
    const selected = proposals
      .map((p) => ({ eventId: p.eventId, changes: Object.fromEntries(p.picks.filter((x) => checked.has(`${p.eventId}|${x.roleKey}`)).map((x) => [x.roleKey, x.names])) }))
      .filter((s) => Object.keys(s.changes).length);
    setBusy(true);
    try { await onApply(selected); } finally { setBusy(false); }
  };

  const hasPicks = allKeys.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tr('Propozycja obsady')}
      subtitle={tr('Uwzględnia nieobecności, rotację (kto dawno nie służył) i to, kto zwykle pełni daną rolę.')}
      icon={Wand2}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
          {hasPicks && (
            <Button icon={Check} loading={busy} disabled={!checked.size} onClick={apply}>
              {tr('Wstaw zaznaczone ({n})', { n: checked.size })}
            </Button>
          )}
        </>
      )}
    >
      <div className="p-6 space-y-5">
        {!hasPicks ? (
          <EmptyState compact icon={Wand2} title={tr('Brak propozycji')} subtitle={tr('Wszystkie role są już obsadzone albo nie ma kogo zaproponować (nikt jeszcze nie pełnił tych ról).')} />
        ) : proposals.map((p) => (
          <section key={p.eventId}>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1.5">{p.label}</h3>
            <ul className="divide-y divide-gray-100 dark:divide-white/10">
              {p.picks.map((x) => {
                const k = `${p.eventId}|${x.roleKey}`;
                const first = x.info?.[0];
                const meta = first ? [
                  first.lastServed ? tr('ostatnio {date}', { date: shortDate(first.lastServed) }) : tr('dawno nie służył(a)'),
                  tr('{n}× w tym mies.', { n: first.monthCount }),
                ].join(' · ') : '';
                return (
                  <li key={k}>
                    <label className="flex items-center gap-3 py-2 cursor-pointer">
                      <input type="checkbox" className="sg-native-check" checked={checked.has(k)} onChange={() => toggle(k)} />
                      <span className="w-40 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">{x.roleLabel}</span>
                      <span className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{x.names.join(', ')}</span>
                        {meta && <span className="block text-xs text-gray-500 dark:text-gray-400">{meta}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {p.missing.length > 0 && (
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {tr('Bez propozycji: {roles}', { roles: p.missing.join(', ') })}
              </p>
            )}
          </section>
        ))}
        {hasPicks && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tr('Nic nie zostanie wysłane — po wstawieniu sprawdź grafik i kliknij „Powiadom”.')}
          </p>
        )}
      </div>
    </Modal>
  );
}
