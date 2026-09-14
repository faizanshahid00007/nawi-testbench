'use strict';

const test = require('node:test');
const assert = require('node:assert');
const engine = require('../src/engine');

const ruleset = engine.loadRuleset('oiml-r76-2006');

// Class III platform scale: Max 15 kg, e = d = 5 g, mains powered, default temperature limits.
const platform = { accuracyClass: 'III', max: 15000, min: 100, e: 5, d: 5, units: 'g', electronic: 1,
                   powerSupply: 'mains', nominalVoltage: 230, tempMin: null, tempMax: null };
const ctx = { ruleset, instrument: platform, context: 'initial', purpose: 'type-approval' };
const run = (testKey, observations, checks) => engine.evaluateTest({ ...ctx, testKey, observations, checks });

/* ---- creep (3.9.4.1) ------------------------------------------------------ */

test('creep passes when drift within 0.5e over 30 min and 0.2e between 15 and 30 min', () => {
  // 0.5e = 2.5 g; readings quantised to d = 5 g, so any change fails the 30-min limit.
  const r = run('creep', [
    { label: 't0', load: 15000, indication: 15000, timeMin: 0 },
    { label: 't15', load: 15000, indication: 15000, timeMin: 15 },
    { label: 't30', load: 15000, indication: 15000, timeMin: 30 }
  ]);
  assert.strictEqual(r.verdict, 'pass');
  assert.match(r.note, /within 30 minutes/);
});

test('creep falls back to the four-hour mpe criterion when 30-minute limits are missed', () => {
  const series = [
    { label: 't0', load: 15000, indication: 15000, timeMin: 0 },
    { label: 't15', load: 15000, indication: 15005, timeMin: 15 },
    { label: 't30', load: 15000, indication: 15005, timeMin: 30 }
  ];
  const partial = run('creep', series);
  assert.strictEqual(partial.verdict, 'incomplete', 'must keep observing to 4 h');
  // mpe at 15 kg = 3000e -> 1.5e = 7.5 g; a 5 g drift over four hours is within it.
  const full = run('creep', [...series, { label: 't240', load: 15000, indication: 15005, timeMin: 240 }]);
  assert.strictEqual(full.verdict, 'pass');
  assert.match(full.note, /four-hour|4 h/);
  const bad = run('creep', [...series, { label: 't240', load: 15000, indication: 15010, timeMin: 240 }]);
  assert.strictEqual(bad.verdict, 'fail');
});

test('creep without readings at 15 and 30 minutes is incomplete', () => {
  const r = run('creep', [{ label: 't0', load: 15000, indication: 15000, timeMin: 0 }]);
  assert.strictEqual(r.verdict, 'incomplete');
});

/* ---- zero return (3.9.4.2) ------------------------------------------------ */

test('zero return limited to 0.5e', () => {
  assert.strictEqual(run('zeroReturn', [{ label: 'a', load: 15000, indication: 0, indicationAfter: 0 }]).verdict, 'pass');
  assert.strictEqual(run('zeroReturn', [{ label: 'a', load: 15000, indication: 0, indicationAfter: 5 }]).verdict, 'fail');
});

test('creep and zero return do not apply to class I', () => {
  const classI = { ...platform, accuracyClass: 'I', max: 200, min: 0.1, e: 0.001, d: 0.001 };
  const r = engine.evaluateTest({ ...ctx, instrument: classI, testKey: 'creep', observations: [{ label: 'a', load: 200, indication: 200, timeMin: 0 }] });
  assert.strictEqual(r.verdict, 'not-applicable');
});

/* ---- warm-up (A.5.2) ------------------------------------------------------ */

