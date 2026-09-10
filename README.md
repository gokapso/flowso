# flowso

**Flowso** is a local WhatsApp Flows emulator by [Kapso](https://kapso.ai).

Run WhatsApp Flows locally. Render a Flow JSON, walk through its screens, fill forms, and call
your **real data endpoint** with the same encryption Meta uses. No Meta account or WhatsApp
Manager needed to iterate. Works with or without Kapso.

![playground](docs/playground.png)

## What is in the box

One npm package with subpath exports:

| Import | What it gives you |
|---|---|
| `flowso/schema` | TypeScript types for Flow JSON (7.3 first, tolerant of 4.0+), per-component minimum versions. |
| `flowso/runtime` | Pure state machine: screens, back stack, forms, `${data.*}` / `${form.*}` / `${screen.X.*}` bindings, backtick nested expressions, `If` / `Switch`, `navigate` / `complete` / `data_exchange` / `update_data` / `open_url`, client-side validation. No DOM, no network. |
| `flowso/validator` | Local Flow JSON validator that returns diagnostics in the shape of Meta's `validation_errors` (code, message, JSON pointer). |
| `flowso/endpoint` | Client that calls a data endpoint the way Meta does: RSA-OAEP (SHA-256) + AES-128-GCM, flipped IV on responses, `INIT` / `data_exchange` / `BACK` / `ping`, status mapping (421 / 427 / 432). Plaintext and mock modes. Server helper to build a local encrypted endpoint for tests. |
| `flowso/catalog` | Component catalog (every Flow JSON component plus screen patterns, with snippet, minimum version, limits and docs link) and `insertComponent` / `insertScreen` helpers that place a snippet in the right spot of a flow. |
| `flowso/vue` | `FlowPhone` component (WhatsApp-style phone frame with Android and iOS looks, dark mode) and `useFlowRuntime` composable. |
| `flowso` (CLI) | `serve flow.json` opens the playground with hot reload and proxies `data_exchange` to your endpoint. `validate flow.json` for CI. |

## Quick start

```bash
# Static flow: render and walk through it
npx flowso serve flow.json

# Flow with an endpoint: encrypt requests with your business public key, call your endpoint
npx flowso serve flow.json --endpoint https://example.com/flow --public-key ./public.pem

# Plaintext endpoint (your local dev server without encryption)
npx flowso serve flow.json --endpoint http://localhost:3000/flow --plaintext

# No endpoint yet? Try the bundled example (encrypted), in a second terminal:
bun examples/endpoint-server.ts --encrypted      # writes examples/public.pem
npx flowso serve fixtures/appointment.flow.json --endpoint http://127.0.0.1:4312/flow --public-key examples/public.pem

# CI
npx flowso validate flow.json
```

Open the printed URL. Left: the JSON editor with inline diagnostics. Middle: the phone. Right:
endpoint mode, validation issues, and the event log (every navigation, `data_exchange` request and
response with timing, validation failure and completion payload).

The completion screen shows exactly what WhatsApp sends back to your business in
`interactive.nfm_reply.response_json`.

**Components** opens a Block Kit Builder–style gallery: pick any component or screen pattern, see
it rendered by the real runtime, edit its JSON by hand, and insert it into a screen of your flow
(inside the Form when there is one, before the Footer, with duplicate input names renamed).

## Use the runtime in your own code

```ts
import { createFlowRuntime } from 'flowso/runtime';
import { createEndpointClient } from 'flowso/endpoint';
import flow from './flow.json';

const runtime = createFlowRuntime({
  flow,
  endpoint: createEndpointClient({ url: 'https://example.com/flow', mode: 'encrypted', publicKeyPem }),
  flowToken: 'test-token',
});

await runtime.start({ mode: 'navigate' });         // or { mode: 'data_exchange' } to send INIT
await runtime.setFormValue('email', 'ana@example.com');
const footer = runtime.render()?.children.find((node) => node.type === 'Footer');
await runtime.dispatch(footer.props['on-click-action']);
console.log(runtime.getState().screenId, runtime.getState().completion);
```

`runtime.render()` returns the current screen as a flat list of components with every dynamic
property resolved, `If` / `Switch` evaluated, invisible components removed, and input values and
errors attached. Any UI can render that list; the Vue renderer is one implementation.

## Use the Vue component

```vue
<script setup lang="ts">
import { FlowPhone } from 'flowso/vue';
import 'flowso/vue/theme.css';
</script>

<template>
  <FlowPhone :flow="flowJson" :endpoint="endpoint" platform="ios" @event="log" />
</template>
```

## Test your endpoint without the UI

```ts
import { createEndpointClient, createLocalEndpointHandler, generateKeyPair } from 'flowso/endpoint';

const { publicKeyPem, privateKeyPem } = generateKeyPair();
// Mount createLocalEndpointHandler({ privateKeyPem, handler }) on node:http to emulate your endpoint,
// or point createEndpointClient at the real one.
const client = createEndpointClient({ url: 'https://example.com/flow', mode: 'encrypted', publicKeyPem });
const response = await client.exchange({ version: '3.0', action: 'INIT', flow_token: 't', data: {} });
```

## What matches production and what does not

Matches: Flow JSON structure and versions, bindings and nested expressions, navigation and back
stack, form validation rules (required, min/max chars, email, number, pattern, min/max selected),
`update_data`, endpoint protocol and encryption, completion payload.

Approximate: visual styling (close to Android and iOS, not pixel-exact), markdown rendering,
date and calendar pickers (native inputs), photo and document pickers (file names only, no media
upload). `If` / `Switch` and expressions follow Meta's documentation; edge cases of coercion are
not verified against the real client yet.

Not simulated: sending the Flow message, template rendering, WhatsApp Web vs mobile differences.

## Development

```bash
bun install
bun run test            # vitest
bun run typecheck       # tsc
bun run typecheck:vue   # vue-tsc (SFCs)
bun run playground      # Vite dev server on http://127.0.0.1:4310 (proxies /__sim to :4311)
bun run cli serve fixtures/appointment.flow.json --port 4311   # API for the dev playground
bun examples/endpoint-server.ts                                 # sample endpoint on :4312
bun run build           # dist/ (library, types, playground)
```

Requires Node 20 or newer for the CLI and the endpoint client (uses `node:crypto`). The runtime,
validator and Vue renderer run in any modern browser.

License: MIT.
