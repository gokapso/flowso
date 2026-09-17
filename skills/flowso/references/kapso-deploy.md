# Deploy a dynamic draft to Kapso

Use this after local runtime and endpoint tests pass and the user requests deployment. A local pass does not verify Meta rendering or provider behavior. Publishing, sending WhatsApp messages, and creating real bookings remain separate actions.

The endpoint file is standalone JavaScript with `async function handler(request, env)`, without module imports/exports. Kapso decrypts Meta requests; read `const { data_exchange } = await request.json()`. Return `{version, screen, data}`. Provider credentials come from `env`, not Flow JSON or embedded source. A local HTTP server is not itself a deployable Kapso function.

Load `KAPSO_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID` and provider configuration through the process environment. `--secret-env` accepts names only, can be repeated, and fails before deployment if a value is missing or empty. It does not load `.env.local` automatically. Never pass `NAME=value`, print secrets, or ask the user to paste keys into chat.

For an existing Cal.com project whose function expects the plural `CAL_EVENT_TYPE_IDS`:

```sh
flowso deploy flow.json --to kapso \
  --flow-id KAPSO_FLOW_UUID \
  --data-endpoint kapso-data-endpoint.js \
  --secret-env CAL_API_KEY \
  --secret-env CAL_API_BASE_URL \
  --secret-env CAL_EVENT_TYPE_IDS \
  --secret-env CAL_TIME_ZONE \
  --secret-env CAL_ALLOW_BOOKINGS \
  --setup-encryption --register-endpoint
```

Use the environment variable names that the actual endpoint reads. Keep `CAL_ALLOW_BOOKINGS=0` for availability-only tests. Omit `--flow-id` only when creating a new draft; it is a Kapso UUID, not a Meta numeric ID. All dynamic options require `--to kapso` and `--data-endpoint`. Encryption and registration flags are explicit; omit them only if encryption and endpoint registration are already configured; the final checks still require both.

The command validates local inputs, checks an existing flow is a draft, uploads Flow JSON, optionally sets up encryption, uploads/deploys the function, upserts the selected function secrets, optionally registers the endpoint, then re-uploads Flow JSON so Meta compiles it with the endpoint in place. Success requires explicit zero-error validation on that final version, an unpublished draft, configured encryption, a registered endpoint, and a preview URL read after compilation. Kapso refreshes the preview while creating that final version. Encryption uses Kapso's setup API without requesting key rotation. Existing published flows are rejected before mutation, because endpoint registration can republish them.

On redeployment, include every existing function secret with `--secret-env`. The current Kapso worker upload does not explicitly retain secret bindings; Flowso checks the existing names before writing and restores all supplied values after deployment. Secret values cannot be read back from Kapso. No delete-first secret operation is used.

Deployment consists of separate remote writes, not a transaction. A failure stops subsequent steps and reports the failed stage. Reuse the printed Kapso Flow ID with the same options after fixing the problem; completed changes are not rolled back. A failed create with no returned ID may have succeeded remotely: inspect Kapso before retrying to avoid creating a duplicate. Updates to an already registered draft function become live during deployment, so pause preview testing until the command completes.

Dynamic deployment rejects `--publish` in the same invocation. Review the official preview and Kapso function invocation logs before a separately requested publication. HTTP acceptance and draft status do not prove that the endpoint's provider calls work. If deployment fails, inspect the named stage in Kapso; response error bodies for dynamic requests are intentionally omitted because they may echo secrets or source code.

References: [Kapso data endpoints](https://docs.kapso.ai/docs/whatsapp/flows/data-endpoint), [function secrets](https://docs.kapso.ai/api/platform/v1/functions/functions/create-function-secret).

After deployment, use the [deployed operations reference](kapso-operations.md) for an interactive preview, read-only smoke test and separate function/secret updates. The booking starter includes a generated standalone endpoint; regenerate it after editing its source modules.
