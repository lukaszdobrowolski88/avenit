// Klient API panelu administracyjnego (/api/admin/*).
// Trzyma access token w pamięci + refresh przez httpOnly cookie.
const BASE = import.meta.env.VITE_API_URL || '';

let accessToken = sessionStorage.getItem('avenit_admin_token') || null;

export function setToken(t) {
  accessToken = t;
  if (t) sessionStorage.setItem('avenit_admin_token', t);
  else sessionStorage.removeItem('avenit_admin_token');
}
export function getToken() {
  return accessToken;
}

async function request(path, { method = 'GET', body } = {}, retry = true) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry && path !== '/api/admin/refresh') {
    const ok = await tryRefresh();
    if (ok) return request(path, { method, body }, false);
    throw new Error('Sesja wygasła');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Błąd ${res.status}`);
  return data;
}

async function tryRefresh() {
  try {
    const res = await fetch(`${BASE}/api/admin/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    setToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

// Query string bez pustych wartości (filtry analityki).
const qs = (p = {}) =>
  new URLSearchParams(Object.entries(p).filter(([, v]) => v != null && v !== '')).toString();

export const api = {
  login: (email, password, totpCode) =>
    request('/api/admin/login', { method: 'POST', body: { email, password, totpCode } }),
  logout: () => request('/api/admin/logout', { method: 'POST' }),
  me: () => request('/api/admin/me'),
  dashboard: () => request('/api/admin/dashboard'),
  tenants: () => request('/api/admin/tenants'),
  tenant: (id) => request(`/api/admin/tenants/${id}`),
  createTenant: (body) => request('/api/admin/tenants', { method: 'POST', body }),
  suspendTenant: (id) => request(`/api/admin/tenants/${id}/suspend`, { method: 'POST' }),
  resumeTenant: (id) => request(`/api/admin/tenants/${id}/resume`, { method: 'POST' }),
  extendTrial: (id, days) => request(`/api/admin/tenants/${id}/extend-trial`, { method: 'POST', body: { days } }),
  changePlan: (id, planId, billingCycle) =>
    request(`/api/admin/tenants/${id}/change-plan`, { method: 'POST', body: { planId, billingCycle } }),
  toggleModule: (id, key, enabled) =>
    request(`/api/admin/tenants/${id}/modules/${key}`, { method: 'PUT', body: { is_enabled: enabled } }),
  saveModuleConfig: (id, key, body) =>
    request(`/api/admin/tenants/${id}/modules/${key}`, { method: 'PUT', body }),
  tenantConfig: (id) => request(`/api/admin/tenants/${id}/config`),
  createAppModule: (id, body) => request(`/api/admin/tenants/${id}/app-modules`, { method: 'POST', body }),
  updateAppModule: (id, mid, body) => request(`/api/admin/tenants/${id}/app-modules/${mid}`, { method: 'PUT', body }),
  deleteAppModule: (id, mid) => request(`/api/admin/tenants/${id}/app-modules/${mid}`, { method: 'DELETE' }),
  createAppTab: (id, body) => request(`/api/admin/tenants/${id}/app-tabs`, { method: 'POST', body }),
  updateAppTab: (id, tid, body) => request(`/api/admin/tenants/${id}/app-tabs/${tid}`, { method: 'PUT', body }),
  deleteAppTab: (id, tid) => request(`/api/admin/tenants/${id}/app-tabs/${tid}`, { method: 'DELETE' }),
  applyPreset: (id) => request(`/api/admin/tenants/${id}/apply-preset`, { method: 'POST' }),
  backupTenant: async (id) => {
    const res = await fetch(`${BASE}/api/admin/tenants/${id}/backup`, {
      credentials: 'include',
      headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      throw new Error(d?.error || `Błąd ${res.status}`);
    }
    const cd = res.headers.get('Content-Disposition') || '';
    const name = (cd.match(/filename="?([^"]+)"?/) || [])[1] || `backup_${id}.dump`;
    return { blob: await res.blob(), name };
  },
  plans: () => request('/api/admin/plans'),
  createPlan: (body) => request('/api/admin/plans', { method: 'POST', body }),
  updatePlan: (id, body) => request(`/api/admin/plans/${id}`, { method: 'PUT', body }),
  invoices: () => request('/api/admin/invoices'),
  createInvoice: (body) => request('/api/admin/invoices', { method: 'POST', body }),
  markPaid: (id) => request(`/api/admin/invoices/${id}/mark-paid`, { method: 'POST' }),
  cancelInvoice: (id) => request(`/api/admin/invoices/${id}/cancel`, { method: 'POST' }),
  coupons: () => request('/api/admin/coupons'),
  createCoupon: (body) => request('/api/admin/coupons', { method: 'POST', body }),
  updateCoupon: (id, body) => request(`/api/admin/coupons/${id}`, { method: 'PUT', body }),
  deleteCoupon: (id) => request(`/api/admin/coupons/${id}`, { method: 'DELETE' }),
  audit: () => request('/api/admin/audit'),
  admins: () => request('/api/admin/admins'),
  createAdmin: (body) => request('/api/admin/admins', { method: 'POST', body }),
  runDunning: () => request('/api/admin/dunning/run', { method: 'POST' }),
  // Impersonacja
  tenantUsers: (id) => request(`/api/admin/tenants/${id}/users`),
  impersonate: (id, userId) => request(`/api/admin/tenants/${id}/impersonate`, { method: 'POST', body: { userId } }),
  // System / monitoring
  system: () => request('/api/admin/system'),
  growth: () => request('/api/admin/growth'),
  integrationsStatus: () => request('/api/admin/integrations-status'),
  // Wyszukiwarka
  search: (q) => request(`/api/admin/search?q=${encodeURIComponent(q)}`),
  // E-mail
  emailTenant: (id, body) => request(`/api/admin/tenants/${id}/email`, { method: 'POST', body }),
  broadcastEmail: (body) => request('/api/admin/broadcast-email', { method: 'POST', body }),
  // Reset hasła konta tenanta
  resetUserPassword: (id, userId) => request(`/api/admin/tenants/${id}/reset-user-password`, { method: 'POST', body: { userId } }),
  // Notatki o tenancie
  saveTenantNotes: (id, notes) => request(`/api/admin/tenants/${id}/notes`, { method: 'PUT', body: { notes } }),
  // 2FA admina
  twofaSetup: () => request('/api/admin/2fa/setup', { method: 'POST' }),
  twofaEnable: (body) => request('/api/admin/2fa/enable', { method: 'POST', body }),
  twofaDisable: (code) => request('/api/admin/2fa/disable', { method: 'POST', body: { code } }),
  // Audit z filtrami
  auditFiltered: (params) => request(`/api/admin/audit?${new URLSearchParams(params)}`),
  // Zgłoszenia ze strony avenit.pl
  landingLeads: (status) => request(`/api/admin/landing-leads${status ? `?status=${status}` : ''}`),
  updateLead: (id, body) => request(`/api/admin/landing-leads/${id}`, { method: 'PATCH', body }),
  deleteLead: (id) => request(`/api/admin/landing-leads/${id}`, { method: 'DELETE' }),
  // Analityka (GA-style + identyfikacja odwiedzających)
  analyticsOverview: (p) => request(`/api/admin/analytics/overview?${qs(p)}`),
  analyticsRealtime: (p) => request(`/api/admin/analytics/realtime?${qs(p)}`),
  analyticsSources: (p) => request(`/api/admin/analytics/sources?${qs(p)}`),
  analyticsPages: (p) => request(`/api/admin/analytics/pages?${qs(p)}`),
  analyticsGeo: (p) => request(`/api/admin/analytics/geo?${qs(p)}`),
  analyticsDevices: (p) => request(`/api/admin/analytics/devices?${qs(p)}`),
  analyticsVisitors: (p) => request(`/api/admin/analytics/visitors?${qs(p)}`),
  analyticsVisitor: (id) => request(`/api/admin/analytics/visitors/${id}`),
  analyticsTenants: (p) => request(`/api/admin/analytics/tenants?${qs(p)}`),
  // Ogłoszenia
  announcements: () => request('/api/admin/announcements'),
  createAnnouncement: (body) => request('/api/admin/announcements', { method: 'POST', body }),
  updateAnnouncement: (id, body) => request(`/api/admin/announcements/${id}`, { method: 'PUT', body }),
  deleteAnnouncement: (id) => request(`/api/admin/announcements/${id}`, { method: 'DELETE' }),
};

export const formatBytes = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

export const formatPLN = (grosze) => `${((grosze || 0) / 100).toFixed(2)} zł`;

// Sekundy → "2 min 15 s" (czasy wizyt w analityce).
export const formatDuration = (s) => {
  s = Math.max(0, Math.round(s || 0));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
