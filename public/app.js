'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const api = async (url, opts) => {
  const res = await fetch(url, opts);
  if (res.status === 401) { location.href = `/login${location.hash}`; throw new Error('signed out'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `request failed (${res.status})`);
  return body;
};
const send = (method) => (url, data) => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });
const post = send('POST');
const put = send('PUT');
const patch = send('PATCH');
const del = (url) => api(url, { method: 'DELETE' });

const num = (v, u = '') => (v === null || v === undefined || v === ''
  ? '—' : `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}${u ? ' ' + u : ''}`);
const signed = (v) => (v === null || v === undefined ? '—' : v > 0 ? `+${num(v)}` : num(v));
const when = (s) => (s ? new Date(s).toLocaleDateString('en-IN') : '—');
const whenFull = (s) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const STATUS = { draft: 'In progress', complete: 'Awaiting approval', approved: 'Approved' };
const badge = (v, label) => `<span class="badge b-${String(v).replace(/-/g, '')}">${esc(label || String(v).replace(/-/g, ' ')).toUpperCase()}</span>`;
const statusBadge = (s) => badge(s, STATUS[s] || s);
const msg = (el, text, kind = 'err') => { el.innerHTML = `<div class="msg ${kind}">${esc(text)}</div>`; };
const formData = (form) => Object.fromEntries(new FormData(form).entries());

let ME = null;
let CURRENT = null;
const ROLE_RANK = { viewer: 0, engineer: 1, approver: 2, admin: 3 };
const can = (role) => ME && ROLE_RANK[ME.role] >= ROLE_RANK[role];

function toast(text, kind = '') {
  const t = $('#toast');
  t.textContent = text;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, kind === 'warn' ? 7000 : 3500);
}

/* ------------------------------ navigation ------------------------------ */

function show(name) {
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === `view-${name}`));
  $$('.side .tab').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  window.scrollTo(0, 0);
}

function go(name) {
  show(name);
  if (name === 'dashboard') loadDashboard();
  if (name === 'tests') loadSessions();
  if (name === 'instruments') loadInstruments();
  if (name === 'new') loadInstrumentOptions();
  if (name === 'users') loadUsers();
  if (name === 'account') loadAccount();
  history.replaceState(null, '', name === 'dashboard' ? '/app' : `/app#${name}`);
}

$$('.side .tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => {
  go(b.dataset.goto);
  if (b.dataset.goto === 'instruments') openInstrumentForm();
}));

function applyRoles() {
  $$('[data-role]').forEach((el) => { el.hidden = !can(el.dataset.role); });
  $('#who').innerHTML = `<b>${esc(ME.name)}</b><span class="role">${esc(ME.role)}</span><button id="signout">Sign out</button>`;
  $('#signout').addEventListener('click', async () => { await post('/api/logout'); location.href = '/login'; });
}

/* ------------------------------- dashboard ------------------------------ */

async function loadStats() {
  const s = await api('/api/stats');
  const mini = (n, l) => `<div class="mini"><span>${l}</span><span class="lcd-frame">${sevenSegment(String(n), { digits: 3, height: 18 })}</span></div>`;
  $('#side-stats').innerHTML = mini(s.draft, 'In progress') + mini(s.complete, 'Awaiting approval') + mini(s.certified, 'Certified');
  powerOn($('#side-stats'));
  return s;
}

async function loadDashboard() {
  const s = await loadStats();
  const meter = (n, l, sub, view, filter) => `<button class="meter" data-tile="${view}" data-filter="${esc(filter || '')}">
    <span class="metric-icon" aria-hidden="true">${filter === 'status=approved' ? '✓' : filter === 'status=complete' ? '◷' : filter === 'status=draft' ? '↗' : '▤'}</span><span class="metric-value">${num(n)}</span>
    <span class="l"><b>${l}</b><span>${sub}</span></span></button>`;
  $('#console').innerHTML = [
    meter(s.total, 'Tests on record', `${s.last30Days} in 30 days`, 'tests'),
    meter(s.draft, 'In progress', 'being recorded', 'tests', 'status=draft'),
    meter(s.complete, 'Awaiting approval', 'closed by engineers', 'tests', 'status=complete'),
    meter(s.certified, 'Certificates issued', `${s.instruments} instrument${s.instruments === 1 ? '' : 's'}`, 'tests', 'status=approved')
  ].join('');
  powerOn($('#console'));
  $$('[data-tile]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.tile === 'instruments') return go('instruments');
    const f = $('#filters'); f.reset();
    if (b.dataset.filter) { const [k, v] = b.dataset.filter.split('='); f[k].value = v; }
    go('tests');
  }));

  $('#recent-table').innerHTML = sessionsTable(s.recent, true);
  bindOpen();

  const o = s.outcomes || { pass: 0, fail: 0, incomplete: 0 };
  const total = o.pass + o.fail + o.incomplete;
  const r = 52, C = 2 * Math.PI * r;
  let offset = 0;
  const arc = (n, cls) => {
    if (!n) return '';
    const len = (n / total) * C;
    const out = `<circle class="${cls}" cx="66" cy="66" r="${r}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 66 66)"/>`;
    offset += len; return out;
  };
  $('#outcomes').innerHTML = total === 0 ? '<p class="empty">No tests yet.</p>' : `<div class="ring-wrap">
    <svg class="ring" viewBox="0 0 132 132"><circle class="bg" cx="66" cy="66" r="${r}"/>${arc(o.pass, 'pass')}${arc(o.fail, 'fail')}${arc(o.incomplete, 'incomplete')}
      <text x="66" y="72">${total}</text><text class="sub" x="66" y="88">tests</text></svg>
    <div class="legend">
      <div><i style="background:var(--pass)"></i>Pass<b>${o.pass}</b></div>
      <div><i style="background:var(--fail)"></i>Fail<b>${o.fail}</b></div>
      <div><i style="background:var(--warn)"></i>Incomplete<b>${o.incomplete}</b></div>
      <div><i style="background:var(--accent)"></i>Certified<b>${s.certified}</b></div>
    </div></div>`;

  const months = [...s.byMonth].reverse();
  const max = Math.max(1, ...months.map((m) => m.c));
  $('#activity').innerHTML = `
    <div class="bars">${months.map((m) => `<div class="bar"><span>${esc(m.month)}</span><i style="width:${(m.c / max) * 100}%"></i><b>${m.c}</b></div>`).join('') || '<p class="empty">No tests yet.</p>'}</div>
    <div class="byclass">${s.byClass.map((c) => `<span><span class="oval">${esc(c.cls)}</span>${c.c} test${c.c === 1 ? '' : 's'}</span>`).join('')}</div>
    <p class="hint" style="margin-top:12px">${s.observations} observations and ${s.attachments} attachments on record.</p>`;
}

/* -------------------------------- tests -------------------------------- */

function sessionsTable(rows, compact = false) {
  if (!rows.length) return '<p class="empty">No tests match. Register an instrument, then open a test against it.</p>';
  return `<table><thead><tr>
      <th>Reference</th><th>Instrument</th><th class="c">Class</th>${compact ? '' : '<th>Purpose</th>'}
      <th class="c">Status</th><th class="c">Outcome</th>${compact ? '' : '<th>Certificate</th>'}<th>Opened</th>
     </tr></thead><tbody>${rows.map((r) => `<tr class="rowlink" tabindex="0" role="link" aria-label="Open report ${esc(r.reference)}" data-open="${r.id}">
      <td>${esc(r.reference)}${r.progress && !compact ? (() => { const [a, b] = r.progress.split('/').map(Number); return `<div class="progress"><span class="pbar"><i style="width:${b ? (a / b) * 100 : 0}%"></i></span>${a} of ${b} required tests</div>`; })() : ''}</td>
      <td><b>${esc(r.manufacturer)}</b> ${esc(r.model)}<br><span class="serial">${esc(r.serial)}${r.applicant && !compact ? `, ${esc(r.applicant)}` : ''}</span></td>
      <td class="c">${esc(r.accuracyClass)}</td>
      ${compact ? '' : `<td>${r.purpose === 'verification' ? 'Verification' : 'Type approval'}<br><span class="serial">${r.context === 'initial' ? 'initial' : 'in service'}</span></td>`}
      <td class="c">${statusBadge(r.status)}</td>
      <td class="c">${badge(r.overall)}</td>
      ${compact ? '' : `<td>${r.certificateNo ? esc(r.certificateNo) : '<span class="serial">—</span>'}</td>`}
      <td>${when(r.createdAt)}</td>
     </tr>`).join('')}</tbody></table>`;
}

function bindOpen() {
  $$('[data-open]').forEach((b) => {
    b.addEventListener('click', () => openSession(Number(b.dataset.open)));
    b.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openSession(Number(b.dataset.open)); } });
  });
}

async function loadSessions() {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(formData($('#filters')))) if (v) params.set(k, v);
  const rows = await api(`/api/sessions${params.toString() ? `?${params}` : ''}`);
  $('#sessions-table').innerHTML = `<p class="list-note">${rows.length} test${rows.length === 1 ? '' : 's'}${params.toString() ? ' match the filter' : ' on record'}.</p>` + sessionsTable(rows);
  bindOpen();
}

$('#filters').addEventListener('submit', (e) => { e.preventDefault(); loadSessions(); });
$('#filters').addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'date') loadSessions(); });
$('#filters-reset').addEventListener('click', () => setTimeout(loadSessions, 0));

