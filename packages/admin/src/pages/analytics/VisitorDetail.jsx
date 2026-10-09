// Profil odwiedzającego: tożsamości + chronologiczna oś czasu sesji i zdarzeń.
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, formatDuration } from '../../lib/api.js';
import Icon from '../../components/Icon.jsx';
import { Card, Stat, StatusBadge, ErrorBox, Loading } from '../../components/ui.jsx';
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

  const back = <button className="back-link" onClick={() => navigate(-1)}><Icon name="chevronLeft" size={16} /> Wróć</button>;
  if (err) return <>{back}<ErrorBox error={err} /></>;
  if (!d) return <>{back}<Loading /></>;

  const { visitor: v, identities, sessions, leads = [] } = d;
  const who = identities[0];

  return (
    <div>
      {back}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        <Stat
          label="Tożsamość" small
          value={who ? (who.displayName || who.email) : (v.orgName || v.rdnsHost || 'Anonimowy')}
          hint={<>{who?.tenantName && <div>{who.tenantName} ({who.subdomain})</div>}{who?.email && who.displayName && <div>{who.email}</div>}</>}
        />
        <Stat
          label="Lokalizacja" small
          value={<>{flag(v.country)}{v.city || v.country || '—'}</>}
          hint={<>{v.orgName && <div>{v.orgName}</div>}{v.rdnsHost && <div className="ellipsis">{v.rdnsHost}</div>}</>}
        />
        <Stat label="Urządzenie" small value={<>{deviceIcon(v.deviceType)}{v.browser || '—'}</>} hint={v.os || ''} />
        <Stat
          label="Aktywność" small
          value={`${v.sessions_count} sesji · ${v.pageviews_count} odsłon`}
          hint={`Pierwszy raz ${fmtWhen(v.first_seen)} · ostatnio ${fmtWhen(v.last_seen)}`}
        />
      </div>

      {leads.length > 0 && (
        <Card title="Zgłoszenia z formularza" className="mb">
          <div className="list">
            {leads.map((l) => (
              <button key={l.id} className="list-row" onClick={() => navigate(`/leads?lead=${encodeURIComponent(l.id)}`)}>
                <span className="ellipsis"><b>{l.name}</b> <span className="muted">{l.email}{l.phone ? ` · ${l.phone}` : ''}{l.church ? ` · ${l.church}` : ''}</span></span>
                <span className="row nowrap"><StatusBadge status={l.status || 'new'} size="sm" /><span className="muted small tnum">{fmtWhen(l.createdAt)}</span></span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {identities.length > 1 && (
        <Card title="Wszystkie tożsamości" className="mb">
          <div className="list">
            {identities.map((i, k) => (
              <div key={k} className="list-row">
                <span>{i.displayName || i.email} <span className="muted">{i.role || ''}</span></span>
                <span className="muted small">{i.tenantName || ''} · {fmtWhen(i.identifiedAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <h2 className="section-title" style={{ margin: '24px 0 12px' }}>Oś czasu <span className="muted" style={{ fontWeight: 600 }}>· {sessions.length} ostatnich sesji</span></h2>
      <div className="stack" style={{ gap: 12 }}>
        {sessions.map((s) => (
          <Card key={s.id}>
            <div className="row row--between row--wrap" style={{ marginBottom: 8 }}>
              <b className="tnum">{fmtWhen(s.startedAt)}</b>
              <span className="muted small">
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
                  <span className="muted tnum" style={{ width: 44, flexShrink: 0 }}>
                    {new Date(e.createdAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className={`evtag ev-${e.name}`}>{EVENT_LABELS[e.name] || e.name}</span>
                  <span className="ellipsis">
                    {e.name === 'module_open' && e.props?.module ? e.props.module
                      : e.name === 'click' && e.props?.href ? e.props.href
                      : e.name === 'click' && e.props?.t ? e.props.t
                      : e.pageTitle || e.path || ''}
                    {e.name === 'leave' && e.durationMs ? ` (${formatDuration(e.durationMs / 1000)})` : ''}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
