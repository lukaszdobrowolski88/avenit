/**
 * Obsługa płatności - frontend
 */

import { supabase } from './supabase';
import { getCurrentTenant, getTenantSubscription, clearTenantCache } from './tenantContext';
import { formatPrice } from './subscriptions';

/**
 * Tworzy nową fakturę
 */
export async function createInvoice(tenantId, subscriptionId, planPrice, billingCycle, discountAmount = 0) {
  try {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (!tenant) throw new Error('Tenant not found');

    const { data: subscription } = await supabase
      .from('tenant_subscriptions')
      .select('*, subscription_plans(*)')
      .eq('id', subscriptionId)
      .single();

    if (!subscription) throw new Error('Subscription not found');

    const plan = subscription.subscription_plans;
    const subtotal = planPrice - discountAmount;
    const taxRate = 23;
    const taxAmount = Math.round(subtotal * taxRate / 100);
    const total = subtotal + taxAmount;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // 7 dni na płatność

    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (billingCycle === 'yearly' ? 12 : 1));

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        subscription_id: subscriptionId,
        buyer_name: tenant.name,
        buyer_company_name: tenant.company_name,
        buyer_tax_id: tenant.tax_id,
        buyer_address: [tenant.address, tenant.postal_code, tenant.city].filter(Boolean).join(', '),
        buyer_email: tenant.email,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        items: JSON.stringify([{
          description: `Subskrypcja ${plan.name} - ${billingCycle === 'yearly' ? 'roczna' : 'miesięczna'}`,
          quantity: 1,
          unit_price: planPrice,
          discount: discountAmount,
          total: subtotal
        }]),
        due_date: dueDate.toISOString().split('T')[0],
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0]
      })
      .select()
      .single();

    if (error) throw error;
    return invoice;
  } catch (err) {
    console.error('Error creating invoice:', err);
    throw err;
  }
}

/**
 * Inicjuje płatność przez Przelewy24
 */
export async function initiatePayment(invoiceId) {
  try {
    // Pobierz dane faktury
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, tenants(*)')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error('Invoice not found');
    }

    // Wywołaj Edge Function
    const { data, error } = await supabase.functions.invoke('przelewy24-create-payment', {
      body: {
        invoiceId: invoice.id,
        tenantId: invoice.tenant_id,
        amount: invoice.total,
        description: `Faktura ${invoice.invoice_number}`,
        email: invoice.buyer_email,
        returnUrl: `${window.location.origin}/billing/success?invoice=${invoice.id}`,
        statusUrl: undefined // Domyślny webhook
      }
    });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error initiating payment:', err);
    throw err;
  }
}

/**
 * Przekierowuje do płatności
 */
export async function redirectToPayment(invoiceId) {
  try {
    const result = await initiatePayment(invoiceId);
    if (result?.paymentUrl) {
      window.location.href = result.paymentUrl;
    } else {
      throw new Error('Failed to get payment URL');
    }
  } catch (err) {
    console.error('Error redirecting to payment:', err);
    throw err;
  }
}

/**
 * Sprawdza status płatności
 */
export async function checkPaymentStatus(invoiceId) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('status, paid_at')
      .eq('id', invoiceId)
      .single();

    if (error) throw error;

    clearTenantCache(); // Odśwież cache po sprawdzeniu

    return {
      isPaid: data.status === 'paid',
      paidAt: data.paid_at
    };
  } catch (err) {
    console.error('Error checking payment status:', err);
    return { isPaid: false, paidAt: null };
  }
}

/**
 * Pobiera historię płatności tenanta
 */
export async function getPaymentHistory(tenantId) {
  try {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error getting payment history:', err);
    return [];
  }
}

/**
 * Generuje link do pobrania faktury PDF
 */
export async function getInvoicePdfUrl(invoiceId) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('pdf_url')
      .eq('id', invoiceId)
      .single();

    if (error) throw error;
    return data?.pdf_url || null;
  } catch (err) {
    console.error('Error getting invoice PDF:', err);
    return null;
  }
}

/**
 * Formatuje status płatności
 */
export function formatPaymentStatus(status) {
  const statusMap = {
    pending: { label: 'Oczekuje', color: 'yellow' },
    processing: { label: 'Przetwarzanie', color: 'blue' },
    completed: { label: 'Opłacona', color: 'green' },
    failed: { label: 'Nieudana', color: 'red' },
    refunded: { label: 'Zwrócona', color: 'gray' },
    cancelled: { label: 'Anulowana', color: 'gray' }
  };
  return statusMap[status] || { label: status, color: 'gray' };
}

/**
 * Formatuje status faktury
 */
export function formatInvoiceStatus(status) {
  const statusMap = {
    draft: { label: 'Szkic', color: 'gray' },
    pending: { label: 'Do zapłaty', color: 'yellow' },
    paid: { label: 'Opłacona', color: 'green' },
    overdue: { label: 'Zaległa', color: 'red' },
    cancelled: { label: 'Anulowana', color: 'gray' },
    refunded: { label: 'Zwrócona', color: 'blue' }
  };
  return statusMap[status] || { label: status, color: 'gray' };
}
