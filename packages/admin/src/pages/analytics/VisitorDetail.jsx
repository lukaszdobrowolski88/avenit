// Profil odwiedzającego: tożsamości + chronologiczna oś czasu sesji i zdarzeń.
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, formatDuration } from '../../lib/api.js';
import { flag, deviceIcon, fmtWhen } from './common.jsx';

const EVENT_LABELS = {
  pageview: 'Odsłona', leave: 'Wyjście', click: 'Kliknięcie',
  identify: 'Identyfikacja', login: 'Logowanie', module_open: 'Moduł',
};

export default function VisitorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.analyticsVisitor(id).then(setD).catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  const { visitor: v, identities, sessions, leads = [] } = d;
  const who = identities[0];

  return (
    <div>
      <button className="ghost" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>← Wróć</button>

      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="card">
          <div className="label">Tożsamość</div>
          <div className="value" style={{ fontSize: 18 }}>
            {who ? (who.displayName || who.email) : (v.orgName || v.rdnsHost || 'Anonimowy')}
          </div>
          {who?.tenantName && <div className="muted" style={{ fontSize: 13 }}>{who.tenantName} ({who.subdomain})</div>}
          {who?.email && who.displayName && <div className="muted" style={{ fontSize: 13 }}>{who.email}</div>}
        </div>
        <div className="card">
          <div className="label">Lokalizacja</div>
          <div className="value" style={{ fontSize: 18 }}>{flag(v.country)} {v.city || v.country || '—'}</div>
          {v.orgName && <div className="muted" style={{ fontSize: 13 }}>{v.orgName}</div>}
          {v.rdnsHost && <div className="muted" style={{ fontSize: 12 }}>{v.rdnsHost}</div>}
        </div>
        <div className="card">
          <div className="label">Urządzenie</div>
          <div className="value" style={{ fontSize: 18 }}>{deviceIcon(v.deviceType)} {v.browser || '—'}</div>
          <div className="muted" style={{ fontSize: 13 }}>{v.os || ''}</div>
        </div>
        <div className="card">
          <div className="label">Aktywność</div>
          <div className="value" style={{ fontSize: 18 }}>{v.sessions_count} sesji · {v.pageviews_count} odsłon</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Pierwszy raz: {fmtWhen(v.first_seen)} · Ostatnio: {fmtWhen(v.last_seen)}
          </div>
        </div>
      </div>

      {leads.length > 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: 'var(--green)' }}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>📩 Zgłoszenia z formularza</h3>
          {leads.map((l) => (
            <div key={l.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span><b>{l.name}</b> · {l.email}{l.phone ? ` · ${l.phone}` : ''}{l.church ? ` · ${l.church}` : ''}</span>
              <span className="muted"><span className={`badge lead-${l.status || 'new'}`}>{l.status || 'new'}</span> {fmtWhen(l.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      {identities.length > 1 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Wszystkie tożsamości</h3>
          {identities.map((i, k) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
              <span>{i.displayName || i.email} <span className="muted">{i.role || ''}</span></span>
              <span className="muted">{i.tenantName || ''} · {fmtWhen(i.identifiedAt)}</span>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ margin: '18px 0 10px' }}>Oś czasu ({sessions.length} ostatnich sesji)</h3>
      {sessions.map((s) => (
        <div className="card" key={s.id} style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap' }}>
            <b>{fmtWhen(s.startedAt)}</b>
            <span className="muted" style={{ fontSize: 13 }}>
              {s.site === 'landing' ? 'Strona WWW' : `Aplikacja${s.tenantName ? ` · ${s.tenantName}` : ''}`}
              {' · '}{s.pageviews} odsłon
              {s.durationSeconds != null && <> · {formatDuration(s.durationSeconds)}</>}
              {s.referrerDomain && <> · z: {s.referrerDomain}</>}
              {s.utmSource && <> · utm: {s.utmSource}</>}
            </span>
          </div>
          <div className="timeline">
            {s.events.map((e, k) => (
              <div key={k} className="timeline-item">
                <span className="muted" style={{ width: 46, flexShrink: 0 }}>
                  {new Date(e.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`evtag ev-${e.name}`}>{EVENT_LABELS[e.name] || e.name}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.name === 'module_open' && e.props?.module ? e.props.module
                    : e.name === 'click' && e.props?.href ? e.props.href
                    : e.name === 'click' && e.props?.t ? e.props.t
                    : e.pageTitle || e.path || ''}
                  {e.name === 'leave' && e.durationMs ? ` (${formatDuration(e.durationMs / 1000)})` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
