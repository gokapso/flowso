import { BookingError, providerError } from './errors.mjs';
// Cal.com v2: use a test event type when pointing this adapter at a real account.
export function createCalClient({ baseUrl, apiKey, eventTypeId, eventTypeIds = [eventTypeId], timeZone = 'UTC', allowBookings = false, bookingEnabledUntil, fixture = false, now = Date.now }) {
  const allowedIds = eventTypeIds.map(Number);
  if (!allowedIds.length || allowedIds.length > 20 || new Set(allowedIds).size !== allowedIds.length || allowedIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Set CAL_EVENT_TYPE_IDS (or CAL_EVENT_TYPE_ID) to 1–20 unique positive integer event type IDs');
  }
  function selectedId(value = allowedIds.length === 1 ? allowedIds[0] : undefined) {
    const id = Number(value);
    if (!allowedIds.includes(id)) throw new BookingError('PROVIDER_VALIDATION', 'Choose a configured appointment type.');
    return id;
  }
  async function request(path, version, body) {
    let response;
    try { response = await fetch(`${baseUrl.replace(/\/$/, '')}/${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(5000),
      headers: { 'content-type': 'application/json', 'cal-api-version': version,
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    } catch (error) { throw providerError(error); }
    if (!response.ok) {
      const error = new Error(`Scheduling API returned HTTP ${response.status}`);
      error.status = response.status;
      throw providerError(error);
    }
    let payload;
    try { payload = await response.json(); } catch (error) {
      if (error?.name === 'SyntaxError') throw new BookingError('PROVIDER_VALIDATION', 'The scheduling service returned invalid JSON.');
      throw providerError(error);
    }
    if (payload.status !== 'success' || !payload.data || typeof payload.data !== 'object') throw new BookingError('PROVIDER_VALIDATION', 'Unexpected scheduling API response');
    return payload.data;
  }
  return {
    async eventTypes() {
      return Promise.all(allowedIds.map(async id => {
        const event = await request(`event-types/${id}`, '2024-06-14');
        if (event.id !== id || typeof event.title !== 'string' || !event.title.trim() || !Number.isInteger(event.lengthInMinutes) || event.lengthInMinutes <= 0) {
          throw new BookingError('PROVIDER_VALIDATION', 'Configured scheduling event type was not found');
        }
        return { id: String(id), title: `${event.title} (${event.lengthInMinutes} min)`.slice(0, 30) };
      }));
    },
    async slots(date, selection) {
      const eventTypeId = selectedId(selection);
      const end = new Date(`${date}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const query = new URLSearchParams({ eventTypeId: String(eventTypeId), start: `${date}T00:00:00Z`, end: end.toISOString(), timeZone, format: 'range' });
      const data = await request(`slots?${query}`, '2024-09-04');
      return Object.values(data).flat().map(slot => {
        if (!slot || typeof slot.start !== 'string' || Number.isNaN(Date.parse(slot.start))) throw new BookingError('PROVIDER_VALIDATION', 'Invalid scheduling slot');
        const id = new Date(slot.start).toISOString();
        return { id, title: new Intl.DateTimeFormat('en', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(id)) };
      });
    },
    async book({ name, email, slot, readOnly, eventTypeId: selection }) {
      const expires = Date.parse(bookingEnabledUntil ?? '');
      if (readOnly || (!fixture && (!allowBookings || !Number.isFinite(expires) || expires <= now() || expires > now() + 60 * 60_000))) {
        throw new BookingError('BOOKING_DISABLED', 'Booking writes are disabled or the booking window has expired.');
      }
      const eventTypeId = selectedId(selection);
      const data = await request('bookings', '2026-02-25', { eventTypeId, start: slot, attendee: { name, email, timeZone, language: 'en' } });
      if (typeof data.uid !== 'string' || typeof data.start !== 'string') throw new BookingError('PROVIDER_VALIDATION', 'Booking response is missing uid or start; check before retrying');
      return { booking_uid: data.uid, start: data.start };
    },
  };
}
