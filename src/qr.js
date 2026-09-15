'use strict';

// QR code encoder: byte mode, error-correction level M, versions 1 to 10
// (up to 213 bytes). Returns the module matrix or an SVG. No dependencies.

const CAP = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];               // data bytes at level M
const EC = { 1: [10, [16]], 2: [16, [28]], 3: [26, [44]], 4: [18, [32, 32]], 5: [24, [43, 43]],
             6: [16, [27, 27, 27, 27]], 7: [18, [31, 31, 31, 31]], 8: [22, [38, 38, 39, 39]],
             9: [22, [36, 36, 36, 37, 37]], 10: [26, [43, 43, 43, 43, 44]] };
const ALIGN = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const VERSION_INFO = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}

function rsEncode(data, n) {
  const g = rsGenerator(n);
  const out = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ out.shift();
    out.push(0);
    if (factor) for (let j = 0; j < n; j++) out[j] ^= mul(g[j + 1], factor);
  }
  return out;
}

function encode(text) {
  const bytes = Buffer.from(String(text), 'utf8');
  const version = CAP.findIndex((c, i) => i > 0 && c >= bytes.length);
  if (version < 1) throw new Error('text too long for a QR code up to version 10');
  const size = 17 + 4 * version;
  const [ecPerBlock, blocks] = EC[version];
  const dataBytes = blocks.reduce((a, b) => a + b, 0);

  // bit stream: mode, count, data, terminator, padding
  const bits = [];
  const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  push(0b0100, 4); push(bytes.length, version >= 10 ? 16 : 8);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataBytes * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0; data.length < dataBytes; p++) data.push(p % 2 ? 0x11 : 0xEC);

  // blocks and interleaving
  const dBlocks = [], eBlocks = [];
  let off = 0;
  for (const len of blocks) { const d = data.slice(off, off + len); off += len; dBlocks.push(d); eBlocks.push(rsEncode(d, ecPerBlock)); }
  const seq = [];
  const maxLen = Math.max(...blocks);
  for (let i = 0; i < maxLen; i++) for (const d of dBlocks) if (i < d.length) seq.push(d[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const e of eBlocks) seq.push(e[i]);

  // matrix with function patterns
  const m = Array.from({ length: size }, () => new Array(size).fill(null));   // null = free
  const set = (r, c, v) => { m[r][c] = v ? 1 : 0; };
  const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
    const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
    set(rr, cc, on); } };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  const al = ALIGN[version] || [];
  for (const pos of al) for (const pos2 of al) {
    const nearFinder = (pos <= 8 && pos2 <= 8) || (pos <= 8 && pos2 >= size - 9) || (pos >= size - 9 && pos2 <= 8);
    if (nearFinder) continue;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(pos + r, pos2 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }
  for (let i = 8; i < size - 8; i++) { if (m[6][i] === null) set(6, i, i % 2 === 0); if (m[i][6] === null) set(i, 6, i % 2 === 0); }
  set(size - 8, 8, 1);                                                          // dark module
  // reserve format and version areas
  for (let i = 0; i < 8; i++) { if (m[8][i] === null) m[8][i] = 0; if (m[i][8] === null) m[i][8] = 0; m[8][size - 1 - i] = 0; m[size - 1 - i][8] = 0; }
  m[8][8] = 0;
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { m[i][size - 11 + j] = 0; m[size - 11 + j][i] = 0; }
  const reserved = m.map((row) => row.map((v) => v !== null));

  // place data
  let bi = 0;
  const total = seq.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (reserved[r][c]) continue;
        const bit = bi < total ? (seq[bi >> 3] >> (7 - (bi & 7))) & 1 : 0;
        m[r][c] = bit; bi++;
      }
    }
  }

  // choose mask by penalty
  const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const g = m.map((row, r) => row.map((v, c) => (reserved[r][c] ? v : v ^ (MASKS[mask](r, c) ? 1 : 0))));
    applyFormat(g, size, mask);
    if (version >= 7) applyVersion(g, size, version);
    const score = penalty(g, size);
    if (!best || score < best.score) best = { grid: g, score };
  }
  return { size, version, modules: best.grid };
}

function applyFormat(g, size, mask) {
  let f = (0b00 << 3) | mask;                                                   // level M = 00
  let v = f << 10;
  for (let i = 14; i >= 10; i--) if ((v >> i) & 1) v ^= 0x537 << (i - 10);
  const bits = ((f << 10) | v) ^ 0x5412;
  for (let i = 0; i < 15; i++) {
    const b = (bits >> i) & 1;
    // vertical strip beside top-left finder, horizontal strip below it
    if (i < 6) g[i][8] = b; else if (i < 8) g[i + 1][8] = b; else g[size - 15 + i][8] = b;
    if (i < 8) g[8][size - 1 - i] = b; else if (i < 9) g[8][15 - i - 1 + 1] = b; else g[8][15 - i - 1] = b;
  }
  g[size - 8][8] = 1;
}

function applyVersion(g, size, version) {
  const bits = VERSION_INFO[version];
  for (let i = 0; i < 18; i++) {
    const b = (bits >> i) & 1;
    const r = Math.floor(i / 3), c = size - 11 + (i % 3);
    g[r][c] = b; g[c][r] = b;
  }
}

function penalty(g, size) {
  let score = 0;
  const runs = (line) => { let s = 0; for (let i = 0; i < size;) { let j = i; while (j < size && line[j] === line[i]) j++; if (j - i >= 5) s += 3 + (j - i - 5); i = j; } return s; };
  for (let i = 0; i < size; i++) { score += runs(g[i]); score += runs(g.map((row) => row[i])); }
  for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) { const v = g[r][c]; if (v === g[r][c + 1] && v === g[r + 1][c] && v === g[r + 1][c + 1]) score += 3; }
  const pat = [1, 0, 1, 1, 1, 0, 1];
  const find = (line) => { let s = 0; for (let i = 0; i + 7 <= size; i++) { let ok = true; for (let k = 0; k < 7; k++) if (line[i + k] !== pat[k]) { ok = false; break; } if (!ok) continue;
    const before = i >= 4 && line.slice(i - 4, i).every((x) => x === 0), after = i + 11 <= size && line.slice(i + 7, i + 11).every((x) => x === 0); if (before || after) s += 40; } return s; };
  for (let i = 0; i < size; i++) { score += find(g[i]); score += find(g.map((row) => row[i])); }
  const dark = g.flat().reduce((a, b) => a + b, 0);
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

function svg(text, { size = 120, margin = 2, dark = '#15202b', light = '#ffffff', title = '' } = {}) {
  const q = encode(text);
  const n = q.size + margin * 2;
  let path = '';
  for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) if (q.modules[r][c]) path += `M${c + margin},${r + margin}h1v1h-1z`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${esc(title || text)}">` +
    `<rect width="${n}" height="${n}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

module.exports = { encode, svg };
