'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const engine = require('./engine');
const store = require('./db');
const report = require('./report');
const certificate = require('./certificate');
const documents = require('./documents');
const docx = require('./docx');
const pdf = require('./pdf');
const auth = require('./auth');

const qr = require('./qr');
const ai = require('./ai');
const fs = require('fs');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '12mb' }));
app.use(auth.attachUser);
auth.seedUsers();

// Login throttling: after 8 failures from one address, wait 15 minutes.
const LOGIN_FAILS = new Map();
function loginAllowed(ip) {
  const rec = LOGIN_FAILS.get(ip);
  if (!rec) return true;
  if (rec.until && rec.until > Date.now()) return false;
  if (rec.until) LOGIN_FAILS.delete(ip);
  return true;
}
function loginFailed(ip) {
  const rec = LOGIN_FAILS.get(ip) || { count: 0, first: Date.now() };
  if (Date.now() - rec.first > 15 * 60 * 1000) { rec.count = 0; rec.first = Date.now(); }
  rec.count += 1;
  if (rec.count >= 8) rec.until = Date.now() + 15 * 60 * 1000;
  LOGIN_FAILS.set(ip, rec);
}

const pub = (file) => path.join(__dirname, '..', 'public', file);

/* ---- pages ---------------------------------------------------------------- */

app.get('/login', (req, res) => (req.user ? res.redirect('/app') : res.sendFile(pub('login.html'))));
app.get('/app', (req, res) => (req.user ? res.sendFile(pub('app.html')) : res.redirect('/login')));
app.get('/standards', (req, res) => res.sendFile(pub('standards.html')));
app.get('/guide.pdf', (req, res) => res.sendFile(path.join(__dirname, '..', 'docs', 'NAWI-TestBench-User-Guide.pdf')));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ---- helpers -------------------------------------------------------------- */

const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.catch === 'function') out.catch((err) => fail(res, err));
  } catch (err) {
    fail(res, err);
  }
};

function fail(res, err) {
  const status = err.status || (err.code === 'NO_BROWSER' ? 503 : 400);
  res.status(status).json({ error: err.message });
}

const number = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const text = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

function require_(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === '' || body[f] === null);
  if (missing.length) throw new Error(`missing required field(s): ${missing.join(', ')}`);
}

const canWrite = auth.requireRole('engineer');
const canApprove = auth.requireRole('approver');
const isAdmin = auth.requireRole('admin');
const signedIn = auth.requireRole('viewer');

function actor(req) {
  return req.user ? req.user.name : null;
}

function log(req, sessionId, action, detail) {
  store.audit.log({ sessionId, userId: req.user?.id ?? null, actor: actor(req), action, detail: detail ?? null });
}

function loadSession(id) {
  const session = store.sessions.get(id);
  if (!session) { const e = new Error('no such report'); e.status = 404; throw e; }
  const instrument = store.instruments.get(session.instrumentId);
  const ruleset = engine.loadRuleset(session.rulesetId);
  const observations = store.observations.forSession(id);
  const checks = store.checks.forSession(id);
  const evaluation = engine.evaluateSession({
    ruleset, instrument, context: session.context, purpose: session.purpose,
    zeroError: session.zeroError, observations, checks
  });
  return { session, instrument, ruleset, observations, checks, evaluation,
           environment: store.environment.forSession(id), attachments: store.attachments.forSession(id),
           audit: store.audit.forSession(id) };
}

function mustBeOpen(session) {
  if (session.status !== 'draft') throw new Error(`this report is ${session.status}; reopen it before making changes`);
}

