import React from 'react';
import BillingOverview from '../../Billing/BillingOverview';

// Sekcja Subskrypcja — plan, cena, wykorzystanie (dorośli w bazie członków) i wybór planu.
// Dane z /api/tenant/plan-usage (baza platform + liczenie dorosłych w bazie tenanta).
export default function SubscriptionInfo() {
  return <BillingOverview />;
}
