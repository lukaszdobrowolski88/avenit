import React, { useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import { TrendingUp, Users, Eye, MousePointer, XCircle, ArrowLeft, Download, Send } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';

export default function CampaignStats({ campaign, onClose }) {
  const t = useT();
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (!campaign?.id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('push_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('created_at', { ascending: true });
      setRecipients(data || []);
      setLoading(false);
    })();
  }, [campaign?.id]);

  const total = campaign?.recipient_count || recipients.length;
  const sent = campaign?.sent_count || 0;
  const delivered = campaign?.delivered_count || 0;
  const opened = campaign?.opened_count || 0;
  const actionClicked = campaign?.action_clicked_count || 0;
  const failed = campaign?.failed_count || 0;

  const filtered = recipients.filter(r => statusFilter === 'all' || r.status === statusFilter);

  const exportCsv = () => {
    const rows = [
      ['email', 'status', 'delivered_at', 'opened_at', 'action_clicked_at', 'error'].join(','),
      ...recipients.map(r => [
        r.user_email, r.status, r.delivered_at || '', r.opened_at || '',
        r.action_clicked_at || '', (r.error || '').replace(/,/g, ';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaign.name || 'kampania'}-${campaign.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{campaign?.name}</h2>
            <p className="text-xs text-gray-500">{campaign?.title}</p>
          </div>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
          <Download size={14} /> Eksport CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat icon={Users} label="Odbiorcy" value={total} color="gray" />
        <Stat icon={Send} label={tr('Wysłane')} value={sent} percent={pct(sent, total)} color="blue" />
        <Stat icon={TrendingUp} label="Dostarczone" value={delivered} percent={pct(delivered, total)} color="indigo" />
        <Stat icon={Eye} label="Otwarte" value={opened} percent={pct(opened, total)} color="emerald" />
        <Stat icon={MousePointer} label="Akcje" value={actionClicked} percent={pct(actionClicked, total)} color="violet" />
      </div>

      {failed > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <XCircle size={16} />
          <span>{failed} wysyłek zakończyło się błędem ({pct(failed, total)}%)</span>
        </div>
      )}

      {/* Filtr i tabela */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {['all', 'sent', 'delivered', 'opened', 'action_clicked', 'failed', 'suppressed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap ${
                statusFilter === s ? 'bg-accent-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {s === 'all' ? 'Wszystkie' : s} ({recipients.filter(r => s === 'all' || r.status === s).length})
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner center label={tr('Ładowanie...')} />
        ) : filtered.length === 0 ? (
          <EmptyState compact icon={Users} title={t('Brak rekordów dla tego filtra.')} />
        ) : (
          <DataTable flush className="max-h-[60vh] overflow-y-auto">
            <THead sticky>
              <tr>
                <TH>{tr('Email')}</TH>
                <TH>{tr('Status')}</TH>
                <TH>Wariant</TH>
                <TH>Dostarczone</TH>
                <TH>{tr('Otwarte')}</TH>
                <TH>{tr('Akcja')}</TH>
                <TH>{tr('Błąd')}</TH>
              </tr>
            </THead>
            <tbody>
              {filtered.map(r => (
                <TR key={r.id}>
                  <TD>{r.user_email}</TD>
                  <TD><RecipientStatus status={r.status} /></TD>
                  <TD muted>{r.variant || ''}</TD>
                  <TD muted numeric>{fmt(r.delivered_at)}</TD>
                  <TD muted numeric>{fmt(r.opened_at)}</TD>
                  <TD muted numeric>{fmt(r.action_clicked_at)}</TD>
                  <TD className="text-red-600 dark:text-red-400 text-xs">{r.error || ''}</TD>
                </TR>
              ))}
            </tbody>
          </DataTable>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, percent, color }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4`}>
      <div className={`w-8 h-8 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600 dark:text-${color}-400 flex items-center justify-center mb-2`}>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {label}
        {percent !== undefined && ` · ${percent}%`}
      </div>
    </div>
  );
}

function RecipientStatus({ status }) {
  const map = {
    pending:        { label: tr('Oczekuje'),  color: STATUS_COLORS.neutral },
    queued:         { label: tr('Kolejka'),   color: STATUS_COLORS.neutral },
    sent:           { label: tr('Wysłany'),   color: STATUS_COLORS.info },
    delivered:      { label: tr('Dostarczony'), color: STATUS_COLORS.info },
    opened:         { label: tr('Otwarty'),   color: STATUS_COLORS.success },
    action_clicked: { label: tr('Akcja'),     color: STATUS_COLORS.accent },
    failed:         { label: tr('Błąd'),      color: STATUS_COLORS.danger },
    suppressed:     { label: tr('Pominięty'), color: STATUS_COLORS.warning },
  };
  const c = map[status] || { label: status, color: STATUS_COLORS.neutral };
  return <StatusPill color={c.color}>{c.label}</StatusPill>;
}

function fmt(s) { return s ? new Date(s).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }
function pct(v, total) { return total > 0 ? Math.round(v / total * 100) : 0; }
