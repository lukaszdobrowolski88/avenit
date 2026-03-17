/**
 * Hook do zarządzania fakturami w panelu SuperAdmin
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export function useInvoices() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Pobiera listę faktur
   */
  const getInvoices = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('invoices')
        .select(`
          *,
          tenants (
            id,
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      // Filtry
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.tenantId) {
        query = query.eq('tenant_id', filters.tenantId);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      // Paginacja
      if (filters.limit) {
        query = query.limit(filters.limit);
      }
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;
      return { data: data || [], count };
    } catch (err) {
      setError(err.message);
      return { data: [], count: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Pobiera szczegóły faktury
   */
  const getInvoiceDetails = useCallback(async (invoiceId) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('invoices')
        .select(`
          *,
          tenants (*),
          tenant_subscriptions (
            *,
            subscription_plans (*)
          ),
          payment_transactions (*)
        `)
        .eq('id', invoiceId)
        .single();

      if (queryError) throw queryError;
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Oznacza fakturę jako opłaconą (ręcznie)
   */
  const markAsPaid = useCallback(async (invoiceId, paymentMethod = 'manual') => {
    setLoading(true);
    setError(null);

    try {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('tenant_id, total')
        .eq('id', invoiceId)
        .single();

      if (!invoice) throw new Error('Invoice not found');

      // Aktualizuj fakturę
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod
        })
        .eq('id', invoiceId);

      // Utwórz rekord transakcji
      await supabase
        .from('payment_transactions')
        .insert({
          tenant_id: invoice.tenant_id,
          invoice_id: invoiceId,
          gateway: 'manual',
          amount: invoice.total,
          status: 'completed',
          completed_at: new Date().toISOString()
        });

      // Aktywuj subskrypcję/tenanta jeśli trzeba
      await supabase
        .from('tenant_subscriptions')
        .update({ status: 'active' })
        .eq('tenant_id', invoice.tenant_id)
        .eq('status', 'past_due');

      await supabase
        .from('tenants')
        .update({ status: 'active' })
        .eq('id', invoice.tenant_id)
        .eq('status', 'suspended');

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Anuluje fakturę
   */
  const cancelInvoice = useCallback(async (invoiceId) => {
    setLoading(true);
    setError(null);

    try {
      await supabase
        .from('invoices')
        .update({ status: 'cancelled' })
        .eq('id', invoiceId);

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Pobiera statystyki faktur
   */
  const getInvoiceStats = useCallback(async (period = 'month') => {
    try {
      const now = new Date();
      let dateFrom;

      switch (period) {
        case 'week':
          dateFrom = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          dateFrom = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          dateFrom = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        default:
          dateFrom = new Date(0);
      }

      // Faktury w okresie
      const { data: invoices } = await supabase
        .from('invoices')
        .select('status, total')
        .gte('created_at', dateFrom.toISOString());

      const stats = {
        total: invoices?.length || 0,
        pending: 0,
        paid: 0,
        overdue: 0,
        cancelled: 0,
        totalRevenue: 0,
        pendingRevenue: 0,
        overdueRevenue: 0
      };

      (invoices || []).forEach(inv => {
        switch (inv.status) {
          case 'pending':
            stats.pending++;
            stats.pendingRevenue += inv.total;
            break;
          case 'paid':
            stats.paid++;
            stats.totalRevenue += inv.total;
            break;
          case 'overdue':
            stats.overdue++;
            stats.overdueRevenue += inv.total;
            break;
          case 'cancelled':
            stats.cancelled++;
            break;
        }
      });

      return stats;
    } catch (err) {
      console.error('Error getting invoice stats:', err);
      return null;
    }
  }, []);

  /**
   * Pobiera przychód miesięczny (MRR)
   */
  const getMRR = useCallback(async () => {
    try {
      const { data: subscriptions } = await supabase
        .from('tenant_subscriptions')
        .select(`
          billing_cycle,
          subscription_plans (
            price_monthly,
            price_yearly
          )
        `)
        .eq('status', 'active');

      let mrr = 0;
      (subscriptions || []).forEach(sub => {
        const plan = sub.subscription_plans;
        if (sub.billing_cycle === 'monthly') {
          mrr += plan.price_monthly;
        } else {
          mrr += Math.round(plan.price_yearly / 12);
        }
      });

      return mrr;
    } catch (err) {
      console.error('Error calculating MRR:', err);
      return 0;
    }
  }, []);

  return {
    loading,
    error,
    getInvoices,
    getInvoiceDetails,
    markAsPaid,
    cancelInvoice,
    getInvoiceStats,
    getMRR
  };
}
