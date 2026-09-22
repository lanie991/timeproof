# Security

TimeProof handles an employee's activity data on behalf of their employer,
so it's held to a higher bar than a typical desktop app: the data must be
protected at rest, tamper-evident (since its entire value is being
defensible evidence), and the app itself must not be a new attack surface
on the machine it runs on.

## Data at rest

- **Encryption**: every activity record is encrypted before it touches
  disk, using Electron's `safeStorage` API — backed by the OS keychain
  (macOS Keychain, Windows DPAPI, libsecret/kwallet on Linux). The app
  never manages its own encryption keys. If no OS keychain is available
  (e.g. a minimal Linux install with no secret service running), TimeProof
  falls back to base64-framed storage rather than raw plaintext, and the
  integrity panel in the UI reports this ("unencrypted — OS keychain
  unavailable") so it's never a silent downgrade.
- **Tamper-evidence**: records form a hash chain — each one embeds the
  SHA-256 hash of the previous record. Editing, reordering, deleting, or
  inserting a past entry (including by the employee whose machine it is)
  breaks the chain at that point. `ActivityStore.verifyDay()` walks the
  chain and reports exactly where it broke; the UI surfaces this as a
  pass/fail integrity banner, and a broken chain is meant to be as visible
  as a failed CI check, not something a manager has to go looking for.
- A single corrupted or unreadable line (partial write from a crash, disk
  corruption) is skipped rather than crashing the whole read — the
  resulting gap in the hash chain is exactly what the integrity check is
  built to catch, so failures degrade to "flagged," not "silently missing"
  or "app won't start."

## Application hardening (Electron)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` —
  the renderer (our own UI, but still untrusted by design) has no Node.js
  access; it can only reach the main process through the explicit,
  validated IPC surface in `preload.js`.
- A strict Content-Security-Policy (`default-src 'self'`, no inline
  scripts/styles, no `object-src`) is set on the renderer's HTML.
- New-window creation and in-app navigation are both denied outright
  (`setWindowOpenHandler`, `will-navigate`) — this app never needs either.
- Every `ipcMain.handle` validates the type/shape of its argument before
  using it; unexpected input is rejected rather than trusted.
- Single-instance lock: only one copy of the app may run against a given
  data directory at a time, preventing two processes from racing on (and
  corrupting) the hash chain.

## Privacy by design (see `src/privacy.js`)

- Screenshots are **off by default** and never capture app/window titles
  matching an exclusion list (banking, health, messaging, password
  managers) even when enabled — those are reduced to a generic "Personal"
  label before anything is written to disk.
- No keystrokes are ever captured.
- `describeCollection()` is the single source of truth for "what's being
  collected," shown to the employee in the app itself — nothing is
  collected that isn't disclosed there.

## Dependency and build hygiene

- No native modules in the core path — `timeEvidenceEngine.js`,
  `timesheetBuilder.js`, `privacy.js`, and `store.js` are pure Node with
  zero third-party runtime dependencies. `active-win` (native, for
  reading the OS's active window) is the one optional exception, isolated
  behind a try/catch fallback so its absence or failure never crashes the
  tracker.
- Run `npm audit` before release builds; this is a fresh scaffold with a
  small, pinned dependency tree by design — keep it that way rather than
  adding packages for convenience.

## Internal system integration

The API key for the company's internal system (see README →
"Internal system integration") is encrypted at rest the same way the
activity log is, via `src/integrationConfig.js`. Only **approved**
timesheet lines are ever sent — `src/integration.js` filters unapproved
lines before building the request, so nothing pending or unreviewed
leaves the machine. The renderer never receives the API key back from
the main process (only a `hasApiKey` boolean) — it can set a new key but
can't read the stored one back out.

This assumes the internal endpoint is trustworthy — TimeProof sends
whatever endpoint URL is configured, over whatever scheme it's given
(`http://` is accepted for genuinely internal/intranet endpoints, but
`https://` should be preferred whenever the traffic could leave a
trusted network, since the API key travels in the request headers).

## Not yet implemented (roadmap)

- Code signing and a signed auto-update channel — required before
  distributing built installers to a company, since an unsigned binary or
  unauthenticated update channel would undermine everything above.
- Centralized/server-side storage and sync for the manager dashboard: once
  that exists, it needs TLS, authenticated API access, and the same
  tamper-evidence carried through (e.g. the server re-verifying each
  client's hash chain on ingest, not trusting it blindly).
- SSO and audit logs for admin actions (Enterprise tier).

## Reporting a vulnerability

This is an early-stage internal project; report issues directly to the
maintainer rather than filing a public GitHub issue.
