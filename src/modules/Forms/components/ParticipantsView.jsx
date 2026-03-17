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
  XCircle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatPrice } from '../utils/fieldTypes';

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
      const processedParticipants = (data || []).map(response => {
        const form = response.forms;
        const answers = response.answers || {};

        // Znajdz dane kontaktowe w odpowiedziach
        let email = response.respondent_email || '';
        let name = response.respondent_name || '';
        let phone = '';

        if (form?.fields) {
          form.fields.forEach(field => {
            const value = answers[field.id];
            if (!value) return;

            if (field.type === 'email' && !email) {
              email = value;
            }
            if (field.type === 'phone' && !phone) {
              phone = value;
            }
            if (field.type === 'text' && !name) {
              const label = field.label?.toLowerCase() || '';
              if (label.includes('imie') || label.includes('imię') || label.includes('name') || label.includes('nazwisko')) {
                name = value;
              }
            }
          });
        }

        // Oblicz kwote i status platnosci
        let totalAmount = 0;
        let paymentStatus = 'none'; // none, pending, paid
        let paymentMethod = null;

        if (form?.settings?.pricing?.enabled) {
          // Sprawdz czy jest pole price
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

          // Sprawdz dane platnosci z odpowiedzi
          if (answers._payment) {
            paymentMethod = answers._payment.method;
            paymentStatus = answers._payment.status === 'completed' ? 'paid' : 'pending';
          } else if (totalAmount > 0) {
            paymentStatus = 'pending';
          }
        }

        return {
          id: response.id,
          formId: response.form_id,
          formTitle: form?.title || 'Nieznany formularz',
          name: name || 'Anonim',
          email,
          phone,
          submittedAt: response.submitted_at,
          answers,
          fields: form?.fields || [],
          settings: form?.settings || {},
          totalAmount,
          paymentStatus,
          paymentMethod,
          currency: form?.settings?.pricing?.currency || 'PLN'
        };
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
    const pending = participants.filter(p => p.paymentStatus === 'pending').length;
    const totalRevenue = participants
      .filter(p => p.paymentStatus === 'paid')
      .reduce((sum, p) => sum + p.totalAmount, 0);
    const pendingRevenue = participants
      .filter(p => p.paymentStatus === 'pending')
      .reduce((sum, p) => sum + p.totalAmount, 0);

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

  // Aktualizacja statusu platnosci
  const updatePaymentStatus = async (participantId, newStatus) => {
    try {
      const participant = participants.find(p => p.id === participantId);
      if (!participant) return;

      const updatedAnswers = {
        ...participant.answers,
        _payment: {
          ...(participant.answers._payment || {}),
          status: newStatus === 'paid' ? 'completed' : 'pending',
          updatedAt: new Date().toISOString()
        }
      };

      const { error } = await supabase
        .from('form_responses')
        .update({ answers: updatedAnswers })
        .eq('id', participantId);

      if (error) throw error;

      // Aktualizuj lokalny stan
      setParticipants(prev => prev.map(p =>
        p.id === participantId
          ? { ...p, paymentStatus: newStatus, answers: updatedAnswers }
          : p
      ));

      if (selectedParticipant?.id === participantId) {
        setSelectedParticipant(prev => ({
          ...prev,
          paymentStatus: newStatus,
          answers: updatedAnswers
        }));
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      alert('Wystąpił błąd podczas aktualizacji statusu płatności');
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

  const getPaymentStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
            <CheckCircle size={12} />
            Opłacone
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
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-pink-200 border-t-pink-500"></div>
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
              <p className="text-xs text-gray-500 dark:text-gray-400">Wszystkich uczestników</p>
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
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Oczekuje na płatność</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
              <DollarSign size={20} className="text-pink-600 dark:text-pink-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPrice(stats.totalRevenue, 'PLN')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Otrzymane wpłaty</p>
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
              placeholder="Szukaj uczestnika (imię, email, telefon)..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500"
            />
          </div>

          {/* Filtry */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors ${
                showFilters
                  ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-300 dark:border-pink-700 text-pink-600 dark:text-pink-400'
                  : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
              }`}
            >
              <Filter size={18} />
              Filtry
              {(selectedForm !== 'all' || paymentFilter !== 'all') && (
                <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
              )}
            </button>

            <button
              onClick={fetchAllParticipants}
              className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              title="Odśwież"
            >
              <RefreshCw size={18} />
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-pink-500/25 transition-all"
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
                Status płatności
              </label>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              >
                <option value="all">Wszystkie</option>
                <option value="paid">Opłacone</option>
                <option value="pending">Oczekujące</option>
                <option value="none">Bez płatności</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Sortuj według
              </label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                >
                  <option value="date">Data</option>
                  <option value="name">Imię</option>
                  <option value="form">Formularz</option>
                  <option value="amount">Kwota</option>
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
                        <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-orange-400 rounded-full flex items-center justify-center text-white font-semibold">
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
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatPrice(participant.totalAmount, participant.currency)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getPaymentStatusBadge(participant.paymentStatus)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedParticipant(participant);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <Eye size={18} />
                      </button>
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
                Szczegóły uczestnika
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
                <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-orange-400 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
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
                        <a href={`mailto:${selectedParticipant.email}`} className="hover:text-pink-500">
                          {selectedParticipant.email}
                        </a>
                      </div>
                    )}
                    {selectedParticipant.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Phone size={16} />
                        <a href={`tel:${selectedParticipant.phone}`} className="hover:text-pink-500">
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
                      Płatność
                    </div>
                    {getPaymentStatusBadge(selectedParticipant.paymentStatus)}
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
                          Oznacz jako opłacone
                        </button>
                      )}
                      {selectedParticipant.paymentStatus === 'paid' && (
                        <button
                          onClick={() => updatePaymentStatus(selectedParticipant.id, 'pending')}
                          className="flex items-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                        >
                          <Clock size={16} />
                          Cofnij płatność
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
    </div>
  );
}
