import React, { useEffect, useState } from 'react';
import { ListOrdered, ClipboardCheck, FileText, CheckCheck } from 'lucide-react';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import { tr, appLocale } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { socialApi } from '../lib/socialApi';
import { groupByDay, dayKey } from '../lib/socialUi';
import PostCard from './PostCard';

const EMPTY = {
  queue: { icon: ListOrdered, title: 'Kolejka jest pusta', subtitle: 'Zaplanowane posty pojawią się tutaj w kolejności publikacji.' },
  approval: { icon: ClipboardCheck, title: 'Nic nie czeka na akceptację', subtitle: 'Posty wysłane do zatwierdzenia pojawią się tutaj.' },
  drafts: { icon: FileText, title: 'Brak szkiców', subtitle: 'Zapisz post jako szkic, aby wrócić do niego później.' },
  sent: { icon: CheckCheck, title: 'Nic jeszcze nie opublikowano', subtitle: 'Opublikowane posty i błędy publikacji pojawią się tutaj.' },
};

function dayHeading(key, date) {
  if (key === 'none') return tr('Bez terminu');
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86400_000));
  const yesterday = dayKey(new Date(Date.now() - 86400_000));
  const long = date.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
  if (key === today) return `${tr('Dziś')} · ${long}`;
  if (key === tomorrow) return `${tr('Jutro')} · ${long}`;
  if (key === yesterday) return `${tr('Wczoraj')} · ${long}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

// Lista postów jednego widoku, pogrupowana po dniach (szkice i akceptacja — płasko).
export default function PostList({ view, version, access, myEmail, accountsById, onOpen, onAction, action }) {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    let alive = true;
    socialApi.list({ view })
      .then((list) => { if (alive) setPosts(list); })
      .catch((e) => { if (alive) { setPosts([]); toast.error(e.message); } });
    return () => { alive = false; };
  }, [view, version]);

  if (posts === null) return <Spinner center label={tr('Ładowanie postów…')} />;
  if (!posts.length) {
    const e = EMPTY[view];
    return <EmptyState icon={e.icon} title={tr(e.title)} subtitle={tr(e.subtitle)} action={action} />;
  }

  const flat = view === 'drafts' || view === 'approval';
  const groups = flat ? [{ key: 'flat', posts }] : groupByDay(posts, { desc: view === 'sent' });
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          {!flat && (
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              {dayHeading(g.key, g.date)}
              <span className="text-xs font-normal text-gray-400 tabular-nums">{g.posts.length}</span>
            </h3>
          )}
          {g.posts.map((p) => (
            <PostCard key={p.id} post={p} access={access} myEmail={myEmail} accountsById={accountsById} onOpen={onOpen} onAction={onAction} showTime={!flat} />
          ))}
        </section>
      ))}
    </div>
  );
}
