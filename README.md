# NAWI TestBench

Test report generation for non-automatic weighing instruments, evaluated against OIML R 76.
Built for Smart India Hackathon 2026, problem statement SIH26035 (Department of Consumer
Affairs): the full text is in `docs/problem-statement.md`.

Laboratories granting model approval compile these reports by hand in spreadsheets. Permissible
errors are looked up from printed tables, applied per load band, and transcribed. The process is
slow, inconsistent between centres, and prone to arithmetic errors that can approve an instrument
that should have failed. This records the observations and does the rest: band selection, error
determination, every R 76 criterion, pass or fail, a standardised report, and a certificate.

## Running

```
npm install
npm run seed     # two worked examples: one failing at 20 kg, one certified through the whole battery
npm start        # http://localhost:4178
                 #   /           overview with a working indicator
                 #   /login      sign in (admin / engineer / approver / viewer, password <name>123)
                 #   /app        workbench: dashboard, tests, instruments, new test, users
                 #   /standards  rule-set explorer and MPE calculator
                 #   /verify/<certificate number>   public certificate check
npm test         # 47 cases, all hand-worked from the standard
```

PDF export needs a Chromium-based browser on the machine (`CHROME_PATH` if not auto-detected).
Everything else runs on Node 20 with two dependencies.

## What it does

**Instruments.** Applicant and manufacturer, model, serial, category, indication type, range type,
Max, Min, e, d, tare effects, power supply and voltages, marked temperature limits, software
identification, load cells, interfaces. Table 3 admissibility (n range, Min, d ≤ e), the
rounding-elimination rule and the special-temperature-range rule are checked as you type.
Particulars freeze once the instrument appears in a closed report.

**Tests.** A test is opened against one instrument, one rule set and one purpose (type approval
or verification) and one MPE context (initial or in service). Environmental readings
(temperature, humidity, pressure, supply voltage, frequency) are recorded at the start, during
and at the end, each checked against the instrument's limits.

**Observations for the whole R 76 battery**, each with its own entry form and a live readout that
shows the corrected error against the permissible limit before the point is saved:

| Group | Tests |
|---|---|
| Metrological performance | weighing performance, eccentricity, repeatability, discrimination, tare device, zero-setting accuracy |
| Influence factors | tilting, warm-up time, static temperatures, temperature effect on no-load indication, power-supply voltage variation, damp heat |
| Time and stability | creep, zero return, span stability |
| Construction and markings | descriptive markings (7.1) and functional checks, as checklists |

Impossible readings are refused (load above Max, tare above T, missing second indication,
missing time). Implausible ones are saved with a warning that follows them into the report.
Applicability is decided per instrument (class, electronic, d ≥ 5 mg, class II with e < 1 g).

**Evaluation.** Errors are determined by the changeover-point method, `P = I + ½e − ΔL`, corrected
by the zero error, `Ec = E − E0`, and compared with the MPE for the band the load falls in. Each
test applies its own criterion from the rule set. The report shows what the purpose still
requires and whether the instrument is eligible for a certificate.

**Workflow and roles.** Engineers record and close. Approvers review, return or approve; approval
signs the report with a SHA-256 hash over every observation and verdict, and issues a numbered
certificate of conformity when the full battery passed. Admins manage users. Every action is in
the audit trail. Sessions are `HttpOnly` cookies over scrypt-hashed passwords.

**Repository.** Every test is kept and searchable by reference, certificate, applicant,
manufacturer, model, serial, status, outcome, class, purpose and date, with per-instrument history.

**Exports.** The R 76-2 style report as HTML, PDF and an editable Word document (written
without external libraries), the raw record as JSON, photographs embedded, and the certificate
as HTML and PDF.

## How it works

**The rule set is data, not code.** `rulesets/oiml-r76-2006.json` holds the accuracy classes,
their permitted ranges of `n`, the MPE band tables, the in-service multiplier, the supply-voltage
rules, and one entry per test with its kind, clause, constants, applicability and whether type
approval or verification requires it. A revision of the Recommendation is a new file, and every
report stores the rule set id it was judged under.

**Every verdict is traceable.** Observations are stored raw and immutably, with their warnings and
who recorded them. The evaluation is a pure function of (observations, checks, instrument, rule set,
purpose, context), so a report can be recomputed and audited at any time.

## Layout

```
rulesets/            versioned rule sets, one file per edition
src/engine.js        pure evaluation: classification, MPE, every test kind, validation, completeness
src/db.js            SQLite schema, migrations and access
src/auth.js          scrypt passwords, cookie sessions, roles
src/server.js        HTTP API and pages
src/report.js        HTML report        src/documents.js + src/docx.js   Word report
src/certificate.js   certificate        src/pdf.js                        PDF via headless Chromium
src/seed.js          worked examples
public/              overview, login, workbench, rule-set explorer
                     chart.js draws the MPE envelope; readout.js draws the LCD and the MPE gauge
test/                hand-worked cases from the standard
docs/                problem statement, architecture, calculation methodology, deployment
```

## Provenance

Every constant in `rulesets/oiml-r76-2006.json` carries the clause it comes from and has been
checked against OIML R 76-1, Edition 2006 (E). The report follows the column semantics of
R 76-2, Edition 2007 (E). Electromagnetic disturbance tests (5.4.3, Annex B.3) are recorded from
laboratory test sheets and not computed by this system.
