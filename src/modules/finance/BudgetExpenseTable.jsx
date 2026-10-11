import React, { useMemo, useState } from 'react';
import { ArrowDownRight, ChevronDown, ChevronRight, Clock, Edit2, Trash2 } from 'lucide-react';
import { tr, appLocale } from '../../i18n';
import { DataTable, THead, TH, TR, TD } from '../../components/ui/DataTable';
import { num, fmtMoney, fmtPct, fmtDate, isCountedExpense, normKey } from './money';

// Kolor paska realizacji: neutralnie do 90%, bursztyn blisko planu, czerwień po przekroczeniu
// (kolor tylko tam, gdzie coś znaczy — kanon tabel Avenit).
const barColor = (pct) => (pct > 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500');

function Realization({ pct, planned, wide = false }) {
  if (!(planned > 0)) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className={`flex items-center gap-2 ${wide ? '' : 'justify-center'}`}>
      <div className={`${wide ? 'flex-1' : 'w-24'} h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden`}>
        <div className={`h-full rounded-full ${barColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`w-12 text-right text-xs tabular-nums ${pct > 100 ? 'font-semibold text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>{fmtPct(pct, 0)}</span>
    </div>
  );
}

const Remaining = ({ value, strong }) => (
  <span className={`tabular-nums whitespace-nowrap ${value < 0 ? 'font-semibold text-red-700 dark:text-red-400' : strong ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{fmtMoney(value)}</span>
);

/**
 * Planowane wydatki budżetu, pogrupowane (służba/obszar, kategoria albo projekt).
 * Grupa z kilkoma pozycjami = nagłówek z sumami + pozycje; grupa z jedną pozycją = jeden
 * wiersz (bez osobnego „Podsumowania”). Wydatki pozycji rozwijane kliknięciem w „Wydano”.
 */
export default function BudgetExpenseTable({
  items, groupKey, groupLabel, columnLabel, realizationOf, expensesOf, renderMeta,
  onEdit, onDelete, changesOf, onShowChanges, statusLabel,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [expanded, setExpanded] = useState({});

  const groups = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = groupKey(it);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return [...map.entries()].map(([key, list]) => {
      const rows = list
        .map((it) => {
          const planned = num(it.planned_amount);
          const spent = realizationOf(it);
          return { it, planned, spent, pct: planned > 0 ? (spent / planned) * 100 : 0, remaining: planned - spent };
        })
        .sort((a, b) => String(a.it.description || '').localeCompare(String(b.it.description || ''), appLocale()));
      const planned = rows.reduce((s, r) => s + r.planned, 0);
      const spent = rows.reduce((s, r) => s + r.spent, 0);
      return { key, label: groupLabel(key), rows, planned, spent, pct: planned > 0 ? (spent / planned) * 100 : 0, remaining: planned - spent };
    }).sort((a, b) => String(a.label).localeCompare(String(b.label), appLocale()));
  }, [items, groupKey, groupLabel, realizationOf]);

  const total = groups.reduce((acc, g) => ({ planned: acc.planned + g.planned, spent: acc.spent + g.spent }), { planned: 0, spent: 0 });
  const totalPct = total.planned > 0 ? (total.spent / total.planned) * 100 : 0;

  // Opis pozycji, gdy dubluje nazwę grupy (np. „MediaTeam / MediaTeam”) — pomijamy.
  const descOf = (it, g) => {
    const d = it.description || '';
    return normKey(d) === normKey(g.label) || normKey(d) === normKey(g.key) ? '' : d;
  };

  const actions = (it) => (
    <div className="flex justify-end gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
      <button onClick={() => onEdit(it)} className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title={tr('Edytuj')} aria-label={tr('Edytuj pozycję {name}', { name: it.description || it.category })}><Edit2 size={15} /></button>
      <button onClick={() => onDelete(it.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title={tr('Usuń')} aria-label={tr('Usuń pozycję {name}', { name: it.description || it.category })}><Trash2 size={15} /></button>
    </div>
  );

  const plannedCell = (r) => {
    const changes = changesOf(r.it.id);
    return (
      <span className="inline-flex items-center gap-1.5 justify-end tabular-nums whitespace-nowrap">
        {changes.length > 0 && (
          <button onClick={() => onShowChanges(changes)} title={tr('Kwota zmieniona — pokaż historię')} aria-label={tr('Kwota zmieniona — pokaż historię')} className="text-amber-700 hover:text-amber-800 dark:text-amber-400"><Clock size={12} /></button>
        )}
        {fmtMoney(r.planned)}
      </span>
    );
  };

  const spentCell = (r) => {
    const open = !!expanded[r.it.id];
    return (
      <button onClick={() => setExpanded((e) => ({ ...e, [r.it.id]: !open }))} aria-expanded={open}
        className="inline-flex items-center gap-1 tabular-nums whitespace-nowrap text-gray-900 dark:text-white hover:underline decoration-dotted underline-offset-4"
        title={tr('Pokaż wydatki tej pozycji')}>
        {fmtMoney(r.spent)}
        <ChevronDown size={13} className={`text-gray-400 transition ${open ? 'rotate-180 opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`} />
      </button>
    );
  };

  // Wydatki pozycji: wiersze w tych samych kolumnach (kwota pod „Wydano”).
  const expenseList = (r) => {
    const list = expensesOf(r.it);
    if (list.length === 0) {
      return [(
        <TR key={`exp-${r.it.id}`} className="bg-gray-50/60 dark:bg-gray-800/30">
          <TD colSpan={6} className="!py-2 !pl-10 text-sm text-gray-500 dark:text-gray-400">{tr('Brak wydatków w tej pozycji budżetu')}</TD>
        </TR>
      )];
    }
    return list.map((e) => (
      <TR key={`exp-${r.it.id}-${e.id}`} className="bg-gray-50/60 dark:bg-gray-800/30">
        <TD colSpan={2} className="!py-1.5 !pl-10 text-sm">
          <span className="inline-block w-24 tabular-nums text-gray-500 dark:text-gray-400">{fmtDate(e.payment_date)}</span>
          <span className="text-gray-700 dark:text-gray-200">{e.contractor || e.detailed_description || e.description}</span>
          {e.responsible_person && <span className="text-gray-400"> · {e.responsible_person}</span>}
        </TD>
        <TD align="right" className={`!py-1.5 text-sm tabular-nums whitespace-nowrap ${isCountedExpense(e) ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400'}`}>{fmtMoney(e.amount)}</TD>
        <TD colSpan={3} className="!py-1.5 text-xs text-gray-500 dark:text-gray-400">
          {!isCountedExpense(e) && `${statusLabel(e)} · ${tr('nie wliczony')}`}
        </TD>
      </TR>
    ));
  };

  const rowsOut = [];
  for (const g of groups) {
    const single = g.rows.length === 1;
    if (single) {
      const r = g.rows[0];
      const d = descOf(r.it, g);
      rowsOut.push(
        <TR key={r.it.id}>
          <TD>
            <div className="font-medium text-gray-900 dark:text-white">{g.label}</div>
            {d && <div className="text-sm text-gray-500 dark:text-gray-400">{d}</div>}
            {renderMeta(r.it)}
          </TD>
          <TD align="right">{plannedCell(r)}</TD>
          <TD align="right">{spentCell(r)}</TD>
          <TD align="center"><Realization pct={r.pct} planned={r.planned} /></TD>
          <TD align="right"><Remaining value={r.remaining} /></TD>
          <TD align="right">{actions(r.it)}</TD>
        </TR>,
      );
      if (expanded[r.it.id]) rowsOut.push(...expenseList(r));
      continue;
    }
    const isCollapsed = !!collapsed[g.key];
    rowsOut.push(
      <TR key={`g-${g.key}`} className="bg-gray-50/70 dark:bg-gray-800/40">
        <TD>
          <button onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))} aria-expanded={!isCollapsed}
            className="inline-flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
            {isCollapsed ? <ChevronRight size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
            {g.label}
            <span className="font-normal text-gray-400 tabular-nums">· {g.rows.length}</span>
          </button>
        </TD>
        <TD align="right" className="font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">{fmtMoney(g.planned)}</TD>
        <TD align="right" className="font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">{fmtMoney(g.spent)}</TD>
        <TD align="center"><Realization pct={g.pct} planned={g.planned} /></TD>
        <TD align="right" className="font-semibold"><Remaining value={g.remaining} strong /></TD>
        <TD />
      </TR>,
    );
    if (isCollapsed) continue;
    for (const r of g.rows) {
      rowsOut.push(
        <TR key={r.it.id}>
          <TD className="!pl-10">
            <div className="text-gray-700 dark:text-gray-200">{r.it.description || tr('(bez opisu)')}</div>
            {renderMeta(r.it)}
          </TD>
          <TD align="right" className="text-gray-700 dark:text-gray-200">{plannedCell(r)}</TD>
          <TD align="right">{spentCell(r)}</TD>
          <TD align="center"><Realization pct={r.pct} planned={r.planned} /></TD>
          <TD align="right"><Remaining value={r.remaining} /></TD>
          <TD align="right">{actions(r.it)}</TD>
        </TR>,
      );
      if (expanded[r.it.id]) rowsOut.push(...expenseList(r));
    }
  }

  return (
    <>
      {/* Telefon: grupy jako karty — plan, wydano, pozostało i pasek zawsze widoczne. */}
      <div className="sm:hidden space-y-3">
        <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 px-1"><ArrowDownRight size={16} className="text-red-600" /> {tr('Planowane wydatki')}</div>
        {groups.map((g) => (
          <div key={g.key} className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50/70 dark:bg-gray-800/40 flex items-center justify-between gap-2">
              <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{g.label}</span>
              <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtMoney(g.spent)} / {fmtMoney(g.planned)}</span>
            </div>
            {g.rows.map((r) => (
              <div key={r.it.id} className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-800 first:border-t-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {descOf(r.it, g) && <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{descOf(r.it, g)}</div>}
                    {renderMeta(r.it)}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => onEdit(r.it)} className="p-1.5 text-gray-500 dark:text-gray-400 rounded-lg" aria-label={tr('Edytuj pozycję {name}', { name: r.it.description || r.it.category })}><Edit2 size={15} /></button>
                    <button onClick={() => onDelete(r.it.id)} className="p-1.5 text-gray-400 rounded-lg" aria-label={tr('Usuń pozycję {name}', { name: r.it.description || r.it.category })}><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 mt-1.5 text-xs">
                  <span className="tabular-nums text-gray-600 dark:text-gray-300">{fmtMoney(r.spent)} {tr('z')} {fmtMoney(r.planned)}</span>
                  <Remaining value={r.remaining} />
                </div>
                <div className="mt-1.5"><Realization pct={r.pct} planned={r.planned} wide /></div>
              </div>
            ))}
          </div>
        ))}
        <div className="px-1 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white">
          <span>{tr('Razem')}</span>
          <span className="tabular-nums">{fmtMoney(total.spent)} / {fmtMoney(total.planned)}</span>
        </div>
      </div>

      <div className="hidden sm:block rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-800">
          <ArrowDownRight size={16} className="text-red-600" /> {tr('Planowane wydatki')}
          <span className="font-normal text-gray-400 tabular-nums">· {items.length}</span>
        </div>
        <DataTable flush>
          <THead>
            <tr>
              <TH>{columnLabel}</TH>
              <TH align="right">{tr('Plan')}</TH>
              <TH align="right">{tr('Wydano')}</TH>
              <TH align="center">{tr('Realizacja')}</TH>
              <TH align="right">{tr('Pozostało')}</TH>
              <TH align="right"><span className="sr-only">{tr('Akcje')}</span></TH>
            </tr>
          </THead>
          <tbody>
            {rowsOut}
            <TR className="border-t-2 border-gray-200 dark:border-gray-700">
              <TD className="font-semibold text-gray-900 dark:text-white">{tr('Razem')}</TD>
              <TD align="right" className="font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">{fmtMoney(total.planned)}</TD>
              <TD align="right" className="font-semibold tabular-nums whitespace-nowrap text-gray-900 dark:text-white">{fmtMoney(total.spent)}</TD>
              <TD align="center"><Realization pct={totalPct} planned={total.planned} /></TD>
              <TD align="right" className="font-semibold"><Remaining value={total.planned - total.spent} strong /></TD>
              <TD />
            </TR>
          </tbody>
        </DataTable>
      </div>
    </>
  );
}