test('warm-up needs readings at 0, 5, 15 and 30 minutes, each corrected by its own zero error', () => {
  const at = (t, addedLoad, zeroError) => ({ label: 'Max', load: 15000, indication: 15000, timeMin: t, addedLoad, zeroError });
  const partial = run('warmup', [at(0, 1.0, 0.5), at(5, 1.5, 0.5)]);
  assert.strictEqual(partial.verdict, 'incomplete');
  assert.deepStrictEqual(partial.missingTimes, [15, 30]);
  const full = run('warmup', [at(0, 1.0, 0.5), at(5, 1.5, 0.5), at(15, 2.0, 0), at(30, 2.5, 0)]);
  assert.strictEqual(full.verdict, 'pass');
  // P = 15000 + 2.5 - 1.0 = 15001.5; E = 1.5; Ec = 1.5 - 0.5 = 1.0
  assert.strictEqual(full.points[0].error, 1);
});

/* ---- temperature (A.5.3.1) and zero drift (3.9.2.3) ------------------------ */

test('static temperature test is incomplete until four conditions are recorded', () => {
  const pt = (T, load) => ({ label: `${load}`, load, indication: load, condition: String(T), addedLoad: 2.5, zeroError: 0 });
  const r = run('temperature', [pt(20, 15000), pt(40, 15000), pt(-10, 15000)]);
  assert.strictEqual(r.verdict, 'incomplete');
  const full = run('temperature', [pt(20, 15000), pt(40, 15000), pt(-10, 15000), pt(5, 15000), pt(20, 5000)]);
  assert.strictEqual(full.verdict, 'pass');
  assert.strictEqual(full.conditions.length, 4);
});

test('zero drift with temperature limited to 1e per 5 °C for class III', () => {
  // 20 -> 40 °C is 4 steps of 5 °C: up to 4e = 20 g of drift is allowed.
  const ok = run('temperatureZero', [
    { label: '20', load: 0, indication: 0, condition: '20' },
    { label: '40', load: 0, indication: 15, condition: '40' }
  ]);
  assert.strictEqual(ok.verdict, 'pass');
  assert.strictEqual(ok.points[0].perStep, 3.75);
  const bad = run('temperatureZero', [
    { label: '20', load: 0, indication: 0, condition: '20' },
    { label: '40', load: 0, indication: 25, condition: '40' }
  ]);
  assert.strictEqual(bad.verdict, 'fail');
});

test('zero drift for class I is per 1 °C', () => {
  const classI = { ...platform, accuracyClass: 'I', max: 200, min: 0.1, e: 0.001, d: 0.001 };
  const r = engine.evaluateTest({ ...ctx, instrument: classI, testKey: 'temperatureZero', observations: [
    { label: '20', load: 0, indication: 0, condition: '20' },
    { label: '25', load: 0, indication: 0.006, condition: '25' }
  ] });
  // 6 mg over 5 °C = 1.2 mg per °C > 1e = 1 mg
  assert.strictEqual(r.verdict, 'fail');
  assert.strictEqual(r.perDegrees, 1);
});

/* ---- voltage (3.9.3) ------------------------------------------------------- */

test('supply limits follow the supply type', () => {
  const mains = engine.supplyLimits(ruleset, platform);
  assert.strictEqual(mains.lower, 195.5);
  assert.strictEqual(mains.upper, 253);
  const battery = engine.supplyLimits(ruleset, { ...platform, powerSupply: 'battery', nominalVoltage: 12, minOperatingVoltage: 9.5 });
  assert.strictEqual(battery.lower, 9.5);
  assert.strictEqual(battery.upper, 12);
  const vehicle = engine.supplyLimits(ruleset, { ...platform, powerSupply: 'vehicle-12', nominalVoltage: 12, minOperatingVoltage: 9 });
  assert.strictEqual(vehicle.upper, 16);
});

test('voltage variation needs the lower, nominal and upper conditions', () => {
  const pt = (V) => ({ label: '10 kg', load: 10000, indication: 10000, condition: String(V), addedLoad: 3.0, zeroError: 0 });
  assert.strictEqual(run('voltage', [pt(195.5), pt(253)]).verdict, 'incomplete');
  assert.strictEqual(run('voltage', [pt(195.5), pt(230), pt(253)]).verdict, 'pass');
});

/* ---- damp heat (B.2) ------------------------------------------------------- */

