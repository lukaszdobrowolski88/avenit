import React, { useCallback, useEffect, useState } from 'react';
import { tr } from '../../i18n';
import Spinner from '../../components/Spinner';
import { getPlanUsage } from '../../lib/subscriptions';
import PlanUsageCard from './components/PlanUsageCard';
import PlanPicker from './components/PlanPicker';

// Ekran rozliczeń kościoła (Ustawienia → Subskrypcja): plan, cena, wykorzystanie (dorośli w bazie
// członków) i wybór planu. Dane z GET /api/tenant/plan-usage — tylko dla osób z dostępem do rozliczeń.
export default function BillingOverview() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | denied | error

  const load = useCallback(async () => {
    try {
      const d = await getPlanUsage();
      if (!d) { setState('denied'); return; }
      setData(d);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (state === 'loading') return <Spinner center />;
  if (state === 'denied') return <p className="text-sm text-gray-500 dark:text-gray-400">{tr('Rozliczeniami zarządza administrator Waszej organizacji.')}</p>;
  if (state === 'error') return <p className="text-sm text-red-600 dark:text-red-400">{tr('Nie udało się pobrać danych subskrypcji')}</p>;

  return (
    <div className="max-w-5xl">
      <PlanUsageCard data={data} />
      <PlanPicker
        plans={data.plans || []}
        currentKey={data.plan?.key}
        currentCycle={data.subscription?.billingCycle}
        suggestedKey={data.suggestedPlan?.key}
      />
    </div>
  );
}
