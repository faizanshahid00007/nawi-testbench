'use strict';

const EPS = 1e-9;

function loadRuleset(id) {
  return require(`../rulesets/${id}.json`);
}

function listRulesets() {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'rulesets');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const r = require(path.join(dir, f));
      return { id: r.id, label: r.label, effectiveFrom: r.effectiveFrom };
    });
}

function intervals(instrument) {
  return instrument.max / instrument.e;
}

function toGrams(value, units) {
  return units === 'kg' ? value * 1000 : value;
}

function rowFor(cls, e) {
  return cls.rows.find((r) =>
    e >= r.eMin - EPS && (r.eMax === null || e <= r.eMax + EPS)) || null;
}

/* ------------------------------------------------------------------------ */
/* Classification                                                             */
/* ------------------------------------------------------------------------ */

function classCheck(ruleset, instrument) {
  const cls = ruleset.classes[instrument.accuracyClass];
  if (!cls) throw new Error(`unknown accuracy class: ${instrument.accuracyClass}`);
  const n = intervals(instrument);
  const row = rowFor(cls, instrument.e);
  const findings = [];

  if (!row) {
    findings.push(`e = ${instrument.e} is outside every verification scale interval band defined for class ${instrument.accuracyClass}`);
    return { n, designation: cls.designation, row: null, nRange: null, minCapacity: null,
             withinRange: false, minCapacityOk: false, findings, clause: cls.clause };
  }

  const withinRange = n >= row.nMin - EPS && (row.nMax === null || n <= row.nMax + EPS);
  if (!withinRange) {
    findings.push(`n = ${round(n, 1)} is outside the permitted range ${row.nMin}–${row.nMax ?? '∞'} for class ${instrument.accuracyClass} with e = ${instrument.e}`);
  }

  const minCapacity = row.minCapacityE * instrument.e;
  const minCapacityOk = instrument.min >= minCapacity - EPS;
  if (!minCapacityOk) {
    findings.push(`Min = ${instrument.min} is below the lower limit of ${row.minCapacityE}e = ${round(minCapacity)} required for class ${instrument.accuracyClass}`);
  }

  if (instrument.d > instrument.e + EPS) {
    findings.push(`d = ${instrument.d} exceeds e = ${instrument.e}; the actual scale interval cannot be larger than the verification scale interval`);
  }
  if (Math.abs(n - Math.round(n)) > 1e-6) {
    findings.push(`Max / e = ${round(n, 3)} is not a whole number; Max must be a multiple of e`);
  }

  const tempRange = temperatureRange(ruleset, instrument);
  if (tempRange.finding) findings.push(tempRange.finding);

  return {
    n, designation: cls.designation, clause: cls.clause,
    row, nRange: [row.nMin, row.nMax], minCapacity: round(minCapacity),
    withinRange, minCapacityOk,
    changeoverRequired: instrument.d > ruleset.roundingEliminationRatio * instrument.e + EPS,
    temperature: tempRange,
    findings
  };
}

// 3.9.2: an instrument without marked limits must hold -10 / +40 °C; one with
// special limits must offer at least the class-dependent minimum range.
function temperatureRange(ruleset, instrument) {
  const dflt = ruleset.defaultTemperatureLimits || { min: -10, max: 40 };
  const hasSpecial = instrument.tempMin !== null && instrument.tempMin !== undefined
                  && instrument.tempMax !== null && instrument.tempMax !== undefined;
  const min = hasSpecial ? Number(instrument.tempMin) : dflt.min;
  const max = hasSpecial ? Number(instrument.tempMax) : dflt.max;
  const need = (ruleset.minimumTemperatureRange || {})[instrument.accuracyClass];
  let finding = null;
  if (hasSpecial && need !== undefined && max - min < need - EPS) {
    finding = `special temperature range ${min} °C / ${max} °C spans ${round(max - min)} °C; class ${instrument.accuracyClass} requires at least ${need} °C (3.9.2.2)`;
  }
  return { min, max, special: hasSpecial, minimumSpan: need ?? null, finding,
           clause: hasSpecial ? '3.9.2.2' : (dflt.clause || '3.9.2.1') };
}

// 3.9.3: the voltage limits between which the instrument must keep its
// metrological properties depend on the kind of supply.
function supplyLimits(ruleset, instrument) {
  const types = (ruleset.supply || {}).types || {};
  const type = types[instrument.powerSupply];
  if (!type) return null;
  const nominal = Number(instrument.nominalVoltage);
  const minOp = instrument.minOperatingVoltage === null || instrument.minOperatingVoltage === undefined
    ? null : Number(instrument.minOperatingVoltage);
  const bound = (rule) => {
    if (rule.absolute !== undefined) return rule.absolute;
    if (rule.minOperating) return minOp;
    if (Number.isFinite(nominal) && nominal > 0) return round(nominal * rule.factor, 3);
    return null;
  };
  return {
    type: instrument.powerSupply, label: type.label, nominal: Number.isFinite(nominal) ? nominal : null,
    lower: bound(type.lower), upper: bound(type.upper),
    lowerRule: type.lower.minOperating ? 'minimum operating voltage'
      : `${type.lower.factor} × U`,
    upperRule: type.upper.absolute !== undefined ? `${type.upper.absolute} V`
      : `${type.upper.factor} × U`,
    clause: (ruleset.supply || {}).clause || '3.9.3'
  };
}

