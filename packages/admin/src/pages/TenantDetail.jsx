import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formatPLN } from '../lib/api.js';
import {
  isRetiredPlan, isCustomPlan, isPublicPlan, sortPlans, suggestPlan, normalizeUsage, planKey,
  formatZl, limitLabel, zlToGrosze, groszeToZl, bufferPct,
} from '../lib/plans.js';
import {
  PageHeader, Button, Card, Stat, StatusBadge, Badge, Modal, Field, AffixInput, Table, EmptyRow,
  Loading, ErrorBox, Notice, Toggle, UsageBar, SectionHead, useToast, Segmented,
} from '../components/ui.jsx';
import TenantModulesConfig from './TenantModulesConfig.jsx';

// Klucze modułów systemowych (do przełączania per tenant).
const MODULE_KEYS = [
  'dashboard', 'programs', 'calendar', 'members', 'worship', 'media', 'atmosfera',
  'kids', 'homegroups', 'finance', 'teaching', 'prayer', 'komunikator',
  'mlodziezowka', 'mailing', 'mail', 'forms', 'push_campaigns', 'sms_campaigns', 'settings',
];

const CYCLE_LABEL = { monthly: 'miesięczny', yearly: 'roczny' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('pl-PL') : '—');

export default function TenantDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(undefined); // undefined = ładowanie, null = brak endpointu
  const [usageErr, setUsageErr] = useState('');
  const [err, setErr] = useState('');
  const [toast, showToast] = useToast();
  // Ustawienie wstępne okna „Zmień plan” (z prośby albo sugestii dla planu z wyceną indywidualną).
  const [preset, setPreset] = useState(null);

  const load = () => api.tenant(id).then(setData).catch((e) => setErr(e.message));
  const loadUsage = () => api.tenantUsage(id).then((u) => setUsage(u)).catch((e) => { setUsage(null); setUsageErr(e.message); });
  useEffect(() => {
    setData(null); setErr(''); setUsage(undefined); setUsageErr('');
    load(); loadUsage();
    api.plans().then((r) => setPlans(r.plans)).catch(() => {});
  }, [id]);

  if (err && !data) return <><PageHeader title="Kościół" back="/tenants" /><ErrorBox error={err} onRetry={load} /></>;
  if (!data) return <><PageHeader title="Kościół" back="/tenants" /><Loading /></>;
  const { tenant, subscription, invoices, modules, usage: counts } = data;
  const disabled = new Set(modules.filter((m) => !m.is_enabled).map((m) => m.module_key));

  const act = async (fn, okMsg) => {
    try { await fn(); showToast(okMsg); await load(); loadUsage(); }
    catch (e) { showToast(e.message, 'error'); }
  };

  const toggleModule = (key) => {
    const nowEnabled = disabled.has(key); // był wyłączony → włączamy
    act(() => api.toggleModule(id, key, nowEnabled), nowEnabled ? `Włączono: ${key}` : `Wyłączono: ${key}`);
  };

  const downloadBackup = async () => {
    showToast('Generowanie backupu…');
    try {
      const { blob, name } = await api.backupTenant(id);
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(u);
      showToast('Backup pobrany');
    } catch (e) { showToast(e.message, 'error'); }
  };

  const currentPlan = plans.find((p) => p.id === subscription?.plan_id) || plans.find((p) => p.name === subscription?.plan_name);
  // counted=false → baza tenanta nie odpowiedziała (adults=0 nic nie znaczy).
  const u = usage && usage.counted === false ? null : normalizeUsage(usage, currentPlan);
  const suggestedKey = usage?.suggestedPlan?.key;
  const suggested = (suggestedKey && plans.find((p) => planKey(p) === suggestedKey)) || (u ? suggestPlan(plans, u.adults) : null);
  const retired = !!usage?.planRetired || isRetiredPlan(currentPlan);
  const needsChange = suggested && currentPlan && suggested.id !== currentPlan.id && (retired || u?.state === 'over_buffer');
  const cycle = subscription?.billing_cycle || 'monthly';

  // Prośba kościoła o zmianę planu (tenants.metadata.plan_request) — znika, gdy plan już pasuje.
  const req = tenant.metadata?.plan_request;
  const reqPlan = req && plans.find((p) => planKey(p) === req.planKey);
  const reqPending = req && !(currentPlan && planKey(currentPlan) === req.planKey && cycle === (req.billingCycle || 'monthly'));

  const switchTo = (plan, toCycle = cycle) => {
    if (isCustomPlan(plan)) { setPreset({ planId: plan.id, cycle: toCycle, n: Date.now() }); return; }
    if (!confirm(`Zmienić plan „${tenant.name}” z „${currentPlan?.name || '—'}” na „${plan.name}” (cykl ${CYCLE_LABEL[toCycle] || toCycle})?`)) return;
    act(() => api.changePlan(id, plan.id, toCycle), `Plan zmieniony na ${plan.name}`);
  };

  return (
    <div>
      <PageHeader
        back="/tenants"
        title={tenant.name}
        badge={<StatusBadge status={tenant.status} />}
        subtitle={<a href={`https://${tenant.subdomain}.avenit.pl`} target="_blank" rel="noreferrer">{tenant.subdomain}.avenit.pl</a>}
        actions={<>
          <Impersonate tenantId={id} subdomain={tenant.subdomain} onError={(m) => showToast(m, 'error')} />
          <TenantEmail tenantId={id} tenantName={tenant.name} onDone={() => showToast('E-mail wysłany')} onError={(m) => showToast(m, 'error')} />
        </>}
      />

      {reqPending && (
        <Notice
          tone="accent"
          icon="inbox"
          action={reqPlan && <Button size="sm" variant="primary" onClick={() => switchTo(reqPlan, req.billingCycle || 'monthly')}>Przenieś na plan {reqPlan.name}</Button>}
        >
          <b>Prośba o zmianę planu</b> z {req.requestedAt ? fmtDate(req.requestedAt) : '—'}{req.requestedBy ? ` (${req.requestedBy})` : ''}:
          {' '}<b>{req.planName || req.planKey}</b>, cykl {CYCLE_LABEL[req.billingCycle] || 'miesięczny'}{req.adults != null ? `, dorosłych: ${req.adults}` : ''}.
          {req.message && <div className="small" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>„{req.message}”</div>}
        </Notice>
      )}

      {needsChange && (
        <Notice
          tone={retired ? 'accent' : 'warning'}
          action={<Button size="sm" variant="primary" onClick={() => switchTo(suggested)}>Przenieś na plan {suggested.name}</Button>}
        >
          {retired
            ? <>Plan <b>{currentPlan.name}</b> jest wycofany. Sugerowany plan według liczby dorosłych{u ? ` (${u.adults})` : ''}: <b>{suggested.name}</b> ({limitLabel(suggested.max_members)}, {formatZl(suggested.price_monthly, { from: isCustomPlan(suggested) })}/mies.).</>
            : <>Kościół przekracza limit planu wraz z buforem. Sugerowany plan: <b>{suggested.name}</b> ({limitLabel(suggested.max_members)}).</>}
        </Notice>
      )}

      <div className="grid2 mb">
        <Card
          title="Plan i rozliczenie"
          actions={<ChangePlan tenantId={id} plans={plans} subscription={subscription} currentPlan={currentPlan} usage={usage} preset={preset}
            onDone={(name) => { showToast(`Plan zmieniony na ${name}`); load(); loadUsage(); }} onError={(m) => showToast(m, 'error')} />}
        >
          <div className="row row--wrap" style={{ marginBottom: 14 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{subscription?.plan_name || 'Brak planu'}</span>
            {retired && <Badge tone="warning">wycofany</Badge>}
            {subscription && <StatusBadge status={subscription.status} />}
          </div>
          <dl className="kv">
            <dt>Cykl</dt><dd>{CYCLE_LABEL[cycle] || cycle}</dd>
            {currentPlan && <><dt>Cena</dt><dd className="tnum">{priceLine(currentPlan, cycle, subscription)}</dd></>}
            {subscription?.current_period_end && <><dt>Okres do</dt><dd className="tnum">{fmtDate(subscription.current_period_end)}</dd></>}
            {tenant.status === 'trial' && <><dt>Trial do</dt><dd className="tnum">{fmtDate(tenant.trial_ends_at)}</dd></>}
            {currentPlan && <><dt>Bufor</dt><dd>{bufferPct(currentPlan)}% ponad limit</dd></>}
          </dl>
        </Card>

        <Card title="Dorośli w bazie członków" subtitle="Liczą się dorośli; dzieci, goście i osoby zarchiwizowane — nie.">
          {usage === undefined && <Loading>Liczenie…</Loading>}
          {usage !== undefined && u && (
            <>
              <UsageBar usage={u} />
              {u.approximate && <div className="small muted" style={{ marginTop: 8 }}><Badge size="sm">szacunkowo</Badge> części dat urodzenia nie dało się odczytać.</div>}
              <div className="small muted" style={{ marginTop: 10 }}>
                {u.state === 'unlimited' ? 'Plan bez limitu dorosłych.'
                  : <>Limit {u.limit}, z buforem {u.bufferLimit}. {u.pct != null && <>Wykorzystanie {u.pct}%.</>}</>}
                {suggested && currentPlan && suggested.id !== currentPlan.id && !needsChange && (
                  <> Pasujący plan: <b>{suggested.name}</b>.</>
                )}
              </div>
            </>
          )}
          {usage !== undefined && !u && (
            <div className="small muted">
              {usageErr ? `Nie udało się policzyć dorosłych: ${usageErr}`
                : usage?.counted === false ? 'Baza tego kościoła nie odpowiedziała — nie da się teraz policzyć dorosłych.'
                : 'Licznik dorosłych nie jest jeszcze dostępny w API.'}
              {counts && <> Wszystkich osób w bazie: <b>{counts.members}</b>.</>}
            </div>
          )}
        </Card>
      </div>

      {usage?.history?.length > 0 && <UsageHistory history={usage.history} />}

      <div className="stats">
        <Stat label="Osoby w bazie" value={counts ? counts.members : '—'} hint="Wszystkie rekordy członków" />
        <Stat label="Konta użytkowników" value={counts ? counts.users : '—'} />
        <Stat label="Grupy" value={counts ? counts.groups : '—'} />
        <Stat label="Baza danych" value={tenant.db_name} small />
      </div>

      <Card title="Akcje administracyjne" className="mb">
        <div className="row row--wrap">
          {tenant.status === 'suspended'
            ? <Button icon="play" onClick={() => act(() => api.resumeTenant(id), 'Wznowiono')}>Wznów</Button>
            : <Button variant="danger" icon="pause" onClick={() => confirm(`Zawiesić „${tenant.name}”? Użytkownicy stracą dostęp.`) && act(() => api.suspendTenant(id), 'Zawieszono')}>Zawieś</Button>}
          <Button icon="clock" onClick={() => act(() => api.extendTrial(id, 14), 'Trial przedłużony o 14 dni')}>Przedłuż trial o 14 dni</Button>
          <Button icon="download" onClick={downloadBackup}>Pobierz backup</Button>
        </div>
      </Card>

      <Card title="Notatki wewnętrzne" subtitle="Widoczne tylko dla administratorów platformy. Zapis po wyjściu z pola." className="mb">
        <textarea
          defaultValue={tenant.admin_notes || ''}
          placeholder="Ustalenia, cena indywidualna, osoba kontaktowa…"
          rows={3}
          aria-label="Notatki wewnętrzne"
          onBlur={(e) => { if (e.target.value !== (tenant.admin_notes || '')) act(() => api.saveTenantNotes(id, e.target.value), 'Notatki zapisane'); }}
        />
      </Card>

      <SectionHead title="Moduły" subtitle="Włączanie i wyłączanie modułów systemowych dla tego kościoła." />
      <div className="module-grid">
        {MODULE_KEYS.map((key) => {
          const on = !disabled.has(key);
          return (
            <div key={key} className={`module-tile${on ? '' : ' is-off'}`} onClick={() => toggleModule(key)}>
              <span className="mono">{key}</span>
              <Toggle checked={on} onChange={() => toggleModule(key)} title={`${key}: ${on ? 'wyłącz' : 'włącz'}`} />
            </div>
          );
        })}
      </div>

      <TenantModulesConfig tenantId={id} />

      <SectionHead title="Faktury" />
      <Table minWidth={520}>
        <thead><tr><th>Numer</th><th className="num">Kwota</th><th>Status</th><th>Termin</th></tr></thead>
        <tbody>
          {invoices.length === 0 && <EmptyRow colSpan={4}>Brak faktur</EmptyRow>}
          {invoices.map((i) => (
            <tr key={i.id}>
              <td className="primary-cell">{i.invoice_number}</td>
              <td className="num">{formatPLN(i.total)}</td>
              <td><StatusBadge status={i.status} kind="invoice" /></td>
              <td className="muted tnum">{i.due_date ? fmtDate(i.due_date) : ''}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {toast}
    </div>
  );
}

// Historia miesięcznych odczytów (tenant_usage_snapshots) — najnowsze pierwsze w API.
function UsageHistory({ history }) {
  const rows = [...history].reverse();
  const max = Math.max(1, ...rows.map((h) => Math.max(h.adults || 0, h.plan_limit > 0 ? h.plan_limit : 0)));
  const label = (p) => new Date(p).toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' });
  return (
    <Card title="Dorośli — historia" subtitle="Odczyt z początku każdego miesiąca" className="mb">
      <div className="bars" style={{ height: 96 }} role="img"
        aria-label={rows.map((h) => `${label(h.period)}: ${h.adults}${h.plan_limit > 0 ? ` z ${h.plan_limit}` : ''}`).join(', ')}>
        {rows.map((h) => (
          <div key={h.period} className={`bar${h.adults ? ' has' : ''}`}
            style={{ height: `${((h.adults || 0) / max) * 100}%`, background: ['over', 'over_buffer'].includes(h.state) ? 'var(--danger)' : undefined }}
            title={`${label(h.period)}: ${h.adults}${h.plan_limit > 0 ? ` z ${h.plan_limit}` : ''} (${h.plan_key || '—'})`} />
        ))}
      </div>
      <div className="bars-x" aria-hidden="true">{rows.map((h) => <span key={h.period}>{label(h.period)}</span>)}</div>
    </Card>
  );
}

function priceLine(plan, cycle, sub) {
  const custom = cycle === 'yearly' ? sub?.custom_price_yearly : sub?.custom_price_monthly;
  if (custom != null) return `${formatZl(custom)} / ${cycle === 'yearly' ? 'rok' : 'mies.'} (indywidualna)`;
  if (cycle === 'yearly') return plan.price_yearly != null ? `${formatZl(plan.price_yearly)} / rok` : 'wycena indywidualna';
  return `${formatZl(plan.price_monthly, { from: isCustomPlan(plan) })} / mies.`;
}

function Impersonate({ tenantId, subdomain, onError }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetInfo, setResetInfo] = useState(null);

  const openPicker = async () => {
    setOpen(true); setUsers(null);
    try { const r = await api.tenantUsers(tenantId); setUsers(r.users || []); }
    catch (e) { onError(e.message); setOpen(false); }
  };

  const go = async (userId) => {
    setLoading(true);
    try {
      const r = await api.impersonate(tenantId, userId);
      if (r.redirect) window.open(r.redirect, '_blank');
      setOpen(false);
    } catch (e) { onError(e.message); } finally { setLoading(false); }
  };

  const resetPass = async (userId) => {
    if (!confirm('Zresetować hasło tego konta? Zostanie wygenerowane nowe.')) return;
    try { const r = await api.resetUserPassword(tenantId, userId); setResetInfo(r); }
    catch (e) { onError(e.message); }
  };

  const close = () => { setOpen(false); setResetInfo(null); };

  return (
    <>
      <Button icon="external" onClick={openPicker}>Zaloguj się jako</Button>
      {open && (
        <Modal title={resetInfo ? 'Nowe hasło' : 'Konta użytkowników'} onClose={close} wide={!resetInfo}
          footer={resetInfo ? <Button variant="primary" onClick={() => setResetInfo(null)}>Gotowe</Button> : null}>
          {resetInfo ? (
            <div>
              <p>Nowe hasło dla <b>{resetInfo.email}</b>:</p>
              <div className="secret">{resetInfo.password}</div>
              <p className="muted small">Przekaż je użytkownikowi bezpiecznym kanałem — nie pokażemy go ponownie.</p>
            </div>
          ) : (
            <>
              <p className="muted small">
                „Wejdź” otworzy nową kartę zalogowaną jako to konto w <b>{subdomain}.avenit.pl</b> (bilet jednorazowy, 60 s).
              </p>
              {users === null && <Loading />}
              {users && users.length === 0 && <div className="muted">Brak kont.</div>}
              {users && users.length > 0 && (
                <Table flush>
                  <tbody>
                    {users.map((usr) => (
                      <tr key={usr.id} style={{ opacity: usr.is_active ? 1 : 0.5 }}>
                        <td>
                          <span className="primary-cell">{usr.full_name || usr.email}</span>
                          {usr.is_super_admin && <> <Badge tone="accent" size="sm">admin</Badge></>}
                          <span className="sub">{usr.email} · {usr.role}</span>
                        </td>
                        <td className="actions">
                          <Button size="sm" variant="ghost" icon="key" onClick={() => resetPass(usr.id)} title="Reset hasła" aria-label={`Reset hasła: ${usr.email}`} />
                          <Button size="sm" variant="primary" disabled={loading || !usr.is_active} onClick={() => go(usr.id)}>Wejdź</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function TenantEmail({ tenantId, tenantName, onDone, onError }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try { await api.emailTenant(tenantId, f); setOpen(false); setF({ subject: '', body: '' }); onDone(); }
    catch (e) { onError(e.message); } finally { setSending(false); }
  };
  return (
    <>
      <Button icon="mail" onClick={() => setOpen(true)}>Wyślij e-mail</Button>
      {open && (
        <Modal
          title={`E-mail do: ${tenantName}`}
          onClose={() => setOpen(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
            <Button variant="primary" onClick={send} loading={sending} disabled={!f.subject || !f.body}>Wyślij</Button>
          </>}
        >
          <p className="muted small">Trafi do administratorów tego kościoła.</p>
          <Field label="Temat"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Treść"><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={6} /></Field>
        </Modal>
      )}
    </>
  );
}

function ChangePlan({ tenantId, plans, subscription, currentPlan, usage, preset, onDone, onError }) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const [custom, setCustom] = useState({ monthly: '', yearly: '' });
  const [saving, setSaving] = useState(false);
  // Cena indywidualna działa tylko, gdy API zwraca te kolumny w subskrypcji.
  const customSupported = (!!usage && 'customPriceMonthly' in usage)
    || (!!subscription && ('custom_price_monthly' in subscription || 'custom_price_yearly' in subscription));

  const start = (pre) => {
    setPlanId(pre?.planId || currentPlan?.id || '');
    setCycle(pre?.cycle || subscription?.billing_cycle || 'monthly');
    setCustom({
      monthly: groszeToZl(subscription?.custom_price_monthly ?? usage?.customPriceMonthly),
      yearly: groszeToZl(subscription?.custom_price_yearly ?? usage?.customPriceYearly),
    });
    setOpen(true);
  };
  const lastPreset = useRef(null);
  useEffect(() => {
    if (preset && preset.n !== lastPreset.current) { lastPreset.current = preset.n; start(preset); }
  }, [preset]);

  const offered = sortPlans(plans.filter((p) => isPublicPlan(p) && !isRetiredPlan(p)));
  const retired = plans.filter((p) => isRetiredPlan(p));
  const selected = plans.find((p) => p.id === planId);
  const showCustom = selected && isCustomPlan(selected);
  // Plan z wyceną indywidualną wymaga ceny dla wybranego cyklu (API zwróci 400 bez niej).
  const missingCustom = showCustom && customSupported && !(zlToGrosze(cycle === 'yearly' ? custom.yearly : custom.monthly) > 0);

  const save = async () => {
    setSaving(true);
    try {
      const extra = showCustom && customSupported
        ? { customPriceMonthly: zlToGrosze(custom.monthly), customPriceYearly: zlToGrosze(custom.yearly) }
        : {};
      await api.changePlan(tenantId, planId, cycle, extra);
      setOpen(false);
      onDone(selected?.name || 'nowy plan');
    } catch (e) { onError(e.message); } finally { setSaving(false); }
  };

  const opt = (p) => (
    <option key={p.id} value={p.id}>
      {p.name} — {limitLabel(p.max_members)} · {formatZl(p.price_monthly, { from: isCustomPlan(p) })}/mies.{p.price_yearly != null ? ` · ${formatZl(p.price_yearly)}/rok` : ''}
    </option>
  );

  return (
    <>
      <Button size="sm" icon="edit" onClick={() => start()}>Zmień plan</Button>
      {open && (
        <Modal
          title="Zmień plan"
          onClose={() => setOpen(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!planId || missingCustom}>Zapisz</Button>
          </>}
        >
          <Field label="Plan">
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">— wybierz —</option>
              {offered.map(opt)}
              {retired.length > 0 && <optgroup label="Wycofane">{retired.map(opt)}</optgroup>}
            </select>
          </Field>
          <Field label="Cykl rozliczenia">
            <Segmented label="Cykl" value={cycle} onChange={setCycle}
              items={[{ value: 'monthly', label: 'Miesięczny' }, { value: 'yearly', label: 'Roczny (2 mies. gratis)' }]} />
          </Field>
          {selected && isRetiredPlan(selected) && <Notice tone="warning">Ten plan jest wycofany — nie oferuj go nowym kościołom.</Notice>}
          {showCustom && (customSupported ? (
            <div className="field-row">
              <Field label="Cena indywidualna / mies." hint={cycle === 'monthly' ? 'Brutto. Wymagana przy cyklu miesięcznym.' : 'Brutto.'}><AffixInput affix="zł" inputMode="decimal" value={custom.monthly} onChange={(e) => setCustom({ ...custom, monthly: e.target.value })} /></Field>
              <Field label="Cena indywidualna / rok" hint={cycle === 'yearly' ? 'Brutto. Wymagana przy cyklu rocznym.' : 'Brutto.'}><AffixInput affix="zł" inputMode="decimal" value={custom.yearly} onChange={(e) => setCustom({ ...custom, yearly: e.target.value })} /></Field>
            </div>
          ) : (
            <Notice tone="info">Plan z wyceną indywidualną. API nie obsługuje jeszcze ceny per kościół — zapisz ustaloną kwotę w notatkach wewnętrznych.</Notice>
          ))}
          <p className="muted small">Zgodnie z cennikiem zmiana planu obowiązuje od następnego okresu rozliczeniowego — uwzględnij to przy fakturze.</p>
        </Modal>
      )}
    </>
  );
}
