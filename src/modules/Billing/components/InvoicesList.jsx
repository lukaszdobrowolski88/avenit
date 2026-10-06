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
import { tr } from '../../../i18n';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { toast } from '../../../lib/toast';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';

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
      toast.error(tr('Wystąpił błąd podczas inicjowania płatności. Spróbuj ponownie.'));
    } finally {
      setPayingInvoice(null);
    }
  };

  const handleDownloadPdf = async (invoice) => {
    const pdfUrl = invoice.pdf_url || await getInvoicePdfUrl(invoice.id);
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    } else {
      toast.error(tr('PDF faktury nie jest jeszcze dostępny.'));
    }
  };

  const getStatusBadge = (status) => {
    const { label, color } = formatInvoiceStatus(status);
    const statusColors = {
      gray: STATUS_COLORS.neutral,
      yellow: STATUS_COLORS.warning,
      green: STATUS_COLORS.success,
      red: STATUS_COLORS.danger,
      blue: STATUS_COLORS.info
    };

    return (
      <StatusPill color={statusColors[color] || STATUS_COLORS.neutral}>
        {label}
      </StatusPill>
    );
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <Spinner center label={tr('Ładowanie faktur...')} />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <EmptyState
          icon={FileText}
          title="Brak faktur"
          subtitle={tr('Tutaj pojawią się Twoje faktury po dokonaniu pierwszej płatności.')}
        />
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

      <DataTable flush>
          <THead>
            <tr>
              <TH>Numer</TH>
              <TH>Data wystawienia</TH>
              <TH>{tr('Termin płatności')}</TH>
              <TH>{tr('Kwota')}</TH>
              <TH>{tr('Status')}</TH>
              <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
            </tr>
          </THead>
          <tbody>
            {invoices.map((invoice) => (
              <TR key={invoice.id}>
                <TD numeric className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                  {invoice.invoice_number}
                </TD>
                <TD muted numeric className="whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {new Date(invoice.issue_date).toLocaleDateString('pl-PL')}
                  </div>
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
                </TD>
              </TR>
            ))}
          </tbody>
      </DataTable>
    </div>
  );
}
