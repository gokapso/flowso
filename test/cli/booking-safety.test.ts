import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
// The scaffold deliberately ships plain JavaScript for users without a build step.
// @ts-expect-error Template modules have no declaration files.
import { createCalClient } from '../../templates/booking/cal-client.mjs';
// @ts-expect-error Template modules have no declaration files.
import { createBookingHandler } from '../../templates/booking/handler.mjs';

const start = Date.parse('2030-06-10T00:00:00Z');
const booking = { name: 'Test User', email: 'test@example.test', slot: '2030-06-10T10:00:00.000Z' };
function client(overrides = {}) {
  return createCalClient({ baseUrl: 'https://provider.test/v2', eventTypeId: 1, allowBookings: true,
    bookingEnabledUntil: new Date(start + 600_000).toISOString(), now: () => start, ...overrides });
}
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, '', new Date(start - 1).toISOString(), new Date(start + 61 * 60_000).toISOString()])('blocks missing, expired or oversized booking windows: %s', async bookingEnabledUntil => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(client({ bookingEnabledUntil }).book(booking)).rejects.toMatchObject({ code: 'BOOKING_DISABLED' });
  expect(fetch).not.toHaveBeenCalled();
});
it('rechecks expiry on every booking and always blocks read-only sessions', async () => {
  const fetch = vi.fn(async () => Response.json({ status: 'success', data: { uid: 'booking-1', start: booking.slot } }));
  vi.stubGlobal('fetch', fetch);
  let time = start; const cal = client({ now: () => time });
  await expect(cal.book({ ...booking, readOnly: true })).rejects.toMatchObject({ code: 'BOOKING_DISABLED' });
  await expect(cal.book(booking)).resolves.toMatchObject({ booking_uid: 'booking-1' });
  time += 600_001;
  await expect(cal.book(booking)).rejects.toMatchObject({ code: 'BOOKING_DISABLED' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([[401, 'PROVIDER_AUTHENTICATION'], [403, 'PROVIDER_AUTHENTICATION'], [422, 'PROVIDER_VALIDATION'], [400, 'PROVIDER_VALIDATION'], [409, 'SLOT_CONFLICT'], [503, 'PROVIDER_UNAVAILABLE']])('classifies HTTP %s without leaking the provider body', async (status, code) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('sensitive provider response', { status: Number(status) })));
  await expect(client().book(booking)).rejects.toMatchObject({ code });
});
it('classifies timeouts without replaying uncertain booking writes', async () => {
  const fetch = vi.fn(async () => { throw new DOMException('secret URL', 'TimeoutError'); }); vi.stubGlobal('fetch', fetch);
  await expect(client().book(booking)).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('prevents confirmation for verify tokens even with an unrestricted provider adapter', async () => {
  const cal = { eventTypes: vi.fn(async () => [{ id: '1', title: 'Test appointment' }]), slots: vi.fn(async () => [{ id: booking.slot, title: '10:00' }]), book: vi.fn() };
  const handler = createBookingHandler(cal);
  const send = (action: string, screen?: string, data = {}) => handler({ version: '3.0', flow_token: 'flowso_verify_test', action, screen, data });
  for (const response of [await send('ping'), await send('INIT'), await send('data_exchange', 'DETAILS', { ...booking, date: '2030-06-10', event_type: '1' }), await send('data_exchange', 'SLOTS', { slot: booking.slot })]) {
    expect(response.data.flowso_verify).toMatchObject({ protocol: 1, read_only: true });
  }
  const result = await send('data_exchange', 'REVIEW', { readOnly: false, read_only: false });
  expect(result.screen).toBe('REVIEW'); expect(result.data.error_code).toBe('BOOKING_DISABLED'); expect(cal.book).not.toHaveBeenCalled();
  const back = await send('BACK', 'SLOTS'); expect(back.screen).toBe('SLOTS'); expect(cal.slots).toHaveBeenCalledTimes(2);
});
it('keeps conflicts on REVIEW and refreshes availability on native BACK', async () => {
  const cal = { eventTypes: vi.fn(async () => [{ id: '1', title: 'Test appointment' }]), slots: vi.fn(async () => [{ id: booking.slot, title: '10:00' }]), book: vi.fn(async () => { throw Object.assign(new Error('conflict'), { status: 409 }); }) };
  const handler = createBookingHandler(cal);
  const send = (action: string, screen?: string, data = {}) => handler({ flow_token: 'normal-test', action, screen, data });
  await send('INIT'); await send('data_exchange', 'DETAILS', { ...booking, date: '2030-06-10', event_type: '1' }); await send('data_exchange', 'SLOTS', { slot: booking.slot });
  expect(await send('data_exchange', 'REVIEW')).toMatchObject({ screen: 'REVIEW', data: { error_code: 'SLOT_CONFLICT' } });
  expect(await send('BACK', 'SLOTS')).toMatchObject({ screen: 'SLOTS', data: { slots: [] } });
  expect(cal.slots).toHaveBeenCalledTimes(2);
});
it('runs the generated Kapso handler across separate invocations and refuses verify confirmations', async () => {
  const source = readFileSync('templates/booking/kapso-data-endpoint.js', 'utf8');
  const fetch = vi.fn(async (url: string) => Response.json({ status: 'success', data: url.includes('/event-types/') ? { id: 1, title: 'Test appointment', lengthInMinutes: 30 } : { '2030-06-10': [{ start: booking.slot }] } }));
  const records = new Map<string, string>();
  const env = { CAL_ALLOW_BOOKINGS: '1', CAL_BOOKING_ENABLED_UNTIL: new Date(Date.now() + 600_000).toISOString(), CAL_EVENT_TYPE_ID: '1',
    KV: { get: async (key: string) => records.has(key) ? JSON.parse(records.get(key)!) : null, put: async (key: string, value: string) => { records.set(key, value); } } };
  async function send(action: string, screen?: string, data = {}) {
    const handler = runInNewContext(`${source}\nhandler`, { Response, fetch, URLSearchParams, AbortSignal, console });
    return (await handler({ json: async () => ({ flow: { id: 'flow-1' }, data_exchange: { version: '3.0', flow_token: 'flowso_verify_generated', action, screen, data } }) }, env)).json();
  }
  await send('INIT'); await send('data_exchange', 'DETAILS', { ...booking, date: '2030-06-10', event_type: '1' }); await send('data_exchange', 'SLOTS', { slot: booking.slot });
  expect(await send('data_exchange', 'REVIEW')).toMatchObject({ screen: 'REVIEW', data: { error_code: 'BOOKING_DISABLED' } });
  expect(fetch).toHaveBeenCalledTimes(2); expect(records.size).toBe(1);
});
it('keeps the deployable endpoint reproducible from the tested source modules', () => {
  const directory = mkdtempSync(join(tmpdir(), 'flowso-template-'));
  try {
    cpSync('templates/booking', directory, { recursive: true });
    execFileSync(process.execPath, [join(directory, 'build-kapso-endpoint.mjs')]);
    expect(readFileSync(join(directory, 'kapso-data-endpoint.js'), 'utf8')).toBe(readFileSync('templates/booking/kapso-data-endpoint.js', 'utf8'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
it('preserves timeouts while reading the response body', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => { throw new DOMException('timed out', 'TimeoutError'); } })));
  await expect(client().book(booking)).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
});
it('keeps BACK refresh failures on SLOTS and invalidates confirmation cache when selection changes', async () => {
  const next = '2030-06-10T11:00:00.000Z';
  const cal = { eventTypes: vi.fn(async () => [{ id: '1', title: 'Test appointment' }]), slots: vi.fn(async () => [{ id: booking.slot }, { id: next }]), book: vi.fn(async (session: { slot: string }) => ({ booking_uid: session.slot, start: session.slot })) };
  const handler = createBookingHandler(cal);
  const send = (action: string, screen?: string, data = {}) => handler({ flow_token: 'normal', action, screen, data });
  await send('INIT'); await send('data_exchange', 'DETAILS', { ...booking, date: '2030-06-10', event_type: '1' }); await send('data_exchange', 'SLOTS', { slot: booking.slot });
  await send('data_exchange', 'REVIEW'); await send('data_exchange', 'REVIEW'); expect(cal.book).toHaveBeenCalledTimes(1);
  cal.slots.mockRejectedValueOnce(new Error('outage'));
  expect(await send('BACK', 'SLOTS')).toMatchObject({ screen: 'SLOTS', data: { error_code: 'PROVIDER_UNAVAILABLE' } });
  await send('data_exchange', 'SLOTS', { slot: next });
  expect(await send('data_exchange', 'REVIEW')).toMatchObject({ screen: 'DONE', data: { booking_uid: next } });
  expect(cal.book).toHaveBeenCalledTimes(2);
});
it('retries KV rate limits without repeating provider booking writes', async () => {
  vi.useFakeTimers();
  try {
    const source = readFileSync('templates/booking/kapso-data-endpoint.js', 'utf8');
    let value = { name: booking.name, email: booking.email, slot: booking.slot, readOnly: false };
    const put = vi.fn().mockRejectedValueOnce(new Error('KV PUT failed: 429 Too Many Requests')).mockImplementation(async (_key, json) => { value = JSON.parse(json); });
    const fetch = vi.fn(async () => Response.json({ status: 'success', data: { uid: 'confirmed', start: booking.slot } }));
    const handler = runInNewContext(`${source}\nhandler`, { Response, fetch, URLSearchParams, AbortSignal, setTimeout });
    const pending = handler({ json: async () => ({ flow: { id: 'flow-1' }, data_exchange: { flow_token: 'normal', action: 'data_exchange', screen: 'REVIEW' } }) }, {
      KV: { get: async () => value, put }, CAL_ALLOW_BOOKINGS: '1', CAL_BOOKING_ENABLED_UNTIL: new Date(Date.now() + 600_000).toISOString(), CAL_EVENT_TYPE_ID: '1',
    });
    await vi.advanceTimersByTimeAsync(1200);
    expect(await (await pending).json()).toMatchObject({ screen: 'DONE', data: { booking_uid: 'confirmed' } });
    expect(fetch).toHaveBeenCalledTimes(1); expect(put).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
it.each([[], [0], [-1], [1.5], [1, 1], Array.from({ length: 21 }, (_, i) => i + 1)].map(eventTypeIds => ({ eventTypeIds })))('rejects invalid configured event IDs: $eventTypeIds', ({ eventTypeIds }) => {
  expect(() => client({ eventTypeIds })).toThrow('unique positive integer');
});
it('fetches only configured event types and passes the selected ID to availability and booking', async () => {
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.includes('/event-types/')) {
      const id = Number(url.split('/').pop());
      return Response.json({ status: 'success', data: { id, title: `Appointment ${id}`, lengthInMinutes: 30 } });
    }
    if (options?.method === 'POST') return Response.json({ status: 'success', data: { uid: 'booked', start: booking.slot } });
    return Response.json({ status: 'success', data: { '2030-06-10': [{ start: booking.slot }] } });
  });
  vi.stubGlobal('fetch', fetch);
  const cal = client({ eventTypeIds: [102, 101] });
  expect(await cal.eventTypes()).toEqual([{ id: '102', title: 'Appointment 102 (30 min)' }, { id: '101', title: 'Appointment 101 (30 min)' }]);
  await cal.slots('2030-06-10', '102');
  await cal.book({ ...booking, eventTypeId: '102' });
  expect(new URL(fetch.mock.calls[2]![0]).searchParams.get('eventTypeId')).toBe('102');
  expect(JSON.parse(String(fetch.mock.calls[3]![1]?.body)).eventTypeId).toBe(102);
  await expect(cal.slots('2030-06-10', '999')).rejects.toMatchObject({ code: 'PROVIDER_VALIDATION' });
  await expect(cal.book({ ...booking, eventTypeId: '999' })).rejects.toMatchObject({ code: 'PROVIDER_VALIDATION' });
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('rejects an unconfigured event type before querying availability', async () => {
  const cal = { eventTypes: async () => [{ id: '1', title: 'Allowed' }], slots: vi.fn(), book: vi.fn() };
  const handler = createBookingHandler(cal);
  await handler({ action: 'INIT', flow_token: 'test' });
  const response = await handler({ action: 'data_exchange', flow_token: 'test', screen: 'DETAILS', data: { ...booking, date: '2030-06-10', event_type: '999' } });
  expect(response).toMatchObject({ screen: 'DETAILS', data: { error_code: 'PROVIDER_VALIDATION' } });
  expect(cal.slots).not.toHaveBeenCalled();
  expect(cal.book).not.toHaveBeenCalled();
});