test('damp heat does not apply to class I or to class II with e below 1 g', () => {
  const classII = { ...platform, accuracyClass: 'II', max: 3000, min: 1, e: 0.01, d: 0.01 };
  assert.strictEqual(engine.applicability(ruleset.tests.dampHeat, classII).applicable, false);
  const classIIcoarse = { ...platform, accuracyClass: 'II', max: 30000, min: 250, e: 5, d: 5 };
  assert.strictEqual(engine.applicability(ruleset.tests.dampHeat, classIIcoarse).applicable, true);
});

/* ---- tilting (3.9.1.1) ----------------------------------------------------- */

test('tilting: no-load shift limited to 2e, loaded error to the mpe', () => {
  const ref = { label: 'No load', load: 0, indication: 0, condition: 'Reference (level)' };
  const okShift = { label: 'No load', load: 0, indication: 10, condition: 'Tilted lengthwise' };
  const badShift = { label: 'No load', load: 0, indication: 15, condition: 'Tilted transverse' };
  const loaded = { label: 'Max', load: 15000, indication: 15000, condition: 'Tilted lengthwise', addedLoad: 2.0, zeroError: 0 };
  const r = run('tilt', [ref, okShift, loaded]);
  assert.strictEqual(r.verdict, 'pass');
  assert.strictEqual(r.points[1].shift, 10);
  assert.strictEqual(run('tilt', [ref, badShift, loaded]).verdict, 'fail');
  assert.strictEqual(run('tilt', [okShift, loaded]).verdict, 'incomplete', 'reference zero missing');
});

test('tilting no-load requirement is waived for class II', () => {
  const classII = { ...platform, accuracyClass: 'II', max: 30000, min: 250, e: 5, d: 5 };
  const r = engine.evaluateTest({ ...ctx, instrument: classII, testKey: 'tilt', observations: [
    { label: 'No load', load: 0, indication: 15, condition: 'Tilted lengthwise' },
    { label: 'Max', load: 30000, indication: 30000, condition: 'Tilted lengthwise', addedLoad: 2.0, zeroError: 0 }
  ] });
  assert.strictEqual(r.points[0].verdict, 'not-applicable');
  assert.strictEqual(r.verdict, 'pass');
});

/* ---- span stability (5.3.3 / B.4) ----------------------------------------- */

test('span stability: variation limited to max(0.5e, 0.5 mpe) and eight measurements required', () => {
  // At Max the mpe is 7.5 g, so the variation limit is 3.75 g.
  const m = (i, dl) => ({ label: `m${i}`, load: 15000, indication: 15000, addedLoad: dl, zeroError: 0 });
  const seven = Array.from({ length: 7 }, (_, i) => m(i, 2.5));
  assert.strictEqual(run('spanStability', seven).verdict, 'incomplete');
  const eight = [...seven, m(7, 2.5)];
  assert.strictEqual(run('spanStability', eight).verdict, 'pass');
  const drifting = [...seven, m(7, 0)];       // error jumps from 0 to +2.5 g: variation 2.5 ≤ 3.75
  assert.strictEqual(run('spanStability', drifting).verdict, 'pass');
  const tooFar = [...seven, m(7, -2.0)];      // error 0 -> +4.5 g: variation 4.5 > 3.75
  const r = run('spanStability', tooFar);
  assert.strictEqual(r.variationVerdict, 'fail');
  assert.strictEqual(r.verdict, 'fail');
});

/* ---- checklists (7.1) ------------------------------------------------------ */

test('markings checklist fails on a missing compulsory marking and stays incomplete until answered', () => {
  const compulsory = ruleset.tests.markings.items.filter((i) => i.level === 'compulsory').map((i) => i.key);
  const checks = (result) => compulsory.map((key) => ({ testKey: 'markings', itemKey: key, result }));
  assert.strictEqual(run('markings', [], checks('yes')).verdict, 'pass');
  assert.strictEqual(run('markings', [], checks('yes').slice(0, -1)).verdict, 'incomplete');
  const one = checks('yes'); one[0].result = 'no';
  assert.strictEqual(run('markings', [], one).verdict, 'fail');
  const na = checks('yes'); na[0].result = 'na';
  assert.strictEqual(run('markings', [], na).verdict, 'fail', 'a compulsory item cannot be N/A');
});

