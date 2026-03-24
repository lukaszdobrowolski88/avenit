import { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  FileText,
  Calendar,
  User,
  Mail,
  Phone,
  CheckCircle,
  Clock,
  AlertCircle,
  Banknote,
  Check,
  DollarSign,
  Search,
  Filter,
  Users
} from 'lucide-react';
import { useFormResponses } from '../hooks/useFormResponses';
import { exportToCSV, exportToJSON, formatAnswerForExport } from '../utils/exportUtils';
import { formatPrice } from '../utils/fieldTypes';
import { supabase } from '../../../lib/supabase';

export default function ResponsesView({ form }) {
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [paymentModal, setPaymentModal] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  const {
    responses,
    loading,
    pagination,
    fetchResponses,
    deleteResponse,
    deleteAllResponses
  } = useFormResponses(form?.id);

  useEffect(() => {
    if (form?.id) {
      fetchResponses();
    }
  }, [form?.id, fetchResponses]);

  // Przetwórz odpowiedzi na uczestników (jak ParticipantsView)
  const participants = useMemo(() => {
    const result = [];
    const fields = form?.fields || [];
    const addonsItems = form?.settings?.addons?.items || [];
    const currency = form?.settings?.pricing?.currency || 'PLN';

    const extractContactInfo = (answerObj) => {
      let email = '', firstName = '', lastName = '', phone = '';
      fields.forEach(field => {
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
      const name = [firstName, lastName].filter(Boolean).join(' ');
      return { email, name, phone };
    };

    (responses || []).forEach(response => {
      const answers = response.answers || {};
      const breakdown = answers._priceBreakdown || {};
      const totalAmount = answers._totalPrice || breakdown.grandTotal || 0;
      const basePerPerson = breakdown.baseUnitPrice || 0;
      const groupSize = answers._registrationMode === 'group'
        ? (answers._participants?.length || 0) + (answers._contactPerson ? 1 : 0)
        : 1;
      const discountPerPerson = groupSize > 0 ? (breakdown.discountTotal || 0) / groupSize : 0;

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

      const getAddonLabels = (personAddons) => {
        if (!personAddons) return [];
        return Object.entries(personAddons)
          .filter(([, qty]) => qty > 0)
          .map(([addonId]) => addonsItems.find(a => a.id === addonId)?.name)
          .filter(Boolean);
      };

      const getPaymentInfo = (personAnswers) => {
        if (answers._isWaitlist) return { status: 'none', paidAmount: 0 };
        const payment = personAnswers?._payment;
        const totalPaid = payment?.totalPaid || 0;
        if (payment?.status === 'completed') return { status: 'paid', paidAmount: totalPaid };
        if (payment?.status === 'partial') return { status: 'partial', paidAmount: totalPaid };
        const amt = calcPersonAmount(personAnswers?._addons || {});
        return { status: amt > 0 ? 'pending' : 'none', paidAmount: 0 };
      };

      if (answers._registrationMode === 'group') {
        if (answers._contactPerson) {
          const contact = extractContactInfo(answers._contactPerson);
          const personAddons = answers._contactPerson._addons || {};
          result.push({
            id: `${response.id}-contact`,
            responseId: response.id,
            name: contact.name || response.respondent_name || 'Osoba zgłaszająca',
            email: contact.email || response.respondent_email || '',
            phone: contact.phone,
            answers: answers._contactPerson,
            submittedAt: response.submitted_at,
            isGroupContact: true,
            groupSize,
            totalAmount: calcPersonAmount(personAddons),
            addonLabels: getAddonLabels(personAddons),
            groupTotalAmount: totalAmount,
            currency,
            ...getPaymentInfo(answers._contactPerson)
          });
        }

        (answers._participants || []).forEach((participant, idx) => {
          const pContact = extractContactInfo(participant);
          const personAddons = participant._addons || {};
          result.push({
            id: `${response.id}-p${idx}`,
            responseId: response.id,
            name: pContact.name || `Uczestnik ${idx + 1}`,
            email: pContact.email,
            phone: pContact.phone,
            answers: participant,
            submittedAt: response.submitted_at,
            isGroupMember: true,
            groupSize,
            totalAmount: calcPersonAmount(personAddons),
            addonLabels: getAddonLabels(personAddons),
            currency,
            ...getPaymentInfo(participant)
          });
        });
      } else {
        const contact = extractContactInfo(answers);
        const personAddons = answers._addons || {};
        const payInfo = getPaymentInfo(answers);
        result.push({
          id: response.id,
          responseId: response.id,
          name: contact.name || response.respondent_name || 'Anonim',
          email: contact.email || response.respondent_email || '',
          phone: contact.phone,
          answers,
          submittedAt: response.submitted_at,
          totalAmount: totalAmount || calcPersonAmount(personAddons),
          addonLabels: getAddonLabels(personAddons),
          currency,
          ...payInfo
        });
      }
    });

    return result;
  }, [responses, form]);

  // Filtrowanie
  const filteredParticipants = useMemo(() => {
    let list = [...participants];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.phone?.includes(q)
      );
    }
    if (paymentFilter !== 'all') {
      list = list.filter(p => p.status === paymentFilter);
    }
    return list;
  }, [participants, searchQuery, paymentFilter]);

  // Statystyki
  const stats = useMemo(() => {
    const total = participants.length;
    const paid = participants.filter(p => p.status === 'paid').length;
    const pending = participants.filter(p => p.status === 'pending' || p.status === 'partial').length;
    const totalRevenue = participants.filter(p => p.status === 'paid').reduce((s, p) => s + p.totalAmount, 0)
      + participants.filter(p => p.status === 'partial').reduce((s, p) => s + (p.paidAmount || 0), 0);
    return { total, paid, pending, totalRevenue };
  }, [participants]);

  const handleDeleteResponse = async (responseId) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę odpowiedź?')) {
      await deleteResponse(responseId);
      setSelectedParticipant(null);
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm('Czy na pewno chcesz usunąć wszystkie odpowiedzi? Ta operacja jest nieodwracalna.')) {
      await deleteAllResponses();
    }
  };

  const addPayment = async () => {
    if (!paymentModal) return;
    try {
      const participant = participants.find(p => p.id === paymentModal.participantId);
      if (!participant) return;

      const responseId = participant.responseId;
      const { data: responseData, error: fetchError } = await supabase
        .from('form_responses')
        .select('answers')
        .eq('id', responseId)
        .single();

      if (fetchError) throw fetchError;

      const fullAnswers = responseData.answers;
      const paidAmount = parseFloat(paymentAmount) || 0;
      const dueAmount = participant.totalAmount || 0;

      const getExisting = (pa) => pa?._payment || {};
      let existing;
      if (participant.isGroupContact) existing = getExisting(fullAnswers._contactPerson);
      else if (participant.isGroupMember) {
        const idx = parseInt(paymentModal.participantId.split('-p').pop());
        existing = getExisting(fullAnswers._participants?.[idx]);
      } else existing = getExisting(fullAnswers);

      const totalPaid = (existing.totalPaid || 0) + paidAmount;
      const payments = [...(existing.payments || []), {
        amount: paidAmount, date: paymentDate, method: 'manual', addedAt: new Date().toISOString()
      }];
      const paymentData = {
        status: totalPaid >= dueAmount ? 'completed' : 'partial',
        totalPaid, dueAmount, payments, updatedAt: new Date().toISOString()
      };

      if (participant.isGroupContact) {
        fullAnswers._contactPerson = { ...fullAnswers._contactPerson, _payment: paymentData };
      } else if (participant.isGroupMember) {
        const idx = parseInt(paymentModal.participantId.split('-p').pop());
        if (fullAnswers._participants?.[idx]) {
          fullAnswers._participants[idx] = { ...fullAnswers._participants[idx], _payment: paymentData };
        }
      } else {
        fullAnswers._payment = paymentData;
      }

      await supabase.from('form_responses').update({ answers: fullAnswers }).eq('id', responseId);
      fetchResponses(pagination.page);
      setPaymentModal(null);
      setPaymentAmount('');
      setPaymentDate(new Date().toISOString().split('T')[0]);
    } catch (error) {
      console.error('Error adding payment:', error);
      alert('Wystąpił błąd podczas dodawania płatności');
    }
  };

  const handleExportCSV = () => { exportToCSV(form, responses); setShowExportMenu(false); };
  const handleExportJSON = () => { exportToJSON(form, responses); setShowExportMenu(false); };

  const formatDate = (dateString) => new Date(dateString).toLocaleString('pl-PL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const getPaymentStatusBadge = (status, paidAmt, dueAmt) => {
    switch (status) {
      case 'paid':
        return (<span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium"><CheckCircle size={12} />Opłacone</span>);
      case 'partial':
        return (<span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full text-xs font-medium"><AlertCircle size={12} />Częściowo{paidAmt > 0 && dueAmt > 0 && <span className="text-[10px] font-normal ml-0.5">({formatPrice(paidAmt, 'PLN')}/{formatPrice(dueAmt, 'PLN')})</span>}</span>);
      case 'pending':
        return (<span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium"><Clock size={12} />Oczekuje</span>);
      default:
        return (<span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full text-xs font-medium">-</span>);
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  if (loading && responses.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary-light"></div>
      </div>
    );
  }

  if (responses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <FileText size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Brak odpowiedzi</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Ten formularz nie otrzymał jeszcze żadnych odpowiedzi</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Statystyki */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
            <Users size={20} className="text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            <p className="text-xs text-gray-500">Wszystkich uczestników</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
            <CheckCircle size={20} className="text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.paid}</p>
            <p className="text-xs text-gray-500">Opłaconych</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
            <Clock size={20} className="text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
            <p className="text-xs text-gray-500">Oczekuje na płatność</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
            <DollarSign size={20} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatPrice(stats.totalRevenue, form?.settings?.pricing?.currency || 'PLN')}</p>
            <p className="text-xs text-gray-500">Otrzymane wpłaty</p>
          </div>
        </div>
      </div>

      {/* Wyszukiwarka i filtry */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj uczestnika (imię, email, telefon)..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Filter size={16} />Filtry
          </button>
          <button onClick={() => fetchResponses(pagination.page)} disabled={loading}
            className="p-2.5 text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="relative">
            <button onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-accent-primary-light rounded-xl hover:bg-accent-primary transition-colors">
              <Download size={16} />Eksportuj
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20">
                  <button onClick={handleExportCSV} className="w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">CSV</button>
                  <button onClick={handleExportJSON} className="w-full px-4 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">JSON</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filtry płatności */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { id: 'all', label: 'Wszystkie' },
            { id: 'paid', label: 'Opłacone' },
            { id: 'partial', label: 'Częściowe' },
            { id: 'pending', label: 'Oczekujące' }
          ].map((f) => (
            <button key={f.id} onClick={() => setPaymentFilter(f.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                paymentFilter === f.id
                  ? 'bg-accent-primary-lightest border-accent-primary-light text-accent-primary-dark'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}>{f.label}</button>
          ))}
          <button onClick={handleDeleteAll}
            className="ml-auto px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 transition-colors">
            <Trash2 size={12} className="inline mr-1" />Usuń wszystkie
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Uczestnik</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Kontakt</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Data</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Kwota</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredParticipants.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedParticipant(p)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 flex items-center justify-center text-sm font-semibold text-accent-primary dark:text-accent-primary-light">
                        {(p.name || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                        {p.isGroupContact && (
                          <p className="text-[10px] text-blue-500">Osoba zgłaszająca · Grupa {p.groupSize} os.</p>
                        )}
                        {p.isGroupMember && (
                          <p className="text-[10px] text-gray-400">Członek zespołu</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {p.email && <div className="flex items-center gap-1"><Mail size={12} />{p.email}</div>}
                    {p.phone && <div className="flex items-center gap-1"><Phone size={12} />{p.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(p.submittedAt)}
                  </td>
                  <td className="px-4 py-3">
                    {p.totalAmount > 0 ? (
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatPrice(p.totalAmount, p.currency)}
                        </span>
                        {p.addonLabels?.length > 0 && (
                          <div className="text-[10px] text-purple-500 mt-0.5">{p.addonLabels.join(', ')}</div>
                        )}
                        {p.isGroupContact && p.groupTotalAmount > 0 && (
                          <div className="text-[10px] text-gray-400 mt-0.5">Grupa: {formatPrice(p.groupTotalAmount, p.currency)}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {getPaymentStatusBadge(p.status, p.paidAmount, p.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {p.totalAmount > 0 && (p.status === 'pending' || p.status === 'partial') && (
                        <button onClick={() => { setPaymentModal({ participantId: p.id, amount: p.totalAmount, currency: p.currency, name: p.name }); setPaymentAmount(String(p.totalAmount - (p.paidAmount || 0))); }}
                          className="p-2 text-green-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors" title="Dodaj płatność">
                          <Banknote size={16} />
                        </button>
                      )}
                      <button onClick={() => setSelectedParticipant(p)}
                        className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title="Szczegóły">
                        <Eye size={16} />
                      </button>
                      <button onClick={() => handleDeleteResponse(p.responseId)}
                        className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Usuń">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">Strona {pagination.page} z {totalPages}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => fetchResponses(pagination.page - 1)} disabled={pagination.page <= 1}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={18} />
              </button>
              <button onClick={() => fetchResponses(pagination.page + 1)} disabled={pagination.page >= totalPages}
                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal szczegółów */}
      {selectedParticipant && (() => {
        const sp = selectedParticipant;
        const contactFields = ['email', 'phone'];
        const skipTypes = ['price', 'seat_limit', 'location', 'date_start', 'date_end', 'time_start', 'time_end'];
        // Pola bez email/phone (te są w nagłówku)
        const dataFields = (form?.fields || []).filter(f => {
          if (skipTypes.includes(f.type)) return null;
          if (contactFields.includes(f.type)) return null;
          const value = sp.answers[f.id];
          return value !== undefined && value !== null && value !== '';
        });

        return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Nagłówek */}
            <div className="relative bg-gradient-to-r from-accent-primary-lightest to-accent-secondary-lightest dark:from-accent-primary-darkest/30 dark:to-accent-secondary-darkest/30 p-5 pb-4">
              <button onClick={() => setSelectedParticipant(null)}
                className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-white/80 dark:bg-gray-800/80 rounded-lg transition-colors">
                <X size={18} />
              </button>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white dark:bg-gray-700 shadow-sm flex items-center justify-center text-xl font-bold text-accent-primary dark:text-accent-primary-light">
                  {(sp.name || '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{sp.name}</h2>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(sp.submittedAt)}</span>
                    {sp.isGroupContact && <span className="text-blue-500 font-medium">Zgłaszający · {sp.groupSize} os.</span>}
                    {sp.isGroupMember && <span className="text-gray-400">Członek zespołu</span>}
                  </div>
                </div>
              </div>
              {/* Kontakt */}
              {(sp.email || sp.phone) && (
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
                  {sp.email && <span className="flex items-center gap-1.5"><Mail size={13} />{sp.email}</span>}
                  {sp.phone && <span className="flex items-center gap-1.5"><Phone size={13} />{sp.phone}</span>}
                </div>
              )}
            </div>

            {/* Treść */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* Dane formularza */}
              {dataFields.length > 0 && (
                <div className="space-y-2.5">
                  {dataFields.map((field) => (
                    <div key={field.id} className="flex items-start gap-3">
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 w-28 flex-shrink-0 pt-0.5 text-right">
                        {field.label}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white flex-1">
                        {formatAnswerForExport(sp.answers[field.id], field.type)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Dodatki */}
              {sp.addonLabels?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-gray-400 w-28 flex-shrink-0 pt-0.5 text-right">Dodatki</span>
                    <div className="flex flex-wrap gap-1.5">
                      {sp.addonLabels.map((label, i) => (
                        <span key={i} className="px-2.5 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg text-xs font-medium">{label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Płatność */}
              {sp.totalAmount > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Płatność</span>
                      {getPaymentStatusBadge(sp.status, sp.paidAmount, sp.totalAmount)}
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatPrice(sp.totalAmount, sp.currency)}
                        </p>
                        {sp.paidAmount > 0 && sp.status !== 'paid' && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            Wpłacono: <span className="font-medium text-green-600">{formatPrice(sp.paidAmount, sp.currency)}</span>
                            <span className="mx-1">·</span>
                            Pozostało: <span className="font-medium text-orange-600">{formatPrice(sp.totalAmount - sp.paidAmount, sp.currency)}</span>
                          </p>
                        )}
                        {sp.isGroupContact && sp.groupTotalAmount > 0 && (
                          <p className="text-xs text-gray-400 mt-1">Łącznie za grupę: {formatPrice(sp.groupTotalAmount, sp.currency)}</p>
                        )}
                      </div>
                      {(sp.status === 'pending' || sp.status === 'partial') && (
                        <button
                          onClick={() => {
                            setPaymentModal({ participantId: sp.id, amount: sp.totalAmount, currency: sp.currency, name: sp.name });
                            setPaymentAmount(String(sp.totalAmount - (sp.paidAmount || 0)));
                            setSelectedParticipant(null);
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg transition-colors"
                        >
                          <Banknote size={14} />
                          Dodaj wpłatę
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stopka */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <button onClick={() => { handleDeleteResponse(sp.responseId); setSelectedParticipant(null); }}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                <Trash2 size={14} />Usuń rejestrację
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal płatności */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Banknote size={20} className="text-green-500" />Dodaj płatność</h2>
              <button onClick={() => setPaymentModal(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <p className="text-sm text-gray-500">Uczestnik</p>
                <p className="font-medium text-gray-900 dark:text-white">{paymentModal.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Kwota ({paymentModal.currency})</label>
                <input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Data płatności</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button onClick={() => setPaymentModal(null)} className="flex-1 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 transition-colors">Anuluj</button>
              <button onClick={addPayment} className="flex-1 py-2.5 text-sm font-medium text-white bg-green-500 rounded-xl hover:bg-green-600 transition-colors flex items-center justify-center gap-2"><Check size={16} />Potwierdź</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
