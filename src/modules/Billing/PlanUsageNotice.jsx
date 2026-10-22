import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { tr } from '../../i18n';
import { usePermissions } from '../../contexts/PermissionsContext';
import { getPlanUsage, PLAN_USAGE_CHANGED } from '../../lib/subscriptions';
import { noticeFor, noticeDismissKey } from './billingView';
import '../../components/toolbar.css';

// Dyskretny komunikat o przekroczeniu limitu kont użytkowników — tylko dla osób z dostępem do
// rozliczeń (Ustawienia). Zwykli członkowie nic nie widzą (serwer i tak odpowiada im 403). Zamknięty
// nie wraca w tym samym miesiącu dla tego samego stanu. Odświeża się po utworzeniu / zatwierdzeniu
// kont (zdarzenie PLAN_USAGE_CHANGED). Nic nie blokuje.
export default function PlanUsageNotice() {
  const perms = usePermissions();
  const allowed = perms?.ready ? perms.can('module:settings') : false;
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!allowed) return undefined;
    let alive = true;
    const load = () => getPlanUsage()
      .then((d) => {
        if (!alive) return;
        const n = noticeFor(d);
        if (!n) { setNotice(null); return; }
        let dismissed = false;
        try { dismissed = localStorage.getItem(noticeDismissKey(n)) === '1'; } catch { /* brak storage */ }
        setNotice(dismissed ? null : n);
      })
      .catch(() => {});
    load();
    window.addEventListener(PLAN_USAGE_CHANGED, load);
    return () => { alive = false; window.removeEventListener(PLAN_USAGE_CHANGED, load); };
  }, [allowed]);

  if (!notice) return null;
  const dismiss = () => {
    try { localStorage.setItem(noticeDismissKey(notice), '1'); } catch { /* brak storage */ }
    setNotice(null);
  };

  return (
    <div role="status" className="mx-4 md:mx-6 lg:mx-8 mt-3 flex items-start gap-3 rounded-2xl border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200">
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notice.state === 'over_buffer' ? 'bg-red-500' : 'bg-amber-500'}`} />
      <p className="flex-1 min-w-0">
        {notice.text}{' '}
        <Link to="/settings?tab=subscription" className="font-semibold underline underline-offset-2 hover:no-underline" onClick={dismiss}>
          {tr('Zobacz plany')}
        </Link>
      </p>
      <button type="button" onClick={dismiss} className="icon-btn !w-7 !h-7 shrink-0" aria-label={tr('Zamknij')}>
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
