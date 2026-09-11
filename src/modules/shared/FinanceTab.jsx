import React, { useState, useEffect } from 'react';
import { Plus, ChevronDown, ChevronUp, FileText, X } from 'lucide-react';
import { useT } from '../../i18n';
import { tr } from '../../i18n';
import TabHeader from '../../components/TabHeader';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

export default function FinanceTab({ ministry, budgetItems = [], expenses = [], onAddExpense, onRefresh }) {
  const t = useT();
  const [expandedItems, setExpandedItems] = useState({});

  // Zgłaszanie propozycji do budżetu z poziomu zakładki Finanse zespołu.
  const [userEmail, setUserEmail] = useState('');
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserEmail(data?.user?.email || '')).catch(() => {}); }, []);
  const [showProposal, setShowProposal] = useState(false);
  const emptyProp = { kind: 'expense', description: '', amount: '', note: '' };
  const [prop, setProp] = useState(emptyProp);
  const [savingProp, setSavingProp] = useState(false);
  const submitProposal = async () => {
    if (!prop.description.trim() || !prop.amount) { toast.error(tr('Podaj opis i kwotę')); return; }
    setSavingProp(true);
    try {
      const year = new Date().getFullYear();
      await supabase.from('budget_proposals').insert([{
        year, kind: prop.kind, team_type: ministry, category: ministry,
        description: prop.description.trim(), amount: parseFloat(prop.amount), note: prop.note || null,
        submitted_by: userEmail || null, status: 'pending',
      }]);
      toast.success(tr('Propozycja wysłana do zatwierdzenia'));
      setShowProposal(false); setProp(emptyProp);
    } catch (e) { toast.error(tr('Błąd: ') + e.message); }
    finally { setSavingProp(false); }
  };

  const planItems = budgetItems.filter((i) => i.kind !== 'income');

  const toggleExpand = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const calculateSpent = (category, description) => {
    return expenses
      .filter(e => e.category === category && e.description === description)
      .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  };

  const getProgressBarColor = (percentage) => {
    if (percentage < 80) return 'from-green-500 to-green-600';
    if (percentage <= 100) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  // Oblicz sumy
  const totalPlanned = planItems.reduce((sum, item) => sum + parseFloat(item.planned_amount || 0), 0);
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

      {showProposal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]" onClick={() => setShowProposal(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-5">
              <h3 className="font-bold text-xl text-gray-800 dark:text-white">{tr('Propozycja do budżetu')}</h3>
              <button onClick={() => setShowProposal(false)} className="text-gray-500 dark:text-gray-400"><X size={22} /></button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{tr('Trafi do zatwierdzenia w module Finanse.')} {tr('Służba')}: <span className="font-semibold text-gray-700 dark:text-gray-200">{ministry}</span></p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {[{ k: 'expense', l: tr('Wydatek') }, { k: 'income', l: tr('Przychód') }].map(({ k, l }) => (
                  <button key={k} type="button" onClick={() => setProp({ ...prop, kind: k })}
                    className={`py-2 rounded-xl text-sm font-medium border transition ${prop.kind === k ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'}`}>{l}</button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Opis')}</label>
                <input value={prop.description} onChange={(e) => setProp({ ...prop, description: e.target.value })} placeholder={tr('np. Nowy mikrofon')} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Kwota (PLN)')}</label>
                <input type="number" value={prop.amount} onChange={(e) => setProp({ ...prop, amount: e.target.value })} placeholder="0.00" className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">{tr('Uzasadnienie (opcjonalnie)')}</label>
                <textarea rows={2} value={prop.note} onChange={(e) => setProp({ ...prop, note: e.target.value })} className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowProposal(false)} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">{tr('Anuluj')}</button>
                <button onClick={submitProposal} disabled={savingProp} className="flex-1 px-4 py-3 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium disabled:opacity-60">{savingProp ? tr('Wysyłanie…') : tr('Zgłoś')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {planItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="mb-4">{t('Brak pozycji budżetowych dla tej służby')}</p>
          <p className="text-sm">{t('Dodaj pozycje budżetowe w module Finanse')}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Opis kosztu')}</th>
                  <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Plan (PLN)</th>
                  <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Wykorzystano (PLN)</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">% Realizacji</th>
                  <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">{t('Pozostało')}</th>
                </tr>
              </thead>
              <tbody>
                {planItems.map(item => {
                  const planned = Number(item.planned_amount || 0);
                  const spent = calculateSpent(item.category, item.description);
                  const remaining = planned - spent;
                  const percentage = planned > 0 ? (spent / planned) * 100 : 0;
                  const relatedExpenses = expenses.filter(
                    e => e.category === item.category && e.description === item.description
                  );

                  return (
                    <React.Fragment key={item.id}>
                      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                        <td className="py-4 px-4 text-gray-900 dark:text-white">{item.description}</td>
                        <td className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium">
                          {planned.toLocaleString('pl-PL')} zł
                        </td>
                        <td
                          className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium cursor-pointer hover:text-accent-primary dark:hover:text-accent-primary-light transition"
                          onClick={() => toggleExpand(item.id)}
                        >
                          {spent.toLocaleString('pl-PL')} zł
                          {expandedItems[item.id] ? (
                            <ChevronUp size={16} className="inline ml-1" />
                          ) : (
                            <ChevronDown size={16} className="inline ml-1" />
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="space-y-2">
                            <div className="text-center font-bold text-gray-900 dark:text-white">
                              {percentage.toFixed(1)}%
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                              <div
                                className={`h-2.5 rounded-full bg-gradient-to-r ${getProgressBarColor(percentage)} transition-all`}
                                style={{ width: `${Math.min(percentage, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className={`py-4 px-4 text-right font-bold ${remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {remaining.toLocaleString('pl-PL')} zł
                        </td>
                      </tr>

                      {/* Expanded expense list */}
                      {expandedItems[item.id] && (
                        <tr className="bg-gray-50 dark:bg-gray-800/50">
                          <td colSpan={5} className="py-4 px-4">
                            {relatedExpenses.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                  Wydatki: {item.description}
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
                                          {new Date(expense.payment_date).toLocaleDateString('pl-PL')}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kontrahent')}</span>
                                        <span className="text-gray-900 dark:text-white">{expense.contractor}</span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('Kwota')}</span>
                                        <span className="font-bold text-gray-900 dark:text-white">
                                          {Number(expense.amount || 0).toLocaleString('pl-PL')} zł
                                        </span>
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
                                    Suma: {relatedExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0).toLocaleString('pl-PL')} zł
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                                {tr('Brak wydatków w tej pozycji budżetu')}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mt-6 p-4 bg-gradient-to-r from-accent-primary-lighter to-accent-secondary-lighter dark:from-accent-primary-darkest/40 dark:to-accent-secondary-darkest/40 rounded-xl">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('Plan całkowity')}</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {totalPlanned.toLocaleString('pl-PL')} zł
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Wykorzystano</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {totalSpent.toLocaleString('pl-PL')} zł
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">% Realizacji</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  {totalPercentage.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t('Pozostało')}</div>
                <div className={`text-xl font-bold ${totalRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalRemaining.toLocaleString('pl-PL')} zł
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
