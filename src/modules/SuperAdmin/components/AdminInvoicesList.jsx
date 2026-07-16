import React, { useEffect, useState } from 'react';
import { useInvoices } from '../hooks/useInvoices';
import { formatPrice } from '../../../lib/subscriptions';
import {
  FileText,
  Search,
  Filter,
  CheckCircle,
  Download,
  MoreVertical,
  Calendar,
  Building2
} from 'lucide-react';
import { tr } from '../../../i18n';

export default function AdminInvoicesList() {
  const { getInvoices, markAsPaid, cancelInvoice, loading } = useInvoices();
  const [invoices, setInvoices] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showActions, setShowActions] = useState(null);

  const loadInvoices = async () => {
    const { data } = await getInvoices({
      status: statusFilter || undefined
    });
    setInvoices(data);
  };

  useEffect(() => {
    loadInvoices();
  }, [statusFilter]);

  const handleMarkAsPaid = async (invoiceId) => {
    if (confirm('Oznaczyć fakturę jako opłaconą?')) {
      await markAsPaid(invoiceId);
      loadInvoices();
    }
    setShowActions(null);
  };

  const handleCancel = async (invoiceId) => {
    if (confirm('Czy na pewno anulować tę fakturę?')) {
      await cancelInvoice(invoiceId);
      loadInvoices();
    }
    setShowActions(null);
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: tr('Szkic'), color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
      pending: { label: 'Do zapłaty', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
      paid: { label: 'Opłacona', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
      overdue: { label: 'Zaległa', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
      cancelled: { label: 'Anulowana', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
      refunded: { label: 'Zwrócona', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' }
    };

    const { label, color } = config[status] || config.pending;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        {label}
      </span>
    );
  };

  const filteredInvoices = invoices.filter(inv => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(query) ||
      inv.tenants?.name?.toLowerCase().includes(query) ||
      inv.tenants?.email?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Faktury
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Wszystkie faktury w systemie
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Szukaj po numerze lub kliencie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="">{tr('Wszystkie statusy')}</option>
          <option value="pending">Do zapłaty</option>
          <option value="paid">Opłacone</option>
          <option value="overdue">Zaległe</option>
          <option value="cancelled">Anulowane</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">{tr('Ładowanie...')}</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Brak faktur spełniających kryteria
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 font-medium">Numer</th>
                  <th className="px-4 py-3 font-medium">Klient</th>
                  <th className="px-4 py-3 font-medium">{tr('Data')}</th>
                  <th className="px-4 py-3 font-medium">{tr('Termin')}</th>
                  <th className="px-4 py-3 font-medium">{tr('Kwota')}</th>
                  <th className="px-4 py-3 font-medium">{tr('Status')}</th>
                  <th className="px-4 py-3 font-medium text-right">{tr('Akcje')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {invoice.invoice_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-gray-400" />
                        <div>
                          <div className="text-gray-900 dark:text-white">
                            {invoice.tenants?.name || '-'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {invoice.tenants?.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {new Date(invoice.issue_date).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {new Date(invoice.due_date).toLocaleDateString('pl-PL')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatPrice(invoice.total)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setShowActions(showActions === invoice.id ? null : invoice.id)}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                          <MoreVertical size={16} className="text-gray-500" />
                        </button>

                        {showActions === invoice.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-10">
                            {invoice.status === 'pending' || invoice.status === 'overdue' ? (
                              <button
                                onClick={() => handleMarkAsPaid(invoice.id)}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 first:rounded-t-xl"
                              >
                                <CheckCircle size={16} className="text-green-500" />
                                Oznacz jako opłaconą
                              </button>
                            ) : null}

                            <button
                              onClick={() => {/* TODO: Download PDF */}}
                              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                              <Download size={16} />
                              Pobierz PDF
                            </button>

                            {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
                              <button
                                onClick={() => handleCancel(invoice.id)}
                                className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 last:rounded-b-xl"
                              >
                                Anuluj fakturę
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Close dropdown */}
      {showActions && (
        <div className="fixed inset-0 z-0" onClick={() => setShowActions(null)} />
      )}
    </div>
  );
}
