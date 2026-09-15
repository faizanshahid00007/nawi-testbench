'use strict';

const fs = require('fs');
const path = require('path');
const qr = require('./qr');
const LOGO = fs.readFileSync(path.join(__dirname, '..', 'public', 'brand', 'logo.svg'), 'utf8').replace(/<svg /, '<svg class="logo" ');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmt = (v, u = '') => (v === null || v === undefined || v === '' ? '—'
  : `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}${u ? ' ' + u : ''}`);
const sign = (v) => (v === null || v === undefined ? '—' : v > 0 ? `+${fmt(v)}` : fmt(v));
const dt = (s) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const date = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'long' }) : '—');

const VERDICT = {
  pass: ['PASS', '#0f6b3f', '#e8f5ee'],
  fail: ['FAIL', '#9d1c1c', '#fdeced'],
  incomplete: ['INCOMPLETE', '#8a5200', '#fdf7ee'],
  'not-performed': ['NOT PERFORMED', '#6b7a86', '#f1f4f6'],
  'not-applicable': ['N/A', '#6b7a86', '#f1f4f6'],
  error: ['ERROR', '#9d1c1c', '#fdeced']
};

function badge(verdict) {
  const [t, fg, bg] = VERDICT[verdict] || VERDICT['not-performed'];
  return `<span class="badge" style="color:${fg};background:${bg}">${t}</span>`;
}

const SUPPLY_LABELS = {
  mains: 'Public mains (AC)', external: 'External / plug-in supply', battery: 'Non-rechargeable battery',
  'vehicle-12': '12 V vehicle battery', 'vehicle-24': '24 V vehicle battery'
};
const RANGE_LABELS = { single: 'Single range', 'multi-interval': 'Multi-interval', 'multiple-range': 'Multiple range' };

/* ---- tables per test kind ------------------------------------------------ */

function loadTable(test, u, extraCols = []) {
  const anyTare = test.points.some((p) => p.tare !== null && p.tare !== undefined);
  const anyChangeover = test.points.some((p) => p.addedLoad !== null && p.addedLoad !== undefined);
  const anyMulti = new Set(test.points.map((p) => p.e)).size > 1;
  const arrow = (p) => (p.direction === 'decreasing' ? '&#8593;' : '&#8595;');
  const head = extraCols.map((c) => `<th${c.align === 'r' ? ' class="r"' : ''}>${c.label}</th>`).join('');
  return `<table><thead><tr>
    <th>Point</th>${head}<th class="c" title="increasing or decreasing load">&#8595;&#8593;</th>
    <th class="r">Load, L</th>${anyTare ? '<th class="r">Tare, T</th>' : ''}
    <th class="r">Indication, I</th>${anyChangeover ? '<th class="r">Add. load, &Delta;L</th>' : ''}
    <th class="r">Error, E</th><th class="r">E<sub>0</sub></th><th class="r">Corrected error, E<sub>c</sub></th>
    ${anyMulti ? '<th class="r">e</th>' : ''}<th class="r">mpe</th><th class="c">Result</th>
    </tr></thead><tbody>${test.points.map((p) => `<tr>
      <td>${esc(p.label)}</td>${extraCols.map((c) => `<td${c.align === 'r' ? ' class="r"' : ''}>${c.value(p)}</td>`).join('')}
      <td class="c mono">${arrow(p)}</td>
      <td class="r">${fmt(p.load, u)}</td>${anyTare ? `<td class="r">${fmt(p.tare, u)}</td>` : ''}
      <td class="r">${fmt(p.indication, u)}</td>
      ${anyChangeover ? `<td class="r">${p.addedLoad === null || p.addedLoad === undefined ? '—' : fmt(p.addedLoad, u)}</td>` : ''}
      <td class="r">${sign(p.rawError)}</td><td class="r">${sign(p.zeroError)}</td>
      <td class="r ${p.verdict}">${sign(p.error)}</td>${anyMulti ? `<td class="r">${fmt(p.e, u)}</td>` : ''}<td class="r">${p.mpe === null ? '—' : `± ${fmt(p.mpe, u)}`}</td>
      <td class="c">${badge(p.verdict)}</td>
    </tr>${p.remark ? `<tr class="remark"><td colspan="20">Remark: ${esc(p.remark)}</td></tr>` : ''}`).join('')}</tbody></table>
    <p class="formula">E = I + &frac12;e &minus; &Delta;L &minus; L &nbsp;·&nbsp;
      E<sub>c</sub> = E &minus; E<sub>0</sub> &nbsp;·&nbsp; check |E<sub>c</sub>| &le; |mpe|</p>`;
}