// The signature binds the approval to exactly what was approved: instrument
// particulars, every observation and check, every verdict, and who approved.
function signatureFor({ session, instrument, observations, checks, evaluation, approvedBy, approvedAt }) {
  const payload = {
    reference: session.reference, instrument, observations, checks,
    verdicts: Object.fromEntries(Object.entries(evaluation.results).map(([k, t]) => [k, t.verdict])),
    overall: evaluation.overall, approvedBy, approvedAt
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

/* ---- auth ----------------------------------------------------------------- */

app.post('/api/login', wrap((req, res) => {
  if (!loginAllowed(req.ip)) { const e = new Error('too many failed sign-in attempts; try again in 15 minutes'); e.status = 429; throw e; }
  const result = auth.login(req.body.username, req.body.password);
  if (!result) { loginFailed(req.ip); const e = new Error('incorrect username or password'); e.status = 401; throw e; }
  LOGIN_FAILS.delete(req.ip);
  auth.setCookie(res, result.token);
  res.json(result.user);
}));

app.post('/api/logout', wrap((req, res) => {
  if (req.token) store.tokens.revoke(req.token);
  auth.clearCookie(res);
  res.json({ ok: true });
}));

app.get('/api/me', wrap((req, res) => {
  if (!req.user) return res.status(401).json({ error: 'not signed in' });
  res.json({ ...req.user, roles: auth.ROLES });
}));

/* ---- users (admin) -------------------------------------------------------- */

app.get('/api/users', isAdmin, wrap((req, res) => res.json(store.users.all())));

app.post('/api/users', isAdmin, wrap((req, res) => {
  require_(req.body, ['username', 'name', 'role', 'password']);
  if (!auth.ROLES.includes(req.body.role)) throw new Error(`role must be one of ${auth.ROLES.join(', ')}`);
  if (String(req.body.password).length < 8) throw new Error('password must be at least 8 characters');
  const username = String(req.body.username).trim().toLowerCase();
  if (store.users.byUsername(username)) throw new Error('that username is taken');
  const user = store.users.create({ username, name: req.body.name, role: req.body.role, ...auth.hashPassword(req.body.password) });
  log(req, null, 'user.create', `${username} as ${req.body.role}`);
  res.json(user);
}));

app.patch('/api/users/:id', isAdmin, wrap((req, res) => {
  const id = Number(req.params.id);
  if (!store.users.get(id)) throw new Error('no such user');
  if (req.body.role !== undefined) {
    if (!auth.ROLES.includes(req.body.role)) throw new Error('unknown role');
    store.users.setRole(id, req.body.role);
  }
  if (req.body.active !== undefined) {
    if (id === req.user.id && !req.body.active) throw new Error('you cannot deactivate your own account');
    store.users.setActive(id, Boolean(req.body.active));
  }
  if (req.body.password) {
    if (String(req.body.password).length < 8) throw new Error('password must be at least 8 characters');
    const { hash, salt } = auth.hashPassword(req.body.password);
    store.users.setPassword(id, hash, salt);
  }
  log(req, null, 'user.update', `#${id}`);
  res.json(store.users.get(id));
}));

app.post('/api/me/password', signedIn, wrap((req, res) => {
  require_(req.body, ['current', 'password']);
  const user = store.users.byUsername(req.user.username);
  if (!auth.verifyPassword(req.body.current, user.hash, user.salt)) throw new Error('current password is incorrect');
  if (String(req.body.password).length < 8) throw new Error('password must be at least 8 characters');
  const { hash, salt } = auth.hashPassword(req.body.password);
  store.users.setPassword(user.id, hash, salt);
  res.json({ ok: true });
}));

/* ---- reference data ------------------------------------------------------- */

app.get('/api/rulesets', wrap((req, res) => res.json(engine.listRulesets())));

// QR code as SVG for any short text; relative paths are resolved against this host.
app.get('/api/qr.svg', wrap((req, res) => {
  let t = String(req.query.text || '');
  if (!t || t.length > 200) throw new Error('text is required and must be at most 200 characters');
  if (t.startsWith('/')) t = `${baseUrl(req)}${t}`;
  res.type('image/svg+xml').setHeader('Cache-Control', 'public, max-age=3600').send(qr.svg(t, { size: 160, dark: '#0b1220' }));
}));
app.get('/api/rulesets/:id', wrap((req, res) => res.json(engine.loadRuleset(req.params.id))));

app.get('/api/stats', signedIn, wrap((req, res) => {
  const stats = store.stats();
  const all = store.sessions.all({}).map((s) => ({ ...s, overall: loadSession(s.id).evaluation.overall }));
  const outcomes = { pass: 0, fail: 0, incomplete: 0 };
  for (const s of all) outcomes[s.overall] = (outcomes[s.overall] || 0) + 1;
  res.json({ ...stats, awaitingApproval: stats.complete, outcomes, recent: all.slice(0, 8) });
}));

/* ---- instruments ---------------------------------------------------------- */

function instrumentFromBody(body) {
  require_(body, ['manufacturer', 'model', 'serial', 'accuracyClass', 'max', 'min', 'e', 'd']);
  const i = {
    manufacturer: text(body.manufacturer), model: text(body.model), serial: text(body.serial),
    accuracyClass: body.accuracyClass, max: Number(body.max), min: Number(body.min), e: Number(body.e), d: Number(body.d),
    units: body.units === 'kg' ? 'kg' : 'g',
    applicant: text(body.applicant), applicantAddress: text(body.applicantAddress), manufacturerAddress: text(body.manufacturerAddress),
    instrumentType: text(body.instrumentType), indicatingType: text(body.indicatingType) || 'digital',
    electronic: body.electronic === undefined ? 1 : (body.electronic === '0' || body.electronic === false || body.electronic === 0 ? 0 : 1),
    rangeType: text(body.rangeType) || 'single', powerSupply: text(body.powerSupply) || 'mains',
    nominalVoltage: number(body.nominalVoltage), minOperatingVoltage: number(body.minOperatingVoltage), frequency: number(body.frequency),
    tempMin: number(body.tempMin), tempMax: number(body.tempMax),
    softwareVersion: text(body.softwareVersion), loadCell: text(body.loadCell), interfaces: text(body.interfaces),
    tareMaxAdditive: number(body.tareMaxAdditive), tareMaxSubtractive: number(body.tareMaxSubtractive),
    limitingTilt: text(body.limitingTilt), notes: text(body.notes)
  };
  // Partial weighing ranges for multi-interval / multiple-range instruments.
  let ranges = body.ranges;
  if (typeof ranges === 'string') { try { ranges = JSON.parse(ranges); } catch { throw new Error('ranges must be a JSON array of { e, max, d }'); } }
  if (i.rangeType !== 'single' && Array.isArray(ranges)) {
    ranges = ranges.map((r) => ({ e: Number(r.e), max: Number(r.max), d: r.d === '' || r.d === undefined || r.d === null ? Number(r.e) : Number(r.d) }))
      .filter((r) => r.e > 0 || r.max > 0);
    if (ranges.length < 2) throw new Error('a multi-interval or multiple-range instrument needs at least two partial ranges');
    if (ranges.length > 3) throw new Error('at most three partial ranges are supported');
    for (const [k, r] of ranges.entries()) if (!(r.e > 0 && r.max > 0 && r.d > 0)) throw new Error(`range ${k + 1}: e, Max and d must be positive numbers`);
    ranges.sort((a, b) => a.max - b.max);
    for (let k = 1; k < ranges.length; k++) {
      if (ranges[k].max <= ranges[k - 1].max) throw new Error('partial ranges must have increasing Max');
      if (ranges[k].e <= ranges[k - 1].e) throw new Error('partial ranges must have increasing e');
    }
    i.ranges = JSON.stringify(ranges);
    i.max = ranges[ranges.length - 1].max; i.e = ranges[0].e; i.d = ranges[0].d;
  } else {
    i.ranges = null; i.rangeType = 'single';
  }
  for (const k of ['max', 'min', 'e', 'd']) if (!(i[k] > 0)) throw new Error(`${k} must be a positive number`);
  if (i.min >= i.max) throw new Error('Min must be smaller than Max');
  if ((i.tempMin === null) !== (i.tempMax === null)) throw new Error('give both temperature limits or neither');
  if (i.tempMin !== null && i.tempMin >= i.tempMax) throw new Error('lower temperature limit must be below the upper limit');
  return i;
}

app.get('/api/instruments', signedIn, wrap((req, res) => res.json(store.instruments.all(req.query.q))));

app.post('/api/instruments', canWrite, wrap((req, res) => {
  const i = instrumentFromBody(req.body);
  i.createdBy = actor(req);
  const ruleset = engine.loadRuleset(req.body.rulesetId || 'oiml-r76-2006');
  const check = engine.classCheck(ruleset, i);
  const instrument = store.instruments.create(i);
  log(req, null, 'instrument.create', `${i.manufacturer} ${i.model} ${i.serial}`);
  res.json({ instrument, classification: check, supply: engine.supplyLimits(ruleset, instrument) });
}));

app.put('/api/instruments/:id', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  if (!store.instruments.get(id)) throw new Error('no such instrument');
  const locked = store.sessions.forInstrument(id).some((s) => s.status !== 'draft');
  if (locked) throw new Error('this instrument appears in a closed or approved report; its particulars are frozen');
  const i = instrumentFromBody(req.body);
  const instrument = store.instruments.update(id, i);
  const ruleset = engine.loadRuleset(req.body.rulesetId || 'oiml-r76-2006');
  log(req, null, 'instrument.update', `#${id}`);
  res.json({ instrument, classification: engine.classCheck(ruleset, instrument) });
}));

