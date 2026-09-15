'use strict';

const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/engine');

const ruleset = engine.loadRuleset('oiml-r76-2006');

// Class III multi-interval retail scale: e1 = 2 g up to 6 kg, e2 = 5 g up to 15 kg.
const multi = { accuracyClass: 'III', max: 15000, min: 40, e: 2, d: 2, units: 'g', rangeType: 'multi-interval',
                ranges: JSON.stringify([{ e: 2, max: 6000 }, { e: 5, max: 15000 }]) };

test('ranges are parsed, sorted and default d to e', () => {
  const r = engine.rangesOf(multi);
  assert.deepStrictEqual(r, [{ e: 2, max: 6000, d: 2 }, { e: 5, max: 15000, d: 5 }]);
  assert.strictEqual(engine.rangeAt(multi, 5000).e, 2);
  assert.strictEqual(engine.rangeAt(multi, 6000).e, 2, 'upper bound belongs to the lower range');
  assert.strictEqual(engine.rangeAt(multi, 6001).e, 5);
  assert.strictEqual(engine.isMultiRange(multi), true);
});

test('each partial range is classified on its own', () => {
  const c = engine.classCheck(ruleset, multi);
  assert.strictEqual(c.multiRange, true);
  assert.deepStrictEqual(c.ranges.map((r) => [r.n, r.withinRange]), [[3000, true], [3000, true]]);
  assert.strictEqual(c.findings.length, 0);
  const bad = engine.classCheck(ruleset, { ...multi, ranges: JSON.stringify([{ e: 5, max: 6000 }, { e: 2, max: 15000 }]) });
  assert.ok(bad.findings.some((f) => /increasing e/.test(f)));
});

test('MPE uses the e of the range the load falls in', () => {
  // 5 kg in range 1: 2500 e -> band > 2000 e -> 1.5 e = 3 g
  assert.strictEqual(engine.mpe(ruleset, multi, 5000, 'initial').limit, 3);
  // 10 kg in range 2: 2000 e -> band 500..2000 e -> 1 e = 5 g
  assert.strictEqual(engine.mpe(ruleset, multi, 10000, 'initial').limit, 5);
  assert.strictEqual(engine.mpe(ruleset, multi, 10000, 'initial').e, 5);
});

test('changeover correction uses the interval of the range', () => {
  const p = engine.evaluatePoint({ ruleset, instrument: multi, context: 'initial', load: 10000, indication: 10000, addedLoad: 1.0 });
  // P = 10000 + 2.5 - 1.0 = 10001.5 -> E = +1.5 g against 5 g
  assert.strictEqual(p.corrected, 10001.5);
  assert.strictEqual(p.e, 5);
  assert.strictEqual(p.verdict, 'pass');
  const q = engine.evaluatePoint({ ruleset, instrument: multi, context: 'initial', load: 5000, indication: 5000, addedLoad: 1.0 });
  // P = 5000 + 1 - 1 = 5000 -> E = 0 against 3 g
  assert.strictEqual(q.corrected, 5000);
  assert.strictEqual(q.e, 2);
});

test('band boundaries include the range change point', () => {
  assert.deepStrictEqual(engine.bandBoundaries(ruleset, multi), [1000, 4000, 6000, 10000]);
});

test('discrimination uses d of the range at the load', () => {
  const r = engine.evaluateTest({ ruleset, instrument: multi, context: 'initial', purpose: 'type-approval', testKey: 'discrimination',
    observations: [{ label: 'a', load: 10000, indication: 10000, indicationAfter: 10005 }, { label: 'b', load: 3000, indication: 3000, indicationAfter: 3002 }] });
  assert.strictEqual(r.points[0].addedLoad, 7);
  assert.strictEqual(r.points[1].addedLoad, 2.8);
  assert.strictEqual(r.verdict, 'pass');
});

test('validation judges multiples of d per range', () => {
  const spec = { ...ruleset.tests.weighing, key: 'weighing' };
  const ok = engine.validateObservation({ ruleset, instrument: multi, spec, obs: { label: 'x', load: 10000, indication: 10005 }, existing: [] });
  assert.strictEqual(ok.warnings.some((w) => /multiple of d/.test(w)), false);
  const warn = engine.validateObservation({ ruleset, instrument: multi, spec, obs: { label: 'x', load: 10000, indication: 10002 }, existing: [] });
  assert.ok(warn.warnings.some((w) => /multiple of d/.test(w)));
});

test('single-range instruments are unchanged', () => {
  const single = { accuracyClass: 'III', max: 30000, min: 100, e: 5, d: 5, units: 'g' };
  assert.strictEqual(engine.isMultiRange(single), false);
  assert.deepStrictEqual(engine.bandBoundaries(ruleset, single), [2500, 10000]);
  assert.strictEqual(engine.mpe(ruleset, single, 20000, 'initial').limit, 7.5);
});
