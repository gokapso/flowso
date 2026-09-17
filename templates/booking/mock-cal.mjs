// Deterministic HTTP fixture for Cal.com's slots/bookings response shapes.
// No calendars, emails, or real bookings are created. This is not a Cal.com server.
export function mockCal(method, url, body) {
  if (method === 'GET' && url.pathname === '/v2/slots') {
    const date = url.searchParams.get('start')?.slice(0, 10);
    if (date === '2030-06-12') return { status: 503, body: { status: 'error' } };
    const data = date === '2030-06-11' ? {} : { [date]: ['09', '10'].map(hour => ({ start: `${date}T${hour}:00:00.000Z`, end: `${date}T${hour}:30:00.000Z` })) };
    return { status: 200, body: { status: 'success', data } };
  }
  if (method === 'POST' && url.pathname === '/v2/bookings') {
    if (!body.attendee?.email || !body.attendee?.name || !body.eventTypeId || !body.start) return { status: 400, body: { status: 'error' } };
    if (body.start.includes('T10:')) return { status: 409, body: { status: 'error' } };
    return { status: 201, body: { status: 'success', data: { uid: 'demo-booking', start: body.start } } };
  }
  return null;
}