/* ------------------------------------------------------------------------ */
/* Maximum permissible error                                                  */
/* ------------------------------------------------------------------------ */

function bandFor(ruleset, accuracyClass, loadInE) {
  const cls = ruleset.classes[accuracyClass];
  if (!cls) throw new Error(`unknown accuracy class: ${accuracyClass}`);
  for (const [lo, hi, mpeE] of cls.bands) {
    const aboveFloor = lo === 0 ? loadInE >= 0 : loadInE > lo + EPS;
    const belowCeiling = hi === null || loadInE <= hi + EPS;
    if (aboveFloor && belowCeiling) return { lo, hi, mpeE };
  }
  return null;
}

function mpe(ruleset, instrument, load, context) {
  const loadInE = Math.abs(load) / instrument.e;
  const band = bandFor(ruleset, instrument.accuracyClass, loadInE);
  if (!band) {
    throw new Error(
      `load of ${loadInE.toFixed(1)}e exceeds the highest band defined for class ${instrument.accuracyClass}`
    );
  }
  const base = band.mpeE * instrument.e;
  const limit = context === 'in-service' ? base * ruleset.inServiceMultiplier : base;
  return { limit, band, loadInE, multiplier: context === 'in-service' ? ruleset.inServiceMultiplier : 1 };
}

// Loads at which the mpe steps, for a given instrument: the band boundaries
// expressed in the instrument's units, capped at Max. A.4.4.1 asks for test
// loads at or near these.
function bandBoundaries(ruleset, instrument) {
  const cls = ruleset.classes[instrument.accuracyClass];
  return cls.bands
    .map(([, hi]) => hi)
    .filter((hi) => hi !== null && hi * instrument.e < instrument.max - EPS)
    .map((hi) => round(hi * instrument.e));
}

/* ------------------------------------------------------------------------ */
/* Single point                                                               */
/* ------------------------------------------------------------------------ */

// A digital display quantises to whole multiples of e, so a raw reading cannot
// resolve an error finer than one increment. Small weights are added until the
// display steps up, and the pre-rounding indication is recovered from the point
// at which it changed over.
function correctedIndication({ indication, e, addedLoad }) {
  return indication + 0.5 * e - addedLoad;
}

function evaluatePoint({ ruleset, instrument, context, load, indication, addedLoad, zeroError }) {
  const corrected =
    addedLoad === null || addedLoad === undefined
      ? indication
      : correctedIndication({ indication, e: instrument.e, addedLoad });
  const rawError = corrected - load;
  // A.4.4.3: the error prior to rounding is corrected by the error determined at,
  // or close to, zero before the measurement -- Ec = E - E0 -- and it is Ec that
  // is compared against the mpe.
  const e0 = zeroError ?? 0;
  const error = rawError - e0;
  const { limit, band, loadInE, multiplier } = mpe(ruleset, instrument, load, context);
  return {
    load,
    indication,
    addedLoad: addedLoad ?? null,
    corrected: round(corrected),
    rawError: round(rawError),
    zeroError: round(e0),
    error: round(error),
    errorInE: round(error / instrument.e, 3),
    mpe: round(limit),
    mpeInE: round(limit / instrument.e, 3),
    band: band.hi === null ? `> ${band.lo}e` : `${band.lo}–${band.hi}e`,
    loadInE: round(loadInE, 1),
    multiplier,
    verdict: Math.abs(error) <= limit + EPS ? 'pass' : 'fail'
  };
}

/* ------------------------------------------------------------------------ */
/* Applicability                                                              */
/* ------------------------------------------------------------------------ */

function isElectronic(instrument) {
  return instrument.electronic === undefined || instrument.electronic === null
    ? true : Boolean(Number(instrument.electronic));
}

function applicability(spec, instrument) {
  if (spec.appliesToClasses && !spec.appliesToClasses.includes(instrument.accuracyClass)) {
    return { applicable: false, reason: `applies to class ${spec.appliesToClasses.join(', ')} instruments only` };
  }
  if (spec.electronicOnly && !isElectronic(instrument)) {
    return { applicable: false, reason: 'applies to electronic instruments only' };
  }
  if (spec.notApplicable) {
    const na = spec.notApplicable;
    if (na.classes && na.classes.includes(instrument.accuracyClass)) {
      return { applicable: false, reason: `not applicable to class ${instrument.accuracyClass} instruments` };
    }
    if (na.classIIWhenEBelow !== undefined && instrument.accuracyClass === 'II'
        && toGrams(instrument.e, instrument.units || 'g') < na.classIIWhenEBelow - EPS) {
      return { applicable: false, reason: `not applicable to class II instruments with e below ${na.classIIWhenEBelow} g` };
    }
  }
  if (spec.kind === 'discrimination' && instrument.d < spec.appliesWhenDAtLeast - EPS) {
    return { applicable: false, reason: `3.8.2.2 applies only to instruments with d ≥ ${spec.appliesWhenDAtLeast} g; this instrument has d = ${instrument.d}` };
  }
  return { applicable: true, reason: null };
}

/* ------------------------------------------------------------------------ */
/* Test evaluation                                                            */
/* ------------------------------------------------------------------------ */

