'use strict';

const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/engine');

const ruleset = engine.loadRuleset('oiml-r76-2006');

// Class III shop scale: Max 30 kg, e = 5 g. Worked by hand from the R 76 band table.
const shopScale = { accuracyClass: 'III', max: 30000, min: 100, e: 5, d: 5, units: 'g' };

test('n is derived from Max and e', () => {
  assert.strictEqual(engine.intervals(shopScale), 6000);
});

test('6000 intervals is admissible for class III', () => {
  const c = engine.classCheck(ruleset, shopScale);
  assert.strictEqual(c.withinRange, true);
  assert.strictEqual(c.designation, 'Medium accuracy');
});

test('MPE steps at the class III band boundaries', () => {
  // 2 kg = 400e, first band
  assert.strictEqual(engine.mpe(ruleset, shopScale, 2000, 'initial').limit, 2.5);
  // 2.5 kg = 500e, still the first band (boundary is inclusive)
  assert.strictEqual(engine.mpe(ruleset, shopScale, 2500, 'initial').limit, 2.5);
  // 2.505 kg = 501e, steps into the second band
  assert.strictEqual(engine.mpe(ruleset, shopScale, 2505, 'initial').limit, 5);
  // 10 kg = 2000e, second band
  assert.strictEqual(engine.mpe(ruleset, shopScale, 10000, 'initial').limit, 5);
  // 20 kg = 4000e, third band
  assert.strictEqual(engine.mpe(ruleset, shopScale, 20000, 'initial').limit, 7.5);
});

test('an instrument in service is allowed double the tolerance', () => {
  assert.strictEqual(engine.mpe(ruleset, shopScale, 20000, 'in-service').limit, 15);
});

test('the worked example fails at 20 kg', () => {
  const p = engine.evaluatePoint({
    ruleset, instrument: shopScale, context: 'initial',
    load: 20000, indication: 20010
  });
  assert.strictEqual(p.mpe, 7.5);
  assert.strictEqual(p.error, 10);
  assert.strictEqual(p.verdict, 'fail');
});

test('the same instrument passes that load once in service', () => {
  const p = engine.evaluatePoint({
    ruleset, instrument: shopScale, context: 'in-service',
    load: 20000, indication: 20010
  });
  assert.strictEqual(p.verdict, 'pass');
});

test('changeover point resolves error finer than one increment', () => {
  // Display reads 5000 g at a nominal 5000 g load. Adding 3 weights of e/10
  // (1.5 g total) flicks the display to 5005 g.
  //   P = 5000 + 0.5(5) - 1.5 = 5001.0  ->  error = +1.0 g
  const p = engine.evaluatePoint({
    ruleset, instrument: shopScale, context: 'initial',
    load: 5000, indication: 5000, addedLoad: 1.5
  });
  assert.strictEqual(p.corrected, 5001);
  assert.strictEqual(p.error, 1);
  assert.strictEqual(p.mpe, 5);
  assert.strictEqual(p.verdict, 'pass');
});

test('a raw reading would have hidden that error entirely', () => {
  const raw = engine.evaluatePoint({
    ruleset, instrument: shopScale, context: 'initial',
    load: 5000, indication: 5000
  });
  assert.strictEqual(raw.error, 0);
});

test('changeover point can turn a nominal pass into a fail', () => {
  // Display reads 1000 g at 1000 g. MPE at 200e is 0.5e = 2.5 g.
  // Only 0.1 g of added weight is needed to flick the display, so the true
  // indication sat at 1000 + 2.5 - 0.1 = 1002.4 g -> error +2.4 g. Still inside.
  const near = engine.evaluatePoint({
    ruleset, instrument: shopScale, context: 'initial',
    load: 1000, indication: 1000, addedLoad: 0.1
  });
  assert.strictEqual(near.error, 2.4);
  assert.strictEqual(near.verdict, 'pass');

  // A display already sitting one increment high fails outright.
  const over = engine.evaluatePoint({
    ruleset, instrument: shopScale, context: 'initial',
    load: 1000, indication: 1005, addedLoad: 2.0
  });
  assert.strictEqual(over.error, 5.5);
  assert.strictEqual(over.verdict, 'fail');
});

test('repeatability is judged on the spread, not only on each run', () => {
  const r = engine.evaluateTest({
    ruleset, instrument: shopScale, context: 'initial', purpose: 'verification', testKey: 'repeatability',
    observations: [
      { label: 'Run 1', load: 10000, indication: 10000 },
      { label: 'Run 2', load: 10000, indication: 10000 },
      { label: 'Run 3', load: 10000, indication: 10010 }
    ]
  });
  // every individual error is within the 5 g MPE... except the third
  assert.strictEqual(r.spread, 10);
  assert.strictEqual(r.spreadLimit, 5);
  assert.strictEqual(r.verdict, 'fail');
});

