import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Receipt, Printer, Download, Search, ArrowLeft, TrendingUp, Calendar } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { formatMoney, formatDate, memberName, methodLabel, statusLabel, defaultStatementYear } from '../lib/givingApi';
import { buildStatementHtml, readSavedOrgName, loadOrgNameFromSettings } from '../lib/pitStatement';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import CustomSelect from '../../../components/CustomSelect';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { DataTable, THead, TH, TR, TD, StatusPill, STATUS_COLORS } from '../../../components/ui/DataTable';

const currentYear = new Date().getFullYear();

export default function DonorsTab({ funds, membersById, withCampusFilter }) {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [orgName, setOrgName] = useState(readSavedOrgName);
  // Rok karty i zestawienia PIT (w styczniu–kwietniu domyślnie poprzedni).
  const [cardYear, setCardYear] = useState(defaultStatementYear());

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
    // Nazwa organizacji do wydruku PIT: zapamiętana w „Zestawieniach PIT” albo z ustawień.
    if (readSavedOrgName()) return;
    loadOrgNameFromSettings(supabase).then((v) => { if (v) setOrgName((cur) => cur || v); });
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
          name: m ? memberName(m) : (d.donor_name || tr('Darczyńca nieznany')),
          isMember: !!d.member_id,
          address: d.donor_address || m?.address || '',
          email: d.donor_email || m?.email || '',
          items: [],
          count: 0,
          pendingCount: 0,
          totalAll: 0,
          lastDate: null,
        };
      }
      const g = map[key];
      g.items.push(d);
      if (d.status === 'completed') g.count += 1; else g.pendingCount += 1;
      if (!g.address && d.donor_address) g.address = d.donor_address;
      if (!g.email && d.donor_email) g.email = d.donor_email;
      if (!g.lastDate || d.donation_date > g.lastDate) g.lastDate = d.donation_date;
      // Sumy liczymy tylko z zaksięgowanych (completed)
      if (d.status === 'completed') g.totalAll += Number(d.amount) || 0;
    });
    return Object.values(map).sort((a, b) => b.totalAll - a.totalAll);
  }, [donations, membersById]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return donors;
    return donors.filter(d => d.name.toLowerCase().includes(s) || (d.email || '').toLowerCase().includes(s));
  }, [donors, search]);

  const selected = useMemo(() => donors.find(d => d.key === selectedKey) || null, [donors, selectedKey]);
  const selectedYearTotal = useMemo(() => (selected?.items || [])
    .filter((d) => d.status === 'completed' && String(d.donation_date || '').slice(0, 4) === String(cardYear))
    .reduce((s2, d) => s2 + (Number(d.amount) || 0), 0), [selected, cardYear]);
  const cardYearOptions = useMemo(() => { const arr = []; for (let y = currentYear; y >= currentYear - 6; y--) arr.push({ value: y, label: String(y) }); return arr; }, []);

  const printStatement = (donor) => {
    // Zestawienie za wybrany rok: zaksięgowane, bez funduszy nieodliczalnych; gotówka osobno.
    const items = donor.items.filter((d) => String(d.donation_date || '').slice(0, 4) === String(cardYear));
    const { html } = buildStatementHtml({ orgName, year: cardYear, donor, items, fundsById });
    if (!html) {
      toast.error(tr('Brak darowizn uprawniających do odpisu PIT dla tej osoby w roku {year}.', { year: cardYear }));
      return;
    }
    const w = window.open('', '_blank');
    if (!w) { toast.info(tr('Zezwól na wyskakujące okna, aby wydrukować zestawienie.')); return; }
    w.opener = null;
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-gray-600 dark:text-gray-300">{tr('Darczyńców:')} <b className="text-gray-900 dark:text-white">{donors.length}</b></span>
        <span className="text-gray-600 dark:text-gray-300">{tr('Zaksięgowano łącznie:')} <b className="text-gray-900 dark:text-white tabular-nums">{formatMoney(grandTotal)}</b></span>
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
                  placeholder={tr('Szukaj darczyńcy...')}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-primary-light/30 focus:border-accent-primary-light outline-none"
                />
              </div>
            </div>
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
              {loading ? (
                <Spinner center />
              ) : filtered.length === 0 ? (
                <EmptyState compact icon={Users} title={tr('Brak darczyńców.')} />
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
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {tr('Zaksięgowane: {n}', { n: d.count })}{d.pendingCount ? ` · ${tr('oczekuje: {n}', { n: d.pendingCount })}` : ''}{d.lastDate ? ` · ${tr('ost. {date}', { date: formatDate(d.lastDate) })}` : ''}
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
            <div className="h-full min-h-[300px] flex items-center justify-center bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
              <EmptyState icon={Users} title={tr('Wybierz darczyńcę z listy, aby zobaczyć jego kartę i historię darowizn.')} />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Karta darczyńcy */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start gap-3">
                  <button onClick={() => setSelectedKey(null)} aria-label={tr('Wróć do listy darczyńców')} className="lg:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"><ArrowLeft size={20} /></button>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center text-white shrink-0">
                    <Users size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{selected.name}</h2>
                      {selected.isMember && <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-accent-primary-lightest text-accent-primary dark:bg-accent-primary-darkest/40 dark:text-accent-primary-light">{tr('członek')}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {selected.email && <span className="truncate">{selected.email}</span>}
                      {selected.address && <span className="truncate">{selected.address}</span>}
                    </div>
                  </div>
                </div>

                {/* Karty podsumowania */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><Calendar size={13} /> {tr('Suma {year}', { year: cardYear })}</div>
                    <div className="mt-1 text-base font-bold text-gray-900 dark:text-white tabular-nums">{formatMoney(selectedYearTotal)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><TrendingUp size={13} /> {tr('Suma łącznie')}</div>
                    <div className="mt-1 text-base font-bold text-gray-900 dark:text-white tabular-nums">{formatMoney(selected.totalAll)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><Receipt size={13} /> {tr('Liczba darowizn')}</div>
                    <div className="mt-1 text-base font-bold text-gray-900 dark:text-white tabular-nums">{selected.count}{selected.pendingCount ? <span className="text-xs font-normal text-gray-500 dark:text-gray-400"> {tr('(+{n} oczekuje)', { n: selected.pendingCount })}</span> : null}</div>
                  </div>
                </div>

                {/* Akcje */}
                <div className="flex flex-wrap items-end gap-3 mt-4">
                  <div className="w-28"><CustomSelect label={tr('Rok')} value={cardYear} onChange={(v) => setCardYear(parseInt(v))} options={cardYearOptions} compact /></div>
                  <button onClick={() => printStatement(selected)} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition">
                    <Printer size={16} /> {tr('Zestawienie PIT {year}', { year: cardYear })}
                  </button>
                  <button onClick={() => exportCsv(selected)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 text-sm">
                    <Download size={16} /> {tr('Eksport CSV')}
                  </button>
                </div>
              </div>

              {/* Historia darowizn */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {selected.items.length === 0 ? (
                  <EmptyState icon={Receipt} title={tr('Brak darowizn.')} />
                ) : (
                  <DataTable flush>
                    <THead>
                      <tr>
                        <TH>{tr('Data')}</TH>
                        <TH>{tr('Fundusz')}</TH>
                        <TH align="right">{tr('Kwota')}</TH>
                        <TH>{tr('Metoda')}</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {selected.items
                        .slice()
                        .sort((a, b) => (b.donation_date || '').localeCompare(a.donation_date || ''))
                        .map(d => (
                          <TR key={d.id}>
                            <TD muted numeric className="whitespace-nowrap">{formatDate(d.donation_date)}</TD>
                            <TD muted>
                              {d.fund_id ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full" style={{ background: fundsById[d.fund_id]?.color || '#94a3b8' }} />
                                  {fundsById[d.fund_id]?.name || ''}
                                </span>
                              ) : null}
                            </TD>
                            <TD align="right" numeric className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">{formatMoney(d.amount, d.currency)}</TD>
                            <TD muted>
                              <span>{tr(methodLabel(d.method))}</span>
                              {d.status === 'pending' && <StatusPill color={STATUS_COLORS.warning} className="ml-2">{tr(statusLabel(d.status))}</StatusPill>}
                            </TD>
                          </TR>
                        ))}
                    </tbody>
                  </DataTable>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