/* Account settings and a portable report register. */
function loadAccount() {
  $('#account-details').innerHTML = [['Name', ME.name], ['Username', ME.username], ['Role', ME.role]].map(([k,v]) => `<div class="kv"><span class="k">${k}</span><b>${esc(v)}</b></div>`).join('');
}
$('#form-password').addEventListener('submit', async event => {
  event.preventDefault();
  const f = event.currentTarget, data = formData(f), button = f.querySelector('button');
  if (data.password !== data.confirm) return msg($('#password-msg'), 'The new passwords do not match.');
  button.disabled = true;
  try { await post('/api/me/password', {current:data.current, password:data.password}); f.reset(); msg($('#password-msg'), 'Your password has been updated.', 'ok'); }
  catch(error) { msg($('#password-msg'), error.message); }
  finally { button.disabled = false; }
});
$('#export-register').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const params = new URLSearchParams();
    for (const [k,v] of Object.entries(formData($('#filters')))) if(v) params.set(k,v);
    const rows = await api(`/api/sessions?${params}`);
    const fields = ['reference','manufacturer','model','serial','accuracyClass','purpose','status','overall','certificateNo','createdAt'];
    const cell = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const csv = [fields,...rows.map(row=>fields.map(k=>row[k]))].map(row=>row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download=`nawi-report-register-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast(`Exported ${rows.length} report${rows.length===1?'':'s'}.`);
  } catch(error) { toast(error.message, 'err'); }
  finally { button.disabled = false; }
});

/* ----------------------------- instruments ----------------------------- */

const SUPPLY = { mains: 'Mains AC', external: 'External supply', battery: 'Battery', 'vehicle-12': '12 V vehicle', 'vehicle-24': '24 V vehicle' };

async function loadInstruments() {
  const q = $('#q-instruments').value.trim();
  const rows = await api(`/api/instruments${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  $('#instruments-table').innerHTML = rows.length === 0
    ? '<p class="empty">Nothing registered yet.</p>'
    : `<table><thead><tr>
        <th>Manufacturer / model</th><th>Applicant</th><th>Category</th><th class="c">Class</th>
        <th class="r">Max</th><th class="r">Min</th><th class="r">e</th><th class="r">d</th><th class="r">n</th><th>Supply</th>
       </tr></thead><tbody>${rows.map((r) => `<tr class="rowlink" data-inst="${r.id}">
        <td><b>${esc(r.manufacturer)}</b> ${esc(r.model)}<br><span class="serial">${esc(r.serial)}</span></td>
        <td>${esc(r.applicant || '—')}</td><td>${esc(r.instrumentType || '—')}</td>
        <td class="c">${esc(r.accuracyClass)}</td>
        <td class="r">${num(r.max, r.units)}</td><td class="r">${num(r.min, r.units)}</td>
        <td class="r">${num(r.e, r.units)}${r.ranges && r.rangeType !== 'single' ? '<div class="serial">multi</div>' : ''}</td><td class="r">${num(r.d, r.units)}</td>
        <td class="r"><b>${num(r.max / r.e)}</b></td>
        <td>${esc(SUPPLY[r.powerSupply] || r.powerSupply || '—')}${r.nominalVoltage ? ` ${num(r.nominalVoltage)} V` : ''}</td>
       </tr>`).join('')}</tbody></table>`;
  $$('[data-inst]').forEach((b) => b.addEventListener('click', () => showInstrument(Number(b.dataset.inst))));
}

$('#q-instruments-go').addEventListener('click', loadInstruments);
$('#q-instruments').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadInstruments(); });

