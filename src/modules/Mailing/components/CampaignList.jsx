import React, { useState } from 'react';
import {
  Send, Clock, FileText, MoreVertical, Edit, Copy, Trash2, Eye,
  CheckCircle, XCircle, AlertCircle, Mail, Users, Calendar,
  TrendingUp, MousePointer, ArrowRight, Sparkles
} from 'lucide-react';
import { useCampaigns } from '../hooks/useCampaigns';

const STATUS_CONFIG = {
  draft: {
    label: 'Szkic',
    icon: FileText,
    bg: 'bg-gray-100 dark:bg-gray-700',
    textColor: 'text-gray-600 dark:text-gray-400',
    iconColor: 'text-gray-500',
    gradient: 'from-gray-400 to-gray-500'
  },
  scheduled: {
    label: 'Zaplanowany',
    icon: Clock,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    textColor: 'text-amber-700 dark:text-amber-400',
    iconColor: 'text-amber-500',
    gradient: 'from-amber-400 to-orange-500'
  },
  sending: {
    label: 'Wysyłanie...',
    icon: Send,
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    textColor: 'text-blue-700 dark:text-blue-400',
    iconColor: 'text-blue-500',
    gradient: 'from-blue-400 to-indigo-500'
  },
  sent: {
    label: 'Wysłany',
    icon: CheckCircle,
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    textColor: 'text-emerald-700 dark:text-emerald-400',
    iconColor: 'text-emerald-500',
    gradient: 'from-emerald-400 to-teal-500'
  },
  failed: {
    label: 'Błąd',
    icon: XCircle,
    bg: 'bg-red-100 dark:bg-red-900/30',
    textColor: 'text-red-700 dark:text-red-400',
    iconColor: 'text-red-500',
    gradient: 'from-red-400 to-rose-500'
  },
  cancelled: {
    label: 'Anulowany',
    icon: AlertCircle,
    bg: 'bg-gray-100 dark:bg-gray-700',
    textColor: 'text-gray-600 dark:text-gray-400',
    iconColor: 'text-gray-500',
    gradient: 'from-gray-400 to-gray-500'
  }
};

