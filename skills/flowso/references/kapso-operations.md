# Test and maintain a deployed Kapso Flow

All commands use `KAPSO_API_KEY` from the environment and a **Kapso Flow UUID**. They do not require a direct Meta access token. Use the installed CLI (`flowso`); add `--json` to preview, verify, endpoint, secrets and bookings commands for one machine-readable result. HTTP failures intentionally omit server bodies that could contain credentials. Inspect Kapso invocation logs for details.

## Send a requested WhatsApp test message

```sh
flowso send --to kapso --flow-id KAPSO_UUID --to-number +15551234567
```

This sends a real message. Only run when requested, to an authorized recipient. The sender and Meta Flow ID are resolved from Kapso; `--phone-number-id` can specify a sender when the Flow has none, and must match any attached sender. Draft/published mode follows the Flow status; `--draft` explicitly forces draft mode. `--screen` and optional `--data` choose navigation instead of the default INIT/data-exchange start. Existing WhatsApp conversation-window and recipient rules still apply.

## Interactive preview

```sh
flowso preview-url --to kapso --flow-id KAPSO_UUID --json
# Static flow or explicit navigation:
flowso preview-url --to kapso --flow-id KAPSO_UUID --screen DETAILS --data '{}' --json
```

Open the returned `url`. The command reads the current Meta preview URL, adds `interactive=true`, `debug=false`, a fresh `flow_token`, and `flow_action=data_exchange` (or `navigate` with an encoded screen/data payload). It does not invalidate other preview links. `visualUrl` is the bare Meta URL, explicitly labeled visual-only: it does not establish that dynamic endpoint behavior works. Preview tokens expire; rerun the command when needed. URLs contain access tokens and should not be committed or shared publicly. An interactive preview can execute the endpoint: keep booking writes disabled until an actual booking is authorized.

## Deployed read-only smoke test

```sh
flowso verify --to kapso --flow-id KAPSO_UUID \
  --data '{"name":"Flowso Test","email":"flowso@example.test","date":"2030-06-10"}' --json
```

Choose a future date with availability and synthetic attendee data. This checks endpoint URI registration against Meta, encryption configuration, empty Meta validation errors and deployed function status, then exercises ping → INIT → availability → selection/REVIEW → native BACK/refresh. It never submits REVIEW. No available slots is a failure to complete the smoke test, not a pass. Override screen names with `--input-screen`, `--availability-screen`, and `--review-screen`; defaults are DETAILS, SLOTS, REVIEW. This first smoke-test contract expects availability data `slots: [{id: string}]` and submits `{slot: id}`. Other data shapes need a custom scenario via `flowso test` or an adapter.

**Transport boundary:** requests invoke the deployed Kapso function directly. Registration is read from Meta separately. This does not exercise Meta's encrypted callback transport or the rendered UI, and does not replace a final interactive preview/WhatsApp test. It reads live provider availability and writes temporary endpoint session state, but must not create bookings.

### Endpoint contract

The new booking starter implements this contract. Existing/custom endpoints must adopt it before `verify` can run:

- Reserve tokens prefixed `flowso_verify_` as permanently read-only. Derive this from `data_exchange.flow_token`, never a user-overridable form field. Enforce it at every booking/write boundary even when a global booking gate is enabled.
- Handle the Kapso function invocation envelope `{source: 'flowso_verify', flow: {id, meta_flow_id}, data_exchange: {version: '3.0', action, flow_token, screen?, data}}`.
- For ping, return `{version:'3.0', data:{status:'active', flowso_verify:{protocol:1, read_only:true}}}`. Include the same `flowso_verify` acknowledgement in every verification response. Normal responses need not include it.
- Return Flow data API 3.0 responses and structured failures in `data.error_code` / `data.error_message`.

The CLI refuses an unsupported ping response before INIT and stops if any acknowledgement is missing. This is an endpoint-enforced safety contract, not a sandbox: the CLI cannot prevent arbitrary untrusted handler code from causing effects, including during ping. Review custom code before opting it into this protocol.

## Temporary booking permission

Only enable after the user authorizes a real booking test. The starter requires **both** `CAL_ALLOW_BOOKINGS=1` and a future `CAL_BOOKING_ENABLED_UNTIL` ISO timestamp; a boolean alone no longer enables writes.

```sh
flowso bookings enable --to kapso --flow-id KAPSO_UUID --for 10m
# Revoke early:
flowso bookings disable --to kapso --flow-id KAPSO_UUID
```

`enable` accepts 1m–60m, requires a draft, and checks the endpoint advertises `booking_gate: 'expiry-v1'` in its read-only ping acknowledgement. It writes the expiry first, then the boolean. The handler checks the deadline immediately before each booking POST, so leaving the boolean set cannot create indefinite permission. `disable` writes an expired deadline first and is also allowed after the Flow is published. These commands update function-wide configuration: the time window permits multiple ordinary bookings; it is **not** a one-use gate. A request already sent to the provider cannot be revoked. Verification tokens remain read-only throughout the window. For local `dev-server.mjs`, set both environment values and restart the process; it still checks expiry on every attempt.

Never advertise `expiry-v1` in a custom endpoint without implementing the deadline check. Old endpoints using only `CAL_ALLOW_BOOKINGS` must be upgraded first. No existing project is modified automatically by a CLI upgrade.

## Attach an existing function to a draft

Use this when the backend is already deployed in the same Kapso project and only the Flow-to-function association needs to change:

