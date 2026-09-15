# Requirements coverage: SIH26035 against NAWI TestBench

Every requirement quoted from the problem statement, and where the software meets it.

| Requirement (problem statement) | Where it is met |
|---|---|
| Capturing instrument details and technical specifications | Instruments view: applicant, manufacturer, model, serial, category, indication, range type and partial ranges, Max, Min, e, d, tare effects, power supply and voltages, temperature limits, software id, load cells, interfaces. Table 3 admissibility checked live. |
| Recording laboratory and environmental conditions | Environment readings (temperature, humidity, pressure, supply voltage, frequency) at start, during and end of a test, each checked against the instrument's limits; printed in report section 2. |
| Entering observations from various OIML R 76 test procedures | 17 test forms: weighing, eccentricity, repeatability, discrimination, tare, zero-setting, tilting, warm-up, static temperatures, zero drift with temperature, voltage variation, damp heat, creep, zero return, span stability, descriptive-markings and functional checklists. CSV import for bulk entry. |
| Automatically calculating permissible errors and compliance status | Engine: MPE band per load and per partial range, changeover-point correction, zero-error correction, per-test criteria, per-point/test/evaluation verdicts, recomputed on every save. Live readout shows the result before saving. |
| Performing validation checks for entered test data | Hard errors (load above Max + T, tare above T, missing second reading or time, wrong tilt position) refuse the entry; warnings (indication not a multiple of d, ΔL above one e, E₀ above one e, load below Min, out-of-range condition, duplicate label) are stored and printed. |
| Automatically determining pass/fail criteria based on OIML R 76 | Every criterion is data in `rulesets/oiml-r76-2006.json` with its clause; completeness per purpose (type approval or verification); certificate eligibility. |
| Generating standardized digital test reports in printable formats | R 76-2 style report as HTML and PDF (A4), with general information, conditions, summary, every test table with the full arithmetic, remarks, photographs, signatures, digital signature and QR code. |
| Maintaining a digital repository of completed test reports | SQLite repository with instruments, tests, observations, environment, checklists, attachments, users and audit trail; per-instrument history. |
| Providing secure user access with role-based permissions | Viewer, engineer, approver, admin. scrypt-hashed passwords, HttpOnly cookie sessions, login throttling, role checks on every API route, audit log. |
| Supporting future updates whenever OIML recommendations are revised | Versioned rule-set files; each report pins the rule set it was opened under; hand-worked tests guard the constants. |
| User-friendly desktop and/or web-based application | Web application, no build step, runs on any laboratory PC; responsive down to phone width. |
| Digital data entry forms for all applicable OIML R 76 tests | One form per test with the prescribed loads, times, positions or conditions suggested. |
| Standardized test report generation in PDF and editable formats (MS Word) | PDF via headless Chromium; DOCX via an in-house OOXML writer; JSON for integration. |
| Instrument-wise test history and report repository | Instrument detail panel lists every test on the instrument with status, outcome and certificate. |
| Dashboard for monitoring testing activities and report status | Dashboard with counts by status, outcomes, activity by month and class, recent tests. |
| Search and retrieval facility for previously generated reports | Search by reference, certificate, applicant, manufacturer, model, serial, application reference; filters by status, outcome, class, purpose and date. |
| Technical documentation: architecture, calculation methodology, deployment | `docs/architecture.md`, `docs/calculation-methodology.md`, `docs/deployment.md`, user guide PDF. |
| Entry of manufacturer details, instrument specifications, model information and technical parameters | Instrument register (above). |
| Compliance determination as per OIML R-76 | Engine (above); the standard page shows every rule the engine applies. |
| Automatic validation of input data and related calculations | Validation (above); calculations shown column by column so they can be checked by hand. |
| Auto-population of laboratory and instrument details in reports | Report and certificate are rendered from the stored instrument and test records. |
| Attachment of photographs and supporting documents | Drag-and-drop upload of images, PDFs, text, Word and Excel files; photographs embedded in the report. |
| Digital signatures (optional) | Approval signs the report with a SHA-256 over the record; printed with a QR code to the public verification page. |
| Export to PDF and editable formats | PDF, DOCX, JSON, CSV. |
| Dashboard for test report management (completed, in process, history access) | Dashboard readouts and Tests view filters: in progress, awaiting approval, approved; history per instrument. |