function evaluateTest({ ruleset, instrument, context, purpose, testKey, observations, checks = [], sessionZeroError = 0 }) {
  const spec = ruleset.tests[testKey];
  if (!spec) throw new Error(`unknown test: ${testKey}`);

  const na = applicability(spec, instrument);
  if (!na.applicable) {
    return { label: spec.label, description: spec.description, kind: spec.kind, points: [],
             verdict: 'not-applicable', note: na.reason };
  }

  switch (spec.kind) {
    case 'limit': return evalLimit(spec, instrument, observations);
    case 'deviation': return evalDeviation(spec, instrument, observations);
    case 'discrimination': return evalDiscrimination(spec, instrument, observations);
    case 'checklist': return evalChecklist(spec, checks);
    case 'zero-drift': return evalZeroDrift(spec, instrument, observations);
    case 'creep': return evalCreep(ruleset, spec, instrument, context, observations);
    default: break;
  }

  const points = observations.map((o) => ({
    label: o.label,
    ...evaluatePoint({
      ruleset,
      instrument,
      context,
      load: spec.netBasis ? o.load - (o.tare ?? 0) : o.load,
      indication: o.indication,
      addedLoad: o.addedLoad,
      zeroError: spec.zeroCorrected ? (o.zeroError ?? sessionZeroError) : 0
    }),
    direction: o.direction || 'increasing',
    tare: o.tare ?? null,
    condition: o.condition ?? null,
    timeMin: o.timeMin ?? null,
    remark: o.remark ?? null
  }));

  switch (spec.kind) {
    case 'spread': return evalSpread(spec, instrument, purpose, points);
    case 'timed': return evalTimed(spec, instrument, points);
    case 'conditioned': return evalConditioned(spec, instrument, points);
    case 'tilt': return evalTilt(spec, instrument, points);
    case 'span': return evalSpan(spec, instrument, points);
    default: {
      const result = finish(spec, points, { criterion: '|error| ≤ MPE for the applied load' });
      if (spec.loadPlan) result.plan = loadPlanCheck(ruleset, spec, instrument, purpose, points);
      return result;
    }
  }
}

function evalLimit(spec, instrument, observations) {
  const limit = spec.limitE * instrument.e;
  const points = observations.map((o) => ({
    label: o.label,
    load: o.load,
    indication: o.indication,
    error: round(o.indication - o.load),
    mpe: round(limit),
    mpeInE: spec.limitE,
    remark: o.remark ?? null,
    verdict: Math.abs(o.indication - o.load) <= limit + EPS ? 'pass' : 'fail'
  }));
  return finish(spec, points, { criterion: `|error| ≤ ${spec.limitE}e` });
}

// Two indications of the same quantity taken at different moments; their
// difference is limited. Used for zero return (3.9.4.2).
function evalDeviation(spec, instrument, observations) {
  const limit = spec.limitE * instrument.e;
  const points = observations.map((o) => {
    const deviation = (o.indicationAfter ?? 0) - o.indication;
    return {
      label: o.label,
      load: o.load,
      indication: o.indication,
      indicationAfter: o.indicationAfter,
      deviation: round(deviation),
      deviationInE: round(deviation / instrument.e, 3),
      mpe: round(limit),
      remark: o.remark ?? null,
      verdict: Math.abs(deviation) <= limit + EPS ? 'pass' : 'fail'
    };
  });
  return finish(spec, points, { criterion: `|after − before| ≤ ${spec.limitE}e` });
}

function evalDiscrimination(spec, instrument, observations) {
  // 3.8.2.2 keys both the added load and the required change to the actual
  // scale interval d, not to the verification scale interval e.
  const added = spec.addedWeightD * instrument.d;
  const required = spec.minChangeD * instrument.d;
  const points = observations.map((o) => {
    const change = o.indicationAfter - o.indication;
    return {
      label: o.label,
      load: o.load,
      indication: o.indication,
      indicationAfter: o.indicationAfter,
      addedLoad: round(added),
      change: round(change),
      changeInE: round(change / instrument.e, 3),
      mpe: round(required),
      remark: o.remark ?? null,
      verdict: change >= required - EPS ? 'pass' : 'fail'
    };
  });
  return finish(spec, points, {
    criterion: `adding ${spec.addedWeightD}d must move the indication by ≥ ${spec.minChangeD}d`
  });
}

function evalChecklist(spec, checks) {
  const byKey = new Map(checks.map((c) => [c.itemKey, c]));
  const points = spec.items.map((item) => {
    const c = byKey.get(item.key);
    const result = c ? c.result : null;
    let verdict;
    if (result === 'yes') verdict = 'pass';
    else if (result === 'no') verdict = 'fail';
    else if (result === 'na') verdict = item.level === 'compulsory' ? 'fail' : 'not-applicable';
    else verdict = 'incomplete';
    return { key: item.key, label: item.label, clause: item.clause, level: item.level,
             result, remark: c ? c.remark : null, verdict };
  });
  const answered = points.filter((p) => p.verdict !== 'incomplete');
  let verdict;
  if (answered.length === 0) verdict = 'not-performed';
  else if (points.some((p) => p.verdict === 'fail')) verdict = 'fail';
  else if (points.some((p) => p.verdict === 'incomplete' && p.level === 'compulsory')) verdict = 'incomplete';
  else verdict = 'pass';
  return { label: spec.label, description: spec.description, kind: spec.kind, points, verdict,
           criterion: 'every compulsory item present; every applicable item present',
           answered: answered.length, total: points.length };
}