app.get('/api/instruments/:id', signedIn, wrap((req, res) => {
  const instrument = store.instruments.get(Number(req.params.id));
  if (!instrument) return res.status(404).json({ error: 'no such instrument' });
  const ruleset = engine.loadRuleset('oiml-r76-2006');
  const sessions = store.sessions.forInstrument(instrument.id).map((s) => ({ ...s, overall: loadSession(s.id).evaluation.overall }));
  res.json({ instrument, sessions, classification: engine.classCheck(ruleset, instrument), supply: engine.supplyLimits(ruleset, instrument) });
}));

app.get('/api/instrument-preview', signedIn, wrap((req, res) => {
  // Class check for a form in progress, before anything is saved.
  const ruleset = engine.loadRuleset(req.query.rulesetId || 'oiml-r76-2006');
  const i = { accuracyClass: req.query.accuracyClass, max: Number(req.query.max), min: Number(req.query.min),
              e: Number(req.query.e), d: Number(req.query.d), units: req.query.units || 'g',
              tempMin: number(req.query.tempMin), tempMax: number(req.query.tempMax), ranges: req.query.ranges || null };
  const ranges = engine.rangesOf(i);
  if (ranges.length > 1) { i.max = ranges[ranges.length - 1].max; i.e = ranges[0].e; i.d = ranges[0].d; }
  res.json({ ...engine.classCheck(ruleset, i), boundaries: engine.bandBoundaries(ruleset, i) });
}));