function pointsTable(test, u) {
  switch (test.kind) {
    case 'discrimination':
      return `<table><thead><tr>
        <th>Point</th><th class="r">Load</th><th class="r">Before</th>
        <th class="r">Added (1.4 d)</th><th class="r">After</th><th class="r">Change</th><th class="r">Required</th><th class="c">Result</th>
        </tr></thead><tbody>${test.points.map((p) => `<tr>
          <td>${esc(p.label)}</td><td class="r">${fmt(p.load, u)}</td><td class="r">${fmt(p.indication, u)}</td>
          <td class="r">${fmt(p.addedLoad, u)}</td><td class="r">${fmt(p.indicationAfter, u)}</td>
          <td class="r ${p.verdict}">${fmt(p.change, u)}</td><td class="r">&ge; ${fmt(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td>
        </tr>`).join('')}</tbody></table>`;

    case 'limit':
      return `<table><thead><tr>
        <th>Point</th><th class="r">Nominal</th><th class="r">Indication</th>
        <th class="r">Error</th><th class="r">Limit</th><th class="c">Result</th>
        </tr></thead><tbody>${test.points.map((p) => `<tr>
          <td>${esc(p.label)}</td><td class="r">${fmt(p.load, u)}</td><td class="r">${fmt(p.indication, u)}</td>
          <td class="r ${p.verdict}">${sign(p.error)}</td><td class="r">± ${fmt(p.mpe, u)}</td>
          <td class="c">${badge(p.verdict)}</td>
        </tr>`).join('')}</tbody></table>`;

    case 'deviation':
      return `<table><thead><tr>
        <th>Point</th><th class="r">Load rested</th><th class="r">Zero before</th><th class="r">Zero after</th>
        <th class="r">Deviation</th><th class="r">Limit</th><th class="c">Result</th>
        </tr></thead><tbody>${test.points.map((p) => `<tr>
          <td>${esc(p.label)}</td><td class="r">${fmt(p.load, u)}</td><td class="r">${fmt(p.indication, u)}</td>
          <td class="r">${fmt(p.indicationAfter, u)}</td><td class="r ${p.verdict}">${sign(p.deviation)}</td>
          <td class="r">± ${fmt(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td>
        </tr>`).join('')}</tbody></table>`;

    case 'zero-drift':
      return `<table><thead><tr>
        <th>Step</th><th class="r">From</th><th class="r">To</th><th class="r">&Delta;T</th>
        <th class="r">Zero before</th><th class="r">Zero after</th><th class="r">&Delta;zero</th>
        <th class="r">Per ${test.perDegrees} °C</th><th class="r">Limit</th><th class="c">Result</th>
        </tr></thead><tbody>${test.points.map((p) => `<tr>
          <td>${esc(p.label)}</td><td class="r">${fmt(p.from, '°C')}</td><td class="r">${fmt(p.to, '°C')}</td>
          <td class="r">${sign(p.deltaT)}</td><td class="r">${fmt(p.zeroFrom, u)}</td><td class="r">${fmt(p.zeroTo, u)}</td>
          <td class="r">${sign(p.deltaZero)}</td><td class="r ${p.verdict}">${fmt(p.perStep, u)}</td>
          <td class="r">${fmt(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td>
        </tr>`).join('')}</tbody></table>`;

    case 'creep':
      return `<table><thead><tr>
        <th>Reading</th><th class="r">Time (min)</th><th class="r">Load</th><th class="r">Indication</th>
        <th class="r">Drift from t = 0</th><th>Window</th><th class="r">Limit</th><th class="c">Result</th>
        </tr></thead><tbody>${test.points.map((p) => `<tr>
          <td>${esc(p.label)}</td><td class="r">${fmt(p.timeMin)}</td><td class="r">${fmt(p.load, u)}</td>
          <td class="r">${fmt(p.indication, u)}</td><td class="r ${p.verdict}">${sign(p.drift)}</td>
          <td>${esc(p.window)}</td><td class="r">± ${fmt(p.mpe, u)}</td><td class="c">${badge(p.verdict)}</td>
        </tr>`).join('')}</tbody></table>
        ${test.between15and30 !== null ? `<p class="spread">Change between minute 15 and minute 30: <b>${sign(test.between15and30)} ${esc(u)}</b> against a limit of ${fmt(test.between15and30Limit, u)}.</p>` : ''}`;

    case 'checklist':
      return `<table><thead><tr>
        <th style="width:6%">#</th><th>Requirement</th><th style="width:12%">Clause</th><th style="width:12%">Level</th>
        <th class="c" style="width:10%">Finding</th><th style="width:22%">Remark</th>
        </tr></thead><tbody>${test.points.map((p, i) => `<tr>
          <td class="mono">${i + 1}</td><td>${esc(p.label)}</td><td class="mono">${esc(p.clause)}</td>
          <td>${p.level === 'compulsory' ? 'Compulsory' : 'If applicable'}</td>
          <td class="c">${p.result === 'yes' ? '<b>Yes</b>' : p.result === 'no' ? '<b style="color:#9d1c1c">No</b>' : p.result === 'na' ? 'N/A' : '—'}</td>
          <td>${esc(p.remark || '')}</td>
        </tr>`).join('')}</tbody></table>`;

    case 'timed':
      return loadTable(test, u, [{ label: 'Time (min)', align: 'r', value: (p) => fmt(p.timeMin) }]);

    case 'conditioned':
      return loadTable(test, u, [{ label: 'Condition', value: (p) => esc(p.condition ?? '—') }]);

    case 'tilt':
      return loadTable(test, u, [
        { label: 'Position', value: (p) => esc(p.condition ?? '—') },
        { label: 'Check', value: (p) => p.check === 'no-load shift' ? `no-load shift ${p.shift === null || p.shift === undefined ? '' : sign(p.shift)}` : esc(p.check || '') }
      ]);

    case 'span':
      return loadTable(test, u) + (test.variation !== undefined
        ? `<p class="spread">Variation of error across ${test.measurements} of ${test.measurementsRequired} measurements:
           <b>${fmt(test.variation, u)}</b> against a limit of ${fmt(test.variationLimit, u)} — ${badge(test.variationVerdict)}</p>` : '');

    case 'spread':
      return loadTable(test, u) + (test.series || []).map((s) =>
        `<p class="spread">Series at ${fmt(s.load, u)}: spread across ${s.runs} of ${s.runsRequired} weighings
         <b>${fmt(s.spread, u)}</b> against a limit of ${fmt(s.spreadLimit, u)} — ${badge(s.spreadVerdict)}</p>`).join('');

    default:
      return loadTable(test, u);
  }
}

function testSection(key, t, spec, u) {
  const plan = t.plan && t.plan.missing ? t.plan : null;
  return `<section class="test" id="t-${key}">
    <div class="test-head"><h3>${esc(t.label)}</h3><span class="clause">R 76-1 ${esc(spec.clause || '')}</span>${badge(t.verdict)}</div>
    <p class="crit">${esc(t.description || '')}${t.criterion ? ` &nbsp;·&nbsp; <span class="mono">${esc(t.criterion)}</span>` : ''}</p>
    ${t.verdict === 'not-performed' ? '<p class="none">No observations recorded for this test.</p>'
      : t.verdict === 'not-applicable' ? `<p class="none">Not applicable: ${esc(t.note || '')}.</p>`
      : t.verdict === 'error' ? `<p class="none">${esc(t.note)}</p>`
      : pointsTable(t, u) + (t.note ? `<p class="none">${esc(t.note)}</p>` : '')}
    ${plan && (plan.missing.length || plan.notes.length)
      ? `<p class="none">Load plan (${esc(plan.clause)}): ${[...plan.missing.map((m) => `missing ${m}`), ...plan.notes].map(esc).join('; ')}.</p>` : ''}
    ${t.kind === 'tilt' && t.limitingTilt ? `<p class="none">Limiting value of tilting: ${esc(t.limitingTilt)}.</p>` : ''}
  </section>`;
}

/* ---- the report ------------------------------------------------------------- */

function render({ session, instrument, ruleset, evaluation, environment = [], attachments = [], audit = [], generatedAt, verifyUrl }) {
  const u = instrument.units;
  const c = evaluation.classification;
  const groups = ruleset.groups || [{ id: 'all', label: 'Tests', tests: Object.keys(ruleset.tests) }];
  const overallText = evaluation.overall === 'pass' ? 'Conforms to the requirements evaluated'
    : evaluation.overall === 'fail' ? 'Does not conform to the requirements evaluated' : 'Evaluation incomplete';
  const temp = c.temperature || {};
  const supply = evaluation.supply;
  const images = attachments.filter((a) => a.mime.startsWith('image/') && a.data);
  const docs = attachments.filter((a) => !a.mime.startsWith('image/'));

  const summaryRows = groups.map((g) => `
    <tr class="group"><td colspan="5">${esc(g.label)}</td></tr>
    ${g.tests.filter((k) => evaluation.results[k]).map((k, i) => {
      const t = evaluation.results[k];
      return `<tr><td class="mono">${i + 1}</td><td>${esc(t.label)}</td>
        <td class="mono">${esc(ruleset.tests[k].clause || '')}</td>
        <td class="c">${t.kind === 'checklist' ? `${t.answered ?? 0}/${t.total ?? t.points.length}` : t.points.length}</td>
        <td class="c">${badge(t.verdict)}</td></tr>`;
    }).join('')}`).join('');

  const testBlocks = groups.map((g) => `
    <h2 class="group-head">${esc(g.label)}</h2>
    ${g.tests.filter((k) => evaluation.results[k]).map((k) => testSection(k, evaluation.results[k], ruleset.tests[k], u)).join('')}`).join('');

  const completeness = evaluation.completeness;
  const outstanding = [...completeness.missing.map((k) => `${ruleset.tests[k].label} not performed`),
                       ...completeness.incomplete.map((k) => `${ruleset.tests[k].label} incomplete`)];

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(session.reference)} — NAWI Test Report</title>
<style>
@page { size: A4; margin: 15mm 14mm; }
:root{--ink:#15202b;--soft:#4a5a68;--faint:#7c8b98;--accent:#0d4f5c;--line:#dde3e8;--tint:#eef5f6;--tintline:#bcd3d7;}
*{box-sizing:border-box}
body{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--ink);font-size:9.4pt;line-height:1.5}
.mono{font-family:Menlo,Consolas,monospace;font-size:.92em}
.r{text-align:right}.c{text-align:center}
header{border-bottom:2.5px solid var(--accent);padding-bottom:5mm;margin-bottom:6mm;display:grid;grid-template-columns:1fr auto;gap:6mm}
.eyebrow{font-size:7.4pt;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);font-weight:600}
h1{font-size:17pt;font-weight:600;margin:.35em 0 .15em;letter-spacing:-.01em}
.ref{font-family:Menlo,Consolas,monospace;font-size:10pt;color:var(--soft)}
.lab{text-align:right;font-size:8.6pt;color:var(--soft)}
.lab b{display:block;color:var(--ink);font-size:10pt}
.brandrow{display:flex;gap:5mm;align-items:flex-start}
.brandrow .logo{width:16mm;height:16mm;flex:none;margin-top:1mm}
.seal{display:grid;grid-template-columns:1fr auto;gap:5mm;align-items:center}
.seal svg{width:26mm;height:26mm}
.verdict-strip{display:flex;align-items:center;gap:4mm;margin-top:4mm}
.verdict-strip .big{font-size:12pt;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm 8mm;margin-bottom:6mm}
.panel{border:1px solid var(--tintline);background:var(--tint);border-radius:3px;padding:4mm 5mm;break-inside:avoid}
.panel h4{font-size:7.6pt;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin:0 0 2.5mm;font-weight:600}
.kv{display:flex;justify-content:space-between;gap:4mm;padding:.9mm 0;border-bottom:1px solid #dae7e9;font-size:8.8pt}
.kv:last-child{border-bottom:none}
.kv .k{color:var(--soft)}.kv .v{font-weight:600;text-align:right}
.test{margin-bottom:6mm;break-inside:avoid}
.test-head{display:flex;align-items:center;gap:3mm;border-bottom:1px solid var(--line);padding-bottom:1.5mm;margin-bottom:1.5mm}
.test-head .clause{color:var(--faint);font-size:8pt;font-family:Menlo,Consolas,monospace}
h2.group-head{font-size:11.5pt;font-weight:600;margin:7mm 0 3mm;padding-bottom:1.5mm;border-bottom:1.5px solid var(--accent)}
h3{font-size:10.5pt;font-weight:600;margin:0;flex:1}
.crit{color:var(--faint);font-size:8.2pt;margin:0 0 2.5mm}
.none{color:var(--faint);font-size:8.4pt;font-style:italic;margin:1mm 0 0}
table{width:100%;border-collapse:collapse;font-size:8.6pt;margin:1mm 0}
th{text-align:left;font-size:7.6pt;font-weight:600;color:var(--accent);border-bottom:1.5px solid var(--tintline);padding:1.3mm 1.8mm;vertical-align:bottom}
th.r{text-align:right}th.c{text-align:center}
td{padding:1.2mm 1.8mm;border-bottom:1px solid var(--line);vertical-align:top}
td.fail{color:#9d1c1c;font-weight:600}
td.pass{font-weight:600}
tr.remark td{font-size:8pt;color:var(--soft);font-style:italic;border-bottom:1px solid var(--line);padding-top:0}
tr.group td{background:var(--tint);font-weight:600;color:var(--accent);font-size:8pt;letter-spacing:.08em;text-transform:uppercase}
.badge{display:inline-block;font-size:7.2pt;font-weight:700;letter-spacing:.09em;padding:.9mm 2.2mm;border-radius:2px;white-space:nowrap}
.spread{font-size:8.6pt;color:var(--soft);margin:2mm 0 0}
.formula{font-family:Menlo,Consolas,monospace;font-size:7.8pt;color:var(--faint);margin:1.5mm 0 0}
.summary{margin-bottom:7mm;break-inside:avoid}
.summary h2{font-size:11.5pt;font-weight:600;margin:0 0 2mm;padding-bottom:1.5mm;border-bottom:1.5px solid var(--accent)}
table.sum td{padding:1.5mm 2mm}
.findings{margin-top:3mm;border:1px solid #e6d3b3;background:#fdf7ee;border-radius:2px;padding:3mm 4mm;font-size:8.6pt;color:#8a5200}
.findings ul{margin:1.5mm 0 0;padding-left:4mm}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-top:3mm}
.photos figure{margin:0;border:1px solid var(--line);padding:2mm;break-inside:avoid}
.photos img{width:100%;height:50mm;object-fit:contain;display:block;background:#f6f8f9}
.photos figcaption{font-size:8pt;color:var(--soft);margin-top:1.5mm}
footer{margin-top:8mm;padding-top:3mm;border-top:1px solid var(--line);font-size:7.6pt;color:var(--faint);line-height:1.65}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin-top:12mm;break-inside:avoid}
.sig div{border-top:1px solid var(--ink);padding-top:2mm;font-size:8.4pt;color:var(--soft)}
.sig b{display:block;color:var(--ink);font-size:9.4pt}
.seal{margin-top:5mm;border:1px solid var(--tintline);background:var(--tint);padding:3mm 4mm;font-size:8.2pt;color:var(--soft);break-inside:avoid}
.seal .mono{word-break:break-all}
.remarks{white-space:pre-wrap;font-size:9pt;border:1px solid var(--line);padding:3mm 4mm;border-radius:2px}
.audit{font-size:7.8pt;color:var(--faint)}
.audit td{padding:.8mm 1.8mm;border-bottom:1px solid var(--line)}
</style></head><body>

<header>
  <div class="brandrow">${LOGO}<div>
    <div class="eyebrow">${session.purpose === 'verification' ? 'Verification test report' : 'Type evaluation test report'} · Non-automatic weighing instrument · OIML R 76</div>
    <h1>${esc(instrument.manufacturer)} ${esc(instrument.model)}</h1>
    <div class="ref">${esc(session.reference)}${session.certificateNo ? ` · Certificate ${esc(session.certificateNo)}` : ''}</div>
    <div class="verdict-strip">${badge(evaluation.overall)}<span class="big">${overallText}</span></div>
  </div></div>
  <div class="lab"><b>${esc(session.laboratory)}</b>
    Report generated ${dt(generatedAt)}<br>
    Rule set ${esc(ruleset.label)}<br>
    ${session.status === 'approved' ? `Approved ${date(session.approvedAt)} by ${esc(session.approvedBy)}` : session.status === 'complete' ? `Closed ${date(session.closedAt)}, awaiting approval` : 'In progress'}
  </div>
</header>

<section class="summary">
  <h2>1 &nbsp;General information concerning the type</h2>
  <div class="grid">
    <div class="panel">
      <h4>Applicant and manufacturer</h4>
      <div class="kv"><span class="k">Applicant</span><span class="v">${esc(instrument.applicant || instrument.manufacturer)}</span></div>
      ${instrument.applicantAddress ? `<div class="kv"><span class="k">Address</span><span class="v">${esc(instrument.applicantAddress)}</span></div>` : ''}
      <div class="kv"><span class="k">Manufacturer</span><span class="v">${esc(instrument.manufacturer)}</span></div>
      ${instrument.manufacturerAddress ? `<div class="kv"><span class="k">Address</span><span class="v">${esc(instrument.manufacturerAddress)}</span></div>` : ''}
      <div class="kv"><span class="k">Model / type designation</span><span class="v">${esc(instrument.model)}</span></div>
      <div class="kv"><span class="k">Serial number of EUT</span><span class="v mono">${esc(instrument.serial)}</span></div>
      ${session.applicationRef ? `<div class="kv"><span class="k">Application reference</span><span class="v">${esc(session.applicationRef)}</span></div>` : ''}
      <div class="kv"><span class="k">Instrument category</span><span class="v">${esc(instrument.instrumentType || '—')}</span></div>
      <div class="kv"><span class="k">Indication</span><span class="v">${esc(instrument.indicatingType || 'digital')}, ${Number(instrument.electronic ?? 1) ? 'electronic' : 'non-electronic'}</span></div>
      <div class="kv"><span class="k">Range type</span><span class="v">${esc(RANGE_LABELS[instrument.rangeType] || instrument.rangeType || 'Single range')}</span></div>
      ${instrument.softwareVersion ? `<div class="kv"><span class="k">Software identification</span><span class="v mono">${esc(instrument.softwareVersion)}</span></div>` : ''}
      ${instrument.loadCell ? `<div class="kv"><span class="k">Load cell(s)</span><span class="v">${esc(instrument.loadCell)}</span></div>` : ''}
      ${instrument.interfaces ? `<div class="kv"><span class="k">Interfaces</span><span class="v">${esc(instrument.interfaces)}</span></div>` : ''}
    </div>
    <div class="panel">
      <h4>Metrological characteristics</h4>
      <div class="kv"><span class="k">Accuracy class</span><span class="v">${esc(instrument.accuracyClass)} — ${esc(c.designation)}</span></div>
      <div class="kv"><span class="k">Max / Min</span><span class="v">${fmt(instrument.max, u)} / ${fmt(instrument.min, u)}</span></div>
      ${c.multiRange
        ? c.ranges.map((r) => `<div class="kv"><span class="k">Partial range ${r.index + 1}</span><span class="v">e = ${fmt(r.e, u)}, d = ${fmt(r.d, u)}, up to ${fmt(r.max, u)}, n = ${fmt(r.n)}${r.withinRange ? '' : ' (outside permitted range)'}</span></div>`).join('')
        : `<div class="kv"><span class="k">e / d</span><span class="v">${fmt(instrument.e, u)} / ${fmt(instrument.d, u)}</span></div>
      <div class="kv"><span class="k">n = Max / e</span><span class="v">${fmt(c.n)} ${c.withinRange ? '' : '(outside permitted range)'}</span></div>`}
      <div class="kv"><span class="k">Min lower limit</span><span class="v">${fmt(c.minCapacity, u)} ${c.minCapacityOk ? '' : '(not met)'}</span></div>
      <div class="kv"><span class="k">Rounding elimination</span><span class="v">${c.changeoverRequired ? 'required (d &gt; 0.2 e)' : 'not required'}</span></div>
      <div class="kv"><span class="k">Tare, additive / subtractive</span><span class="v">${instrument.tareMaxAdditive ? `T = +${fmt(instrument.tareMaxAdditive, u)}` : '—'} / ${instrument.tareMaxSubtractive ? `T = −${fmt(instrument.tareMaxSubtractive, u)}` : '—'}</span></div>
      <div class="kv"><span class="k">Temperature limits</span><span class="v">${fmt(temp.min, '°C')} / ${fmt(temp.max, '°C')} ${temp.special ? '(marked, 3.9.2.2)' : '(default, 3.9.2.1)'}</span></div>
      <div class="kv"><span class="k">Power supply</span><span class="v">${esc(SUPPLY_LABELS[instrument.powerSupply] || instrument.powerSupply || '—')}${instrument.nominalVoltage ? `, ${fmt(instrument.nominalVoltage, 'V')}` : ''}${instrument.frequency ? ` ${fmt(instrument.frequency, 'Hz')}` : ''}</span></div>
      ${supply && supply.lower !== null && supply.upper !== null ? `<div class="kv"><span class="k">Voltage test limits (3.9.3)</span><span class="v">${fmt(supply.lower, 'V')} – ${fmt(supply.upper, 'V')}</span></div>` : ''}
      ${instrument.limitingTilt ? `<div class="kv"><span class="k">Limiting value of tilting</span><span class="v">${esc(instrument.limitingTilt)}</span></div>` : ''}
    </div>
  </div>
  ${c.findings && c.findings.length
    ? `<div class="findings"><b>Classification findings</b><ul>${c.findings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
</section>

<section class="summary">
  <h2>2 &nbsp;Evaluation particulars and laboratory conditions</h2>
  <div class="grid">
    <div class="panel">
      <h4>Evaluation</h4>
      <div class="kv"><span class="k">Laboratory</span><span class="v">${esc(session.laboratory)}</span></div>
      <div class="kv"><span class="k">Test engineer</span><span class="v">${esc(session.technician)}</span></div>
      <div class="kv"><span class="k">Purpose</span><span class="v">${session.purpose === 'verification' ? 'Verification' : 'Type approval'}</span></div>
      <div class="kv"><span class="k">MPE context</span><span class="v">${session.context === 'initial' ? 'Initial verification' : `In service (× ${ruleset.inServiceMultiplier})`}</span></div>
      <div class="kv"><span class="k">Zero error E<sub>0</sub> (session)</span><span class="v">${sign(session.zeroError)} ${esc(u)}</span></div>
      <div class="kv"><span class="k">Test date</span><span class="v">${session.testDate ? date(session.testDate) : date(session.createdAt)}</span></div>
      <div class="kv"><span class="k">Report opened / closed</span><span class="v">${date(session.createdAt)} / ${session.closedAt ? date(session.closedAt) : '—'}</span></div>
      <div class="kv"><span class="k">Rule set applied</span><span class="v">${esc(ruleset.label)}</span></div>
    </div>
    <div class="panel">
      <h4>Environmental conditions</h4>
      ${environment.length === 0
        ? `<div class="kv"><span class="k">Ambient temperature</span><span class="v">${fmt(session.temperature, '°C')}</span></div>
           <div class="kv"><span class="k">Relative humidity</span><span class="v">${fmt(session.humidity, '%')}</span></div>`
        : `<table><thead><tr><th>Stage</th><th class="r">T (°C)</th><th class="r">RH (%)</th><th class="r">p (hPa)</th><th class="r">U (V)</th><th class="r">f (Hz)</th><th>Time</th></tr></thead>
           <tbody>${environment.map((r) => `<tr><td>${esc(r.stage)}${r.note ? `<br><span class="none">${esc(r.note)}</span>` : ''}</td>
             <td class="r">${fmt(r.temperature)}</td><td class="r">${fmt(r.humidity)}</td><td class="r">${fmt(r.pressure)}</td>
             <td class="r">${fmt(r.voltage)}</td><td class="r">${fmt(r.frequency)}</td><td>${dt(r.recordedAt)}</td></tr>`).join('')}</tbody></table>`}
    </div>
  </div>
</section>

<section class="summary">
  <h2>3 &nbsp;Summary of results</h2>
  <table class="sum"><thead><tr><th style="width:5%">#</th><th>Test</th><th style="width:16%">Clause</th>
    <th class="c" style="width:12%">Observations</th><th class="c" style="width:16%">Result</th></tr></thead>
    <tbody>${summaryRows}</tbody></table>
  ${outstanding.length
    ? `<div class="findings"><b>Outstanding for ${session.purpose === 'verification' ? 'verification' : 'type approval'}</b><ul>${outstanding.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>`
    : ''}
</section>

<h2 class="group-head" style="margin-top:0">4 &nbsp;Test results</h2>
${testBlocks}

${session.remarks ? `<section class="summary"><h2>5 &nbsp;Remarks</h2><div class="remarks">${esc(session.remarks)}</div></section>` : ''}

${attachments.length ? `<section class="summary"><h2>${session.remarks ? 6 : 5} &nbsp;Photographs and supporting documents</h2>
  ${images.length ? `<div class="photos">${images.map((a) => `<figure><img src="data:${esc(a.mime)};base64,${a.data.toString('base64')}" alt="${esc(a.caption || a.filename)}"><figcaption>${esc(a.caption || a.filename)}</figcaption></figure>`).join('')}</div>` : ''}
  ${docs.length ? `<table><thead><tr><th>Document</th><th>Type</th><th class="r">Size</th><th>Uploaded</th></tr></thead><tbody>${docs.map((a) => `<tr><td>${esc(a.caption || a.filename)}<br><span class="none">${esc(a.filename)}</span></td><td class="mono">${esc(a.mime)}</td><td class="r">${(a.size / 1024).toFixed(0)} kB</td><td>${dt(a.uploadedAt)}</td></tr>`).join('')}</tbody></table>` : ''}
</section>` : ''}

<div class="sig">
  <div><b>${esc(session.technician)}</b>Tested by · ${date(session.closedAt || generatedAt)}</div>
  <div><b>${esc(session.approvedBy || '')}</b>${session.approvedBy ? `Approved by · ${date(session.approvedAt)}` : 'Approved by'}${session.approvalNote ? `<br>${esc(session.approvalNote)}` : ''}</div>
</div>

${session.signature ? `<div class="seal"><div>Digital signature (SHA-256 over the approved observations, verdicts and approval record):
  <span class="mono">${esc(session.signature)}</span>${verifyUrl ? `<br>Verify at ${esc(verifyUrl)} or scan the code.` : ''}</div>${verifyUrl ? qr.svg(verifyUrl, { size: 100, title: 'Verification QR code' }) : ''}</div>` : ''}

${audit.length ? `<table class="audit" style="margin-top:6mm"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
  <tbody>${audit.slice(-12).map((a) => `<tr><td>${dt(a.at)}</td><td>${esc(a.actor || '')}</td><td>${esc(a.action)}</td><td>${esc(a.detail || '')}</td></tr>`).join('')}</tbody></table>` : ''}

<footer>
  Errors are determined by the changeover-point method where additional weights were applied; the corrected
  indication is derived as <span class="mono">I + 0.5e − ΔL</span> and every error is corrected by the zero error
  E<sub>0</sub> determined before the measurement (A.4.4.3). Maximum permissible errors are taken from
  ${esc(ruleset.label)} for accuracy class ${esc(instrument.accuracyClass)}${session.context === 'in-service'
    ? `, doubled for an instrument in service (3.5.2)` : ` at initial verification (3.5.1)`}.
  Generated ${dt(generatedAt)} from ${Object.values(evaluation.results).reduce((a, t) => a + (t.kind === 'checklist' ? 0 : t.points.length), 0)} recorded observations.
  Electromagnetic disturbance tests (5.4.3, B.3) are recorded from laboratory test sheets and not computed by this system.
</footer>
</body></html>`;
}

module.exports = { render, badge, fmt, sign, VERDICT, SUPPLY_LABELS, RANGE_LABELS };
