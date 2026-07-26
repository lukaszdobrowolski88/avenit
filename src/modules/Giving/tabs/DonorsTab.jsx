import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Receipt, Printer, Download, Search, ArrowLeft, TrendingUp, Calendar } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatMoney, formatDate, memberName, methodLabel, statusLabel } from '../lib/givingApi';

const currentYear = new Date().getFullYear();

export default function DonorsTab({ funds, membersById, withCampusFilter }) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [orgName, setOrgName] = useState('');

  const fundsById = useMemo(() => {
    const m = {}; (funds || []).forEach(f => { m[f.id] = f; }); return m;
  }, [funds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('donations').select('*')
        .in('status', ['completed', 'pending'])
        .order('donation_date', { ascending: false });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setDonations(data || []);
    } catch (err) {
      console.error('Load donors error:', err);
      setDonations([]);
    } finally {
      setLoading(false);
    }
  }, [withCampusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Spróbuj pobrać nazwę organizacji z ustawień (do wydruku PIT)
    (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('key, value').in('key', ['church_name', 'organization_name', 'app_name']);
        const found = (data || []).find(r => r.value);
        if (found) setOrgName(found.value);
      } catch { /* pomiń */ }
    })();
  }, []);

  // Zgrupuj wg darczyńcy: m:<member_id> lub n:<lower(donor_name)>
  const donors = useMemo(() => {
    const map = {};
    donations.forEach(d => {
      const key = d.member_id ? `m:${d.member_id}` : `n:${(d.donor_name || 'Nieznany').toLowerCase()}`;
      if (!map[key]) {
        const m = d.member_id ? membersById?.[d.member_id] : null;
        map[key] = {
          key,
          name: m ? memberName(m) : (d.donor_name || 'Darczyńca nieznany'),
          isMember: !!d.member_id,
          address: d.donor_address || m?.address || '',
          email: d.donor_email || m?.email || '',
          items: [],
          count: 0,
          totalAll: 0,
          totalYear: 0,
          lastDate: null,
        };
      }
      const g = map[key];
      g.items.push(d);
      g.count += 1;
      if (!g.address && d.donor_address) g.address = d.donor_address;
      if (!g.email && d.donor_email) g.email = d.donor_email;
      if (!g.lastDate || d.donation_date > g.lastDate) g.lastDate = d.donation_date;
      // Sumy liczymy tylko z zaksięgowanych (completed)
      if (d.status === 'completed') {
        const amt = Number(d.amount) || 0;
        g.totalAll += amt;
        if ((d.donation_date || '').slice(0, 4) === String(currentYear)) g.totalYear += amt;
      }
    });
    return Object.values(map).sort((a, b) => b.totalAll - a.totalAll);
  }, [donations, membersById]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return donors;
    return donors.filter(d => d.name.toLowerCase().includes(s) || (d.email || '').toLowerCase().includes(s));
  }, [donors, search]);

  const selected = useMemo(() => donors.find(d => d.key === selectedKey) || null, [donors, selectedKey]);

  const printStatement = (donor) => {
    // Do zestawienia PIT: bieżący rok, tylko zaksięgowane i fundusze uprawniające do odpisu
    const items = donor.items.filter(d => {
      if (d.status !== 'completed') return false;
      if ((d.donation_date || '').slice(0, 4) !== String(currentYear)) return false;
      const fund = fundsById[d.fund_id];
      return !d.fund_id || fund?.is_tax_deductible !== false;
    }).sort((a, b) => (a.donation_date || '').localeCompare(b.donation_date || ''));

    if (items.length === 0) {
      alert(`Brak darowizn uprawniających do odpisu PIT dla tej osoby w roku ${currentYear}.`);
      return;
    }
    const total = items.reduce((s, d) => s + (Number(d.amount) || 0), 0);

    const rows = items.map(d => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${formatDate(d.donation_date)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${fundsById[d.fund_id]?.name || 'Darowizna'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${(d.method || '').toUpperCase()}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatMoney(d.amount, d.currency)}</td>
      </tr>`).join('');
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Zestawienie darowizn ${currentYear} — ${donor.name}</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.5}
        h1{font-size:20px;margin:0 0 4px} .muted{color:#6b7280;font-size:13px}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #10b981;padding-bottom:14px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
        th{text-align:left;padding:6px 10px;border-bottom:2px solid #d1d5db;font-size:12px;text-transform:uppercase;color:#6b7280}
        .total{margin-top:16px;text-align:right;font-size:18px;font-weight:700}
        .box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:16px 0}
        .foot{margin-top:28px;font-size:12px;color:#6b7280;border-top:1px solid #eee;padding-top:12px}
        @media print{body{margin:0}}
      </style></head><body>
      <div class="head">
        <div><h1>${orgName || 'Zestawienie darowizn'}</h1><div class="muted">Roczne zestawienie darowizn za rok ${currentYear}</div></div>
        <div class="muted" style="text-align:right">Data wystawienia:<br>${new Date().toLocaleDateString('pl-PL')}</div>
      </div>
      <div class="box">
        <strong>Darczyńca:</strong> ${donor.name}<br>
        ${donor.address ? `<span class="muted">Adres: ${donor.address}</span><br>` : ''}
        ${donor.email ? `<span class="muted">E-mail: ${donor.email}</span>` : ''}
      </div>
      <table>
        <thead><tr><th>Data</th><th>Cel</th><th>Forma</th><th style="text-align:right">Kwota</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="total">Razem: ${formatMoney(total)}</div>
      <div class="foot">
        Niniejsze zestawienie potwierdza darowizny przekazane na rzecz ${orgName || 'organizacji'} w roku ${currentYear}.
        Darowizny na cele kultu religijnego / działalności pożytku publicznego mogą podlegać odliczeniu od podstawy opodatkowania
        zgodnie z obowiązującymi przepisami (ustawa o PIT). Dokument wygenerowany automatycznie.
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Zezwól na wyskakujące okna, aby wydrukować zestawienie.'); return; }
    w.document.write(html); w.document.close();
  };

  const exportCsv = (donor) => {
    const rows = [['Data', 'Fundusz', 'Kwota', 'Metoda', 'Status']];
    donor.items
      .slice()
      .sort((a, b) => (b.donation_date || '').localeCompare(a.donation_date || ''))
      .forEach(d => {
        rows.push([
          d.donation_date || '', fundsById[d.fund_id]?.name || '',
          String(d.amount), methodLabel(d.method), statusLabel(d.status),
        ]);
      });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (donor.name || 'darczynca').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'darczynca';
    a.href = url; a.download = `darowizny_${safe}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const grandTotal = useMemo(() => donors.reduce((s, d) => s + d.totalAll, 0), [donors]);

  return (
    <div className="space-y-4">
      {/* Podsumowanie u góry */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Darczyńców: <b className="text-gray-900 dark:text-white">{donors.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">Suma darowizn: <b className="text-accent-primary dark:text-accent-primary-light">{formatMoney(grandTotal)}</b></span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* Lewa kolumna — lista darczyńców */}
        <div className={`${selected ? 'hidden lg:block' : 'block'}`}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-3 border-b border-gray-100 dark:border-gray-700">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Szukaj darczyńcy..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
                />
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Ładowanie...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Brak darczyńców.</div>
              ) : (
                filtered.map(d => {
                  const isActive = d.key === selectedKey;
                  return (
                    <button
                      key={d.key}
                      onClick={() => setSelectedKey(d.key)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left border-b border-gray-50 dark:border-gray-700/50 transition ${
                        isActive ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.name}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {d.count} {d.count === 1 ? 'darowizna' : 'darowizn'}{d.lastDate ? ` · ost. ${formatDate(d.lastDate)}` : ''}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums shrink-0">{formatMoney(d.totalAll)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Prawy panel — wybrany darczyńca */}
        <div className={`${selected ? 'block' : 'hidden lg:block'}`}>
          {!selected ? (
            <div className="h-full min-h-[300px] flex items-center justify-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-12 text-center">
              <div>
                <Users size={44} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Wybierz darczyńcę z listy, aby zobaczyć jego kartę i historię darowizn.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Karta darczyńcy */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start gap-3">
                  <button onClick={() => setSelectedKey(null)} className="lg:hidden p-2 -ml-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"><ArrowLeft size={20} /></button>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white shrink-0">
                    <Users size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{selected.name}</h2>
                      {selected.isMember && <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-accent-primary-lightest text-accent-primary dark:bg-accent-primary-darkest/40 dark:text-accent-primary-light">członek</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {selected.email && <span className="truncate">{selected.email}</span>}
                      {selected.address && <span className="truncate">{selected.address}</span>}
                    </div>
                  </div>
                </div>

                {/* Karty podsumowania */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500"><Calendar size={13} /> Suma {currentYear}</div>
                    <div className="mt-1 text-base font-bold text-gray-900 dark:text-white tabular-nums">{formatMoney(selected.totalYear)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500"><TrendingUp size={13} /> Suma łącznie</div>
                    <div className="mt-1 text-base font-bold text-accent-primary dark:text-accent-primary-light tabular-nums">{formatMoney(selected.totalAll)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500"><Receipt size={13} /> Darowizn</div>
                    <div className="mt-1 text-base font-bold text-gray-900 dark:text-white tabular-nums">{selected.count}</div>
                  </div>
                </div>

                {/* Akcje */}
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <button onClick={() => printStatement(selected)} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
                    <Printer size={16} /> Zestawienie PIT
                  </button>
                  <button onClick={() => exportCsv(selected)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-sm">
                    <Download size={16} /> Eksport CSV
                  </button>
                </div>
              </div>

              {/* Historia darowizn */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {selected.items.length === 0 ? (
                  <div className="p-12 text-center">
                    <Receipt size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">Brak darowizn.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                          <th className="px-4 py-3 font-semibold">Data</th>
                          <th className="px-4 py-3 font-semibold">Fundusz</th>
                          <th className="px-4 py-3 font-semibold text-right">Kwota</th>
                          <th className="px-4 py-3 font-semibold">Metoda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.items
                          .slice()
                          .sort((a, b) => (b.donation_date || '').localeCompare(a.donation_date || ''))
                          .map(d => (
                            <tr key={d.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{formatDate(d.donation_date)}</td>
                              <td className="px-4 py-3">
                                {d.fund_id ? (
                                  <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                                    <span className="w-2 h-2 rounded-full" style={{ background: fundsById[d.fund_id]?.color || '#94a3b8' }} />
                                    {fundsById[d.fund_id]?.name || '—'}
                                  </span>
                                ) : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatMoney(d.amount, d.currency)}</td>
                              <td className="px-4 py-3">
                                <span className="text-gray-600 dark:text-gray-300">{methodLabel(d.method)}</span>
                                {d.status === 'pending' && <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">{statusLabel(d.status)}</span>}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
