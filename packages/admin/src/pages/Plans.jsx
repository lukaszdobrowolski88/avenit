import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import {
  isPublicPlan, isRetiredPlan, isCustomPlan, isPrioritySupport, bufferPct, sortPlans, suggestPlan,
  formatZl, zlToGrosze, groszeToZl, planKey, DEFAULT_BUFFER_PCT,
} from '../lib/plans.js';
import {
  PageHeader, Button, Badge, Table, EmptyRow, Modal, Field, AffixInput, Toggle, Loading, ErrorBox,
  EmptyState, Notice, useToast, SectionHead,
} from '../components/ui.jsx';

export default function Plans() {
  const [plans, setPlans] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [toast, showToast] = useToast();
  const load = () => api.plans().then((r) => setPlans(r.plans)).catch((e) => setErr(e.message));
  useEffect(() => { load(); api.tenants().then((r) => setTenants(r.tenants || [])).catch(() => {}); }, []);

  // Ilu kościołów (z aktywną subskrypcją) używa planu — z API, jeśli podaje, inaczej z listy tenantów.
  const usedBy = useMemo(() => {
    const m = {};
    tenants.forEach((t) => { if (t.plan_name) m[t.plan_name] = (m[t.plan_name] || 0) + 1; });
    return m;
  }, [tenants]);
  const countFor = (p) => p.tenant_count ?? p.tenants_count ?? usedBy[p.name] ?? 0;

  if (err && !plans) return <><PageHeader title="Plany" /><ErrorBox error={err} onRetry={load} /></>;
  if (!plans) return <><PageHeader title="Plany" /><Loading /></>;

  const retired = plans.filter(isRetiredPlan);
  const offered = sortPlans(plans.filter((p) => isPublicPlan(p) && !isRetiredPlan(p)));
  const hidden = plans.filter((p) => !retired.includes(p) && !offered.includes(p));
  const standard = offered.filter((p) => !isCustomPlan(p));
  const custom = offered.filter(isCustomPlan);
  const retiredTenants = retired.reduce((a, p) => a + countFor(p), 0);

  return (
    <div>
      <PageHeader
        title="Plany"
        subtitle="Cennik avenit.pl: płaci się za liczbę dorosłych w bazie członków. Wszystkie moduły i bez limitu kont w każdym planie. Ceny brutto."
        actions={<Button variant="primary" icon="plus" onClick={() => setEdit({})}>Nowy plan</Button>}
      />

      {offered.length === 0 ? (
        <EmptyState icon="layers" title="Brak planów z nowego cennika">
          Po migracji bazy platformy pojawią się tu Start, Wspólnota, Kościół, Kościół+ i Sieć.
        </EmptyState>
      ) : (
        <div className="plans-grid">
          {standard.map((p) => <PlanCard key={p.id} plan={p} tenants={countFor(p)} onEdit={() => setEdit(p)} />)}
          {custom.map((p) => <PlanCard key={p.id} plan={p} tenants={countFor(p)} onEdit={() => setEdit(p)} wide />)}
        </div>
      )}

      <p className="muted small" style={{ marginTop: 12 }}>
        Rocznie = 10 × cena miesięczna (2 miesiące gratis) i darmowa migracja danych. Bufor: kościół może przekroczyć limit o podany procent, zanim zaproponujemy wyższy plan. Nikt nie jest blokowany.
      </p>

      {hidden.length > 0 && (
        <>
          <SectionHead title="Plany niepubliczne" subtitle="Aktywne, ale niewidoczne w cenniku." />
          <PlanTable plans={hidden} countFor={countFor} onEdit={setEdit} />
        </>
      )}

      {retired.length > 0 && (
        <details className="retired">
          <summary>
            <Icon name="chevronDown" size={18} />
            Plany wycofane
            <Badge>{retired.length}</Badge>
            {retiredTenants > 0
              ? <Badge tone="warning">{retiredTenants} {retiredTenants === 1 ? 'kościół' : 'kościołów'} nadal korzysta</Badge>
              : <span className="muted small" style={{ fontWeight: 500 }}>nikt już z nich nie korzysta</span>}
          </summary>
          <div className="retired-body">
            <Notice tone="info">
              Subskrypcje na wycofanych planach nie zmieniają się same (bezpieczeństwo rozliczeń). Zmień plan w karcie kościoła — panel podpowie nowy plan według liczby dorosłych.
            </Notice>
            <PlanTable plans={retired} countFor={countFor} onEdit={setEdit} suggest={(p) => suggestPlan(plans, p.max_members > 0 ? p.max_members : null)} flush />
          </div>
        </details>
      )}

      {edit && <PlanForm plan={edit} onClose={() => setEdit(null)} onSaved={(name) => { setEdit(null); load(); showToast(`Zapisano plan ${name}`); }} />}
      {toast}
    </div>
  );
}

