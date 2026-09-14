'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });
const range = (lo, hi) => `${num(lo)} – ${hi === null ? '∞' : num(hi)}`;

(async () => {
  const rs = await fetch('/api/rulesets/oiml-r76-2006').then((r) => r.json());
  $('#rs-label').textContent = rs.label;
  $('#source').innerHTML = `Source: <a href="${esc(rs.source)}" target="_blank" rel="noopener">${esc(rs.source)}</a>. In‑service multiplier ${rs.inServiceMultiplier} (${esc(rs.inServiceClause)}); rounding elimination required when d &gt; ${rs.roundingEliminationRatio} e (${esc(rs.roundingEliminationClause)}).`;

  const classes = Object.entries(rs.classes);

  $('#classes').innerHTML = `<thead><tr><th>Class</th><th>Designation</th><th class="r">e</th><th class="r">n = Max / e</th><th class="r">Min, at least</th><th>Clause</th></tr></thead>
    <tbody>${classes.flatMap(([k, c]) => c.rows.map((r, i) => `<tr>
      <td>${i === 0 ? esc(k) : ''}</td><td>${i === 0 ? esc(c.designation) : ''}</td>
      <td class="r">${range(r.eMin, r.eMax)} g</td>
      <td class="r">${range(r.nMin, r.nMax)}</td>
      <td class="r">${r.minCapacityE} e</td>
      <td class="clause">${i === 0 ? esc(c.clause) : ''}</td></tr>`)).join('')}</tbody>`;

  $('#bands').innerHTML = `<thead><tr><th>Class</th>${['± 0.5 e', '± 1 e', '± 1.5 e'].map((h) => `<th class="r">${h}</th>`).join('')}<th class="r">In service</th></tr></thead>
    <tbody>${classes.map(([k, c]) => `<tr><td><b>${esc(k)}</b></td>
      ${c.bands.map(([lo, hi]) => `<td class="r">${lo === 0 ? '0' : `> ${num(lo)}`} to ${hi === null ? '∞' : num(hi)} e</td>`).join('')}
      <td class="r">× ${rs.inServiceMultiplier}</td></tr>`).join('')}</tbody>`;

  const testRule = (t) => {
    if (t.kind === 'checklist') return `${t.items.length} items inspected: ${t.items.filter((i) => i.level === 'compulsory').length} compulsory, the rest if applicable. Any compulsory item absent fails the test.`;
    if (t.kind === 'creep') return `Drift ≤ ${t.within30MinE} e over 30 min and ≤ ${t.between15and30E} e between minute 15 and 30; otherwise drift over ${t.fallbackHours} h within the mpe. Classes ${t.appliesToClasses.join(', ')}.`;
    if (t.kind === 'deviation') return `Deviation ≤ ${t.limitE} e. Classes ${t.appliesToClasses.join(', ')}.`;
    if (t.kind === 'zero-drift') return `Zero indication changes by ≤ ${t.limitE} e per ${t.perDegrees.default} °C (per ${t.perDegrees.I} °C for class I) between consecutive temperatures.`;
    if (t.kind === 'timed') return `Corrected error within the mpe at ${t.timesMin.join(', ')} min after switch-on, load ${t.loadHint}. Electronic instruments.`;
    if (t.kind === 'tilt') return `No-load shift ≤ ${t.noLoadLimitE} e (class ${t.noLoadExemptClasses.join(', ')} exempt); loaded error within the mpe. Positions: ${t.conditions.join(', ')}. Classes ${t.appliesToClasses.join(', ')}.`;
    if (t.kind === 'span') return `≥ ${t.minMeasurements} measurements near Max; each error within the mpe and variation ≤ ${t.variationRule}. Classes ${t.appliesToClasses.join(', ')}, electronic.`;
    if (t.kind === 'conditioned') return `Corrected error within the mpe under each condition: ${t.plan.join(' → ')}.${t.loadHint ? ` Loads: ${t.loadHint}.` : ''}`;
    if (t.kind === 'discrimination') return `Add ${t.addedWeightD} d at equilibrium; indication must change by ≥ ${t.minChangeD} d. Applies when d ≥ ${t.appliesWhenDAtLeast} g.`;
    if (t.kind === 'limit') return `Effect on the result within ± ${t.limitE} e.`;
    if (t.kind === 'spread') {
      const ta = t.runRules['type-approval'];
      const v = t.runRules.verification.byClass;
      return `Spread between runs ≤ MPE at that load. Type approval: ${ta.default} runs, ${ta.whenMaxBelow.runs} when Max < ${ta.whenMaxBelow.value} ${ta.whenMaxBelow.unit}. Verification: ${Object.entries(v).map(([c, n]) => `${c} → ${n}`).join(', ')}.`;
    }
    if (t.netBasis) return 'Net result within the MPE for the net load; changeover and zero correction apply.';
    if (t.testLoadRules) return `Corrected error within the MPE. Test load: ${t.testLoadRules.map((r) => `${r.support} → ${r.fraction ? `${Math.round(r.fraction * 100)} %` : r.formula} of ${r.basis} (${r.clause})`).join('; ')}.`;
    return `Corrected error E − E₀ within the MPE for the load band${t.changeover ? '; changeover‑point method where added loads are recorded' : ''}.`;
  };

  const groups = rs.groups || [{ label: 'Tests', tests: Object.keys(rs.tests) }];
  $('#tests').innerHTML = `<thead><tr><th>Test</th><th>Rule</th><th>Clause</th><th>Required for</th></tr></thead>
    <tbody>${groups.map((g) => `<tr><td colspan="4" style="background:var(--paper);font-weight:500;color:var(--brass-ink)">${esc(g.label)}</td></tr>` +
      g.tests.map((k) => rs.tests[k]).map((t) => `<tr><td><b>${esc(t.label)}</b><div class="hint">${esc(t.description)}</div></td>
      <td>${esc(testRule(t))}</td><td class="clause">${esc(t.clause)}</td><td class="clause">${(t.requiredFor || []).map((p) => p === 'type-approval' ? 'Type approval' : 'Verification').join(', ')}</td></tr>`).join('')).join('')}</tbody>`;

  /* calculator */
  $('#calc-cls').innerHTML = classes.map(([k, c]) => `<option value="${k}"${k === 'III' ? ' selected' : ''}>${k} — ${esc(c.designation)}</option>`).join('');

  function compute() {
    const f = $('#calc');
    const cls = rs.classes[f.cls.value];
    const max = Number(f.max.value), e = Number(f.e.value), load = Number(f.load.value);
    const mult = f.context.value === 'in-service' ? rs.inServiceMultiplier : 1;
    const out = $('#calc-out');
    if (!(max > 0 && e > 0 && load >= 0)) { out.innerHTML = '<p class="empty">Enter Max, e and a load to see the limit.</p>'; return; }
    const n = max / e;
    const row = cls.rows.find((r) => e >= r.eMin && (r.eMax === null || e <= r.eMax));
    const loadInE = load / e;
    const band = cls.bands.find(([lo, hi]) => (lo === 0 ? loadInE >= 0 : loadInE > lo) && (hi === null || loadInE <= hi));
    const notes = [];
    if (!row) notes.push(`e = ${num(e)} g is outside every interval band defined for class ${f.cls.value}.`);
    else if (n < row.nMin || (row.nMax !== null && n > row.nMax)) notes.push(`n = ${num(n)} is outside the permitted ${range(row.nMin, row.nMax)} for class ${f.cls.value} with this e.`);
    if (!band) notes.push(`Load of ${num(loadInE)} e exceeds the last band for class ${f.cls.value}.`);
    if (load > max) notes.push('Load exceeds Max.');

    out.innerHTML = band ? `
      <div class="big">± ${num(band[2] * mult * e)} g<small>${band[2] * mult} e</small></div>
      <div style="margin-top:12px">
        <div class="kv"><span class="k">Load in intervals</span><span>${num(loadInE)} e</span></div>
        <div class="kv"><span class="k">Band</span><span>${band[0] === 0 ? '0' : `> ${num(band[0])}`} to ${band[1] === null ? '∞' : num(band[1])} e</span></div>
        <div class="kv"><span class="k">n = Max / e</span><span>${num(n)}${row ? ` <span class="hint">(${range(row.nMin, row.nMax)} permitted)</span>` : ''}</span></div>
        <div class="kv"><span class="k">Multiplier</span><span>× ${mult}, ${mult === 1 ? 'initial verification' : 'in service'}</span></div>
      </div>
      ${notes.length ? `<div class="msg err">${notes.map(esc).join(' ')}</div>` : ''}`
      : `<div class="msg err">${notes.map(esc).join(' ')}</div>`;

    $('#calc-chart').innerHTML = envelopeSvg({
      bands: cls.bands, n: Math.max(n, 1), multiplier: mult, width: 680, height: 340,
      points: band ? [{ loadInE, errorInE: 0, verdict: 'other', label: 'Load' }] : [],
      title: `Envelope for class ${f.cls.value}, Max ${num(max)} g, e = ${num(e)} g`
    });
  }

  $('#calc').addEventListener('input', compute);
  compute();
})();
