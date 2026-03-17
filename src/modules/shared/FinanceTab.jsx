import React, { useState } from 'react';
import { Plus, ChevronDown, ChevronUp, FileText } from 'lucide-react';

export default function FinanceTab({ ministry, budgetItems, expenses, onAddExpense, onRefresh }) {
  const [expandedItems, setExpandedItems] = useState({});

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
  const totalPlanned = budgetItems.reduce((sum, item) => sum + parseFloat(item.planned_amount || 0), 0);
  const totalSpent = budgetItems.reduce((sum, item) => {
    const spent = calculateSpent(item.category, item.description);
    return sum + spent;
  }, 0);
  const totalRemaining = totalPlanned - totalSpent;
  const totalPercentage = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;

  return (
    <section className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 transition-colors">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Budżet i Wydatki: {ministry}
        </h2>
        <button
          onClick={onAddExpense}
          className="px-4 py-2 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition flex items-center gap-2"
        >
          <Plus size={18} />
          Dodaj wydatek
        </button>
      </div>

      {budgetItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="mb-4">Brak pozycji budżetowych dla tej służby</p>
          <p className="text-sm">Dodaj pozycje budżetowe w module Finanse</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Opis kosztu</th>
                  <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Plan (PLN)</th>
                  <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Wykorzystano (PLN)</th>
                  <th className="text-center py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">% Realizacji</th>
                  <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-400 font-medium">Pozostało</th>
                </tr>
              </thead>
              <tbody>
                {budgetItems.map(item => {
                  const spent = calculateSpent(item.category, item.description);
                  const remaining = item.planned_amount - spent;
                  const percentage = item.planned_amount > 0 ? (spent / item.planned_amount) * 100 : 0;
                  const relatedExpenses = expenses.filter(
                    e => e.category === item.category && e.description === item.description
                  );

                  return (
                    <React.Fragment key={item.id}>
                      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
                        <td className="py-4 px-4 text-gray-900 dark:text-white">{item.description}</td>
                        <td className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium">
                          {item.planned_amount.toLocaleString('pl-PL')} zł
                        </td>
                        <td
                          className="py-4 px-4 text-right text-gray-900 dark:text-white font-medium cursor-pointer hover:text-pink-600 dark:hover:text-pink-400 transition"
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
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Data</span>
                                        <span className="text-gray-900 dark:text-white">
                                          {new Date(expense.payment_date).toLocaleDateString('pl-PL')}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Kontrahent</span>
                                        <span className="text-gray-900 dark:text-white">{expense.contractor}</span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Kwota</span>
                                        <span className="font-bold text-gray-900 dark:text-white">
                                          {expense.amount.toLocaleString('pl-PL')} zł
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Szczegółowy opis</span>
                                        <span className="text-gray-900 dark:text-white text-xs">
                                          {expense.detailed_description || '-'}
                                        </span>
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Odpowiedzialny</span>
                                        <span className="text-gray-900 dark:text-white">{expense.responsible_person}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                                    Suma: {relatedExpenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString('pl-PL')} zł
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                                Brak wydatków w tej pozycji budżetu
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
          <div className="mt-6 p-4 bg-gradient-to-r from-pink-100 to-orange-100 dark:from-pink-900/40 dark:to-orange-900/40 rounded-xl">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Plan całkowity</div>
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
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Pozostało</div>
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
