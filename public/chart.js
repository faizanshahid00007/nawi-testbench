'use strict';

(() => {

/*
 * Error envelope: the maximum permissible error staircase for an accuracy class,
 * drawn in units of e, with measured errors plotted against it.
 *
 * bands      [[loE, hiE|null, mpeE], ...] from the rule set
 * n          Max / e, used as the right-hand edge of the open band
 * multiplier 1 for initial verification, 2 in service
 * points     [{ loadInE, errorInE, verdict, label }]
 */
function envelopeSvg({ bands, n, multiplier = 1, points = [], width = 640, height = 300, title = '' }) {
  const m = { top: 26, right: 16, bottom: 34, left: 44 };
  const W = width - m.left - m.right;
  const H = height - m.top - m.bottom;
  const maxMpe = Math.max(...bands.map((b) => b[2])) * multiplier;
  const yMax = Math.max(maxMpe * 1.35, ...points.map((p) => Math.abs(p.errorInE) * 1.15), 1);
  const x = (e) => m.left + (Math.min(e, n) / n) * W;
  const y = (v) => m.top + H / 2 - (v / yMax) * (H / 2);

  const steps = bands.map(([lo, hi, mpe]) => ({ lo, hi: hi === null ? n : Math.min(hi, n), mpe: mpe * multiplier }))
    .filter((b) => b.lo < n);

  const upper = steps.map((b, i) => `${i === 0 ? 'M' : 'L'}${x(b.lo)},${y(b.mpe)} L${x(b.hi)},${y(b.mpe)}`).join(' ');
  const area = `${upper} ${[...steps].reverse().map((b) => `L${x(b.hi)},${y(-b.mpe)} L${x(b.lo)},${y(-b.mpe)}`).join(' ')} Z`;
  const lowerLine = steps.map((b, i) => `${i === 0 ? 'M' : 'L'}${x(b.lo)},${y(-b.mpe)} L${x(b.hi)},${y(-b.mpe)}`).join(' ');

  const yTicks = [];
  const step = maxMpe >= 3 ? 1 : 0.5;
  for (let v = -Math.floor(yMax / step) * step; v <= yMax; v += step) yTicks.push(Number(v.toFixed(2)));

  const xTicks = [...new Set([0, ...steps.map((b) => b.hi)])];

  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const pts = points.filter((p) => p.loadInE !== undefined && p.errorInE !== undefined && Number.isFinite(p.errorInE));

  return `<svg class="envelope" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title || 'Error envelope')}">
    ${title ? `<text class="title" x="${m.left}" y="14">${esc(title)}</text>` : ''}
    <path class="band" d="${area}"/>
    <path class="band-line" d="${upper}"/>
    <path class="band-line" d="${lowerLine}"/>
    <line class="zero" x1="${m.left}" x2="${m.left + W}" y1="${y(0)}" y2="${y(0)}"/>
    <line class="axis" x1="${m.left}" x2="${m.left}" y1="${m.top}" y2="${m.top + H}"/>
    <line class="axis" x1="${m.left}" x2="${m.left + W}" y1="${m.top + H}" y2="${m.top + H}"/>
    ${yTicks.map((v) => `<text class="tick" x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${fmt(v)}e</text>`).join('')}
    ${xTicks.map((v) => `<text class="tick" x="${x(v)}" y="${m.top + H + 16}" text-anchor="${v === 0 ? 'start' : v >= n ? 'end' : 'middle'}">${fmt(v)}e</text>`).join('')}
    ${steps.map((b) => `<text class="lbl" x="${(x(b.lo) + x(b.hi)) / 2}" y="${y(b.mpe) - 5}" text-anchor="middle">±${fmt(b.mpe)}e</text>`).join('')}
    ${pts.map((p) => {
      const cls = p.verdict === 'pass' ? 'pass' : p.verdict === 'fail' ? 'fail' : 'other';
      const cx = x(p.loadInE); const cy = y(p.errorInE);
      const flip = cx > m.left + W * 0.7;
      return `<g><circle class="pt ${cls}" cx="${cx}" cy="${cy}" r="5"><title>${esc(p.label)}: ${p.errorInE > 0 ? '+' : ''}${fmt(p.errorInE)}e at ${fmt(p.loadInE)}e</title></circle>
        ${cls === 'fail' ? `<text class="pt-lbl" x="${flip ? cx - 9 : cx + 9}" y="${cy + 4}" text-anchor="${flip ? 'end' : 'start'}">${esc(p.label)}</text>` : ''}</g>`;
    }).join('')}
    <text class="tick" x="${m.left + W}" y="${m.top + H + 30}" text-anchor="end">load, in verification scale intervals</text>
  </svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

window.envelopeSvg = envelopeSvg;
})();
