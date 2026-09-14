'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(process.env.NAWI_DB || path.join(__dirname, '..', 'nawi.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS instruments (
  id            INTEGER PRIMARY KEY,
  manufacturer  TEXT NOT NULL,
  model         TEXT NOT NULL,
  serial        TEXT NOT NULL,
  accuracyClass TEXT NOT NULL,
  max           REAL NOT NULL,
  min           REAL NOT NULL,
  e             REAL NOT NULL,
  d             REAL NOT NULL,
  units         TEXT NOT NULL DEFAULT 'g',
  createdAt     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            INTEGER PRIMARY KEY,
  reference     TEXT NOT NULL UNIQUE,
  instrumentId  INTEGER NOT NULL REFERENCES instruments(id),
  rulesetId     TEXT NOT NULL,
  context       TEXT NOT NULL,
  laboratory    TEXT NOT NULL,
  technician    TEXT NOT NULL,
  temperature   REAL,
  humidity      REAL,
  purpose       TEXT NOT NULL DEFAULT 'type-approval',
  zeroError     REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'draft',
  createdAt     TEXT NOT NULL,
  closedAt      TEXT
);

CREATE TABLE IF NOT EXISTS observations (
  id              INTEGER PRIMARY KEY,
  sessionId       INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  testKey         TEXT NOT NULL,
  label           TEXT NOT NULL,
  load            REAL NOT NULL,
  tare            REAL,
  indication      REAL NOT NULL,
  indicationAfter REAL,
  addedLoad       REAL,
  zeroError       REAL,
  direction       TEXT NOT NULL DEFAULT 'increasing',
  recordedAt      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environment (
  id          INTEGER PRIMARY KEY,
  sessionId   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  temperature REAL,
  humidity    REAL,
  pressure    REAL,
  voltage     REAL,
  frequency   REAL,
  note        TEXT,
  recordedAt  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checks (
  id        INTEGER PRIMARY KEY,
  sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  testKey   TEXT NOT NULL,
  itemKey   TEXT NOT NULL,
  result    TEXT NOT NULL,
  remark    TEXT,
  recordedAt TEXT NOT NULL,
  UNIQUE(sessionId, testKey, itemKey)
);

CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY,
  sessionId  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  caption    TEXT,
  data       BLOB NOT NULL,
  uploadedBy TEXT,
  uploadedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id        INTEGER PRIMARY KEY,
  username  TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL,
  hash      TEXT NOT NULL,
  salt      TEXT NOT NULL,
  active    INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  token     TEXT PRIMARY KEY,
  userId    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id        INTEGER PRIMARY KEY,
  sessionId INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  userId    INTEGER,
  actor     TEXT,
  action    TEXT NOT NULL,
  detail    TEXT,
  at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_session ON observations(sessionId, testKey);
CREATE INDEX IF NOT EXISTS idx_sessions_instrument ON sessions(instrumentId);
CREATE INDEX IF NOT EXISTS idx_env_session ON environment(sessionId);
CREATE INDEX IF NOT EXISTS idx_att_session ON attachments(sessionId);
CREATE INDEX IF NOT EXISTS idx_audit_session ON audit(sessionId);
`);

// Columns added after the first schema. Existing databases pick them up on
// start; a fresh database gets them from CREATE TABLE above plus these.
function ensureColumns(table, columns) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, decl] of Object.entries(columns)) {
    if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${decl}`);
  }
}

ensureColumns('instruments', {
  applicant: 'TEXT', applicantAddress: 'TEXT', manufacturerAddress: 'TEXT',
  instrumentType: 'TEXT', indicatingType: "TEXT DEFAULT 'digital'", electronic: 'INTEGER DEFAULT 1',
  rangeType: "TEXT DEFAULT 'single'", powerSupply: "TEXT DEFAULT 'mains'",
  nominalVoltage: 'REAL', minOperatingVoltage: 'REAL', frequency: 'REAL',
  tempMin: 'REAL', tempMax: 'REAL', softwareVersion: 'TEXT', loadCell: 'TEXT', interfaces: 'TEXT',
  tareMaxAdditive: 'REAL', tareMaxSubtractive: 'REAL', limitingTilt: 'TEXT', notes: 'TEXT', createdBy: 'TEXT'
});

