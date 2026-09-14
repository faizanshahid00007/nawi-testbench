'use strict';

const { fmt, SUPPLY_LABELS } = require('./report');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const date = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { dateStyle: 'long' }) : '—');

// The certificate is issued only for an approved report whose evaluation
// passed with the full battery for its purpose complete. Everything printed
// here is read back from the stored session and a fresh evaluation, so the
// certificate can never say more than the report does.
function render({ session, instrument, ruleset, evaluation, verifyUrl }) {
  const u = instrument.units;
  const c = evaluation.classification;
  const tests = Object.entries(evaluation.results)
    .filter(([, t]) => t.verdict !== 'not-applicable' && t.verdict !== 'not-performed');
  const purpose = session.purpose === 'verification' ? 'Verification' : 'Type evaluation';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(session.certificateNo)} — Certificate</title>
<style>
@page { size: A4; margin: 0; }
:root{--ink:#15202b;--soft:#4a5a68;--accent:#0d4f5c;--brass:#a97c2a;--line:#c9d3d6}
*{box-sizing:border-box}
body{margin:0;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:var(--ink);font-size:9.6pt;line-height:1.5;background:#fff}
.sheet{width:210mm;height:297mm;padding:16mm 18mm;margin:0 auto;position:relative;overflow:hidden;page-break-after:avoid}
.frame{position:absolute;inset:8mm;border:1.5px solid var(--accent);pointer-events:none}
.frame::after{content:'';position:absolute;inset:2mm;border:.5px solid var(--brass)}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--accent);padding-bottom:3.5mm}
.eyebrow{font-size:7.6pt;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:600}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:500;font-size:22pt;margin:2mm 0 .5mm;letter-spacing:-.01em}
.sub{color:var(--soft);font-size:9.6pt}
.no{text-align:right;font-size:9pt;color:var(--soft)}
.no b{display:block;font-family:Menlo,Consolas,monospace;font-size:12pt;color:var(--ink);letter-spacing:.02em}
.lead{margin:4.5mm 0 2mm;font-size:9.8pt;line-height:1.45}
.lead b{color:var(--accent)}
.kv{display:grid;grid-template-columns:36mm 1fr 36mm 1fr;gap:.9mm 4mm;font-size:8.8pt;margin:2mm 0;line-height:1.35}
.req{display:grid;grid-template-columns:1fr 1fr;gap:0 8mm;font-size:8.4pt}
.req .row{display:grid;grid-template-columns:1fr auto 11mm;gap:3mm;align-items:baseline;padding:.8mm 0;border-bottom:1px solid #e3e9eb;line-height:1.3}
.req .row .mono{color:var(--soft);font-size:7.6pt}
.req .row b{color:#0f6b3f;text-align:right}
.kv .k{color:var(--soft)}
.kv .v{font-weight:600}
h2{font-size:8.4pt;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:4mm 0 1.5mm;font-weight:600;border-bottom:1px solid var(--line);padding-bottom:1.5mm}
table{width:100%;border-collapse:collapse;font-size:9.2pt}
td,th{padding:1.4mm 2mm;border-bottom:1px solid #e3e9eb;text-align:left}
th{font-size:7.6pt;color:var(--accent);font-weight:600;letter-spacing:.08em;text-transform:uppercase}
td.c{text-align:center;font-weight:600;color:#0f6b3f}
.statement{margin-top:4mm;padding:3mm 4.5mm;border:1px solid var(--line);background:#f7fafa;font-size:9.2pt;line-height:1.45;max-width:118mm}
.sig{position:absolute;left:18mm;bottom:27mm;display:grid;grid-template-columns:1fr 1fr;gap:12mm;width:118mm}
.sig div{border-top:1px solid var(--ink);padding-top:2mm;font-size:9pt;color:var(--soft)}
.sig b{display:block;color:var(--ink);font-size:10.5pt}
.seal{position:absolute;right:26mm;bottom:30mm;width:38mm;height:38mm;border:2px solid var(--brass);border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--brass);font-size:7.4pt;letter-spacing:.14em;text-transform:uppercase;font-weight:700;transform:rotate(-8deg);opacity:.85}
.seal span{display:block;padding:3mm}
footer{position:absolute;left:18mm;right:18mm;bottom:10mm;font-size:7pt;color:var(--soft);line-height:1.6;border-top:1px solid var(--line);padding-top:2mm}
.mono{font-family:Menlo,Consolas,monospace;word-break:break-all}
</style></head><body><div class="sheet"><div class="frame"></div>

<div class="top">
  <div>
    <div class="eyebrow">${esc(session.laboratory)}</div>
    <h1>Certificate of Conformity</h1>
    <div class="sub">${purpose} of a non-automatic weighing instrument · OIML R 76</div>
  </div>
  <div class="no">Certificate number<b>${esc(session.certificateNo)}</b>Report ${esc(session.reference)}<br>Issued ${date(session.approvedAt)}</div>
</div>

<p class="lead">This is to certify that the instrument described below was evaluated in accordance with
<b>${esc(ruleset.label)}</b> and <b>was found to conform</b> to the metrological and technical requirements
applicable to accuracy class <b>${esc(instrument.accuracyClass)}</b> (${esc(c.designation)}) for the purpose of ${purpose.toLowerCase()}.</p>

<h2>Instrument</h2>
<div class="kv">
  <span class="k">Applicant</span><span class="v">${esc(instrument.applicant || instrument.manufacturer)}${instrument.applicantAddress ? `, ${esc(instrument.applicantAddress)}` : ''}</span>
  <span class="k">Manufacturer</span><span class="v">${esc(instrument.manufacturer)}${instrument.manufacturerAddress ? `, ${esc(instrument.manufacturerAddress)}` : ''}</span>
  <span class="k">Model / type</span><span class="v">${esc(instrument.model)}</span>
  <span class="k">Serial number of EUT</span><span class="v mono">${esc(instrument.serial)}</span>
  <span class="k">Category</span><span class="v">${esc(instrument.instrumentType || '—')}, ${esc(instrument.indicatingType || 'digital')} indication</span>
  <span class="k">Accuracy class</span><span class="v">${esc(instrument.accuracyClass)} — ${esc(c.designation)}</span>
  <span class="k">Max / Min</span><span class="v">${fmt(instrument.max, u)} / ${fmt(instrument.min, u)}</span>
  <span class="k">e / d / n</span><span class="v">${fmt(instrument.e, u)} / ${fmt(instrument.d, u)} / ${fmt(c.n)}</span>
  <span class="k">Temperature limits</span><span class="v">${fmt(c.temperature.min, '°C')} / ${fmt(c.temperature.max, '°C')}</span>
  <span class="k">Power supply</span><span class="v">${esc(SUPPLY_LABELS[instrument.powerSupply] || instrument.powerSupply || '—')}${instrument.nominalVoltage ? `, ${fmt(instrument.nominalVoltage, 'V')}` : ''}</span>
  ${instrument.softwareVersion ? `<span class="k">Software identification</span><span class="v mono">${esc(instrument.softwareVersion)}</span>` : ''}
</div>

<h2>Requirements evaluated</h2>
<div class="req">${tests.map(([k, t]) => `<div class="row"><span>${esc(t.label)}</span><span class="mono">${esc(ruleset.tests[k].clause || '')}</span><b>${t.verdict.toUpperCase()}</b></div>`).join('')}</div>

<div class="statement">
  The results recorded in test report <b>${esc(session.reference)}</b>, closed on ${date(session.closedAt)} and approved on ${date(session.approvedAt)},
  show every error of indication within the maximum permissible error for its load and every applicable construction requirement satisfied.
  ${session.approvalNote ? `<br>${esc(session.approvalNote)}` : ''}
</div>

<div class="sig">
  <div><b>${esc(session.technician)}</b>Test engineer</div>
  <div><b>${esc(session.approvedBy)}</b>Approving officer · ${date(session.approvedAt)}</div>
</div>

<div class="seal"><span>Conforms<br>OIML R 76<br>Class ${esc(instrument.accuracyClass)}</span></div>

<footer>
  This certificate is valid only together with test report ${esc(session.reference)} and refers solely to the instrument identified above.
  Digital signature (SHA-256): <span class="mono">${esc(session.signature || '—')}</span>${verifyUrl ? `<br>Verify authenticity at ${esc(verifyUrl)}` : ''}
</footer>
</div></body></html>`;
}

module.exports = { render };
