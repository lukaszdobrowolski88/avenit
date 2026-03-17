import React, { useState, useMemo } from 'react';
import {
  Send, Eye, MousePointer, AlertTriangle, UserMinus,
  TrendingUp, Calendar, Users, Download, ChevronDown,
  BarChart3, Sparkles, Mail
} from 'lucide-react';

export default function CampaignStats({ campaigns }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [timeRange, setTimeRange] = useState('all'); // 'week', 'month', 'all'

  // Filtruj kampanie według czasu
  const filteredCampaigns = useMemo(() => {
    const now = new Date();
    const sentCampaigns = campaigns.filter(c => c.status === 'sent' && c.sent_at);

    if (timeRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return sentCampaigns.filter(c => new Date(c.sent_at) >= weekAgo);
    }
    if (timeRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return sentCampaigns.filter(c => new Date(c.sent_at) >= monthAgo);
    }
    return sentCampaigns;
  }, [campaigns, timeRange]);

  // Oblicz statystyki ogólne
  const overallStats = useMemo(() => {
    const stats = {
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      totalUnsubscribed: 0
    };

    filteredCampaigns.forEach(c => {
      stats.totalSent += c.sent_count || 0;
      stats.totalDelivered += c.delivered_count || 0;
      stats.totalOpened += c.opened_count || 0;
      stats.totalClicked += c.clicked_count || 0;
      stats.totalBounced += c.bounced_count || 0;
      stats.totalUnsubscribed += c.unsubscribed_count || 0;
    });

    return {
      ...stats,
      deliveryRate: stats.totalSent > 0 ? (stats.totalDelivered / stats.totalSent * 100).toFixed(1) : 0,
      openRate: stats.totalDelivered > 0 ? (stats.totalOpened / stats.totalDelivered * 100).toFixed(1) : 0,
      clickRate: stats.totalOpened > 0 ? (stats.totalClicked / stats.totalOpened * 100).toFixed(1) : 0
    };
  }, [filteredCampaigns]);

  // Wybrana kampania do szczegółów
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const exportToCSV = () => {
    const headers = ['Nazwa', 'Data wysyłki', 'Odbiorcy', 'Wysłane', 'Dostarczone', 'Otwarte', 'Kliknięte', 'Odbite', 'Wypisani'];
    const rows = filteredCampaigns.map(c => [
      c.name,
      formatDate(c.sent_at),
      c.total_recipients || 0,
      c.sent_count || 0,
      c.delivered_count || 0,
      c.opened_count || 0,
      c.clicked_count || 0,
      c.bounced_count || 0,
      c.unsubscribed_count || 0
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statystyki-mailing-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (filteredCampaigns.length === 0) {
    return (
      <div className="text-center py-16 px-4">
        <div className="relative inline-block mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-orange-500 rounded-3xl blur-xl opacity-30 animate-pulse" />
          <div className="relative w-20 h-20 bg-gradient-to-br from-pink-500 to-orange-500 rounded-3xl flex items-center justify-center shadow-xl">
            <BarChart3 className="w-10 h-10 text-white" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Brak danych statystycznych
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
          Wyślij swój pierwszy mail, aby zobaczyć szczegółowe statystyki
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-pink-500 dark:text-pink-400">
          <Sparkles size={14} />
          <span>Statystyki pojawią się po pierwszej wysyłce</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl blur-lg opacity-40" />
            <div className="relative p-2.5 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl shadow-lg">
              <BarChart3 size={20} className="text-white" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Analityka maili
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filteredCampaigns.length} {filteredCampaigns.length === 1 ? 'mail' : filteredCampaigns.length < 5 ? 'maile' : 'maili'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Time filter */}
          <div className="flex items-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-1 border border-gray-200/50 dark:border-gray-700/50">
            {[
              { value: 'week', label: '7 dni' },
              { value: 'month', label: '30 dni' },
              { value: 'all', label: 'Wszystko' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setTimeRange(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  timeRange === option.value
                    ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/30'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            onClick={exportToCSV}
            className="group flex items-center gap-2 px-4 py-2.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-all border border-gray-200/50 dark:border-gray-700/50 hover:border-pink-200 dark:hover:border-pink-800/50 hover:shadow-md"
          >
            <Download size={16} className="group-hover:text-pink-500 transition-colors" />
            <span className="hidden sm:inline font-medium">Eksport CSV</span>
          </button>
        </div>
      </div>

      {/* Overall stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={Send}
          label="Wysłane"
          value={overallStats.totalSent}
          color="blue"
        />
        <StatCard
          icon={Users}
          label="Dostarczone"
          value={overallStats.totalDelivered}
          subValue={`${overallStats.deliveryRate}%`}
          color="emerald"
        />
        <StatCard
          icon={Eye}
          label="Otwarte"
          value={overallStats.totalOpened}
          subValue={`${overallStats.openRate}%`}
          color="purple"
        />
        <StatCard
          icon={MousePointer}
          label="Kliknięte"
          value={overallStats.totalClicked}
          subValue={`${overallStats.clickRate}%`}
          color="pink"
        />
        <StatCard
          icon={AlertTriangle}
          label="Odbite"
          value={overallStats.totalBounced}
          color="amber"
        />
        <StatCard
          icon={UserMinus}
          label="Wypisani"
          value={overallStats.totalUnsubscribed}
          color="red"
        />
      </div>

      {/* Campaign list with stats */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden shadow-sm">
        <div className="px-5 py-4 bg-gradient-to-r from-gray-50/80 to-gray-100/50 dark:from-gray-900/50 dark:to-gray-800/30 border-b border-gray-200/50 dark:border-gray-700/50">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail size={16} className="text-pink-500" />
            Szczegóły maili
          </h3>
        </div>

        <div className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
          {filteredCampaigns.map(campaign => {
            const openRate = campaign.delivered_count > 0
              ? (campaign.opened_count / campaign.delivered_count * 100).toFixed(1)
              : 0;
            const clickRate = campaign.opened_count > 0
              ? (campaign.clicked_count / campaign.opened_count * 100).toFixed(1)
              : 0;
            const isExpanded = selectedCampaignId === campaign.id;

            return (
              <div
                key={campaign.id}
                className={`p-5 transition-all duration-200 ${
                  isExpanded ? 'bg-gradient-to-br from-pink-50/50 to-orange-50/30 dark:from-pink-900/10 dark:to-orange-900/10' : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/30'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                      {campaign.name}
                    </h4>
                    <div className="flex items-center gap-4 mt-2">
                      <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                        <Calendar size={12} />
                        {formatDate(campaign.sent_at)}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                        <Users size={12} />
                        {campaign.total_recipients} odbiorców
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{openRate}%</p>
                        <p className="text-xs text-gray-500">Otwarcia</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{clickRate}%</p>
                        <p className="text-xs text-gray-500">Kliknięcia</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedCampaignId(isExpanded ? null : campaign.id)}
                      className={`p-2.5 rounded-xl transition-all duration-200 ${
                        isExpanded
                          ? 'bg-gradient-to-br from-pink-500 to-orange-500 text-white shadow-lg shadow-pink-500/30'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded stats */}
                {isExpanded && (
                  <div className="mt-5 pt-5 border-t border-gray-200/50 dark:border-gray-700/50">
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                      <MiniStat label="Wysłane" value={campaign.sent_count || 0} color="blue" />
                      <MiniStat label="Dostarczone" value={campaign.delivered_count || 0} color="emerald" />
                      <MiniStat label="Otwarte" value={campaign.opened_count || 0} color="purple" />
                      <MiniStat label="Kliknięte" value={campaign.clicked_count || 0} color="pink" />
                      <MiniStat label="Odbite" value={campaign.bounced_count || 0} color="amber" />
                      <MiniStat label="Błędy" value={campaign.failed_count || 0} color="red" />
                      <MiniStat label="Wypisani" value={campaign.unsubscribed_count || 0} color="gray" />
                    </div>

                    {/* Progress bar */}
                    <div className="mt-5">
                      <div className="flex gap-0.5 h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 shadow-inner">
                        <div
                          className="bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-500"
                          style={{ width: `${(campaign.opened_count || 0) / (campaign.total_recipients || 1) * 100}%` }}
                          title="Otwarte"
                        />
                        <div
                          className="bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-500"
                          style={{ width: `${((campaign.delivered_count || 0) - (campaign.opened_count || 0)) / (campaign.total_recipients || 1) * 100}%` }}
                          title="Dostarczone (nie otwarte)"
                        />
                        <div
                          className="bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
                          style={{ width: `${(campaign.bounced_count || 0) / (campaign.total_recipients || 1) * 100}%` }}
                          title="Odbite"
                        />
                      </div>
                      <div className="flex flex-wrap justify-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-gradient-to-r from-emerald-400 to-green-500 rounded-full shadow-sm" /> Otwarte
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full shadow-sm" /> Dostarczone
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full shadow-sm" /> Odbite
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subValue, color }) {
  const colors = {
    blue: {
      gradient: 'from-blue-500 to-indigo-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400'
    },
    emerald: {
      gradient: 'from-emerald-500 to-green-500',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-600 dark:text-emerald-400'
    },
    purple: {
      gradient: 'from-purple-500 to-violet-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400'
    },
    pink: {
      gradient: 'from-pink-500 to-rose-500',
      bg: 'bg-pink-50 dark:bg-pink-900/20',
      text: 'text-pink-600 dark:text-pink-400'
    },
    amber: {
      gradient: 'from-amber-500 to-orange-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400'
    },
    red: {
      gradient: 'from-red-500 to-rose-500',
      bg: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400'
    }
  };

  const colorConfig = colors[color] || colors.blue;

  return (
    <div className="group relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl p-4 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 transition-all duration-300 hover:scale-[1.02]">
      <div className="flex items-center gap-2 mb-2">
        <div className="relative">
          <div className={`absolute inset-0 bg-gradient-to-br ${colorConfig.gradient} rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity`} />
          <div className={`relative p-1.5 bg-gradient-to-br ${colorConfig.gradient} rounded-lg shadow-sm`}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">
        {value.toLocaleString()}
      </p>
      {subValue && (
        <p className={`text-sm font-medium ${colorConfig.text}`}>{subValue}</p>
      )}
    </div>
  );
}

function MiniStat({ label, value, color = 'gray' }) {
  const colors = {
    blue: 'from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 text-blue-600 dark:text-blue-400',
    emerald: 'from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-900/10 text-emerald-600 dark:text-emerald-400',
    purple: 'from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-900/10 text-purple-600 dark:text-purple-400',
    pink: 'from-pink-50 to-pink-100/50 dark:from-pink-900/20 dark:to-pink-900/10 text-pink-600 dark:text-pink-400',
    amber: 'from-amber-50 to-amber-100/50 dark:from-amber-900/20 dark:to-amber-900/10 text-amber-600 dark:text-amber-400',
    red: 'from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-900/10 text-red-600 dark:text-red-400',
    gray: 'from-gray-50 to-gray-100/50 dark:from-gray-900/30 dark:to-gray-800/20 text-gray-600 dark:text-gray-400'
  };

  return (
    <div className={`text-center p-3 bg-gradient-to-br ${colors[color]} rounded-xl border border-gray-200/30 dark:border-gray-700/30`}>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</p>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