ensureColumns('sessions', {
  remarks: 'TEXT', applicationRef: 'TEXT', testDate: 'TEXT', createdBy: 'TEXT',
  approvedBy: 'TEXT', approvedAt: 'TEXT', approvalNote: 'TEXT',
  certificateNo: 'TEXT', signature: 'TEXT', outcomeAtClose: 'TEXT'
});

ensureColumns('observations', {
  condition: 'TEXT', timeMin: 'REAL', remark: 'TEXT', warnings: 'TEXT', recordedBy: 'TEXT'
});

const now = () => new Date().toISOString();

const INSTRUMENT_FIELDS = [
  'manufacturer', 'model', 'serial', 'accuracyClass', 'max', 'min', 'e', 'd', 'units',
  'applicant', 'applicantAddress', 'manufacturerAddress', 'instrumentType', 'indicatingType', 'electronic',
  'rangeType', 'powerSupply', 'nominalVoltage', 'minOperatingVoltage', 'frequency', 'tempMin', 'tempMax',
  'softwareVersion', 'loadCell', 'interfaces', 'tareMaxAdditive', 'tareMaxSubtractive', 'limitingTilt', 'notes', 'createdBy'
];

const instruments = {
  create(i) {
    const row = Object.fromEntries(INSTRUMENT_FIELDS.map((f) => [f, i[f] ?? null]));
    row.units = row.units || 'g';
    row.indicatingType = row.indicatingType || 'digital';
    row.electronic = row.electronic === null ? 1 : Number(row.electronic);
    row.rangeType = row.rangeType || 'single';
    row.powerSupply = row.powerSupply || 'mains';
    row.createdAt = now();
    const cols = [...INSTRUMENT_FIELDS, 'createdAt'];
    const info = db.prepare(`INSERT INTO instruments (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`).run(row);
    return instruments.get(info.lastInsertRowid);
  },
  update(id, i) {
    const current = instruments.get(id);
    if (!current) return null;
    const row = Object.fromEntries(INSTRUMENT_FIELDS.map((f) => [f, i[f] !== undefined ? i[f] : current[f]]));
    row.id = id;
    db.prepare(`UPDATE instruments SET ${INSTRUMENT_FIELDS.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run(row);
    return instruments.get(id);
  },
  get: (id) => db.prepare('SELECT * FROM instruments WHERE id = ?').get(id),
  all: (q) => {
    if (!q) return db.prepare('SELECT * FROM instruments ORDER BY id DESC').all();
    const like = `%${q}%`;
    return db.prepare(`SELECT * FROM instruments
      WHERE manufacturer LIKE ? OR model LIKE ? OR serial LIKE ? OR applicant LIKE ? OR instrumentType LIKE ?
      ORDER BY id DESC`).all(like, like, like, like, like);
  }
};

const sessions = {
  create(s) {
    const year = new Date().getFullYear();
    const seq = db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE reference LIKE ?`).get(`NAWI/${year}/%`).c + 1;
    const reference = `NAWI/${year}/${String(seq).padStart(4, '0')}`;
    const row = {
      temperature: null, humidity: null, purpose: 'type-approval', zeroError: 0,
      remarks: null, applicationRef: null, testDate: null, createdBy: null,
      ...s, reference, createdAt: now()
    };
    const info = db.prepare(`INSERT INTO sessions
      (reference, instrumentId, rulesetId, context, purpose, zeroError, laboratory, technician, temperature, humidity,
       remarks, applicationRef, testDate, createdBy, createdAt)
      VALUES (@reference, @instrumentId, @rulesetId, @context, @purpose, @zeroError, @laboratory, @technician, @temperature, @humidity,
       @remarks, @applicationRef, @testDate, @createdBy, @createdAt)`).run(row);
    return sessions.get(info.lastInsertRowid);
  },
  get: (id) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(id),
  update(id, fields) {
    const allowed = ['laboratory', 'technician', 'remarks', 'applicationRef', 'testDate', 'zeroError'];
    const set = Object.keys(fields).filter((k) => allowed.includes(k));
    if (!set.length) return sessions.get(id);
    db.prepare(`UPDATE sessions SET ${set.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...fields, id });
    return sessions.get(id);
  },
  close(id, outcome) {
    db.prepare(`UPDATE sessions SET status = 'complete', closedAt = ?, outcomeAtClose = ? WHERE id = ?`).run(now(), outcome ?? null, id);
    return sessions.get(id);
  },
  reopen(id) {
    db.prepare(`UPDATE sessions SET status = 'draft', closedAt = NULL, approvedBy = NULL, approvedAt = NULL,
                approvalNote = NULL, certificateNo = NULL, signature = NULL, outcomeAtClose = NULL WHERE id = ?`).run(id);
    return sessions.get(id);
  },
  approve(id, { approvedBy, approvalNote, certificateNo, signature }) {
    db.prepare(`UPDATE sessions SET status = 'approved', approvedBy = ?, approvedAt = ?, approvalNote = ?,
                certificateNo = ?, signature = ? WHERE id = ?`)
      .run(approvedBy, now(), approvalNote ?? null, certificateNo ?? null, signature ?? null, id);
    return sessions.get(id);
  },
  reject(id, { approvedBy, approvalNote }) {
    db.prepare(`UPDATE sessions SET status = 'draft', closedAt = NULL, approvalNote = ?, approvedBy = NULL,
                approvedAt = NULL WHERE id = ?`).run(`Returned by ${approvedBy}: ${approvalNote || 'no note'}`, id);
    return sessions.get(id);
  },
  nextCertificateNo() {
    const year = new Date().getFullYear();
    const seq = db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE certificateNo LIKE ?`).get(`NAWI-C/${year}/%`).c + 1;
    return `NAWI-C/${year}/${String(seq).padStart(4, '0')}`;
  },
  all(filter = {}) {
    const where = [];
    const params = [];
    if (filter.q) {
      const like = `%${filter.q}%`;
      where.push(`(s.reference LIKE ? OR i.manufacturer LIKE ? OR i.model LIKE ? OR i.serial LIKE ? OR i.applicant LIKE ? OR s.certificateNo LIKE ? OR s.applicationRef LIKE ?)`);
      params.push(like, like, like, like, like, like, like);
    }
    if (filter.status) { where.push('s.status = ?'); params.push(filter.status); }
    if (filter.accuracyClass) { where.push('i.accuracyClass = ?'); params.push(filter.accuracyClass); }
    if (filter.purpose) { where.push('s.purpose = ?'); params.push(filter.purpose); }
    if (filter.instrumentId) { where.push('s.instrumentId = ?'); params.push(filter.instrumentId); }
    if (filter.from) { where.push('s.createdAt >= ?'); params.push(filter.from); }
    if (filter.to) { where.push('s.createdAt <= ?'); params.push(`${filter.to}T23:59:59.999Z`); }
    const sql = `SELECT s.*, i.manufacturer, i.model, i.serial, i.accuracyClass, i.applicant, i.instrumentType
                 FROM sessions s JOIN instruments i ON i.id = s.instrumentId
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY s.id DESC`;
    return db.prepare(sql).all(...params);
  },
  forInstrument: (instrumentId) =>
    db.prepare('SELECT * FROM sessions WHERE instrumentId = ? ORDER BY id DESC').all(instrumentId)
};