/* ---- sessions ------------------------------------------------------------- */

app.get('/api/sessions', signedIn, wrap((req, res) => {
  const filter = {
    q: text(req.query.q), status: text(req.query.status), accuracyClass: text(req.query.accuracyClass),
    purpose: text(req.query.purpose), instrumentId: number(req.query.instrumentId),
    from: text(req.query.from), to: text(req.query.to)
  };
  let rows = store.sessions.all(filter).map((s) => {
    const { evaluation } = loadSession(s.id);
    return { ...s, overall: evaluation.overall, certificateEligible: evaluation.certificateEligible,
             progress: evaluation.completeness.done.length + '/' + evaluation.completeness.required.length };
  });
  if (req.query.outcome) rows = rows.filter((r) => r.overall === req.query.outcome);
  res.json(rows);
}));

app.post('/api/sessions', canWrite, wrap((req, res) => {
  require_(req.body, ['instrumentId', 'laboratory', 'technician']);
  const instrument = store.instruments.get(Number(req.body.instrumentId));
  if (!instrument) throw new Error('no such instrument');
  const session = store.sessions.create({
    instrumentId: instrument.id,
    rulesetId: req.body.rulesetId || 'oiml-r76-2006',
    context: req.body.context === 'in-service' ? 'in-service' : 'initial',
    purpose: req.body.purpose === 'verification' ? 'verification' : 'type-approval',
    zeroError: Number(req.body.zeroError || 0),
    laboratory: text(req.body.laboratory),
    technician: text(req.body.technician),
    temperature: number(req.body.temperature),
    humidity: number(req.body.humidity),
    remarks: text(req.body.remarks),
    applicationRef: text(req.body.applicationRef),
    testDate: text(req.body.testDate),
    createdBy: actor(req)
  });
  const env = ['temperature', 'humidity', 'pressure', 'voltage', 'frequency'].some((k) => number(req.body[k]) !== null);
  if (env) {
    store.environment.add({ sessionId: session.id, stage: 'Start of test',
      temperature: number(req.body.temperature), humidity: number(req.body.humidity), pressure: number(req.body.pressure),
      voltage: number(req.body.voltage), frequency: number(req.body.frequency) });
  }
  log(req, session.id, 'report.open', `${session.reference} for ${instrument.manufacturer} ${instrument.model}`);
  res.json(session);
}));

app.get('/api/sessions/:id', signedIn, wrap((req, res) => res.json(loadSession(Number(req.params.id)))));

app.patch('/api/sessions/:id', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session) throw new Error('no such report');
  mustBeOpen(session);
  const fields = {};
  for (const k of ['laboratory', 'technician', 'remarks', 'applicationRef', 'testDate']) if (req.body[k] !== undefined) fields[k] = text(req.body[k]);
  if (req.body.zeroError !== undefined) fields.zeroError = Number(req.body.zeroError || 0);
  log(req, id, 'report.edit', Object.keys(fields).join(', '));
  res.json(store.sessions.update(id, fields));
}));

/* ---- observations --------------------------------------------------------- */

// Validate and store one observation. Shared by the form route and CSV import.
function addObservation(req, session, body) {
  require_(body, ['testKey', 'label', 'load', 'indication']);
  const ruleset = engine.loadRuleset(session.rulesetId);
  const spec = ruleset.tests[body.testKey];
  if (!spec) throw new Error(`unknown test: ${body.testKey}`);
  if (spec.kind === 'checklist') throw new Error('checklist items are recorded through /checks');
  const instrument = store.instruments.get(session.instrumentId);
  const na = engine.applicability(spec, instrument);
  if (!na.applicable) throw new Error(`${spec.label} does not apply to this instrument: ${na.reason}`);
  const obs = {
    sessionId: session.id,
    testKey: body.testKey,
    label: text(body.label),
    load: Number(body.load),
    tare: number(body.tare),
    indication: Number(body.indication),
    indicationAfter: number(body.indicationAfter),
    addedLoad: number(body.addedLoad),
    zeroError: number(body.zeroError),
    direction: body.direction === 'decreasing' ? 'decreasing' : 'increasing',
    condition: text(body.condition),
    timeMin: number(body.timeMin),
    remark: text(body.remark),
    recordedBy: actor(req)
  };
  const existing = store.observations.forSession(session.id).filter((o) => o.testKey === obs.testKey);
  const check = engine.validateObservation({ ruleset, instrument, spec: { ...spec, key: obs.testKey }, obs, existing, purpose: session.purpose });
  if (!check.ok) { const e = new Error(check.errors.join('; ')); e.status = 422; throw e; }
  obs.warnings = check.warnings;
  const saved = store.observations.add(obs);
  log(req, session.id, 'observation.add', `${spec.label}: ${obs.label}`);
  return { observation: saved, warnings: check.warnings };
}

