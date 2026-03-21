import React, { useEffect, useState } from 'react';
import { getCurrentTenant } from '../../../lib/tenantContext';
import { getTenantInvoices, formatPrice } from '../../../lib/subscriptions';
import { redirectToPayment, formatInvoiceStatus, getInvoicePdfUrl } from '../../../lib/payments';
import {
  FileText,
  Download,
  CreditCard,
  Calendar,
  Loader2,
  ExternalLink
} from 'lucide-react';

export default function InvoicesList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingInvoice, setPayingInvoice] = useState(null);

  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      try {
        const tenant = await getCurrentTenant();
        if (tenant?.id) {
          const data = await getTenantInvoices(tenant.id);
          setInvoices(data);
        }
      } catch (err) {
        console.error('Error loading invoices:', err);
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, []);

  const handlePay = async (invoiceId) => {
    setPayingInvoice(invoiceId);
    try {
      await redirectToPayment(invoiceId);
    } catch (err) {
      console.error('Error initiating payment:', err);
      alert('Wystąpił błąd podczas inicjowania płatności. Spróbuj ponownie.');
    } finally {
      setPayingInvoice(null);
    }
  };

  const handleDownloadPdf = async (invoice) => {
    const pdfUrl = invoice.pdf_url || await getInvoicePdfUrl(invoice.id);
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    } else {
      alert('PDF faktury nie jest jeszcze dostępny.');
    }
  };

  const getStatusBadge = (status) => {
    const { label, color } = formatInvoiceStatus(status);
    const colorClasses = {
      gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClasses[color]}`}>
        {label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <Loader2 size={32} className="animate-spin mx-auto text-accent-primary-light mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Ładowanie faktur...</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <FileText size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Brak faktur
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Tutaj pojawią się Twoje faktury po dokonaniu pierwszej płatności.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FileText size={20} />
          Historia faktur
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
              <th className="px-6 py-3 font-medium">Numer</th>
              <th className="px-6 py-3 font-medium">Data wystawienia</th>
              <th className="px-6 py-3 font-medium">Termin płatności</th>
              <th className="px-6 py-3 font-medium">Kwota</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <td className="px-6 py-4">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {invoice.invoice_number}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {new Date(invoice.issue_date).toLocaleDateString('pl-PL')}
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                  {new Date(invoice.due_date).toLocaleDateString('pl-PL')}
                </td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatPrice(invoice.total)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {getStatusBadge(invoice.status)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {(invoice.status === 'pending' || invoice.status === 'overdue') && (
                      <button
                        onClick={() => handlePay(invoice.id)}
                        disabled={payingInvoice === invoice.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm font-medium rounded-lg hover:shadow-lg transition disabled:opacity-50"
                      >
                        {payingInvoice === invoice.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CreditCard size={14} />
                        )}
                        Zapłać
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadPdf(invoice)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                    >
                      <Download size={14} />
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