const observations = {
  add(o) {
    const row = { tare: null, indicationAfter: null, addedLoad: null, zeroError: null, direction: 'increasing',
                  condition: null, timeMin: null, remark: null, warnings: null, recordedBy: null, ...o, recordedAt: now() };
    if (Array.isArray(row.warnings)) row.warnings = row.warnings.length ? JSON.stringify(row.warnings) : null;
    const info = db.prepare(`INSERT INTO observations
      (sessionId, testKey, label, load, tare, indication, indicationAfter, addedLoad, zeroError, direction,
       condition, timeMin, remark, warnings, recordedBy, recordedAt)
      VALUES (@sessionId, @testKey, @label, @load, @tare, @indication, @indicationAfter, @addedLoad, @zeroError, @direction,
       @condition, @timeMin, @remark, @warnings, @recordedBy, @recordedAt)`).run(row);
    return observations.get(info.lastInsertRowid);
  },
  get: (id) => hydrate(db.prepare('SELECT * FROM observations WHERE id = ?').get(id)),
  remove: (id) => db.prepare('DELETE FROM observations WHERE id = ?').run(id),
  forSession: (sessionId) =>
    db.prepare('SELECT * FROM observations WHERE sessionId = ? ORDER BY id').all(sessionId).map(hydrate)
};