function evalSpread(spec, instrument, purpose, points) {
  // Repeatability may be run as several series (e.g. 50 % and 100 % of Max);
  // each series is judged on its own spread.
  const series = new Map();
  for (const p of points) {
    const key = p.load;
    if (!series.has(key)) series.set(key, []);
    series.get(key).push(p);
  }
  const runsRequired = requiredRuns(spec, instrument, purpose);
  const summaries = [...series.entries()].map(([load, pts]) => {
    const values = pts.map((p) => p.corrected);
    const spread = Math.max(...values) - Math.min(...values);
    const limit = pts[0].mpe;
    return {
      load, runs: pts.length, runsRequired,
      spread: round(spread), spreadInE: round(spread / instrument.e, 3),
      spreadLimit: round(limit),
      spreadVerdict: spread <= limit + EPS ? 'pass' : 'fail',
      complete: pts.length >= runsRequired
    };
  });
  const result = finish(spec, points, {
    criterion: 'difference between weighings ≤ MPE at the test load',
    series: summaries,
    runsRequired,
    purpose: purpose || 'type-approval'
  });
  // Backwards-compatible single-series fields.
  if (summaries.length === 1) {
    Object.assign(result, {
      spread: summaries[0].spread, spreadInE: summaries[0].spreadInE,
      spreadLimit: summaries[0].spreadLimit, spreadVerdict: summaries[0].spreadVerdict, runs: summaries[0].runs
    });
  }
  if (summaries.some((s) => s.spreadVerdict === 'fail')) result.verdict = 'fail';
  const short = summaries.filter((s) => !s.complete);
  if (result.verdict !== 'fail' && short.length) {
    result.verdict = 'incomplete';
    result.note = `${runsRequired} weighings required per series for ${purpose || 'type-approval'} of a class ${instrument.accuracyClass} instrument; ${short.map((s) => `${s.runs} recorded at ${s.load}`).join(', ')}`;
  }
  return result;
}

// Warm-up (A.5.2): the same load read at fixed times after switch-on, each
// corrected for the zero error at that time.
function evalTimed(spec, instrument, points) {
  const times = spec.timesMin || [];
  const present = new Set(points.map((p) => nearestTime(p.timeMin, times)));
  const missing = times.filter((t) => !present.has(t));
  const result = finish(spec, points, {
    criterion: `|Ec| ≤ MPE at ${times.join(', ')} min after switch-on`,
    timesMin: times, missingTimes: missing
  });
  if (result.verdict === 'pass' && missing.length) {
    result.verdict = 'incomplete';
    result.note = `readings still required at ${missing.join(', ')} min`;
  }
  return result;
}

function nearestTime(t, times) {
  if (t === null || t === undefined) return null;
  let best = null;
  for (const x of times) if (best === null || Math.abs(x - t) < Math.abs(best - t)) best = x;
  return best !== null && Math.abs(best - t) <= 1 ? best : t;
}

// Influence-factor tests (temperature, voltage, damp heat): ordinary weighing
// points, grouped by the condition they were taken under.
function evalConditioned(spec, instrument, points) {
  const conditions = [...new Set(points.map((p) => String(p.condition ?? '')))].filter(Boolean);
  const result = finish(spec, points, {
    criterion: `|Ec| ≤ MPE under every ${spec.conditionLabel.toLowerCase()}`,
    conditions,
    plan: { steps: spec.plan || [], minConditions: spec.minConditions || 0,
            minLoadsPerCondition: spec.minLoadsPerCondition || 0 }
  });
  if (result.verdict === 'pass') {
    if (spec.minConditions && conditions.length < spec.minConditions) {
      result.verdict = 'incomplete';
      result.note = `${spec.minConditions} conditions required (${(spec.plan || []).join(' → ')}); ${conditions.length} recorded`;
    } else if (spec.minLoadsPerCondition) {
      const thin = conditions.filter((c) => points.filter((p) => String(p.condition) === c).length < spec.minLoadsPerCondition);
      if (thin.length) {
        result.verdict = 'incomplete';
        result.note = `at least ${spec.minLoadsPerCondition} loads required per condition; short at ${thin.join(', ')}`;
      }
    }
  }
  return result;
}