async function showInstrument(id) {
  const { instrument: i, sessions, classification: c, supply } = await api(`/api/instruments/${id}`);
  const u = i.units;
  const locked = sessions.some((s) => s.status !== 'draft');
  $('#instrument-detail').innerHTML = `<div class="card detail">
    <div class="card-head"><h3>${esc(i.manufacturer)} ${esc(i.model)} <span class="serial">${esc(i.serial)}</span></h3>
      <div class="actions">
        ${can('engineer') && !locked ? `<button class="btn sm ghost" id="edit-inst">Edit particulars</button>` : locked ? '<span class="hint">Particulars frozen: appears in a closed report</span>' : ''}
        ${can('engineer') ? `<button class="btn sm" id="test-inst">New test on this instrument</button>` : ''}
      </div></div>
    <div class="cols">
      <div>
        <div class="kv"><span class="k">Applicant</span><span>${esc(i.applicant || '—')}${i.applicantAddress ? `<br><span class="serial">${esc(i.applicantAddress)}</span>` : ''}</span></div>
        <div class="kv"><span class="k">Manufacturer</span><span>${esc(i.manufacturer)}${i.manufacturerAddress ? `<br><span class="serial">${esc(i.manufacturerAddress)}</span>` : ''}</span></div>
        <div class="kv"><span class="k">Category</span><span>${esc(i.instrumentType || '—')} · ${esc(i.indicatingType)} · ${Number(i.electronic) ? 'electronic' : 'non-electronic'} · ${esc(i.rangeType)}</span></div>
        <div class="kv"><span class="k">Class</span><span>${esc(i.accuracyClass)}, ${esc(c.designation)}</span></div>
        <div class="kv"><span class="k">Max / Min</span><span>${num(i.max, u)} / ${num(i.min, u)}</span></div>
        ${c.multiRange
          ? `<div class="kv"><span class="k">Partial ranges</span><span>${c.ranges.map((r) => `<div>Range ${r.index + 1}: e = ${num(r.e, u)}, d = ${num(r.d, u)}, up to ${num(r.max, u)}, n = ${num(r.n)} ${r.withinRange ? '' : '<span class="serial">(outside permitted range)</span>'}</div>`).join('')}</span></div>`
          : `<div class="kv"><span class="k">e / d / n</span><span>${num(i.e, u)} / ${num(i.d, u)} / ${num(c.n)} <span class="hint">(${c.nRange ? `${c.nRange[0]}–${c.nRange[1] ?? '∞'} permitted` : 'no band'})</span></span></div>`}
        <div class="kv"><span class="k">Tare</span><span>${i.tareMaxAdditive ? `T = +${num(i.tareMaxAdditive, u)}` : '—'} / ${i.tareMaxSubtractive ? `T = −${num(i.tareMaxSubtractive, u)}` : '—'}</span></div>
        <div class="kv"><span class="k">Temperature</span><span>${num(c.temperature.min, '°C')} to ${num(c.temperature.max, '°C')} ${c.temperature.special ? '(marked)' : '(default)'}</span></div>
        <div class="kv"><span class="k">Supply</span><span>${esc(SUPPLY[i.powerSupply] || i.powerSupply)}${i.nominalVoltage ? `, ${num(i.nominalVoltage)} V` : ''}${i.frequency ? ` ${num(i.frequency)} Hz` : ''}${supply && supply.lower !== null && supply.upper !== null ? `<br><span class="serial">test at ${num(supply.lower)} V and ${num(supply.upper)} V (3.9.3)</span>` : ''}</span></div>
        <div class="kv"><span class="k">Software / load cell</span><span>${esc(i.softwareVersion || '—')} / ${esc(i.loadCell || '—')}</span></div>
        <div class="kv"><span class="k">Interfaces</span><span>${esc(i.interfaces || '—')}</span></div>
        ${i.notes ? `<div class="kv"><span class="k">Notes</span><span>${esc(i.notes)}</span></div>` : ''}
        ${c.findings.length ? `<ul class="findings">${c.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      </div>
      <div>
        <h4 style="margin-bottom:8px">Test history</h4>
        ${sessions.length ? `<table><thead><tr><th>Reference</th><th>Purpose</th><th class="c">Status</th><th class="c">Outcome</th><th>Opened</th></tr></thead>
          <tbody>${sessions.map((s) => `<tr class="rowlink" data-open="${s.id}"><td>${esc(s.reference)}${s.certificateNo ? `<br><span class="serial">${esc(s.certificateNo)}</span>` : ''}</td>
            <td>${s.purpose === 'verification' ? 'Verification' : 'Type approval'}</td><td class="c">${statusBadge(s.status)}</td><td class="c">${badge(s.overall)}</td><td>${when(s.createdAt)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="empty">No tests yet on this instrument.</p>'}
      </div>
    </div></div>`;
  bindOpen();
  $('#edit-inst')?.addEventListener('click', () => openInstrumentForm(i));
  $('#test-inst')?.addEventListener('click', async () => { go('new'); await loadInstrumentOptions(); $('#sel-instrument').value = i.id; });
  $('#instrument-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openInstrumentForm(i = null) {
  if (!can('engineer')) return;
  const card = $('#instrument-form-card');
  const f = $('#form-instrument');
  f.reset();
  card.hidden = false;
  $('#instrument-form-title').textContent = i ? `Edit ${i.manufacturer} ${i.model}` : 'Register an instrument';
  $('#instrument-submit').textContent = i ? 'Save changes' : 'Save instrument';
  f.id.value = i ? i.id : '';
  if (i) for (const [k, v] of Object.entries(i)) if (f[k] && k !== 'id' && k !== 'ranges') f[k].value = v ?? '';
  fillRanges(f, i ? i.ranges : null);
  syncRangeEditor(f);
  $('#instrument-msg').innerHTML = '';
  previewInstrument();
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function rangesFromForm(f) {
  if (f.rangeType.value === 'single') return '';
  const rows = [0, 1, 2].map((r) => ({
    e: f.querySelector(`[data-r="${r}"][data-k="e"]`).value, max: f.querySelector(`[data-r="${r}"][data-k="max"]`).value, d: f.querySelector(`[data-r="${r}"][data-k="d"]`).value
  })).filter((x) => x.e !== '' || x.max !== '');
  return rows.length ? JSON.stringify(rows.map((x) => ({ e: Number(x.e), max: Number(x.max), d: x.d === '' ? Number(x.e) : Number(x.d) }))) : '';
}
function fillRanges(f, ranges) {
  let list = ranges; if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
  [0, 1, 2].forEach((r) => { for (const k of ['e', 'max', 'd']) f.querySelector(`[data-r="${r}"][data-k="${k}"]`).value = list && list[r] ? (list[r][k] ?? '') : ''; });
}
function syncRangeEditor(f) {
  const multi = f.rangeType.value !== 'single';
  $('#ranges-editor').hidden = !multi;
  f.max.readOnly = multi; f.e.readOnly = multi; f.d.readOnly = multi;
  if (multi) {
    const list = rangesFromForm(f); const arr = list ? JSON.parse(list) : [];
    if (arr.length) { const sorted = [...arr].sort((a, b) => a.max - b.max); f.max.value = sorted[sorted.length - 1].max || ''; f.e.value = sorted[0].e || ''; f.d.value = sorted[0].d || ''; }
  }
  f.ranges.value = rangesFromForm(f);
}
const rangeChips = (i) => { let list = i.ranges; if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = null; } }
  return Array.isArray(list) && list.length > 1 ? list.map((r, k) => `<span class="range-chip">R${k + 1}: e ${num(r.e, i.units)} to ${num(r.max, i.units)}</span>`).join('') : ''; };

$('#form-instrument').rangeType.addEventListener('change', () => { syncRangeEditor($('#form-instrument')); previewInstrument(); });
$('#ranges-editor').addEventListener('input', () => { syncRangeEditor($('#form-instrument')); previewInstrument(); });

$('#btn-new-instrument').addEventListener('click', () => openInstrumentForm());
$('#instrument-form-cancel').addEventListener('click', () => { $('#instrument-form-card').hidden = true; });

let previewTimer;
async function previewInstrument() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const f = $('#form-instrument');
    const out = $('#instrument-preview');
    if (!(Number(f.max.value) > 0 && Number(f.e.value) > 0)) { out.textContent = 'n = Max / e is derived and checked against the class as you type.'; return; }
    const q = new URLSearchParams({ accuracyClass: f.accuracyClass.value, max: f.max.value, min: f.min.value || 0, e: f.e.value, d: f.d.value || f.e.value, units: f.units.value, tempMin: f.tempMin.value, tempMax: f.tempMax.value, ranges: f.ranges.value });
    try {
      const c = await api(`/api/instrument-preview?${q}`);
      const u = f.units.value;
      out.innerHTML = (c.multiRange
        ? c.ranges.map((r) => `Range ${r.index + 1}: e = ${num(r.e, u)} to ${num(r.max, u)}, n = <b>${num(r.n)}</b> ${r.nMin !== null ? `(${r.nMin}–${r.nMax ?? '∞'} permitted)` : ''}`).join(' · ')
        : `n = <b>${num(c.n)}</b> ${c.nRange ? `(${c.nRange[0]}–${c.nRange[1] ?? '∞'} permitted for class ${esc(f.accuracyClass.value)})` : ''}`)
        + ` · Min must be ≥ ${num(c.minCapacity, u)} · changeover method ${c.changeoverRequired ? 'required (d > 0.2 e)' : 'optional'}`
        + (c.boundaries && c.boundaries.length ? ` · MPE changes at ${c.boundaries.map((b) => num(b, u)).join(', ')}` : '')
        + (c.findings.length ? `<div class="bad">${c.findings.map(esc).join('<br>')}</div>` : '<div class="good">Classification admissible.</div>');
    } catch (err) { out.innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
  }, 250);
}
$('#form-instrument').addEventListener('input', previewInstrument);

$('#demo-instrument').addEventListener('click', () => {
  const f = $('#form-instrument');
  const fill = (o) => { for (const [k, v] of Object.entries(o)) if (f[k]) f[k].value = v; };
  fill({ applicant: 'Essae-Teraoka Pvt. Ltd.', applicantAddress: 'Bengaluru, Karnataka', manufacturer: 'Essae-Teraoka', manufacturerAddress: 'Bengaluru, Karnataka',
    model: 'DS-852', serial: `ET-${Math.floor(Math.random() * 90000 + 10000)}`, instrumentType: 'Counter scale', indicatingType: 'digital', electronic: '1', rangeType: 'single',
    accuracyClass: 'III', units: 'g', max: 15000, min: 100, e: 5, d: 5, tareMaxAdditive: 7000,
    powerSupply: 'mains', nominalVoltage: 230, frequency: 50, tempMin: '', tempMax: '', limitingTilt: 'Level indicator with ring marking',
    softwareVersion: 'v2.14', loadCell: '1 × single-point, 20 kg', interfaces: 'RS-232 printer port', notes: '' });
  previewInstrument();
});

$('#form-instrument').addEventListener('submit', async (e) => {
  e.preventDefault();
  syncRangeEditor(e.target);
  const data = formData(e.target);
  const id = data.id; delete data.id;
  try {
    const r = id ? await put(`/api/instruments/${id}`, data) : await post('/api/instruments', data);
    const c = r.classification;
    msg($('#instrument-msg'), c.findings.length
      ? `Saved with findings: ${c.findings.join('; ')}`
      : `Saved. n = ${num(c.n)}, within ${c.nRange[0]}–${c.nRange[1] ?? '∞'} for class ${r.instrument.accuracyClass}.`, c.findings.length ? 'err' : 'ok');
    $('#instrument-form-card').hidden = true;
    loadInstruments(); loadStats(); showInstrument(r.instrument.id);
    toast(`${r.instrument.manufacturer} ${r.instrument.model} saved`);
  } catch (err) { msg($('#instrument-msg'), err.message); }
});

/* -------------------------------- new test -------------------------------- */

async function loadInstrumentOptions() {
  const [rows, rulesets] = await Promise.all([api('/api/instruments'), api('/api/rulesets')]);
  $('#sel-instrument').innerHTML = rows.length === 0
    ? '<option value="">Register an instrument first</option>'
    : rows.map((r) => `<option value="${r.id}">${esc(r.manufacturer)} ${esc(r.model)} — ${esc(r.serial)} (class ${esc(r.accuracyClass)}, Max ${num(r.max, r.units)})</option>`).join('');
  $('#sel-ruleset').innerHTML = rulesets.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
  const f = $('#form-session');
  if (!f.technician.value && ME) f.technician.value = ME.name;
  if (!f.testDate.value) f.testDate.value = new Date().toISOString().slice(0, 10);
}

$('#form-session').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const s = await post('/api/sessions', formData(e.target));
    e.target.reset();
    toast(`${s.reference} opened`);
    openSession(s.id);
  } catch (err) { msg($('#session-msg'), err.message); }
});

/* ---------------------------------- users ---------------------------------- */

async function loadUsers() {
  const rows = await api('/api/users');
  $('#users-table').innerHTML = `<table><thead><tr><th>Username</th><th>Name</th><th>Role</th><th class="c">Active</th><th>Since</th><th></th></tr></thead>
    <tbody>${rows.map((u) => `<tr>
      <td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td>
      <td><select data-user-role="${u.id}">${['viewer', 'engineer', 'approver', 'admin'].map((r) => `<option${r === u.role ? ' selected' : ''}>${r}</option>`).join('')}</select></td>
      <td class="c">${u.active ? badge('pass', 'active') : badge('fail', 'disabled')}</td>
      <td>${when(u.createdAt)}</td>
      <td class="r"><button class="link" data-user-toggle="${u.id}" data-active="${u.active}">${u.active ? 'disable' : 'enable'}</button> ·
          <button class="link" data-user-pw="${u.id}">reset password</button></td>
    </tr>`).join('')}</tbody></table>`;
  $$('[data-user-role]').forEach((s) => s.addEventListener('change', async () => {
    try { await patch(`/api/users/${s.dataset.userRole}`, { role: s.value }); toast('Role updated'); } catch (err) { toast(err.message, 'err'); loadUsers(); }
  }));
  $$('[data-user-toggle]').forEach((b) => b.addEventListener('click', async () => {
    try { await patch(`/api/users/${b.dataset.userToggle}`, { active: b.dataset.active !== '1' }); loadUsers(); } catch (err) { toast(err.message, 'err'); }
  }));
  $$('[data-user-pw]').forEach((b) => b.addEventListener('click', async () => {
    const pw = prompt('New password (at least 8 characters):');
    if (!pw) return;
    try { await patch(`/api/users/${b.dataset.userPw}`, { password: pw }); toast('Password reset'); } catch (err) { toast(err.message, 'err'); }
  }));
}

$('#form-user').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const u = await post('/api/users', formData(e.target));
    e.target.reset();
    msg($('#user-msg'), `${u.username} created as ${u.role}.`, 'ok');
    loadUsers();
  } catch (err) { msg($('#user-msg'), err.message); }
});

/* --------------------------------- session --------------------------------- */

async function openSession(id, keepScroll = false) {
  const scroll = window.scrollY;
  CURRENT = await api(`/api/sessions/${id}`);
  renderSession();
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-session'));
  $$('.side .tab').forEach((b) => b.classList.toggle('on', b.dataset.view === 'tests'));
  history.replaceState(null, '', `/app#report/${id}`);
  window.scrollTo(0, keepScroll ? scroll : 0);
}

async function refresh(openKey) {
  await openSession(CURRENT.session.id, true);
  if (openKey) $(`details[data-test="${openKey}"]`)?.setAttribute('open', '');
  loadStats();
}

function overallNote(evaluation, ruleset) {
  const r = Object.entries(evaluation.results);
  const failed = r.filter(([, t]) => t.verdict === 'fail').map(([, t]) => t.label);
  if (failed.length) return `${failed.join(', ')} outside the permissible limits`;
  const c = evaluation.completeness;
  const left = c.missing.length + c.incomplete.length;
  if (left) return `${left} required test${left > 1 ? 's' : ''} still to complete for ${c.purpose === 'verification' ? 'verification' : 'type approval'}`;
  return 'Every recorded point within the permissible error; battery complete';
}

function renderSession() {
  const { session, instrument, ruleset, observations, checks, evaluation, environment, attachments, audit } = CURRENT;
  const u = instrument.units;
  const c = evaluation.classification;
  const open = session.status === 'draft';
  const editable = open && can('engineer');
  const groups = ruleset.groups || [{ id: 'all', label: 'Tests', tests: Object.keys(ruleset.tests) }];
  const envelopePoints = ['weighing', 'eccentricity', 'tare', 'temperature', 'voltage', 'dampHeat', 'tilt', 'warmup', 'spanStability']
    .flatMap((k) => (evaluation.results[k]?.points || []).filter((p) => p.mpe !== null && p.errorInE !== undefined).map((p) => ({ ...p, label: `${evaluation.results[k].label}: ${p.label}` })));
  const comp = evaluation.completeness;

  $('#view-session').innerHTML = `
    <div class="session-head">
      <div>
        <div class="ref">${esc(session.reference)}, opened ${when(session.createdAt)}${session.closedAt ? `, closed ${when(session.closedAt)}` : ''}${session.approvedAt ? `, approved ${when(session.approvedAt)} by ${esc(session.approvedBy)}` : ''}</div>
        <h2>${esc(instrument.manufacturer)} ${esc(instrument.model)} <span class="serial">${esc(instrument.serial)}</span></h2>
        <div class="status">${statusBadge(session.status)} ${badge(evaluation.overall)} ${session.certificateNo ? badge('approved', `Certificate ${session.certificateNo}`) : ''}
          <span class="hint">${session.purpose === 'verification' ? 'Verification' : 'Type approval'} against ${esc(ruleset.label)}, ${session.context === 'initial' ? 'initial-verification limits' : 'in-service limits (× 2)'}</span></div>
      </div>
      <div class="right">
        <button class="btn quiet" id="btn-back">All tests</button>
        <button class="btn ghost" id="btn-html">Report</button>
        <button class="btn ghost" id="btn-docx">Word</button>
        <button class="btn ghost" id="btn-csv" title="Observations as CSV">CSV</button>
        ${editable ? `<label class="btn ghost" title="Import observations from a CSV file" style="cursor:pointer">Import CSV<input type="file" id="csv-input" accept=".csv,text/csv" hidden></label>` : ''}
        <button class="btn" id="btn-pdf">PDF</button>
        ${session.certificateNo ? `<button class="btn brass" id="btn-cert">Certificate</button>` : ''}
      </div>
    </div>

    <div class="summary">
      <div class="card">
        ${envelopeSvg({
          bands: ruleset.classes[instrument.accuracyClass].bands, n: c.nAxis || c.n,
          multiplier: session.context === 'in-service' ? ruleset.inServiceMultiplier : 1,
          points: envelopePoints, height: 340,
          title: `Error envelope, class ${instrument.accuracyClass}, ${session.context === 'initial' ? 'initial verification' : 'in service'} — every load-based point`
        })}
      </div>
      <div class="outcome">
        <span class="lcd-frame">${sevenSegment(evaluation.overall === 'pass' ? 'PASS' : evaluation.overall === 'fail' ? 'FAIL' : '----', { digits: 4, height: 62,
          annunciators: [['DRAFT', session.status === 'draft'], ['CLOSED', session.status === 'complete'], ['APPROVED', session.status === 'approved'], ['CERT', Boolean(session.certificateNo)]] })}</span>
        <div>
          <div class="word ${evaluation.overall}">${evaluation.overall === 'pass' ? 'Conforms to every requirement evaluated' : evaluation.overall === 'fail' ? 'Does not conform' : 'Evaluation in progress'}</div>
          <div class="note">${esc(overallNote(evaluation, ruleset))}</div>
        </div>
        <div class="completeness">
          ${comp.missing.length + comp.incomplete.length === 0
            ? `<span class="ok">All ${comp.required.length} tests required for ${comp.purpose === 'verification' ? 'verification' : 'type approval'} are complete.</span>`
            : `${comp.done.length} of ${comp.required.length} tests required for ${comp.purpose === 'verification' ? 'verification' : 'type approval'} decided. Outstanding:<ul>${[...comp.missing.map((k) => `<li>${esc(ruleset.tests[k].label)}</li>`), ...comp.incomplete.map((k) => `<li>${esc(ruleset.tests[k].label)} (incomplete)</li>`)].join('')}</ul>`}
          ${evaluation.certificateEligible && !session.certificateNo ? '<div class="ok" style="margin-top:8px">Eligible for a certificate of conformity once approved.</div>' : ''}
        </div>
      </div>
    </div>

    ${workflowBox(session, evaluation)}

    <div class="workspace">
    <div class="main">
    <div class="particulars">
      <div class="card">
        <h3>Instrument</h3>
        <div class="kv"><span class="k">Applicant</span><span>${esc(instrument.applicant || instrument.manufacturer)}</span></div>
        <div class="kv"><span class="k">Category</span><span>${esc(instrument.instrumentType || '—')} · ${esc(instrument.indicatingType)}${Number(instrument.electronic) ? ', electronic' : ''}</span></div>
        <div class="kv"><span class="k">Accuracy class</span><span>${esc(instrument.accuracyClass)}, ${esc(c.designation)}</span></div>
        <div class="kv"><span class="k">Max / Min</span><span>${num(instrument.max, u)} / ${num(instrument.min, u)}</span></div>
        ${c.multiRange
          ? `<div class="kv"><span class="k">Partial ranges</span><span>${c.ranges.map((r) => `<div>R${r.index + 1}: e = ${num(r.e, u)} to ${num(r.max, u)}, n = ${num(r.n)}</div>`).join('')}</span></div>`
          : `<div class="kv"><span class="k">e / d / n</span><span>${num(instrument.e, u)} / ${num(instrument.d, u)} / ${num(c.n)} <span class="hint">(${c.nRange ? `${c.nRange[0]}–${c.nRange[1] ?? '∞'}` : '—'} permitted)</span></span></div>`}
        <div class="kv"><span class="k">Changeover method</span><span>${c.changeoverRequired ? 'Required, d > 0.2 e' : 'Optional'}</span></div>
        <div class="kv"><span class="k">Temperature limits</span><span>${num(c.temperature.min, '°C')} / ${num(c.temperature.max, '°C')}</span></div>
        <div class="kv"><span class="k">Supply</span><span>${esc(SUPPLY[instrument.powerSupply] || '—')}${instrument.nominalVoltage ? `, ${num(instrument.nominalVoltage)} V` : ''}${evaluation.supply && evaluation.supply.lower !== null && evaluation.supply.upper !== null ? ` <span class="hint">· test at ${num(evaluation.supply.lower)}–${num(evaluation.supply.upper)} V</span>` : ''}</span></div>
        ${c.findings.length ? `<ul class="findings">${c.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="card">
        <h3>Evaluation</h3>
        <div class="kv"><span class="k">Laboratory</span><span>${esc(session.laboratory)}</span></div>
        <div class="kv"><span class="k">Test engineer</span><span>${esc(session.technician)}</span></div>
        <div class="kv"><span class="k">Test date</span><span>${when(session.testDate || session.createdAt)}</span></div>
        <div class="kv"><span class="k">Application ref.</span><span>${esc(session.applicationRef || '—')}</span></div>
        <div class="kv"><span class="k">Zero error E₀</span><span>${signed(session.zeroError)} ${esc(u)}</span></div>
        <div class="kv"><span class="k">Opened by</span><span>${esc(session.createdBy || '—')}</span></div>
        ${session.approvalNote ? `<div class="kv"><span class="k">Approval note</span><span>${esc(session.approvalNote)}</span></div>` : ''}
        ${session.signature ? `<div class="kv"><span class="k">Signature</span><span class="serial" style="word-break:break-all">${esc(session.signature)}</span></div>` : ''}
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-head"><h3>Laboratory environment</h3><span class="hint">Recorded at the start, during and at the end of testing</span></div>
      ${environment.length ? `<table class="env-table"><thead><tr><th>Stage</th><th class="r">Temperature (°C)</th><th class="r">RH (%)</th><th class="r">Pressure (hPa)</th><th class="r">Voltage (V)</th><th class="r">Frequency (Hz)</th><th>Note</th><th>Recorded</th><th></th></tr></thead>
        <tbody>${environment.map((r) => `<tr><td>${esc(r.stage)}</td><td class="r">${num(r.temperature)}</td><td class="r">${num(r.humidity)}</td><td class="r">${num(r.pressure)}</td><td class="r">${num(r.voltage)}</td><td class="r">${num(r.frequency)}</td><td>${esc(r.note || '')}</td><td>${whenFull(r.recordedAt)}</td>
          <td class="r">${editable ? `<button class="link" data-env-del="${r.id}">remove</button>` : ''}</td></tr>`).join('')}</tbody></table>`
        : `<p class="empty">No environmental readings yet.${session.temperature !== null ? ` Opening values: ${num(session.temperature, '°C')}, ${num(session.humidity, '% RH')}.` : ''}</p>`}
      ${editable ? `<form class="inline-form" id="form-env">
          <div><label>Stage</label><input name="stage" list="stages" required placeholder="During test"><datalist id="stages"><option>Start of test</option><option>During test</option><option>End of test</option><option>Temperature chamber</option></datalist></div>
          <div><label>T (°C)</label><input name="temperature" type="number" step="any"></div>
          <div><label>RH (%)</label><input name="humidity" type="number" step="any"></div>
          <div><label>p (hPa)</label><input name="pressure" type="number" step="any"></div>
          <div><label>U (V)</label><input name="voltage" type="number" step="any"></div>
          <div><label>f (Hz)</label><input name="frequency" type="number" step="any"></div>
          <div><label>Note</label><input name="note"></div>
          <button class="btn sm" type="submit">Add</button>
        </form>` : ''}
    </div>

    ${groups.map((g) => `
      <div class="group-head">${esc(g.label)}<small>${g.tests.filter((k) => evaluation.results[k] && ['pass', 'fail'].includes(evaluation.results[k].verdict)).length} of ${g.tests.length} decided</small></div>
      ${g.tests.filter((k) => evaluation.results[k]).map((k) => testBlock(k, evaluation.results[k], ruleset.tests[k], instrument, observations, checks, editable, session)).join('')}`).join('')}

    <div class="card" style="margin-top:20px">
      <div class="card-head"><h3>Photographs and supporting documents</h3><span class="hint">Data plate, markings, set-up, manufacturer's documents</span></div>
      ${attachments.length ? `<div class="attachments">${attachments.map((a) => `<figure>
          ${a.mime.startsWith('image/') ? `<a href="/api/attachments/${a.id}" target="_blank"><img src="/api/attachments/${a.id}" alt="${esc(a.caption || a.filename)}"></a>` : `<a class="doc" href="/api/attachments/${a.id}" target="_blank">${esc(a.mime.split('/')[1].toUpperCase().slice(0, 12))} · ${(a.size / 1024).toFixed(0)} kB</a>`}
          <figcaption><span>${esc(a.caption || a.filename)}</span>${editable ? `<button class="link" data-att-del="${a.id}">remove</button>` : ''}</figcaption></figure>`).join('')}</div>` : '<p class="empty">Nothing attached yet.</p>'}
      ${editable ? `<div class="drop" id="drop">Drop images or PDFs here, or <label style="display:inline;text-decoration:underline;cursor:pointer">choose files<input type="file" id="file-input" multiple accept="image/*,application/pdf,.txt,.csv,.docx,.xlsx" hidden></label>. Up to 8 MB each.</div>` : ''}
    </div>

    <div class="card remarks-box" style="margin-top:20px">
      <div class="card-head"><h3>Remarks</h3>${editable ? '<span class="hint">Saved when you leave the field</span>' : ''}</div>
      ${editable ? `<textarea id="remarks" placeholder="Observations about the instrument, deviations from the procedure, conditions worth recording…">${esc(session.remarks || '')}</textarea>`
        : `<p>${esc(session.remarks || '—')}</p>`}
    </div>

    <div class="card" style="margin-top:20px">
      <h3>Audit trail</h3>
      <div class="audit-list" style="margin-top:10px">${audit.slice().reverse().map((a) => `<div>${whenFull(a.at)} <b>${esc(a.actor || 'system')}</b> ${esc(a.action)}${a.detail ? `: ${esc(a.detail)}` : ''}</div>`).join('') || '<span class="empty">—</span>'}</div>
    </div>
    </div>

    <aside class="navigator" aria-label="Tests in this report">
      <div class="prog"><span>${comp.done.length} of ${comp.required.length} required tests decided</span><span class="pbar"><i style="width:${comp.required.length ? (comp.done.length / comp.required.length) * 100 : 0}%"></i></span></div>
      ${groups.map((g) => `<div class="grp">${esc(g.label)}</div>${g.tests.filter((k) => evaluation.results[k]).map((k) => `<a href="#t-${k}" data-nav="${k}"><i class="${String(evaluation.results[k].verdict).replace(/-/g, '')}"></i>${esc(evaluation.results[k].label)}</a>`).join('')}`).join('')}
    </aside>
    </div>
  `;

  $$('[data-nav]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const d = $(`details[data-test="${a.dataset.nav}"]`);
    if (d) { d.setAttribute('open', ''); d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));
  powerOn($('#view-session'));
  bindSessionActions(editable);
}

function workflowBox(session, evaluation) {
  const open = session.status === 'draft';
  if (open && can('engineer')) {
    return `<div class="approve-box"><p>${evaluation.overall === 'incomplete'
      ? 'The battery is not complete. You can keep recording, or close the report as incomplete.'
      : `Evaluation ${evaluation.overall === 'pass' ? 'passes' : 'fails'}. Closing freezes the observations and sends the report for approval.`}</p>
      <button class="btn" id="btn-close">Close report${evaluation.overall === 'incomplete' ? ' as incomplete' : ''}</button></div>`;
  }
  if (session.status === 'complete') {
    return `<div class="approve-box"><p>Closed by the test engineer with outcome <b>${esc(session.outcomeAtClose || evaluation.overall)}</b>. ${can('approver')
      ? (evaluation.certificateEligible ? 'Approving will sign the report and issue a certificate of conformity.' : 'Approving will sign the report; no certificate is issued for this outcome.')
      : 'Awaiting review by an approving officer.'}</p>
      ${can('engineer') ? '<button class="btn quiet" id="btn-reopen">Reopen</button>' : ''}
      ${can('approver') ? `<input id="approve-note" placeholder="Approval note (optional)" style="max-width:280px"><button class="btn ghost" id="btn-return">Return to engineer</button><button class="btn brass" id="btn-approve">Approve and sign</button>` : ''}</div>`;
  }
  if (session.status === 'approved') {
    return `<div class="approve-box"><p>Approved and signed by <b>${esc(session.approvedBy)}</b> on ${when(session.approvedAt)}.${session.certificateNo ? ` Certificate <b>${esc(session.certificateNo)}</b> issued.` : ' No certificate: the outcome did not qualify.'}</p>
      ${can('approver') ? '<button class="btn quiet" id="btn-reopen">Withdraw and reopen</button>' : ''}</div>`;
  }
  return '';
}

function bindSessionActions(editable) {
  const { session } = CURRENT;
  const id = session.id;
  $('#btn-back').addEventListener('click', () => go('tests'));
  $('#btn-html').addEventListener('click', () => window.open(`/api/sessions/${id}/report.html`, '_blank'));
  $('#btn-docx').addEventListener('click', () => download(`/api/sessions/${id}/report.docx`, `${session.reference.replace(/\//g, '-')}.docx`));
  $('#btn-pdf').addEventListener('click', () => download(`/api/sessions/${id}/report.pdf`, `${session.reference.replace(/\//g, '-')}.pdf`, `/api/sessions/${id}/report.html`));
  $('#btn-cert')?.addEventListener('click', () => download(`/api/sessions/${id}/certificate.pdf`, `${session.certificateNo.replace(/\//g, '-')}.pdf`, `/api/sessions/${id}/certificate.html`));
  $('#btn-csv').addEventListener('click', () => download(`/api/sessions/${id}/observations.csv`, `${session.reference.replace(/\//g, '-')}-observations.csv`));
  $('#csv-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const csv = await file.text();
    try {
      const r = await post(`/api/sessions/${id}/observations/import`, { csv });
      const parts = [`${r.added} observation${r.added === 1 ? '' : 's'} imported`];
      if (r.warned.length) parts.push(`${r.warned.length} with warnings`);
      if (r.rejected.length) parts.push(`${r.rejected.length} rejected: ${r.rejected.slice(0, 3).map((x) => `row ${x.row} (${x.error})`).join('; ')}${r.rejected.length > 3 ? '…' : ''}`);
      toast(parts.join('. '), r.rejected.length ? 'warn' : '');
      refresh();
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  });

  $('#btn-close')?.addEventListener('click', async () => {
    try {
      try { await post(`/api/sessions/${id}/close`); }
      catch (err) {
        if (!/incomplete/.test(err.message)) throw err;
        if (!confirm('The evaluation is incomplete. Close it anyway and file it as incomplete?')) return;
        await post(`/api/sessions/${id}/close`, { force: true });
      }
      toast('Report closed and sent for approval'); refresh();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#btn-reopen')?.addEventListener('click', async () => {
    if (session.status === 'approved' && !confirm('Withdraw the approval and any certificate, and reopen the report?')) return;
    try { await post(`/api/sessions/${id}/reopen`); toast('Report reopened'); refresh(); } catch (err) { toast(err.message, 'err'); }
  });
  $('#btn-approve')?.addEventListener('click', async () => {
    try {
      const r = await post(`/api/sessions/${id}/approve`, { note: $('#approve-note').value });
      toast(r.certificateNo ? `Approved. Certificate ${r.certificateNo} issued.` : 'Approved and signed. No certificate for this outcome.'); refresh();
    } catch (err) { toast(err.message, 'err'); }
  });
  $('#btn-return')?.addEventListener('click', async () => {
    try { await post(`/api/sessions/${id}/return`, { note: $('#approve-note').value }); toast('Returned to the engineer'); refresh(); } catch (err) { toast(err.message, 'err'); }
  });

  if (!editable) return;

  $('#form-env')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await post(`/api/sessions/${id}/environment`, formData(e.target));
      if (r.warnings.length) toast(r.warnings.join(' · '), 'warn'); else toast('Reading added');
      refresh();
    } catch (err) { toast(err.message, 'err'); }
  });
  $$('[data-env-del]').forEach((b) => b.addEventListener('click', async () => { await del(`/api/environment/${b.dataset.envDel}`); refresh(); }));

  $$('[data-obs-form]').forEach((form) => form.addEventListener('input', () => livePreview(form)));
  $$('[data-obs-form]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.dataset.obsForm;
    const holder = e.target.parentElement;
    holder.querySelector('.msg')?.remove();
    try {
      const r = await post(`/api/sessions/${id}/observations`, { testKey: key, ...formData(e.target) });
      if (r.warnings.length) toast(`Recorded with ${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''}: ${r.warnings.join(' · ')}`, 'warn');
      await refresh(key);
    } catch (err) {
      holder.insertAdjacentHTML('beforeend', `<div class="msg err">${esc(err.message)}</div>`);
    }
  }));
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    try { await del(`/api/observations/${b.dataset.del}`); refresh(b.dataset.test); } catch (err) { toast(err.message, 'err'); }
  }));

  $$('.checklist').forEach((table) => {
    const key = table.dataset.checklist;
    table.addEventListener('change', async (e) => {
      const tr = e.target.closest('tr');
      const itemKey = tr.dataset.item;
      const result = tr.querySelector('input[type=radio]:checked')?.value ?? null;
      const remark = tr.querySelector('input.remark').value;
      try { await put(`/api/sessions/${id}/checks`, { testKey: key, itemKey, result, remark }); refresh(key); }
      catch (err) { toast(err.message, 'err'); }
    });
  });

  const remarks = $('#remarks');
  remarks?.addEventListener('blur', async () => {
    if (remarks.value === (session.remarks || '')) return;
    try { await patch(`/api/sessions/${id}`, { remarks: remarks.value }); toast('Remarks saved'); CURRENT.session.remarks = remarks.value; } catch (err) { toast(err.message, 'err'); }
  });

  const drop = $('#drop');
  const upload = async (files) => {
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) { toast(`${file.name} is larger than 8 MB`, 'err'); continue; }
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
      const caption = prompt(`Caption for ${file.name} (optional):`, file.name.replace(/\.[^.]+$/, '')) ?? '';
      try { await post(`/api/sessions/${id}/attachments`, { filename: file.name, mime: file.type || 'application/octet-stream', caption, data }); }
      catch (err) { toast(err.message, 'err'); }
    }
    refresh();
  };
  drop?.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop?.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); });
  $('#file-input')?.addEventListener('change', (e) => upload([...e.target.files]));
  $$('[data-att-del]').forEach((b) => b.addEventListener('click', async () => { await del(`/api/attachments/${b.dataset.attDel}`); refresh(); }));
}

