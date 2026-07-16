import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  User,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  FileText,
  X,
  Check,
  Clock,
  AlertCircle,
  Eye,
  MoreVertical,
  RefreshCw,
  Users,
  CreditCard,
  CheckCircle,
  XCircle,
  Banknote
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatPrice } from '../utils/fieldTypes';
import { tr } from '../../../i18n';

export default function ParticipantsView({ forms }) {
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForm, setSelectedForm] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [paymentModal, setPaymentModal] = useState(null); // { participantId, amount, currency }
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  // Pobierz wszystkich uczestników
  useEffect(() => {
    fetchAllParticipants();
  }, []);

  const fetchAllParticipants = async () => {
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

      // Przetworz dane uczestnikow
      const processedParticipants = [];
      (data || []).forEach(response => {
        const form = response.forms;
        const answers = response.answers || {};

        // Helper: extract contact info from answers object
        const extractContactInfo = (answerObj, formFields) => {
          let email = '';
          let firstName = '';
          let lastName = '';
          let phone = '';
          if (formFields) {
            formFields.forEach(field => {
              const value = answerObj[field.id];
              if (!value) return;
              if (field.type === 'email' && !email) email = value;
              if (field.type === 'phone' && !phone) phone = value;
              if (field.type === 'text') {
                const label = field.label?.toLowerCase() || '';
                if ((label.includes('imie') || label.includes('imię')) && !label.includes('nazwisko')) {
                  if (!firstName) firstName = value;
                } else if (label.includes('nazwisko')) {
                  if (!lastName) lastName = value;
                } else if (label.includes('name') && !firstName) {
                  firstName = value;
                }
              }
            });
          }
          const name = [firstName, lastName].filter(Boolean).join(' ');
          return { email, name, phone };
        };

        // Oblicz kwote i status platnosci
        let totalAmount = answers._totalPrice || 0;
        let paymentStatus = 'none';
        let paymentMethod = null;

        if (form?.settings?.pricing?.enabled) {
          // Priorytet: _totalPrice z odpowiedzi > _priceBreakdown.grandTotal > basePrice
          if (!totalAmount) {
            if (answers._priceBreakdown?.grandTotal) {
              totalAmount = answers._priceBreakdown.grandTotal;
            } else {
              const priceField = form.fields?.find(f => f.type === 'price');
              if (priceField?.priceConfig?.basePrice) {
                totalAmount = priceField.priceConfig.basePrice;
              }
            }
          }

          if (answers._payment) {
            paymentMethod = answers._payment.method;
            paymentStatus = answers._payment.status === 'completed' ? 'paid' : 'pending';
          } else if (totalAmount > 0 && !answers._isWaitlist) {
            paymentStatus = 'pending';
          }
        }

        const baseParticipant = {
          formId: response.form_id,
          formTitle: form?.title || 'Nieznany formularz',
          submittedAt: response.submitted_at,
          fields: form?.fields || [],
          settings: form?.settings || {},
          totalAmount,
          paymentStatus,
          paymentMethod,
          currency: form?.settings?.pricing?.currency || 'PLN'
        };

        // Rejestracja grupowa — rozwiń na poszczególnych uczestników
        if (answers._registrationMode === 'group') {
          const groupSize = (answers._participants?.length || 0) + (answers._contactPerson ? 1 : 0);
          const breakdown = answers._priceBreakdown || {};
          const basePerPerson = breakdown.baseUnitPrice || 0;
          // Rabat per osoba (równy podział)
          const discountPerPerson = groupSize > 0 ? (breakdown.discountTotal || 0) / groupSize : 0;
          // Addons konfiguracja
          const addonsItems = form?.settings?.addons?.items || [];

          // Oblicz kwotę per osoba z addons
          const calcPersonAmount = (personAddons) => {
            let amount = basePerPerson;
            if (personAddons) {
              Object.entries(personAddons).forEach(([addonId, qty]) => {
                if (qty > 0) {
                  const addon = addonsItems.find(a => a.id === addonId);
                  if (addon) amount += addon.price * qty;
                }
              });
            }
            return Math.max(0, amount - discountPerPerson);
          };

          // Opis addons osoby
          const getAddonLabels = (personAddons) => {
            if (!personAddons) return [];
            return Object.entries(personAddons)
              .filter(([, qty]) => qty > 0)
              .map(([addonId]) => {
                const addon = addonsItems.find(a => a.id === addonId);
                return addon ? addon.name : null;
              })
              .filter(Boolean);
          };

          // Status płatności per osoba
          const getPersonPaymentInfo = (personAnswers) => {
            if (answers._isWaitlist) return { status: 'none', paidAmount: 0 };
            const payment = personAnswers?._payment;
            const totalPaid = payment?.totalPaid || 0;
            if (payment?.status === 'completed') return { status: 'paid', paidAmount: totalPaid };
            if (payment?.status === 'partial') return { status: 'partial', paidAmount: totalPaid };
            const amt = calcPersonAmount(personAnswers?._addons || {});
            return { status: amt > 0 ? 'pending' : 'none', paidAmount: 0 };
          };

          // Osoba zgłaszająca
          if (answers._contactPerson) {
            const contact = extractContactInfo(answers._contactPerson, form?.fields);
            const personAddons = answers._contactPerson._addons || {};
            processedParticipants.push({
              ...baseParticipant,
              id: `${response.id}-contact`,
              responseId: response.id,
              name: contact.name || response.respondent_name || 'Osoba zgłaszająca',
              email: contact.email || response.respondent_email || '',
              phone: contact.phone,
              answers: answers._contactPerson,
              isGroupContact: true,
              groupSize,
              totalAmount: calcPersonAmount(personAddons),
              addonLabels: getAddonLabels(personAddons),
              groupTotalAmount: totalAmount,
              ...getPersonPaymentInfo(answers._contactPerson)
            });
          }

          // Członkowie zespołu
          (answers._participants || []).forEach((participant, idx) => {
            const pContact = extractContactInfo(participant, form?.fields);
            const personAddons = participant._addons || {};
            const payInfo = getPersonPaymentInfo(participant);
            processedParticipants.push({
              ...baseParticipant,
              id: `${response.id}-p${idx}`,
              responseId: response.id,
              name: pContact.name || `Uczestnik ${idx + 1}`,
              email: pContact.email,
              phone: pContact.phone,
              answers: participant,
              isGroupMember: true,
              groupSize,
              totalAmount: calcPersonAmount(personAddons),
              addonLabels: getAddonLabels(personAddons),
              ...payInfo
            });
          });
        } else {
          // Zwykła rejestracja (nie grupowa)
          const contact = extractContactInfo(answers, form?.fields);
          processedParticipants.push({
            ...baseParticipant,
            id: response.id,
            responseId: response.id,
            name: contact.name || response.respondent_name || 'Anonim',
            email: contact.email || response.respondent_email || '',
            phone: contact.phone,
            answers
          });
        }
      });

      setParticipants(processedParticipants);
    } catch (error) {
      console.error('Error fetching participants:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrowanie i sortowanie
  const filteredParticipants = useMemo(() => {
    let result = [...participants];

    // Filtr wyszukiwania
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.email.toLowerCase().includes(query) ||
        p.phone.includes(query) ||
        p.formTitle.toLowerCase().includes(query)
      );
    }

    // Filtr formularza
    if (selectedForm !== 'all') {
      result = result.filter(p => p.formId === selectedForm);
    }

    // Filtr platnosci
    if (paymentFilter !== 'all') {
      result = result.filter(p => p.paymentStatus === paymentFilter);
    }

    // Sortowanie
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.submittedAt) - new Date(b.submittedAt);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'form':
          comparison = a.formTitle.localeCompare(b.formTitle);
          break;
        case 'amount':
          comparison = a.totalAmount - b.totalAmount;
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [participants, searchQuery, selectedForm, paymentFilter, sortBy, sortOrder]);

  // Statystyki
  const stats = useMemo(() => {
    const total = participants.length;
    const withPayment = participants.filter(p => p.totalAmount > 0).length;
    const paid = participants.filter(p => p.paymentStatus === 'paid').length;
    const pending = participants.filter(p => p.paymentStatus === 'pending' || p.paymentStatus === 'partial').length;
    const totalRevenue = participants
      .filter(p => p.paymentStatus === 'paid')
      .reduce((sum, p) => sum + p.totalAmount, 0)
      + participants
      .filter(p => p.paymentStatus === 'partial')
      .reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    const pendingRevenue = participants
      .filter(p => p.paymentStatus === 'pending' || p.paymentStatus === 'partial')
      .reduce((sum, p) => sum + p.totalAmount - (p.paidAmount || 0), 0);

    return { total, withPayment, paid, pending, totalRevenue, pendingRevenue };
  }, [participants]);

  // Unikalne formularze dla filtrow
  const uniqueForms = useMemo(() => {
    const formMap = new Map();
    participants.forEach(p => {
      if (!formMap.has(p.formId)) {
        formMap.set(p.formId, p.formTitle);
      }
    });
    return Array.from(formMap, ([id, title]) => ({ id, title }));
  }, [participants]);

  // Eksport do CSV
  const exportToCSV = () => {
    const headers = ['Imię/Nazwa', 'Email', 'Telefon', 'Formularz', 'Data rejestracji', 'Kwota', 'Status płatności'];
    const rows = filteredParticipants.map(p => [
      p.name,
      p.email,
      p.phone,
      p.formTitle,
      new Date(p.submittedAt).toLocaleDateString('pl-PL'),
      p.totalAmount > 0 ? formatPrice(p.totalAmount, p.currency) : '-',
      p.paymentStatus === 'paid' ? 'Opłacone' : p.paymentStatus === 'pending' ? 'Oczekuje' : '-'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `uczestnicy_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Aktualizacja statusu platnosci (obsługuje też członków grupy)
  const updatePaymentStatus = async (participantId, newStatus) => {
    try {
      const participant = participants.find(p => p.id === participantId);
      if (!participant) return;

      const responseId = participant.responseId || participantId;
      const paymentUpdate = {
        status: newStatus === 'paid' ? 'completed' : 'pending',
        updatedAt: new Date().toISOString()
      };

      // Pobierz aktualną odpowiedź z bazy
      const { data: responseData, error: fetchError } = await supabase
        .from('form_responses')
        .select('answers')
        .eq('id', responseId)
        .single();

      if (fetchError) throw fetchError;

      const fullAnswers = responseData.answers;

      if (participant.isGroupContact) {
        // Osoba kontaktowa — aktualizuj _contactPerson._payment
        fullAnswers._contactPerson = {
          ...fullAnswers._contactPerson,
          _payment: { ...(fullAnswers._contactPerson?._payment || {}), ...paymentUpdate }
        };
      } else if (participant.isGroupMember) {
        // Członek grupy — znajdź indeks i aktualizuj _participants[idx]._payment
        const pIdx = parseInt(participantId.split('-p').pop());
        if (fullAnswers._participants && fullAnswers._participants[pIdx]) {
          fullAnswers._participants[pIdx] = {
            ...fullAnswers._participants[pIdx],
            _payment: { ...(fullAnswers._participants[pIdx]._payment || {}), ...paymentUpdate }
          };
        }
      } else {
        // Zwykła rejestracja
        fullAnswers._payment = { ...(fullAnswers._payment || {}), ...paymentUpdate };
      }

      const { error } = await supabase
        .from('form_responses')
        .update({ answers: fullAnswers })
        .eq('id', responseId);

      if (error) throw error;

      // Aktualizuj lokalny stan
      setParticipants(prev => prev.map(p =>
        p.id === participantId
          ? { ...p, paymentStatus: newStatus }
          : p
      ));

      if (selectedParticipant?.id === participantId) {
        setSelectedParticipant(prev => ({
          ...prev,
          paymentStatus: newStatus
        }));
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      alert('Wystąpił błąd podczas aktualizacji statusu płatności');
    }
  };

  const addPayment = async () => {
    if (!paymentModal) return;
    try {
      const participant = participants.find(p => p.id === paymentModal.participantId);
      if (!participant) return;

      const responseId = participant.responseId || paymentModal.participantId;

      const { data: responseData, error: fetchError } = await supabase
        .from('form_responses')
        .select('answers')
        .eq('id', responseId)
        .single();

      if (fetchError) throw fetchError;

      const fullAnswers = responseData.answers;
      const paidAmount = parseFloat(paymentAmount) || 0;
      const dueAmount = participant.totalAmount || 0;

      // Pobierz wcześniejsze wpłaty
      const getExistingPayment = (personAnswers) => personAnswers?._payment || {};
      let existingPayment;
      if (participant.isGroupContact) {
        existingPayment = getExistingPayment(fullAnswers._contactPerson);
      } else if (participant.isGroupMember) {
        const pIdx = parseInt(paymentModal.participantId.split('-p').pop());
        existingPayment = getExistingPayment(fullAnswers._participants?.[pIdx]);
      } else {
        existingPayment = getExistingPayment(fullAnswers);
      }

      const previousPaid = existingPayment.totalPaid || 0;
      const totalPaid = previousPaid + paidAmount;
      const isFullyPaid = totalPaid >= dueAmount;

      const payments = [...(existingPayment.payments || []), {
        amount: paidAmount,
        date: paymentDate,
        method: 'manual',
        addedAt: new Date().toISOString()
      }];

      const paymentData = {
        status: isFullyPaid ? 'completed' : 'partial',
        totalPaid,
        dueAmount,
        payments,
        updatedAt: new Date().toISOString()
      };

      if (participant.isGroupContact) {
        fullAnswers._contactPerson = {
          ...fullAnswers._contactPerson,
          _payment: paymentData
        };
      } else if (participant.isGroupMember) {
        const pIdx = parseInt(paymentModal.participantId.split('-p').pop());
        if (fullAnswers._participants?.[pIdx]) {
          fullAnswers._participants[pIdx] = {
            ...fullAnswers._participants[pIdx],
            _payment: paymentData
          };
        }
      } else {
        fullAnswers._payment = paymentData;
      }

      const { error } = await supabase
        .from('form_responses')
        .update({ answers: fullAnswers })
        .eq('id', responseId);

      if (error) throw error;

      const newStatus = isFullyPaid ? 'paid' : 'partial';
      setParticipants(prev => prev.map(p =>
        p.id === paymentModal.participantId
          ? { ...p, paymentStatus: newStatus, paidAmount: totalPaid }
          : p
      ));

      if (selectedParticipant?.id === paymentModal.participantId) {
        setSelectedParticipant(prev => ({ ...prev, paymentStatus: newStatus, paidAmount: totalPaid }));
      }

      setPaymentModal(null);
      setPaymentAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('Error adding payment:', error);
      alert('Wystąpił błąd podczas dodawania płatności');
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentStatusBadge = (status, paidAmount, dueAmount) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
            <CheckCircle size={12} />
            {tr('Opłacone')}
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full text-xs font-medium">
            <AlertCircle size={12} />
            {tr('Częściowo')}
            {paidAmount > 0 && dueAmount > 0 && (
              <span className="text-[10px] font-normal ml-0.5">
                ({formatPrice(paidAmount, 'PLN')}/{formatPrice(dueAmount, 'PLN')})
              </span>
            )}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
            <Clock size={12} />
            Oczekuje
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full text-xs font-medium">
            -
          </span>
        );
    }
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
      {/* Statystyki */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Wszystkich uczestników')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.paid}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Opłaconych')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock size={20} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Oczekuje na płatność')}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 rounded-lg">
              <DollarSign size={20} className="text-accent-primary dark:text-accent-primary-light" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPrice(stats.totalRevenue, 'PLN')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Otrzymane wpłaty')}</p>
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
              placeholder={tr('Szukaj uczestnika (imię, email, telefon)...')}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
            />
          </div>

          {/* Filtry */}
          <div className="flex items-center gap-2">
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
              {(selectedForm !== 'all' || paymentFilter !== 'all') && (
                <span className="w-2 h-2 bg-accent-primary-light rounded-full"></span>
              )}
            </button>

            <button
              onClick={fetchAllParticipants}
              className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              title={tr('Odśwież')}
            >
              <RefreshCw size={18} />
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-xl font-medium hover:shadow-lg hover:shadow-accent-primary-light/25 transition-all"
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
                <option value="all">Wszystkie formularze</option>
                {uniqueForms.map(form => (
                  <option key={form.id} value={form.id}>{form.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {tr('Status płatności')}
              </label>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              >
                <option value="all">{tr('Wszystkie')}</option>
                <option value="paid">{tr('Opłacone')}</option>
                <option value="pending">{tr('Oczekujące')}</option>
                <option value="none">{tr('Bez płatności')}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {tr('Sortuj według')}
              </label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                >
                  <option value="date">{tr('Data')}</option>
                  <option value="name">{tr('Imię')}</option>
                  <option value="form">Formularz</option>
                  <option value="amount">{tr('Kwota')}</option>
                </select>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400"
                >
                  {sortOrder === 'asc' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Lista uczestników */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredParticipants.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery || selectedForm !== 'all' || paymentFilter !== 'all'
                ? 'Brak uczestników spełniających kryteria'
                : 'Brak zarejestrowanych uczestników'}
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
                    Kontakt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Formularz
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Kwota
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredParticipants.map((participant) => (
                  <tr
                    key={participant.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedParticipant(participant)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-full flex items-center justify-center text-white font-semibold">
                          {participant.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {participant.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {participant.email && (
                          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                            <Mail size={14} />
                            {participant.email}
                          </div>
                        )}
                        {participant.phone && (
                          <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                            <Phone size={14} />
                            {participant.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">
                        <FileText size={14} />
                        {participant.formTitle}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(participant.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {participant.totalAmount > 0 ? (
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {formatPrice(participant.totalAmount, participant.currency)}
                          </span>
                          {participant.addonLabels?.length > 0 && (
                            <div className="text-[10px] text-purple-500 mt-0.5">
                              {participant.addonLabels.join(', ')}
                            </div>
                          )}
                          {participant.isGroupContact && participant.groupTotalAmount > 0 && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              Grupa: {formatPrice(participant.groupTotalAmount, participant.currency)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getPaymentStatusBadge(participant.paymentStatus, participant.paidAmount, participant.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {participant.totalAmount > 0 && (participant.paymentStatus === 'pending' || participant.paymentStatus === 'partial') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPaymentModal({
                                participantId: participant.id,
                                amount: participant.totalAmount,
                                currency: participant.currency,
                                name: participant.name
                              });
                              setPaymentAmount(String(participant.totalAmount));
                            }}
                            className="p-2 text-green-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                            title={tr('Dodaj płatność')}
                          >
                            <Banknote size={18} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedParticipant(participant);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          <Eye size={18} />
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

      {/* Modal szczegółów uczestnika */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {tr('Szczegóły uczestnika')}
              </h3>
              <button
                onClick={() => setSelectedParticipant(null)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-auto max-h-[calc(90vh-80px)]">
              {/* Info podstawowe */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                  {selectedParticipant.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedParticipant.name}
                  </h4>
                  <div className="mt-2 space-y-1">
                    {selectedParticipant.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Mail size={16} />
                        <a href={`mailto:${selectedParticipant.email}`} className="hover:text-accent-primary-light">
                          {selectedParticipant.email}
                        </a>
                      </div>
                    )}
                    {selectedParticipant.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Phone size={16} />
                        <a href={`tel:${selectedParticipant.phone}`} className="hover:text-accent-primary-light">
                          {selectedParticipant.phone}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Informacje o formularzu */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
                  <FileText size={16} />
                  Formularz
                </div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {selectedParticipant.formTitle}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Zarejestrowany: {formatDate(selectedParticipant.submittedAt)}
                </p>
              </div>

              {/* Status płatności */}
              {selectedParticipant.totalAmount > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <CreditCard size={16} />
                      {tr('Płatność')}
                    </div>
                    {getPaymentStatusBadge(selectedParticipant.paymentStatus, selectedParticipant.paidAmount, selectedParticipant.totalAmount)}
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatPrice(selectedParticipant.totalAmount, selectedParticipant.currency)}
                      </p>
                      {selectedParticipant.paymentMethod && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Metoda: {selectedParticipant.paymentMethod === 'transfer' ? 'Przelew' :
                            selectedParticipant.paymentMethod === 'paypal' ? 'PayPal' :
                            selectedParticipant.paymentMethod === 'przelewy24' ? 'Przelewy24' :
                            selectedParticipant.paymentMethod === 'cash' ? 'Gotówka' :
                            selectedParticipant.paymentMethod}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {selectedParticipant.paymentStatus !== 'paid' && (
                        <button
                          onClick={() => updatePaymentStatus(selectedParticipant.id, 'paid')}
                          className="flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                        >
                          <Check size={16} />
                          {tr('Oznacz jako opłacone')}
                        </button>
                      )}
                      {selectedParticipant.paymentStatus === 'paid' && (
                        <button
                          onClick={() => updatePaymentStatus(selectedParticipant.id, 'pending')}
                          className="flex items-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                        >
                          <Clock size={16} />
                          {tr('Cofnij płatność')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Odpowiedzi na formularz */}
              <div>
                <h5 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Odpowiedzi
                </h5>
                <div className="space-y-3">
                  {selectedParticipant.fields
                    .filter(f => !['location', 'date_start', 'date_end', 'time_start', 'time_end', 'price', 'seat_limit'].includes(f.type))
                    .map((field) => {
                      const value = selectedParticipant.answers[field.id];
                      if (value === undefined || value === null || value === '') return null;

                      let displayValue = value;
                      if (Array.isArray(value)) {
                        if (field.options) {
                          displayValue = value.map(v => {
                            const option = field.options.find(o => o.value === v);
                            return option ? option.label : v;
                          }).join(', ');
                        } else {
                          displayValue = value.join(', ');
                        }
                      } else if (field.options && (field.type === 'radio' || field.type === 'select')) {
                        const option = field.options.find(o => o.value === value);
                        displayValue = option ? option.label : value;
                      } else if (field.type === 'date') {
                        displayValue = new Date(value).toLocaleDateString('pl-PL');
                      }

                      return (
                        <div
                          key={field.id}
                          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                        >
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            {field.label}
                          </p>
                          <p className="text-gray-900 dark:text-white">
                            {displayValue}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal dodawania płatności */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Banknote size={20} className="text-green-500" />
                {tr('Dodaj płatność')}
              </h2>
              <button
                onClick={() => setPaymentModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="text-sm text-gray-500 dark:text-gray-400">Uczestnik</p>
                <p className="font-medium text-gray-900 dark:text-white">{paymentModal.name}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Kwota ({paymentModal.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {tr('Data płatności')}
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                onClick={() => setPaymentModal(null)}
                className="flex-1 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={addPayment}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
              >
                <Check size={16} />
                {tr('Potwierdź płatność')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