// 3.9.1.1: at no load the tilted indication may differ from the level one by
// at most two e (class II excepted); loaded, the zero-corrected error in the
// tilted position must be within the mpe.
function evalTilt(spec, instrument, points) {
  const refLabel = spec.conditions[0];
  const reference = points.filter((p) => p.condition === refLabel);
  const tilted = points.filter((p) => p.condition && p.condition !== refLabel);
  const refZero = reference.find((p) => p.load === 0);
  const noLoadLimit = spec.noLoadLimitE * instrument.e;
  const exempt = (spec.noLoadExemptClasses || []).includes(instrument.accuracyClass);

  const out = points.map((p) => {
    if (p.load === 0) {
      if (p.condition === refLabel) return { ...p, check: 'reference zero', verdict: 'pass', mpe: null, error: p.corrected };
      if (exempt) return { ...p, check: 'no-load shift', verdict: 'not-applicable', mpe: null, shift: null };
      if (!refZero) return { ...p, check: 'no-load shift', verdict: 'incomplete', mpe: round(noLoadLimit), shift: null };
      const shift = p.corrected - refZero.corrected;
      return { ...p, check: 'no-load shift', shift: round(shift), shiftInE: round(shift / instrument.e, 3),
               mpe: round(noLoadLimit), verdict: Math.abs(shift) <= noLoadLimit + EPS ? 'pass' : 'fail' };
    }
    return { ...p, check: 'loaded' };
  });

  const judged = out.filter((p) => p.verdict !== 'not-applicable');
  let verdict = judged.length === 0 ? 'incomplete'
    : judged.some((p) => p.verdict === 'fail') ? 'fail'
    : judged.some((p) => p.verdict === 'incomplete') ? 'incomplete' : 'pass';
  let note;
  if (verdict === 'pass' && tilted.length === 0) { verdict = 'incomplete'; note = 'no observations in a tilted position yet'; }
  if (verdict === 'pass' && !exempt && !refZero) { verdict = 'incomplete'; note = 'record the no-load indication in the reference (level) position'; }
  return { label: spec.label, description: spec.description, kind: spec.kind, points: out, verdict, note,
           criterion: `no-load shift ≤ ${spec.noLoadLimitE}e; loaded |Ec| ≤ MPE`, conditions: spec.conditions,
           limitingTilt: instrument.limitingTilt || spec.defaultLimitingTilt };
}

// 5.3.3 / B.4: errors near Max over the whole evaluation period must each be
// within the mpe and must not drift apart by more than max(0.5e, 0.5·mpe).
function evalSpan(spec, instrument, points) {
  const result = finish(spec, points, { criterion: `|Ec| ≤ MPE; max(Ec) − min(Ec) ≤ ${spec.variationRule}` });
  if (points.length) {
    const errors = points.map((p) => p.error);
    const variation = Math.max(...errors) - Math.min(...errors);
    const limit = Math.max(0.5 * instrument.e, 0.5 * points[0].mpe);
    Object.assign(result, {
      variation: round(variation), variationInE: round(variation / instrument.e, 3),
      variationLimit: round(limit),
      variationVerdict: variation <= limit + EPS ? 'pass' : 'fail',
      measurements: points.length, measurementsRequired: spec.minMeasurements
    });
    if (result.variationVerdict === 'fail') result.verdict = 'fail';
    if (result.verdict === 'pass' && points.length < spec.minMeasurements) {
      result.verdict = 'incomplete';
      result.note = `${spec.minMeasurements} measurements required over the evaluation period; ${points.length} recorded`;
    }
  }
  return result;
}

// 3.9.2.3: between consecutive test temperatures the zero indication may move
// by at most one e per 5 °C (per 1 °C for class I).
function evalZeroDrift(spec, instrument, observations) {
  const per = spec.perDegrees[instrument.accuracyClass] ?? spec.perDegrees.default;
  const limitPerStep = spec.limitE * instrument.e;
  const readings = observations
    .map((o) => ({ label: o.label, temperature: Number(o.condition), indication: o.indication,
                   zero: o.addedLoad === null || o.addedLoad === undefined
                     ? o.indication : correctedIndication({ indication: o.indication, e: instrument.e, addedLoad: o.addedLoad }),
                   remark: o.remark ?? null }))
    .filter((r) => Number.isFinite(r.temperature));
  const points = [];
  for (let i = 1; i < readings.length; i++) {
    const a = readings[i - 1], b = readings[i];
    const dT = b.temperature - a.temperature;
    const dZ = b.zero - a.zero;
    const perStep = Math.abs(dT) < EPS ? null : Math.abs(dZ) / Math.abs(dT) * per;
    points.push({
      label: `${a.label} → ${b.label}`,
      from: a.temperature, to: b.temperature, deltaT: round(dT),
      zeroFrom: round(a.zero), zeroTo: round(b.zero), deltaZero: round(dZ),
      perStep: perStep === null ? null : round(perStep),
      perStepInE: perStep === null ? null : round(perStep / instrument.e, 3),
      mpe: round(limitPerStep),
      verdict: perStep === null ? 'not-applicable' : perStep <= limitPerStep + EPS ? 'pass' : 'fail'
    });
  }
  const judged = points.filter((p) => p.verdict !== 'not-applicable');
  const verdict = readings.length === 0 ? 'incomplete'
    : judged.length === 0 ? 'incomplete'
    : judged.some((p) => p.verdict === 'fail') ? 'fail' : 'pass';
  return { label: spec.label, description: spec.description, kind: spec.kind, points, readings, verdict,
           criterion: `|Δzero| ≤ ${spec.limitE}e per ${per} °C between consecutive temperatures`, perDegrees: per,
           note: readings.length < 2 ? 'at least two temperatures are needed' : undefined };
}