async function download(url, name, fallback) {
  const res = await fetch(url);
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    if (fallback) { window.open(fallback, '_blank'); toast(e.error || 'PDF unavailable; opened the HTML version', 'warn'); }
    else toast(e.error || 'download failed', 'err');
    return;
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ------------------------------ test blocks ------------------------------ */

function testBlock(key, t, spec, instrument, observations, checks, editable, session) {
  const u = instrument.units;
  const rows = observations.filter((o) => o.testKey === key);
  const open = t.verdict === 'fail' || t.verdict === 'error' ? ' open' : '';
  const count = t.kind === 'checklist' ? `${t.answered ?? 0} of ${t.total ?? 0} items` : `${rows.length} observation${rows.length === 1 ? '' : 's'}`;
  const warned = rows.filter((o) => o.warnings && o.warnings.length);
  return `<details class="test-block" data-test="${key}" data-verdict="${esc(t.verdict)}" id="t-${key}"${open}>
    <summary>${esc(t.label)} ${badge(t.verdict)}<span class="clause">R 76‑1 ${esc(spec.clause || '')}</span><span class="count">${count}</span></summary>
    <div class="test-body">
      <p class="crit">${esc(t.description || '')}${t.criterion ? ` <span class="clause">· ${esc(t.criterion)}</span>` : ''}</p>
      ${t.verdict === 'not-applicable' ? `<p class="empty">Not applicable to this instrument: ${esc(t.note || '')}.</p>` : `
        ${t.kind === 'checklist' ? checklistTable(key, t, checks, editable)
          : t.points.length ? `<div class="tbl">${resultTable(t, rows, u, key, editable)}</div>` : '<p class="empty">No observations recorded for this test.</p>'}
        ${extras(t, u)}
        ${t.note && t.kind !== 'checklist' ? `<p class="hint" style="margin-top:8px">${esc(t.note)}</p>` : ''}
        ${planNote(t)}
        ${warned.length ? `<div class="warnings">Recorded with warnings:<ul>${warned.map((o) => `<li><b>${esc(o.label)}</b>: ${o.warnings.map(esc).join('; ')}</li>`).join('')}</ul></div>` : ''}
        ${editable && t.kind !== 'checklist' ? entryForm(key, spec, instrument, rows, session).replace(/<\/form><\/div>$/, `</form><div class="live" data-live="${key}"><p class="idle">Type a load and an indication to see the corrected error against the permissible limit before you record it.</p></div></div>`) : ''}`}
    </div>
  </details>`;
}

function planNote(t) {
  if (!t.plan) return '';
  if (t.plan.missing !== undefined) {
    if (t.plan.satisfied) return `<p class="plan">Load plan (${esc(t.plan.clause)}) satisfied: ${t.plan.recorded} loads including Min, Max and the band changes${t.plan.boundaries.length ? ` at ${t.plan.boundaries.map((b) => num(b)).join(', ')}` : ''}.</p>`;
    return `<p class="plan">Load plan (${esc(t.plan.clause)}): <span class="miss">${[...t.plan.missing.map((m) => `missing ${esc(m)}`), ...t.plan.notes.map(esc)].join('; ')}</span>.</p>`;
  }
  if (t.plan.steps) return `<p class="plan">Sequence: ${t.plan.steps.map(esc).join(' → ')}${t.conditions && t.conditions.length ? ` · recorded so far: ${t.conditions.map(esc).join(', ')}` : ''}.</p>`;
  return '';
}

function extras(t, u) {
  if (t.kind === 'spread' && t.series) return t.series.map((s) => `<div class="spread-note">Series at ${num(s.load, u)}: spread across ${s.runs} of ${s.runsRequired} weighings <b>${num(s.spread, u)}</b> against a limit of ${num(s.spreadLimit, u)} ${badge(s.spreadVerdict)}</div>`).join('');
  if (t.kind === 'span' && t.variation !== undefined) return `<div class="spread-note">Variation of error across ${t.measurements} of ${t.measurementsRequired} measurements: <b>${num(t.variation, u)}</b> against a limit of ${num(t.variationLimit, u)} ${badge(t.variationVerdict)}</div>`;
  if (t.kind === 'creep' && t.between15and30 !== null && t.between15and30 !== undefined) return `<div class="spread-note">Change between minute 15 and minute 30: <b>${signed(t.between15and30)} ${esc(u)}</b> against a limit of ${num(t.between15and30Limit, u)}</div>`;
  if (t.kind === 'timed' && t.missingTimes && t.missingTimes.length) return `<div class="spread-note">Still to read at ${t.missingTimes.join(', ')} min.</div>`;
  return '';
}

function checklistTable(key, t, checks, editable) {
  return `<table class="checklist" data-checklist="${key}"><thead><tr><th style="width:4%">#</th><th>Requirement</th><th style="width:10%">Clause</th><th style="width:11%">Level</th><th style="width:20%">Finding</th><th style="width:22%">Remark</th></tr></thead>
    <tbody>${t.points.map((p, i) => `<tr data-item="${p.key}">
      <td>${i + 1}</td><td>${esc(p.label)}</td><td class="serial">${esc(p.clause)}</td><td>${p.level === 'compulsory' ? 'Compulsory' : 'If applicable'}</td>
      <td>${editable ? `<div class="opts">${[['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']].map(([v, l]) => `<label class="${p.result === v ? `on ${v}` : ''}"><input type="radio" name="ck-${key}-${p.key}" value="${v}"${p.result === v ? ' checked' : ''}>${l}</label>`).join('')}</div>`
        : (p.result === 'yes' ? badge('pass', 'yes') : p.result === 'no' ? badge('fail', 'no') : p.result === 'na' ? badge('not-applicable', 'n/a') : '<span class="serial">—</span>')}</td>
      <td>${editable ? `<input class="remark" value="${esc(p.remark || '')}" placeholder="optional">` : esc(p.remark || '')}</td>
    </tr>`).join('')}</tbody></table>`;
}

function resultTable(t, rows, u, key, editable) {
  const byLabel = (p) => rows.find((o) => o.label === p.label && (p.condition === undefined || (o.condition ?? null) === (p.condition ?? null)) && (p.timeMin === undefined || (o.timeMin ?? null) === (p.timeMin ?? null)));
  const delBtn = (p) => { const o = byLabel(p); return editable && o ? `<button class="link" data-del="${o.id}" data-test="${key}">remove</button>` : ''; };
  const flag = (p) => { const o = byLabel(p); return o && o.warnings && o.warnings.length ? ` <span class="warn-flag" title="${esc(o.warnings.join('\n'))}">⚠</span>` : ''; };
  const errCell = (v, verdict) => `<td class="r ${verdict === 'fail' ? 'err' : ''}">${signed(v)}</td>`;

  if (t.kind === 'discrimination') {
    return `<table><thead><tr><th>Point</th><th class="r">Load</th><th class="r">Before</th><th class="r">Added (1.4 d)</th><th class="r">After</th><th class="r">Change</th><th class="r">Required</th><th class="c">Result</th><th></th></tr></thead>
      <tbody>${t.points.map((p) => `<tr><td>${esc(p.label)}${flag(p)}</td><td class="r">${num(p.load, u)}</td><td class="r">${num(p.indication, u)}</td><td class="r">${num(p.addedLoad, u)}</td>
      <td class="r">${num(p.indicationAfter, u)}</td>${errCell(p.change, p.verdict)}<td class="r">≥ ${num(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td><td class="r">${delBtn(p)}</td></tr>`).join('')}</tbody></table>`;
  }
  if (t.kind === 'limit') {
    return `<table><thead><tr><th>Point</th><th class="r">Nominal</th><th class="r">Indication</th><th class="r">Error</th><th class="r">Limit</th><th class="c">Result</th><th></th></tr></thead>
      <tbody>${t.points.map((p) => `<tr><td>${esc(p.label)}${flag(p)}</td><td class="r">${num(p.load, u)}</td><td class="r">${num(p.indication, u)}</td>${errCell(p.error, p.verdict)}<td class="r">± ${num(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td><td class="r">${delBtn(p)}</td></tr>`).join('')}</tbody></table>`;
  }
  if (t.kind === 'deviation') {
    return `<table><thead><tr><th>Point</th><th class="r">Load rested</th><th class="r">Zero before</th><th class="r">Zero after</th><th class="r">Deviation</th><th class="r">Limit</th><th class="c">Result</th><th></th></tr></thead>
      <tbody>${t.points.map((p) => `<tr><td>${esc(p.label)}${flag(p)}</td><td class="r">${num(p.load, u)}</td><td class="r">${num(p.indication, u)}</td><td class="r">${num(p.indicationAfter, u)}</td>${errCell(p.deviation, p.verdict)}<td class="r">± ${num(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td><td class="r">${delBtn(p)}</td></tr>`).join('')}</tbody></table>`;
  }
  if (t.kind === 'zero-drift') {
    return `<table><thead><tr><th>Reading</th><th class="r">Temperature</th><th class="r">Zero indication</th><th></th></tr></thead>
      <tbody>${(t.readings || []).map((r) => { const o = rows.find((x) => x.label === r.label); return `<tr><td>${esc(r.label)}</td><td class="r">${num(r.temperature, '°C')}</td><td class="r">${num(r.zero, u)}</td><td class="r">${editable && o ? `<button class="link" data-del="${o.id}" data-test="${key}">remove</button>` : ''}</td></tr>`; }).join('')}</tbody></table>
      ${t.points.length ? `<table style="margin-top:10px"><thead><tr><th>Step</th><th class="r">ΔT</th><th class="r">Δzero</th><th class="r">Per ${t.perDegrees} °C</th><th class="r">Limit</th><th class="c">Result</th></tr></thead>
      <tbody>${t.points.map((p) => `<tr><td>${esc(p.label)}</td><td class="r">${signed(p.deltaT)} °C</td><td class="r">${signed(p.deltaZero)}</td>${errCell(p.perStep, p.verdict)}<td class="r">${num(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  if (t.kind === 'creep') {
    return `<table><thead><tr><th>Reading</th><th class="r">Time (min)</th><th class="r">Load</th><th class="r">Indication</th><th class="r">Drift from t = 0</th><th>Window</th><th class="r">Limit</th><th class="c">Result</th><th></th></tr></thead>
      <tbody>${t.points.map((p) => `<tr><td>${esc(p.label)}${flag(p)}</td><td class="r">${num(p.timeMin)}</td><td class="r">${num(p.load, u)}</td><td class="r">${num(p.indication, u)}</td>${errCell(p.drift, p.verdict)}<td>${esc(p.window)}</td><td class="r">± ${num(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td><td class="r">${delBtn(p)}</td></tr>`).join('')}</tbody></table>`;
  }

  const anyTare = t.points.some((p) => p.tare !== null && p.tare !== undefined);
  const anyCo = t.points.some((p) => p.addedLoad !== null && p.addedLoad !== undefined);
  const anyMulti = new Set(t.points.map((p) => p.e)).size > 1;
  const extra = t.kind === 'timed' ? [['Time (min)', (p) => num(p.timeMin)]]
    : t.kind === 'conditioned' ? [['Condition', (p) => esc(p.condition ?? '—')]]
    : t.kind === 'tilt' ? [['Position', (p) => esc(p.condition ?? '—')], ['Check', (p) => p.check === 'no-load shift' ? `shift ${p.shift === null || p.shift === undefined ? '—' : signed(p.shift)}` : esc(p.check || '')]] : [];
  return `<table><thead><tr><th>Point</th>${extra.map(([l]) => `<th>${l}</th>`).join('')}<th class="c">↓↑</th><th class="r">Load</th>${anyTare ? '<th class="r">Tare</th>' : ''}
    <th class="r">Indication</th>${anyCo ? '<th class="r">Added ΔL</th><th class="r">Corrected</th>' : ''}
    <th class="r">E</th><th class="r">E₀</th><th class="r">Ec</th>${anyMulti ? '<th class="r">e</th>' : ''}<th class="r">MPE</th><th class="c">Band</th><th class="c">Result</th><th></th></tr></thead>
    <tbody>${t.points.map((p) => `<tr><td>${esc(p.label)}${flag(p)}${p.remark ? `<div class="serial">${esc(p.remark)}</div>` : ''}</td>${extra.map(([, f]) => `<td>${f(p)}</td>`).join('')}
    <td class="c">${p.direction === 'decreasing' ? '↑' : '↓'}</td><td class="r">${num(p.load, u)}</td>
    ${anyTare ? `<td class="r">${num(p.tare, u)}</td>` : ''}
    <td class="r">${num(p.indication, u)}</td>
    ${anyCo ? `<td class="r">${p.addedLoad === null || p.addedLoad === undefined ? '—' : num(p.addedLoad, u)}</td><td class="r">${num(p.corrected, u)}</td>` : ''}
    <td class="r">${signed(p.rawError)}</td><td class="r">${signed(p.zeroError)}</td>${errCell(p.error, p.verdict)}
    ${anyMulti ? `<td class="r">${num(p.e, u)}</td>` : ''}<td class="r">${p.mpe === null || p.mpe === undefined ? '—' : `± ${num(p.mpe, u)}`}</td><td class="c">${esc(p.band || '')}</td>
    <td class="c">${badge(p.verdict)}</td><td class="r">${delBtn(p)}</td></tr>`).join('')}</tbody></table>`;
}

/* ------------------------------ live preview ------------------------------ */

const decimalsOf = (d) => (String(d).split('.')[1] || '').length;
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function clientRanges(instrument) {
  let r = instrument.ranges; if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  if (!Array.isArray(r) || !r.length) return [{ e: instrument.e, max: instrument.max, d: instrument.d }];
  return r.map((x) => ({ e: Number(x.e), max: Number(x.max), d: Number(x.d ?? x.e) })).sort((a, b) => a.max - b.max);
}
function clientRangeAt(instrument, load) {
  const rs = clientRanges(instrument);
  return rs.find((x) => Math.abs(load) <= x.max + 1e-9) || rs[rs.length - 1];
}
function clientMpe(instrument, load, context) {
  const cls = CURRENT.ruleset.classes[instrument.accuracyClass];
  const e = clientRangeAt(instrument, load).e;
  const loadInE = Math.abs(load) / e;
  const band = cls.bands.find(([lo, hi]) => (lo === 0 ? loadInE >= 0 : loadInE > lo) && (hi === null || loadInE <= hi));
  if (!band) return null;
  return band[2] * e * (context === 'in-service' ? CURRENT.ruleset.inServiceMultiplier : 1);
}

function livePreview(form) {
  const key = form.dataset.obsForm;
  const box = $(`[data-live="${key}"]`);
  if (!box) return;
  const { instrument, session, ruleset, observations } = CURRENT;
  const spec = ruleset.tests[key];
  const u = instrument.units;
  const e = instrument.e;
  const dec = decimalsOf(instrument.d);
  const digits = Math.max(5, String(Math.round(instrument.max)).length + dec + 1);
  const f = (name) => numOrNull(form[name]?.value);
  const indication = f('indication');
  const load = f('load');
  const lcd = (value, ann) => `<span class="lcd-frame">${sevenSegment(value === null ? '' : value.toFixed(dec), { digits, height: 54, unit: u, annunciators: ann })}</span>`;
  const idle = () => { box.innerHTML = lcd(indication, [['ZERO', indication === 0], ['NET', false], ['STABLE', indication !== null]]) + '<p class="idle">Enter the load and the indication.</p>'; };
  if (indication === null) { box.innerHTML = '<p class="idle">Type a load and an indication to see the corrected error against the permissible limit before you record it.</p>'; return; }
  const fmt = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
  const rows = observations.filter((o) => o.testKey === key);

  switch (spec.kind) {
    case 'discrimination': {
      const after = f('indicationAfter');
      const required = spec.minChangeD * instrument.d;
      if (after === null) return idle();
      const change = after - indication;
      const ok = change >= required - 1e-9;
      box.innerHTML = lcd(after, [['ZERO', false], ['NET', false], ['STABLE', true]]) +
        `<div class="calc"><div>Change on adding ${fmt(spec.addedWeightD * instrument.d)} ${u}: <b>${change > 0 ? '+' : ''}${fmt(change)} ${u}</b></div><div>Required at least ${fmt(required)} ${u}</div><div>${badge(ok ? 'pass' : 'fail')}</div></div>`;
      return;
    }
    case 'limit': {
      const limit = spec.limitE * e;
      const error = indication - (load ?? 0);
      box.innerHTML = lcd(indication, [['ZERO', Math.abs(indication) < 1e-9], ['NET', false], ['STABLE', true]]) + mpeGauge({ error, mpe: limit, e, units: u });
      return;
    }
    case 'deviation': {
      const after = f('indicationAfter');
      if (after === null) return idle();
      box.innerHTML = lcd(after, [['ZERO', Math.abs(after) < 1e-9], ['NET', false], ['STABLE', true]]) + mpeGauge({ error: after - indication, mpe: spec.limitE * e, e, units: u });
      return;
    }
    case 'creep': {
      const first = rows.slice().sort((a, b) => a.timeMin - b.timeMin)[0];
      const t = f('timeMin');
      if (!first) { box.innerHTML = lcd(indication, [['ZERO', false], ['NET', false], ['STABLE', true]]) + '<p class="idle">This is the first reading; later readings are judged against it.</p>'; return; }
      const limit = t !== null && t <= 30 ? spec.within30MinE * e : (clientMpe(instrument, first.load, session.context) ?? spec.within30MinE * e);
      box.innerHTML = lcd(indication, [['ZERO', false], ['NET', false], ['STABLE', true]]) + mpeGauge({ error: indication - first.indication, mpe: limit, e, units: u, label: 'drift' })
        + `<div class="calc"><div>Drift from the reading on loading (${fmt(first.indication)} ${u}); limit ${t !== null && t <= 30 ? `${spec.within30MinE} e in the first 30 min` : 'the mpe at this load over four hours'}.</div></div>`;
      return;
    }
    case 'zero-drift': {
      const T = f('condition');
      const added = f('addedLoad');
      const zero = added === null ? indication : indication + 0.5 * e - added;
      const prev = rows[rows.length - 1];
      const per = spec.perDegrees[instrument.accuracyClass] ?? spec.perDegrees.default;
      let extra = '<p class="idle">First temperature; the next reading is compared with this one.</p>';
      if (prev && T !== null && Number.isFinite(Number(prev.condition)) && Math.abs(Number(prev.condition) - T) > 1e-9) {
        const prevZero = prev.addedLoad === null ? prev.indication : prev.indication + 0.5 * e - prev.addedLoad;
        const perStep = Math.abs(zero - prevZero) / Math.abs(T - Number(prev.condition)) * per;
        extra = mpeGauge({ error: perStep, mpe: spec.limitE * e, e, units: u }) + `<div class="calc"><div>Change of zero per ${per} °C between ${fmt(prev.condition)} °C and ${fmt(T)} °C.</div></div>`;
      }
      box.innerHTML = lcd(indication, [['ZERO', Math.abs(indication) < 1e-9], ['NET', false], ['STABLE', true]]) + extra;
      return;
    }
    default: {
      if (load === null) return idle();
      const tare = spec.netBasis ? f('tare') : null;
      const net = spec.netBasis ? load - (tare ?? 0) : load;
      const added = spec.changeover ? f('addedLoad') : null;
      const z0 = spec.zeroCorrected ? (f('zeroError') ?? session.zeroError ?? 0) : 0;
      const eR = clientRangeAt(instrument, net).e;
      const corrected = added === null ? indication : indication + 0.5 * eR - added;
      const error = corrected - net - z0;
      let mpe = clientMpe(instrument, net, session.context);
      let note = '';
      if (spec.kind === 'tilt' && net === 0) {
        const ref = rows.find((o) => o.condition === spec.conditions[0] && o.load === 0);
        const position = form.condition?.value;
        if (position === spec.conditions[0]) { box.innerHTML = lcd(indication, [['ZERO', true], ['NET', false], ['STABLE', true]]) + '<p class="idle">Reference zero in the level position. Tilted no-load readings are compared with it.</p>'; return; }
        if ((spec.noLoadExemptClasses || []).includes(instrument.accuracyClass)) { box.innerHTML = lcd(indication, [['ZERO', true], ['NET', false], ['STABLE', true]]) + '<p class="idle">No-load shift is not limited for class II.</p>'; return; }
        if (!ref) { box.innerHTML = lcd(indication, [['ZERO', true], ['NET', false], ['STABLE', true]]) + '<p class="idle">Record the level-position zero first.</p>'; return; }
        const shift = corrected - (ref.addedLoad === null ? ref.indication : ref.indication + 0.5 * e - ref.addedLoad);
        box.innerHTML = lcd(indication, [['ZERO', Math.abs(indication) < 1e-9], ['NET', false], ['STABLE', true]]) + mpeGauge({ error: shift, mpe: spec.noLoadLimitE * e, e, units: u }) + `<div class="calc"><div>No-load shift against the level position; limit ${spec.noLoadLimitE} e.</div></div>`;
        return;
      }
      if (mpe === null) { box.innerHTML = lcd(indication, [['ZERO', false], ['NET', false], ['STABLE', true]]) + `<p class="idle">${fmt(net)} ${u} is beyond the last band for class ${instrument.accuracyClass}.</p>`; return; }
      if (spec.kind === 'span') note = `<div>Variation between measurements is judged once eight are recorded.</div>`;
      box.innerHTML = lcd(indication, [['ZERO', Math.abs(indication) < 1e-9], ['NET', spec.netBasis && (tare ?? 0) > 0], ['STABLE', true]]) + mpeGauge({ error, mpe, e: eR, units: u }) +
        `<div class="calc"><div>${added === null ? `Raw reading; error = I − L${spec.zeroCorrected ? ' − E₀' : ''}.` : `Corrected indication P = ${fmt(indication)} + ${fmt(0.5 * eR)} − ${fmt(added)} = <b>${fmt(corrected)} ${u}</b>`}</div>
          <div>Load in intervals: ${fmt(net / eR)} e${eR !== e ? ` (e = ${fmt(eR)} ${u} in this range)` : ''}${session.context === 'in-service' ? ', in-service limit' : ''}${z0 ? `; E₀ = ${z0 > 0 ? '+' : ''}${fmt(z0)} ${u}` : ''}</div>${note}</div>`;
    }
  }
}

/* ------------------------------ entry forms ------------------------------ */

function entryForm(key, spec, instrument, rows, session) {
  const u = instrument.units;
  const head = (title) => `<div class="entry"><div class="title">${title}</div>`;
  const submit = `<div class="span4 actions" style="justify-content:flex-end"><button class="btn" type="submit">Record</button></div>`;
  const co = spec.changeover ? `<div><label>Added until display stepped, ΔL (${u})</label><input name="addedLoad" type="number" step="any" placeholder="blank = raw reading"></div>` : '';
  const z0 = spec.zeroCorrected ? `<div><label>Zero error E₀ at this point (${u})</label><input name="zeroError" type="number" step="any" placeholder="blank = session E₀ ${signed(session.zeroError)}"></div>` : '';
  const remark = `<div class="span2"><label>Remark</label><input name="remark" placeholder="optional"></div>`;
  const nextRun = `Run ${rows.length + 1}`;

  switch (spec.kind) {
    case 'discrimination':
      return `${head('Record an observation')}<form class="grid" data-obs-form="${key}">
        <div><label>Point</label><input name="label" required placeholder="At 10 kg"></div>
        <div><label>Load (${u})</label><input name="load" type="number" step="any" required></div>
        <div><label>Indication before (${u})</label><input name="indication" type="number" step="any" required></div>
        <div><label>Indication after (${u})</label><input name="indicationAfter" type="number" step="any" required></div>
        <div class="span2 hint">A weight of ${spec.addedWeightD} d = ${num(spec.addedWeightD * instrument.d, u)} is deposited; the indication must move by at least ${num(spec.minChangeD * instrument.d, u)}.</div>${remark}${submit}</form></div>`;

    case 'limit':
      return `${head('Record an observation')}<form class="grid" data-obs-form="${key}">
        <div><label>Point</label><input name="label" required placeholder="After zero set"></div>
        <div><label>Nominal (${u})</label><input name="load" type="number" step="any" value="0" required></div>
        <div><label>Indication (${u})</label><input name="indication" type="number" step="any" required></div>
        <div class="hint" style="align-self:end;padding-bottom:9px">Limit ${spec.limitE} e = ${num(spec.limitE * instrument.e, u)}.</div>${remark}${submit}</form></div>`;

    case 'deviation':
      return `${head('Record zero return')}<form class="grid" data-obs-form="${key}">
        <div><label>Point</label><input name="label" required placeholder="After 30 min near Max"></div>
        <div><label>Load that rested (${u})</label><input name="load" type="number" step="any" required value="${instrument.max}"></div>
        <div><label>Zero indication before (${u})</label><input name="indication" type="number" step="any" required value="0"></div>
        <div><label>Zero indication after (${u})</label><input name="indicationAfter" type="number" step="any" required></div>
        <div class="span2 hint">Limit ${spec.limitE} e = ${num(spec.limitE * instrument.e, u)}. Zero-tracking must be switched off (A.4.11.2).</div>${remark}${submit}</form></div>`;

    case 'creep':
      return `${head('Record a creep reading')}<form class="grid" data-obs-form="${key}">
        <div><label>Reading</label><input name="label" required value="${rows.length === 0 ? 'On loading' : `t = ${[15, 30, 60, 120, 240].find((m) => !rows.some((r) => r.timeMin === m)) ?? ''} min`}"></div>
        <div><label>Minutes after loading</label><input name="timeMin" type="number" step="any" required value="${rows.length === 0 ? 0 : [15, 30, 60, 120, 240].find((m) => !rows.some((r) => r.timeMin === m)) ?? ''}"></div>
        <div><label>Load (${u})</label><input name="load" type="number" step="any" required value="${rows[0]?.load ?? instrument.max}"></div>
        <div><label>Indication (${u})</label><input name="indication" type="number" step="any" required></div>
        <div class="span2 hint">Readings at 0, 15 and 30 min decide the test; continue to 4 h only if the 30-minute limits are missed.</div>${remark}${submit}</form></div>`;

    case 'timed':
      return `${head('Record a warm-up reading')}<form class="grid" data-obs-form="${key}">
        <div><label>Minutes after switch-on</label><select name="timeMin">${spec.timesMin.map((m) => `<option value="${m}"${!rows.some((r) => r.timeMin === m) && rows.length === spec.timesMin.indexOf(m) ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
        <div><label>Point</label><input name="label" required value="Near Max"></div>
        <div><label>Load (${u})</label><input name="load" type="number" step="any" required value="${rows[0]?.load ?? instrument.max}"></div>
        <div><label>Indication (${u})</label><input name="indication" type="number" step="any" required></div>
        ${co}<div><label>Zero error E₀ at this time (${u})</label><input name="zeroError" type="number" step="any" required value="0"></div>${remark}${submit}</form></div>`;

    case 'conditioned': {
      const isTemp = spec.conditionUnit === '°C';
      const isVolt = spec.conditionUnit === 'V';
      const sup = CURRENT.evaluation.supply;
      const suggestions = isTemp ? [20, CURRENT.evaluation.classification.temperature.max, CURRENT.evaluation.classification.temperature.min, 5, 20].filter((v) => v !== null)
        : isVolt && sup && sup.lower !== null && sup.upper !== null ? [sup.lower, sup.nominal, sup.upper].filter((v) => v !== null) : [];
      return `${head('Record an observation under an influence condition')}<form class="grid" data-obs-form="${key}">
        <div><label>${esc(spec.conditionLabel)}${spec.conditionUnit ? ` (${spec.conditionUnit})` : ''}</label><input name="condition" required list="cond-${key}" placeholder="${isTemp ? '20' : isVolt ? '230' : '20 °C, 50 % RH'}">${suggestions.length ? `<datalist id="cond-${key}">${suggestions.map((v) => `<option value="${v}">`).join('')}</datalist>` : ''}</div>
        <div><label>Point</label><input name="label" required placeholder="${spec.loadHint ? spec.loadHint.split(' and ')[0] : 'Max'}"></div>
        <div><label>Direction</label><select name="direction"><option value="increasing">Increasing</option><option value="decreasing">Decreasing</option></select></div>
        <div><label>Load (${u})</label><input name="load" type="number" step="any" required></div>
        <div><label>Indication (${u})</label><input name="indication" type="number" step="any" required></div>
        ${co}${z0}${remark}
        <div class="span4 hint">${spec.loadHint ? `Loads: ${esc(spec.loadHint)}. ` : ''}${isVolt && sup ? (sup.lower !== null && sup.upper !== null ? `Test at ${num(sup.lower)} V and ${num(sup.upper)} V for ${esc(sup.label.toLowerCase())} (${esc(sup.clause)}).` : `Enter the nominal voltage${sup.lowerRule === 'minimum operating voltage' ? ' and minimum operating voltage' : ''} on the instrument to see the limits.`) : ''}${isTemp ? `Instrument limits ${num(CURRENT.evaluation.classification.temperature.min)} / ${num(CURRENT.evaluation.classification.temperature.max)} °C.` : ''}</div>${submit}</form></div>`;
    }

    case 'zero-drift':
      return `${head('Record the zero indication at a temperature')}<form class="grid" data-obs-form="${key}">
        <div><label>Temperature (°C)</label><input name="condition" type="number" step="any" required></div>
        <div><label>Reading</label><input name="label" required placeholder="At 40 °C"></div>
        <div><label>Zero indication (${u})</label><input name="indication" type="number" step="any" required></div>
        <div><label>Added until stepped, ΔL (${u})</label><input name="addedLoad" type="number" step="any" placeholder="optional"></div>
        <input type="hidden" name="load" value="0">
        <div class="span2 hint">Readings are compared in the order recorded; limit ${spec.limitE} e per ${(spec.perDegrees[instrument.accuracyClass] ?? spec.perDegrees.default)} °C.</div>${remark}${submit}</form></div>`;

    case 'tilt':
      return `${head('Record an observation in a position')}<form class="grid" data-obs-form="${key}">
        <div><label>Position</label><select name="condition">${spec.conditions.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div><label>Point</label><input name="label" required placeholder="No load / Max"></div>
        <div><label>Load (${u})</label><input name="load" type="number" step="any" required value="0"></div>
        <div><label>Indication (${u})</label><input name="indication" type="number" step="any" required></div>
        ${co}${z0}${remark}
        <div class="span4 hint">Record the no-load indication in the level position first, then at no load, at self-indication capacity and at Max in each tilted position. Limiting tilt: ${esc(instrument.limitingTilt || spec.defaultLimitingTilt)}.</div>${submit}</form></div>`;

    case 'span':
      return `${head('Record a span stability measurement')}<form class="grid" data-obs-form="${key}">
        <div><label>Measurement (date)</label><input name="label" required value="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label>Load near Max (${u})</label><input name="load" type="number" step="any" required value="${rows[0]?.load ?? instrument.max}"></div>
        <div><label>Indication (${u})</label><input name="indication" type="number" step="any" required></div>
        ${co}${z0}${remark}
        <div class="span4 hint">${spec.minMeasurements} measurements over up to 28 days with the same weights; disconnect the instrument twice for 8 h during the period (B.4).</div>${submit}</form></div>`;

    default: {
      const positions = spec.positions
        ? `<div><label>Position</label><select name="label">${spec.positions.map((p) => `<option>${esc(p)}</option>`).join('')}</select></div>`
        : `<div><label>Point</label><input name="label" required value="${spec.kind === 'spread' ? nextRun : ''}" placeholder="${spec.kind === 'spread' ? nextRun : '10 kg'}"></div>`;
      const plan = spec.loadPlan ? `<div class="span4 hint">Include Min (${num(instrument.min, u)}), Max (${num(instrument.max, u)}) and the band changes at ${bandBoundaries(instrument).map((b) => num(b, u)).join(', ') || '—'}; at least ${spec.loadPlan.minPoints[session.purpose] ?? spec.loadPlan.minPoints['type-approval']} loads, increasing then decreasing.</div>`
        : spec.loadHint ? `<div class="span4 hint">${esc(spec.loadHint)}</div>`
        : spec.testLoadRules ? `<div class="span4 hint">Test load one third of Max + T = ${num((instrument.max + (Number(instrument.tareMaxAdditive) || 0)) / 3, u)} for a receptor with up to four supports (3.6.2.1).</div>` : '';
      return `${head('Record an observation')}<form class="grid" data-obs-form="${key}">
        ${positions}
        ${spec.kind === 'spread' ? '' : `<div><label>Direction</label><select name="direction"><option value="increasing">Increasing</option><option value="decreasing">Decreasing</option></select></div>`}
        <div><label>Load (${u})</label><input name="load" type="number" step="any" required></div>
        ${spec.netBasis ? `<div><label>Tare (${u})</label><input name="tare" type="number" step="any" required></div>` : ''}
        <div><label>Indication (${u})</label><input name="indication" type="number" step="any" required></div>
        ${co}${z0}${remark}${plan}${submit}</form></div>`;
    }
  }
}

function bandBoundaries(instrument) {
  const cls = CURRENT.ruleset.classes[instrument.accuracyClass];
  const out = new Set(); let prev = 0;
  for (const r of clientRanges(instrument)) {
    for (const [, hi] of cls.bands) { if (hi === null) continue; const l = hi * r.e; if (l > prev && l < r.max) out.add(l); }
    if (r.max < instrument.max) out.add(r.max);
    prev = r.max;
  }
  return [...out].sort((a, b) => a - b);
}

/* -------------------------------- routing -------------------------------- */

(async function start() {
  try { ME = await api('/api/me'); } catch { return; }
  applyRoles();
  const h = location.hash.replace('#', '');
  const m = h.match(/^report\/(\d+)$/);
  loadStats();
  if (m) { openSession(Number(m[1])); return; }
  if (['tests', 'instruments', 'new', 'users', 'account'].includes(h)) { go(h); return; }
  go('dashboard');
})();
