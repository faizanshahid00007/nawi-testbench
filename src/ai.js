'use strict';

// AI assistance, grounded in the application's own data. Three jobs:
//   readPlate     photograph of a data plate -> instrument particulars to review
//   draftSummary  evaluation -> plain-language remarks with clauses
//   explainTest / ask  questions about a verdict or about the rules applied
// Provider is chosen from the environment: ANTHROPIC_API_KEY (Claude, via the
// official SDK) or GEMINI_API_KEY (Google, raw HTTP). With neither, every
// entry point reports that assistance is not configured and the UI hides it.

const fs = require('fs');
const path = require('path');

const ANTHROPIC_MODEL = process.env.AI_MODEL || 'claude-opus-5';
const GEMINI_MODEL = process.env.AI_MODEL || 'gemini-2.5-flash';

function provider() {
  if (process.env.NAWI_AI_MOCK) return 'mock';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return null;
}

function status() {
  const p = provider();
  return { enabled: Boolean(p), provider: p, model: p === 'anthropic' ? ANTHROPIC_MODEL : p === 'gemini' ? GEMINI_MODEL : null };
}

let anthropicClient = null;
function anthropic() {
  if (!anthropicClient) { const Anthropic = require('@anthropic-ai/sdk'); anthropicClient = new Anthropic(); }
  return anthropicClient;
}

// One completion: system + user text, optional image. Returns plain text.
async function complete({ system, prompt, image, maxTokens = 4000, effort = 'medium' }) {
  const p = provider();
  if (!p) { const e = new Error('AI assistance is not configured on this server. Set ANTHROPIC_API_KEY or GEMINI_API_KEY and restart.'); e.status = 503; throw e; }
  if (p === 'mock') return mockComplete({ prompt, image });

  if (p === 'anthropic') {
    const content = [];
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } });
    content.push({ type: 'text', text: prompt });
    const res = await anthropic().beta.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    });
    if (res.stop_reason === 'refusal') { const e = new Error('The assistant declined this request.'); e.status = 422; throw e; }
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }

  // Gemini, raw HTTP
  const parts = [];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  parts.push({ text: prompt });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 } }) });
  if (!r.ok) { const body = await r.text().catch(() => ''); const e = new Error(`Gemini request failed (${r.status}): ${body.slice(0, 200)}`); e.status = 502; throw e; }
  const data = await r.json();
  return (data.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('\n').trim();
}

function mockComplete({ prompt, image }) {
  if (image) return JSON.stringify({ manufacturer: 'Mock Scales', model: 'MK-1', serial: 'MK-0001', accuracyClass: 'III', max: 15000, min: 100, e: 5, d: 5, units: 'g', nominalVoltage: 230, powerSupply: 'mains', notes: 'mock reading' });
  if (/Draft the remarks/i.test(prompt)) return 'Mock summary: the evaluation was reviewed against the stated rule set.';
  return 'Mock answer grounded in the supplied context.';
}

// Pull a JSON object out of a model reply that may be wrapped in prose or fences.
function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('the assistant did not return structured data');
  return JSON.parse(m[0]);
}

const SYSTEM = `You are the assistant inside NAWI TestBench, software that evaluates non-automatic weighing instruments against OIML R 76-1:2006. You answer only from the data you are given: the rule set, the evaluation record and the documentation excerpts. Never invent readings, limits, clause numbers or verdicts; if the record does not contain something, say so. Quote clause numbers exactly as they appear in the data. Write plainly for a laboratory engineer; no marketing language.`;

async function readPlate(image) {
  const prompt = `This is a photograph of the descriptive markings (data plate) of a weighing instrument, or of its display and housing. Extract what is legibly present and return ONLY a JSON object with these keys, using null for anything not visible: manufacturer, model, serial, accuracyClass (one of "I","II","III","IIII"), max (number), min (number), e (number), d (number), units ("g" or "kg" as printed for Max), tareMaxAdditive (number or null), nominalVoltage (number or null), powerSupply (one of "mains","external","battery","vehicle-12","vehicle-24" or null), tempMin (number or null), tempMax (number or null), softwareVersion (string or null), notes (short string describing anything uncertain). Convert all mass values to the unit you report in "units". Do not guess values that are not printed.`;
  const text = await complete({ system: SYSTEM, prompt, image, maxTokens: 1500, effort: 'medium' });
  return parseJson(text);
}