// 3.9.4.1: drift of a load close to Max over 30 minutes ≤ 0.5e, and between
// minute 15 and minute 30 ≤ 0.2e; otherwise the drift over four hours must
// stay within the mpe for the load.
function evalCreep(ruleset, spec, instrument, context, observations) {
  const readings = observations
    .filter((o) => o.timeMin !== null && o.timeMin !== undefined)
    .sort((a, b) => a.timeMin - b.timeMin);
  if (readings.length === 0) {
    return { label: spec.label, description: spec.description, kind: spec.kind, points: [], verdict: 'incomplete',
             note: 'record the indication at 0, 15 and 30 minutes after loading' };
  }
  const first = readings[0];
  const limit30 = spec.within30MinE * instrument.e;
  const limit1530 = spec.between15and30E * instrument.e;
  const mpeAtLoad = mpe(ruleset, instrument, first.load, context).limit;
  const at = (t) => readings.find((r) => Math.abs(r.timeMin - t) <= 1);

  const points = readings.map((r) => {
    const drift = r.indication - first.indication;
    const within30 = r.timeMin <= 30 + EPS;
    const limit = within30 ? limit30 : mpeAtLoad;
    return {
      label: r.label, timeMin: r.timeMin, load: r.load, indication: r.indication,
      drift: round(drift), driftInE: round(drift / instrument.e, 3),
      mpe: round(limit), window: within30 ? 'first 30 min' : 'four-hour criterion',
      remark: r.remark ?? null,
      verdict: Math.abs(drift) <= limit + EPS ? 'pass' : 'fail'
    };
  });

  const r15 = at(15), r30 = at(30);
  const short = points.filter((p) => p.timeMin <= 30 + EPS);
  const shortOk = short.every((p) => p.verdict === 'pass');
  const midOk = r15 && r30 ? Math.abs(r30.indication - r15.indication) <= limit1530 + EPS : null;
  const longOk = points.every((p) => Math.abs(p.drift) <= mpeAtLoad + EPS);

  let verdict, note;
  if (!r15 || !r30) {
    verdict = short.some((p) => p.verdict === 'fail') && !longOk ? 'fail' : 'incomplete';
    note = 'readings at 15 and 30 minutes are required';
  } else if (shortOk && midOk) {
    verdict = 'pass';
    note = 'met within 30 minutes; the four-hour criterion was not needed';
  } else if (longOk && readings[readings.length - 1].timeMin >= spec.fallbackHours * 60 - 1) {
    verdict = 'pass';
    note = `30-minute criteria not met; drift over ${spec.fallbackHours} h within the mpe of ${round(mpeAtLoad)} at the load applied`;
  } else if (longOk) {
    verdict = 'incomplete';
    note = `30-minute criteria not met; continue observing for ${spec.fallbackHours} hours to apply the fallback criterion`;
  } else {
    verdict = 'fail';
    note = 'drift exceeds both the 30-minute limits and the mpe at the load applied';
  }

  return { label: spec.label, description: spec.description, kind: spec.kind, points, verdict, note,
           criterion: `|I(t) − I(0)| ≤ ${spec.within30MinE}e for t ≤ 30 min; |I(30) − I(15)| ≤ ${spec.between15and30E}e`,
           between15and30: r15 && r30 ? round(r30.indication - r15.indication) : null,
           between15and30Limit: round(limit1530), mpeAtLoad: round(mpeAtLoad) };
}

// A.4.10: for type approval each series is 10 weighings where Max is under
// 1000 kg and at least 3 otherwise; for verification a single series suffices,
// of 6 weighings on classes I and II and 3 on classes III and IIII.
function requiredRuns(spec, instrument, purpose) {
  const rules = spec.runRules || {};
  if (purpose === 'verification') {
    return rules.verification?.byClass?.[instrument.accuracyClass] ?? 3;
  }
  const ta = rules['type-approval'] || {};
  const threshold = ta.whenMaxBelow;
  if (threshold) {
    const maxG = toGrams(instrument.max, instrument.units || 'g');
    const limitG = toGrams(threshold.value, threshold.unit);
    if (maxG < limitG - EPS) return threshold.runs;
  }
  return ta.default ?? 3;
}

// A.4.4.1: the weighing test must cover Min, Max and the loads at which the mpe
// steps, with at least 10 points for the initial intrinsic error.
function loadPlanCheck(ruleset, spec, instrument, purpose, points) {
  const plan = spec.loadPlan;
  const loads = points.map((p) => p.load);
  const near = (target) => loads.some((l) => Math.abs(l - target) <= Math.max(instrument.e, target * 0.05) + EPS);
  const boundaries = bandBoundaries(ruleset, instrument);
  const minPoints = plan.minPoints[purpose] ?? plan.minPoints['type-approval'];
  const missing = [];
  if (toGrams(instrument.min, instrument.units || 'g') >= 0.1 && !near(instrument.min)) missing.push(`Min (${instrument.min})`);
  if (!near(instrument.max)) missing.push(`Max (${instrument.max})`);
  for (const b of boundaries) if (!near(b)) missing.push(`band change at ${b}`);
  const directions = new Set(points.map((p) => p.direction));
  const notes = [];
  if (loads.length < minPoints) notes.push(`${minPoints} test loads required, ${loads.length} recorded`);
  if (plan.bothDirections && !directions.has('decreasing') && loads.length) notes.push('no decreasing-load readings recorded yet');
  return { clause: plan.clause, minPoints, recorded: loads.length, boundaries, missing, notes,
           satisfied: missing.length === 0 && notes.length === 0 };
}

function finish(spec, points, extra) {
  const judged = points.filter((p) => p.verdict !== 'not-applicable');
  const verdict = judged.length === 0
    ? 'incomplete'
    : judged.some((p) => p.verdict === 'fail') ? 'fail'
    : judged.every((p) => p.verdict === 'pass') ? 'pass' : 'incomplete';
  return { label: spec.label, description: spec.description, kind: spec.kind, points, verdict, ...extra };
}

