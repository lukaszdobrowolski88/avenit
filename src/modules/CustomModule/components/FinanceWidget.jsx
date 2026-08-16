import React, { useState, useEffect, useCallback } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useCampusQuery } from '../../../hooks/useCampusQuery';
import { tr } from '../../../i18n';
import FinanceTab from '../../shared/FinanceTab';

// Samowystarczalny widget finansów dla modułu własnego — PARYTET z modułami
// systemowymi (np. MediaTeamModule): sam pobiera budget_items + expense_transactions
// (z filtrem kampusu, po `ministry` = klucz modułu) i przekazuje je do FinanceTab
// wraz z obsługą dodawania wydatku. Bez tego FinanceTab dostawał undefined i crashował.
export default function FinanceWidget({ moduleKey, moduleName }) {
  const { withCampusFilter, selectedCampusId } = useCampusQuery();
  const [budgetItems, setBudgetItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const ministry = moduleKey;

  const emptyForm = {
    payment_date: '', amount: '', contractor: '', category: moduleKey,
    description: '', detailed_description: '', responsible_person: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchFinanceData = useCallback(async () => {
    const currentYear = new Date().getFullYear();
    try {
      const { data: budget } = await withCampusFilter(
        supabase.from('budget_items').select('*'))
        .eq('team_type', ministry)
        .eq('year', currentYear)
        .order('id', { ascending: true });
      setBudgetItems(budget || []);

      const { data: exp } = await supabase
        .from('expense_transactions')
        .select('*')
        .eq('team_type', ministry)
        .gte('payment_date', `${currentYear}-01-01`)
        .lte('payment_date', `${currentYear}-12-31`)
        .order('payment_date', { ascending: false });
      setExpenses(exp || []);
    } catch (err) {
      console.error('Błąd pobierania finansów:', err);
    }
  }, [ministry, withCampusFilter]);

  useEffect(() => { fetchFinanceData(); }, [fetchFinanceData, selectedCampusId]);

  const saveExpense = async () => {
    if (!form.payment_date || !form.amount || !form.contractor || !form.description || !form.responsible_person) {
      alert(tr('Wypełnij wymagane pola'));
      return;
    }
    try {
      const { error } = await supabase.from('expense_transactions').insert([{
        payment_date: form.payment_date,
        amount: parseFloat(form.amount),
        contractor: form.contractor,
        category: form.category || ministry,
        description: form.description,
        detailed_description: form.detailed_description,
        responsible_person: form.responsible_person,
        documents: [],
        tags: [],
        ministry,
      }]);
      if (error) throw error;
      setShowModal(false);
      setForm(emptyForm);
      fetchFinanceData();
    } catch (err) {
      alert(tr('Błąd zapisywania: ') + err.message);
    }
  };

  const field = (key, label, type = 'text') => (
    <div>
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1.5">{tr(label)}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
      />
    </div>
  );

  return (
    <>
      <FinanceTab
        ministry={moduleName || moduleKey}
        budgetItems={budgetItems}
        expenses={expenses}
        onAddExpense={() => setShowModal(true)}
        onRefresh={fetchFinanceData}
      />

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[160]">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-xl bg-gradient-to-r from-accent-primary to-accent-secondary bg-clip-text text-transparent">
                {tr('Dodaj wydatek')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {field('payment_date', 'Data płatności', 'date')}
              {field('amount', 'Kwota (PLN)', 'number')}
              {field('contractor', 'Kontrahent')}
              {field('description', 'Opis kosztu')}
              {field('detailed_description', 'Szczegółowy opis')}
              {field('responsible_person', 'Osoba odpowiedzialna')}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition font-medium">
                {tr('Anuluj')}
              </button>
              <button onClick={saveExpense} className="px-5 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl hover:shadow-lg transition font-medium flex items-center gap-2">
                <Save size={16} /> {tr('Zapisz')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
