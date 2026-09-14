'use strict';

const crypto = require('crypto');
const store = require('./db');

const COOKIE = 'nawi_session';
const TTL_MS = 12 * 60 * 60 * 1000;

// Roles, from least to most authority. Each role includes everything below it
// except that approval is reserved to approver and admin regardless of order.
const ROLES = ['viewer', 'engineer', 'approver', 'admin'];

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function login(username, password) {
  const user = store.users.byUsername(String(username || '').trim().toLowerCase());
  if (!user || !user.active || !verifyPassword(String(password || ''), user.hash, user.salt)) return null;
  const token = crypto.randomBytes(32).toString('hex');
  store.tokens.issue(token, user.id, TTL_MS);
  return { token, user: { id: user.id, username: user.username, name: user.name, role: user.role } };
}

function attachUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.user = token ? store.tokens.resolve(token) : null;
  req.token = token || null;
  next();
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function atLeast(role, minimum) {
  return ROLES.indexOf(role) >= ROLES.indexOf(minimum);
}

function requireRole(minimum) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'sign in to continue' });
    if (!atLeast(req.user.role, minimum)) {
      return res.status(403).json({ error: `this action needs the ${minimum} role; you are signed in as ${req.user.role}` });
    }
    next();
  };
}

// First run: create the three demonstration accounts so the workbench is
// usable immediately. Change the passwords through the Users view.
function seedUsers() {
  if (store.users.count() > 0) return;
  const defaults = [
    ['admin', 'Administrator', 'admin', 'admin123'],
    ['engineer', 'Test Engineer', 'engineer', 'engineer123'],
    ['approver', 'Approving Officer', 'approver', 'approver123'],
    ['viewer', 'Read-only Viewer', 'viewer', 'viewer123']
  ];
  for (const [username, name, role, password] of defaults) {
    store.users.create({ username, name, role, ...hashPassword(password) });
  }
}

module.exports = { ROLES, COOKIE, hashPassword, verifyPassword, login, attachUser, setCookie, clearCookie, requireRole, atLeast, seedUsers };
