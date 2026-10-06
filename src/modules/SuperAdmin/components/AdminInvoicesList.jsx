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
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import { confirmDialog } from '../../../lib/dialog';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';

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
    if (await confirmDialog(tr('Oznaczyć fakturę jako opłaconą?'))) {
      await markAsPaid(invoiceId);
      loadInvoices();
    }
    setShowActions(null);
  };

  const handleCancel = async (invoiceId) => {
    if (await confirmDialog(tr('Czy na pewno anulować tę fakturę?'))) {
      await cancelInvoice(invoiceId);
      loadInvoices();
    }
    setShowActions(null);
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { label: tr('Szkic'), color: STATUS_COLORS.neutral },
      pending: { label: tr('Do zapłaty'), color: STATUS_COLORS.warning },
      paid: { label: tr('Opłacona'), color: STATUS_COLORS.success },
      overdue: { label: tr('Zaległa'), color: STATUS_COLORS.danger },
      cancelled: { label: 'Anulowana', color: STATUS_COLORS.neutral },
      refunded: { label: tr('Zwrócona'), color: STATUS_COLORS.info }
    };

    const { label, color } = config[status] || config.pending;
    return (
      <StatusPill color={color}>
        {label}
      </StatusPill>
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
          <option value="pending">{tr('Do zapłaty')}</option>
          <option value="paid">{tr('Opłacone')}</option>
          <option value="overdue">{tr('Zaległe')}</option>
          <option value="cancelled">Anulowane</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <Spinner center />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState icon={FileText} title={tr('Brak faktur spełniających kryteria')} />
        ) : (
          <DataTable flush>
              <THead>
                <tr>
                  <TH>Numer</TH>
                  <TH>Klient</TH>
                  <TH>{tr('Data')}</TH>
                  <TH>{tr('Termin')}</TH>
                  <TH>{tr('Kwota')}</TH>
                  <TH>{tr('Status')}</TH>
                  <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
                </tr>
              </THead>
              <tbody>
                {filteredInvoices.map((invoice) => (
                  <TR key={invoice.id}>
                    <TD numeric className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {invoice.invoice_number}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-gray-400" />
                        <div>
                          <div className="text-gray-900 dark:text-white">
                            {invoice.tenants?.name || ''}
                          </div>
                          <div className="text-xs text-gray-500">
                            {invoice.tenants?.email}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD muted numeric className="whitespace-nowrap">
                      {new Date(invoice.issue_date).toLocaleDateString('pl-PL')}
                    </TD>
                    <TD muted numeric className="whitespace-nowrap">
                      {new Date(invoice.due_date).toLocaleDateString('pl-PL')}
                    </TD>
                    <TD numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                      {formatPrice(invoice.total)}
                    </TD>
                    <TD>
                      {getStatusBadge(invoice.status)}
                    </TD>
                    <TD align="right">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setShowActions(showActions === invoice.id ? null : invoice.id)}
                          className={`p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-opacity ${showActions === invoice.id ? '' : 'opacity-60 group-hover/row:opacity-100'}`}
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
                                {tr('Oznacz jako opłaconą')}
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
                                {tr('Anuluj fakturę')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
          </DataTable>
        )}
      </div>

      {/* Close dropdown */}
      {showActions && (
        <div className="fixed inset-0 z-0" onClick={() => setShowActions(null)} />
      )}
    </div>
  );
}
