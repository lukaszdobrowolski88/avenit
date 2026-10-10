// Worker (co minutę, per tenant): przypomnienie 10 min przed spotkaniem — członkom powiadomienie
// i push, gościom e-mail z linkiem; odwołanie spotkań, których wydarzenie zniknęło albo przestało
// być online. Bez trasy HTTP. Logika: src/meetings/service.js, src/meetings/events.js.
import { sendMeetingReminders, meetingDeps } from '../meetings/service.js';
import { sweepOrphanEventMeetings } from '../meetings/events.js';

export const name = 'meeting-reminders';
export const skipRoute = true;

export async function runForTenant(pool, ctx = {}) {
  try {
    const mctx = {
      db: pool,
      tenantSlug: ctx.tenantSlug,
      tenant: { name: ctx.tenantName || '', slug: ctx.tenantSlug, subdomain: ctx.tenantSubdomain || ctx.tenantSlug, dbName: ctx.tenantDbName },
      log: { warn: (o, m) => ctx.log?.(m || '', o?.err?.message || '') },
      deps: meetingDeps({ timers: false }),
    };
    const sent = await sendMeetingReminders(mctx);
    if (sent) ctx.log?.(`meeting-reminders: przypomniano o ${sent} spotkaniach`);
    // Spotkania wydarzeń usuniętych / zarchiwizowanych / zmienionych na stacjonarne (099).
    const orphans = await sweepOrphanEventMeetings(mctx).catch((err) => {
      if (err?.code !== '42703' && err?.code !== '42P01') ctx.log?.(`meeting-reminders: sprzątanie — ${err.message}`);
      return 0;
    });
    if (orphans) ctx.log?.(`meeting-reminders: odwołano spotkania bez wydarzenia: ${orphans}`);
    return { sent, orphans };
  } catch (err) {
    if (err?.code === '42P01') return { sent: 0 }; // tenant bez migracji 098
    throw err;
  }
}
