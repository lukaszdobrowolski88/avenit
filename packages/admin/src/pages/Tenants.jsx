import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import {
  isRetiredPlan, isPublicPlan, normalizeUsage, isOverLimit, sortPlans, formatZl, limitLabel, planKey,
} from '../lib/plans.js';
import {
  PageHeader, Button, Table, TR, EmptyRow, StatusBadge, Badge, SearchInput, Segmented, Modal, Field,
  Checkbox, ErrorBox, Loading, UsageBar, Notice,
} from '../components/ui.jsx';

// Użycie (dorośli vs limit) dla listy kościołów: z wiersza listy, jeśli API je dołącza,
// inaczej z /tenants/:id/usage — po kilka zapytań naraz. Gdy endpointu nie ma (null), przestajemy pytać.
function useTenantUsages(tenants, plansByName) {
  const [usages, setUsages] = useState({});
  const [available, setAvailable] = useState(true);
  const requested = useRef(new Set());
  const missing = useRef(false);
  const plansRef = useRef(plansByName);
  plansRef.current = plansByName;
  useEffect(() => {
    if (!tenants.length) return undefined;
    const inline = {};
    tenants.forEach((t) => {
      const u = t.usage || (t.adults != null ? { adults: t.adults, limit: t.adults_limit, state: t.usage_state } : null);
      if (u) inline[t.id] = normalizeUsage(u, plansRef.current[t.plan_name]);
    });
    if (Object.keys(inline).length) { setUsages((p) => ({ ...p, ...inline })); return undefined; }
    if (missing.current) return undefined;
    const queue = tenants.filter((t) => !requested.current.has(t.id));
    queue.forEach((t) => requested.current.add(t.id));
    let alive = true;
    const worker = async () => {
      while (alive && !missing.current && queue.length) {
        const t = queue.shift();
        try {
          const u = await api.tenantUsage(t.id);
          if (u === null) { missing.current = true; if (alive) setAvailable(false); return; }
          if (alive) setUsages((p) => ({ ...p, [t.id]: normalizeUsage(u, plansRef.current[t.plan_name]) || { error: true } }));
        } catch {
          if (alive) setUsages((p) => ({ ...p, [t.id]: { error: true } }));
        }
      }
    };
    Promise.all([worker(), worker(), worker(), worker()]);
    return () => { alive = false; queue.forEach((t) => requested.current.delete(t.id)); };
  }, [tenants]);
  return { usages, available };
}

// Otwarta prośba kościoła o zmianę planu (tenants.metadata.plan_request), jeśli plan jeszcze jej nie odpowiada.
const pendingRequest = (t) => {
  const r = t.metadata?.plan_request;
  return r && r.planName !== t.plan_name ? r : null;
};

