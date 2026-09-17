export function createBookingHandler(cal) {
  // Development-only session store. Use durable, expiring storage for deployment.
  const sessions = new Map();
  function response(screen, data) { return { version: '3.0', screen, data }; }
  function details(error) { return response('DETAILS', { notice: 'Choose a date to check availability.', ...(error ? { error_message: error } : {}) }); }
  function review(session, error) {
    return response('REVIEW', { summary: `${session.name} (${session.email}) — ${session.slot}`, ...(error ? { error_message: error } : {}) });
  }
  const conflictMessage = 'That time was just booked. Go back and choose another.';
  async function availability(session, error) {
    const slots = (await cal.slots(session.date)).filter(slot => slot.id !== session.unavailable);
    session.slots = slots;
    return response('SLOTS', { slots, has_slots: slots.length > 0, notice: slots.length ? 'Choose an available time.' : 'No times available on this date.', ...(error ? { error_message: error } : {}) });
  }
  return async request => {
    if (request.action === 'ping') return { version: '3.0', data: { status: 'active' } };
    if (request.action === 'INIT') {
      // Bound the development store; restart INIT if a demo session is evicted.
      if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
      sessions.set(request.flow_token, {});
      return details();
    }
    const session = sessions.get(request.flow_token);
    if (!session) return details('Session expired. Restart this flow.');
    if (request.action === 'BACK') {
      if (request.screen === 'SLOTS' && session.date) return availability(session);
      return details();
    }
    if (request.screen === 'DETAILS') {
      const { name, email, date } = request.data ?? {};
      if (typeof name !== 'string' || name.trim().length < 2 || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return details('Enter a name, email, and valid date.');
      Object.assign(session, { name, email, date, unavailable: null });
      try { return await availability(session); }
      catch { return details('Scheduling is temporarily unavailable. Try again.'); }
    }
    if (request.screen === 'SLOTS') {
      const slot = request.data?.slot;
      if (!session.slots?.some(item => item.id === slot)) return availability(session, 'Choose an available time.');
      session.slot = slot;
      return review(session);
    }
    if (request.screen === 'REVIEW') {
      if (!session.slot) throw new Error('No time selected');
      if (session.booking) return response('DONE', session.booking);
      if (session.unavailable === session.slot) return review(session, conflictMessage);
      try {
        session.booking = await cal.book(session);
        return response('DONE', session.booking);
      } catch (error) {
        if (error.status === 409) {
          session.unavailable = session.slot;
          return review(session, conflictMessage);
        }
        return review(session, 'Booking failed. Check the scheduling service before retrying.');
      }
    }
    throw new Error(`Unhandled screen ${request.screen}`);
  };
}
