'use strict';
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });

  /* nav */
  const nav = $('#nav');
  $('#burger')?.addEventListener('click', (e) => { const open = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
  $$('#nav-links a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));

  /* reveal once */
  const els = $$('.reveal');
  if (reduce || !('IntersectionObserver' in window)) els.forEach((el) => el.classList.add('in'));
  else { const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.1 }); els.forEach((el) => io.observe(el)); }

  /* worked example: Avery CS-30, class III, e = d = 5 g */
  const demo = { e: 5, cls: 'III', points: [
    { label: 'Min', load: 100, indication: 100, addedLoad: 1.5 },
    { label: '2 kg', load: 2000, indication: 2000, addedLoad: 1.5 },
    { label: '10 kg', load: 10000, indication: 10000, addedLoad: 2.0 },
    { label: '20 kg', load: 20000, indication: 20010, addedLoad: null },
    { label: 'Max', load: 30000, indication: 30000, addedLoad: 2.5 }
  ] };
  let bands = [[0, 500, 0.5], [500, 2000, 1.0], [2000, 10000, 1.5]];
  const mpeFor = (load) => { const m = load / demo.e; const b = bands.find(([lo, hi]) => (lo === 0 ? m >= 0 : m > lo) && (hi === null || m <= hi)); return b ? b[2] * demo.e : null; };
  const evalPt = (p) => { const P = p.addedLoad === null ? p.indication : p.indication + 0.5 * demo.e - p.addedLoad; const error = P - p.load; const mpe = mpeFor(p.load); return { ...p, P, error, mpe, pass: Math.abs(error) <= mpe + 1e-9, loadInE: p.load / demo.e }; };

  function bench(prefix, initial) {
    const lcd = $(`#${prefix}-lcd`), keys = $(`#${prefix}-keys`), gauge = $(`#${prefix}-gauge`), explain = $(`#${prefix}-explain`);
    if (!lcd || !keys) return null;
    keys.innerHTML = demo.points.map((p, i) => `<button data-i="${i}" type="button">${esc(p.label)}<small>${fmt(p.load)} g</small></button>`).join('');
    let current = initial;
    const draw = (i) => {
      current = i; const p = evalPt(demo.points[i]);
      keys.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === i));
      lcd.innerHTML = sevenSegment(String(p.indication), { digits: 6, height: 84, unit: 'g', annunciators: [['ZERO', false], ['NET', false], ['STABLE', true]] });
      if (gauge) gauge.innerHTML = mpeGauge({ error: p.error, mpe: p.mpe, e: demo.e, units: 'g', width: 9999 });
      if (explain) explain.innerHTML = p.addedLoad === null
        ? `No changeover load recorded, so the error is the raw difference <span class="mono">${fmt(p.indication)} − ${fmt(p.load)} = ${p.error > 0 ? '+' : ''}${fmt(p.error)} g</span>. At ${fmt(p.loadInE)} e the band allows ± ${fmt(p.mpe)} g. <b>Outside the limit.</b>`
        : `Added ${fmt(p.addedLoad)} g until the display stepped: <span class="mono">P = ${fmt(p.indication)} + ${fmt(0.5 * demo.e)} − ${fmt(p.addedLoad)} = ${fmt(p.P)} g</span>, error <b>${p.error > 0 ? '+' : ''}${fmt(p.error)} g</b> against ± ${fmt(p.mpe)} g at ${fmt(p.loadInE)} e. <b>Within the limit.</b>`;
    };
    keys.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) draw(Number(b.dataset.i)); });
    draw(current);
    return { redraw: () => draw(current) };
  }
  const benches = [bench('hero', 3), bench('lab', 1)].filter(Boolean);
  const st = $('#lab-status'); if (st) st.textContent = 'class III · e = 5 g · initial verification';

  fetch('/api/rulesets/oiml-r76-2006').then((r) => (r.ok ? r.json() : null)).then((rs) => {
    if (!rs) return; bands = rs.classes[demo.cls].bands; benches.forEach((b) => b.redraw());
    if (st) st.textContent = `${rs.label} · live`;
  }).catch(() => {});
})();
