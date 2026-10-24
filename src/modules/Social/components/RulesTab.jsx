import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Workflow, Plus, Pencil, Trash2, Podcast, CalendarDays } from 'lucide-react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { tr } from '../../../i18n';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { socialApi } from '../lib/socialApi';
import { DEFAULT_TEMPLATES, TEMPLATE_VARS, renderTemplate } from '@avenit/shared/src/lib/socialShare.js';
import ChannelAvatar, { channelName } from './ChannelAvatar';

const TRIGGERS = [
  { value: 'sermon_published', label: 'Nowe kazanie', icon: Podcast, kind: 'sermon' },
  { value: 'event_reminder', label: 'Przypomnienie o wydarzeniu', icon: CalendarDays, kind: 'event' },
];
const ACTIONS = [
  { value: 'draft', label: 'Szkic do sprawdzenia' },
  { value: 'submit', label: 'Do akceptacji' },
  { value: 'queue', label: 'Od razu do kolejki' },
];
const SAMPLE = {
  event: { tytul: 'Koncert uwielbienia', data: 'niedziela, 8 listopada', godzina: '18:00', miejsce: 'Sala główna', opis: 'Zapraszamy całe rodziny!', link: 'https://…/l/Ab3dE7x' },
  sermon: { tytul: 'Łaska na każdy dzień', mowca: 'Jan Kowalski', seria: 'Listy Pawła', data: 'niedziela, 1 listopada', fragment: 'Ef 2,8-9', opis: 'O łasce, która zmienia codzienność.', link: 'https://…/l/Xy9kP2m' },
};
const inputCls = 'w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-primary/40';

function RuleEditor({ rule, accounts, access, onClose, onSaved }) {
  const [form, setForm] = useState(rule);
  const ta = useRef(null);
  const kind = form.trigger === 'sermon_published' ? 'sermon' : 'event';
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const insertVar = (k) => {
    const el = ta.current;
    const token = `{${k}}`;
    if (!el) { set({ template: `${form.template || ''}${token}` }); return; }
    const { selectionStart: a, selectionEnd: b } = el;
    const t = form.template || '';
    set({ template: `${t.slice(0, a)}${token}${t.slice(b)}` });
    setTimeout(() => { el.focus(); el.setSelectionRange(a + token.length, a + token.length); }, 0);
  };
  const preview = useMemo(() => renderTemplate(form.template || DEFAULT_TEMPLATES[kind], SAMPLE[kind]), [form.template, kind]);
  const save = async () => {
    try {
      onSaved(await socialApi.saveRule(form));
      toast.success(tr('Reguła zapisana.'));
      onClose();
    } catch (e) { toast.error(e.message); }
  };
  return (
    <Modal isOpen onClose={onClose} size="lg" icon={Workflow} title={form.id ? tr('Edytuj regułę') : tr('Nowa reguła')} closeOnBackdrop={false}
      footer={<><Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button><Button onClick={save}>{tr('Zapisz')}</Button></>}>
      <div className="p-6 space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{tr('Kiedy')}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {TRIGGERS.map((t) => {
              const Icon = t.icon;
              const on = form.trigger === t.value;
              return (
                <button key={t.value} type="button" onClick={() => set({ trigger: t.value, template: DEFAULT_TEMPLATES[t.kind] })} aria-pressed={on}
                  className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm text-left border ${on ? 'border-accent-primary bg-accent-primary/5 font-semibold' : 'border-gray-200 dark:border-gray-700'}`}>
                  <Icon size={16} aria-hidden="true" />{tr(t.label)}
                </button>
              );
            })}
          </div>
        </div>
        {form.trigger === 'event_reminder' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Ile dni przed')}</span>
              <input type="number" min={0} max={30} value={form.config?.days_before ?? 3} onChange={(e) => set({ config: { ...form.config, days_before: e.target.value } })} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Tylko typy wydarzeń (opcjonalnie)')}</span>
              <input value={(form.config?.event_types || []).join(', ')} onChange={(e) => set({ config: { ...form.config, event_types: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } })}
                placeholder={tr('np. nabożeństwo, koncert')} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">
              <input type="checkbox" checked={form.config?.only_general !== false} onChange={(e) => set({ config: { ...form.config, only_general: e.target.checked } })} className="rounded" />
              {tr('Tylko wydarzenia ogólne (bez wewnętrznych wydarzeń służb, np. prób)')}
            </label>
          </div>
        )}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{tr('Kanały')}</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const on = (form.account_ids || []).includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => set({ account_ids: on ? form.account_ids.filter((x) => x !== a.id) : [...(form.account_ids || []), a.id] })} aria-pressed={on}
                  className="flex items-center gap-2 rounded-full pr-3 py-1 pl-1 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <ChannelAvatar account={a} size={28} selected={on} dimmed={!on} /><span className="text-sm">{channelName(a)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{tr('Co zrobić')}</p>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.filter((a) => a.value !== 'queue' || access.publish).map((a) => (
              <button key={a.value} type="button" onClick={() => set({ action: a.value })} aria-pressed={form.action === a.value}
                className={`px-3 py-1.5 rounded-full text-xs font-medium ${form.action === a.value ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                {tr(a.label)}
              </button>
            ))}
          </div>
          {form.action === 'queue' && <p className="text-xs text-gray-500 mt-1.5">{tr('Gdy post nie przejdzie walidacji (np. Instagram bez zdjęcia), powstanie szkic do uzupełnienia.')}</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{tr('Treść posta')}</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {TEMPLATE_VARS[kind].map((v) => (
              <button key={v.key} type="button" onClick={() => insertVar(v.key)} className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs font-mono text-gray-700 dark:text-gray-200">{`{${v.key}}`}</button>
            ))}
          </div>
          <textarea ref={ta} value={form.template || ''} onChange={(e) => set({ template: e.target.value })} rows={6} className={`${inputCls} font-mono text-xs`} aria-label={tr('Szablon treści')} />
          <p className="text-xs text-gray-500 mt-1">{tr('Fragment w {zmienna? …} pojawi się tylko, gdy zmienna ma wartość.')}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mt-3 mb-1">{tr('Podgląd')}</p>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3 text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-100">{preview}</div>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr('Nazwa reguły')}</span>
          <input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder={tr('Np. Kazanie na Facebooka')} className={`mt-1 ${inputCls}`} />
        </label>
      </div>
    </Modal>
  );
}

