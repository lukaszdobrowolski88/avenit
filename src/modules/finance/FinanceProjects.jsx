import React, { useEffect, useMemo, useState } from 'react';
import { FolderKanban, Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, Calendar, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { tr } from '../../i18n';
import { toast } from '../../lib/toast';
import { confirmDialog } from '../../lib/dialog';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import Spinner from '../../components/Spinner';
import CustomSelect from '../../components/CustomSelect';
import { DateInput } from '../../components/pickers';
import { DataTable, THead, TH, TR, TD } from '../../components/ui/DataTable';
import { num, fmtMoney, fmtPct, fmtDate, isCountedExpense, withNumbers, humanSaveError, missingFields } from './money';
import { nameTaken } from './dictionaries';
import { TagChips } from './TagPicker';

const EMPTY_PROJECT = { name: '', description: '', color: '#1e40af', status: 'active', start_date: '', end_date: '', budget_amount: '', income_goal: '', responsible_person: '' };

// Suma per projekt: plan (kwota projektu albo suma pozycji budżetu), wydano, wpływy.
export function projectStats(project, { expenses = [], income = [], budget = [] }) {
  const id = String(project.id);
  const own = (r) => String(r.project_id || '') === id;
  const spent = expenses.filter((e) => own(e) && isCountedExpense(e)).reduce((s, e) => s + num(e.amount), 0);
  const pending = expenses.filter((e) => own(e) && !isCountedExpense(e) && e.status !== 'rejected').reduce((s, e) => s + num(e.amount), 0);
  const raised = income.filter(own).reduce((s, i) => s + num(i.amount), 0);
  const budgetPlan = budget.filter((b) => own(b) && b.kind !== 'income').reduce((s, b) => s + num(b.planned_amount), 0);
  const planned = num(project.budget_amount) > 0 ? num(project.budget_amount) : budgetPlan;
  const goal = num(project.income_goal);
  return {
    spent, pending, raised, planned, goal,
    remaining: planned - spent,
    spentPct: planned > 0 ? (spent / planned) * 100 : 0,
    raisedPct: goal > 0 ? (raised / goal) * 100 : 0,
    balance: raised - spent,
  };
}

const barColor = (pct) => (pct < 80 ? 'bg-green-500' : pct <= 100 ? 'bg-yellow-500' : 'bg-red-500');

/**
 * Zakładka „Projekty”: finanse w rozbiciu na projekty (remont, wyjazd, zbiórka…), niezależnie
 * od służby i roku. Transakcje i pozycje budżetu przypina się do projektu polem „Projekt”.
 */
export default function FinanceProjects({ projects, reloadProjects, tagColor, onAddExpense, onAddIncome, dataVersion, currentUserEmail }) {
  const [rows, setRows] = useState({ expenses: [], income: [], budget: [] });
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('active');
  const [form, setForm] = useState(null);           // edytowany/nowy projekt
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState(null);       // szczegóły projektu

  const load = async () => {
    setLoading(true);
    try {
      // Wszystkie lata — projekt bywa dłuższy niż rok budżetowy.
      const [exp, inc, bud] = await Promise.all([
        supabase.from('expense_transactions').select('*').not('project_id', 'is', null).order('payment_date', { ascending: false }),
        supabase.from('income_transactions').select('*').not('project_id', 'is', null).order('date', { ascending: false }),
        supabase.from('budget_items').select('*').not('project_id', 'is', null),
      ]);
      if (exp.error || inc.error || bud.error) toast.error(tr('Nie udało się wczytać części danych projektów. Odśwież stronę.'));
      setRows({ expenses: withNumbers(exp.data), income: withNumbers(inc.data), budget: withNumbers(bud.data, ['planned_amount']) });
    } catch { toast.error(tr('Nie udało się wczytać danych projektów.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dataVersion]);

  const visible = useMemo(() => (projects || []).filter((p) => statusFilter === 'all' || (p.status || 'active') === statusFilter), [projects, statusFilter]);
  const totals = useMemo(() => visible.reduce((acc, p) => {
    const s = projectStats(p, rows);
    acc.planned += s.planned; acc.spent += s.spent; acc.raised += s.raised;
    return acc;
  }, { planned: 0, spent: 0, raised: 0 }), [visible, rows]);

  const openNew = () => { setForm({ ...EMPTY_PROJECT }); setErrors({}); };
  const openEdit = (p) => {
    setForm({ ...EMPTY_PROJECT, ...p, description: p.description || '', start_date: p.start_date || '', end_date: p.end_date || '',
      budget_amount: p.budget_amount != null ? String(num(p.budget_amount)) : '', income_goal: p.income_goal != null ? String(num(p.income_goal)) : '',
      responsible_person: p.responsible_person || '' });
    setErrors({});
  };
  const save = async () => {
    const missing = missingFields(form, [['name', tr('nazwę')]]);
    if (missing.length) { setErrors({ name: true }); toast.error(tr('Uzupełnij: {fields}', { fields: missing.join(', ') })); return; }
    if (nameTaken(projects, form.name, form.id)) { setErrors({ name: true }); toast.error(tr('Projekt o tej nazwie już istnieje.')); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { toast.error(tr('Data końca jest wcześniejsza niż data początku.')); return; }
    const payload = {
      name: form.name.trim(), description: form.description || null, color: form.color || null, status: form.status || 'active',
      start_date: form.start_date || null, end_date: form.end_date || null,
      budget_amount: form.budget_amount === '' ? null : parseFloat(form.budget_amount),
      income_goal: form.income_goal === '' ? null : parseFloat(form.income_goal),
      responsible_person: String(form.responsible_person || '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    try {
      const { error } = form.id
        ? await supabase.from('finance_projects').update(payload).eq('id', form.id)
        : await supabase.from('finance_projects').insert([{ ...payload, created_by: currentUserEmail || null }]);
      if (error) throw error;
      toast.success(form.id ? tr('Zapisano projekt') : tr('Dodano projekt „{name}”', { name: payload.name }));
      setForm(null); reloadProjects();
    } catch (e) { toast.error(humanSaveError(e, tr)); }
    finally { setSaving(false); }
  };
  const remove = async (p) => {
    if (!await confirmDialog({ title: tr('Usunąć projekt „{name}”?', { name: p.name }), message: tr('Transakcje i pozycje budżetu zostaną, ale stracą przypisanie do projektu. Jeśli projekt się skończył, lepiej ustaw status „Zamknięty”.'), danger: true, confirmLabel: tr('Usuń') })) return;
    const { error } = await supabase.from('finance_projects').delete().eq('id', p.id);
    if (error) { toast.error(humanSaveError(error, tr)); return; }
    setOpenId(null); reloadProjects(); load();
  };

  const open = openId ? (projects || []).find((p) => String(p.id) === String(openId)) : null;
  const openStats = open ? projectStats(open, rows) : null;
  const openTx = open ? [
    ...rows.expenses.filter((e) => String(e.project_id) === String(open.id)).map((e) => ({ ...e, _kind: 'expense', _date: e.payment_date })),
    ...rows.income.filter((i) => String(i.project_id) === String(open.id)).map((i) => ({ ...i, _kind: 'income', _date: i.date })),
  ].sort((a, b) => String(b._date || '').localeCompare(String(a._date || ''))) : [];

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{tr('Projekty')}</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
            {[['active', tr('Aktywne')], ['closed', tr('Zamknięte')], ['all', tr('Wszystkie')]].map(([k, l]) => (
              <button key={k} onClick={() => setStatusFilter(k)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${statusFilter === k ? 'bg-white dark:bg-gray-900 shadow text-accent-primary' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>{l}</button>
            ))}
          </div>
          <button onClick={openNew} className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2">
            <Plus size={18} /> {tr('Nowy projekt')}
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{tr('Finanse w rozbiciu na projekty (np. remont, wyjazd, zbiórka). Przypisz projekt przy pozycji budżetu, wydatku albo wpływie — tutaj zobaczysz plan, wydatki i zebrane środki, także ponad granicą roku.')}</p>

      {visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-4"><div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{tr('Plan projektów')}</div><div className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{fmtMoney(totals.planned)}</div></div>
          <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 p-4"><div className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase">{tr('Wydano')}</div><div className="text-xl font-bold text-red-700 dark:text-red-300 tabular-nums">{fmtMoney(totals.spent)}</div></div>
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-900/10 p-4"><div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase">{tr('Zebrano')}</div><div className="text-xl font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">{fmtMoney(totals.raised)}</div></div>
        </div>
      )}

      {loading && !rows.expenses.length && !rows.income.length ? <Spinner center /> : visible.length === 0 ? (
        <EmptyState icon={FolderKanban}
          title={statusFilter === 'closed' ? tr('Brak zamkniętych projektów') : tr('Brak projektów')}
          subtitle={tr('Załóż projekt, np. „Remont dachu” albo „Obóz młodzieżowy”, i przypisuj do niego wydatki oraz wpływy.')}
          action={<Button onClick={openNew}><Plus size={16} /> {tr('Nowy projekt')}</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((p) => {
            const s = projectStats(p, rows);
            return (
              <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left rounded-2xl border border-gray-200 dark:border-gray-700 p-4 hover:border-accent-primary/50 hover:shadow-md transition bg-white dark:bg-gray-900">
                <div className="flex items-start gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full mt-1.5 shrink-0" style={{ background: p.color || '#6b7280' }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 dark:text-white truncate">{p.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {p.start_date || p.end_date ? `${fmtDate(p.start_date) || '…'} – ${fmtDate(p.end_date) || '…'}` : tr('bez dat')}
                      {p.responsible_person ? ` · ${p.responsible_person}` : ''}
                    </div>
                  </div>
                  {p.status === 'closed' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 shrink-0">{tr('Zamknięty')}</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div><div className="text-gray-500 dark:text-gray-400">{tr('Plan')}</div><div className="font-semibold text-gray-900 dark:text-white tabular-nums">{s.planned > 0 ? fmtMoney(s.planned) : '—'}</div></div>
                  <div><div className="text-gray-500 dark:text-gray-400">{tr('Wydano')}</div><div className="font-semibold text-gray-900 dark:text-white tabular-nums">{fmtMoney(s.spent)}</div></div>
                  <div className="text-right"><div className="text-gray-500 dark:text-gray-400">{tr('Zebrano')}</div><div className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmtMoney(s.raised)}</div></div>
                </div>
                {s.planned > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className={`h-2 rounded-full ${barColor(s.spentPct)}`} style={{ width: `${Math.min(s.spentPct, 100)}%` }} /></div>
                    <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmtPct(s.spentPct, 0)}</span>
                  </div>
                )}
                {s.goal > 0 && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{tr('Cel zbiórki')}: {fmtMoney(s.goal)} · <span className="font-semibold text-emerald-700 dark:text-emerald-400">{fmtPct(s.raisedPct, 0)}</span></div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Szczegóły projektu */}
      {open && (
        <Modal isOpen onClose={() => setOpenId(null)} title={open.name} icon={FolderKanban} size="xl"
          footer={<>
            <Button variant="secondary" onClick={() => remove(open)}><Trash2 size={15} /> {tr('Usuń')}</Button>
            <Button variant="secondary" onClick={() => { setOpenId(null); openEdit(open); }}><Edit2 size={15} /> {tr('Edytuj')}</Button>
            {onAddIncome && <Button variant="secondary" onClick={() => { setOpenId(null); onAddIncome(open.id); }}><ArrowUpRight size={15} /> {tr('Dodaj wpływ')}</Button>}
            {onAddExpense && <Button onClick={() => { setOpenId(null); onAddExpense(open.id); }}><ArrowDownRight size={15} /> {tr('Dodaj wydatek')}</Button>}
          </>}>
          <div className="p-6 space-y-5">
            {(open.description || open.responsible_person || open.start_date || open.end_date) && (
              <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                {open.description && <p>{open.description}</p>}
                <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                  {(open.start_date || open.end_date) && <span className="flex items-center gap-1"><Calendar size={13} /> {fmtDate(open.start_date) || '…'} – {fmtDate(open.end_date) || '…'}</span>}
                  {open.responsible_person && <span className="flex items-center gap-1"><User size={13} /> {open.responsible_person}</span>}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[[tr('Plan'), openStats.planned > 0 ? fmtMoney(openStats.planned) : '—'], [tr('Wydano'), fmtMoney(openStats.spent)],
                [tr('Pozostało'), openStats.planned > 0 ? fmtMoney(openStats.remaining) : '—'], [tr('Zebrano'), fmtMoney(openStats.raised)]].map(([l, v]) => (
                <div key={l} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800"><div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">{l}</div><div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{v}</div></div>
              ))}
            </div>
            {openStats.pending > 0 && <p className="text-xs text-amber-800 dark:text-amber-300">{tr('+ {amount} czeka na akceptację', { amount: fmtMoney(openStats.pending) })}</p>}
            {openTx.length === 0 ? (
              <EmptyState icon={FolderKanban} title={tr('Brak transakcji w tym projekcie')} subtitle={tr('Wybierz ten projekt w polu „Projekt” przy wydatku lub wpływie.')} compact />
            ) : (
              <DataTable>
                <THead><tr><TH>{tr('Data')}</TH><TH>{tr('Opis')}</TH><TH>{tr('Służba / kategoria')}</TH><TH align="right">{tr('Kwota')}</TH></tr></THead>
                <tbody>
                  {openTx.map((t) => (
                    <TR key={`${t._kind}-${t.id}`}>
                      <TD numeric className="whitespace-nowrap">{fmtDate(t._date)}</TD>
                      <TD>
                        <div className="text-gray-900 dark:text-white">{t._kind === 'income' ? (t.source || t.type) : (t.description || t.contractor)}</div>
                        <TagChips tags={t.tags} colorOf={tagColor} className="mt-1" />
                      </TD>
                      <TD muted>{t._kind === 'income' ? tr(t.type || 'Inne') : [t.category, t.cost_category].filter(Boolean).join(' · ')}</TD>
                      <TD align="right" numeric className={`font-semibold whitespace-nowrap ${t._kind === 'income' ? 'text-emerald-700 dark:text-emerald-400' : isCountedExpense(t) ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                        {t._kind === 'income' ? '+' : '−'}{fmtMoney(t.amount)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </Modal>
      )}

      {/* Formularz projektu */}
      {form && (
        <Modal isOpen onClose={() => { if (!saving) setForm(null); }} title={form.id ? tr('Edytuj projekt') : tr('Nowy projekt')} icon={FolderKanban} size="sm" closeOnBackdrop={false}
          footer={<>
            <Button variant="secondary" disabled={saving} onClick={() => setForm(null)}>{tr('Anuluj')}</Button>
            <Button onClick={save} loading={saving}>{form.id ? tr('Zapisz zmiany') : tr('Zapisz')}</Button>
          </>}>
          <div className="p-6 space-y-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label htmlFor="fin-proj-name" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Nazwa')} <span className="text-red-600" aria-hidden="true">*</span></label>
                <input id="fin-proj-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} aria-required="true"
                  placeholder={tr('np. Remont dachu, Obóz 2026')} className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${errors.name ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
              </div>
              <div>
                <label htmlFor="fin-proj-color" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kolor')}</label>
                <input id="fin-proj-color" type="color" value={form.color || '#1e40af'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-12 h-[50px] rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent cursor-pointer p-1" />
              </div>
            </div>
            <div>
              <label htmlFor="fin-proj-desc" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Opis')}</label>
              <textarea id="fin-proj-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fin-proj-budget" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Budżet projektu (zł)')}</label>
                <input id="fin-proj-budget" type="number" step="0.01" min="0" inputMode="decimal" value={form.budget_amount} onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
                  placeholder={tr('opcjonalnie')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label htmlFor="fin-proj-goal" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Cel zbiórki (zł)')}</label>
                <input id="fin-proj-goal" type="number" step="0.01" min="0" inputMode="decimal" value={form.income_goal} onChange={(e) => setForm({ ...form, income_goal: e.target.value })}
                  placeholder={tr('opcjonalnie')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">{tr('Bez kwoty budżetu plan projektu = suma przypisanych do niego pozycji budżetu.')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Początek')}</label>
                <DateInput value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Koniec')}</label>
                <DateInput value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fin-proj-resp" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Osoba odpowiedzialna')}</label>
                <input id="fin-proj-resp" value={form.responsible_person} onChange={(e) => setForm({ ...form, responsible_person: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <CustomSelect label={tr('Status')} value={form.status} onChange={(v) => setForm({ ...form, status: v })}
                options={[{ value: 'active', label: tr('Aktywny') }, { value: 'closed', label: tr('Zamknięty') }]} />
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
