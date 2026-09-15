# Architecture

NAWI TestBench is a single Node.js service with an embedded SQLite database and a
static browser front end. No build step, no framework on the client, two runtime
dependencies (`express`, `better-sqlite3`).

```
browser (public/)                    server (src/)                         storage
──────────────────────────────       ──────────────────────────────────    ─────────────────
index.html   overview                server.js   HTTP API, pages, roles    nawi.db (SQLite, WAL)
login.html   sign-in                 auth.js     scrypt passwords, tokens    instruments
app.html/js  workbench               db.js       schema, migrations, queries sessions
standards.*  rule-set explorer       engine.js   pure evaluation             observations
chart.js     MPE envelope (SVG)      report.js   HTML report                 environment
readout.js   LCD readout, MPE gauge  documents.js DOCX blocks               checks
site.css     shared visual system    docx.js     OOXML writer (zlib only)    attachments (BLOB)
app.css      workbench layout        certificate.js certificate             users, tokens, audit
                                     pdf.js      headless Chromium print
rulesets/oiml-r76-2006.json          seed.js     worked examples
```

## Principles

**The rule set is data.** Everything the engine knows about OIML R 76 lives in
`rulesets/<id>.json`: accuracy classes and their admissible `n` ranges, the MPE band
tables, the in-service multiplier, the supply-voltage rules, and one entry per test
with its kind, clause, criterion constants, applicability and whether it is required
for type approval and/or verification. A new edition of the Recommendation is a new
file. Every report stores the id of the rule set it was opened under and is always
re-evaluated against that same file, so historical reports remain reproducible.

**The engine is a pure function.** `engine.evaluateSession()` takes the rule set,
the instrument, the verification context, the purpose, the observations and the
checklist answers, and returns the full evaluation: per-point errors, per-test
verdicts, load-plan completeness, certificate eligibility. It performs no I/O. The
same function runs for the workbench, the report, the certificate and the tests.

**Observations are immutable facts.** A reading is stored exactly as entered, with
the validation warnings that were raised at the time and who recorded it. Nothing
derived is stored; verdicts are recomputed on every read. Closing a report freezes
its observations; approval binds them to a SHA-256 signature.

**Roles are enforced at the API.** Every route declares the minimum role it needs.
The browser hides controls the user cannot use, but the server is the authority.

## Request flow for one observation

1. `POST /api/sessions/:id/observations` (engineer or above).
2. The session must be a draft; the test must exist in the session's rule set and
   apply to the instrument (class, electronic, `d` threshold).
3. `engine.validateObservation()` checks physical plausibility: load within
   Max (+T), tare within T, indication a multiple of `d`, changeover load within one
   `e`, condition within the instrument's temperature or voltage range, time present
   for timed tests. Hard errors return HTTP 422; warnings are stored with the row.
4. The row is inserted, an audit entry is written, and the whole session is
   re-evaluated. The response carries the warnings and the fresh evaluation so the
   workbench updates every verdict, the envelope chart and the navigator at once.

## Workflow states

```
draft ──close──▶ complete ──approve──▶ approved
  ▲                 │                     │
  └────reopen───────┴──────return / reopen (approver)
```

* `close` is refused while the evaluation is incomplete unless forced; the outcome at
  closing is recorded.
* `approve` requires the approver role and a closed report. It computes the signature
  over the instrument, observations, checks, verdicts and approval record. A
  certificate number is issued only when `certificateEligible` is true: overall pass,
  every test required for the purpose performed, no classification findings.
* `reopen` of an approved report withdraws the approval, signature and certificate,
  and is limited to approvers. The public `/verify/<certificate>` page then reports
  the certificate as withdrawn.

## Exports

| Format | Route | Produced by |
|---|---|---|
| HTML | `/api/sessions/:id/report.html` | `report.js` |
| PDF | `/api/sessions/:id/report.pdf` | `report.js` → `pdf.js` (headless Chromium `--print-to-pdf`) |
| Word | `/api/sessions/:id/report.docx` | `documents.js` → `docx.js` |
| JSON | `/api/sessions/:id/report.json` | raw record plus evaluation, for integration |
| Certificate | `/api/sessions/:id/certificate.{html,pdf}` | `certificate.js`, only when issued |

Photographs are embedded in the HTML/PDF report as data URIs; other attachments are
listed with type and size.

## CSV import and export

`GET /api/sessions/:id/observations.csv` exports every observation of a report with the
columns `testKey, label, load, tare, indication, indicationAfter, addedLoad, zeroError,
direction, condition, timeMin, remark`. `GET /api/observations-template.csv` returns a
template with one example row per test kind. `POST /api/sessions/:id/observations/import`
takes `{ csv }`, parses it (RFC 4180 quoting), and pushes every row through the same
`addObservation()` path as the form, so validation, warnings, audit and re-evaluation are
identical. Rows that fail validation are reported back with their row number and reason;
the rest are saved.

## Certificate verification

Approval computes a SHA-256 over the instrument, observations, checks, verdicts and the
approval record. The certificate and the report print the hash, the public URL
`/verify/<certificate number>` and a QR code of that URL generated by `src/qr.js` (no
external service). The verify page re-evaluates the stored record and states whether the
certificate is current or withdrawn.

## Security notes

Passwords are hashed with scrypt (N = 16384, 64-byte key, random 16-byte salt) and
compared in constant time. Sessions are random 256-bit tokens in an `HttpOnly`,
`SameSite=Lax` cookie with a 12-hour life, stored server-side and revocable. All
JSON bodies are capped at 12 MB (attachments are base64 in JSON, 8 MB decoded). Eight failed
sign-ins from one address lock that address out for 15 minutes. Responses carry
`X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` headers.
Put the service behind TLS in deployment; see `deployment.md`.