/* ------------------------------------------------------------------------ */
/* Whole session                                                              */
/* ------------------------------------------------------------------------ */

function evaluateSession({ ruleset, instrument, context, purpose, zeroError = 0, observations, checks = [] }) {
  const grouped = new Map();
  for (const o of observations) {
    if (!grouped.has(o.testKey)) grouped.set(o.testKey, []);
    grouped.get(o.testKey).push(o);
  }
  const checksByTest = new Map();
  for (const c of checks) {
    if (!checksByTest.has(c.testKey)) checksByTest.set(c.testKey, []);
    checksByTest.get(c.testKey).push(c);
  }

  const results = {};
  for (const testKey of Object.keys(ruleset.tests)) {
    const spec = ruleset.tests[testKey];
    const rows = grouped.get(testKey) ?? [];
    const itemChecks = checksByTest.get(testKey) ?? [];
    const na = applicability(spec, instrument);
    if (!na.applicable) {
      results[testKey] = { label: spec.label, description: spec.description, kind: spec.kind, points: [],
                           verdict: 'not-applicable', note: na.reason };
      continue;
    }
    if (rows.length === 0 && itemChecks.length === 0) {
      results[testKey] = { label: spec.label, description: spec.description, kind: spec.kind, points: [],
                           verdict: 'not-performed' };
      continue;
    }
    try {
      results[testKey] = evaluateTest({ ruleset, instrument, context, purpose, testKey,
                                        observations: rows, checks: itemChecks, sessionZeroError: zeroError });
    } catch (err) {
      results[testKey] = { label: spec.label, kind: spec.kind, points: [], verdict: 'error', note: err.message };
    }
  }

  const performed = Object.values(results).filter(
    (r) => r.verdict !== 'not-performed' && r.verdict !== 'not-applicable');
  let overall = 'incomplete';
  if (performed.length > 0) {
    if (performed.some((r) => r.verdict === 'fail' || r.verdict === 'error')) overall = 'fail';
    else if (performed.every((r) => r.verdict === 'pass')) overall = 'pass';
  }

  const completeness = completenessFor(ruleset, results, purpose || 'type-approval');
  const classification = classCheck(ruleset, instrument);
  const certificateEligible = overall === 'pass' && completeness.missing.length === 0
    && completeness.incomplete.length === 0 && classification.findings.length === 0;

  return {
    classification, results, overall, completeness, certificateEligible,
    supply: supplyLimits(ruleset, instrument),
    counts: {
      pass: performed.filter((r) => r.verdict === 'pass').length,
      fail: performed.filter((r) => r.verdict === 'fail').length,
      incomplete: performed.filter((r) => r.verdict === 'incomplete').length,
      notPerformed: Object.values(results).filter((r) => r.verdict === 'not-performed').length,
      notApplicable: Object.values(results).filter((r) => r.verdict === 'not-applicable').length
    }
  };
}

// Which tests the purpose calls for that have not yet been carried out, so the
// engineer can see what stands between the report and a certificate.
function completenessFor(ruleset, results, purpose) {
  const required = Object.entries(ruleset.tests)
    .filter(([, spec]) => (spec.requiredFor || []).includes(purpose))
    .map(([key]) => key);
  const missing = required.filter((k) => results[k]?.verdict === 'not-performed');
  const incomplete = required.filter((k) => results[k]?.verdict === 'incomplete');
  return { purpose, required, missing, incomplete,
           done: required.filter((k) => ['pass', 'fail', 'not-applicable'].includes(results[k]?.verdict)) };
}

/* ------------------------------------------------------------------------ */
/* Input validation                                                           */
/* ------------------------------------------------------------------------ */