function PlanCard({ plan: p, tenants, onEdit, wide }) {
  const custom = isCustomPlan(p);
  const off = p.is_active === false;
  const meta = (
    <div className="plan-meta">
      <span className="tag">bufor {bufferPct(p)}%</span>
      {isPrioritySupport(p) && <span className="tag">priorytetowe wsparcie</span>}
      <span className="tag">trial {p.trial_days ?? 14} dni</span>
      {off && <Badge tone="neutral" size="sm">nieaktywny</Badge>}
    </div>
  );
  const foot = (
    <div className="plan-foot">
      <span className="small muted">{tenants} {tenants === 1 ? 'kościół' : 'kościołów'}</span>
      <Button size="sm" icon="edit" onClick={onEdit}>Edytuj</Button>
    </div>
  );
  if (wide) {
    return (
      <div className={`plan-card plan-card--wide${off ? ' is-off' : ''}`}>
        <div>
          <div className="plan-name">{p.name}{custom && <Badge tone="accent" size="sm">wycena indywidualna</Badge>}</div>
          <div className="plan-size">{p.max_members > 0 ? <>do <b>{p.max_members}</b> dorosłych</> : <>powyżej 1000 dorosłych, wiele lokalizacji</>}</div>
          {p.description && <div className="small muted" style={{ marginTop: 4 }}>{p.description}</div>}
        </div>
        <div>
          <div className="plan-price"><b>{formatZl(p.price_monthly, { from: custom })}</b><span>/ mies.</span></div>
          <div className="plan-yearly">{p.price_yearly != null ? `${formatZl(p.price_yearly)} / rok` : 'rocznie: indywidualnie'}</div>
        </div>
        <div>{meta}{foot}</div>
      </div>
    );
  }
  return (
    <div className={`plan-card${off ? ' is-off' : ''}`}>
      <div className="plan-name">{p.name}</div>
      <div className="plan-size">{p.max_members > 0 ? <>do <b>{p.max_members}</b> dorosłych</> : <>bez limitu dorosłych</>}</div>
      <div className="plan-price"><b>{formatZl(p.price_monthly, { from: custom })}</b><span>/ mies.</span></div>
      <div className="plan-yearly">
        {p.price_yearly != null ? `${formatZl(p.price_yearly)} / rok` : 'rocznie: indywidualnie'}
        {p.price_yearly != null && p.price_monthly > 0 && <> · {formatZl(Math.round(p.price_yearly / 12))}/mies.</>}
      </div>
      {meta}
      {foot}
    </div>
  );
}