/* ---- repeatability in two series ------------------------------------------- */

test('repeatability judges each series separately and demands 10 runs under 1000 kg', () => {
  const runs = (load, n) => Array.from({ length: n }, (_, i) => ({ label: `Run ${i + 1}`, load, indication: load, addedLoad: 2.5 }));
  const r = run('repeatability', [...runs(7500, 10), ...runs(15000, 4)]);
  assert.strictEqual(r.series.length, 2);
  assert.strictEqual(r.verdict, 'incomplete');
  assert.match(r.note, /4 recorded at 15000/);
});

/* ---- load plan (A.4.4.1) ---------------------------------------------------- */

test('weighing load plan demands Min, Max, band changes and both directions', () => {
  const pt = (load, dir = 'increasing') => ({ label: `${load}`, load, indication: load, direction: dir });
  const thin = run('weighing', [pt(5000), pt(7500)]);
  assert.strictEqual(thin.plan.satisfied, false);
  assert.ok(thin.plan.missing.some((m) => m.startsWith('Min')));
  assert.ok(thin.plan.missing.some((m) => m.startsWith('Max')));
  assert.deepStrictEqual(thin.plan.boundaries, [2500, 10000]);
  const good = run('weighing', [pt(100), pt(500), pt(1000), pt(2500), pt(5000), pt(7500), pt(10000), pt(12000), pt(14000), pt(15000), pt(7500, 'decreasing')]);
  assert.strictEqual(good.plan.satisfied, true);
});

/* ---- validation ------------------------------------------------------------ */

test('validation rejects impossible readings and warns on implausible ones', () => {
  const spec = { ...ruleset.tests.weighing, key: 'weighing' };
  const v = (obs) => engine.validateObservation({ ruleset, instrument: platform, spec, obs, existing: [] });
  assert.strictEqual(v({ label: 'x', load: 16000, indication: 16000 }).ok, false, 'load above Max');
  assert.strictEqual(v({ label: 'x', load: -1, indication: 0 }).ok, false, 'negative load');
  const w = v({ label: 'x', load: 5000, indication: 5002, addedLoad: 7 });
  assert.strictEqual(w.ok, true);
  assert.ok(w.warnings.some((s) => /multiple of d/.test(s)));
  assert.ok(w.warnings.some((s) => /exceeds one e/.test(s)));
  const tare = engine.validateObservation({ ruleset, instrument: { ...platform, tareMaxAdditive: 7000 }, spec: { ...ruleset.tests.tare, key: 'tare' },
    obs: { label: 'x', load: 12000, tare: 8000, indication: 4000 }, existing: [] });
  assert.strictEqual(tare.ok, false, 'tare above T');
});

/* ---- completeness and certificate eligibility ------------------------------- */

test('a passing session is certificate-eligible only when every required test is done', () => {
  const obs = [{ testKey: 'weighing', label: 'Max', load: 15000, indication: 15000, direction: 'increasing' }];
  const r = engine.evaluateSession({ ...ctx, zeroError: 0, observations: obs, checks: [] });
  assert.strictEqual(r.overall, 'pass');
  assert.strictEqual(r.certificateEligible, false);
  assert.ok(r.completeness.missing.includes('eccentricity'));
  assert.ok(r.completeness.missing.includes('markings'));
});

test('special temperature limits must span the class minimum', () => {
  const c = engine.classCheck(ruleset, { ...platform, tempMin: 10, tempMax: 30 });
  assert.ok(c.findings.some((f) => /30 °C/.test(f)), 'class III needs a 30 °C span');
  const ok = engine.classCheck(ruleset, { ...platform, tempMin: 5, tempMax: 40 });
  assert.strictEqual(ok.findings.length, 0);
});
