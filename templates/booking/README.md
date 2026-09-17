# Local booking flow

Requires Node 20+ and the installed `flowso` CLI. No package install or Meta credentials needed.

Terminal 1:

```sh
node dev-server.mjs
```

Terminal 2:

```sh
flowso validate flow.json --json
flowso inspect flow.json --endpoint http://127.0.0.1:4312/flow --plaintext --json
flowso test flow.json --scenario scenarios.json --endpoint http://127.0.0.1:4312/flow --plaintext --json
flowso preview flow.json --endpoint http://127.0.0.1:4312/flow --plaintext --log-file artifacts/preview.jsonl
```

The flow goes through DETAILS → SLOTS → REVIEW → DONE. The endpoint fetches availability and creates a booking through HTTP calls to the bundled Cal.com contract fixture. A booking conflict keeps the user on REVIEW with an error. Native Back returns to SLOTS, sends BACK through refresh_on_back, and reloads availability. Back routes must not be added to routing_model. The scenarios cover success, back/refresh, slot conflict/recovery, no slots/change date, invalid input, and provider outage/recovery.

Fixture dates: June 10, 2030 has two slots; the 10:00 slot conflicts when booked. June 11 has no availability. June 12 returns HTTP 503. All other valid dates return two slots. The fixture never sends emails or creates a real calendar booking. Repeat the tests without resetting a database.

Files:

- `flow.json`: canonical Flow JSON, editable by agents or the visual builder.
- `scenarios.json`: repeatable user journeys and assertions.
- `handler.mjs`: WhatsApp data-exchange handler with an in-memory development session store.
- `cal-client.mjs`: Cal.com HTTP adapter, independent of the handler.
- `mock-cal.mjs`: deterministic local fixture for the provider contract.
- `dev-server.mjs`: development HTTP host. Restart it after endpoint code edits.
- `.agents/skills/flowso/SKILL.md`: instructions for an agent using the installed CLI.

## Use your own scheduling development server

Set `CAL_API_BASE_URL` to your server's `/v2` root, `CAL_EVENT_TYPE_ID` to an event type, and optionally `CAL_API_KEY` and `CAL_TIME_ZONE`. Run `node dev-server.mjs` with these variables. The fixture is disabled when a custom base URL is set. To allow actual booking POSTs, also set `CAL_ALLOW_BOOKINGS=1` and `CAL_BOOKING_ENABLED_UNTIL` to an ISO timestamp no more than 60 minutes ahead, then restart the server. The deadline is checked before every booking. A boolean without a deadline keeps writes disabled.

Use a test account and future dates when configuring `https://api.cal.com/v2`. Replace the fixture-specific expectations (dates, conflicts and `demo-booking`) with assertions appropriate to that account. Scenario runs call the endpoint for real; they are not a dry run of your provider.

The adapter uses [slots API v2024-09-04](https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type) with `format=range`, and [bookings API v2026-02-25](https://cal.com/docs/api-reference/v2/bookings/create-a-booking). Match these versions if your self-hosted server uses another release. This starter covers a regular event type with name/email; customize booking fields, verification and other provider-specific requirements as needed.

This is a development starter, not a production booking backend. Before deployment, add durable expiring sessions and provider-specific idempotency/reconciliation for uncertain booking outcomes, plus the authentication and encrypted transport your deployment needs. A successful local test validates this runtime and the fixture contract; it does not validate a real Cal.com account or official Meta rendering.

## Continue in a fresh agent session

Open this directory as the session's working directory and ask:

> Use the Flowso skill to connect this scheduling flow to Cal.com. First run the local fixture journeys and inspect the preview. Then help me configure my test event type and check real availability through the local endpoint. Keep booking writes disabled until I request a test booking. Do not submit to Meta yet. Report which parts were actually verified.

The project includes `AGENTS.md`, `CLAUDE.md`, and the complete skill. For the real-account steps,
read `.agents/skills/flowso/references/cal-com.md`. Copy `.env.example` to `.env.local` and fill
credentials locally; the file is ignored by Git. Node 20.6+ supports
`node --env-file=.env.local dev-server.mjs`. Stop the previous server before switching modes.

`scenarios.availability.json` stops after fetching slots and creates no booking. Change its date
for the real account. A successful result can contain no available slots; inspect the snapshot.
Keep `scenarios.json` for the deterministic local fixture. Store temporary test reports under
`artifacts/`, which is ignored by Git.

## Kapso endpoint and deployed tests

`kapso-data-endpoint.js` is a standalone Kapso handler generated from `errors.mjs`, `cal-client.mjs` and `handler.mjs`. After modifying them, run `node build-kapso-endpoint.mjs` before deploying. Use `flowso deploy` with this file, the environment secrets it reads (`CAL_API_KEY`, `CAL_EVENT_TYPE_ID`, optional `CAL_API_BASE_URL` / `CAL_TIME_ZONE`, and `CAL_ALLOW_BOOKINGS=0`), encryption setup and endpoint registration. The provider key is never bundled.

See `.agents/skills/flowso/references/kapso-deploy.md` for initial deployment and `.agents/skills/flowso/references/kapso-operations.md` for `preview-url`, `verify`, bounded booking windows and independent code/secret updates. `flowso verify` tokens remain read-only even during an open booking window. Errors include `error_code` and safe `error_message` fields.

The generated handler uses one-hour KV sessions with bounded write-rate retries. KV eventual consistency and concurrent confirmations still require a stronger session/idempotency design before production use. A timeout or a session-save failure after a booking POST must be reconciled with the provider before retrying.

To reuse a compatible deployed backend on another draft, use `flowso endpoint attach --to kapso --flow-id KAPSO_UUID --function-id FUNCTION_UUID` after configuring that draft's phone and encryption. Attaching changes only the association; later code, secret or booking-gate updates affect all Flows sharing the function. Keep a separate function for development if another consumer is in production. See the generated skill's deployed operations reference for readback verification and recovery.