test('A.4.10 run counts depend on purpose, class and Max', () => {
  const spec = ruleset.tests.repeatability;
  // type approval, Max under 1000 kg -> 10 weighings per series
  assert.strictEqual(engine.requiredRuns(spec, shopScale, 'type-approval'), 10);
  // type approval, Max at or above 1000 kg -> at least 3
  const weighbridge = { ...shopScale, max: 2000000, e: 200, d: 200 };
  assert.strictEqual(engine.requiredRuns(spec, weighbridge, 'type-approval'), 3);
  // verification -> 3 on classes III and IIII, 6 on classes I and II
  assert.strictEqual(engine.requiredRuns(spec, shopScale, 'verification'), 3);
  assert.strictEqual(engine.requiredRuns(spec, { ...shopScale, accuracyClass: 'II' }, 'verification'), 6);
});

test('three runs is incomplete for a type approval needing ten', () => {
  const r = engine.evaluateTest({
    ruleset, instrument: shopScale, context: 'initial', purpose: 'type-approval', testKey: 'repeatability',
    observations: [
      { label: 'Run 1', load: 10000, indication: 10000 },
      { label: 'Run 2', load: 10000, indication: 10000 },
      { label: 'Run 3', load: 10000, indication: 10000 }
    ]
  });
  assert.strictEqual(r.runsRequired, 10);
  assert.strictEqual(r.verdict, 'incomplete');
});

test('the zero error is subtracted before comparison — Ec = E − E0', () => {
  // The standard's own example in A.4.4.3: e = 5 g, load 1 kg, indication 1000 g,
  // 1.5 g of added weight flicks the display. P = 1001 g, E = +1 g. With a zero
  // error of E0 = +0.5 g, the corrected error is Ec = +0.5 g.
  const p = engine.evaluatePoint({
    ruleset, instrument: shopScale, context: 'initial',
    load: 1000, indication: 1000, addedLoad: 1.5, zeroError: 0.5
  });
  assert.strictEqual(p.corrected, 1001);
  assert.strictEqual(p.rawError, 1);
  assert.strictEqual(p.error, 0.5);
  assert.strictEqual(p.verdict, 'pass');
});

test('an uncorrected zero error can wrongly fail a good instrument', () => {
  // Raw error +3 g against a 2.5 g limit looks like a failure, but 2.5 g of it
  // is the zero offset; corrected, the instrument is inside tolerance.
  const shared = { ruleset, instrument: shopScale, context: 'initial', load: 1000, indication: 1003 };
  assert.strictEqual(engine.evaluatePoint(shared).verdict, 'fail');
  assert.strictEqual(engine.evaluatePoint({ ...shared, zeroError: 2.5 }).verdict, 'pass');
});

test('discrimination is keyed to d, not to e', () => {
  // An instrument with an auxiliary indicating device: d = 1 g while e = 5 g.
  // 3.8.2.2 requires 1.4 d = 1.4 g to move the reading by one d = 1 g.
  const auxiliary = { accuracyClass: 'III', max: 30000, min: 100, e: 5, d: 1, units: 'g' };
  const r = engine.evaluateTest({
    ruleset, instrument: auxiliary, context: 'initial', testKey: 'discrimination',
    observations: [{ label: 'At 10 kg', load: 10000, indication: 10000, indicationAfter: 10001 }]
  });
  assert.strictEqual(r.points[0].addedLoad, 1.4);
  assert.strictEqual(r.points[0].verdict, 'pass');
  // keyed to e it would have demanded a 5 g move and failed this instrument
  assert.strictEqual(r.verdict, 'pass');
});

test('discrimination does not apply below d = 5 mg', () => {
  const fine = { accuracyClass: 'I', max: 200, min: 0.1, e: 0.001, d: 0.001, units: 'g' };
  const r = engine.evaluateTest({
    ruleset, instrument: fine, context: 'initial', testKey: 'discrimination',
    observations: [{ label: 'At 100 g', load: 100, indication: 100, indicationAfter: 100 }]
  });
  assert.strictEqual(r.verdict, 'not-applicable');
});

test('the permitted range of n depends on e, not on class alone', () => {
  // Table 3 splits class III: 0.1 g ≤ e ≤ 2 g admits n from 100, while 5 g ≤ e
  // requires at least 500. A 300-interval instrument is therefore admissible
  // with a fine e and inadmissible with a coarse one.
  const fineE = { accuracyClass: 'III', max: 300, min: 20, e: 1, d: 1, units: 'g' };
  assert.strictEqual(engine.classCheck(ruleset, fineE).withinRange, true);
  const coarseE = { accuracyClass: 'III', max: 1500, min: 100, e: 5, d: 5, units: 'g' };
  assert.strictEqual(engine.intervals(coarseE), 300);
  assert.strictEqual(engine.classCheck(ruleset, coarseE).withinRange, false);
});

