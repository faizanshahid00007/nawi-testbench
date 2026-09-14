'use strict';

// Editable (DOCX) rendering of a report. Same content as the HTML report,
// expressed as blocks for src/docx.js.

const { SUPPLY_LABELS, RANGE_LABELS } = require('./report');

const f = (v, u = '') => (v === null || v === undefined || v === '' ? '—'
  : `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 })}${u ? ' ' + u : ''}`);
const s = (v) => (v === null || v === undefined ? '—' : v > 0 ? `+${f(v)}` : f(v));
const dt = (x) => (x ? new Date(x).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const date = (x) => (x ? new Date(x).toLocaleDateString('en-IN', { dateStyle: 'long' }) : '—');
const V = (v) => ({ text: String(v || '').replace('-', ' ').toUpperCase(), bold: true,
                    color: v === 'pass' ? '0F6B3F' : v === 'fail' ? '9D1C1C' : v === 'incomplete' ? '8A5200' : '6B7A86' });

function pointsTable(test, u) {
  const R = 'right', C = 'center';
  switch (test.kind) {
    case 'discrimination':
      return { type: 'table',
        columns: [{ label: 'Point' }, { label: 'Load', align: R }, { label: 'Before', align: R }, { label: 'Added', align: R },
                  { label: 'After', align: R }, { label: 'Change', align: R }, { label: 'Required', align: R }, { label: 'Result', align: C }],
        rows: test.points.map((p) => [p.label, f(p.load, u), f(p.indication, u), f(p.addedLoad, u), f(p.indicationAfter, u), f(p.change, u), `≥ ${f(p.mpe, u)}`, V(p.verdict)]) };
    case 'limit':
      return { type: 'table',
        columns: [{ label: 'Point' }, { label: 'Nominal', align: R }, { label: 'Indication', align: R }, { label: 'Error', align: R }, { label: 'Limit', align: R }, { label: 'Result', align: C }],
        rows: test.points.map((p) => [p.label, f(p.load, u), f(p.indication, u), s(p.error), `± ${f(p.mpe, u)}`, V(p.verdict)]) };
    case 'deviation':
      return { type: 'table',
        columns: [{ label: 'Point' }, { label: 'Load rested', align: R }, { label: 'Zero before', align: R }, { label: 'Zero after', align: R }, { label: 'Deviation', align: R }, { label: 'Limit', align: R }, { label: 'Result', align: C }],
        rows: test.points.map((p) => [p.label, f(p.load, u), f(p.indication, u), f(p.indicationAfter, u), s(p.deviation), `± ${f(p.mpe, u)}`, V(p.verdict)]) };
    case 'zero-drift':
      return { type: 'table',
        columns: [{ label: 'Step' }, { label: 'From °C', align: R }, { label: 'To °C', align: R }, { label: 'Zero before', align: R }, { label: 'Zero after', align: R }, { label: `Per ${test.perDegrees} °C`, align: R }, { label: 'Limit', align: R }, { label: 'Result', align: C }],
        rows: test.points.map((p) => [p.label, f(p.from), f(p.to), f(p.zeroFrom, u), f(p.zeroTo, u), f(p.perStep, u), f(p.mpe, u), V(p.verdict)]) };
    case 'creep':
      return { type: 'table',
        columns: [{ label: 'Reading' }, { label: 'Time (min)', align: R }, { label: 'Load', align: R }, { label: 'Indication', align: R }, { label: 'Drift', align: R }, { label: 'Window' }, { label: 'Limit', align: R }, { label: 'Result', align: C }],
        rows: test.points.map((p) => [p.label, f(p.timeMin), f(p.load, u), f(p.indication, u), s(p.drift), p.window, `± ${f(p.mpe, u)}`, V(p.verdict)]) };
    case 'checklist':
      return { type: 'table',
        columns: [{ label: '#' }, { label: 'Requirement' }, { label: 'Clause' }, { label: 'Level' }, { label: 'Finding', align: C }, { label: 'Remark' }],
        widths: [500, 4000, 1000, 1100, 900, 1860],
        rows: test.points.map((p, i) => [String(i + 1), p.label, p.clause, p.level === 'compulsory' ? 'Compulsory' : 'If applicable',
          p.result === 'yes' ? 'Yes' : p.result === 'no' ? { text: 'No', bold: true, color: '9D1C1C' } : p.result === 'na' ? 'N/A' : '—', p.remark || '']) };
    default: {
      const anyTare = test.points.some((p) => p.tare !== null && p.tare !== undefined);
      const anyCo = test.points.some((p) => p.addedLoad !== null && p.addedLoad !== undefined);
      const extra = test.kind === 'timed' ? [{ label: 'Time (min)', align: R, value: (p) => f(p.timeMin) }]
        : test.kind === 'conditioned' ? [{ label: 'Condition', value: (p) => p.condition ?? '—' }]
        : test.kind === 'tilt' ? [{ label: 'Position', value: (p) => p.condition ?? '—' }] : [];
      const columns = [{ label: 'Point' }, ...extra.map((c) => ({ label: c.label, align: c.align })), { label: 'Dir.' },
        { label: 'Load L', align: R }, ...(anyTare ? [{ label: 'Tare T', align: R }] : []), { label: 'Indication I', align: R },
        ...(anyCo ? [{ label: 'ΔL', align: R }] : []), { label: 'E', align: R }, { label: 'E0', align: R }, { label: 'Ec', align: R }, { label: 'mpe', align: R }, { label: 'Result', align: C }];
      const rows = test.points.map((p) => [p.label, ...extra.map((c) => c.value(p)), p.direction === 'decreasing' ? '↑' : '↓',
        f(p.load, u), ...(anyTare ? [f(p.tare, u)] : []), f(p.indication, u), ...(anyCo ? [p.addedLoad === null || p.addedLoad === undefined ? '—' : f(p.addedLoad, u)] : []),
        s(p.rawError), s(p.zeroError), s(p.error), p.mpe === null ? '—' : `± ${f(p.mpe, u)}`, V(p.verdict)]);
      return { type: 'table', columns, rows };
    }
  }
}

function reportBlocks({ session, instrument, ruleset, evaluation, environment = [], attachments = [], generatedAt }) {
  const u = instrument.units;
  const c = evaluation.classification;
  const groups = ruleset.groups || [{ id: 'all', label: 'Tests', tests: Object.keys(ruleset.tests) }];
  const overallText = evaluation.overall === 'pass' ? 'Conforms to the requirements evaluated'
    : evaluation.overall === 'fail' ? 'Does not conform to the requirements evaluated' : 'Evaluation incomplete';
  const blocks = [];
  const push = (...b) => blocks.push(...b);

  push({ type: 'para', text: `${session.purpose === 'verification' ? 'VERIFICATION' : 'TYPE EVALUATION'} TEST REPORT · NON-AUTOMATIC WEIGHING INSTRUMENT · OIML R 76`, style: 'small' });
  push({ type: 'heading', level: 1, text: `${instrument.manufacturer} ${instrument.model}` });
  push({ type: 'para', text: `Report ${session.reference}${session.certificateNo ? ` · Certificate ${session.certificateNo}` : ''} · ${session.laboratory}`, style: 'note' });
  push({ type: 'para', text: `${evaluation.overall.toUpperCase()} — ${overallText}`, bold: true });

  push({ type: 'heading', level: 2, text: '1  General information concerning the type' });
  push({ type: 'kv', rows: [
    ['Applicant', `${instrument.applicant || instrument.manufacturer}${instrument.applicantAddress ? `, ${instrument.applicantAddress}` : ''}`],
    ['Manufacturer', `${instrument.manufacturer}${instrument.manufacturerAddress ? `, ${instrument.manufacturerAddress}` : ''}`],
    ['Model / type designation', instrument.model],
    ['Serial number of EUT', instrument.serial],
    ['Application reference', session.applicationRef || '—'],
    ['Instrument category', instrument.instrumentType || '—'],
    ['Indication', `${instrument.indicatingType || 'digital'}, ${Number(instrument.electronic ?? 1) ? 'electronic' : 'non-electronic'}`],
    ['Range type', RANGE_LABELS[instrument.rangeType] || instrument.rangeType || 'Single range'],
    ['Software identification', instrument.softwareVersion || '—'],
    ['Load cell(s)', instrument.loadCell || '—'],
    ['Interfaces', instrument.interfaces || '—'],
    ['Accuracy class', `${instrument.accuracyClass} — ${c.designation}`],
    ['Max / Min', `${f(instrument.max, u)} / ${f(instrument.min, u)}`],
    ['e / d', `${f(instrument.e, u)} / ${f(instrument.d, u)}`],
    ['n = Max / e', `${f(c.n)}${c.withinRange ? '' : ' (outside permitted range)'}`],
    ['Rounding elimination', c.changeoverRequired ? 'required (d > 0.2 e)' : 'not required'],
    ['Tare, additive / subtractive', `${instrument.tareMaxAdditive ? `T = +${f(instrument.tareMaxAdditive, u)}` : '—'} / ${instrument.tareMaxSubtractive ? `T = −${f(instrument.tareMaxSubtractive, u)}` : '—'}`],
    ['Temperature limits', `${f(c.temperature.min, '°C')} / ${f(c.temperature.max, '°C')} (${c.temperature.special ? 'marked, 3.9.2.2' : 'default, 3.9.2.1'})`],
    ['Power supply', `${SUPPLY_LABELS[instrument.powerSupply] || instrument.powerSupply || '—'}${instrument.nominalVoltage ? `, ${f(instrument.nominalVoltage, 'V')}` : ''}${instrument.frequency ? ` ${f(instrument.frequency, 'Hz')}` : ''}`],
    ...(evaluation.supply && evaluation.supply.lower !== null && evaluation.supply.upper !== null
      ? [['Voltage test limits (3.9.3)', `${f(evaluation.supply.lower, 'V')} – ${f(evaluation.supply.upper, 'V')}`]] : [])
  ] });
  if (c.findings.length) push({ type: 'para', text: `Classification findings: ${c.findings.join('; ')}`, style: 'note' });

  push({ type: 'heading', level: 2, text: '2  Evaluation particulars and laboratory conditions' });
  push({ type: 'kv', rows: [
    ['Laboratory', session.laboratory], ['Test engineer', session.technician],
    ['Purpose', session.purpose === 'verification' ? 'Verification' : 'Type approval'],
    ['MPE context', session.context === 'initial' ? 'Initial verification' : `In service (× ${ruleset.inServiceMultiplier})`],
    ['Zero error E0 (session)', `${s(session.zeroError)} ${u}`],
    ['Test date', session.testDate ? date(session.testDate) : date(session.createdAt)],
    ['Report opened / closed', `${date(session.createdAt)} / ${session.closedAt ? date(session.closedAt) : '—'}`],
    ['Rule set applied', ruleset.label]
  ] });
  if (environment.length) {
    push({ type: 'table',
      columns: [{ label: 'Stage' }, { label: 'T (°C)', align: 'right' }, { label: 'RH (%)', align: 'right' }, { label: 'p (hPa)', align: 'right' },
                { label: 'U (V)', align: 'right' }, { label: 'f (Hz)', align: 'right' }, { label: 'Time' }, { label: 'Note' }],
      rows: environment.map((r) => [r.stage, f(r.temperature), f(r.humidity), f(r.pressure), f(r.voltage), f(r.frequency), dt(r.recordedAt), r.note || '']) });
  } else {
    push({ type: 'kv', rows: [['Ambient temperature', f(session.temperature, '°C')], ['Relative humidity', f(session.humidity, '%')]] });
  }

  push({ type: 'heading', level: 2, text: '3  Summary of results' });
  push({ type: 'table',
    columns: [{ label: 'Group' }, { label: 'Test' }, { label: 'Clause' }, { label: 'Observations', align: 'center' }, { label: 'Result', align: 'center' }],
    widths: [2000, 3500, 1500, 1200, 1160],
    rows: groups.flatMap((g) => g.tests.filter((k) => evaluation.results[k]).map((k) => {
      const t = evaluation.results[k];
      return [g.label, t.label, ruleset.tests[k].clause || '', t.kind === 'checklist' ? `${t.answered ?? 0}/${t.total ?? 0}` : String(t.points.length), V(t.verdict)];
    })) });
  const outstanding = [...evaluation.completeness.missing.map((k) => `${ruleset.tests[k].label} not performed`),
                       ...evaluation.completeness.incomplete.map((k) => `${ruleset.tests[k].label} incomplete`)];
  if (outstanding.length) push({ type: 'para', text: `Outstanding: ${outstanding.join('; ')}.`, style: 'note' });

  push({ type: 'heading', level: 2, text: '4  Test results' });
  for (const g of groups) {
    push({ type: 'heading', level: 3, text: g.label });
    for (const k of g.tests) {
      const t = evaluation.results[k];
      if (!t) continue;
      const spec = ruleset.tests[k];
      push({ type: 'para', text: `${t.label}  ·  R 76-1 ${spec.clause || ''}  ·  ${t.verdict.toUpperCase()}`, bold: true });
      push({ type: 'para', text: `${t.description || ''}${t.criterion ? `  Criterion: ${t.criterion}` : ''}`, style: 'small' });
      if (t.verdict === 'not-performed') push({ type: 'para', text: 'No observations recorded for this test.', style: 'note' });
      else if (t.verdict === 'not-applicable') push({ type: 'para', text: `Not applicable: ${t.note || ''}.`, style: 'note' });
      else if (t.verdict === 'error') push({ type: 'para', text: t.note || '', style: 'note' });
      else {
        push(pointsTable(t, u));
        if (t.kind === 'spread') for (const se of t.series || []) push({ type: 'para', text: `Series at ${f(se.load, u)}: spread ${f(se.spread, u)} across ${se.runs} of ${se.runsRequired} weighings, limit ${f(se.spreadLimit, u)} — ${se.spreadVerdict.toUpperCase()}`, style: 'note' });
        if (t.kind === 'span' && t.variation !== undefined) push({ type: 'para', text: `Variation of error ${f(t.variation, u)} across ${t.measurements} measurements, limit ${f(t.variationLimit, u)} — ${t.variationVerdict.toUpperCase()}`, style: 'note' });
        if (t.kind === 'creep' && t.between15and30 !== null) push({ type: 'para', text: `Change between minute 15 and 30: ${s(t.between15and30)} ${u}, limit ${f(t.between15and30Limit, u)}`, style: 'note' });
        if (t.note) push({ type: 'para', text: t.note, style: 'note' });
        if (t.plan && t.plan.missing && (t.plan.missing.length || t.plan.notes.length))
          push({ type: 'para', text: `Load plan (${t.plan.clause}): ${[...t.plan.missing.map((m) => `missing ${m}`), ...t.plan.notes].join('; ')}.`, style: 'note' });
      }
    }
  }

  let n = 5;
  if (session.remarks) { push({ type: 'heading', level: 2, text: `${n++}  Remarks` }, { type: 'para', text: session.remarks }); }
  if (attachments.length) {
    push({ type: 'heading', level: 2, text: `${n++}  Photographs and supporting documents` });
    push({ type: 'table', columns: [{ label: 'Document' }, { label: 'File' }, { label: 'Type' }, { label: 'Size', align: 'right' }],
      rows: attachments.map((a) => [a.caption || a.filename, a.filename, a.mime, `${(a.size / 1024).toFixed(0)} kB`]) });
    push({ type: 'para', text: 'Images are embedded in the PDF edition of this report and stored with the record.', style: 'note' });
  }

  push({ type: 'heading', level: 2, text: `${n}  Signatures` });
  push({ type: 'kv', rows: [
    ['Tested by', `${session.technician}, ${date(session.closedAt || generatedAt)}`],
    ['Approved by', session.approvedBy ? `${session.approvedBy}, ${date(session.approvedAt)}` : '—'],
    ...(session.approvalNote ? [['Approval note', session.approvalNote]] : []),
    ...(session.signature ? [['Digital signature (SHA-256)', session.signature]] : [])
  ] });
  push({ type: 'para', style: 'small', text: `Errors determined by the changeover-point method where additional weights were applied (I + 0.5e − ΔL) and corrected by the zero error E0 (A.4.4.3). Maximum permissible errors from ${ruleset.label} for class ${instrument.accuracyClass}${session.context === 'in-service' ? ', doubled in service (3.5.2)' : ' at initial verification (3.5.1)'}. Generated ${dt(generatedAt)}.` });

  return { title: `${session.reference} — NAWI Test Report`, blocks,
           footer: `${session.reference} · ${instrument.manufacturer} ${instrument.model} · ${session.laboratory} · NAWI TestBench` };
}

module.exports = { reportBlocks };
