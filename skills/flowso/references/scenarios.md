# Scenario format

```json
{
  "tests": [{
    "name": "confirm appointment",
    "start": {"mode": "data_exchange"},
    "steps": [
      {"expect": {"screen": "DETAILS", "status": "ready"}},
      {"fill": "name", "value": "Ada Lovelace"},
      {"fill": "email", "value": "ada@example.test"},
      {"fill": "date", "value": "2030-06-10"},
      {"submit": true, "expect": {"screen": "SLOTS"}},
      {"fill": "slot", "valueFrom": "/fields/slot/options/0/id"},
      {"submit": true, "expect": {"screen": "REVIEW"}},
      {"submit": true, "expect": {"screen": "DONE"}},
      {"submit": true, "expect": {"status": "completed", "completion": {"booking_uid": "demo-booking"}}}
    ]
  }]
}
```

- One operation per step: `fill` with `value` or `valueFrom` (JSON Pointer into the current snapshot), `submit` (the rendered Footer), `click` (an action target, optionally `item` for NavigationList), or `back`. A standalone `expect` is also a step.
- `expect` compares snapshot properties. Objects match the provided keys; arrays match length and order using the same matching rules for their items; scalars match exactly; `{}` asserts an empty object. Assert meaningful screen transitions and completion values, not just test execution.
- For an expected validation failure, include `expect.fieldErrors` on that step. For a recoverable endpoint message, include `expect.errorMessage`. For an expected runtime failure, assert `expect.error`. Otherwise these fail the test immediately.
- Each test has a fresh runtime and generated flow token. This does not reset an external database or provider. Make fixtures repeatable; don't assume a test means a dry run of external writes.
- Include the business paths that matter: successful completion, input errors, no availability, stale selections, back/refresh, and endpoint failure/recovery. The bundled `scenarios.json` is an executable example.

## Test results

The process exits 1 on invalid input, a failed assertion, unexpected runtime/validation errors, unavailable controls, or missing/wrongly typed screen data. With `--json`, stdout is a single JSON document even on failure. `tests[].snapshot` shows the final/failing screen; `steps[].index` is zero-based. Use `--trace` only when needed for per-step snapshots and request/response events.