app.post('/api/sessions/:id/observations', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session) throw new Error('no such report');
  mustBeOpen(session);
  const { observation, warnings } = addObservation(req, session, req.body);
  const { evaluation } = loadSession(id);
  res.json({ observation, warnings, evaluation });
}));

/* ---- CSV import and export ------------------------------------------------ */

const CSV_COLUMNS = ['testKey', 'label', 'load', 'tare', 'indication', 'indicationAfter', 'addedLoad', 'zeroError', 'direction', 'condition', 'timeMin', 'remark'];
const csvCell = (v) => { const t = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

function parseCsv(textIn) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const src = String(textIn).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

app.get('/api/observations-template.csv', wrap((req, res) => {
  const example = [
    ['weighing', 'Min', 100, '', 100, '', 1.5, '', 'increasing', '', '', ''],
    ['weighing', '10 kg', 10000, '', 10000, '', 2.0, '', 'increasing', '', '', ''],
    ['eccentricity', 'Segment 1', 10000, '', 10005, '', '', '', 'increasing', '', '', ''],
    ['repeatability', 'Run 1', 15000, '', 15000, '', 2.5, '', 'increasing', '', '', ''],
    ['discrimination', 'At 10 kg', 10000, '', 10000, 10005, '', '', '', '', '', ''],
    ['tare', 'Net 8 kg on 2 kg tare', 10000, 2000, 8000, '', 2.0, '', 'increasing', '', '', ''],
    ['zero', 'After zero set', 0, '', 0, '', '', '', '', '', '', ''],
    ['temperature', '15 kg', 15000, '', 15000, '', 2.5, 0, 'increasing', '40', '', 'chamber at 40 °C'],
    ['warmup', 'Near Max', 15000, '', 15000, '', 2.0, 0.5, '', '', 5, ''],
    ['creep', 't = 15 min', 15000, '', 15000, '', '', '', '', '', 15, ''],
    ['zeroReturn', 'After 30 min at Max', 15000, '', 0, 0, '', '', '', '', '', ''],
    ['tilt', 'Max', 15000, '', 15000, '', 2.0, 0, '', 'Tilted lengthwise', '', '']
  ];
  const body = [CSV_COLUMNS, ...example].map((r) => r.map(csvCell).join(',')).join('\n');
  res.type('text/csv').setHeader('Content-Disposition', 'attachment; filename="nawi-observations-template.csv"').send(body + '\n');
}));

app.get('/api/sessions/:id/observations.csv', signedIn, wrap((req, res) => {
  const { session, observations } = loadSession(Number(req.params.id));
  const body = [CSV_COLUMNS, ...observations.map((o) => CSV_COLUMNS.map((c) => o[c]))].map((r) => r.map(csvCell).join(',')).join('\n');
  res.type('text/csv').setHeader('Content-Disposition', `attachment; filename="${session.reference.replace(/\//g, '-')}-observations.csv"`).send(body + '\n');
}));

app.post('/api/sessions/:id/observations/import', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session) throw new Error('no such report');
  mustBeOpen(session);
  require_(req.body, ['csv']);
  const rows = parseCsv(req.body.csv);
  if (rows.length < 2) throw new Error('the CSV needs a header row and at least one observation');
  const header = rows[0].map((h) => h.trim());
  const unknown = header.filter((h) => !CSV_COLUMNS.includes(h));
  if (unknown.length) throw new Error(`unknown column(s): ${unknown.join(', ')}. Download the template for the accepted columns.`);
  for (const must of ['testKey', 'label', 'load', 'indication']) if (!header.includes(must)) throw new Error(`missing column: ${must}`);
  const added = []; const rejected = []; const warned = [];
  for (let r = 1; r < rows.length; r++) {
    const body = Object.fromEntries(header.map((h, i) => [h, (rows[r][i] ?? '').trim()]));
    try {
      const out = addObservation(req, session, body);
      added.push(out.observation.id);
      if (out.warnings.length) warned.push({ row: r + 1, label: body.label, warnings: out.warnings });
    } catch (err) { rejected.push({ row: r + 1, label: body.label, error: err.message }); }
  }
  log(req, id, 'observation.import', `${added.length} added, ${rejected.length} rejected`);
  res.json({ added: added.length, rejected, warned, evaluation: loadSession(id).evaluation });
}));

app.delete('/api/observations/:id', canWrite, wrap((req, res) => {
  const obs = store.observations.get(Number(req.params.id));
  if (!obs) throw new Error('no such observation');
  mustBeOpen(store.sessions.get(obs.sessionId));
  store.observations.remove(obs.id);
  log(req, obs.sessionId, 'observation.remove', `${obs.testKey}: ${obs.label}`);
  res.json({ ok: true });
}));