export default function Tenants() {
  const [tenants, setTenants] = useState(null);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [limitFilter, setLimitFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const load = () => { setErr(''); return api.tenants().then((r) => setTenants(r.tenants)).catch((e) => setErr(e.message)); };
  useEffect(() => { load(); api.plans().then((r) => setPlans(r.plans)).catch(() => {}); }, []);

  const plansByName = useMemo(() => Object.fromEntries(plans.map((p) => [p.name, p])), [plans]);
  const { usages, available } = useTenantUsages(tenants || [], plansByName);

  const list = tenants || [];
  const statusCount = (s) => list.filter((t) => (s === 'suspended' ? ['suspended', 'cancelled'].includes(t.status) : t.status === s)).length;
  const overCount = list.filter((t) => isOverLimit(usages[t.id])).length;
  const retiredCount = list.filter((t) => isRetiredPlan(plansByName[t.plan_name])).length;

  const q = search.trim().toLowerCase();
  const filtered = list.filter((t) => {
    if (q && !(`${t.name} ${t.slug} ${t.subdomain} ${t.email || ''}`.toLowerCase().includes(q))) return false;
    if (status === 'suspended' && !['suspended', 'cancelled'].includes(t.status)) return false;
    if (status && status !== 'suspended' && t.status !== status) return false;
    if (limitFilter === 'over' && !isOverLimit(usages[t.id])) return false;
    if (limitFilter === 'near' && usages[t.id]?.state !== 'near') return false;
    if (limitFilter === 'request' && !pendingRequest(t)) return false;
    if (limitFilter === 'retired' && !isRetiredPlan(plansByName[t.plan_name])) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Kościoły"
        subtitle="Tenanci platformy: status, plan i liczba dorosłych względem limitu planu."
        actions={<Button variant="primary" icon="plus" onClick={() => setShowNew(true)}>Nowy kościół</Button>}
      />
      <ErrorBox error={err} onRetry={load} />
      {!available && (
        <Notice tone="info">Liczba dorosłych pojawi się po wdrożeniu endpointu <code>/api/admin/tenants/:id/usage</code>.</Notice>
      )}

      <div className="toolbar">
        <SearchInput className="grow" value={search} onChange={setSearch} placeholder="Szukaj po nazwie, subdomenie, e-mailu…" />
        <div className="row row--wrap">
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            items={[
              { value: '', label: 'Wszystkie', count: list.length },
              { value: 'active', label: 'Aktywne', count: statusCount('active') },
              { value: 'trial', label: 'Trial', count: statusCount('trial') },
              { value: 'suspended', label: 'Zawieszone', count: statusCount('suspended') },
            ]}
          />
          <Segmented
            label="Limit planu"
            value={limitFilter}
            onChange={(v) => setLimitFilter(limitFilter === v ? '' : v)}
            items={[
              { value: 'over', label: 'Ponad limit', count: overCount },
              { value: 'near', label: 'Blisko limitu', count: list.filter((t) => usages[t.id]?.state === 'near').length },
              { value: 'retired', label: 'Plan wycofany', count: retiredCount },
              { value: 'request', label: 'Prośby o plan', count: list.filter(pendingRequest).length },
            ]}
          />
        </div>
      </div>

      {!tenants && !err ? <Loading /> : (
        <Table tall minWidth={820}>
          <thead>
            <tr><th>Kościół</th><th>Status</th><th>Plan</th><th style={{ width: 230 }}>Dorośli</th><th>Trial do</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <EmptyRow colSpan={5}>{list.length ? 'Brak kościołów pasujących do filtrów.' : 'Nie ma jeszcze żadnego kościoła.'}</EmptyRow>
            )}
            {filtered.map((t) => {
              const plan = plansByName[t.plan_name];
              const u = usages[t.id];
              return (
                <TR key={t.id} onClick={() => navigate(`/tenants/${t.id}`)}>
                  <td>
                    <span className="primary-cell">{t.name}</span>
                    <span className="sub">{t.subdomain}</span>
                  </td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>
                    {t.plan_name ? <span className="strong" style={{ color: 'var(--text)' }}>{t.plan_name}</span> : <span className="faint">brak planu</span>}
                    {isRetiredPlan(plan) && <> <Badge tone="warning" size="sm">wycofany</Badge></>}
                    {pendingRequest(t) && <span className="sub"><Badge tone="info" size="sm" title={pendingRequest(t).message || ''}>prośba: {pendingRequest(t).planName || pendingRequest(t).planKey}</Badge></span>}
                  </td>
                  <td>
                    {u && !u.error ? <UsageBar usage={u} mini />
                      : u?.error ? <span className="faint small" title="Baza kościoła nie odpowiedziała">brak odczytu</span>
                      : available ? <span className="faint small">…</span> : null}
                  </td>
                  <td className="muted tnum nowrap">{t.trial_ends_at && t.status === 'trial' ? new Date(t.trial_ends_at).toLocaleDateString('pl-PL') : ''}</td>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
      {showNew && <NewTenant plans={plans} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewTenant({ plans, onClose, onCreated }) {
  const offered = sortPlans(plans.filter((p) => p.is_active !== false && isPublicPlan(p) && !isRetiredPlan(p)));
  const choices = offered.length ? offered : plans;
  const [f, setF] = useState({
    name: '', slug: '', adminEmail: '', adminName: '', adminPassword: '',
    planKey: planKey(choices.find((p) => planKey(p) === 'start') || choices[0]) || 'start',
  });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const create = async () => {
    setErr(''); setLoading(true);
    try {
      setResult(await api.createTenant(f));
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  if (result) {
    return (
      <Modal title="Kościół utworzony" onClose={onCreated} footer={<Button variant="primary" onClick={onCreated}>Gotowe</Button>}>
        <p>Kościół <b>{result.tenant.name}</b> działa pod adresem <b>{result.tenant.subdomain}</b>.</p>
        {result.adminPassword && (
          <>
            <p className="muted small">Hasło administratora — zapisz je teraz, nie pokażemy go ponownie:</p>
            <div className="secret">{result.adminPassword}</div>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Nowy kościół"
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Anuluj</Button>
        <Button variant="primary" onClick={create} loading={loading} disabled={!f.name || !f.slug || !f.adminEmail}>Utwórz kościół</Button>
      </>}
    >
      <Field label="Nazwa kościoła"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Subdomena" hint={f.slug ? `${f.slug}.avenit.pl` : 'Małe litery, cyfry i myślniki.'}>
        <input value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="np. schwro" />
      </Field>
      <div className="field-row">
        <Field label="E-mail administratora"><input type="email" value={f.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} /></Field>
        <Field label="Imię i nazwisko"><input value={f.adminName} onChange={(e) => set('adminName', e.target.value)} /></Field>
      </div>
      <Field label="Hasło administratora" hint="Zostaw puste, aby wygenerować.">
        <input value={f.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Plan">
        <select value={f.planKey} onChange={(e) => set('planKey', e.target.value)}>
          {choices.map((p) => (
            <option key={p.id} value={planKey(p)}>
              {p.name} — {limitLabel(p.max_members)}, {formatZl(p.price_monthly, { from: p.is_custom })}/mies.
            </option>
          ))}
        </select>
      </Field>
      <Checkbox checked={!!f.sendWelcome} onChange={(v) => set('sendWelcome', v)}>Wyślij e-mail powitalny z danymi logowania</Checkbox>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}
