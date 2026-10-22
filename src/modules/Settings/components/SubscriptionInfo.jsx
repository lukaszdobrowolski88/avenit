import React from 'react';
import BillingOverview from '../../Billing/BillingOverview';

// Sekcja Subskrypcja — plan, cena, wykorzystanie (konta użytkowników) i wybór planu.
// Dane z /api/tenant/plan-usage (baza platform + liczenie kont w bazie tenanta).
export default function SubscriptionInfo() {
  return <BillingOverview />;
}