/* ---- environment ---------------------------------------------------------- */

app.post('/api/sessions/:id/environment', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session) throw new Error('no such report');
  mustBeOpen(session);
  require_(req.body, ['stage']);
  const row = store.environment.add({
    sessionId: id, stage: text(req.body.stage),
    temperature: number(req.body.temperature), humidity: number(req.body.humidity), pressure: number(req.body.pressure),
    voltage: number(req.body.voltage), frequency: number(req.body.frequency), note: text(req.body.note)
  });
  const warnings = [];
  const instrument = store.instruments.get(session.instrumentId);
  const range = engine.temperatureRange(engine.loadRuleset(session.rulesetId), instrument);
  if (row.temperature !== null && (row.temperature < range.min || row.temperature > range.max))
    warnings.push(`${row.temperature} °C is outside the instrument's working range ${range.min} / ${range.max} °C`);
  if (row.humidity !== null && (row.humidity < 0 || row.humidity > 100)) warnings.push('relative humidity must be between 0 and 100 %');
  const supply = engine.supplyLimits(engine.loadRuleset(session.rulesetId), instrument);
  if (row.voltage !== null && supply && supply.lower !== null && supply.upper !== null && (row.voltage < supply.lower || row.voltage > supply.upper))
    warnings.push(`${row.voltage} V is outside the instrument's supply limits ${supply.lower}–${supply.upper} V`);
  log(req, id, 'environment.add', row.stage);
  res.json({ reading: row, warnings });
}));

app.delete('/api/environment/:id', canWrite, wrap((req, res) => {
  store.environment.remove(Number(req.params.id));
  res.json({ ok: true });
}));

/* ---- checklists ----------------------------------------------------------- */

app.put('/api/sessions/:id/checks', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session) throw new Error('no such report');
  mustBeOpen(session);
  const ruleset = engine.loadRuleset(session.rulesetId);
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  for (const it of items) {
    const spec = ruleset.tests[it.testKey];
    if (!spec || spec.kind !== 'checklist') throw new Error(`unknown checklist: ${it.testKey}`);
    if (!spec.items.some((x) => x.key === it.itemKey)) throw new Error(`unknown item ${it.itemKey} in ${it.testKey}`);
    if (it.result === null || it.result === '' || it.result === undefined) { store.checks.clear(id, it.testKey, it.itemKey); continue; }
    if (!['yes', 'no', 'na'].includes(it.result)) throw new Error('result must be yes, no or na');
    store.checks.set({ sessionId: id, testKey: it.testKey, itemKey: it.itemKey, result: it.result, remark: text(it.remark) });
  }
  log(req, id, 'checklist.update', `${items.length} item(s)`);
  res.json(loadSession(id).evaluation);
}));

/* ---- attachments ---------------------------------------------------------- */

const ATTACH_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

app.post('/api/sessions/:id/attachments', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session) throw new Error('no such report');
  mustBeOpen(session);
  require_(req.body, ['filename', 'mime', 'data']);
  if (!ATTACH_TYPES.has(req.body.mime)) throw new Error(`unsupported file type ${req.body.mime}; images, PDF, text, Word and Excel files are accepted`);
  const data = Buffer.from(String(req.body.data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (data.length === 0) throw new Error('empty file');
  if (data.length > 8 * 1024 * 1024) throw new Error('file is larger than 8 MB');
  const meta = store.attachments.add({ sessionId: id, filename: text(req.body.filename), mime: req.body.mime, size: data.length,
                                       caption: text(req.body.caption), data, uploadedBy: actor(req) });
  log(req, id, 'attachment.add', meta.filename);
  res.json(meta);
}));

app.get('/api/attachments/:id', signedIn, wrap((req, res) => {
  const a = store.attachments.get(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'no such attachment' });
  res.type(a.mime).setHeader('Content-Disposition', `inline; filename="${a.filename.replace(/"/g, '')}"`).send(a.data);
}));

app.delete('/api/attachments/:id', canWrite, wrap((req, res) => {
  const a = store.attachments.meta(Number(req.params.id));
  if (!a) throw new Error('no such attachment');
  mustBeOpen(store.sessions.get(a.sessionId));
  store.attachments.remove(a.id);
  log(req, a.sessionId, 'attachment.remove', a.filename);
  res.json({ ok: true });
}));

/* ---- workflow ------------------------------------------------------------- */

app.post('/api/sessions/:id/close', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const { session, evaluation } = loadSession(id);
  if (session.status !== 'draft') throw new Error('report is already closed');
  if (evaluation.overall === 'incomplete' && !req.body.force) {
    const e = new Error('the evaluation is incomplete; record the outstanding tests or close with force to file it as incomplete');
    e.status = 409; throw e;
  }
  log(req, id, 'report.close', `outcome ${evaluation.overall}`);
  res.json(store.sessions.close(id, evaluation.overall));
}));

