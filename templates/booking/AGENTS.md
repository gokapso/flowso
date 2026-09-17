# Working on this flow

Read `.agents/skills/flowso/SKILL.md` and `README.md` before changing the flow or endpoint.
Use the installed `flowso` CLI to inspect and test journeys. Keep tests on the local fixture unless live provider testing is explicitly requested.
After a change, run the relevant scenarios against `node dev-server.mjs`; restart that server after editing endpoint code.
Report the failing step and snapshot when tests fail. Keep real credentials and attendee data out of fixtures and traces.

For Cal.com account configuration and availability-only tests, read `.agents/skills/flowso/references/cal-com.md`. Use `scenarios.availability.json` with a chosen future date before testing actual bookings. Keep `.env.local` and `artifacts/` out of commits.