function PlanTable({ plans, countFor, onEdit, suggest, flush }) {
  return (
    <Table flush={flush} minWidth={680}>
      <thead>
        <tr>
          <th>Plan</th><th className="num">Cena / mies.</th><th className="num">Cena / rok</th><th>Limit członków</th>
          <th className="num">Kościoły</th>{suggest && <th>Odpowiednik</th>}<th></th>
        </tr>
      </thead>
      <tbody>
        {plans.length === 0 && <EmptyRow colSpan={suggest ? 7 : 6}>Brak</EmptyRow>}
        {plans.map((p) => {
          const n = countFor(p);
          const s = suggest?.(p);
          return (
            <tr key={p.id}>
              <td><span className="primary-cell">{p.name}</span><span className="sub mono">{planKey(p)}</span></td>
              <td className="num">{formatZl(p.price_monthly)}</td>
              <td className="num">{p.price_yearly != null ? formatZl(p.price_yearly) : ''}</td>
              <td className="muted">{p.max_members > 0 ? p.max_members : 'bez limitu'}</td>
              <td className="num">{n > 0 ? <Badge tone="warning" size="sm">{n}</Badge> : <span className="faint">0</span>}</td>
              {suggest && <td>{s ? <span className="small">{s.name} <span className="muted">(wg limitu)</span></span> : ''}</td>}
              <td className="actions"><Button size="sm" variant="ghost" onClick={() => onEdit(p)}>Edytuj</Button></td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function PlanForm({ plan, onClose, onSaved }) {
  const isNew = !plan.id;
  const [f, setF] = useState({
    name: plan.name || '',
    slug: plan.slug || '',
    description: plan.description || '',
    price_monthly: groszeToZl(plan.price_monthly ?? (isNew ? null : 0)),
    price_yearly: groszeToZl(plan.price_yearly),
    max_members: plan.max_members ?? -1,
    limit_buffer_pct: plan.limit_buffer_pct ?? DEFAULT_BUFFER_PCT,
    trial_days: plan.trial_days ?? 14,
    is_custom: isCustomPlan(plan) && plan.is_custom !== false,
    priority_support: isPrioritySupport(plan),
    is_active: plan.is_active !== false,
    is_public: plan.is_public !== false,
    sort_order: plan.sort_order ?? 0,
  });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const monthly = zlToGrosze(f.price_monthly);
  const unlimited = Number(f.max_members) < 0;

  const save = async () => {
    setErr('');
    if (monthly == null) { setErr('Podaj cenę miesięczną.'); return; }
    setSaving(true);
    // PUT nadpisuje wszystkie kolumny — przenosimy niezmieniane limity i cechy z obecnego planu.
    const body = {
      name: f.name.trim(),
      slug: f.slug.trim(),
      description: f.description.trim() || null,
      price_monthly: monthly,
      price_yearly: zlToGrosze(f.price_yearly),
      max_members: Number(f.max_members),
      max_users: plan.max_users ?? -1,
      max_groups: plan.max_groups ?? -1,
      max_kids: plan.max_kids ?? -1,
      max_events: plan.max_events ?? -1,
      max_storage_mb: plan.max_storage_mb ?? -1,
      trial_days: Number(f.trial_days),
      limit_buffer_pct: Number(f.limit_buffer_pct),
      is_custom: !!f.is_custom,
      features: { ...(plan.features || { all_modules: true }), priority_support: !!f.priority_support },
      is_active: f.is_active,
      is_public: f.is_public,
      sort_order: Number(f.sort_order),
    };
    try {
      if (isNew) await api.createPlan(body); else await api.updatePlan(plan.id, body);
      onSaved(body.name);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal
      wide
      title={isNew ? 'Nowy plan' : `Edytuj plan ${plan.name}`}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Anuluj</Button>
        <Button variant="primary" onClick={save} loading={saving} disabled={!f.name || (isNew && !f.slug)}>Zapisz</Button>
      </>}
    >
      {!isNew && isRetiredPlan(plan) && <Notice tone="warning">Plan wycofany — zmiany dotyczą tylko kościołów, które nadal go mają.</Notice>}
      <div className="field-row">
        <Field label="Nazwa"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="np. Wspólnota" /></Field>
        {isNew
          ? <Field label="Klucz (slug)" hint="Stały identyfikator, np. kosciol_plus."><input value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} /></Field>
          : <Field label="Klucz"><input value={planKey(plan)} disabled /></Field>}
      </div>
      <Field label="Opis" hint="Krótko, dla kogo jest plan.">
        <input value={f.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="field-row">
        <Field label={f.is_custom ? 'Cena / mies. („od”)' : 'Cena / mies.'} hint="Brutto, z VAT.">
          <AffixInput affix="zł" inputMode="decimal" value={f.price_monthly} onChange={(e) => set('price_monthly', e.target.value)} />
        </Field>
        <Field
          label="Cena / rok"
          hint={monthly ? <>Puste = wycena indywidualna. <button type="button" className="lead-more" onClick={() => set('price_yearly', groszeToZl(monthly * 10))}>Ustaw 10 × mies. ({formatZl(monthly * 10)})</button></> : 'Puste = wycena indywidualna.'}
        >
          <AffixInput affix="zł" inputMode="decimal" value={f.price_yearly} onChange={(e) => set('price_yearly', e.target.value)} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Limit dorosłych" hint={unlimited ? 'Bez limitu (-1).' : `Do ${f.max_members} dorosłych, z buforem do ${Math.floor(Number(f.max_members) * (1 + Number(f.limit_buffer_pct || 0) / 100))}.`}>
          <input type="number" min={-1} value={f.max_members} onChange={(e) => set('max_members', e.target.value)} />
        </Field>
        <Field label="Bufor ponad limit">
          <AffixInput affix="%" type="number" min={0} max={100} value={f.limit_buffer_pct} onChange={(e) => set('limit_buffer_pct', e.target.value)} />
        </Field>
        <Field label="Trial">
          <AffixInput affix="dni" type="number" min={0} value={f.trial_days} onChange={(e) => set('trial_days', e.target.value)} />
        </Field>
        <Field label="Kolejność">
          <input type="number" value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} />
        </Field>
      </div>
      <div className="row row--wrap" style={{ gap: '4px 24px' }}>
        <Toggle checked={f.is_custom} onChange={(v) => set('is_custom', v)} label="Wycena indywidualna" />
        <Toggle checked={f.priority_support} onChange={(v) => set('priority_support', v)} label="Priorytetowe wsparcie" />
        <Toggle checked={f.is_public} onChange={(v) => set('is_public', v)} label="W cenniku (publiczny)" />
        <Toggle checked={f.is_active} onChange={(v) => set('is_active', v)} label="Aktywny (można przypisać)" />
      </div>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}