app.post('/api/sessions/:id/reopen', canWrite, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session) throw new Error('no such report');
  if (session.status === 'approved' && !auth.atLeast(req.user.role, 'approver'))
    throw new Error('an approved report can only be reopened by an approver');
  log(req, id, 'report.reopen', session.status === 'approved' ? 'approval and certificate withdrawn' : null);
  res.json(store.sessions.reopen(id));
}));

app.post('/api/sessions/:id/approve', canApprove, wrap((req, res) => {
  const id = Number(req.params.id);
  const bundle = loadSession(id);
  const { session, evaluation } = bundle;
  if (session.status !== 'complete') throw new Error('only a closed report can be approved');
  if (evaluation.overall === 'incomplete') throw new Error('an incomplete evaluation cannot be approved');
  const approvedAt = new Date().toISOString();
  const approvedBy = actor(req);
  const signature = signatureFor({ ...bundle, approvedBy, approvedAt });
  const certificateNo = evaluation.certificateEligible ? store.sessions.nextCertificateNo() : null;
  const updated = store.sessions.approve(id, { approvedBy, approvalNote: text(req.body.note), certificateNo, signature });
  log(req, id, 'report.approve', certificateNo ? `certificate ${certificateNo} issued` : `approved as ${evaluation.overall}, no certificate`);
  res.json({ session: updated, certificateNo, signature, certificateEligible: evaluation.certificateEligible });
}));

app.post('/api/sessions/:id/return', canApprove, wrap((req, res) => {
  const id = Number(req.params.id);
  const session = store.sessions.get(id);
  if (!session || session.status !== 'complete') throw new Error('only a closed report awaiting approval can be returned');
  log(req, id, 'report.return', text(req.body.note));
  res.json(store.sessions.reject(id, { approvedBy: actor(req), approvalNote: text(req.body.note) }));
}));

/* ---- documents ------------------------------------------------------------ */

function reportBundle(req, id) {
  const bundle = loadSession(id);
  bundle.attachments = store.attachments.withData(id);
  bundle.generatedAt = new Date().toISOString();
  bundle.verifyUrl = bundle.session.certificateNo ? `${baseUrl(req)}/verify/${encodeURIComponent(bundle.session.certificateNo)}` : null;
  return bundle;
}

app.get('/api/sessions/:id/report.html', signedIn, wrap((req, res) => {
  res.type('html').send(report.render(reportBundle(req, Number(req.params.id))));
}));

app.get('/api/sessions/:id/report.pdf', signedIn, wrap(async (req, res) => {
  const bundle = reportBundle(req, Number(req.params.id));
  const buf = await pdf.fromHtml(report.render(bundle));
  res.type('pdf').setHeader('Content-Disposition', `attachment; filename="${bundle.session.reference.replace(/\//g, '-')}.pdf"`).send(buf);
}));

app.get('/api/sessions/:id/report.docx', signedIn, wrap((req, res) => {
  const bundle = reportBundle(req, Number(req.params.id));
  const buf = docx.build(documents.reportBlocks(bundle));
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    .setHeader('Content-Disposition', `attachment; filename="${bundle.session.reference.replace(/\//g, '-')}.docx"`).send(buf);
}));

app.get('/api/sessions/:id/report.json', signedIn, wrap((req, res) => {
  const { session, instrument, ruleset, observations, checks, environment, evaluation } = loadSession(Number(req.params.id));
  res.json({ session, instrument, ruleset: { id: ruleset.id, label: ruleset.label }, observations, checks, environment, evaluation });
}));

function certificateBundle(req, id) {
  const bundle = reportBundle(req, id);
  if (!bundle.session.certificateNo) { const e = new Error('no certificate has been issued for this report'); e.status = 404; throw e; }
  return bundle;
}

app.get('/api/sessions/:id/certificate.html', signedIn, wrap((req, res) => {
  res.type('html').send(certificate.render(certificateBundle(req, Number(req.params.id))));
}));

app.get('/api/sessions/:id/certificate.pdf', signedIn, wrap(async (req, res) => {
  const bundle = certificateBundle(req, Number(req.params.id));
  const buf = await pdf.fromHtml(certificate.render(bundle));
  res.type('pdf').setHeader('Content-Disposition', `attachment; filename="${bundle.session.certificateNo.replace(/\//g, '-')}.pdf"`).send(buf);
}));

