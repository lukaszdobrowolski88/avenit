import React, { useState, useEffect } from 'react';
import { Hash, BarChart3, PieChart, BatteryMedium, Table2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import CustomSelect from '../../../components/CustomSelect';
import '../../../components/toolbar.css';
import { FORM_LABEL, FORM_INPUT } from '../components/FormField';
import { tr } from '../../../i18n';
import { supabase } from '../../../lib/supabase';
import { getColumnType } from '../lib/columnTypes';

const TYPES = [
  { type: 'number', label: 'Liczba', icon: Hash },
  { type: 'chart', label: 'Wykres', icon: BarChart3 },
  { type: 'battery', label: 'Bateria', icon: BatteryMedium },
  { type: 'table', label: 'Tabela', icon: Table2 },
];
const CHARTS = [{ k: 'bar', label: 'Słupkowy', icon: BarChart3 }, { k: 'pie', label: 'Kołowy', icon: PieChart }];

const LABEL = FORM_LABEL;

export default function WidgetConfigModal({ initial, boards, onSave, onClose }) {
  const [w, setW] = useState(initial || { type: 'number', title: '', boardId: boards[0]?.id, aggregation: 'count', chartType: 'bar', size: 'small' });
  const [cols, setCols] = useState([]);

  useEffect(() => {
    if (!w.boardId) return;
    supabase.from('board_columns').select('*').eq('board_id', w.boardId).order('display_order').then(({ data }) => setCols(data || []));
  }, [w.boardId]);

  const set = (patch) => setW(prev => ({ ...prev, ...patch }));
  const groupable = cols.filter(c => getColumnType(c.type).groupable);
  const numberCols = cols.filter(c => c.type === 'number' || c.type === 'rating');

  const save = () => {
    const typeLabel = TYPES.find(t => t.type === w.type)?.label;
    const title = w.title || (typeLabel ? tr(typeLabel) : '');
    onSave({ id: w.id || `w_${Math.random().toString(36).slice(2, 9)}`, ...w, title });
  };

  return (
    <Modal isOpen onClose={onClose} title={initial ? tr('Edytuj widżet') : tr('Nowy widżet')} size="md"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button onClick={save} disabled={!w.boardId}>{tr('Zapisz')}</Button>
      </>}>
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="widget-title" className={LABEL}>{tr('Tytuł')}</label>
          <input id="widget-title" value={w.title} onChange={(e) => set({ title: e.target.value })} placeholder={tr('np. Zadania wg statusu')} className={FORM_INPUT} />
        </div>

        <div>
          <span id="widget-type" className={LABEL}>{tr('Typ widżetu')}</span>
          <div className="seg-bar w-full overflow-x-auto" role="group" aria-labelledby="widget-type">
            {TYPES.map(t => (
              <button key={t.type} type="button" className="seg-btn flex-1 justify-center" aria-pressed={w.type === t.type} onClick={() => set({ type: t.type })}>
                <t.icon size={15} aria-hidden="true" />{tr(t.label)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="widget-board" className={LABEL}>{tr('Tablica')}</label>
          <CustomSelect id="widget-board" value={w.boardId} onChange={(v) => set({ boardId: v, columnId: undefined })}
            options={boards} mapOptionToValue={(b) => b.id} mapOptionToLabel={(b) => b.name} />
        </div>

        {(w.type === 'chart' || w.type === 'battery') && (
          <div>
            <label htmlFor="widget-col" className={LABEL}>{tr('Grupuj wg kolumny')}</label>
            <CustomSelect id="widget-col" placeholder={tr('— wybierz —')} value={w.columnId || ''} onChange={(v) => set({ columnId: v })}
              options={w.type === 'battery' ? groupable.filter(c => ['status', 'priority'].includes(c.type)) : groupable}
              mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
          </div>
        )}

        {w.type === 'chart' && (
          <div>
            <span id="widget-chart" className={LABEL}>{tr('Rodzaj wykresu')}</span>
            <div className="seg-bar" role="group" aria-labelledby="widget-chart">
              {CHARTS.map(o => (
                <button key={o.k} type="button" className="seg-btn" aria-pressed={w.chartType === o.k} onClick={() => set({ chartType: o.k })}>
                  <o.icon size={15} aria-hidden="true" />{tr(o.label)}
                </button>
              ))}
            </div>
          </div>
        )}

        {w.type === 'number' && (
          <>
            <div>
              <label htmlFor="widget-agg" className={LABEL}>{tr('Agregacja')}</label>
              <CustomSelect id="widget-agg" value={w.aggregation} onChange={(v) => set({ aggregation: v })}
                options={[
                  { value: 'count', label: tr('Liczba elementów') },
                  { value: 'sum', label: tr('Suma kolumny liczbowej') },
                  { value: 'avg', label: tr('Średnia kolumny liczbowej') },
                ]} />
            </div>
            {(w.aggregation === 'sum' || w.aggregation === 'avg') && (
              <div>
                <label htmlFor="widget-num" className={LABEL}>{tr('Kolumna liczbowa')}</label>
                <CustomSelect id="widget-num" placeholder={tr('— wybierz —')} value={w.columnId || ''} onChange={(v) => set({ columnId: v })}
                  options={numberCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
              </div>
            )}
          </>
        )}

        <div>
          <label htmlFor="widget-size" className={LABEL}>{tr('Rozmiar')}</label>
          <CustomSelect id="widget-size" value={w.size} onChange={(v) => set({ size: v })}
            options={[
              { value: 'small', label: tr('Mały') },
              { value: 'medium', label: tr('Średni') },
              { value: 'large', label: tr('Duży') },
            ]} />
        </div>
      </div>
    </Modal>
  );
}
