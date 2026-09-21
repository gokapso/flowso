# Test a Cal.com flow before Meta

Use `flowso init <new-directory>` for a runnable starter. Its `README.md` describes the adapter and local server. The skill and CLI work from a consumer project without the Flowso source repo.

## Establish a local baseline

Start `node dev-server.mjs` without `CAL_API_BASE_URL`. Run:

```sh
flowso validate flow.json --json
flowso test flow.json --scenario scenarios.json --endpoint http://127.0.0.1:4312/flow --plaintext --json
flowso preview flow.json --endpoint http://127.0.0.1:4312/flow --plaintext --log-file artifacts/preview.jsonl
```

The seven fixture journeys cover both event types, success, back/refresh, conflict recovery, no slots, invalid input, and provider outage. Restart the endpoint after changing its code. Flow JSON edits reload in the preview. The browser and headless CLI share the runtime; inspect layout and native controls in the browser as well.

## Connect the real API through the local endpoint

Obtain the intended test event type IDs, timezone, future test date and credential location from the user. Do not ask them to paste a key into chat. The user can fill `.env.local` from `.env.example` locally or provide environment variables through their usual secret manager. Read only variable names or presence when troubleshooting credentials.

Use `CAL_API_BASE_URL=https://api.cal.com/v2` (or their self-hosted `/v2` URL), `CAL_EVENT_TYPE_IDS` (1–20 unique positive IDs, comma-separated; `CAL_EVENT_TYPE_ID` remains supported for one type), `CAL_API_KEY`, and `CAL_TIME_ZONE`. Keep `CAL_ALLOW_BOOKINGS=0` for availability testing. Node 20.6+ can load the local file with:

```sh
node --env-file=.env.local dev-server.mjs
```

Restart any previous fixture server first; the startup message must say `configured scheduling API`. Existing shell variables take precedence over an env file. Flowso still connects to `http://127.0.0.1:4312/flow`: the local adapter calls Cal.com. No tunnel or Meta credentials are required for this local test.

Edit the date in `scenarios.availability.json` to the selected future date, then run:

```sh
flowso test flow.json --scenario scenarios.availability.json --endpoint http://127.0.0.1:4312/flow --plaintext --json
```

These journeys check the first two configured types, stop at SLOTS, and make no booking POST. Remove the second journey when configuring only one type. Empty availability is a valid response; inspect each test's `snapshot.data.slots` and `has_slots` instead of interpreting a pass as proof of bookable availability. Verify local dates, timezone and slot labels against the account's calendar. The starter currently queries a UTC day and formats results in `CAL_TIME_ZONE`; adapt the date range if the product requires the entire selected local calendar day.

## Verify an actual booking only when requested

Use an appropriate test account, event type and attendee email. Cal.com may create calendar events and send notifications. Set `CAL_ALLOW_BOOKINGS=1` and `CAL_BOOKING_ENABLED_UNTIL` to a future ISO timestamp at most 60 minutes ahead only for the requested booking test, then restart the server. The adapter checks expiry at every booking attempt; the boolean alone does not allow writes. For deployed Kapso functions use `flowso bookings enable --for 10m` as described in [kapso-operations.md](kapso-operations.md). Create a separate live scenario: use a future date, choose a returned slot ID, confirm once and check DONE with a booking UID. Never use `demo-booking` or fixture-specific dates/errors as live expectations. Do not replay the fixture journeys against the real API.

If the outcome is uncertain (timeout or provider failure during confirmation), inspect the provider before retrying; a timeout does not prove no booking was created. Confirm the returned booking exists in the provider. Agree on cleanup scope before cancelling anything. Disable booking writes again after the test.

Cal.com contract references:
- [Slots](https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type), adapter header `2024-09-04`, `format=range`.
- [Bookings](https://cal.com/docs/api-reference/v2/bookings/create-a-booking), adapter header `2026-02-25`.

The starter handles regular event types with name/email. Check additional booking fields, duration, verification or team requirements for the chosen event type. Keep secrets and real attendee data out of committed scenarios and traces.

## Handoff and Meta

Report fixture results, real availability, real booking confirmation and visual review separately. Record the exact commands, failing step/snapshot, test date/timezone, and remaining gaps without credentials. The starter uses in-memory sessions; production deployment still needs durable expiring sessions, authentication/encryption, and provider idempotency/reconciliation. Submit to Meta only when requested, then verify its validation and official preview. Local success alone does not establish Meta acceptance.