// Reguły automatyczne: nowe kazanie / przypomnienie o wydarzeniu → post (worker co godzinę).
export default function RulesTab({ accounts, access }) {
  const canEdit = Boolean(access.create || access.publish);
  const [rules, setRules] = useState(null);
  const [edit, setEdit] = useState(null);
  useEffect(() => { socialApi.rules().then(setRules).catch((e) => { toast.error(e.message); setRules([]); }); }, []);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const toggle = async (r) => {
    try { setRules(await socialApi.saveRule({ ...r, enabled: !r.enabled })); } catch (e) { toast.error(e.message); }
  };
  const remove = async (r) => {
    if (!(await confirmDialog(tr('Usunąć regułę „{name}”? Utworzone posty zostaną.', { name: r.name })))) return;
    try { setRules(await socialApi.deleteRule(r.id)); } catch (e) { toast.error(e.message); }
  };
  const create = () => setEdit({ trigger: 'sermon_published', action: 'draft', account_ids: accounts.filter((a) => a.status !== 'revoked').map((a) => a.id), template: DEFAULT_TEMPLATES.sermon, config: { days_before: 3, only_general: true, event_types: [] }, enabled: true });

  if (rules === null) return <Spinner center />;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 max-w-2xl">{tr('Reguły same przygotowują posty: o nowym kazaniu (z linkiem i miniaturą z YouTube) i przypomnienia o wydarzeniach (z publiczną kartą wydarzenia). Sprawdzamy co godzinę.')}</p>
        {canEdit && accounts.length > 0 && <Button icon={Plus} onClick={create}>{tr('Nowa reguła')}</Button>}
      </div>
      {!rules.length ? (
        <EmptyState icon={Workflow} title={tr('Brak reguł')} subtitle={accounts.length ? tr('Np. „każde nowe kazanie → szkic na Facebooka i Instagram”.') : tr('Najpierw podłącz kanały.')} />
      ) : rules.map((r) => {
        const t = TRIGGERS.find((x) => x.value === r.trigger) || TRIGGERS[0];
        const Icon = t.icon;
        return (
          <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 p-4">
            <span data-tone={1} className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0"><Icon size={18} aria-hidden="true" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.name}</p>
              <p className="text-xs text-gray-500">
                {tr(t.label)}{r.trigger === 'event_reminder' ? ` · ${tr('{n} dni przed', { n: r.config?.days_before ?? 0 })}` : ''} · {tr((ACTIONS.find((a) => a.value === r.action) || ACTIONS[0]).label)}
              </p>
              <div className="flex gap-1 mt-1.5">
                {(r.account_ids || []).map((id) => byId.get(id)).filter(Boolean).map((a) => <ChannelAvatar key={a.id} account={a} size={20} />)}
              </div>
            </div>
            <StatusPill color={r.enabled ? STATUS_COLORS.success : STATUS_COLORS.neutral}>{r.enabled ? tr('Włączona') : tr('Wyłączona')}</StatusPill>
            {canEdit && (
              <>
                <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.enabled ? tr('Wyłącz') : tr('Włącz')}</Button>
                <button type="button" className="icon-btn" onClick={() => setEdit(r)} aria-label={tr('Edytuj regułę')}><Pencil size={15} /></button>
                <button type="button" className="icon-btn" onClick={() => remove(r)} aria-label={tr('Usuń regułę')}><Trash2 size={15} /></button>
              </>
            )}
          </div>
        );
      })}
      {edit && <RuleEditor rule={edit} accounts={accounts} access={access} onClose={() => setEdit(null)} onSaved={setRules} />}
    </div>
  );
}