```sh
flowso endpoint attach --to kapso --flow-id KAPSO_UUID \
  --function-id FUNCTION_UUID --json
```

The draft must already have a phone number and Flow encryption configured. Kapso rejects functions that are not deployed or belong to another project. The command calls `PATCH /whatsapp/flows/{flow_id}/data_endpoint` with `{function_id}` to attach and register with Meta in one request. It then reads back the Flow, its endpoint and Meta's endpoint URI/status. Success requires the requested deployed function, encryption, matching endpoint registration and draft status. It does not upload code, copy or modify secrets, compile Flow JSON, delete the previous function, rotate the endpoint secret or publish.

`attach` rejects published Flows before writing because Kapso automatically republishes them on association changes. HTTP 200 with `data.warning` is treated as failure, not success. Any failed PATCH response or subsequent verification may follow an applied association; inspect the Flow before retrying. Flowso never silently retries or rolls back. Keep other operators from publishing the draft during this operation; the preflight/readback checks are not a server-side transaction.

After attaching, run `flowso verify` if the backend supports its read-only contract, then `flowso preview-url` for the official interactive check. Attachment alone does not validate Flow JSON or prove the new backend implements that Flow's screens and data. If JSON/schema changes need compilation, use the existing draft version/deploy path and inspect Meta validation separately.

Do not send `function_id` to `POST .../data_endpoint/register`: that endpoint ignores it and only registers the function already associated. The full `flowso deploy --data-endpoint ... --register-endpoint` path already calls register without a function ID and remains supported. See [Kapso's attach API](https://docs.kapso.ai/api/platform/v1/whatsapp-flows/attach-an-existing-data-endpoint-function) and [September 17, 2026 changes](https://docs.kapso.ai/changelog#sep-17-2026).

### Shared functions: choose the scope deliberately

| Operation | What changes |
| --- | --- |
| `endpoint attach` | One Flow's association and its registered Meta endpoint. |
| `endpoint deploy` / full deploy with endpoint code | The associated function's code, affecting every Flow using it. |
| `secrets set` | The function's credentials/configuration, affecting every Flow using it. |
| `bookings enable` / `disable` | The function-wide booking gate, including other attached Flows. |
| `verify` | Calls the associated function with a new read-only token; temporary session state may change. |

Function mutation results include `functionId`, `mutationScope: "function"` and `sharedFunctionNotice`. The full deployment command also identifies the existing function's shared scope. These are scope disclosures, not proof that the CLI discovered every attached Flow. A draft can share a backend with a published Flow: draft-only checks do not isolate code, credentials or booking permission. Use a separate function for development when production must remain unaffected. Before changing a shared function, establish that all its consumers are in the user's authorized scope.

A shared handler must support each attached Flow's schema and scope session state by Flow ID as well as token. The generated booking handler already uses that namespace. Kapso function logs/invocations span the function's consumers; correlate using Flow IDs and tokens instead of assuming everything belongs to the Flow used to fetch the logs.

## Update function code or secrets independently

```sh
# Values come only from environment variables, never NAME=value arguments:
flowso secrets set --to kapso --flow-id KAPSO_UUID \
  --secret-env CAL_API_KEY

flowso endpoint deploy --to kapso --flow-id KAPSO_UUID \
  --data-endpoint kapso-data-endpoint.js \
  --secret-env CAL_API_KEY --secret-env CAL_EVENT_TYPE_ID \
  --secret-env CAL_ALLOW_BOOKINGS --secret-env CAL_BOOKING_ENABLED_UNTIL
```

Both resolve the function associated with an existing draft Flow; that function may also serve other Flows. Secret-only updates upsert the named values without deploying code. Code-only deployment does not upload Flow JSON, set up encryption, register the endpoint or recompile Meta. Include **all existing secrets**, including a disabled/expired booking gate, because the current Kapso code upload does not guarantee secret retention. The CLI reads secret names and refuses an incomplete set before writing. If a previous function deployment failed, Kapso may return no secret names: on recovery you must supply every required secret from your environment, since the CLI cannot reconstruct the old set. Never use a stale open booking window during redeployment.

Updates are separate remote writes, not a transaction. A failure may leave code or some secrets updated. Stop testing, inspect the function, correct the inputs, and retry; verify the result before using its preview. The CLI does not automatically retry sends or provider booking calls. Keep incompatible code/Flow schema changes on the full `deploy` path.

## Structured errors and uncertain booking results

| Code | Meaning / next action |
| --- | --- |
| `BOOKING_DISABLED` | Window absent/expired, boolean disabled, or read-only test token. |
| `SLOT_CONFLICT` | Stay on REVIEW; use native Back to refresh availability. |
| `PROVIDER_AUTHENTICATION` | Check the provider credential; HTTP 401/403. |
| `PROVIDER_VALIDATION` | Check input or malformed provider response; HTTP 400/422. |
| `PROVIDER_TIMEOUT` | Check provider records before retrying a possibly completed booking. |
| `PROVIDER_UNAVAILABLE` | Provider/network failure; reconcile an uncertain write first. |
| `SESSION_EXPIRED` | Restart the Flow. |

The deployable starter is generated from the same adapter and handler used locally: `node build-kapso-endpoint.mjs`. Its KV sessions expire after one hour and storage rate-limit retries do not replay provider calls. KV is eventually consistent; this development starter does not guarantee concurrent confirmation idempotency or cross-location read-after-write. Add a strongly consistent session/idempotency store and provider reconciliation before production booking use. A successful provider write followed by a failed session save is an uncertain outcome, not permission to blindly retry.
