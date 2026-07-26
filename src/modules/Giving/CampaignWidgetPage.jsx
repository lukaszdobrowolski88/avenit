// Publiczny, osadzalny (iframe) widget „termometr zbiórki".
// Sam widget — bez nagłówków aplikacji, tło minimalne (przezroczyste dla iframe).
// Trasa: /widget/campaign/:id  →  woła publiczną funkcję campaign-progress.
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Heart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatMoney } from './lib/givingApi';

const REFRESH_MS = 60000; // odświeżanie co ~60 s

export default function CampaignWidgetPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProgress = useCallback(async () => {
    if (!id) { setError('Brak identyfikatora kampanii.'); setLoading(false); return; }
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke('campaign-progress', {
        body: { campaign_id: id },
      });
      if (fnErr || res?.error) throw new Error(res?.error || fnErr?.message || 'Nie udało się pobrać danych');
      setData(res);
      setError('');
    } catch (err) {
      setError(err.message || 'Nie udało się pobrać danych kampanii.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProgress();
    const t = setInterval(fetchProgress, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchProgress]);

  const currency = data?.currency || 'PLN';
  const pct = data ? Number(data.pct) || 0 : 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent p-3">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
            <Loader2 size={18} className="animate-spin" /> Ładowanie...
          </div>
        ) : error ? (
          <div className="py-6 text-center text-sm text-red-500">{error}</div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
                <Heart className="text-white" size={16} />
              </div>
              <h1 className="font-bold text-gray-900 dark:text-white text-base truncate">{data?.name || 'Zbiórka'}</h1>
            </div>

            <div className="flex justify-between items-baseline text-sm mb-1.5">
              <span className="font-bold text-gray-900 dark:text-white text-lg">{formatMoney(data?.raised, currency)}</span>
              <span className="text-gray-400">z {formatMoney(data?.goal, currency)}</span>
            </div>

            <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-secondary transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mt-1.5 text-right text-xs font-semibold text-accent-primary dark:text-accent-primary-light">
              {pct}%
            </div>
          </>
        )}
      </div>
    </div>
  );
}
