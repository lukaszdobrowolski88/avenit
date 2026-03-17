/**
 * Zarządzanie subskrypcjami i planami
 */

import { supabase } from './supabase';
import { clearTenantCache } from './tenantContext';

/**
 * Pobiera wszystkie dostępne plany
 */
export async function getAvailablePlans() {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .eq('is_public', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error getting plans:', err);
    return [];
  }
}

/**
 * Pobiera szczegóły planu
 */
export async function getPlanDetails(planId) {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error getting plan details:', err);
    return null;
  }
}

/**
 * Pobiera plan po slug
 */
export async function getPlanBySlug(slug) {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error getting plan by slug:', err);
    return null;
  }
}

/**
 * Tworzy nową subskrypcję trial
 */
export async function createTrialSubscription(tenantId, planSlug = 'starter') {
  try {
    const plan = await getPlanBySlug(planSlug);
    if (!plan) throw new Error('Plan not found');

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trial_days);

    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .insert({
        tenant_id: tenantId,
        plan_id: plan.id,
        status: 'trialing',
        billing_cycle: 'monthly',
        trial_ends_at: trialEndsAt.toISOString(),
        current_period_start: new Date().toISOString(),
        current_period_end: trialEndsAt.toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Aktualizuj tenanta
    await supabase
      .from('tenants')
      .update({
        status: 'trial',
        trial_ends_at: trialEndsAt.toISOString()
      })
      .eq('id', tenantId);

    clearTenantCache();
    return data;
  } catch (err) {
    console.error('Error creating trial subscription:', err);
    throw err;
  }
}

/**
 * Zmienia plan subskrypcji
 */
export async function changePlan(subscriptionId, newPlanId, billingCycle = 'monthly') {
  try {
    const plan = await getPlanDetails(newPlanId);
    if (!plan) throw new Error('Plan not found');

    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .update({
        plan_id: newPlanId,
        billing_cycle: billingCycle
      })
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) throw error;

    clearTenantCache();
    return data;
  } catch (err) {
    console.error('Error changing plan:', err);
    throw err;
  }
}

/**
 * Anuluje subskrypcję
 */
export async function cancelSubscription(subscriptionId, reason = null) {
  try {
    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason
      })
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) throw error;

    clearTenantCache();
    return data;
  } catch (err) {
    console.error('Error cancelling subscription:', err);
    throw err;
  }
}

/**
 * Aktywuje subskrypcję (po płatności)
 */
export async function activateSubscription(subscriptionId, billingCycle = 'monthly') {
  try {
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + (billingCycle === 'yearly' ? 12 : 1));

    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .update({
        status: 'active',
        billing_cycle: billingCycle,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_invoice_date: periodEnd.toISOString().split('T')[0]
      })
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) throw error;

    // Aktualizuj status tenanta
    const sub = data;
    await supabase
      .from('tenants')
      .update({ status: 'active' })
      .eq('id', sub.tenant_id);

    clearTenantCache();
    return data;
  } catch (err) {
    console.error('Error activating subscription:', err);
    throw err;
  }
}

/**
 * Przedłuża subskrypcję o kolejny okres
 */
export async function renewSubscription(subscriptionId) {
  try {
    const { data: currentSub } = await supabase
      .from('tenant_subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single();

    if (!currentSub) throw new Error('Subscription not found');

    const periodStart = new Date(currentSub.current_period_end);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + (currentSub.billing_cycle === 'yearly' ? 12 : 1));

    const { data, error } = await supabase
      .from('tenant_subscriptions')
      .update({
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_invoice_date: periodEnd.toISOString().split('T')[0]
      })
      .eq('id', subscriptionId)
      .select()
      .single();

    if (error) throw error;

    clearTenantCache();
    return data;
  } catch (err) {
    console.error('Error renewing subscription:', err);
    throw err;
  }
}

/**
 * Waliduje kupon
 */
export async function validateCoupon(code, planId = null, billingCycle = 'monthly') {
  try {
    const { data, error } = await supabase
      .rpc('validate_coupon', {
        p_code: code.toUpperCase(),
        p_tenant_id: null, // Pobierz z kontekstu
        p_plan_id: planId,
        p_billing_cycle: billingCycle
      });

    if (error) throw error;
    return data?.[0] || { is_valid: false, error_message: 'Błąd walidacji kuponu' };
  } catch (err) {
    console.error('Error validating coupon:', err);
    return { is_valid: false, error_message: 'Błąd walidacji kuponu' };
  }
}

/**
 * Wykorzystuje kupon
 */
export async function redeemCoupon(couponId, tenantId, subscriptionId, discountAmount) {
  try {
    const { data, error } = await supabase
      .from('coupon_redemptions')
      .insert({
        coupon_id: couponId,
        tenant_id: tenantId,
        subscription_id: subscriptionId,
        discount_applied: discountAmount
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Error redeeming coupon:', err);
    throw err;
  }
}

/**
 * Oblicza cenę z rabatem
 */
export function calculateDiscountedPrice(price, coupon) {
  if (!coupon?.is_valid) return price;

  switch (coupon.discount_type) {
    case 'percent':
      return Math.round(price * (1 - coupon.discount_value / 100));
    case 'fixed_amount':
      return Math.max(0, price - coupon.discount_value);
    case 'free_months':
      return 0; // Pierwszy okres za darmo
    default:
      return price;
  }
}

/**
 * Formatuje cenę (grosze na złote)
 */
export function formatPrice(priceInGrosze, currency = 'PLN') {
  const amount = priceInGrosze / 100;
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * Pobiera historię faktur tenanta
 */
export async function getTenantInvoices(tenantId) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error getting invoices:', err);
    return [];
  }
}