export default function CampaignList({ campaigns, onEdit, onRefresh, onViewStats }) {
  const [filter, setFilter] = useState('all');
  const [menuOpen, setMenuOpen] = useState(null);
  const { deleteCampaign, duplicateCampaign } = useCampaigns();

  const filteredCampaigns = campaigns.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const handleDelete = async (campaign) => {
    if (!confirm(`Czy na pewno chcesz usunąć mail "${campaign.name}"?`)) return;

    try {
      await deleteCampaign(campaign.id);
      onRefresh?.();
    } catch (err) {
      alert('Błąd podczas usuwania maila');
    }
    setMenuOpen(null);
  };

  const handleDuplicate = async (campaign) => {
    try {
      await duplicateCampaign(campaign.id);
      onRefresh?.();
    } catch (err) {
      alert('Błąd podczas duplikowania maila');
    }
    setMenuOpen(null);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="relative inline-block mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-orange-500 rounded-3xl blur-xl opacity-30 animate-pulse" />
          <div className="relative w-20 h-20 bg-gradient-to-br from-pink-500 to-orange-500 rounded-3xl flex items-center justify-center shadow-xl">
            <Mail className="w-10 h-10 text-white" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Brak maili
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
          Stwórz swój pierwszy mail i dotrzyj do swojej społeczności
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-pink-500 dark:text-pink-400">
          <span>Kliknij "Nowy mail" aby rozpocząć</span>
          <ArrowRight size={14} className="animate-bounce-x" />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filtry */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <FilterButton
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          count={campaigns.length}
        >
          Wszystkie
        </FilterButton>
        <FilterButton
          active={filter === 'draft'}
          onClick={() => setFilter('draft')}
          count={campaigns.filter(c => c.status === 'draft').length}
        >
          Szkice
        </FilterButton>
        <FilterButton
          active={filter === 'scheduled'}
          onClick={() => setFilter('scheduled')}
          count={campaigns.filter(c => c.status === 'scheduled').length}
        >
          Zaplanowane
        </FilterButton>
        <FilterButton
          active={filter === 'sent'}
          onClick={() => setFilter('sent')}
          count={campaigns.filter(c => c.status === 'sent').length}
        >
          Wysłane
        </FilterButton>
      </div>

      {/* Siatka kart */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredCampaigns.map(campaign => {
          const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft;
          const StatusIcon = status.icon;
          const openRate = campaign.total_recipients > 0
            ? Math.round((campaign.opened_count || 0) / campaign.total_recipients * 100)
            : 0;
          const clickRate = campaign.total_recipients > 0
            ? Math.round((campaign.clicked_count || 0) / campaign.total_recipients * 100)
            : 0;

          return (
            <div
              key={campaign.id}
              className="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-lg hover:border-pink-300 dark:hover:border-pink-700 transition-all duration-200"
            >
              {/* Podgląd HTML / Gradient header */}
              <div
                className="h-32 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 overflow-hidden relative cursor-pointer rounded-t-xl"
                onClick={() => onEdit(campaign)}
              >
                {campaign.html_content ? (
                  <>
                    <div
                      className="absolute inset-0 transform scale-[0.2] origin-top-left w-[500%] h-[500%] pointer-events-none"
                      dangerouslySetInnerHTML={{ __html: campaign.html_content }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-gray-800 via-transparent to-transparent opacity-70" />
                  </>
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${status.gradient} opacity-20`} />
                )}

                {/* Overlay z akcjami */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(campaign); }}
                      className="p-2 bg-pink-500 rounded-lg shadow-lg hover:scale-110 transition-transform"
                      title="Edytuj"
                    >
                      <Edit size={18} className="text-white" />
                    </button>
                    {campaign.status === 'sent' && onViewStats && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onViewStats(campaign); }}
                        className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:scale-110 transition-transform"
                        title="Statystyki"
                      >
                        <TrendingUp size={18} className="text-gray-700 dark:text-gray-300" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Badge statusu */}
                <div className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg ${status.bg} ${status.textColor} text-xs font-medium`}>
                  <StatusIcon size={12} />
                  {status.label}
                </div>

                {/* Ikona maila jeśli brak podglądu */}
                {!campaign.html_content && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-14 h-14 bg-gradient-to-br ${status.gradient} rounded-2xl flex items-center justify-center shadow-lg`}>
                      <Mail className="w-7 h-7 text-white" />
                    </div>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {campaign.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {campaign.subject}
                    </p>
                  </div>

                  {/* Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === campaign.id ? null : campaign.id); }}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <MoreVertical size={16} className="text-gray-500" />
                    </button>

                    {menuOpen === campaign.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setMenuOpen(null)}
                        />
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-50">
                          <button
                            onClick={() => { onEdit(campaign); setMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Edit size={14} />
                            Edytuj
                          </button>
                          {campaign.status === 'sent' && onViewStats && (
                            <button
                              onClick={() => { onViewStats(campaign); setMenuOpen(null); }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <TrendingUp size={14} />
                              Statystyki
                            </button>
                          )}
                          <button
                            onClick={() => handleDuplicate(campaign)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <Copy size={14} />
                            Duplikuj
                          </button>
                          <hr className="my-1 border-gray-200 dark:border-gray-700" />
                          <button
                            onClick={() => handleDelete(campaign)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 size={14} />
                            Usuń
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  {campaign.total_recipients > 0 && (
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {campaign.total_recipients}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {campaign.status === 'scheduled' && campaign.scheduled_at
                      ? formatDate(campaign.scheduled_at)
                      : campaign.status === 'sent' && campaign.sent_at
                        ? formatDate(campaign.sent_at)
                        : formatDate(campaign.created_at)
                    }
                  </span>
                </div>

                {/* Statystyki dla wysłanych */}
                {campaign.status === 'sent' && campaign.total_recipients > 0 && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <Eye size={12} />
                      {openRate}% otwarć
                    </span>
                    <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                      <MousePointer size={12} />
                      {clickRate}% kliknięć
                    </span>
                  </div>
                )}

                {/* Przycisk edytuj */}
                <button
                  onClick={() => onEdit(campaign)}
                  className="w-full mt-3 py-2 text-sm font-medium text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/20 hover:bg-pink-100 dark:hover:bg-pink-900/30 rounded-lg transition-colors"
                >
                  Edytuj mail
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, count, children }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
        active
          ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/25'
          : 'bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 border border-gray-200/50 dark:border-gray-700/50 hover:border-pink-200 dark:hover:border-pink-800/50'
      }`}
    >
      {children}
      {count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-md text-xs font-medium ${
          active
            ? 'bg-white/20 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}
