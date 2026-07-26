import React, { useState, useEffect, useMemo } from 'react';
import { Gift, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatMoney } from './lib/givingApi';

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];

export default function GiveOnlinePage({ success = false }) {
  const [funds, setFunds] = useState([]);
  const [amount, setAmount] = useState('');
  const [fundId, setFundId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('giving_funds').select('id, name').eq('is_active', true).order('sort_order');
        setFunds(data || []);
      } catch { /* RLS/publiczny odczyt */ }
      try {
        const { data } = await supabase.from('app_settings').select('key, value').in('key', ['church_name', 'organization_name', 'app_name']);
        const found = (data || []).find(r => r.value);
        if (found) setOrgName(found.value);
      } catch { /* pomiń */ }
    })();
  }, []);

  const fundOptions = useMemo(() => funds || [], [funds]);

  const submit = async (e) => {
    e?.preventDefault();
    setError('');
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Podaj kwotę darowizny.'); return; }
    if (!email) { setError('Podaj adres e-mail (potrzebny do potwierdzenia).'); return; }
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('giving-create-payment', {
        body: {
          amount: amt, email, donor_name: name || null, fund_id: fundId || null,
          note: note || null, returnUrl: `${window.location.origin}/give/success`,
        },
      });
      if (fnErr || !data?.paymentUrl) throw new Error(data?.error || fnErr?.message || 'Nie udało się utworzyć płatności');
      window.location.href = data.paymentUrl;
    } catch (err) {
      setError(err.message || 'Wystąpił błąd. Spróbuj ponownie.');
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle2 size={56} className="mx-auto text-emerald-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Dziękujemy za dar!</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Twoja płatność jest przetwarzana. Potwierdzenie wyślemy na podany adres e-mail.</p>
          <a href="/give" className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-medium">Wesprzyj ponownie</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 sm:p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center mb-3">
            <Gift className="text-white" size={26} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Wesprzyj {orgName || 'wspólnotę'}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Bezpieczna płatność online — karta, BLIK, przelew (Przelewy24)</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">Kwota</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {QUICK_AMOUNTS.map(a => (
                <button key={a} type="button" onClick={() => setAmount(String(a))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${Number(amount) === a ? 'bg-accent-primary text-white border-accent-primary' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light'}`}>
                  {a} zł
                </button>
              ))}
            </div>
            <div className="relative">
              <input type="number" step="1" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Inna kwota"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-lg font-semibold text-gray-900 dark:text-gray-100" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">zł</span>
            </div>
          </div>

          {fundOptions.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 ml-1">Cel</label>
              <div className="grid grid-cols-2 gap-2">
                {fundOptions.map(f => (
                  <button key={f.id} type="button" onClick={() => setFundId(fundId === f.id ? '' : f.id)}
                    className={`px-3 py-2 rounded-xl text-sm border transition text-left ${fundId === f.id ? 'bg-accent-primary-lightest border-accent-primary text-accent-primary dark:bg-accent-primary-darkest/30 dark:text-accent-primary-light' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent-primary-light'}`}>
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <input value={name} onChange={e => setName(e.target.value)} placeholder="Imię i nazwisko (opcjonalnie)"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail (do potwierdzenia)" required
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Wiadomość / intencja (opcjonalnie)"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100" />

          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary text-white font-semibold text-lg shadow-lg disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting ? <><Loader2 size={20} className="animate-spin" /> Przekierowanie...</> : <>Wesprzyj {amount ? formatMoney(Number(amount)) : ''}</>}
          </button>
          <p className="text-xs text-center text-gray-400">Płatność obsługiwana przez Przelewy24. Dane są bezpieczne.</p>
        </form>
      </div>
    </div>
  );
}