// Hard errors reject the observation; warnings are stored alongside it so the
// report shows the engineer noticed. Every rule here is about metrological
// plausibility, not form filling.
function validateObservation({ ruleset, instrument, spec, obs, existing = [], purpose }) {
  const errors = [];
  const warnings = [];
  const u = instrument.units || 'g';
  const isMultiple = (v, step) => {
    if (!(step > 0)) return true;
    const r = Math.abs(v / step - Math.round(v / step));
    return r < 1e-6;
  };
  const maxLoad = instrument.max + (Number(instrument.tareMaxAdditive) || 0);

  if (!Number.isFinite(obs.load)) errors.push('load must be a number');
  else {
    if (obs.load < 0) errors.push('load cannot be negative');
    if (obs.load > maxLoad + EPS) errors.push(`load ${obs.load} ${u} exceeds Max${instrument.tareMaxAdditive ? ' + T' : ''} = ${round(maxLoad)} ${u}`);
    if (obs.load > 0 && obs.load < instrument.min - EPS && !['zero', 'tilt', 'temperatureZero'].includes(spec.key || ''))
      warnings.push(`load ${obs.load} ${u} is below Min = ${instrument.min} ${u}; the mpe does not apply below Min`);
  }

  if (!Number.isFinite(obs.indication)) errors.push('indication must be a number');
  else {
    if (!isMultiple(obs.indication, instrument.d)) warnings.push(`indication ${obs.indication} is not a multiple of d = ${instrument.d}`);
    if (Number.isFinite(obs.load) && Math.abs(obs.indication - obs.load) > Math.max(10 * instrument.e, 0.05 * instrument.max))
      warnings.push(`indication differs from the load by ${round(obs.indication - obs.load)} ${u}; check for a transcription error`);
  }

  if (obs.addedLoad !== null && obs.addedLoad !== undefined) {
    if (!spec.changeover && spec.kind !== 'zero-drift') warnings.push('additional load recorded for a test that does not use the changeover method');
    if (obs.addedLoad < 0) errors.push('additional load cannot be negative');
    if (obs.addedLoad > instrument.e + EPS) warnings.push(`additional load ${obs.addedLoad} ${u} exceeds one e; the display should change over within one interval`);
    if (obs.addedLoad === 0) warnings.push('additional load of 0 means the display changed over with no extra weight; the reading was on the point of changing');
  }

  if (obs.zeroError !== null && obs.zeroError !== undefined && Math.abs(obs.zeroError) > instrument.e + EPS)
    warnings.push(`zero error ${obs.zeroError} ${u} exceeds one e; the instrument should be re-zeroed before the measurement`);

  if (spec.netBasis) {
    if (obs.tare === null || obs.tare === undefined) errors.push('tare value is required for the tare test');
    else {
      if (obs.tare < 0) errors.push('tare cannot be negative');
      if (instrument.tareMaxAdditive && obs.tare > instrument.tareMaxAdditive + EPS) errors.push(`tare ${obs.tare} ${u} exceeds the maximum additive tare effect T = +${instrument.tareMaxAdditive} ${u}`);
      if (Number.isFinite(obs.load) && obs.load - obs.tare < -EPS) errors.push('tare cannot exceed the gross load');
    }
  }

  if (spec.kind === 'discrimination' || spec.kind === 'deviation') {
    if (obs.indicationAfter === null || obs.indicationAfter === undefined) errors.push('the second indication is required');
    else if (!isMultiple(obs.indicationAfter, instrument.d)) warnings.push(`second indication ${obs.indicationAfter} is not a multiple of d`);
    if (spec.kind === 'discrimination' && Number.isFinite(obs.indicationAfter) && obs.indicationAfter < obs.indication)
      warnings.push('indication fell after adding weight; check the readings');
  }

  if (spec.kind === 'timed' || spec.kind === 'creep') {
    if (obs.timeMin === null || obs.timeMin === undefined) errors.push('time in minutes is required');
    else if (obs.timeMin < 0) errors.push('time cannot be negative');
    if (spec.kind === 'creep' && existing.length && Number.isFinite(obs.load) && Math.abs(existing[0].load - obs.load) > EPS)
      errors.push(`creep readings must be of the same load; this series is at ${existing[0].load} ${u}`);
    if (spec.loadHint === 'close to Max' && Number.isFinite(obs.load) && obs.load < 0.8 * instrument.max)
      warnings.push(`load should be close to Max (${instrument.max} ${u})`);
  }

  if (spec.kind === 'conditioned' || spec.kind === 'zero-drift' || spec.kind === 'tilt') {
    if (obs.condition === null || obs.condition === undefined || obs.condition === '') errors.push(`${spec.conditionLabel || 'condition'} is required`);
  }
  if ((spec.kind === 'conditioned' || spec.kind === 'zero-drift') && spec.conditionUnit === '°C' && obs.condition !== '') {
    const t = Number(obs.condition);
    const range = temperatureRange(ruleset, instrument);
    if (!Number.isFinite(t)) errors.push('temperature must be a number in °C');
    else if (t < range.min - 0.5 || t > range.max + 0.5)
      warnings.push(`${t} °C is outside the instrument's temperature limits ${range.min} / ${range.max} °C; a failure here is not a non-conformity`);
  }
  if (spec.kind === 'conditioned' && spec.conditionUnit === 'V' && obs.condition !== '') {
    const v = Number(obs.condition);
    const lim = supplyLimits(ruleset, instrument);
    if (!Number.isFinite(v)) errors.push('supply voltage must be a number in volts');
    else if (lim && lim.lower !== null && lim.upper !== null && (v < lim.lower - 0.01 || v > lim.upper + 0.01))
      warnings.push(`${v} V lies outside the test range ${lim.lower}–${lim.upper} V for ${lim.label.toLowerCase()}`);
  }
  if (spec.kind === 'tilt' && obs.condition && !spec.conditions.includes(obs.condition))
    errors.push(`position must be one of: ${spec.conditions.join(', ')}`);

  if (spec.kind === 'per-load' && spec.positions && obs.label && !spec.positions.includes(obs.label)) {
    warnings.push(`position "${obs.label}" is not one of the defined segments`);
  }

  const dup = existing.find((o) => o.label === obs.label && String(o.condition ?? '') === String(obs.condition ?? '')
    && (o.timeMin ?? null) === (obs.timeMin ?? null) && o.direction === (obs.direction || 'increasing') && spec.kind !== 'spread');
  if (dup) warnings.push(`an observation labelled "${obs.label}" already exists for this test`);

  return { ok: errors.length === 0, errors, warnings };
}

function round(v, p = 6) {
  return Number(Number(v).toFixed(p));
}

module.exports = {
  loadRuleset,
  toGrams,
  requiredRuns,
  listRulesets,
  intervals,
  classCheck,
  temperatureRange,
  supplyLimits,
  bandFor,
  bandBoundaries,
  mpe,
  correctedIndication,
  evaluatePoint,
  applicability,
  evaluateTest,
  evaluateSession,
  completenessFor,
  validateObservation
};
