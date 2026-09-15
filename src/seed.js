'use strict';

// Two worked examples: a class III counter scale that fails weighing at 20 kg
// (the demonstration on the overview page), and a class III platform scale
// carried through the whole type-approval battery, closed, approved and
// certified. Both are hand-checked against R 76-1:2006.

const store = require('./db');
const auth = require('./auth');
const engine = require('./engine');
const crypto = require('crypto');

auth.seedUsers();

const has = (serial) => store.instruments.all(serial).some((i) => i.serial === serial);
const engineer = 'F. Shahid';
const approver = 'Approving Officer';
const lab = 'Regional Reference Standards Laboratory, Delhi';

if (!has('AV-40218')) {
  const instrument = store.instruments.create({
    manufacturer: 'Avery India', manufacturerAddress: 'Ballabgarh, Haryana', applicant: 'Avery India Ltd.', applicantAddress: 'Ballabgarh, Haryana',
    model: 'CS-30', serial: 'AV-40218', instrumentType: 'Counter scale', indicatingType: 'digital', electronic: 1, rangeType: 'single',
    accuracyClass: 'III', max: 30000, min: 100, e: 5, d: 5, units: 'g', tareMaxAdditive: 15000,
    powerSupply: 'mains', nominalVoltage: 230, frequency: 50, softwareVersion: 'CS30-1.07', loadCell: '1 × single point 40 kg', interfaces: 'RS-232',
    limitingTilt: 'Level indicator with ring', createdBy: engineer
  });
  const session = store.sessions.create({
    instrumentId: instrument.id, rulesetId: 'oiml-r76-2006', context: 'initial', purpose: 'type-approval',
    laboratory: lab, technician: engineer, temperature: 24.5, humidity: 48, applicationRef: 'LM/TA/2026/118',
    testDate: '2026-09-02', createdBy: engineer
  });
  store.environment.add({ sessionId: session.id, stage: 'Start of test', temperature: 24.5, humidity: 48, pressure: 1008, voltage: 231, frequency: 50 });
  const obs = [
    ['weighing', 'Min', 100, null, 100, null, 1.5, 'increasing'],
    ['weighing', '2 kg', 2000, null, 2000, null, 1.5, 'increasing'],
    ['weighing', '2.5 kg (band change)', 2500, null, 2500, null, 2.0, 'increasing'],
    ['weighing', '5 kg', 5000, null, 5000, null, 1.0, 'increasing'],
    ['weighing', '10 kg (band change)', 10000, null, 10000, null, 2.0, 'increasing'],
    ['weighing', '15 kg', 15000, null, 15005, null, 3.0, 'increasing'],
    ['weighing', '20 kg', 20000, null, 20010, null, null, 'increasing'],
    ['weighing', '25 kg', 25000, null, 25005, null, 2.5, 'increasing'],
    ['weighing', '30 kg (Max)', 30000, null, 30000, null, 2.5, 'increasing'],
    ['weighing', '15 kg', 15000, null, 15005, null, 3.5, 'decreasing'],
    ['eccentricity', 'Segment 1', 15000, null, 15000, null, null],
    ['eccentricity', 'Segment 2', 15000, null, 15005, null, null],
    ['eccentricity', 'Segment 3', 15000, null, 15000, null, null],
    ['eccentricity', 'Segment 4', 15000, null, 15005, null, null],
    ['repeatability', 'Run 1', 15000, null, 15000, null, null],
    ['repeatability', 'Run 2', 15000, null, 15000, null, null],
    ['repeatability', 'Run 3', 15000, null, 15005, null, null],
    ['discrimination', 'At 10 kg', 10000, null, 10000, 10005, null],
    ['tare', 'Net 10 kg on 2 kg tare', 12000, 2000, 10005, null, null],
    ['zero', 'After zero set', 0, null, 1, null, null]
  ];
  for (const [testKey, label, load, tare, indication, indicationAfter, addedLoad, direction] of obs) {
    store.observations.add({ sessionId: session.id, testKey, label, load, tare, indication, indicationAfter, addedLoad, direction: direction || 'increasing', recordedBy: engineer });
  }
  for (const key of ['maker', 'class', 'max', 'min', 'e', 'serial', 'software', 'tarePlus', 'legible']) store.checks.set({ sessionId: session.id, testKey: 'markings', itemKey: key, result: 'yes' });
  for (const key of ['agent', 'd', 'tareMinus', 'lim', 'temp']) store.checks.set({ sessionId: session.id, testKey: 'markings', itemKey: key, result: 'na' });
  store.audit.log({ sessionId: session.id, actor: engineer, action: 'report.open', detail: `${session.reference} for Avery India CS-30` });
  console.log(`seeded Avery India CS-30 and report ${session.reference} (fails at 20 kg)`);
}

