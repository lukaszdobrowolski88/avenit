/**
 * Kontekst tenanta (klienta) w systemie SaaS
 * Zarządza informacjami o aktualnym tenancie i jego subskrypcji
 */

import { supabase, getCachedUser } from './supabase';

// Cache dla danych tenanta
let tenantCache = null;
let subscriptionCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

/**
 * Pobiera dane aktualnego tenanta
 */
export async function getCurrentTenant() {
  const now = Date.now();

  // Sprawdź cache
  if (tenantCache && (now - cacheTimestamp) < CACHE_TTL) {
    return tenantCache;
  }

  try {
    const user = await getCachedUser();
    if (!user) return null;

    const { data: appUser } = await supabase
      .from('app_users')
      .select('tenant_id, is_super_admin, tenant_role')
      .eq('id', user.id)
      .single();

    if (!appUser?.tenant_id) {
      return null;
    }

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', appUser.tenant_id)
      .single();

    if (error) throw error;

    tenantCache = {
      ...tenant,
      userRole: appUser.tenant_role,
      isSuperAdmin: appUser.is_super_admin
    };
    cacheTimestamp = now;

    return tenantCache;
  } catch (err) {
    console.error('Error getting current tenant:', err);
    return null;
  }
}

/**
 * Pobiera aktywną subskrypcję tenanta
 */
export async function getTenantSubscription(tenantId = null) {
  const now = Date.now();

  // Użyj cache jeśli nie podano konkretnego tenantId
  if (!tenantId && subscriptionCache && (now - cacheTimestamp) < CACHE_TTL) {
    return subscriptionCache;
  }

  try {
    const tenant = tenantId ? { id: tenantId } : await getCurrentTenant();
    if (!tenant?.id) return null;

    const { data, error } = await supabase
      .rpc('get_tenant_subscription', { p_tenant_id: tenant.id });

    if (error) throw error;

    if (!tenantId) {
      subscriptionCache = data?.[0] || null;
    }

    return data?.[0] || null;
  } catch (err) {
    console.error('Error getting tenant subscription:', err);
    return null;
  }
}

/**
 * Sprawdza czy funkcja jest dostępna w planie
 */
export async function checkFeature(feature) {
  const subscription = await getTenantSubscription();
  if (!subscription) return false;

  return subscription.features?.[feature] === true;
}

/**
 * Sprawdza limit zasobów
 * @param {string} resource - Nazwa zasobu (members, users, groups, kids, events, storage_mb)
 * @param {number} currentCount - Aktualna liczba
 * @returns {Promise<{allowed: boolean, limit: number, current: number}>}
 */
export async function checkLimit(resource, currentCount = 0) {
  const subscription = await getTenantSubscription();
  if (!subscription) {
    return { allowed: false, limit: 0, current: currentCount };
  }

  const limitKey = `max_${resource}`;
  const limit = subscription[limitKey];

  // -1 oznacza brak limitu
  if (limit === -1) {
    return { allowed: true, limit: -1, current: currentCount };
  }

  return {
    allowed: currentCount < limit,
    limit,
    current: currentCount
  };
}

/**
 * Pobiera aktualną liczbę zasobów tenanta
 */
export async function getResourceCounts(tenantId = null) {
  try {
    const tenant = tenantId ? { id: tenantId } : await getCurrentTenant();
    if (!tenant?.id) return null;

    // Równoległe zapytania o liczby zasobów
    const [
      { count: membersCount },
      { count: usersCount },
      { count: groupsCount },
      { count: kidsCount },
      { count: eventsCount }
    ] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      supabase.from('app_users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      supabase.from('groups').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      supabase.from('kids_students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      supabase.from('events').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id)
    ]);

    return {
      members: membersCount || 0,
      users: usersCount || 0,
      groups: groupsCount || 0,
      kids: kidsCount || 0,
      events: eventsCount || 0
    };
  } catch (err) {
    console.error('Error getting resource counts:', err);
    return null;
  }
}

/**
 * Sprawdza czy użytkownik jest super adminem
 */
export async function isSuperAdmin() {
  try {
    const user = await getCachedUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('app_users')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (error) return false;
    return data?.is_super_admin === true;
  } catch (err) {
    return false;
  }
}

/**
 * Sprawdza czy tenant ma aktywny dostęp (nie jest suspended)
 */
export async function hasTenantAccess() {
  const tenant = await getCurrentTenant();
  if (!tenant) return false;

  // Super admin zawsze ma dostęp
  if (tenant.isSuperAdmin) return true;

  // Sprawdź status tenanta
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    return false;
  }

  // Sprawdź status subskrypcji
  const subscription = await getTenantSubscription();
  if (!subscription) return false;

  return ['trialing', 'active', 'past_due'].includes(subscription.status);
}

/**
 * Czyści cache (np. po zmianie subskrypcji)
 */
export function clearTenantCache() {
  tenantCache = null;
  subscriptionCache = null;
  cacheTimestamp = 0;
}

/**
 * Tworzy kontekst dla nowego użytkownika
 */
export async function createUserContext(userId, tenantId, role = 'user') {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .update({
        tenant_id: tenantId,
        tenant_role: role
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    clearTenantCache();
    return data;
  } catch (err) {
    console.error('Error creating user context:', err);
    throw err;
  }
}
