// Worker (co minutę, per tenant): przypomnienie 10 min przed spotkaniem — członkom powiadomienie
// i push, gościom e-mail z linkiem. Bez trasy HTTP. Logika: src/meetings/service.js.
import { sendMeetingReminders, meetingDeps } from '../meetings/service.js';

export const name = 'meeting-reminders';
export const skipRoute = true;

export async function runForTenant(pool, ctx = {}) {
  try {
    const sent = await sendMeetingReminders({
      db: pool,
      tenantSlug: ctx.tenantSlug,
      tenant: { name: ctx.tenantName || '', slug: ctx.tenantSlug, subdomain: ctx.tenantSubdomain || ctx.tenantSlug },
      log: { warn: (o, m) => ctx.log?.(m || '', o?.err?.message || '') },
      deps: meetingDeps({ timers: false }),
    });
    if (sent) ctx.log?.(`meeting-reminders: przypomniano o ${sent} spotkaniach`);
    return { sent };
  } catch (err) {
    if (err?.code === '42P01') return { sent: 0 }; // tenant bez migracji 098
    throw err;
  }
}