if (!has('ET-77120')) {
  const instrument = store.instruments.create({
    manufacturer: 'Essae-Teraoka', manufacturerAddress: 'Bengaluru, Karnataka', applicant: 'Essae-Teraoka Pvt. Ltd.', applicantAddress: 'Bengaluru, Karnataka',
    model: 'DS-852', serial: 'ET-77120', instrumentType: 'Platform scale', indicatingType: 'digital', electronic: 1, rangeType: 'single',
    accuracyClass: 'III', max: 15000, min: 100, e: 5, d: 5, units: 'g', tareMaxAdditive: 7000,
    powerSupply: 'mains', nominalVoltage: 230, frequency: 50, softwareVersion: 'v2.14', loadCell: '1 × single-point 20 kg', interfaces: 'RS-232 printer port',
    limitingTilt: 'Level indicator with ring marking', createdBy: engineer
  });
  const session = store.sessions.create({
    instrumentId: instrument.id, rulesetId: 'oiml-r76-2006', context: 'initial', purpose: 'type-approval',
    laboratory: lab, technician: engineer, temperature: 22.8, humidity: 51, applicationRef: 'LM/TA/2026/104',
    testDate: '2026-08-18', createdBy: engineer
  });
  store.environment.add({ sessionId: session.id, stage: 'Start of test', temperature: 22.8, humidity: 51, pressure: 1006, voltage: 229, frequency: 50 });
  store.environment.add({ sessionId: session.id, stage: 'During test', temperature: 23.1, humidity: 50, pressure: 1006, voltage: 230, frequency: 50 });
  store.environment.add({ sessionId: session.id, stage: 'End of test', temperature: 23.4, humidity: 49, pressure: 1005, voltage: 231, frequency: 50 });

  const o = (testKey, label, load, indication, extra = {}) =>
    store.observations.add({ sessionId: session.id, testKey, label, load, indication, recordedBy: engineer, ...extra });

  // Weighing: 10 loads up, 4 down, band changes at 2 500 g (500e) and 10 000 g (2000e).
  const up = [[100, 100, 1.5], [500, 500, 2.0], [1000, 1000, 2.5], [2500, 2500, 2.0], [5000, 5000, 3.0], [7500, 7500, 2.5], [10000, 10000, 3.5], [12000, 12000, 2.0], [14000, 14000, 2.5], [15000, 15000, 3.0]];
  for (const [load, ind, dl] of up) o('weighing', `${load / 1000} kg${load === 100 ? ' (Min)' : load === 15000 ? ' (Max)' : ''}`, load, ind, { addedLoad: dl, direction: 'increasing' });
  for (const [load, ind, dl] of [[10000, 10000, 3.0], [5000, 5000, 2.5], [2500, 2500, 2.0], [500, 500, 2.5]]) o('weighing', `${load / 1000} kg`, load, ind, { addedLoad: dl, direction: 'decreasing' });
  // Eccentricity at (Max + T)/3 ≈ 7.3 kg, rounded to 7 kg.
  for (const [seg, ind] of [['Segment 1', 7000], ['Segment 2', 7000], ['Segment 3', 7005], ['Segment 4', 7000]]) o('eccentricity', seg, 7000, ind, { addedLoad: 2.5 });
  // Repeatability: two series of 10 (Max < 1000 kg).
  for (let i = 1; i <= 10; i++) o('repeatability', `Run ${i}`, 7500, 7500, { addedLoad: 2.5 + (i % 3) * 0.5 });
  for (let i = 1; i <= 10; i++) o('repeatability', `Run ${i}`, 15000, 15000, { addedLoad: 3.0 - (i % 2) * 0.5 });
  o('discrimination', 'At 7.5 kg', 7500, 7500, { indicationAfter: 7505 });
  o('discrimination', 'At Max', 15000, 15000, { indicationAfter: 15005 });
  o('tare', 'Net 5 kg on 2 kg tare', 7000, 5000, { tare: 2000, addedLoad: 2.5 });
  o('tare', 'Net 8 kg on 7 kg tare', 15000, 8000, { tare: 7000, addedLoad: 2.0 });
  o('zero', 'After zero set', 0, 0);
  // Tilting: reference zero, then no load, 5 kg and Max lengthwise and transverse.
  o('tilt', 'No load', 0, 0, { condition: 'Reference (level)' });
  o('tilt', 'No load', 0, 5, { condition: 'Tilted lengthwise' });
  o('tilt', '5 kg', 5000, 5000, { condition: 'Tilted lengthwise', addedLoad: 2.0, zeroError: 0 });
  o('tilt', 'Max', 15000, 15000, { condition: 'Tilted lengthwise', addedLoad: 2.0, zeroError: 0 });
  o('tilt', 'No load', 0, 0, { condition: 'Tilted transverse' });
  o('tilt', '5 kg', 5000, 5000, { condition: 'Tilted transverse', addedLoad: 3.0, zeroError: 0 });
  o('tilt', 'Max', 15000, 15005, { condition: 'Tilted transverse', addedLoad: 4.0, zeroError: 0 });
  // Warm-up at 0, 5, 15, 30 min.
  for (const [t, dl, z] of [[0, 1.0, 0.5], [5, 1.5, 0.5], [15, 2.0, 0], [30, 2.5, 0]]) o('warmup', 'Near Max', 15000, 15000, { timeMin: t, addedLoad: dl, zeroError: z });
  // Static temperatures: 20, 40, -10, 5, 20 °C at five loads each.
  for (const [T, drift] of [[20, 0], [40, 1.0], [-10, -1.0], [5, -0.5], [20, 0]]) {
    for (const [load, dl] of [[100, 1.5], [2500, 2.0], [7500, 2.5], [12000, 2.0], [15000, 3.0]]) o('temperature', `${load / 1000} kg`, load, load, { condition: String(T), addedLoad: dl - drift, zeroError: 0 });
  }
  for (const [T, z, dl] of [[20, 0, 2.5], [40, 0, 1.0], [-10, 0, 4.0], [5, 0, 3.0], [20, 0, 2.5]]) o('temperatureZero', `At ${T} °C`, 0, z, { condition: String(T), addedLoad: dl });
  // Voltage: 195.5 V (0.85 U), 230 V, 253 V (1.10 U) at 10 e = 50 g and 10 kg.
  for (const V of [195.5, 230, 253]) {
    o('voltage', '10 e', 50, 50, { condition: String(V), addedLoad: 2.5, zeroError: 0 });
    o('voltage', '10 kg', 10000, 10000, { condition: String(V), addedLoad: 3.0, zeroError: 0 });
  }
  // Damp heat: five loads at each of three conditions.
  for (const cond of ['20 °C, 50 % RH', '40 °C, 85 % RH', '20 °C, 50 % RH (return)']) {
    for (const [load, dl] of [[100, 1.5], [2500, 2.0], [7500, 2.5], [12000, 2.0], [15000, 3.0]]) o('dampHeat', `${load / 1000} kg`, load, load, { condition: cond, addedLoad: dl, zeroError: 0 });
  }
  // Creep and zero return.
  for (const [t, ind] of [[0, 15000], [15, 15000], [30, 15000]]) o('creep', t === 0 ? 'On loading' : `t = ${t} min`, 15000, ind, { timeMin: t });
  o('zeroReturn', 'After 30 min at Max', 15000, 0, { indicationAfter: 0 });
  // Span stability: 8 measurements over 4 weeks.
  for (let i = 0; i < 8; i++) {
    const day = new Date(2026, 6, 20 + i * 4);
    o('spanStability', day.toISOString().slice(0, 10), 15000, 15000, { addedLoad: 2.5 + [0, 0.5, 0, 1.0, 0.5, 0, 0.5, 0][i], zeroError: 0 });
  }
  // Checklists.
  for (const key of ['maker', 'class', 'max', 'min', 'e', 'serial', 'software', 'tarePlus', 'legible']) store.checks.set({ sessionId: session.id, testKey: 'markings', itemKey: key, result: 'yes' });
  for (const key of ['agent', 'd', 'tareMinus', 'lim', 'temp']) store.checks.set({ sessionId: session.id, testKey: 'markings', itemKey: key, result: 'na' });
  for (const key of ['stable', 'zeroRange', 'initZero', 'zeroSignal', 'autoZero', 'tracking', 'net', 'tareRange', 'warmupNoInd', 'interface', 'level', 'switchOn']) store.checks.set({ sessionId: session.id, testKey: 'functional', itemKey: key, result: 'yes' });

  store.sessions.update(session.id, { remarks: 'Instrument as received, no adjustment before testing. Test weights class M1, traceable to NPL India. Damp heat performed in chamber KH-2.' });

  const ruleset = engine.loadRuleset('oiml-r76-2006');
  const evaluation = engine.evaluateSession({ ruleset, instrument, context: 'initial', purpose: 'type-approval', zeroError: 0,
    observations: store.observations.forSession(session.id), checks: store.checks.forSession(session.id) });
  store.audit.log({ sessionId: session.id, actor: engineer, action: 'report.open', detail: `${session.reference} for Essae-Teraoka DS-852` });
  store.sessions.close(session.id, evaluation.overall);
  store.audit.log({ sessionId: session.id, actor: engineer, action: 'report.close', detail: `outcome ${evaluation.overall}` });
  if (evaluation.certificateEligible) {
    const approvedAt = new Date().toISOString();
    const signature = crypto.createHash('sha256').update(JSON.stringify({
      reference: session.reference, instrument, observations: store.observations.forSession(session.id), checks: store.checks.forSession(session.id),
      verdicts: Object.fromEntries(Object.entries(evaluation.results).map(([k, t]) => [k, t.verdict])), overall: evaluation.overall, approvedBy: approver, approvedAt
    })).digest('hex');
    const certificateNo = store.sessions.nextCertificateNo();
    store.sessions.approve(session.id, { approvedBy: approver, approvalNote: 'Reviewed against R 76-1:2006; no deviations.', certificateNo, signature });
    store.audit.log({ sessionId: session.id, actor: approver, action: 'report.approve', detail: `certificate ${certificateNo} issued` });
    console.log(`seeded Essae-Teraoka DS-852, report ${session.reference} approved, certificate ${certificateNo}`);
  } else {
    console.log(`seeded Essae-Teraoka DS-852, report ${session.reference} closed as ${evaluation.overall}`);
    console.log(JSON.stringify({ missing: evaluation.completeness.missing, incomplete: evaluation.completeness.incomplete,
      failed: Object.entries(evaluation.results).filter(([, t]) => t.verdict === 'fail').map(([k, t]) => [k, t.note, t.points.filter((p) => p.verdict === 'fail').slice(0, 3)]) }, null, 1));
  }
}

