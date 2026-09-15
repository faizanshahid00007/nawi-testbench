'use strict';

const test = require('node:test');
const assert = require('node:assert');

test('assistance reports disabled when no provider key is present', () => {
  delete process.env.NAWI_AI_MOCK; delete process.env.ANTHROPIC_API_KEY; delete process.env.GEMINI_API_KEY;
  const ai = require('../src/ai');
  assert.deepStrictEqual(ai.status(), { enabled: false, provider: null, model: null });
});

test('complete() refuses cleanly when unconfigured', async () => {
  const ai = require('../src/ai');
  await assert.rejects(ai.complete({ system: 's', prompt: 'p' }), (e) => e.status === 503 && /not configured/.test(e.message));
});

test('parseJson pulls an object out of prose and fences', () => {
  const ai = require('../src/ai');
  assert.deepStrictEqual(ai.parseJson('Here you go:\n```json\n{"max": 15000, "e": 5}\n```'), { max: 15000, e: 5 });
  assert.throws(() => ai.parseJson('no data'), /structured data/);
});

test('compactEvaluation carries only what the model needs', () => {
  const ai = require('../src/ai');
  const engine = require('../src/engine');
  const ruleset = engine.loadRuleset('oiml-r76-2006');
  const instrument = { manufacturer: 'A', model: 'B', serial: 'C', accuracyClass: 'III', max: 15000, min: 100, e: 5, d: 5, units: 'g', rangeType: 'single', ranges: null };
  const evaluation = engine.evaluateSession({ ruleset, instrument, context: 'initial', purpose: 'verification', zeroError: 0,
    observations: [{ testKey: 'weighing', label: 'Max', load: 15000, indication: 15010, direction: 'increasing' }], checks: [] });
  const c = ai.compactEvaluation({ session: { reference: 'R', purpose: 'verification', context: 'initial', status: 'draft', laboratory: 'L' }, instrument, evaluation, ruleset });
  assert.strictEqual(c.overall, 'fail');
  assert.strictEqual(c.results.weighing.points[0].error, 10);
  assert.strictEqual(c.results.weighing.clause, '3.5.1 / A.4.4.1');
  assert.ok(!('data' in c.instrument));
});

test('mock provider exercises the grounded prompts end to end', async () => {
  process.env.NAWI_AI_MOCK = '1';
  delete require.cache[require.resolve('../src/ai')];
  const ai = require('../src/ai');
  assert.strictEqual(ai.status().provider, 'mock');
  const plate = await ai.readPlate({ mime: 'image/png', data: 'AA==' });
  assert.strictEqual(plate.accuracyClass, 'III');
  const engine = require('../src/engine');
  const ruleset = engine.loadRuleset('oiml-r76-2006');
  const instrument = { manufacturer: 'A', model: 'B', serial: 'C', accuracyClass: 'III', max: 15000, min: 100, e: 5, d: 5, units: 'g' };
  const evaluation = engine.evaluateSession({ ruleset, instrument, context: 'initial', purpose: 'verification', zeroError: 0, observations: [], checks: [] });
  const bundle = { session: { reference: 'R', purpose: 'verification', context: 'initial', status: 'draft', laboratory: 'L', rulesetId: 'oiml-r76-2006' }, instrument, evaluation, ruleset };
  assert.match(await ai.draftSummary(bundle), /summary/i);
  assert.match(await ai.ask('what is e?', bundle, ruleset), /grounded/);
  delete process.env.NAWI_AI_MOCK;
});
