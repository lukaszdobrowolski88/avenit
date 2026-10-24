import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Info, ExternalLink, Film } from 'lucide-react';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD } from '../../../components/ui/DataTable';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { socialApi, mediaSrc } from '../lib/socialApi';
import { snippet } from '../lib/socialUi';
import ChannelAvatar, { channelName } from './ChannelAvatar';
import { ColumnChart, Sparkline, Heatmap, fmtNum, weekLabel } from './charts';

const PERIODS = [7, 30, 90];

function Tile({ label, value, hint }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Card({ title, subtitle, children, right }) {
  return (
    <section className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// Analityka postów: zasięg i interakcje z metryk Meta (worker co 3 h), kliknięcia krótkich linków,
// obserwujący (raz dziennie), najlepsze pory publikacji z historii.
export default function AnalyticsTab({ accounts, onOpenPost }) {
  const [days, setDays] = useState(30);
  const [sel, setSel] = useState([]);
  const [data, setData] = useState(null);
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  useEffect(() => {
    let alive = true;
    setData(null);
    socialApi.analytics({ days, account_ids: sel })
      .then((a) => { if (alive) setData(a); })
      .catch((e) => { if (alive) { toast.error(e.message); setData({ totals: {}, weeks: [], slots: [], top: [], followers: {} }); } });
    return () => { alive = false; };
  }, [days, sel]);

  const needReconnect = accounts.filter((a) => (a.needs_reconnect_for || []).includes('insights'));
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const toggle = (id) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1" role="radiogroup" aria-label={tr('Okres')}>
          {PERIODS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={days === p} onClick={() => setDays(p)}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${days === p ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
              {tr('{n} dni', { n: p })}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label={tr('Filtruj po kanale')}>
          {accounts.map((a) => (
            <button key={a.id} type="button" onClick={() => toggle(a.id)} aria-pressed={sel.includes(a.id)} title={channelName(a)} className="rounded-full p-0.5">
              <ChannelAvatar account={a} size={28} selected={sel.includes(a.id)} dimmed={sel.length > 0 && !sel.includes(a.id)} />
            </button>
          ))}
        </div>
      </div>

      {needReconnect.length > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 px-4 py-3 text-sm flex gap-2">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{tr('Połącz ponownie kanały: {names} (zakładka Kanały) — bez nowej zgody Meta widać tylko reakcje i komentarze, bez wyświetleń i zasięgu.', { names: needReconnect.map(channelName).join(', ') })}</span>
        </div>
      )}

      {data === null ? <Spinner center /> : !data.totals?.publications ? (
        <EmptyState icon={BarChart3} title={tr('Brak opublikowanych postów w tym okresie')} subtitle={tr('Metryki pojawią się kilka godzin po pierwszej publikacji (pobieramy je co 3 godziny).')} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile label={tr('Opublikowane posty')} value={fmtNum(data.totals.posts)} hint={tr('{n} publikacji w kanałach', { n: data.totals.publications })} />
            <Tile label={tr('Wyświetlenia')} value={fmtNum(data.totals.views)} hint={tr('zasięg: {n}', { n: fmtNum(data.totals.reach) })} />
            <Tile label={tr('Interakcje')} value={fmtNum(data.totals.interactions)} hint={tr('reakcje, komentarze, udostępnienia, zapisy')} />
            <Tile label={tr('Średnio na publikację')} value={fmtNum(data.totals.avg_interactions)} hint={tr('interakcji')} />
            <Tile label={tr('Kliknięcia linków')} value={fmtNum(data.totals.link_clicks)} hint={tr('krótkie linki w postach')} />
          </div>

          <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
            <Card title={tr('Interakcje tygodniowo')} subtitle={tr('Suma ze wszystkich publikacji w tygodniu (od poniedziałku)')}>
              <ColumnChart valueLabel={tr('Interakcje tygodniowo')}
                data={(data.weeks || []).map((w) => ({
                  key: w.week, label: tr('Tydzień od {d}', { d: weekLabel(w.week) }), short: weekLabel(w.week), value: w.interactions,
                  lines: [tr('{n} interakcji', { n: fmtNum(w.interactions) }), tr('{n} wyświetleń', { n: fmtNum(w.views) }), tr('{n} publ.', { n: w.publications })],
                }))} />
            </Card>
            <Card title={tr('Obserwujący')} subtitle={tr('Liczba obserwujących i zmiana w okresie')}>
              <ul className="space-y-3">
                {accounts.filter((a) => !sel.length || sel.includes(a.id)).map((a) => {
                  const series = data.followers?.[a.id] || [];
                  const last = series[series.length - 1]?.followers;
                  const first = series[0]?.followers;
                  const delta = last != null && first != null ? last - first : null;
                  return (
                    <li key={a.id} className="flex items-center gap-3">
                      <ChannelAvatar account={a} size={30} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{channelName(a)}</p>
                        <p className="text-xs text-gray-500">
                          {last != null ? fmtNum(last) : tr('brak danych')}
                          {delta ? <span className={delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}> {delta > 0 ? '+' : ''}{fmtNum(delta)}</span> : null}
                        </p>
                      </div>
                      <Sparkline values={series.map((s) => s.followers)} />
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
            <Card title={tr('Najlepsze pory publikacji')} subtitle={tr('Średnie interakcje na publikację wg dnia i godziny (czas polski, ostatnie 180 dni). Ciemniej = lepiej.')}>
              {data.slots?.length ? <Heatmap slots={data.slots} dark={dark} /> : <p className="text-sm text-gray-500">{tr('Za mało danych — opublikuj kilka postów o różnych porach.')}</p>}
            </Card>
            <Card title={tr('Najlepsze posty')} subtitle={tr('Wg interakcji w wybranym okresie')}>
              <DataTable flush>
                <THead><tr><TH>{tr('Post')}</TH><TH align="right">{tr('Interakcje')}</TH><TH align="right">{tr('Wyświetlenia')}</TH><TH align="right">{tr('Kliknięcia')}</TH></tr></THead>
                <tbody>
                  {(data.top || []).map((p) => {
                    const first = (p.media || [])[0];
                    const link = p.targets.find((t) => t.permalink)?.permalink;
                    return (
                      <TR key={p.post_id} onClick={() => onOpenPost(p.post_id)}>
                        <TD>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 shrink-0 flex items-center justify-center">
                              {first ? (first.kind === 'video' ? <Film size={16} className="text-gray-400" aria-hidden="true" /> : <img src={`${mediaSrc(first)}?w=96`} alt="" className="w-full h-full object-cover" />) : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm text-gray-800 dark:text-gray-100 truncate max-w-[240px]">{snippet(p.content, 80) || tr('Post bez tekstu')}</span>
                              <span className="flex gap-1 mt-0.5">
                                {p.targets.map((t) => <ChannelAvatar key={t.id} account={byId.get(t.account_id)} provider={t.provider} name={t.account_name} size={16} />)}
                                {link && <a href={link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-gray-400 hover:text-gray-700" aria-label={tr('Zobacz post')}><ExternalLink size={12} /></a>}
                              </span>
                            </span>
                          </div>
                        </TD>
                        <TD align="right" numeric>{fmtNum(p.interactions)}</TD>
                        <TD align="right" numeric>{fmtNum(p.views)}</TD>
                        <TD align="right" numeric>{fmtNum(p.link_clicks)}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </DataTable>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
