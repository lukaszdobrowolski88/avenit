# Instrukcja dodawania zakładki Finanse do modułów zespołów

## Przygotowanie bazy danych

1. Uruchom migrację SQL w Supabase Dashboard:
   - Otwórz plik `supabase/migrations/add_ministry_field.sql`
   - Skopiuj zawartość i wklej do SQL Editor w Supabase Dashboard
   - Kliknij "Run"

## Komponenty wspólne

Został utworzony komponent `FinanceTab.jsx` w `/src/modules/shared/FinanceTab.jsx` który obsługuje:
- Wyświetlanie pozycji budżetowych służby
- Wyświetlanie wydatków
- Rozwijanie list wydatków dla każdej pozycji budżetowej
- Podsumowanie finansowe

## Kroki integracji w module zespołu

### 1. Dodaj import komponentu FinanceTab

Na początku pliku modułu dodaj:

```javascript
import { DollarSign } from 'lucide-react'; // jeśli jeszcze nie ma
import FinanceTab from '../shared/FinanceTab';
```

### 2. Dodaj stany dla danych finansowych

W komponencie modułu dodaj nowe stany:

```javascript
const [budgetItems, setBudgetItems] = useState([]);
const [expenses, setExpenses] = useState([]);
const [showExpenseModal, setShowExpenseModal] = useState(false);
const [expenseForm, setExpenseForm] = useState({
  payment_date: '',
  amount: '',
  contractor: '',
  category: 'NAZWA_SŁUŻBY', // np. 'Grupa Uwielbienia'
  description: '',
  detailed_description: '',
  responsible_person: '',
  documents: [],
  tags: [],
  ministry: 'NAZWA_SŁUŻBY' // np. 'Grupa Uwielbienia'
});
```

### 3. Dodaj funkcję fetchowania danych finansowych

```javascript
const fetchFinanceData = async () => {
  const currentYear = new Date().getFullYear();
  const ministryName = 'NAZWA_SŁUŻBY'; // np. 'Grupa Uwielbienia'

  try {
    // Fetch budget items
    const { data: budget, error: budgetError } = await supabase
      .from('budget_items')
      .select('*')
      .eq('ministry', ministryName)
      .eq('year', currentYear)
      .order('id', { ascending: true });

    if (budgetError) throw budgetError;
    setBudgetItems(budget || []);

    // Fetch expenses
    const { data: exp, error: expError } = await supabase
      .from('expense_transactions')
      .select('*')
      .eq('ministry', ministryName)
      .gte('payment_date', `${currentYear}-01-01`)
      .lte('payment_date', `${currentYear}-12-31`)
      .order('payment_date', { ascending: false });

    if (expError) throw expError;
    setExpenses(exp || []);
  } catch (error) {
    console.error('Error fetching finance data:', error);
  }
};
```

### 4. Dodaj useEffect do ładowania danych finansowych

```javascript
useEffect(() => {
  if (activeTab === 'finances') {
    fetchFinanceData();
  }
}, [activeTab]);
```

### 5. Dodaj przycisk zakładki "Finanse"

W sekcji nawigacji zakładek dodaj:

```javascript
<button
  onClick={() => setActiveTab('finances')}
  className={`px-6 py-2.5 rounded-xl font-medium transition text-sm ${
    activeTab === 'finances'
      ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white shadow-md'
      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
  }`}
>
  <DollarSign size={16} className="inline mr-2" />
  Finanse
</button>
```

### 6. Dodaj sekcję renderowania zakładki Finanse

```javascript
{activeTab === 'finances' && (
  <FinanceTab
    ministry="NAZWA_SŁUŻBY" // np. 'Grupa Uwielbienia'
    budgetItems={budgetItems}
    expenses={expenses}
    onAddExpense={() => setShowExpenseModal(true)}
    onRefresh={fetchFinanceData}
  />
)}
```

### 7. Dodaj funkcję zapisywania wydatku

