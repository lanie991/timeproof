# TimeProof

**Proof of Work, Without Manual Timesheets.**

TimeProof is a desktop app that builds accurate, defensible timesheets from
real computer activity — instead of an employee guessing "I think I worked
on that client from 9:00–11:30," TimeProof reconstructs the day from
evidence and lets them review and approve it in one click.

Built for accounting firms, law firms, consulting firms, financial
services, remote teams, government contractors, and freelancers/contractors
who bill by the hour and need timesheets that hold up to an audit.

## Why this, not another screen recorder

This is **not** an employee-surveillance tool. It's positioned and designed
as an audit trail employees can trust:

- Privacy-first by default — screenshots are **off** unless explicitly
  turned on, blurred when enabled, and never taken of excluded personal
  apps (banking, health, messaging, password managers).
- No keystrokes, no passwords, ever.
- The employee sees exactly what's being collected (`src/privacy.js` →
  `describeCollection()`), and reviews every entry before it's submitted.
- The killer feature is auditability, not monitoring: **"Why does this
  timesheet say 4.2 hours?"** → click it → see the underlying evidence.

## Security

Because this handles a company's employee activity data, the activity log
is encrypted at rest via the OS keychain and tamper-evident via a hash
chain — so a timesheet can't be quietly hand-edited by anyone, including
the employee whose machine it's on. The app is also hardened as an
Electron app (sandboxed renderer, strict CSP, validated IPC, no arbitrary
navigation). Full threat model and details: [SECURITY.md](./SECURITY.md).

## How it works

1. **Start work** — TimeProof runs quietly in the background (tray icon).
2. **It tracks activity** — active application, window/document title,
   idle periods, lock/unlock, login/logout, at a configurable interval.
3. **The Time Evidence Engine turns raw samples into evidence blocks** —
   grouping continuous work on the same project (even across a few
   apps — Excel → a quick Outlook reply → back to Excel) into one
   defensible line item with a confidence score:

   ```
   Client ABC — 9:03–11:41
   2h 38m · Confidence: 98%

   Evidence:
   - Excel active: 9:03–10:12
   - Outlook active: 10:14–10:27
   - Word active: 10:29–11:41
   - No idle period >5 minutes
   ```

4. **The employee reviews and approves** each line before it's submitted —
   TimeProof never auto-submits a timesheet on someone's behalf.

Run `npm run demo` to see this pipeline end-to-end on synthetic data
without launching the GUI.

## Architecture

```
src/
  timeEvidenceEngine.js   Pure logic: raw samples -> evidence blocks + confidence score
  timesheetBuilder.js     Aggregates blocks into per-project timesheet lines,
                          drill-down ("why N hours?"), and approve/submit
  privacy.js              Default privacy policy, redaction, "what's collected"
  activityTracker.js      Polls active window + idle time on an interval
  store.js                Encrypted, tamper-evident append-only activity log (no native deps)
  main.js / preload.js    Electron shell: tray, power events, IPC to the UI
renderer/
  index.html / dashboard.js / styles.css   Review UI: timesheet, evidence drill-down, privacy panel
test/                     Jest coverage for the engine and timesheet builder
scripts/demo.js           Runs the engine over sample data, prints the result
```

`timeEvidenceEngine.js` and `timesheetBuilder.js` have no Electron or I/O
dependency — they're pure functions over plain data, which is what makes
the scoring logic fully unit-testable (`npm test`) independent of the
desktop shell.

### Confidence scoring

Each evidence block starts at a base score and is adjusted by the same
signals a person would cite if asked to defend the entry:

- **+15** no idle gap longer than the idle threshold (default 5 min)
- **−10** per idle gap that *does* exceed the threshold
- **+10** multiple apps corroborate the same block (e.g. a document editor
  *and* the email thread about it)
- **+15** the activity matched a known project/client keyword; **−15** if
  it couldn't be classified at all
- **+5** the block spans more than one raw segment (sustained, resumed
  work rather than a single blip)

Score is clamped to 5–98 — it's a confidence signal for review, never a
claim of certainty.

## Getting started

```bash
npm install
npm test        # run the Time Evidence Engine + timesheet builder test suite
npm run demo    # print a sample timesheet + evidence trail to the console
npm start        # launch the Electron app (requires a display)
```

`active-win` (used for real active-window detection) is an optional
dependency — if it's not installed or fails to load (e.g. in CI, or an
unsupported platform), the tracker degrades to an "Unknown" window sample
rather than crashing.

## Internal system integration

The "Company System" panel in the app lets you point TimeProof at your
company's own internal timesheet API — no specific vendor is assumed.
Configure an endpoint URL, an optional employee ID, and an optional API
key (encrypted at rest the same way the activity log is). Clicking
**Submit to Company System** POSTs only **approved** lines as JSON:

```json
{
  "employeeId": "jane@company.com",
  "weekLabel": "2026-09-22",
  "submittedAt": "2026-09-22T15:54:24.237Z",
  "lines": [
    {
      "project": "Client ABC",
      "hours": 2.5,
      "tasks": ["Bank Statement Analysis"],
      "evidence": [
        {
          "range": "09:03–11:41",
          "duration": "2h 38m",
          "confidence": 98,
          "evidence": [
            "Excel active: 09:03–10:12",
            "Outlook active: 10:14–10:27",
            "Word active: 10:29–11:41",
            "No idle period >5 minutes"
          ]
        }
      ]
    }
  ]
}
```

If an API key is set, it's sent as `Authorization: Bearer <key>`. Your
internal API needs to accept a POST with this shape and return a 2xx
status; anything else (including a network failure) is surfaced back to
the user as a plain-language error rather than failing silently. See
`src/integration.js` if the receiving system needs a different shape —
it's a single small function, safe to adapt.

## Roadmap

- [ ] Calendar integration as an additional confidence signal
- [ ] Optional blurred screenshots (capture + client-side pixelation)
- [ ] Manager dashboard: weekly rollup across a team, export/integrations
- [ ] SQLite-backed store for larger history + faster range queries
- [ ] Packaged builds (electron-builder) for macOS/Windows/Linux

## Pricing (reference)

| Tier | Price | Includes |
|---|---|---|
| Starter | $5/user/month | Activity tracking, automatic timesheets, idle detection |
| Professional | $10/user/month | + AI activity classification, project tracking, manager dashboard, reports, integrations |
| Enterprise | Custom | + SSO, audit logs, data retention controls, compliance controls, custom integrations |
