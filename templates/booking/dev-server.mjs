import { createServer } from 'node:http';
import { createCalClient } from './cal-client.mjs';
import { createBookingHandler } from './handler.mjs';
import { mockCal } from './mock-cal.mjs';

const port = Number(process.env.PORT ?? 4312);
const isMock = !process.env.CAL_API_BASE_URL;
let handler;

const server = createServer(async (req, res) => {
  function send(status, body) { res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body)); }
  try {
    const url = new URL(req.url, 'http://localhost');
    const chunks = []; let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 1024 * 1024) { send(413, { error: 'Body too large' }); return; }
      chunks.push(chunk);
    }
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    const mock = isMock ? mockCal(req.method, url, body) : null;
    if (mock) { send(mock.status, mock.body); return; }
    if (req.method !== 'POST' || url.pathname !== '/flow') { send(404, { error: 'Not found' }); return; }
    if (typeof body.flow_token !== 'string' || body.version !== '3.0' || !['INIT', 'BACK', 'data_exchange', 'ping'].includes(body.action)) {
      send(400, { error: 'Expected a Flow data exchange request' }); return;
    }
    send(200, await handler(body));
  } catch {
    // Keep credentials and attendee details out of server logs and HTTP errors.
    send(500, { error: 'Endpoint request failed' });
  }
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}`;
  handler = createBookingHandler(createCalClient({ baseUrl: process.env.CAL_API_BASE_URL ?? `${url}/v2`, apiKey: process.env.CAL_API_KEY,
    eventTypeId: Number(process.env.CAL_EVENT_TYPE_ID ?? 123), timeZone: process.env.CAL_TIME_ZONE ?? 'UTC',
    fixture: isMock, allowBookings: process.env.CAL_ALLOW_BOOKINGS === '1', bookingEnabledUntil: process.env.CAL_BOOKING_ENABLED_UNTIL }));
  console.log(`Booking endpoint: ${url}/flow (${isMock ? 'local Cal.com contract fixture' : 'configured scheduling API'})`);
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); });
