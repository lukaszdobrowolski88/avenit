import React, { useState } from 'react';
import {
  MessageSquare, Send, Clock, FileText, MoreVertical, Edit, Copy, Trash2,
  CheckCircle, XCircle, AlertCircle, Users, Calendar, TrendingUp,
  CornerDownLeft, Plus, X, DollarSign,
} from 'lucide-react';
import { useSmsCampaigns } from '../hooks/useSmsCampaigns';
import { STATUS_CONFIG } from '../constants';
import { useT } from '../../../i18n';
import { formatPLN } from '../utils/smsEncoding';

const STATUS_ICON = {
  draft: FileText, scheduled: Clock, sending: Send, sent: CheckCircle,
  failed: XCircle, cancelled: AlertCircle,
};

export default function CampaignList({ campaigns, onEdit, onNew, onViewStats, onRefresh }) {
  const t = useT();
  const { deleteCampaign, duplicateCampaign, cancelCampaign } = useSmsCampaigns();
  const [filter, setFilter] = useState('all');
  const [menuOpen, setMenuOpen] = useState(null);

  const filtered = campaigns.filter(c => filter === 'all' || c.status === filter);

  const handleDelete = async (c) => {
    if (!confirm(`Usunąć kampanię "${c.name}"?`)) return;
    try { await deleteCampaign(c.id); onRefresh?.(); } catch (e) { alert(e.message); }
    setMenuOpen(null);
  };

  const handleDuplicate = async (c) => {
    try { await duplicateCampaign(c.id); onRefresh?.(); } catch (e) { alert(e.message); }
    setMenuOpen(null);
  };

  const handleCancel = async (c) => {
    if (!confirm(`Anulować zaplanowaną kampanię "${c.name}"?`)) return;
    try { await cancelCampaign(c.id); onRefresh?.(); } catch (e) { alert(e.message); }
    setMenuOpen(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex gap-2 overflow-x-auto">
          <FilterBtn active={filter === 'all'} count={campaigns.length} onClick={() => setFilter('all')}>Wszystkie</FilterBtn>
          <FilterBtn active={filter === 'draft'} count={campaigns.filter(c => c.status === 'draft').length} onClick={() => setFilter('draft')}>Szkice</FilterBtn>
          <FilterBtn active={filter === 'scheduled'} count={campaigns.filter(c => c.status === 'scheduled').length} onClick={() => setFilter('scheduled')}>Zaplanowane</FilterBtn>
          <FilterBtn active={filter === 'sent'} count={campaigns.filter(c => c.status === 'sent').length} onClick={() => setFilter('sent')}>Wysłane</FilterBtn>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white text-sm rounded-lg shadow hover:shadow-lg whitespace-nowrap"
        >
          <Plus size={16} /> Nowa kampania
        </button>
      </div>

      {filtered.length === 0 ? (
        <Empty onNew={onNew} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(c => {
            const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
            const Icon = STATUS_ICON[c.status] || FileText;
            const total = c.recipient_count || 0;
            const deliveryRate = total > 0 ? Math.round((c.delivered_count || 0) / total * 100) : 0;
            const replyRate = total > 0 ? Math.round((c.replied_count || 0) / total * 100) : 0;

            return (
              <div key={c.id} className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-all overflow-hidden">
                <div className={`h-2 bg-gradient-to-r ${cfg.gradient}`} />

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{c.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        Od: <span className="font-mono">{c.sender}</span>
                      </p>
                    </div>
                    <div className="relative">
                      <button onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <MoreVertical size={16} className="text-gray-500" />
                      </button>
                      {menuOpen === c.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(null)} />
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50">
                            <MenuItem icon={Edit} onClick={() => { onEdit(c); setMenuOpen(null); }}>Edytuj</MenuItem>
                            <MenuItem icon={Copy} onClick={() => handleDuplicate(c)}>Duplikuj</MenuItem>
                            {c.status === 'sent' && (
                              <MenuItem icon={TrendingUp} onClick={() => { onViewStats(c); setMenuOpen(null); }}>Statystyki</MenuItem>
                            )}
                            {c.status === 'scheduled' && (
                              <MenuItem icon={X} onClick={() => handleCancel(c)}>Anuluj</MenuItem>
                            )}
                            <hr className="my-1 border-gray-200 dark:border-gray-700" />
                            <MenuItem icon={Trash2} danger onClick={() => handleDelete(c)}>Usuń</MenuItem>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3 mb-3">{c.body}</p>

                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-${cfg.color}-100 dark:bg-${cfg.color}-900/30 text-${cfg.color}-700 dark:text-${cfg.color}-400 mb-3`}>
                    <Icon size={11} />
                    {t(cfg.label)}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {total > 0 && (
                      <span className="flex items-center gap-1"><Users size={12} /> {total}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {formatDate(c.status === 'scheduled' ? c.scheduled_at : c.completed_at || c.created_at)}
                    </span>
                  </div>

                  {c.status === 'sent' && total > 0 && (
                    <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                      <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle size={12} /> {deliveryRate}% dostarczonych
                      </span>
                      {(c.replied_count || 0) > 0 && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <CornerDownLeft size={12} /> {replyRate}% odpowiedzi
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <DollarSign size={12} /> {formatPLN((c.total_cost || 0) * 0.16)}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => onEdit(c)}
                    className="w-full mt-3 py-2 text-sm font-medium text-accent-primary dark:text-accent-primary-light bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 hover:bg-accent-primary-lighter dark:hover:bg-accent-primary-darkest/30 rounded-lg transition-colors"
                  >
                    {c.status === 'draft' ? 'Edytuj szkic' : c.status === 'sent' ? 'Zobacz' : 'Edytuj'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ active, count, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white' :
        'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50'
      }`}
    >
      {children}
      {count > 0 && (
        <span className={`px-1.5 py-0.5 rounded text-xs ${active ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
        danger ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'
      }`}
    >
      <Icon size={14} /> {children}
    </button>
  );
}

function Empty({ onNew }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="relative inline-block mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-3xl blur-xl opacity-30 animate-pulse" />
        <div className="relative w-20 h-20 bg-gradient-to-br from-accent-primary-light to-accent-secondary-light rounded-3xl flex items-center justify-center shadow-xl">
          <MessageSquare className="w-10 h-10 text-white" />
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Brak kampanii SMS</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
        Dotrzyj do swojej społeczności wiadomościami SMS — kreator + segmenty + statystyki.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-accent-primary-light to-accent-secondary-light text-white rounded-lg shadow"
      >
        <Plus size={16} /> Stwórz pierwszą kampanię
      </button>
    </div>
  );
}

function formatDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}
