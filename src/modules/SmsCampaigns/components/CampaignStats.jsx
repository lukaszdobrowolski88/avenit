import React, { useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import {
  TrendingUp, Users, CheckCircle, CornerDownLeft, XCircle, ArrowLeft, Download,
  Send, DollarSign, MessageSquare,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatPLN } from '../utils/smsEncoding';

export default function CampaignStats({ campaign, onClose }) {
  const t = useT();
  const [recipients, setRecipients] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (!campaign?.id) return;
    (async () => {
      setLoading(true);
      const [rRes, respRes] = await Promise.all([
        supabase
          .from('sms_campaign_recipients')
          .select('*')
          .eq('campaign_id', campaign.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('sms_inline_responses')
          .select('*')
          .eq('campaign_id', campaign.id)
          .order('created_at', { ascending: false }),
      ]);
      setRecipients(rRes.data || []);
      setResponses(respRes.data || []);
      setLoading(false);
    })();
  }, [campaign?.id]);

  const total = campaign?.recipient_count || recipients.length;
  const sent = campaign?.sent_count || 0;
  const delivered = campaign?.delivered_count || 0;
  const replied = campaign?.replied_count || 0;
  const failed = campaign?.failed_count || 0;
  const points = Number(campaign?.total_cost || 0);
  const costPLN = points * 0.16;
  const avgCost = total > 0 ? costPLN / total : 0;

  const filtered = recipients.filter(r => statusFilter === 'all' || r.status === statusFilter);

  const exportCsv = () => {
    const rows = [
      ['phone', 'email', 'status', 'smsapi_id', 'points', 'delivered_at', 'replied_at', 'error'].join(','),
      ...recipients.map(r => [
        r.phone || '', r.user_email || '', r.status, r.smsapi_id || '',
        r.points ?? '', r.delivered_at || '', r.replied_at || '',
        (r.error || '').replace(/,/g, ';'),
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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{campaign?.name}</h2>
            <p className="text-xs text-gray-500">Od: <span className="font-mono">{campaign?.sender}</span></p>
          </div>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
          <Download size={14} /> Eksport CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat icon={Users} label="Odbiorcy" value={total} color="gray" />
        <Stat icon={Send} label="Wysłane" value={sent} percent={pct(sent, total)} color="blue" />
        <Stat icon={CheckCircle} label="Dostarczone" value={delivered} percent={pct(delivered, total)} color="emerald" />
        <Stat icon={CornerDownLeft} label="Odpowiedzi" value={replied} percent={pct(replied, total)} color="violet" />
        <Stat icon={XCircle} label="Błędy" value={failed} percent={pct(failed, total)} color="red" />
        <Stat icon={DollarSign} label="Koszt" value={formatPLN(costPLN)} subtitle={`~${formatPLN(avgCost)}/SMS`} color="amber" />
      </div>

      {/* Lista odpowiedzi (jeśli są) */}
      {responses.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <CornerDownLeft size={16} className="text-violet-600" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Odpowiedzi ({responses.length})</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-auto">
            {responses.map(r => (
              <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  r.response_value === 'yes' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                  r.response_value === 'no' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {r.response_type === 'rsvp' ? r.response_value.toUpperCase() : 'TEKST'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-mono">+{r.phone}</span>
                    {r.user_email && <span>· {r.user_email}</span>}
                    <span>· {fmt(r.created_at)}</span>
                  </div>
                  {r.response_type === 'reply' && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 break-words">{r.raw_text}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {failed > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <XCircle size={16} />
          <span>{failed} wysyłek zakończyło się błędem ({pct(failed, total)}%)</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          {['all', 'sent', 'delivered', 'replied', 'failed', 'suppressed'].map(s => (
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
          <div className="p-8 text-center text-gray-500">Ładowanie...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{t('Brak rekordów dla tego filtra.')}</div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                <tr>
                  <Th>Telefon</Th>
                  <Th>Email</Th>
                  <Th>Status</Th>
                  <Th>Wariant</Th>
                  <Th>Dostarczone</Th>
                  <Th>Odpowiedź</Th>
                  <Th>Pkt</Th>
                  <Th>Błąd</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(r => (
                  <tr key={r.id}>
                    <Td className="font-mono">{r.phone ? `+${r.phone}` : '—'}</Td>
                    <Td>{r.user_email || '—'}</Td>
                    <Td><StatusPill status={r.status} /></Td>
                    <Td>{r.variant || '—'}</Td>
                    <Td>{fmt(r.delivered_at)}</Td>
                    <Td>{fmt(r.replied_at)}</Td>
                    <Td>{r.points ?? '—'}</Td>
                    <Td className="text-red-600 text-xs">{r.error || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, percent, subtitle, color }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className={`w-8 h-8 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600 dark:text-${color}-400 flex items-center justify-center mb-2`}>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {label}
        {percent !== undefined && ` · ${percent}%`}
        {subtitle && <div>{subtitle}</div>}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    pending:    { label: 'Oczekuje',    color: 'gray' },
    queued:     { label: 'Kolejka',     color: 'gray' },
    sent:       { label: 'Wysłany',     color: 'blue' },
    delivered:  { label: 'Dostarczony', color: 'emerald' },
    replied:    { label: 'Odpowiedź',   color: 'violet' },
    failed:     { label: 'Błąd',        color: 'red' },
    suppressed: { label: 'Pominięty',   color: 'amber' },
  };
  const c = map[status] || { label: status, color: 'gray' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs bg-${c.color}-100 dark:bg-${c.color}-900/30 text-${c.color}-700 dark:text-${c.color}-400`}>
      {c.label}
    </span>
  );
}

const Th = ({ children }) => <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{children}</th>;
const Td = ({ children, className = '' }) => <td className={`px-3 py-2 text-sm text-gray-700 dark:text-gray-300 ${className}`}>{children}</td>;

function fmt(s) { return s ? new Date(s).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }
function pct(v, total) { return total > 0 ? Math.round(v / total * 100) : 0; }