// Public: anyone holding a certificate can confirm it is genuine and current.
app.get('/verify/:certNo', wrap((req, res) => {
  const row = store.db.prepare('SELECT id FROM sessions WHERE certificateNo = ?').get(req.params.certNo);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const page = (title, body, ok, qrSvg = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/site.css"><style>.v{max-width:720px;margin:60px auto;padding:0 24px}.v .card{padding:32px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:start}.st{font-family:var(--serif);font-size:30px;color:${ok ? 'var(--pass)' : 'var(--fail)'};margin-bottom:12px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px;color:var(--ink-2)}.brand img{width:40px}.brand b{font-family:var(--serif);font-size:22px;color:var(--ink)}@media(max-width:600px){.v .card{grid-template-columns:1fr}}</style></head>
<body><div class="v"><div class="brand"><img src="/brand/mark.svg" alt=""><b>NAWI TestBench</b><span>certificate verification</span></div><div class="card"><div><div class="st">${esc(title)}</div>${body}</div>${qrSvg}</div></div></body></html>`;
  if (!row) return res.status(404).type('html').send(page('No such certificate', `<p>No certificate numbered <b>${esc(req.params.certNo)}</b> has been issued by this system.</p>`, false));
  const { session, instrument, evaluation } = loadSession(row.id);
  const current = session.status === 'approved';
  res.type('html').send(page(current ? 'Certificate is valid' : 'Certificate withdrawn',
    `<div class="kv"><span class="k">Certificate</span><span>${esc(session.certificateNo)}</span></div>
     <div class="kv"><span class="k">Report</span><span>${esc(session.reference)}</span></div>
     <div class="kv"><span class="k">Instrument</span><span>${esc(instrument.manufacturer)} ${esc(instrument.model)}, serial ${esc(instrument.serial)}</span></div>
     <div class="kv"><span class="k">Class</span><span>${esc(instrument.accuracyClass)} · Max ${esc(instrument.max)} ${esc(instrument.units)} · e = ${esc(instrument.e)} ${esc(instrument.units)}</span></div>
     <div class="kv"><span class="k">Outcome</span><span>${esc(evaluation.overall)}</span></div>
     <div class="kv"><span class="k">Approved</span><span>${esc(session.approvedBy)} · ${session.approvedAt ? new Date(session.approvedAt).toLocaleDateString('en-IN', { dateStyle: 'long' }) : ''}</span></div>
     <div class="kv"><span class="k">Signature</span><span style="word-break:break-all;font-size:13px">${esc(session.signature)}</span></div>`, current,
    qr.svg(`${baseUrl(req)}/verify/${encodeURIComponent(session.certificateNo)}`, { size: 140, title: 'QR code of this verification address' })));
}));

/* ---- AI assistance -------------------------------------------------------- */

const AI_CALLS = new Map();
function aiAllowed(userId) {
  const now = Date.now(); const rec = AI_CALLS.get(userId) || [];
  const recent = rec.filter((t) => now - t < 60 * 1000);
  if (recent.length >= 20) return false;
  recent.push(now); AI_CALLS.set(userId, recent); return true;
}
const aiGate = (req, res, next) => {
  if (!ai.status().enabled) return res.status(503).json({ error: 'AI assistance is not configured on this server. Set ANTHROPIC_API_KEY or GEMINI_API_KEY and restart.' });
  if (!aiAllowed(req.user.id)) return res.status(429).json({ error: 'too many assistant requests; wait a minute' });
  next();
};

app.get('/api/ai/status', signedIn, wrap((req, res) => res.json(ai.status())));

app.post('/api/ai/plate', canWrite, aiGate, wrap(async (req, res) => {
  require_(req.body, ['image']);
  const m = String(req.body.image).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error('send the photograph as a JPEG, PNG or WebP data URL');
  if (m[2].length > 8 * 1024 * 1024 * 1.37) throw new Error('photograph is larger than 8 MB');
  const fields = await ai.readPlate({ mime: m[1], data: m[2] });
  log(req, null, 'ai.plate', `${fields.manufacturer || '?'} ${fields.model || '?'}`);
  res.json({ fields });
}));

app.post('/api/ai/sessions/:id/summary', canWrite, aiGate, wrap(async (req, res) => {
  const bundle = loadSession(Number(req.params.id));
  const text = await ai.draftSummary(bundle);
  log(req, bundle.session.id, 'ai.summary', `${text.length} characters drafted`);
  res.json({ text });
}));

app.post('/api/ai/sessions/:id/explain/:testKey', signedIn, aiGate, wrap(async (req, res) => {
  const bundle = loadSession(Number(req.params.id));
  const text = await ai.explainTest(bundle, req.params.testKey);
  res.json({ text });
}));

app.post('/api/ai/ask', signedIn, aiGate, wrap(async (req, res) => {
  require_(req.body, ['question']);
  const q = String(req.body.question).slice(0, 1000);
  const bundle = req.body.sessionId ? loadSession(Number(req.body.sessionId)) : null;
  const text = await ai.ask(q, bundle, engine.loadRuleset(bundle ? bundle.session.rulesetId : 'oiml-r76-2006'));
  res.json({ text });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'no such endpoint' }));

const port = Number(process.env.PORT || 4178);
if (require.main === module) {
  app.listen(port, () => console.log(`NAWI TestBench listening on http://localhost:${port}`));
}

module.exports = app;
