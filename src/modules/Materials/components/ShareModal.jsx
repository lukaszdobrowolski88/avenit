import React, { useState, useEffect } from 'react';
import { X, Share2, Trash2, User, Users, Home } from 'lucide-react';
import { tr } from '../../../i18n';

const TYPE_META = {
  user: { label: tr('Osoby'), icon: User, listKey: 'people' },
  home_group: { label: tr('Grupy domowe'), icon: Home, listKey: 'homeGroups' },
  group: { label: tr('Grupy'), icon: Users, listKey: 'groups' },
};

export default function ShareModal({ isOpen, onClose, item, shares: sharesApi }) {
  const [activeType, setActiveType] = useState('user');
  const [targetId, setTargetId] = useState('');
  const [perm, setPerm] = useState('view'); // view | edit
  const [current, setCurrent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState({ people: [], groups: [], homeGroups: [] });

  useEffect(() => {
    if (!isOpen || !item) return;
    setActiveType('user'); setTargetId('');
    sharesApi.fetchTargets().then(setOpts).catch(() => {});
    sharesApi.fetchSharesFor(item).then(setCurrent).catch(() => {});
  }, [isOpen, item]); // eslint-disable-line

  if (!isOpen || !item) return null;

  const list = opts[TYPE_META[activeType].listKey] || [];
  const add = async () => {
    if (!targetId) return;
    const t = list.find((x) => String(x.id) === String(targetId));
    if (!t) return;
    setBusy(true);
    try {
      await sharesApi.createShares(item, [{ type: activeType, id: t.id, label: t.label }], perm);
      setTargetId('');
      setCurrent(await sharesApi.fetchSharesFor(item));
    } catch (e) { window.alert(tr('Nie udało się udostępnić: ') + e.message); }
    finally { setBusy(false); }
  };
  const remove = async (id) => {
    setBusy(true);
    try { await sharesApi.removeShare(id); setCurrent(await sharesApi.fetchSharesFor(item)); }
    catch (e) { window.alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-accent-primary" />
            <h3 className="font-bold text-gray-900 dark:text-white truncate max-w-[280px]">{tr('Udostępnij')}: {item.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(TYPE_META).map(([k, m]) => {
              const Icon = m.icon;
              return (
                <button key={k} onClick={() => { setActiveType(k); setTargetId(''); }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition ${activeType === k ? 'border-accent-primary ring-1 ring-accent-primary bg-accent-primary/5 text-gray-800 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300'}`}>
                  <Icon size={14} /> {m.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white">
              <option value="">{tr('Wybierz…')}</option>
              {list.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <select value={perm} onChange={(e) => setPerm(e.target.value)} className="px-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white shrink-0">
              <option value="view">{tr('Podgląd')}</option>
              <option value="edit">{tr('Edycja')}</option>
            </select>
            <button onClick={add} disabled={busy || !targetId} className="px-4 py-2.5 bg-accent-primary text-white rounded-xl text-sm font-medium disabled:opacity-50 shrink-0">{tr('Dodaj')}</button>
          </div>

          <div className="text-[11px] font-semibold text-gray-500 uppercase pt-1">{tr('Udostępniono')}</div>
          {current.length === 0 ? (
            <p className="text-sm text-gray-400">{tr('Jeszcze nikomu nie udostępniono.')}</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
              {current.map((s) => {
                const Icon = (TYPE_META[s.target_type] || TYPE_META.user).icon;
                return (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700">
                    <Icon size={14} className="text-gray-400 shrink-0" />
                    <span className="text-sm flex-1 truncate text-gray-800 dark:text-gray-100">{s.target_label || s.target_id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${s.permission === 'edit' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>{s.permission === 'edit' ? tr('Edycja') : tr('Podgląd')}</span>
                    <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-600 p-1" title={tr('Usuń')}><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
