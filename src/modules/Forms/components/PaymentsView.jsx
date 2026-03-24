import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  Calendar,
  DollarSign,
  FileText,
  X,
  Check,
  Clock,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  CreditCard,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Banknote,
  User,
  Hash,
  Save
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatPrice } from '../utils/fieldTypes';

export default function PaymentsView({ forms }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForm, setSelectedForm] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [unpaidParticipants, setUnpaidParticipants] = useState([]);
  const [loadingUnpaid, setLoadingUnpaid] = useState(false);
  const [selectedUnpaid, setSelectedUnpaid] = useState(null);
  const [addPaymentAmount, setAddPaymentAmount] = useState('');
  const [addPaymentDate, setAddPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [unpaidSearch, setUnpaidSearch] = useState('');
  const [newPayment, setNewPayment] = useState({
    responseId: '',
    amount: '',
    method: 'transfer',
    reference: '',
    notes: '',
    paidAt: new Date().toISOString().split('T')[0]
  });

  // Pobierz wszystkie platnosci
  useEffect(() => {
    fetchAllPayments();
  }, []);

  const fetchAllPayments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('form_responses')
        .select(`
          *,
          forms:form_id (
            id,
            title,
            fields,
            settings
          )
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // Przetworz dane platnosci
      const processedPayments = [];

      (data || []).forEach(response => {
        const form = response.forms;
        const answers = response.answers || {};

        // Sprawdz czy formularz ma wlaczone platnosci
        if (!form?.settings?.pricing?.enabled) return;

        // Znajdz dane uczestnika
        let email = response.respondent_email || '';
        let name = response.respondent_name || '';

        if (form?.fields) {
          form.fields.forEach(field => {
            const value = answers[field.id];
            if (!value) return;

            if (field.type === 'email' && !email) {
              email = value;
            }
            if (field.type === 'text' && !name) {
              const label = field.label?.toLowerCase() || '';
              if (label.includes('imie') || label.includes('imię') || label.includes('name') || label.includes('nazwisko')) {
                name = value;
              }
            }
          });
        }

        // Oblicz kwote
        let totalAmount = 0;
        const priceField = form.fields?.find(f => f.type === 'price');
        if (priceField?.priceConfig?.basePrice) {
          totalAmount = priceField.priceConfig.basePrice;
        }

        // Sprawdz opcje z cenami
        form.fields?.forEach(field => {
          const value = answers[field.id];
          if (!value || !field.options) return;

          field.options.forEach(option => {
            if (option.price && (value === option.value || (Array.isArray(value) && value.includes(option.value)))) {
              totalAmount += option.price;
            }
          });
        });

        if (totalAmount <= 0) return;

        // Dane platnosci
        const paymentData = answers._payment || {};
        const paymentStatus = paymentData.status === 'completed' ? 'paid' : 'pending';
        const paymentMethod = paymentData.method || 'transfer';

        processedPayments.push({
          id: response.id,
          formId: response.form_id,
          formTitle: form?.title || 'Nieznany formularz',
          participantName: name || 'Anonim',
          participantEmail: email,
          submittedAt: response.submitted_at,
          amount: totalAmount,
          status: paymentStatus,
          method: paymentMethod,
          reference: paymentData.reference || '',
          notes: paymentData.notes || '',
          paidAt: paymentData.paidAt || null,
          currency: form?.settings?.pricing?.currency || 'PLN',
          answers
        });
      });

      setPayments(processedPayments);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
    }
  };

  // Pobierz nieopłaconych uczestników do modala
  const fetchUnpaidParticipants = async () => {
    setLoadingUnpaid(true);
    try {
      const { data, error } = await supabase
        .from('form_responses')
        .select('*, forms:form_id (id, title, fields, settings)')
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      const unpaid = [];
      const extractName = (answerObj, formFields) => {
        let firstName = '', lastName = '';
        (formFields || []).forEach(f => {
          const v = answerObj[f.id];
          if (!v || f.type !== 'text') return;
          const l = f.label?.toLowerCase() || '';
          if ((l.includes('imie') || l.includes('imię')) && !l.includes('nazwisko') && !firstName) firstName = v;
          else if (l.includes('nazwisko') && !lastName) lastName = v;
        });
        return [firstName, lastName].filter(Boolean).join(' ');
      };

      const extractEmail = (answerObj, formFields) => {
        const emailField = (formFields || []).find(f => f.type === 'email');
        return emailField ? answerObj[emailField.id] || '' : '';
      };

      (data || []).forEach(response => {
        const form = response.forms;
        if (!form?.settings?.pricing?.enabled) return;
        const answers = response.answers || {};
        const addonsItems = form?.settings?.addons?.items || [];
        const breakdown = answers._priceBreakdown || {};
        const basePerPerson = breakdown.baseUnitPrice || 0;
        const groupSize = answers._registrationMode === 'group'
          ? (answers._participants?.length || 0) + (answers._contactPerson ? 1 : 0) : 1;
        const discountPP = groupSize > 0 ? (breakdown.discountTotal || 0) / groupSize : 0;

        const calcAmount = (addons) => {
          let amt = basePerPerson;
          if (addons) Object.entries(addons).forEach(([id, qty]) => {
            if (qty > 0) { const a = addonsItems.find(x => x.id === id); if (a) amt += a.price * qty; }
          });
          return Math.max(0, amt - discountPP);
        };

        const isUnpaid = (payment) => !payment || (payment.status !== 'completed');

        if (answers._registrationMode === 'group') {
          if (answers._contactPerson && isUnpaid(answers._contactPerson._payment)) {
            const amt = calcAmount(answers._contactPerson._addons);
            if (amt > 0) unpaid.push({
              id: `${response.id}-contact`, responseId: response.id, type: 'contact',
              name: extractName(answers._contactPerson, form.fields) || response.respondent_name || 'Osoba zgłaszająca',
              email: extractEmail(answers._contactPerson, form.fields) || response.respondent_email,
              formTitle: form.title, amount: amt, paidAmount: answers._contactPerson._payment?.totalPaid || 0,
              currency: form.settings.pricing.currency || 'PLN'
            });
          }
          (answers._participants || []).forEach((p, idx) => {
            if (isUnpaid(p._payment)) {
              const amt = calcAmount(p._addons);
              if (amt > 0) unpaid.push({
                id: `${response.id}-p${idx}`, responseId: response.id, type: 'participant', pIdx: idx,
                name: extractName(p, form.fields) || `Uczestnik ${idx + 1}`,
                email: extractEmail(p, form.fields),
                formTitle: form.title, amount: amt, paidAmount: p._payment?.totalPaid || 0,
                currency: form.settings.pricing.currency || 'PLN'
              });
            }
          });
        } else {
          if (isUnpaid(answers._payment)) {
            const amt = answers._totalPrice || breakdown.grandTotal || 0;
            if (amt > 0) unpaid.push({
              id: response.id, responseId: response.id, type: 'individual',
              name: extractName(answers, form.fields) || response.respondent_name || 'Anonim',
              email: extractEmail(answers, form.fields) || response.respondent_email,
              formTitle: form.title, amount: amt, paidAmount: answers._payment?.totalPaid || 0,
              currency: form.settings.pricing.currency || 'PLN'
            });
          }
        }
      });

      setUnpaidParticipants(unpaid);
    } catch (err) {
      console.error('Error fetching unpaid:', err);
    } finally {
      setLoadingUnpaid(false);
    }
  };

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setSelectedUnpaid(null);
    setAddPaymentAmount('');
    setAddPaymentDate(new Date().toISOString().split('T')[0]);
    setUnpaidSearch('');
    fetchUnpaidParticipants();
  };

  const handleAddPayment = async () => {
    if (!selectedUnpaid) return;
    try {
      const { data: responseData, error: fetchError } = await supabase
        .from('form_responses').select('answers').eq('id', selectedUnpaid.responseId).single();
      if (fetchError) throw fetchError;

      const fullAnswers = responseData.answers;
      const paidAmount = parseFloat(addPaymentAmount) || 0;
      const dueAmount = selectedUnpaid.amount;
      const getExisting = (pa) => pa?._payment || {};

      let existing;
      if (selectedUnpaid.type === 'contact') existing = getExisting(fullAnswers._contactPerson);
      else if (selectedUnpaid.type === 'participant') existing = getExisting(fullAnswers._participants?.[selectedUnpaid.pIdx]);
      else existing = getExisting(fullAnswers);

      const totalPaid = (existing.totalPaid || 0) + paidAmount;
      const paymentData = {
        status: totalPaid >= dueAmount ? 'completed' : 'partial',
        totalPaid, dueAmount,
        payments: [...(existing.payments || []), { amount: paidAmount, date: addPaymentDate, method: 'manual', addedAt: new Date().toISOString() }],
        updatedAt: new Date().toISOString()
      };

      if (selectedUnpaid.type === 'contact') fullAnswers._contactPerson = { ...fullAnswers._contactPerson, _payment: paymentData };
      else if (selectedUnpaid.type === 'participant') fullAnswers._participants[selectedUnpaid.pIdx] = { ...fullAnswers._participants[selectedUnpaid.pIdx], _payment: paymentData };
      else fullAnswers._payment = paymentData;

      await supabase.from('form_responses').update({ answers: fullAnswers }).eq('id', selectedUnpaid.responseId);
      setShowAddModal(false);
      fetchAllPayments();
    } catch (err) {
      console.error('Error adding payment:', err);
      alert('Wystąpił błąd podczas dodawania płatności');
    }
  };

  // Filtrowanie i sortowanie
  const filteredPayments = useMemo(() => {
    let result = [...payments];

    // Filtr wyszukiwania
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.participantName.toLowerCase().includes(query) ||
        p.participantEmail.toLowerCase().includes(query) ||
        p.formTitle.toLowerCase().includes(query) ||
        p.reference?.toLowerCase().includes(query)
      );
    }

    // Filtr formularza
    if (selectedForm !== 'all') {
      result = result.filter(p => p.formId === selectedForm);
    }

    // Filtr statusu
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    // Filtr metody
    if (methodFilter !== 'all') {
      result = result.filter(p => p.method === methodFilter);
    }

    // Filtr daty
    if (dateRange.from) {
      result = result.filter(p => new Date(p.submittedAt) >= new Date(dateRange.from));
    }
    if (dateRange.to) {
      result = result.filter(p => new Date(p.submittedAt) <= new Date(dateRange.to + 'T23:59:59'));
    }

    // Sortowanie
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.submittedAt) - new Date(b.submittedAt);
          break;
        case 'name':
          comparison = a.participantName.localeCompare(b.participantName);
          break;
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [payments, searchQuery, selectedForm, statusFilter, methodFilter, dateRange, sortBy, sortOrder]);

  // Statystyki
  const stats = useMemo(() => {
    const total = payments.length;
    const paid = payments.filter(p => p.status === 'paid');
    const pending = payments.filter(p => p.status === 'pending');
    const totalRevenue = paid.reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = pending.reduce((sum, p) => sum + p.amount, 0);
    const avgAmount = total > 0 ? (totalRevenue + pendingAmount) / total : 0;

    // Statystyki miesięczne
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const thisMonthPaid = paid
      .filter(p => p.paidAt && new Date(p.paidAt) >= thisMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    return { total, paidCount: paid.length, pendingCount: pending.length, totalRevenue, pendingAmount, avgAmount, thisMonthPaid };
  }, [payments]);

  // Unikalne formularze dla filtrow
  const uniqueForms = useMemo(() => {
    const formMap = new Map();
    payments.forEach(p => {
      if (!formMap.has(p.formId)) {
        formMap.set(p.formId, p.formTitle);
      }
    });
    return Array.from(formMap, ([id, title]) => ({ id, title }));
  }, [payments]);

  // Aktualizacja platnosci
  const updatePayment = async (paymentId, updates) => {
    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) return;

      const updatedAnswers = {
        ...payment.answers,
        _payment: {
          ...(payment.answers._payment || {}),
          ...updates,
          updatedAt: new Date().toISOString()
        }
      };

      const { error } = await supabase
        .from('form_responses')
        .update({ answers: updatedAnswers })
        .eq('id', paymentId);

      if (error) throw error;

      // Aktualizuj lokalny stan
      setPayments(prev => prev.map(p =>
        p.id === paymentId
          ? {
              ...p,
              status: updates.status === 'completed' ? 'paid' : (updates.status === 'pending' ? 'pending' : p.status),
              method: updates.method || p.method,
              reference: updates.reference ?? p.reference,
              notes: updates.notes ?? p.notes,
              paidAt: updates.paidAt || p.paidAt,
              answers: updatedAnswers
            }
          : p
      ));

      setEditingPayment(null);
      setSelectedPayment(null);
    } catch (error) {
      console.error('Error updating payment:', error);
      alert('Wystąpił błąd podczas aktualizacji płatności');
    }
  };

  // Oznacz jako oplacone
  const markAsPaid = async (paymentId) => {
    await updatePayment(paymentId, {
      status: 'completed',
      paidAt: new Date().toISOString()
    });
  };

  // Oznacz jako nieoplacone
  const markAsPending = async (paymentId) => {
    await updatePayment(paymentId, {
      status: 'pending',
      paidAt: null
    });
  };

  // Eksport do CSV
  const exportToCSV = () => {
    const headers = ['Uczestnik', 'Email', 'Formularz', 'Kwota', 'Status', 'Metoda', 'Referencja', 'Data rejestracji', 'Data płatności', 'Notatki'];
    const rows = filteredPayments.map(p => [
      p.participantName,
      p.participantEmail,
      p.formTitle,
      formatPrice(p.amount, p.currency),
      p.status === 'paid' ? 'Opłacone' : 'Oczekuje',
      getMethodName(p.method),
      p.reference || '-',
      formatDate(p.submittedAt),
      p.paidAt ? formatDate(p.paidAt) : '-',
      p.notes || '-'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `platnosci_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMethodName = (method) => {
    const methods = {
      transfer: 'Przelew bankowy',
      paypal: 'PayPal',
      przelewy24: 'Przelewy24',
      cash: 'Gotówka',
      card: 'Karta'
    };
    return methods[method] || method;
  };

  const getStatusBadge = (status) => {
    if (status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
          <CheckCircle size={12} />
          Opłacone
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
        <Clock size={12} />
        Oczekuje
      </span>
    );
  };

  const getMethodBadge = (method) => {
    const colors = {
      transfer: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
      paypal: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
      przelewy24: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
      cash: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
      card: 'bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 text-accent-primary dark:text-accent-primary-light'
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colors[method] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
        <CreditCard size={12} />
        {getMethodName(method)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-primary-lighter border-t-accent-primary-light"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header z przyciskiem */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 shadow-sm hover:shadow-md transition-all"
        >
          <Plus size={18} />
          Dodaj płatność
        </button>
      </div>

      {/* Statystyki */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Hash size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Wszystkich</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.paidCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Opłaconych</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingCount}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Oczekujących</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Banknote size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPrice(stats.totalRevenue, 'PLN')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Otrzymano</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-secondary-lighter dark:bg-accent-secondary-darkest/30 rounded-lg">
              <AlertCircle size={20} className="text-accent-secondary dark:text-accent-secondary-light" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPrice(stats.pendingAmount, 'PLN')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Do zapłaty</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 rounded-lg">
              <TrendingUp size={20} className="text-accent-primary dark:text-accent-primary-light" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPrice(stats.thisMonthPaid, 'PLN')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Ten miesiąc</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Wyszukiwanie */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj (uczestnik, email, formularz, referencja)..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
            />
          </div>

          {/* Przyciski */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors ${
                showFilters
                  ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border-accent-primary-light dark:border-accent-primary text-accent-primary dark:text-accent-primary-light'
                  : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
              }`}
            >
              <Filter size={18} />
              Filtry
              {(selectedForm !== 'all' || statusFilter !== 'all' || methodFilter !== 'all' || dateRange.from || dateRange.to) && (
                <span className="w-2 h-2 bg-accent-primary-light rounded-full"></span>
              )}
            </button>

            <button
              onClick={fetchAllPayments}
              className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              title="Odśwież"
            >
              <RefreshCw size={18} />
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Download size={18} />
              Eksportuj
            </button>
          </div>
        </div>

        {/* Rozwinięte filtry */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Formularz
              </label>
              <select
                value={selectedForm}
                onChange={(e) => setSelectedForm(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              >
                <option value="all">Wszystkie</option>
                {uniqueForms.map(form => (
                  <option key={form.id} value={form.id}>{form.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              >
                <option value="all">Wszystkie</option>
                <option value="paid">Opłacone</option>
                <option value="pending">Oczekujące</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Metoda płatności
              </label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              >
                <option value="all">Wszystkie</option>
                <option value="transfer">Przelew</option>
                <option value="paypal">PayPal</option>
                <option value="przelewy24">Przelewy24</option>
                <option value="cash">Gotówka</option>
                <option value="card">Karta</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Data od
              </label>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Data do
              </label>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Sortuj
              </label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                >
                  <option value="date">Data</option>
                  <option value="name">Uczestnik</option>
                  <option value="amount">Kwota</option>
                  <option value="status">Status</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400"
                >
                  {sortOrder === 'asc' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>

            {(selectedForm !== 'all' || statusFilter !== 'all' || methodFilter !== 'all' || dateRange.from || dateRange.to) && (
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSelectedForm('all');
                    setStatusFilter('all');
                    setMethodFilter('all');
                    setDateRange({ from: '', to: '' });
                  }}
                  className="px-3 py-2 text-sm text-accent-primary dark:text-accent-primary-light hover:bg-accent-primary-lightest dark:hover:bg-accent-primary-darkest/20 rounded-lg transition-colors"
                >
                  Wyczyść filtry
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista platnosci */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery || selectedForm !== 'all' || statusFilter !== 'all'
                ? 'Brak płatności spełniających kryteria'
                : 'Brak zarejestrowanych płatności'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Uczestnik
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Formularz
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Kwota
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Metoda
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-full flex items-center justify-center text-white font-semibold">
                          {payment.participantName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {payment.participantName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {payment.participantEmail}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">
                        <FileText size={14} />
                        {payment.formTitle}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatPrice(payment.amount, payment.currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(payment.status)}
                    </td>
                    <td className="px-4 py-3">
                      {getMethodBadge(payment.method)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      <div>
                        <p>{formatDate(payment.submittedAt)}</p>
                        {payment.paidAt && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Opłacono: {formatDate(payment.paidAt)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {payment.status === 'pending' ? (
                          <button
                            onClick={() => markAsPaid(payment.id)}
                            className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                            title="Oznacz jako opłacone"
                          >
                            <Check size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={() => markAsPending(payment.id)}
                            className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                            title="Cofnij płatność"
                          >
                            <Clock size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedPayment(payment)}
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Szczegóły"
                        >
                          <Edit2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal szczegółów/edycji płatności */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Szczegóły płatności
              </h3>
              <button
                onClick={() => setSelectedPayment(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-auto max-h-[calc(90vh-140px)] space-y-6">
              {/* Uczestnik */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-xl flex items-center justify-center text-white text-xl font-bold">
                  {selectedPayment.participantName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {selectedPayment.participantName}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedPayment.participantEmail}
                  </p>
                </div>
              </div>

              {/* Kwota i status */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {formatPrice(selectedPayment.amount, selectedPayment.currency)}
                  </p>
                  {getStatusBadge(selectedPayment.status)}
                </div>
                <div className="flex gap-2">
                  {selectedPayment.status === 'pending' ? (
                    <button
                      onClick={() => markAsPaid(selectedPayment.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                    >
                      <Check size={18} />
                      Oznacz jako opłacone
                    </button>
                  ) : (
                    <button
                      onClick={() => markAsPending(selectedPayment.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                    >
                      <Clock size={18} />
                      Cofnij płatność
                    </button>
                  )}
                </div>
              </div>

              {/* Szczegóły */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Formularz
                  </label>
                  <p className="text-gray-900 dark:text-white">{selectedPayment.formTitle}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Metoda płatności
                  </label>
                  <select
                    value={selectedPayment.method}
                    onChange={(e) => updatePayment(selectedPayment.id, { method: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="transfer">Przelew bankowy</option>
                    <option value="paypal">PayPal</option>
                    <option value="przelewy24">Przelewy24</option>
                    <option value="cash">Gotówka</option>
                    <option value="card">Karta</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Numer referencyjny / ID transakcji
                  </label>
                  <input
                    type="text"
                    value={selectedPayment.reference || ''}
                    onChange={(e) => {
                      setSelectedPayment(prev => ({ ...prev, reference: e.target.value }));
                    }}
                    onBlur={(e) => updatePayment(selectedPayment.id, { reference: e.target.value })}
                    placeholder="np. numer przelewu lub ID PayPal"
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Notatki
                  </label>
                  <textarea
                    value={selectedPayment.notes || ''}
                    onChange={(e) => {
                      setSelectedPayment(prev => ({ ...prev, notes: e.target.value }));
                    }}
                    onBlur={(e) => updatePayment(selectedPayment.id, { notes: e.target.value })}
                    placeholder="Dodatkowe informacje o płatności..."
                    rows={3}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Data rejestracji
                    </label>
                    <p className="text-gray-900 dark:text-white">
                      {formatDate(selectedPayment.submittedAt)}
                    </p>
                  </div>
                  {selectedPayment.paidAt && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Data płatności
                      </label>
                      <p className="text-green-600 dark:text-green-400">
                        {formatDate(selectedPayment.paidAt)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal dodawania płatności */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Banknote size={20} className="text-green-500" />
                Dodaj płatność
              </h2>
              <button onClick={() => setShowAddModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!selectedUnpaid ? (
                <>
                  {/* Wyszukiwarka uczestników */}
                  <div className="relative mb-3">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" value={unpaidSearch} onChange={(e) => setUnpaidSearch(e.target.value)}
                      placeholder="Szukaj uczestnika..."
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                  </div>

                  {loadingUnpaid ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {unpaidParticipants
                        .filter(p => !unpaidSearch || p.name.toLowerCase().includes(unpaidSearch.toLowerCase()) || p.email?.toLowerCase().includes(unpaidSearch.toLowerCase()) || p.formTitle.toLowerCase().includes(unpaidSearch.toLowerCase()))
                        .map(p => (
                        <button key={p.id} onClick={() => { setSelectedUnpaid(p); setAddPaymentAmount(String(p.amount - (p.paidAmount || 0))); }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left">
                          <div className="w-9 h-9 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 flex items-center justify-center text-sm font-semibold text-accent-primary">
                            {(p.name || '?')[0]?.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                            <p className="text-xs text-gray-500 truncate">{p.formTitle}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatPrice(p.amount, p.currency)}</p>
                            {p.paidAmount > 0 && (
                              <p className="text-[10px] text-orange-500">wpłacono {formatPrice(p.paidAmount, p.currency)}</p>
                            )}
                          </div>
                        </button>
                      ))}
                      {unpaidParticipants.filter(p => !unpaidSearch || p.name.toLowerCase().includes(unpaidSearch.toLowerCase()) || p.email?.toLowerCase().includes(unpaidSearch.toLowerCase())).length === 0 && (
                        <p className="text-center text-sm text-gray-400 py-8">Brak nieopłaconych uczestników</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Wybrany uczestnik */}
                  <button onClick={() => setSelectedUnpaid(null)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3">
                    <ChevronDown size={14} className="rotate-90" />Zmień uczestnika
                  </button>

                  <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 flex items-center justify-center text-sm font-bold text-accent-primary">
                        {(selectedUnpaid.name || '?')[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">{selectedUnpaid.name}</p>
                        <p className="text-xs text-gray-500">{selectedUnpaid.formTitle}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatPrice(selectedUnpaid.amount, selectedUnpaid.currency)}</p>
                        {selectedUnpaid.paidAmount > 0 && (
                          <p className="text-[10px] text-green-500">wpłacono {formatPrice(selectedUnpaid.paidAmount, selectedUnpaid.currency)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Kwota wpłaty ({selectedUnpaid.currency})
                      </label>
                      <input type="number" min="0" step="0.01" value={addPaymentAmount}
                        onChange={(e) => setAddPaymentAmount(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Data płatności
                      </label>
                      <input type="date" value={addPaymentDate}
                        onChange={(e) => setAddPaymentDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {selectedUnpaid && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                <button onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 transition-colors">
                  Anuluj
                </button>
                <button onClick={handleAddPayment}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center gap-2">
                  <Check size={16} />Potwierdź płatność
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
