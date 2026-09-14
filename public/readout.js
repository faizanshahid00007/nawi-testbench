'use strict';

/*
 * Weighing-indicator readout: a seven-segment LCD drawn as inline SVG, and a
 * permissible-error gauge. Both are pure functions returning markup.
 *
 * sevenSegment('2000.0', { digits: 7, unit: 'g', annunciators: [['NET', false], ['ZERO', true]] })
 * mpeGauge({ error: 1.0, mpe: 2.5, e: 5, units: 'g' })
 */
(() => {
  const SEG = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg',
    '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '', 'E': 'adefg', 'r': 'eg', 'o': 'cdeg', 'H': 'bcefg', 'L': 'def', 'd': 'bcdeg', 'A': 'abcefg', 'P': 'abefg', 'S': 'acdfg', 'F': 'aefg', 'I': 'ef', 'n': 'ceg', 'i': 'c', 't': 'defg', 'U': 'bcdef', 'C': 'adef', 'h': 'cefg'
  };
  // Segment geometry in a 10 × 18 cell, slightly skewed like a real LCD.
  const W = 1.55, L = 6.2, H = 8;
  const hseg = (x, y) => `M${x + 0.6},${y} l${L - 1.2},0 l0.6,${W / 2} l-0.6,${W / 2} l-${L - 1.2},0 l-0.6,-${W / 2} z`;
  const vseg = (x, y) => `M${x},${y + 0.6} l${W / 2},-0.6 l${W / 2},0.6 l0,${H - 1.2} l-${W / 2},0.6 l-${W / 2},-0.6 z`;
  const paths = {
    a: hseg(1.9, 0.4), g: hseg(1.9, 8.6), d: hseg(1.9, 16.8),
    f: vseg(1.1, 1.2), b: vseg(7.4, 1.2), e: vseg(1.1, 9.4), c: vseg(7.4, 9.4)
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function sevenSegment(text, { digits = 6, height = 64, unit = '', annunciators = [], label = '', id = '' } = {}) {
    const str = String(text ?? '');
    // Split into glyphs; a '.' attaches to the preceding glyph as a decimal point.
    const glyphs = [];
    for (const ch of str) {
      if (ch === '.' && glyphs.length) glyphs[glyphs.length - 1].dot = true;
      else glyphs.push({ ch, dot: false });
    }
    while (glyphs.length < digits) glyphs.unshift({ ch: ' ', dot: false });
    const shown = glyphs.slice(-digits);
    const cellW = 12.4;
    const padX = 6, padTop = annunciators.length ? 7 : 3, padBottom = 3;
    const unitW = unit ? 5 + unit.length * 4.2 : 0;
    const vw = padX * 2 + shown.length * cellW + unitW;
    const vh = padTop + 18 + padBottom;
    const cells = shown.map((g, i) => {
      const on = SEG[g.ch] ?? '';
      const x = padX + i * cellW;
      return `<g transform="translate(${x},${padTop}) skewX(-5)">${Object.entries(paths).map(([k, d]) =>
        `<path d="${d}" class="sg ${on.includes(k) ? 'on' : 'off'}"/>`).join('')}
        <circle cx="10.6" cy="17.6" r="0.95" class="sg ${g.dot ? 'on' : 'off'}"/></g>`;
    }).join('');
    let ax = padX + 1;
    const ann = annunciators.map(([t, on]) => {
      const out = `<text x="${ax}" y="4.6" class="ann ${on ? 'on' : 'off'}">${esc(t)}</text>`;
      ax += t.length * 2.15 + 4.5;
      return out;
    }).join('');
    return `<svg class="lcd" ${id ? `id="${esc(id)}"` : ''} viewBox="0 0 ${vw} ${vh}" style="height:${height}px" role="img" aria-label="${esc(label || `${str}${unit ? ' ' + unit : ''}`)}">
      <rect x="0" y="0" width="${vw}" height="${vh}" rx="1.4" class="lcd-glass"/>
      ${ann}${cells}
      ${unit ? `<text x="${vw - padX}" y="${padTop + 17.6}" text-anchor="end" class="unit">${esc(unit)}</text>` : ''}
    </svg>`;
  }

  // Corrected error against ± mpe. The track spans ± 1.6 mpe so an
  // out-of-tolerance point is still drawn, pinned to the edge if it is far out.
  function mpeGauge({ error, mpe, e, units = 'g', width = 260, label = '' }) {
    if (!(mpe > 0) || !Number.isFinite(error)) return '';
    const span = 1.6 * mpe;
    const clamp = Math.max(-span, Math.min(span, error));
    const pct = (v) => 50 + (v / span) * 50;
    const inside = Math.abs(error) <= mpe + 1e-9;
    const fmt = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
    return `<div class="gauge ${inside ? 'pass' : 'fail'}" style="max-width:${width}px" role="img" aria-label="${esc(label || `error ${fmt(error)} ${units}, permissible ± ${fmt(mpe)} ${units}`)}">
      <div class="track">
        <div class="band" style="left:${pct(-mpe)}%;width:${pct(mpe) - pct(-mpe)}%"></div>
        <div class="zero"></div>
        <div class="needle" style="left:${pct(clamp)}%"></div>
      </div>
      <div class="scale"><span>−${fmt(mpe)}</span><span>0</span><span>+${fmt(mpe)} ${esc(units)}</span></div>
      <div class="value">E<sub>c</sub> = <b>${error > 0 ? '+' : ''}${fmt(error)} ${esc(units)}</b>${e ? ` <span>(${fmt(error / e)} e)</span>` : ''} — ${inside ? 'within' : 'outside'} ± ${fmt(mpe)} ${esc(units)}</div>
    </div>`;
  }

  // Power-on: every segment lit for a moment, then the real value. Runs once
  // per element and respects reduced-motion.
  function powerOn(root = document) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('svg.lcd:not([data-lit])').forEach((svg, i) => {
      svg.dataset.lit = '1';
      svg.classList.add('booting');
      setTimeout(() => svg.classList.remove('booting'), 420 + i * 60);
    });
  }

  window.sevenSegment = sevenSegment;
  window.mpeGauge = mpeGauge;
  window.powerOn = powerOn;
})();
