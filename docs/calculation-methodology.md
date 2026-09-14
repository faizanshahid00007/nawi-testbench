# Calculation methodology

Every number the software produces traces to a clause of OIML R 76-1:2006 (E). The
constants live in `rulesets/oiml-r76-2006.json`; the procedures live in `src/engine.js`.

## 1. Classification of the instrument (3.2, Table 3)

* `n = Max / e` must be a whole number and lie in the range Table 3 allows for the
  class and the value of `e`. Class III with `e ≥ 5 g` admits 500 ≤ n ≤ 10 000.
* `Min` must be at least the tabulated multiple of `e` (20 e for classes II and III,
  100 e for class I, 10 e for class IIII).
* `d ≤ e`. When `d > 0.2 e` the changeover-point method is required (3.5.3.2).
* Temperature limits default to −10 / +40 °C (3.9.2.1). Marked special limits must
  span at least 5 °C (class I), 15 °C (class II) or 30 °C (classes III, IIII) (3.9.2.2).

Any failure is reported as a *classification finding*; findings block the certificate.

## 2. Maximum permissible error (3.5.1, Table 6; 3.5.2)

The load is expressed in verification scale intervals, `m = L / e`, and looked up in
the band table for the class. Boundaries are inclusive at the top of each band.

| Class | ± 0.5 e | ± 1 e | ± 1.5 e |
|---|---|---|---|
| I | 0 ≤ m ≤ 50 000 | 50 000 < m ≤ 200 000 | 200 000 < m |
| II | 0 ≤ m ≤ 5 000 | 5 000 < m ≤ 20 000 | 20 000 < m ≤ 100 000 |
| III | 0 ≤ m ≤ 500 | 500 < m ≤ 2 000 | 2 000 < m ≤ 10 000 |
| IIII | 0 ≤ m ≤ 50 | 50 < m ≤ 200 | 200 < m ≤ 1 000 |

In service (3.5.2) every limit is doubled. The multiplier is data.

## 3. Error of indication (A.4.4.3)

A digital instrument shows whole multiples of `e`, so `I − L` cannot resolve an error
smaller than one interval, while the smallest tolerance is half an interval. The
changeover point recovers the pre-rounding indication: additional weights of about
0.1 e are added until the display steps from `I` to `I + e`; with `ΔL` the total added,

    P  = I + ½ e − ΔL          indication prior to rounding
    E  = P − L                 error
    Ec = E − E0                error corrected for the zero error determined before the measurement

`Ec` is compared with the MPE. When no additional load is recorded, `P = I`. `E0` is
taken per observation if recorded, otherwise from the session. The report shows
`I`, `ΔL`, `E`, `E0`, `Ec` and the MPE for every point, so a reviewer can redo the
arithmetic by hand.

## 4. Test criteria

| Test | Clause | Criterion implemented |
|---|---|---|
| Weighing performance | 3.5.1, A.4.4.1 | `|Ec| ≤ MPE(L)` for every load; load plan must include Min, Max, each band boundary, ≥ 10 loads for type approval (5 otherwise), both directions |
| Eccentricity | 3.6.2, A.4.7 | `|Ec| ≤ MPE(L)` at each segment; suggested load ⅓ (Max + T) |
| Repeatability | 3.6.1, A.4.10 | per series, `max(P) − min(P) ≤ MPE(L)`; 10 weighings per series when Max < 1 000 kg (type approval), else 3; verification: 6 for I/II, 3 for III/IIII |
| Discrimination | 3.8.2.2, A.4.8.2 | adding 1.4 d must change the indication by ≥ 1 d; applies when d ≥ 5 mg |
| Tare device | 3.5.3.3, 4.6.3 | net result judged against MPE of the *net* load |
| Zero-setting accuracy | 4.5.2 | `|I − 0| ≤ 0.25 e` |
| Tilting | 3.9.1.1, A.5.1 | no-load shift from the level position ≤ 2 e (class II exempt); loaded `|Ec| ≤ MPE` after re-zeroing tilted; classes II–IIII |
| Warm-up time | 5.3.5, A.5.2 | `|Ec| ≤ MPE` at 0, 5, 15, 30 min after switch-on, each corrected by the zero error at that time; electronic only |
| Static temperatures | 3.9.2, A.5.3.1 | `|Ec| ≤ MPE` at reference, high, low, (5 °C if low ≤ 0 °C), reference; at least 4 conditions |
| Temperature effect on no-load | 3.9.2.3, A.5.3.2 | between consecutive temperatures, change of zero ≤ 1 e per 5 °C (per 1 °C for class I) |
| Voltage variation | 3.9.3, A.5.4 | `|Ec| ≤ MPE` at lower limit, nominal, upper limit; limits derived from supply type: mains 0.85/1.10 U, external min-operating/1.20 U, battery min-operating/U, vehicle min-operating/16 V or 32 V |
| Damp heat | B.2 | `|Ec| ≤ MPE` at ≥ 5 loads under reference 50 % RH, high temperature 85 % RH, reference; not for class I or class II with e < 1 g |
| Creep | 3.9.4.1, A.4.11.1 | `|I(t) − I(0)| ≤ 0.5 e` for t ≤ 30 min and `|I(30) − I(15)| ≤ 0.2 e`; failing that, drift over 4 h ≤ MPE(L); classes II–IIII |
| Zero return | 3.9.4.2, A.4.11.2 | zero after 30 min at ≈Max minus zero before ≤ 0.5 e |
| Span stability | 5.3.3, B.4 | ≥ 8 measurements near Max; each `|Ec| ≤ MPE` and `max(Ec) − min(Ec) ≤ max(0.5 e, 0.5 |MPE|)`; electronic, not class I |
| Descriptive markings | 7.1 | checklist; any compulsory item absent → fail; if-applicable items may be N/A |
| Functional checks | 4.4.2, 4.5, 4.6, 5.3 | checklist by inspection |

## 5. Roll-up

* A test with no observations is *not performed*; one whose applicability rule
  excludes the instrument is *not applicable*; one lacking required points or
  conditions is *incomplete*.
* The overall verdict is *fail* if any performed test fails, *pass* if every performed
  test passes, otherwise *incomplete*.
* *Completeness* lists the tests the purpose requires (type approval or verification)
  that are not yet decided. *Certificate eligibility* = overall pass, completeness
  empty, no classification findings.

## 6. Validation of entered data

Hard errors (rejected): negative load, load above Max + T, tare above T or above the
gross load, missing second indication for discrimination or zero return, missing time
for warm-up or creep, a creep reading at a different load from the series, a tilt
position outside the defined set, a non-numeric temperature or voltage.

Warnings (stored with the observation and printed in the report): indication not a
multiple of `d`, additional load larger than one `e`, zero error larger than one `e`,
load below Min, a very large discrepancy between load and indication, a condition
outside the instrument's temperature or voltage limits, a duplicate label.

## 7. Worked example (seeded report NAWI/2026/0001)

Avery CS-30, class III, Max 30 kg, e = d = 5 g, n = 6 000, initial verification.
At 20 kg (4 000 e, band > 2 000 e) the MPE is 1.5 e = 7.5 g. The display reads
20 010 g with no changeover recorded: `E = Ec = +10 g > 7.5 g` → **fail**. The same
reading in service (MPE 15 g) would pass. At 2 kg (400 e, MPE 2.5 g) the display reads
2 000 g and 1.5 g of additional weight makes it step: `P = 2000 + 2.5 − 1.5 = 2001.0`,
`Ec = +1.0 g` → pass.
