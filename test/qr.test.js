'use strict';

const test = require('node:test');
const assert = require('node:assert');
const qr = require('../src/qr');

test('version is chosen from the payload length and the matrix has the right size', () => {
  assert.deepStrictEqual([qr.encode('A').version, qr.encode('A').size], [1, 21]);
  assert.deepStrictEqual([qr.encode('x'.repeat(60)).version, qr.encode('x'.repeat(60)).size], [4, 33]);
  assert.deepStrictEqual([qr.encode('x'.repeat(122)).version, qr.encode('x'.repeat(122)).size], [7, 45]);
  assert.deepStrictEqual([qr.encode('x'.repeat(213)).version, qr.encode('x'.repeat(213)).size], [10, 57]);
  assert.throws(() => qr.encode('x'.repeat(214)), /too long/);
});

test('function patterns are in place: finders, timing, dark module, alignment', () => {
  const q = qr.encode('https://example.test/verify/NAWI-C%2F2026%2F0001');
  const m = q.modules, n = q.size;
  const finderRow = [1, 1, 1, 1, 1, 1, 1];
  assert.deepStrictEqual(m[0].slice(0, 7), finderRow);
  assert.deepStrictEqual(m[0].slice(n - 7), finderRow);
  assert.deepStrictEqual(m[n - 1].slice(0, 7), finderRow);
  assert.deepStrictEqual(m[3].slice(0, 7), [1, 0, 1, 1, 1, 0, 1]);
  for (let i = 8; i < n - 8; i++) assert.strictEqual(m[6][i], i % 2 === 0 ? 1 : 0, `timing at column ${i}`);
  assert.strictEqual(m[n - 8][8], 1, 'dark module');
  // version 4 has an alignment pattern centred at (26, 26)
  assert.strictEqual(q.version, 4);
  assert.deepStrictEqual(m[26].slice(24, 29), [1, 0, 1, 0, 1]);
  assert.deepStrictEqual(m[24].slice(24, 29), [1, 1, 1, 1, 1]);
});

test('every cell is decided and the SVG is well formed', () => {
  const q = qr.encode('NAWI-C/2026/0001');
  assert.ok(q.modules.every((row) => row.every((v) => v === 0 || v === 1)));
  const svg = qr.svg('NAWI-C/2026/0001', { size: 90, title: 'verify' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /aria-label="verify"/);
  assert.match(svg, /<path d="M/);
  assert.ok(svg.endsWith('</svg>'));
});

test('the same text always yields the same code', () => {
  assert.strictEqual(qr.svg('abc'), qr.svg('abc'));
  assert.notStrictEqual(qr.svg('abc'), qr.svg('abd'));
});