function methodologyExcerpt() {
  try { return fs.readFileSync(path.join(__dirname, '..', 'docs', 'calculation-methodology.md'), 'utf8').slice(0, 12000); } catch { return ''; }
}

function compactEvaluation(bundle) {
  const { session, instrument, evaluation, ruleset } = bundle;
  const results = Object.fromEntries(Object.entries(evaluation.results).map(([k, t]) => [k, {
    label: t.label, clause: ruleset.tests[k]?.clause, verdict: t.verdict, criterion: t.criterion, note: t.note,
    points: (t.points || []).slice(0, 40).map((p) => ({ label: p.label, load: p.load, indication: p.indication, addedLoad: p.addedLoad, zeroError: p.zeroError,
      corrected: p.corrected, error: p.error, mpe: p.mpe, e: p.e, condition: p.condition, timeMin: p.timeMin, result: p.result, verdict: p.verdict, remark: p.remark }))
  }]));
  return {
    reference: session.reference, purpose: session.purpose, context: session.context, status: session.status, laboratory: session.laboratory,
    instrument: { manufacturer: instrument.manufacturer, model: instrument.model, serial: instrument.serial, accuracyClass: instrument.accuracyClass,
      max: instrument.max, min: instrument.min, e: instrument.e, d: instrument.d, units: instrument.units, rangeType: instrument.rangeType, ranges: instrument.ranges },
    classification: { n: evaluation.classification.n, findings: evaluation.classification.findings, ranges: evaluation.classification.ranges },
    overall: evaluation.overall, completeness: evaluation.completeness, certificateEligible: evaluation.certificateEligible, results
  };
}

async function draftSummary(bundle) {
  const prompt = `Draft the remarks section of the test report for the evaluation below. Write 4 to 8 sentences in plain English: what was evaluated, which tests passed, which failed and by how much against which limit (with clause numbers from the data), what remains outstanding for the stated purpose, and whether the instrument is eligible for a certificate. Use the units given. Do not add anything the record does not support.

EVALUATION RECORD (JSON):
${JSON.stringify(compactEvaluation(bundle))}`;
  return complete({ system: SYSTEM, prompt, maxTokens: 1200, effort: 'medium' });
}

async function explainTest(bundle, testKey) {
  const t = bundle.evaluation.results[testKey];
  if (!t) throw new Error('no such test in this report');
  const spec = bundle.ruleset.tests[testKey];
  const prompt = `Explain this test result to a laboratory engineer in at most 6 sentences: what the criterion is, how each relevant number was derived (changeover correction P = I + ½e − ΔL, zero correction Ec = E − E0, the MPE band for the load), which points decided the verdict, and what, if anything, would change the outcome. Use only the numbers in the data.

TEST DEFINITION: ${JSON.stringify(spec)}
INSTRUMENT: ${JSON.stringify(compactEvaluation(bundle).instrument)}
RESULT: ${JSON.stringify({ ...t, points: (t.points || []).slice(0, 40) })}

METHODOLOGY EXCERPT:
${methodologyExcerpt().slice(0, 6000)}`;
  return complete({ system: SYSTEM, prompt, maxTokens: 900, effort: 'medium' });
}

async function ask(question, bundle, ruleset) {
  const prompt = `Answer the question using the rule set and, if present, the open report. If the answer is not in the data, say what the data does not contain.

QUESTION: ${question}

RULE SET (JSON): ${JSON.stringify(ruleset)}
${bundle ? `OPEN REPORT (JSON): ${JSON.stringify(compactEvaluation(bundle))}` : ''}
METHODOLOGY EXCERPT:
${methodologyExcerpt()}`;
  return complete({ system: SYSTEM, prompt, maxTokens: 1200, effort: 'medium' });
}

module.exports = { status, provider, complete, readPlate, draftSummary, explainTest, ask, parseJson, compactEvaluation };
