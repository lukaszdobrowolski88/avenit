import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, FileText, Wallet } from 'lucide-react';
import { useT } from '../../i18n';
import { tr } from '../../i18n';
import TabHeader from '../../components/TabHeader';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { DataTable, THead, TH, TR, TD } from '../../components/ui/DataTable';
import { num, isCountedExpense, matchesBudgetItem, fmtMoney, fmtPct, fmtDate } from '../finance/money';

export default function FinanceTab({ ministry, budgetItems = [], expenses = [], onAddExpense, onRefresh }) {
  const t = useT();
  const [expandedItems, setExpandedItems] = useState({});

  // Zgłaszanie propozycji do budżetu z poziomu zakładki Finanse zespołu.
  const [userEmail, setUserEmail] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email || '')).catch(() => {}); }, []);
  const nowYear = new Date().getFullYear();
  const [showProposal, setShowProposal] = useState(false);
  const emptyProp = { kind: 'expense', year: nowYear, description: '', amount: '', note: '' };
  const [prop, setProp] = useState(emptyProp);
  const [savingProp, setSavingProp] = useState(false);
  // Lista propozycji tej służby (żeby lider widział status swoich zgłoszeń).
  const [myProposals, setMyProposals] = useState([]);
  const fetchMyProposals = async () => {
    try { const { data } = await supabase.from('budget_proposals').select('*').eq('team_type', ministry).order('created_at', { ascending: false }).limit(30); setMyProposals(data || []); } catch { setMyProposals([]); }
  };
  useEffect(() => { if (ministry) fetchMyProposals(); /* eslint-disable-next-line */ }, [ministry]);
  const submitProposal = async () => {
    if (!prop.description.trim() || !prop.amount) {
      toast.error(tr('Uzupełnij: {fields}', { fields: [!prop.description.trim() && tr('opis'), !prop.amount && tr('kwotę')].filter(Boolean).join(', ') }));
      return;
    }
    setSavingProp(true);
    try {
      const { data, error } = await supabase.from('budget_proposals').insert([{
        year: parseInt(prop.year) || nowYear, kind: prop.kind, team_type: ministry, category: ministry,
        description: prop.description.trim(), amount: parseFloat(prop.amount), note: prop.note || null,
        submitted_by: userEmail || null, status: 'pending',
      }]).select();
      if (error) throw error;
      // Powiadomienie e-mail do zarządzających finansami (best-effort).
      supabase.functions.invoke('budget-proposal-notify', { body: { proposalId: data?.[0]?.id, event: 'submitted' } }).catch(() => {});
      toast.success(tr('Propozycja wysłana do zatwierdzenia'));
      setShowProposal(false); setProp(emptyProp); fetchMyProposals();
    } catch (e) { toast.error(tr('Nie udało się wysłać propozycji: {msg}', { msg: e.message || e })); }
    finally { setSavingProp(false); }
  };
  const PROP_STATUS = { pending: { l: tr('Oczekuje'), c: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }, approved: { l: tr('Zaakceptowana'), c: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }, rejected: { l: tr('Odrzucona'), c: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' } };

  const planItems = budgetItems.filter((i) => i.kind !== 'income');

  const toggleExpand = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Wykorzystanie = zatwierdzone/opłacone wydatki tej pozycji (wnioski czekające i odrzucone nie).
  const calculateSpent = (category, description) => expenses
    .filter((e) => isCountedExpense(e) && matchesBudgetItem(e, { category, description }))
    .reduce((sum, e) => sum + num(e.amount), 0);

  const getProgressBarColor = (percentage) => {
    if (percentage < 80) return 'from-green-500 to-green-600';
    if (percentage <= 100) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  // Oblicz sumy
  const totalPlanned = planItems.reduce((sum, item) => sum + num(item.planned_amount), 0);
  const totalSpent = planItems.reduce((sum, item) => {
    const spent = calculateSpent(item.category, item.description);
    return sum + spent;
  }, 0);
  const totalRemaining = totalPlanned - totalSpent;
  const totalPercentage = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
      <TabHeader title={tr('Finanse')} subtitle={`${tr('Budżet i wydatki')}: ${ministry}`} actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setProp(emptyProp); setShowProposal(true); }}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 text-sm"
            title={tr('Zaproponuj pozycję do budżetu')}
          >
            <FileText size={16} /> {tr('Zgłoś propozycję')}
          </button>
          <button
            onClick={onAddExpense}
            className="px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
          >
            <Plus size={18} />
            {tr('Dodaj wydatek')}
          </button>
        </div>
      } />

      <Modal
        isOpen={showProposal}
        onClose={() => setShowProposal(false)}
        title={tr('Propozycja do budżetu')}
        size="sm"
        footer={<>
          <Button variant="secondary" disabled={savingProp} onClick={() => setShowProposal(false)}>{tr('Anuluj')}</Button>
          <Button onClick={submitProposal} loading={savingProp}>{tr('Zgłoś')}</Button>
        </>}
      >
          <div className="p-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{tr('Trafi do zatwierdzenia w module Finanse.')} {tr('Służba')}: <span className="font-semibold text-gray-700 dark:text-gray-200">{ministry}</span></p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[{ k: 'expense', l: tr('Wydatek') }, { k: 'income', l: tr('Przychód') }].map(({ k, l }) => (
                  <button key={k} type="button" onClick={() => setProp({ ...prop, kind: k })}
                    className={`py-2 rounded-xl text-sm font-medium border transition ${prop.kind === k ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'}`}>{l}</button>
                ))}
              </div>
              <div>
                <label htmlFor="fin-prop-year" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Budżet na rok')}</label>
                <select id="fin-prop-year" value={prop.year} onChange={(e) => setProp({ ...prop, year: parseInt(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                  {[nowYear, nowYear + 1, nowYear + 2].map((y) => (
                    <option key={y} value={y}>{y === nowYear ? `${y} (${tr('bieżący')})` : y === nowYear + 1 ? `${y} (${tr('przyszły')})` : y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Opis')}</label>
                <input value={prop.description} onChange={(e) => setProp({ ...prop, description: e.target.value })} placeholder={tr('np. Nowy mikrofon')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (zł)')}</label>
                <input type="number" step="0.01" min="0" inputMode="decimal" value={prop.amount} onChange={(e) => setProp({ ...prop, amount: e.target.value })} placeholder="0,00" className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Uzasadnienie (opcjonalnie)')}</label>
                <textarea rows={2} value={prop.note} onChange={(e) => setProp({ ...prop, note: e.target.value })} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
            </div>
          </div>
      </Modal>

      {planItems.length === 0 ? (
        <EmptyState icon={Wallet} title={t('Brak pozycji budżetowych dla tej służby')} subtitle={t('Dodaj pozycje budżetowe w module Finanse')} />
      ) : (
        <>
          <DataTable>
              <THead>
                <tr>
                  <TH>{t('Opis kosztu')}</TH>
                  <TH align="right">{tr('Plan (zł)')}</TH>
                  <TH align="right">{tr('Wykorzystano (zł)')}</TH>
                  <TH align="center">{tr('% Realizacji')}</TH>
                  <TH align="right">{t('Pozostało')}</TH>
                </tr>
              </THead>
              <tbody>
                {planItems.map(item => {
                  const planned = num(item.planned_amount);
                  const spent = calculateSpent(item.category, item.description);
                  const remaining = planned - spent;
                  const percentage = planned > 0 ? (spent / planned) * 100 : 0;
                  const relatedExpenses = expenses.filter((e) => matchesBudgetItem(e, item));

                  return (
                    <React.Fragment key={item.id}>
                      <TR>
                        <TD className="text-gray-900 dark:text-white">{item.description}</TD>
                        <TD align="right" numeric className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {fmtMoney(planned)}
                        </TD>
                        <TD
                          align="right"
                          numeric
                          className="font-medium text-gray-900 dark:text-white whitespace-nowrap cursor-pointer hover:text-accent-primary dark:hover:text-accent-primary-light transition"
                          onClick={() => toggleExpand(item.id)}
                        >
                          {fmtMoney(spent)}
                          {expandedItems[item.id] ? (
                            <ChevronUp size={16} className="inline ml-1" />
                          ) : (
                            <ChevronDown size={16} className="inline ml-1" />
                          )}
                        </TD>
                        <TD>
                          <div className="space-y-2">
                            <div className="text-center font-semibold tabular-nums text-gray-900 dark:text-white">
                              {fmtPct(percentage)}
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full bg-gradient-to-r ${getProgressBarColor(percentage)} transition-all`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </TD>
                        <TD align="right" numeric className={`font-semibold whitespace-nowrap ${remaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                          {fmtMoney(remaining)}
                        </TD>
                      </TR>

                      {/* Expanded expense list */}
                      {expandedItems[item.id] && (
                        <TR className="bg-gray-50/70 dark:bg-gray-800/40">
                          <TD colSpan={5}>
                            {relatedExpenses.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                  {tr('Wydatki:')} {item.description}
                                </p>
                                <div className="space-y-1">
                                  {relatedExpenses.map((expense) => (
                                    <div
                                      key={expense.id}
                                      className="grid grid-cols-5 gap-3 text-sm py-2 px-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                                    >
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Data')}</span>
                                        <span className="text-gray-900 dark:text-white">
                                          {fmtDate(expense.payment_date)}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kontrahent')}</span>
                                        <span className="text-gray-900 dark:text-white">{expense.contractor}</span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kwota')}</span>
                                        <span className="font-bold text-gray-900 dark:text-white">
                                          {fmtMoney(expense.amount)}
                                        </span>
                                        {!isCountedExpense(expense) && <span className="text-[11px] text-gray-500 dark:text-gray-400">{expense.status === 'rejected' ? tr('odrzucony') : tr('czeka na akceptację')}</span>}
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Szczegółowy opis')}</span>
                                        <span className="text-gray-900 dark:text-white text-xs">
                                          {expense.detailed_description || '-'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Odpowiedzialny')}</span>
                                        <span className="text-gray-900 dark:text-white">{expense.responsible_person}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                                    {tr('Suma:')} {fmtMoney(relatedExpenses.filter(isCountedExpense).reduce((sum, exp) => sum + num(exp.amount), 0))}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                                {tr('Brak wydatków w tej pozycji budżetu')}
                              </p>
                            )}
                          </TD>
                        </TR>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
          </DataTable>

          {/* Summary */}
          <div className="mt-6 p-4 bg-gradient-to-r from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/40 dark:to-accent-secondary-darkest/40 rounded-xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('Plan całkowity')}</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {fmtMoney(totalPlanned)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{tr('Wykorzystano')}</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {fmtMoney(totalSpent)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{tr('% Realizacji')}</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {fmtPct(totalPercentage)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('Pozostało')}</div>
                <div className={`text-xl font-bold ${totalRemaining >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {fmtMoney(totalRemaining)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Zgłoszone propozycje tej służby (widok lidera: status swoich zgłoszeń) */}
      {myProposals.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase mb-3">{tr('Zgłoszone propozycje')}</h3>
          <div className="space-y-2">
            {myProposals.map((p) => {
              const st = PROP_STATUS[p.status] || PROP_STATUS.pending;
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${st.c}`}>{st.l}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.description}</div>
                    <div className="text-xs text-gray-400">{p.kind === 'income' ? tr('Przychód') : tr('Wydatek')} · {tr('budżet')} {p.year}{p.note ? ` · ${p.note}` : ''}</div>
                  </div>
                  <div className="font-bold text-gray-800 dark:text-gray-100 shrink-0 tabular-nums">{fmtMoney(p.amount)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