function hydrate(o) {
  if (!o) return o;
  if (typeof o.warnings === 'string') { try { o.warnings = JSON.parse(o.warnings); } catch { o.warnings = null; } }
  return o;
}

const environment = {
  add(r) {
    const row = { temperature: null, humidity: null, pressure: null, voltage: null, frequency: null, note: null, ...r, recordedAt: now() };
    const info = db.prepare(`INSERT INTO environment (sessionId, stage, temperature, humidity, pressure, voltage, frequency, note, recordedAt)
      VALUES (@sessionId, @stage, @temperature, @humidity, @pressure, @voltage, @frequency, @note, @recordedAt)`).run(row);
    return db.prepare('SELECT * FROM environment WHERE id = ?').get(info.lastInsertRowid);
  },
  remove: (id) => db.prepare('DELETE FROM environment WHERE id = ?').run(id),
  forSession: (sessionId) => db.prepare('SELECT * FROM environment WHERE sessionId = ? ORDER BY id').all(sessionId)
};

const checks = {
  set(c) {
    db.prepare(`INSERT INTO checks (sessionId, testKey, itemKey, result, remark, recordedAt)
      VALUES (@sessionId, @testKey, @itemKey, @result, @remark, @recordedAt)
      ON CONFLICT(sessionId, testKey, itemKey) DO UPDATE SET result = excluded.result, remark = excluded.remark, recordedAt = excluded.recordedAt`)
      .run({ remark: null, ...c, recordedAt: now() });
  },
  clear: (sessionId, testKey, itemKey) =>
    db.prepare('DELETE FROM checks WHERE sessionId = ? AND testKey = ? AND itemKey = ?').run(sessionId, testKey, itemKey),
  forSession: (sessionId) => db.prepare('SELECT * FROM checks WHERE sessionId = ? ORDER BY id').all(sessionId)
};

const attachments = {
  add(a) {
    const info = db.prepare(`INSERT INTO attachments (sessionId, filename, mime, size, caption, data, uploadedBy, uploadedAt)
      VALUES (@sessionId, @filename, @mime, @size, @caption, @data, @uploadedBy, @uploadedAt)`)
      .run({ caption: null, uploadedBy: null, ...a, uploadedAt: now() });
    return attachments.meta(info.lastInsertRowid);
  },
  meta: (id) => db.prepare('SELECT id, sessionId, filename, mime, size, caption, uploadedBy, uploadedAt FROM attachments WHERE id = ?').get(id),
  get: (id) => db.prepare('SELECT * FROM attachments WHERE id = ?').get(id),
  remove: (id) => db.prepare('DELETE FROM attachments WHERE id = ?').run(id),
  forSession: (sessionId) =>
    db.prepare('SELECT id, sessionId, filename, mime, size, caption, uploadedBy, uploadedAt FROM attachments WHERE sessionId = ? ORDER BY id').all(sessionId),
  withData: (sessionId) => db.prepare('SELECT * FROM attachments WHERE sessionId = ? ORDER BY id').all(sessionId)
};