test('minimum capacity is checked against the class lower limit', () => {
  // Class III requires Min ≥ 20e = 100 g for this instrument.
  const tooLow = { ...shopScale, min: 50, units: 'g' };
  const c = engine.classCheck(ruleset, tooLow);
  assert.strictEqual(c.minCapacity, 100);
  assert.strictEqual(c.minCapacityOk, false);
  assert.match(c.findings.join(' '), /below the lower limit/);
  assert.strictEqual(engine.classCheck(ruleset, { ...shopScale, units: 'g' }).minCapacityOk, true);
});

test('the changeover method is required when d exceeds 0.2 e', () => {
  assert.strictEqual(engine.classCheck(ruleset, shopScale).changeoverRequired, true);
  const auxiliary = { accuracyClass: 'III', max: 30000, min: 100, e: 5, d: 1, units: 'g' };
  assert.strictEqual(engine.classCheck(ruleset, auxiliary).changeoverRequired, false);
});

test('eccentricity flags a single bad corner', () => {
  const r = engine.evaluateTest({
    ruleset, instrument: shopScale, context: 'initial', testKey: 'eccentricity',
    observations: [
      { label: 'Centre', load: 10000, indication: 10000 },
      { label: 'Front left', load: 10000, indication: 10005 },
      { label: 'Rear right', load: 10000, indication: 10010 }
    ]
  });
  assert.strictEqual(r.verdict, 'fail');
  assert.strictEqual(r.points[1].verdict, 'pass');
  assert.strictEqual(r.points[2].verdict, 'fail');
});

test('discrimination requires the indication to actually move', () => {
  const r = engine.evaluateTest({
    ruleset, instrument: shopScale, context: 'initial', testKey: 'discrimination',
    observations: [
      { label: 'At 10 kg', load: 10000, indication: 10000, indicationAfter: 10005 },
      { label: 'At 20 kg', load: 20000, indication: 20000, indicationAfter: 20000 }
    ]
  });
  assert.strictEqual(r.points[0].verdict, 'pass');
  assert.strictEqual(r.points[1].verdict, 'fail');
  assert.strictEqual(r.verdict, 'fail');
});

test('tare is evaluated against the net load, not the gross', () => {
  // 12 kg gross on a 2 kg tare -> 10 kg net -> 2000e -> MPE 5 g
  const r = engine.evaluateTest({
    ruleset, instrument: shopScale, context: 'initial', testKey: 'tare',
    observations: [{ label: 'Net 10 kg', load: 12000, tare: 2000, indication: 10005 }]
  });
  assert.strictEqual(r.points[0].mpe, 5);
  assert.strictEqual(r.points[0].error, 5);
  assert.strictEqual(r.verdict, 'pass');
});

test('zero setting uses its own quarter-interval criterion', () => {
  const r = engine.evaluateTest({
    ruleset, instrument: shopScale, context: 'initial', testKey: 'zero',
    observations: [
      { label: 'After zero set', load: 0, indication: 1 },
      { label: 'After tare clear', load: 0, indication: 2 }
    ]
  });
  assert.strictEqual(r.points[0].mpe, 1.25);
  assert.strictEqual(r.points[0].verdict, 'pass');
  assert.strictEqual(r.points[1].verdict, 'fail');
});

test('a load beyond the highest band is rejected rather than silently passed', () => {
  const tiny = { accuracyClass: 'IIII', max: 10000, min: 100, e: 5, d: 5 };
  assert.throws(() => engine.mpe(ruleset, tiny, 9000, 'initial'), /exceeds the highest band/);
});

test('class II uses the same shape with different thresholds', () => {
  const jeweller = { accuracyClass: 'II', max: 200, min: 0.5, e: 0.01, d: 0.01 };
  // 1 g = 100e -> first band -> 0.5e = 0.005 g
  assert.strictEqual(engine.mpe(ruleset, jeweller, 1, 'initial').limit, 0.005);
  // 100 g = 10000e -> second band -> 1.0e = 0.01 g
  assert.strictEqual(engine.mpe(ruleset, jeweller, 100, 'initial').limit, 0.01);
});

test('session verdict rolls up and ignores tests not performed', () => {
  const s = engine.evaluateSession({
    ruleset, instrument: shopScale, context: 'initial',
    observations: [
      { testKey: 'weighing', label: '2 kg', load: 2000, indication: 2000 },
      { testKey: 'weighing', label: '20 kg', load: 20000, indication: 20000 }
    ]
  });
  assert.strictEqual(s.results.weighing.verdict, 'pass');
  assert.strictEqual(s.results.eccentricity.verdict, 'not-performed');
  assert.strictEqual(s.overall, 'pass');
});
