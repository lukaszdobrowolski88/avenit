import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { parsePlanInterest } from '../lib/plans.js';
import Icon from '../components/Icon.jsx';
import {
  PageHeader, Button, Badge, StatusBadge, Segmented, SearchInput, EmptyState, Loading, ErrorBox, Notice, useToast,
} from '../components/ui.jsx';

// Zgłoszenia z formularza na avenit.pl (landing_leads).
// Link z maila: /leads?lead=<id> — otwiera, przewija i podświetla zgłoszenie; otwarcie innego
// zgłoszenia aktualizuje ?lead= w adresie (do skopiowania / udostępnienia).
export const LEAD_LABELS = {
  new: 'Nowe', contacted: 'W kontakcie', converted: 'Pozyskane', rejected: 'Odrzucone',
};

const fmtWhen = (d) => new Date(d).toLocaleString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Plan, którym interesuje się zgłaszający: jawne pole (jeśli API je zwraca) albo tekst z formularza
// („Interesuje mnie plan Kościół+ (płatność roczna).”).
function planOf(l) {
  const explicit = l.plan || l.plan_interest || l.plan_name;
  if (explicit) return { name: explicit, yearly: l.billing_cycle === 'yearly' || !!l.yearly };
  return parsePlanInterest(l.message);
}

export default function Leads({ onCountsChange }) {
  const [params, setParams] = useSearchParams();
  const focusId = params.get('lead') || '';
  const [leads, setLeads] = useState(null);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set(focusId ? [focusId] : []));
  const [err, setErr] = useState('');
  const [toast, showToast] = useToast();
  const scrolled = useRef('');

  const load = (status = filter) =>
    api.landingLeads(status)
      .then((r) => { setLeads(r.leads); setCounts(r.counts); onCountsChange?.(r.counts); })
      .catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [filter]);

  // Głęboki link: rozwiń i przewiń do zgłoszenia (raz na zmianę ?lead=).
  useEffect(() => {
    if (!focusId || !leads || scrolled.current === focusId) return;
    const found = leads.some((l) => String(l.id) === focusId);
    if (!found && filter) { setFilter(''); return; } // ukryte filtrem — pokaż wszystkie
    if (!found) return;
    scrolled.current = focusId;
    setOpen((p) => new Set(p).add(focusId));
    requestAnimationFrame(() => {
      const el = document.getElementById(`lead-${focusId}`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
    });
  }, [focusId, leads, filter]);

  const setFocus = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('lead', id); else next.delete('lead');
    scrolled.current = id || '';
    setParams(next, { replace: true });
  };
  const toggle = (id) => {
    const sid = String(id);
    const isOpen = open.has(sid);
    setOpen((p) => { const n = new Set(p); isOpen ? n.delete(sid) : n.add(sid); return n; });
    setFocus(isOpen ? (focusId === sid ? '' : focusId) : sid);
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const act = async (fn, ok) => { setErr(''); try { await fn(); await load(); if (ok) showToast(ok); } catch (e) { showToast(e.message, 'error'); } };

  const needle = q.trim().toLowerCase();
  const list = (leads || []).filter((l) => !needle || `${l.name} ${l.email} ${l.phone || ''} ${l.church || ''} ${l.message || ''}`.toLowerCase().includes(needle));
  const missing = focusId && leads && !filter && !leads.some((l) => String(l.id) === focusId);

  return (
    <div>
      <PageHeader title="Zgłoszenia" subtitle="Wiadomości z formularza kontaktowego na avenit.pl." />
      <ErrorBox error={err} onRetry={() => load()} />
      {missing && <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => setFocus('')}>Zamknij</Button>}>Nie znaleziono zgłoszenia z linku — mogło zostać usunięte.</Notice>}

      <div className="toolbar">
        <SearchInput className="grow" value={q} onChange={setQ} placeholder="Szukaj: kościół, osoba, e-mail…" />
        <Segmented
          label="Status"
          value={filter}
          onChange={setFilter}
          items={[{ value: '', label: 'Wszystkie', count: total }, ...Object.entries(LEAD_LABELS).map(([k, label]) => ({ value: k, label, count: counts[k] || 0 }))]}
        />
      </div>

      {!leads && !err && <Loading />}
      {leads && list.length === 0 && (
        <div className="card">
          <EmptyState icon="inbox" title={needle ? 'Brak wyników' : 'Brak zgłoszeń'}>
            {needle ? 'Zmień wyszukiwaną frazę.' : filter ? `Brak zgłoszeń o statusie „${LEAD_LABELS[filter]}”.` : 'Pojawią się tu wiadomości wysłane z formularza na avenit.pl.'}
          </EmptyState>
        </div>
      )}

      <div className="lead-list">
        {list.map((l) => {
          const sid = String(l.id);
          const plan = planOf(l);
          const expanded = open.has(sid);
          const long = (l.message || '').length > 220 || (l.message || '').split('\n').length > 3;
          return (
            <article
              key={l.id} id={`lead-${sid}`} tabIndex={-1}
              className={`lead${focusId === sid ? ' is-focus' : ''}`}
              aria-label={`Zgłoszenie: ${l.church || l.name}`}
            >
              <div>
                <button type="button" className="lead-church" onClick={() => toggle(l.id)} aria-expanded={expanded} title="Otwórz zgłoszenie (link w adresie)">
                  {l.church || <span className="muted">Kościół nie podany</span>}
                </button>
                <div className="lead-person">{l.name}</div>
                <div className="lead-contact">
                  <a href={`mailto:${l.email}`}><Icon name="mail" size={14} />{l.email}</a>
                  {l.phone && <a href={`tel:${l.phone.replace(/\s/g, '')}`}><Icon name="phone" size={14} />{l.phone}</a>}
                </div>
              </div>
              <div>
                <div className="lead-tags">
                  {plan
                    ? <Badge tone="accent">Plan: {plan.name}{plan.yearly ? ' · rocznie' : ''}</Badge>
                    : <Badge>Plan nie wskazany</Badge>}
                  <span className="tag"><Icon name="clock" size={12} />{fmtWhen(l.created_at)}</span>
                </div>
                {l.message
                  ? <>
                      <div className={`lead-msg${expanded || !long ? '' : ' clamped'}`}>{l.message}</div>
                      {long && <button type="button" className="lead-more" onClick={() => toggle(l.id)}>{expanded ? 'Zwiń' : 'Pokaż całość'}</button>}
                    </>
                  : <div className="muted small">Bez wiadomości.</div>}
              </div>
              <div className="lead-side">
                <StatusBadge status={l.status} />
                <select
                  value={l.status}
                  aria-label="Zmień status"
                  onChange={(e) => act(() => api.updateLead(l.id, { status: e.target.value }), `Status: ${LEAD_LABELS[e.target.value]}`)}
                >
                  {Object.entries(LEAD_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <div className="row">
                  <Button size="sm" variant="ghost" icon="mail" onClick={() => { window.location.href = `mailto:${l.email}?subject=${encodeURIComponent('Avenit — Twoje zgłoszenie')}`; }}>Odpisz</Button>
                  <Button size="sm" variant="ghost" icon="trash" aria-label={`Usuń zgłoszenie od ${l.name}`} title="Usuń"
                    onClick={() => window.confirm(`Usunąć zgłoszenie od „${l.name}”?`) && act(() => api.deleteLead(l.id), 'Zgłoszenie usunięte')} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {toast}
    </div>
  );
}
