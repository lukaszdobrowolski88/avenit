import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Printer, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { formatMoney, memberName, splitForStatement, isFundDeductible, defaultStatementYear } from '../lib/givingApi';
import { buildStatementHtml, readSavedOrgName, saveOrgName, loadOrgNameFromSettings } from '../lib/pitStatement';
import { toast } from '../../../lib/toast';
import Spinner from '../../../components/Spinner';
import EmptyState from '../../../components/EmptyState';
import { tr } from '../../../i18n';

const currentYear = new Date().getFullYear();

export default function StatementsTab({ funds, membersById, withCampusFilter }) {
  // Zestawienia robi się w styczniu–kwietniu za poprzedni rok.
  const [year, setYear] = useState(defaultStatementYear());
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [orgName, setOrgName] = useState(readSavedOrgName);

  const fundsById = useMemo(() => { const m = {}; (funds || []).forEach(f => { m[f.id] = f; }); return m; }, [funds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('donations').select('*')
        .gte('donation_date', `${year}-01-01`).lte('donation_date', `${year}-12-31`)
        .eq('status', 'completed').order('donation_date', { ascending: true });
      q = withCampusFilter(q);
      const { data, error } = await q;
      if (error) throw error;
      setDonations(data || []);
    } catch (err) {
      console.error('Statements load error:', err);
      setDonations([]);
      toast.error(tr('Nie udało się wczytać darowizn do zestawień.'));
    } finally { setLoading(false); }
  }, [withCampusFilter, year]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Spróbuj pobrać nazwę organizacji z ustawień (opcjonalnie)
    if (readSavedOrgName()) return;
    loadOrgNameFromSettings(supabase).then((v) => { if (v) setOrgName((cur) => cur || v); });
  }, []);

  // Zgrupuj wg darczyńcy (bez funduszy oznaczonych jako nieodliczalne); gotówka liczona osobno.
  const byDonor = useMemo(() => {
    const map = {};
    donations.forEach(d => {
      if (!isFundDeductible(d, fundsById)) return;
      const key = d.member_id ? `m:${d.member_id}` : `n:${(d.donor_name || 'Nieznany').toLowerCase()}`;
      if (!map[key]) {
        const m = d.member_id ? membersById?.[d.member_id] : null;
        map[key] = {
          key,
          name: m ? memberName(m) : (d.donor_name || tr('Darczyńca nieznany')),
          address: d.donor_address || m?.address || '',
          email: d.donor_email || m?.email || '',
          items: [], total: 0,
        };
      }
      map[key].items.push(d);
    });
    return Object.values(map).map((g) => {
      const split = splitForStatement(g.items, fundsById);
      return { ...g, total: split.deductibleTotal, cashTotal: split.cashTotal };
    }).sort((a, b) => b.total - a.total);
  }, [donations, fundsById, membersById]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? byDonor.filter(d => d.name.toLowerCase().includes(s)) : byDonor;
  }, [byDonor, search]);

  const grandTotal = useMemo(() => byDonor.reduce((s, d) => s + d.total, 0), [byDonor]);
  const grandCash = useMemo(() => byDonor.reduce((s, d) => s + d.cashTotal, 0), [byDonor]);

  const yearOptions = useMemo(() => {
    const arr = []; for (let y = currentYear; y >= currentYear - 6; y--) arr.push({ value: y, label: String(y) }); return arr;
  }, []);

  const printStatement = (donor) => {
    const { html } = buildStatementHtml({ orgName, year, donor, items: donor.items, fundsById });
    if (!html) { toast.info(tr('Brak darowizn do zestawienia dla tej osoby w roku {year}.', { year })); return; }
    const w = window.open('', '_blank');
    if (!w) { toast.info(tr('Zezwól na wyskakujące okna, aby wydrukować zestawienie.')); return; }
    w.opener = null;
    w.document.write(html); w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex items-start gap-3">
        <FileText size={20} className="text-gray-500 dark:text-gray-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 dark:text-gray-200">{tr('Roczne zestawienia darowizn do rozliczenia PIT. Liczą się darowizny zaksięgowane i wpłacone na rachunek, poza funduszami oznaczonymi jako nieodliczalne. Wpłaty gotówką pokazujemy osobno — nie podlegają odliczeniu.')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-32"><CustomSelect label={tr('Rok')} value={year} onChange={setYear} options={yearOptions} /></div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">{tr('Nazwa organizacji (na wydruku)')}</label>
          <input value={orgName} onChange={e => setOrgName(e.target.value)} onBlur={() => saveOrgName(orgName.trim())} placeholder={tr('np. Kościół ...')} className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr('Szukaj darczyńcy...')} className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-gray-600 dark:text-gray-300">{tr('Darczyńców:')} <b className="text-gray-900 dark:text-white">{byDonor.length}</b></span>
        <span className="text-gray-600 dark:text-gray-300">{tr('Wpłaty na rachunek:')} <b className="text-gray-900 dark:text-white tabular-nums">{formatMoney(grandTotal)}</b></span>
        {grandCash > 0 && <span className="text-gray-600 dark:text-gray-300">{tr('Gotówka (bez odliczenia):')} <b className="text-gray-900 dark:text-white tabular-nums">{formatMoney(grandCash)}</b></span>}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? <Spinner center />
        : filtered.length === 0 ? (
          <EmptyState icon={FileText} title={tr('Brak darowizn do zestawienia za {year}.', { year })} />
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {filtered.map(d => (
              <div key={d.key} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{d.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{tr('Liczba darowizn: {n}', { n: d.items.length })} · {d.address ? d.address : tr('brak adresu')}{d.cashTotal > 0 ? ` · ${tr('gotówką {amount}', { amount: formatMoney(d.cashTotal) })}` : ''}</div>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{formatMoney(d.total)}</span>
                  <button onClick={() => printStatement(d)} aria-label={tr('Zestawienie dla {name}', { name: d.name })} className="px-3 py-2 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm font-medium flex items-center gap-2 shadow-sm"><Printer size={15} /> <span className="hidden sm:inline">{tr('Zestawienie')}</span></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