const users = {
  create(u) {
    const info = db.prepare(`INSERT INTO users (username, name, role, hash, salt, active, createdAt)
      VALUES (@username, @name, @role, @hash, @salt, 1, @createdAt)`).run({ ...u, createdAt: now() });
    return users.get(info.lastInsertRowid);
  },
  get: (id) => db.prepare('SELECT id, username, name, role, active, createdAt FROM users WHERE id = ?').get(id),
  byUsername: (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username),
  all: () => db.prepare('SELECT id, username, name, role, active, createdAt FROM users ORDER BY id').all(),
  count: () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
  setActive: (id, active) => db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id),
  setRole: (id, role) => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id),
  setPassword: (id, hash, salt) => db.prepare('UPDATE users SET hash = ?, salt = ? WHERE id = ?').run(hash, salt, id)
};

const tokens = {
  issue(token, userId, ttlMs) {
    db.prepare('INSERT INTO tokens (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
      .run(token, userId, now(), new Date(Date.now() + ttlMs).toISOString());
  },
  resolve(token) {
    const row = db.prepare(`SELECT u.id, u.username, u.name, u.role, u.active, t.expiresAt
      FROM tokens t JOIN users u ON u.id = t.userId WHERE t.token = ?`).get(token);
    if (!row) return null;
    if (row.expiresAt < now() || !row.active) { tokens.revoke(token); return null; }
    return { id: row.id, username: row.username, name: row.name, role: row.role };
  },
  revoke: (token) => db.prepare('DELETE FROM tokens WHERE token = ?').run(token),
  sweep: () => db.prepare('DELETE FROM tokens WHERE expiresAt < ?').run(now())
};

const audit = {
  log(entry) {
    db.prepare('INSERT INTO audit (sessionId, userId, actor, action, detail, at) VALUES (@sessionId, @userId, @actor, @action, @detail, @at)')
      .run({ sessionId: null, userId: null, actor: null, detail: null, ...entry, at: now() });
  },
  forSession: (sessionId) => db.prepare('SELECT * FROM audit WHERE sessionId = ? ORDER BY id').all(sessionId)
};

const stats = () => {
  const row = (sql, ...p) => db.prepare(sql).get(...p).c;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  return {
    instruments: row('SELECT COUNT(*) AS c FROM instruments'),
    total: row('SELECT COUNT(*) AS c FROM sessions'),
    draft: row(`SELECT COUNT(*) AS c FROM sessions WHERE status = 'draft'`),
    complete: row(`SELECT COUNT(*) AS c FROM sessions WHERE status = 'complete'`),
    approved: row(`SELECT COUNT(*) AS c FROM sessions WHERE status = 'approved'`),
    certified: row(`SELECT COUNT(*) AS c FROM sessions WHERE certificateNo IS NOT NULL`),
    observations: row('SELECT COUNT(*) AS c FROM observations'),
    attachments: row('SELECT COUNT(*) AS c FROM attachments'),
    last30Days: row('SELECT COUNT(*) AS c FROM sessions WHERE createdAt >= ?', since),
    byClass: db.prepare(`SELECT i.accuracyClass AS cls, COUNT(*) AS c FROM sessions s JOIN instruments i ON i.id = s.instrumentId GROUP BY i.accuracyClass`).all(),
    byMonth: db.prepare(`SELECT substr(createdAt, 1, 7) AS month, COUNT(*) AS c FROM sessions GROUP BY month ORDER BY month DESC LIMIT 12`).all()
  };
};

module.exports = { db, instruments, sessions, observations, environment, checks, attachments, users, tokens, audit, stats, INSTRUMENT_FIELDS };
