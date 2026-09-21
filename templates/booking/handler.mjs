import { BookingError, errorData } from './errors.mjs';

export function createBookingHandler(cal, sessions = new Map()) {
  function response(screen, data) { return { version: '3.0', screen, data }; }
  function details(session, error) { return response('DETAILS', { event_types: session.eventTypes ?? [], notice: 'Choose an appointment type and date.', ...(error ? errorData(error) : {}) }); }
  function review(session, error) {
    return response('REVIEW', { summary: `${session.eventTitle} — ${session.name} (${session.email}) — ${session.slot}`, ...(error ? errorData(error) : {}) });
  }
  const conflict = () => new BookingError('SLOT_CONFLICT', 'That time was just booked. Go back and choose another.', 409);
  function slotsResponse(session, error) {
    const slots = session.slots ?? [];
    return response('SLOTS', { slots, has_slots: slots.length > 0, notice: slots.length ? 'Choose an available time.' : 'No times available on this date.', ...(error ? errorData(error) : {}) });
  }
  async function availability(session, error) {
    const slots = (await cal.slots(session.date, session.eventTypeId)).filter(slot => slot.id !== session.unavailable);
    session.slots = slots;
    return slotsResponse(session, error);
  }
  async function handle(request, session) {
    if (request.action === 'BACK') {
      if (request.screen === 'SLOTS' && session.date) return availability(session);
      return details(session);
    }
    if (request.screen === 'DETAILS') {
      const { name, email, date, event_type: eventTypeId } = request.data ?? {};
      const event = session.eventTypes?.find(item => item.id === eventTypeId);
      if (!event || typeof name !== 'string' || name.trim().length < 2 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
        return details(session, new BookingError('PROVIDER_VALIDATION', 'Choose an appointment type and enter a name, email, and valid date.'));
      }
      if (session.eventTypeId !== eventTypeId || session.name !== name || session.email !== email || session.date !== date) {
        session.booking = null; session.slot = null; session.slots = [];
      }
      Object.assign(session, { name, email, date, eventTypeId, eventTitle: event.title, unavailable: null });
      try { return await availability(session); } catch (error) { return details(session, error); }
    }
    if (request.screen === 'SLOTS') {
      const slot = request.data?.slot;
      if (!session.slots?.some(item => item.id === slot)) return availability(session, new BookingError('PROVIDER_VALIDATION', 'Choose an available time.'));
      if (session.slot !== slot) session.booking = null;
      session.slot = slot;
      return review(session);
    }
    if (request.screen === 'REVIEW') {
      // Verify tokens are read-only even if the global booking window is open.
      if (session.readOnly) return review(session, new BookingError('BOOKING_DISABLED', 'Verification sessions cannot create bookings.'));
      if (!session.slot) return review(session, new BookingError('PROVIDER_VALIDATION', 'No time selected.'));
      if (session.booking) return response('DONE', session.booking);
      if (session.unavailable === session.slot) return review(session, conflict());
      try { session.booking = await cal.book(session); return response('DONE', session.booking); }
      catch (error) {
        if (error.code === 'SLOT_CONFLICT' || error.status === 409) { session.unavailable = session.slot; return review(session, conflict()); }
        return review(session, error);
      }
    }
    throw new BookingError('PROVIDER_VALIDATION', 'Unexpected screen.');
  }
  return async request => {
    const readOnly = typeof request.flow_token === 'string' && request.flow_token.startsWith('flowso_verify_');
    let result;
    if (request.action === 'ping') result = { version: '3.0', data: { status: 'active' } };
    else if (request.action === 'INIT') {
      if (sessions instanceof Map && sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
      const session = { readOnly };
      try { session.eventTypes = await cal.eventTypes(); result = details(session); }
      catch (error) { result = details(session, error); }
      await sessions.set(request.flow_token, session);
    } else {
      const session = await sessions.get(request.flow_token);
      if (!session) result = details({}, new BookingError('SESSION_EXPIRED', 'Session expired. Restart this flow.'));
      else {
        session.readOnly = session.readOnly || readOnly;
        try { result = await handle(request, session); }
        catch (error) {
          result = request.screen === 'REVIEW' ? review(session, error)
            : request.screen === 'SLOTS' ? slotsResponse(session, error) : details(session, error);
        }
        await sessions.set(request.flow_token, session);
      }
    }
    if (readOnly) result.data.flowso_verify = { protocol: 1, read_only: true, booking_gate: 'expiry-v1' };
    return result;
  };
}
