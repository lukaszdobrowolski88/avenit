/**
 * Hook do zarządzania planami subskrypcji w panelu SuperAdmin
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export function usePlans() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Pobiera wszystkie plany
   */
  const getPlans = useCallback(async (includeInactive = false) => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('subscription_plans')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
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
   * Pobiera szczegóły planu
   */
  const getPlanDetails = useCallback(async (planId) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (queryError) throw queryError;

      // Pobierz liczbę subskrypcji dla tego planu
      const { count } = await supabase
        .from('tenant_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('plan_id', planId)
        .in('status', ['trialing', 'active', 'past_due']);

      return { ...data, activeSubscriptions: count || 0 };
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Tworzy nowy plan
   */
  const createPlan = useCallback(async (planData) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from('subscription_plans')
        .insert(planData)
        .select()
        .single();

      if (insertError) throw insertError;
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Aktualizuje plan
   */
  const updatePlan = useCallback(async (planId, updates) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase
        .from('subscription_plans')
        .update(updates)
        .eq('id', planId)
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
   * Dezaktywuje plan (soft delete)
   */
  const deactivatePlan = useCallback(async (planId) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: updateError } = await supabase
        .from('subscription_plans')
        .update({ is_active: false })
        .eq('id', planId)
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
   * Pobiera statystyki planów
   */
  const getPlanStats = useCallback(async () => {
    try {
      const { data: plans } = await supabase
        .from('subscription_plans')
        .select('id, name, slug, price_monthly, price_yearly');

      if (!plans) return [];

      const statsPromises = plans.map(async (plan) => {
        const { count: activeCount } = await supabase
          .from('tenant_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('plan_id', plan.id)
          .in('status', ['active']);

        const { count: trialCount } = await supabase
          .from('tenant_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('plan_id', plan.id)
          .eq('status', 'trialing');

        const { count: monthlyCount } = await supabase
          .from('tenant_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('plan_id', plan.id)
          .eq('billing_cycle', 'monthly')
          .eq('status', 'active');

        const { count: yearlyCount } = await supabase
          .from('tenant_subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('plan_id', plan.id)
          .eq('billing_cycle', 'yearly')
          .eq('status', 'active');

        const mrr = (monthlyCount || 0) * plan.price_monthly +
                    (yearlyCount || 0) * Math.round(plan.price_yearly / 12);

        return {
          ...plan,
          activeCount: activeCount || 0,
          trialCount: trialCount || 0,
          monthlyCount: monthlyCount || 0,
          yearlyCount: yearlyCount || 0,
          mrr
        };
      });

      return Promise.all(statsPromises);
    } catch (err) {
      console.error('Error getting plan stats:', err);
      return [];
    }
  }, []);

  return {
    loading,
    error,
    getPlans,
    getPlanDetails,
    createPlan,
    updatePlan,
    deactivatePlan,
    getPlanStats
  };
}
