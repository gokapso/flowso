export class BookingError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}
export function providerError(error) {
  if (error instanceof BookingError) return error;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return new BookingError('PROVIDER_TIMEOUT', 'The scheduling service timed out. Check before retrying.');
  if (error?.status === 409) return new BookingError('SLOT_CONFLICT', 'That time was just booked. Go back and choose another.', 409);
  if ([401, 403].includes(error?.status)) return new BookingError('PROVIDER_AUTHENTICATION', 'The scheduling service rejected its credentials.', error.status);
  if ([400, 422].includes(error?.status)) return new BookingError('PROVIDER_VALIDATION', 'The scheduling service rejected the booking details.', error.status);
  return new BookingError('PROVIDER_UNAVAILABLE', 'Scheduling is temporarily unavailable. Try again.');
}
export function errorData(error) {
  const classified = providerError(error);
  return { error_code: classified.code, error_message: classified.message };
}
