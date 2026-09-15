'use strict';
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });

  /* nav: scroll state, progress, burger */
  const nav = $('#nav'), progress = $('#progress');
  const onScroll = () => {
    const y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    nav.classList.toggle('scrolled', y > 8);
    if (progress) progress.style.width = `${h > 0 ? (y / h) * 100 : 0}%`;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  $('#burger')?.addEventListener('click', (e) => { const open = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(open)); });
  $$('#nav-links a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));

  /* hero headline: word-by-word reveal */
  const title = $('#hero-title');
  if (title && !reduce) {
    const words = title.textContent.trim().split(/\s+/);
    title.innerHTML = words.map((w, i) => `<span class="w" style="animation-delay:${80 + i * 70}ms">${esc(w)}</span>`).join(' ');
  } else if (title) { title.querySelectorAll('.w').forEach((w) => { w.style.opacity = 1; w.style.transform = 'none'; }); }

  /* scroll reveal */
  const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((el) => (reduce ? el.classList.add('in') : io.observe(el)));

  /* counters */
  const counters = $$('[data-count]');
  const cio = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return; cio.unobserve(en.target);
    const target = Number(en.target.dataset.count); if (reduce) { en.target.textContent = target; return; }
    const t0 = performance.now(); const dur = 1200;
    const tick = (t) => { const p = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - p, 3); en.target.textContent = Math.round(target * e); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), { threshold: 0.5 });
  counters.forEach((c) => cio.observe(c));

  /* magnetic buttons */
  if (!reduce && matchMedia('(pointer:fine)').matches) {
    $$('.magnetic').forEach((b) => {
      b.addEventListener('mousemove', (e) => { const r = b.getBoundingClientRect(); const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; b.style.transform = `translate(${x * 0.18}px, ${y * 0.22}px)`; });
      b.addEventListener('mouseleave', () => { b.style.transform = ''; });
    });
    /* tilt + spotlight on bento tiles */
    $$('.tilt').forEach((t) => {
      t.addEventListener('mousemove', (e) => {
        const r = t.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        t.style.setProperty('--mx', `${px * 100}%`); t.style.setProperty('--my', `${py * 100}%`);
        t.style.transform = `perspective(1100px) rotateX(${(0.5 - py) * 5}deg) rotateY(${(px - 0.5) * 6}deg) translateY(-2px)`;
      });
      t.addEventListener('mouseleave', () => { t.style.transform = ''; });
    });
    /* hero scene parallax */
    const scene = $('#scene');
    if (scene) {
      const layers = $$('.layer', scene);
      const base = new Map(layers.map((l) => [l, getComputedStyle(l).transform]));
      const move = (e) => {
        const r = scene.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        layers.forEach((l) => { const depth = l.classList.contains('device') ? 1 : l.classList.contains('w1') ? 2.4 : l.classList.contains('w3') ? 3 : 1.8;
          const b = base.get(l) === 'none' ? '' : base.get(l); l.style.transform = `${b} translate3d(${px * 18 * depth}px, ${py * 14 * depth}px, 0) rotateY(${px * 6}deg) rotateX(${-py * 5}deg)`; });
      };
      scene.addEventListener('mousemove', move);
      scene.addEventListener('mouseleave', () => layers.forEach((l) => { l.style.transform = ''; }));
    }
  }

  /* worked example: Avery CS-30, class III, e = d = 5 g, Max 30 kg */
  const demo = { e: 5, cls: 'III', points: [
    { label: 'Min', load: 100, indication: 100, addedLoad: 1.5 },
    { label: '2 kg', load: 2000, indication: 2000, addedLoad: 1.5 },
    { label: '10 kg', load: 10000, indication: 10000, addedLoad: 2.0 },
    { label: '20 kg', load: 20000, indication: 20010, addedLoad: null },
    { label: 'Max', load: 30000, indication: 30000, addedLoad: 2.5 }
  ] };
  const fallbackBands = [[0, 500, 0.5], [500, 2000, 1.0], [2000, 10000, 1.5]];
  let bands = fallbackBands, mult = 1;
  const mpeFor = (load) => { const m = load / demo.e; const b = bands.find(([lo, hi]) => (lo === 0 ? m >= 0 : m > lo) && (hi === null || m <= hi)); return b ? b[2] * demo.e * mult : null; };
  const evalPt = (p) => { const P = p.addedLoad === null ? p.indication : p.indication + 0.5 * demo.e - p.addedLoad; const error = P - p.load; const mpe = mpeFor(p.load); return { ...p, P, error, mpe, pass: Math.abs(error) <= mpe + 1e-9, loadInE: p.load / demo.e }; };

  function bench({ lcdId, keysId, gaugeId, chipId, chipText, chipEc, explainId, statusId, initial = 3, compact = false }) {
    const lcd = $(`#${lcdId}`), keys = $(`#${keysId}`), gauge = $(`#${gaugeId}`);
    if (!lcd || !keys) return;
    keys.innerHTML = demo.points.map((p, i) => `<button data-i="${i}" type="button">${esc(p.label)}${compact ? '' : `<small>${fmt(p.load)} g</small>`}</button>`).join('');
    let current = initial;
    const draw = (i, animate) => {
      current = i; const p = evalPt(demo.points[i]);
      keys.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === i));
      const show = (v) => { lcd.innerHTML = sevenSegment(String(v), { digits: 6, height: compact ? 56 : 84, unit: 'g', annunciators: [['ZERO', false], ['NET', false], ['STABLE', true]] }); };
      if (animate && !reduce) { const t0 = performance.now(); const from = 0, to = p.indication; const step = (t) => { const k = Math.min(1, (t - t0) / 900); const e = 1 - Math.pow(1 - k, 3); show(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); else show(to); }; requestAnimationFrame(step); } else show(p.indication);
      if (gauge) gauge.innerHTML = mpeGauge({ error: p.error, mpe: p.mpe, e: demo.e, units: 'g', width: 9999 });
      const chip = chipId && $(`#${chipId}`); if (chip) { chip.classList.toggle('fail', !p.pass); chip.querySelector('.dot').textContent = p.pass ? '✓' : '✕'; $(`#${chipText}`).textContent = p.pass ? `within ± ${fmt(p.mpe)} g` : `outside ± ${fmt(p.mpe)} g`; }
      if (chipEc) $(`#${chipEc}`).textContent = `Ec = ${p.error > 0 ? '+' : ''}${fmt(p.error)} g`;
      const ex = explainId && $(`#${explainId}`);
      if (ex) ex.innerHTML = p.addedLoad === null
        ? `No changeover load recorded, so the error is the raw difference: <span class="mono">${fmt(p.indication)} − ${fmt(p.load)} = <b>${p.error > 0 ? '+' : ''}${fmt(p.error)} g</b></span>. At ${fmt(p.loadInE)} e the band allows ± 1.5 e = ± ${fmt(p.mpe)} g. <b>Outside the limit.</b>`
        : `Added ${fmt(p.addedLoad)} g until the display stepped: <span class="mono">P = ${fmt(p.indication)} + ${fmt(0.5 * demo.e)} − ${fmt(p.addedLoad)} = ${fmt(p.P)} g</span>, so the error is <b>${p.error > 0 ? '+' : ''}${fmt(p.error)} g</b> against ± ${fmt(p.mpe)} g at ${fmt(p.loadInE)} e. <b>Within the limit.</b>`;
    };
    keys.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) draw(Number(b.dataset.i), false); });
    draw(current, true);
    const st = statusId && $(`#${statusId}`); if (st) st.textContent = 'class III · e = 5 g · initial verification';
    return { redraw: () => draw(current, false) };
  }

  const benches = [];
  benches.push(bench({ lcdId: 'hero-lcd', keysId: 'hero-keys', gaugeId: 'hero-gauge', chipId: 'hero-chip', chipText: 'hero-chip-text', chipEc: 'hero-chip-ec', initial: 3 }));
  benches.push(bench({ lcdId: 'tile-lcd', keysId: 'tile-keys', gaugeId: 'tile-gauge', initial: 1, compact: true }));
  benches.push(bench({ lcdId: 'lab-lcd', keysId: 'lab-keys', gaugeId: 'lab-gauge', explainId: 'lab-explain', statusId: 'lab-status', initial: 3 }));
  powerOn();

  /* pull the real rule set so the demo uses the versioned data, not a copy */
  fetch('/api/rulesets/oiml-r76-2006').then((r) => (r.ok ? r.json() : null)).then((rs) => {
    if (!rs) return; bands = rs.classes[demo.cls].bands; mult = 1; benches.forEach((b) => b && b.redraw());
    const st = $('#lab-status'); if (st) st.textContent = `${rs.label} · live`;
  }).catch(() => {});
})();
