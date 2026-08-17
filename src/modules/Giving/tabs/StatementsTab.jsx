import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Printer, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import CustomSelect from '../../../components/CustomSelect';
import { formatMoney, formatDate, memberName } from '../lib/givingApi';
import { toast } from '../../../lib/toast';

const currentYear = new Date().getFullYear();

export default function StatementsTab({ funds, membersById, withCampusFilter }) {
  const [year, setYear] = useState(currentYear);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [orgName, setOrgName] = useState('');

  const fundsById = useMemo(() => { const m = {}; (funds || []).forEach(f => { m[f.id] = f; }); return m; }, [funds]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase.from('donations').select('*')
        .gte('donation_date', `${year}-01-01`).lte('donation_date', `${year}-12-31`)
        .eq('status', 'completed').order('donation_date', { ascending: true });
      q = withCampusFilter(q);
      const { data } = await q;
      setDonations(data || []);
    } catch (err) {
      console.error('Statements load error:', err);
      setDonations([]);
    } finally { setLoading(false); }
  }, [withCampusFilter, year]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // Spróbuj pobrać nazwę organizacji z ustawień (opcjonalnie)
    (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('key, value').in('key', ['church_name', 'organization_name', 'app_name']);
        const found = (data || []).find(r => r.value);
        if (found) setOrgName(found.value);
      } catch { /* pomiń */ }
    })();
  }, []);

  // Zgrupuj wg darczyńcy, licząc tylko fundusze uprawniające do odpisu
  const byDonor = useMemo(() => {
    const map = {};
    donations.forEach(d => {
      const fund = fundsById[d.fund_id];
      const deductible = !d.fund_id || fund?.is_tax_deductible !== false; // domyślnie liczymy, chyba że fundusz oznaczono jako nieodliczalny
      if (!deductible) return;
      const key = d.member_id ? `m:${d.member_id}` : `n:${(d.donor_name || 'Nieznany').toLowerCase()}`;
      if (!map[key]) {
        const m = d.member_id ? membersById?.[d.member_id] : null;
        map[key] = {
          key,
          name: m ? memberName(m) : (d.donor_name || 'Darczyńca nieznany'),
          address: d.donor_address || m?.address || '',
          email: d.donor_email || m?.email || '',
          items: [], total: 0,
        };
      }
      map[key].items.push(d);
      map[key].total += (Number(d.amount) || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [donations, fundsById, membersById]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? byDonor.filter(d => d.name.toLowerCase().includes(s)) : byDonor;
  }, [byDonor, search]);

  const grandTotal = useMemo(() => byDonor.reduce((s, d) => s + d.total, 0), [byDonor]);

  const yearOptions = useMemo(() => {
    const arr = []; for (let y = currentYear; y >= currentYear - 6; y--) arr.push({ value: y, label: String(y) }); return arr;
  }, []);

  const printStatement = (donor) => {
    const rows = donor.items.map(d => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${formatDate(d.donation_date)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${fundsById[d.fund_id]?.name || 'Darowizna'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${(d.method || '').toUpperCase()}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${formatMoney(d.amount, d.currency)}</td>
      </tr>`).join('');
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Zestawienie darowizn ${year} — ${donor.name}</title>
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
        <div><h1>${orgName || 'Zestawienie darowizn'}</h1><div class="muted">Roczne zestawienie darowizn za rok ${year}</div></div>
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
      <div class="total">Razem: ${formatMoney(donor.total)}</div>
      <div class="foot">
        Niniejsze zestawienie potwierdza darowizny przekazane na rzecz ${orgName || 'organizacji'} w roku ${year}.
        Darowizny na cele kultu religijnego / działalności pożytku publicznego mogą podlegać odliczeniu od podstawy opodatkowania
        zgodnie z obowiązującymi przepisami (ustawa o PIT). Dokument wygenerowany automatycznie.
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.info('Zezwól na wyskakujące okna, aby wydrukować zestawienie.'); return; }
    w.document.write(html); w.document.close();
  };

  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-4 flex items-start gap-3">
        <FileText size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-sm text-emerald-800 dark:text-emerald-300">Generuj roczne zestawienia darowizn dla darczyńców — do wykorzystania przy odliczeniu w rozliczeniu PIT. Liczą się darowizny zaksięgowane z funduszy oznaczonych jako „odpis PIT".</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-32"><CustomSelect label="Rok" value={year} onChange={setYear} options={yearOptions} /></div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 ml-1">Nazwa organizacji (na wydruku)</label>
          <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="np. Kościół ..." className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj darczyńcy..." className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100" />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-500 dark:text-gray-400">Darczyńców: <b className="text-gray-900 dark:text-white">{byDonor.length}</b></span>
        <span className="text-gray-500 dark:text-gray-400">Suma odliczalna: <b className="text-accent-primary dark:text-accent-primary-light">{formatMoney(grandTotal)}</b></span>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? <div className="p-10 text-center text-gray-400">Ładowanie...</div>
        : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">Brak darowizn do zestawienia za {year}.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {filtered.map(d => (
              <div key={d.key} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{d.name}</div>
                  <div className="text-xs text-gray-400">{d.items.length} darowizn · {d.address ? d.address : 'brak adresu'}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{formatMoney(d.total)}</span>
                  <button onClick={() => printStatement(d)} className="px-3 py-2 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white text-sm font-medium flex items-center gap-2 shadow-sm"><Printer size={15} /> Zestawienie</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