if (!has('DS-560-0421')) {
  // Multi-interval retail scale: e1 = 2 g to 6 kg, e2 = 5 g to 15 kg (3.2.2).
  const instrument = store.instruments.create({
    manufacturer: 'Essae-Teraoka', manufacturerAddress: 'Bengaluru, Karnataka', applicant: 'Essae-Teraoka Pvt. Ltd.', applicantAddress: 'Bengaluru, Karnataka',
    model: 'DS-560 MI', serial: 'DS-560-0421', instrumentType: 'Retail scale (price computing)', indicatingType: 'digital', electronic: 1, rangeType: 'multi-interval',
    accuracyClass: 'III', max: 15000, min: 40, e: 2, d: 2, units: 'g', tareMaxAdditive: 5990,
    ranges: JSON.stringify([{ e: 2, max: 6000, d: 2 }, { e: 5, max: 15000, d: 5 }]),
    powerSupply: 'external', nominalVoltage: 12, minOperatingVoltage: 9.6, softwareVersion: 'R3.02', loadCell: '1 × single-point 20 kg', interfaces: 'RS-232, USB',
    limitingTilt: 'Level indicator with ring marking', createdBy: engineer
  });
  const session = store.sessions.create({
    instrumentId: instrument.id, rulesetId: 'oiml-r76-2006', context: 'initial', purpose: 'verification',
    laboratory: lab, technician: engineer, temperature: 23.6, humidity: 47, applicationRef: 'LM/V/2026/0912',
    testDate: '2026-09-11', createdBy: engineer
  });
  store.environment.add({ sessionId: session.id, stage: 'Start of test', temperature: 23.6, humidity: 47, pressure: 1007, voltage: 12.1 });
  const o = (testKey, label, load, indication, extra = {}) =>
    store.observations.add({ sessionId: session.id, testKey, label, load, indication, recordedBy: engineer, ...extra });
  // Range 1 (e = 2 g): 40 g Min, 1 kg and 4 kg band changes, 6 kg range change. Range 2 (e = 5 g): 10 kg band change, 15 kg Max.
  for (const [load, dl] of [[40, 0.6], [500, 0.8], [1000, 1.0], [2000, 0.6], [4000, 1.2], [6000, 0.8], [8000, 2.0], [10000, 2.5], [12000, 1.5], [15000, 3.0]])
    o('weighing', `${load >= 1000 ? load / 1000 + ' kg' : load + ' g'}${load === 40 ? ' (Min)' : load === 6000 ? ' (range change)' : load === 15000 ? ' (Max)' : ''}`, load, load, { addedLoad: dl, direction: 'increasing' });
  for (const [load, dl] of [[10000, 2.0], [4000, 1.0], [1000, 0.8]]) o('weighing', `${load / 1000} kg`, load, load, { addedLoad: dl, direction: 'decreasing' });
  o('discrimination', 'At 3 kg (e = 2 g)', 3000, 3000, { indicationAfter: 3002 });
  o('discrimination', 'At 10 kg (e = 5 g)', 10000, 10000, { indicationAfter: 10005 });
  o('zero', 'After zero set', 0, 0);
  store.audit.log({ sessionId: session.id, actor: engineer, action: 'report.open', detail: `${session.reference} for Essae-Teraoka DS-560 MI (multi-interval)` });
  console.log(`seeded Essae-Teraoka DS-560 MI (multi-interval) and report ${session.reference} (verification, in progress)`);
}
