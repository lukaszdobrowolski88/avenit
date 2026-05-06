/**
 * Factory do tworzenia kontekstu tenanta
 * Platform-agnostic - przyjmuje supabase client i getCachedUser
 */
export function createTenantContext(supabase, getCachedUser) {
  let tenantCache = null;
  let subscriptionCache = null;
  let cacheTimestamp = 0;
  const CACHE_TTL = 5 * 60 * 1000; // 5 minut

  async function getCurrentTenant() {
    const now = Date.now();
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

      if (!appUser?.tenant_id) return null;

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

  async function getTenantSubscription(tenantId = null) {
    const now = Date.now();
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

  async function checkFeature(feature) {
    const subscription = await getTenantSubscription();
    if (!subscription) return false;
    return subscription.features?.[feature] === true;
  }

  async function checkLimit(resource, currentCount = 0) {
    const subscription = await getTenantSubscription();
    if (!subscription) {
      return { allowed: false, limit: 0, current: currentCount };
    }

    const limit = subscription[`max_${resource}`];
    if (limit === -1) {
      return { allowed: true, limit: -1, current: currentCount };
    }
    return { allowed: currentCount < limit, limit, current: currentCount };
  }

  async function isSuperAdmin() {
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
    } catch { return false; }
  }

  async function hasTenantAccess() {
    const tenant = await getCurrentTenant();
    if (!tenant) return false;
    if (tenant.isSuperAdmin) return true;
    if (tenant.status === 'suspended' || tenant.status === 'cancelled') return false;

    const subscription = await getTenantSubscription();
    if (!subscription) return false;
    return ['trialing', 'active', 'past_due'].includes(subscription.status);
  }

  function clearTenantCache() {
    tenantCache = null;
    subscriptionCache = null;
    cacheTimestamp = 0;
  }

  return {
    getCurrentTenant,
    getTenantSubscription,
    checkFeature,
    checkLimit,
    isSuperAdmin,
    hasTenantAccess,
    clearTenantCache,
  };
}
