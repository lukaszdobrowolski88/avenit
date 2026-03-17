/**
 * Hook do zarządzania tenantami (klientami) w panelu SuperAdmin
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export function useTenants() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Pobiera listę wszystkich tenantów
   */
  const getTenants = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('tenants')
        .select(`
          *,
          tenant_subscriptions (
            id,
            status,
            billing_cycle,
            current_period_end,
            subscription_plans (
              name,
              slug,
              price_monthly,
              price_yearly
            )
          )
        `)
        .order('created_at', { ascending: false });

      // Filtry
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;
      return data || [];
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Pobiera szczegóły tenanta
   */
  const getTenantDetails = useCallback(async (tenantId) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('tenants')
        .select(`
          *,
          tenant_subscriptions (
            *,
            subscription_plans (*)
          ),
          app_users (
            id,
            email,
            full_name,
            tenant_role,
            created_at
          ),
          invoices (
            id,
            invoice_number,
            total,
            status,
            due_date,
            paid_at,
            created_at
          )
        `)
        .eq('id', tenantId)
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
   * Pobiera statystyki użycia tenanta
   */
  const getTenantStats = useCallback(async (tenantId) => {
    try {
      const [
        { count: membersCount },
        { count: usersCount },
        { count: groupsCount },
        { count: kidsCount },
        { count: eventsCount },
        { count: checkinsCount }
      ] = await Promise.all([
        supabase.from('members').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('app_users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('groups').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('kids_students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('events').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('checkins').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      ]);

      return {
        members: membersCount || 0,
        users: usersCount || 0,
        groups: groupsCount || 0,
        kids: kidsCount || 0,
        events: eventsCount || 0,
        checkins: checkinsCount || 0
      };
    } catch (err) {
      console.error('Error getting tenant stats:', err);
      return null;
    }
  }, []);

  /**
   * Aktualizuje dane tenanta
   */
  const updateTenant = useCallback(async (tenantId, updates) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase
        .from('tenants')
        .update(updates)
        .eq('id', tenantId)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Zawiesza tenanta
   */
  const suspendTenant = useCallback(async (tenantId, reason = null) => {
    setLoading(true);
    setError(null);

    try {
      // Zawieś tenanta
      await supabase
        .from('tenants')
        .update({ status: 'suspended' })
        .eq('id', tenantId);

      // Zawieś subskrypcję
      await supabase
        .from('tenant_subscriptions')
        .update({ status: 'suspended' })
        .eq('tenant_id', tenantId)
        .in('status', ['trialing', 'active', 'past_due']);

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Przywraca tenanta
   */
  const resumeTenant = useCallback(async (tenantId) => {
    setLoading(true);
    setError(null);

    try {
      // Przywróć tenanta
      await supabase
        .from('tenants')
        .update({ status: 'active' })
        .eq('id', tenantId);

      // Przywróć subskrypcję
      await supabase
        .from('tenant_subscriptions')
        .update({ status: 'active' })
        .eq('tenant_id', tenantId)
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
   * Przedłuża trial tenanta
   */
  const extendTrial = useCallback(async (tenantId, additionalDays = 7) => {
    setLoading(true);
    setError(null);

    try {
      // Pobierz aktualną datę końca triala
      const { data: tenant } = await supabase
        .from('tenants')
        .select('trial_ends_at')
        .eq('id', tenantId)
        .single();

      const currentTrialEnd = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
      const newTrialEnd = new Date(currentTrialEnd);
      newTrialEnd.setDate(newTrialEnd.getDate() + additionalDays);

      // Aktualizuj tenanta
      await supabase
        .from('tenants')
        .update({ trial_ends_at: newTrialEnd.toISOString() })
        .eq('id', tenantId);

      // Aktualizuj subskrypcję
      await supabase
        .from('tenant_subscriptions')
        .update({
          trial_ends_at: newTrialEnd.toISOString(),
          current_period_end: newTrialEnd.toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('status', 'trialing');

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Zmienia plan tenanta
   */
  const changeTenantPlan = useCallback(async (tenantId, newPlanId, billingCycle = 'monthly') => {
    setLoading(true);
    setError(null);

    try {
      await supabase
        .from('tenant_subscriptions')
        .update({
          plan_id: newPlanId,
          billing_cycle: billingCycle
        })
        .eq('tenant_id', tenantId)
        .in('status', ['trialing', 'active', 'past_due']);

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getTenants,
    getTenantDetails,
    getTenantStats,
    updateTenant,
    suspendTenant,
    resumeTenant,
    extendTrial,
    changeTenantPlan
  };
}