```javascript
const saveExpense = async () => {
  if (!expenseForm.payment_date || !expenseForm.amount || !expenseForm.contractor || !expenseForm.description || !expenseForm.responsible_person) {
    alert('Wypełnij wymagane pola');
    return;
  }

  try {
    const { error } = await supabase.from('expense_transactions').insert([{
      payment_date: expenseForm.payment_date,
      amount: parseFloat(expenseForm.amount),
      contractor: expenseForm.contractor,
      category: expenseForm.category,
      description: expenseForm.description,
      detailed_description: expenseForm.detailed_description,
      responsible_person: expenseForm.responsible_person,
      documents: expenseForm.documents,
      tags: expenseForm.tags,
      ministry: expenseForm.ministry
    }]);

    if (error) throw error;

    setShowExpenseModal(false);
    setExpenseForm({
      payment_date: '',
      amount: '',
      contractor: '',
      category: 'NAZWA_SŁUŻBY',
      description: '',
      detailed_description: '',
      responsible_person: '',
      documents: [],
      tags: [],
      ministry: 'NAZWA_SŁUŻBY'
    });
    fetchFinanceData();
  } catch (error) {
    console.error('Error saving expense:', error);
    alert('Błąd zapisywania: ' + error.message);
  }
};
```

### 8. Dodaj modal dodawania wydatku (uproszczony)

```javascript
{showExpenseModal && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl p-6 border border-white/20 dark:border-gray-700">
      <div className="flex justify-between mb-6">
        <h3 className="font-bold text-xl text-gray-800 dark:text-white">Dodaj wydatek - NAZWA_SŁUŻBY</h3>
        <button onClick={() => setShowExpenseModal(false)} className="text-gray-500 dark:text-gray-400">
          <X size={24} />
        </button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Data</label>
          <input
            type="date"
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={expenseForm.payment_date}
            onChange={(e) => setExpenseForm({...expenseForm, payment_date: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kwota (PLN)</label>
          <input
            type="number"
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={expenseForm.amount}
            onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Pozycja budżetowa</label>
          <select
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={expenseForm.description}
            onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
          >
            <option value="">Wybierz pozycję</option>
            {budgetItems.map(item => (
              <option key={item.id} value={item.description}>{item.description}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Kontrahent</label>
          <input
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={expenseForm.contractor}
            onChange={(e) => setExpenseForm({...expenseForm, contractor: e.target.value})}
            placeholder="Nazwa firmy/osoby"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Szczegółowy opis</label>
          <textarea
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
            rows={2}
            value={expenseForm.detailed_description}
            onChange={(e) => setExpenseForm({...expenseForm, detailed_description: e.target.value})}
            placeholder="Dodatkowe informacje..."
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Osoba odpowiedzialna</label>
          <input
            className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            value={expenseForm.responsible_person}
            onChange={(e) => setExpenseForm({...expenseForm, responsible_person: e.target.value})}
            placeholder="Imię i nazwisko"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={() => setShowExpenseModal(false)}
          className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          Anuluj
        </button>
        <button
          onClick={saveExpense}
          className="px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-600 text-white rounded-xl hover:shadow-lg transition"
        >
          Zapisz wydatek
        </button>
      </div>
    </div>
  </div>
)}
```

## Mapowanie nazw służb

Używaj dokładnie takich samych nazw jak w module Finanse:
- `'Grupa Uwielbienia'` - dla WorshipModule
- `'MediaTeam'` - dla MediaTeamModule
- `'Grupy domowe'` - dla HomeGroupsModule
- `'małe schWro'` - dla KidsModule
- `'AtmosferaTeam'` - dla AtmosferaTeamModule

## Dodawanie pozycji budżetowych

Pozycje budżetowe dla każdej służby należy dodawać w głównym module Finanse:
1. Przejdź do zakładki "Finanse" w menu głównym
2. Kliknij "Dodaj pozycję budżetową"
3. Wybierz odpowiednią służbę w polu "Kategoria (Służba)"
4. Wprowadź opis kosztu i planowaną kwotę
5. Zapisz

Po dodaniu pozycji budżetowych, będą one widoczne w zakładce Finanse każdego modułu zespołu.
