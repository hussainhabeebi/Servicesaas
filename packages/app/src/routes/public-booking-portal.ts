import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, ne, inArray } from 'drizzle-orm';
import { createDb, schema, type AppContext } from '@serviceos/platform';
import { verifyBookingAccess } from '../lib/booking-access';

export const publicBookingPortal = new Hono<AppContext>();
publicBookingPortal.use('/bookings/:id/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  const token = (c.req.header('authorization') ?? '').replace(/^Bearer /i, '');
  if (!await verifyBookingAccess(token, c.get('tenantId'), c.req.param('id')!, c.env.JWT_SECRET)) return c.json({ error: 'This private booking link is invalid or expired.' }, 401);
  return next();
});
publicBookingPortal.get('/bookings/:id/details', async c => {
  const db = createDb(c.env.DB);
  const tenantId = c.get('tenantId');
  const [booking] = await db.select({ id: schema.bookings.id, status: schema.bookings.status, scheduled_start: schema.bookings.scheduled_start, scheduled_end: schema.bookings.scheduled_end, area: schema.bookings.area, service: schema.services.name, cancellation_fee: schema.bookings.cancellation_fee })
    .from(schema.bookings).leftJoin(schema.services, and(eq(schema.services.id, schema.bookings.service_id), eq(schema.services.tenant_id, tenantId)))
    .where(and(eq(schema.bookings.id, c.req.param('id')), eq(schema.bookings.tenant_id, tenantId))).limit(1);
  if (!booking) return c.json({ error: 'Booking not found' }, 404);
  const invoices = await db.select({ invoice_number: schema.invoices.invoice_number, status: schema.invoices.status, total: schema.invoices.total, amount_paid: schema.invoices.amount_paid, currency: schema.invoices.currency })
    .from(schema.invoices).where(and(eq(schema.invoices.booking_id, booking.id), eq(schema.invoices.tenant_id, tenantId), ne(schema.invoices.status, 'draft')));
  return c.json({ booking, invoices });
});

// Changes go into the same staff task queue; the customer sees the current
// authoritative booking until a team member approves and applies the change.
publicBookingPortal.post('/bookings/:id/change-request', async c => {
  const input = z.object({ kind: z.enum(['cancel', 'reschedule']), preferred_start: z.string().datetime({ offset: true }).optional(), reason: z.string().trim().min(1).max(500) }).safeParse(await c.req.json().catch(() => null));
  if (!input.success || (input.data.kind === 'reschedule' && (!input.data.preferred_start || Date.parse(input.data.preferred_start) <= Date.now()))) return c.json({ error: 'Enter a future date/time and a reason for the change.' }, 400);
  const db = createDb(c.env.DB);
  const tenantId = c.get('tenantId');
  const [booking] = await db.select({ status: schema.bookings.status }).from(schema.bookings).where(and(eq(schema.bookings.id, c.req.param('id')), eq(schema.bookings.tenant_id, tenantId))).limit(1);
  if (!booking) return c.json({ error: 'Booking not found' }, 404);
  if (booking.status !== 'scheduled') return c.json({ error: 'Please contact the team to change a booking that is already underway or closed.' }, 409);
  const [pending] = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(and(eq(schema.tasks.tenant_id, tenantId), eq(schema.tasks.booking_id, c.req.param('id')), eq(schema.tasks.type, 'general'), inArray(schema.tasks.title, ['Customer requests cancel', 'Customer requests reschedule']), eq(schema.tasks.status, 'pending'))).limit(1);
  if (pending) return c.json({ error: 'A change request is already awaiting the team. Please contact us to amend it.' }, 409);
  await db.insert(schema.tasks).values({ id: crypto.randomUUID(), tenant_id: tenantId, booking_id: c.req.param('id'), type: 'general', title: `Customer requests ${input.data.kind}`, description: `${input.data.reason}${input.data.preferred_start ? '\nPreferred start: ' + input.data.preferred_start : ''}`, due_at: new Date().toISOString() });
  return c.json({ ok: true, message: 'Your request is in the team’s ServBazaar task list. Your booking remains unchanged until the team confirms it; cancellation terms may apply.' }, 202);
});
