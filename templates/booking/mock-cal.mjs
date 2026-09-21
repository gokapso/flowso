// Deterministic HTTP fixture for Cal.com's slots/bookings response shapes.
// No calendars, emails, or real bookings are created. This is not a Cal.com server.
export function mockCal(method, url, body) {
  if (method === 'GET' && url.pathname.startsWith('/v2/event-types/')) {
    const events = [
      { id: 101, title: 'Dental Checkup', lengthInMinutes: 15 },
      { id: 102, title: 'Cleaning', lengthInMinutes: 25 },
    ];
    const data = events.find(event => String(event.id) === url.pathname.split('/').pop());
    return data ? { status: 200, body: { status: 'success', data } } : { status: 404, body: { status: 'error' } };
  }
  if (method === 'GET' && url.pathname === '/v2/slots') {
    if (!['101', '102'].includes(url.searchParams.get('eventTypeId'))) return { status: 404, body: { status: 'error' } };
    const date = url.searchParams.get('start')?.slice(0, 10);
    if (date === '2030-06-12') return { status: 503, body: { status: 'error' } };
    const data = date === '2030-06-11' ? {} : { [date]: (url.searchParams.get('eventTypeId') === '102' ? ['13', '14'] : ['09', '10']).map(hour => ({ start: `${date}T${hour}:00:00.000Z`, end: `${date}T${hour}:30:00.000Z` })) };
    return { status: 200, body: { status: 'success', data } };
  }
  if (method === 'POST' && url.pathname === '/v2/bookings') {
    if (![101, 102].includes(body.eventTypeId) || !body.attendee?.email || !body.attendee?.name || !Number.isInteger(body.eventTypeId) || !body.start) return { status: 400, body: { status: 'error' } };
    if (body.start.includes('T10:') || body.start.includes('T14:')) return { status: 409, body: { status: 'error' } };
    return { status: 201, body: { status: 'success', data: { uid: 'demo-booking', start: body.start } } };
  }
  return null;
}
