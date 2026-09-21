---
name: flowso
description: Build and debug WhatsApp Flows locally with the Flowso CLI. Use for multi-screen navigation, dynamic data endpoints, executable scenarios, and diagnosing flows before deploying to Meta or Kapso.
---

# Develop WhatsApp Flows locally

Use the installed `flowso` CLI as an executable feedback loop. Run `flowso help` to discover the installed version's commands. Do not assume a source checkout or use `bun run cli` in consumer projects.

For Cal.com scheduling or switching from fixtures to a real scheduling API, read [references/cal-com.md](references/cal-com.md).

For a user installing the skill, `flowso skill install` launches the standard Vercel skills installer; `--global` selects user-wide scope. Run it from the target project for project scope. This delegates agent selection to the installer and requires npx/network access. Package installation only prints a next-step hint and never installs skills automatically. For an offline copy, use `flowso skill --install <directory>`; it refuses to overwrite an existing directory.

## Start from a reproducible project

For a new dynamic flow, `flowso init my-flow` creates a four-screen booking flow, a local HTTP endpoint, a Cal.com contract fixture, scenarios, and this skill. Run `node dev-server.mjs` in that directory. Keep this process alive while testing and stop it when finished unless the user wants to keep working.

For an existing flow, preserve its canonical JSON and connect to its development endpoint. An endpoint is a WhatsApp data-exchange adapter, not a raw Cal.com/other provider API. It receives `INIT`, `data_exchange`, and `BACK`, and returns `{version, screen, data}`. Connect it to the provider in application code.

## Inspect, exercise, fix, replay

```sh
flowso validate flow.json --json
flowso inspect flow.json --endpoint http://127.0.0.1:4312/flow --plaintext --json
flowso test flow.json --scenario scenarios.json --endpoint http://127.0.0.1:4312/flow --plaintext --json
```

Use `--public-key public.pem` instead of `--plaintext` for an encrypted endpoint. `--timeout 2000` bounds each endpoint request. Dynamic flows start with `INIT`; static flows start at their first screen. `inspect --screen SCREEN --data '{"key":"value"}'` starts directly on a screen. Inspect does not persist a session between CLI calls: write the sequence into a scenario and replay it.

Read `snapshot.fields` for visible input names, current values, enabled state and actual option IDs. Read `snapshot.actions` for clickable `target` paths and navigation item IDs. These come from the same runtime as the visual preview; do not invent raw actions that skip the flow's declared transitions.

Use `flowso catalog --json` to discover component IDs. `flowso catalog radio-buttons-group --json` returns its canonical snippet, required preview data, supported version, limits and documentation link. Copy the relevant component into your Flow JSON, wire its real data/actions, then validate. Catalog examples alone are not a complete flow.

Read [references/scenarios.md](references/scenarios.md) when writing scenarios or interpreting a failed test. Re-run after editing either the JSON or the endpoint. With `--json`, stdout is a single JSON document even on failure; a nonzero exit status signals failure. Use `--trace` when you need per-step snapshots and request/response events.

Use `--test "exact test name"` to rerun one failing journey while iterating; run the relevant suite before calling the change complete.

Do not make tests green by silently enabling example data. Tests disable `__example__` fallback. `inspect --examples` is for exploring a design before an endpoint exists; it does not verify the integration.

Keep `routing_model` acyclic: native Back navigation is implicit. On a booking conflict, return the current REVIEW screen with an error; use native Back and `refresh_on_back` to reload availability instead of adding a reverse edge.

Every endpoint screen response must return the declared screen data and the matching data API `version`. To finish from the endpoint, return `screen: "SUCCESS"` with `data.extension_message_response.params`, including the request's `flow_token`. A terminal screen can instead use a `complete` Footer.

## Visual review and deployment

For a person testing the flow, prefer `flowso preview flow.json --endpoint http://127.0.0.1:4312/flow --plaintext --log-file artifacts/preview.jsonl`. Give them the printed phone-only URL; monitor `artifacts/preview.jsonl` independently. Use `flowso serve` when they want the visual builder or component editing. Both reload Flow JSON from disk.

Preview logs pair `exchange.request` with `exchange.response` or `exchange.error` by `requestId`; use `sessionId` to separate browser tabs and `serverId` to separate server runs. Records include decoded request/response data, transport, HTTP status, timing, and runtime transitions/validation/completion events. Read keys actually present in the request to identify missing payload fields. Tokens and secret-key fields are redacted; headers and raw failed HTTP bodies are not logged. Calls inside the endpoint need its own instrumentation. Browser runtime events arrive asynchronously, so log sequence is arrival order. Do not infer a successful call from the UI alone.

Use the browser for layout, focus, and native widget checks; headless scenarios verify runtime behavior, not pixel parity with WhatsApp.

`flowso deploy flow.json --to kapso --phone-number-id PHONE_ID --name NAME` creates a real draft using `KAPSO_API_KEY`. Existing drafts use `--flow-id KAPSO_UUID`. For deploying endpoint code, environment secrets, encryption and registration together, read [references/kapso-deploy.md](references/kapso-deploy.md). Publishing requires `--publish`. Only perform the deployment/send requested by the user; local testing does not authorize live bookings or messages.

Keep provider keys in environment variables, never in Flow JSON, scenarios, or committed logs. Trace output can contain attendee data and flow tokens. Prefer synthetic test records.

The booking template uses a local Cal.com HTTP fixture by default. Read its README before configuring a real provider. Report separately: JSON validation, runtime scenarios, local provider-contract tests, live provider behavior, and official Meta preview. A local pass is not proof of Meta acceptance or a real calendar booking.

For interactive deployed previews, Kapso sends, read-only deployed verification, temporary booking windows, structured errors and independent code/secret updates, read [references/kapso-operations.md](references/kapso-operations.md). Never enable booking writes or send a WhatsApp message without explicit user authorization.

To reuse an already deployed Kapso backend, use `flowso endpoint attach --to kapso --flow-id KAPSO_UUID --function-id FUNCTION_UUID` on a draft with phone/encryption configured. Read the association and shared-function sections in [references/kapso-operations.md](references/kapso-operations.md) first. Code, secret and booking-gate changes apply to every Flow using a shared function; a draft ID does not isolate those mutations. Keep development on a separate function when production must remain unaffected.
