"""Fill the SIH idea-presentation template for PS26035 by editing the slide XML directly.
Keeps every template element (title placeholders, pointer headings, footer bar, logos, team oval)
and only replaces the fillable text, adds prototype pictures and a flow chart, and drops the
instructions slide as the template itself permits."""
import re, shutil, zipfile, os, struct
from xml.sax.saxutils import escape as X

SRC = '/Users/farhanshahid/Downloads/SIH2024_IDEA_Presentation_Format.pptx'
OUT = 'SIH2026_IDEA_PS26035_NAWI_TestBench.pptx'
W = 'work'
shutil.rmtree(W, ignore_errors=True)
with zipfile.ZipFile(SRC) as z: z.extractall(W)
P = lambda *a: os.path.join(W, *a)

# ---------------------------------------------------------------- helpers
ARIAL = '<a:latin typeface="Arial" pitchFamily="34" charset="0"/><a:cs typeface="Arial" pitchFamily="34" charset="0"/>'
def run(text, sz=1400, b=False, color=None, u=False):
    fill = f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>' if color else ''
    return f'<a:r><a:rPr lang="en-US" sz="{sz}"{" b=\"1\"" if b else ""}{" u=\"sng\"" if u else ""} dirty="0">{fill}{ARIAL}</a:rPr><a:t>{X(text)}</a:t></a:r>'
def para(runs, bullet=True, lvl=0, sz=1400, spcBef=0, spcAft=200, algn=None, lnSpc=None):
    marL = 285750 + lvl * 285750
    bu = f'<a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="{"•" if lvl == 0 else "–"}"/>' if bullet else '<a:buNone/>'
    ind = f' marL="{marL}" indent="-285750"' if bullet else (f' marL="{marL - 285750}" indent="0"' if lvl else '')
    al = f' algn="{algn}"' if algn else ''
    ls = f'<a:lnSpc><a:spcPct val="{lnSpc}"/></a:lnSpc>' if lnSpc else ''
    return f'<a:p><a:pPr{ind}{al}>{ls}<a:spcBef><a:spcPts val="{spcBef}"/></a:spcBef><a:spcAft><a:spcPts val="{spcAft}"/></a:spcAft>{bu}</a:pPr>{runs}<a:endParaRPr lang="en-US" sz="{sz}" dirty="0"/></a:p>'
def heading(text, sz=1800):
    # the template's pointer style: bold, underlined, tx2, Wingdings check bullet
    return (f'<a:p><a:pPr marL="342900" indent="-342900"><a:spcBef><a:spcPts val="400"/></a:spcBef><a:spcAft><a:spcPts val="300"/></a:spcAft>'
            f'<a:buFont typeface="Wingdings" pitchFamily="2" charset="2"/><a:buChar char="v"/></a:pPr>'
            f'<a:r><a:rPr lang="en-US" sz="{sz}" b="1" u="sng" dirty="0"><a:solidFill><a:schemeClr val="tx2"/></a:solidFill>{ARIAL}</a:rPr><a:t>{X(text)}</a:t></a:r></a:p>')
def txbody(paras, autofit=False):
    fit = '<a:spAutoFit/>' if autofit else '<a:normAutofit/>'
    return f'<p:txBody><a:bodyPr wrap="square" rtlCol="0" lIns="45720" rIns="45720" tIns="27432" bIns="27432">{fit}</a:bodyPr><a:lstStyle/>{"".join(paras)}</p:txBody>'
def textbox(id_, name, x, y, cx, cy, paras, autofit=False):
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{id_}" name="{name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
            f'{txbody(paras, autofit)}</p:sp>')
def box(id_, name, x, y, cx, cy, lines, fill='0070C0', txt='FFFFFF', sz=1000, prst='roundRect', line=None):
    ln = f'<a:ln w="12700"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else '<a:ln><a:noFill/></a:ln>'
    paras = ''.join(f'<a:p><a:pPr algn="ctr"><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>'
                    f'<a:r><a:rPr lang="en-US" sz="{sz if i else sz + 100}" b="{1 if i == 0 else 0}" dirty="0"><a:solidFill><a:srgbClr val="{txt}"/></a:solidFill>{ARIAL}</a:rPr><a:t>{X(t)}</a:t></a:r></a:p>'
                    for i, t in enumerate(lines))
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{id_}" name="{name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="{prst}"><a:avLst/></a:prstGeom>'
            f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>{ln}</p:spPr>'
            f'<p:txBody><a:bodyPr wrap="square" lIns="36000" rIns="36000" tIns="18000" bIns="18000" anchor="ctr"><a:normAutofit/></a:bodyPr><a:lstStyle/>{paras}</p:txBody></p:sp>')
def arrow(id_, x, y, cx=180000, cy=160000, fill='7F7F7F'):
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{id_}" name="Arrow {id_}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rightArrow"><a:avLst/></a:prstGeom>'
            f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>')
def pic(id_, name, rid, x, y, cx, cy, descr=''):
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="{id_}" name="{name}" descr="{X(descr)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
            f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
            f'<a:ln w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:ln></p:spPr></p:pic>')
def png_size(path):
    d = open(path, 'rb').read(24); return struct.unpack('>II', d[16:24])
def fit(path, cx_max, cy_max):
    w, h = png_size(path); s = min(cx_max / w, cy_max / h); return int(w * s), int(h * s)
def add_media(slide_no, png, rid):
    n = len([f for f in os.listdir(P('ppt', 'media'))]) + 1
    name = f'image{n}.png'; shutil.copy(png, P('ppt', 'media', name))
    rp = P('ppt', 'slides', '_rels', f'slide{slide_no}.xml.rels'); r = open(rp).read()
    r = r.replace('</Relationships>', f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{name}"/></Relationships>')
    open(rp, 'w').write(r)
def slide(n): return P('ppt', 'slides', f'slide{n}.xml')
def replace_shape_body(xml, shape_id, new_body):
    m = re.search(rf'(<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" .*?)(<p:txBody>.*?</p:txBody>)(</p:sp>)', xml, re.S)
    assert m, shape_id
    return xml[:m.start(2)] + new_body + xml[m.end(2):]
def set_shape_xfrm(xml, shape_id, x, y, cx, cy):
    # stay inside this shape: no </p:sp> may be crossed before its own <a:xfrm>
    m = re.search(rf'(<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" (?:(?!</p:sp>).)*?<a:xfrm[^>]*>)<a:off x="-?\d+" y="-?\d+"/><a:ext cx="\d+" cy="\d+"/>', xml, re.S)
    assert m, shape_id
    return xml[:m.end(1)] + f'<a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/>' + xml[m.end():]
def append_shapes(xml, shapes):
    return xml.replace('</p:spTree>', ''.join(shapes) + '</p:spTree>')
def set_team(xml):
    return re.sub(r'(<p:cNvPr id="\d+" name="Oval \d+".*?<a:t>)Your Team Name(</a:t>)', r'\1' + TEAM + r'\2', xml, flags=re.S)

TEAM = '[Team Name]'   # as registered on the portal
TEAM_ID = '[Team ID]'

# ---------------------------------------------------------------- slide 1: title page
s = open(slide(1)).read()
s = s.replace('SMART INDIA HACKATHON 2024', 'SMART INDIA HACKATHON 2026')
def kv(label, value, vsz=1500):
    return para(run(label + ' ', 1600, b=True) + run(value, vsz), bullet=True, sz=1600, spcAft=500, algn='l')
rows = [
    kv('Problem Statement ID –', 'SIH26035'),
    kv('Problem Statement Title –', 'Development of a Software Program/Application for Generation of Test Reports for Non-Automatic Weighing Instruments (NAWI) as per OIML Recommendation R-76', 1300),
    kv('Theme –', 'Smart Vehicles (as listed against SIH26035 on the SIH portal)'),
    kv('PS Category –', 'Software'),
    kv('Team ID –', TEAM_ID),
    kv('Team Name (Registered on portal) –', TEAM),
]
s = replace_shape_body(s, 10, txbody(rows))
s = set_shape_xfrm(s, 10, 331286, 2000000, 6300000, 4500000)
open(slide(1), 'w').write(s)

# ---------------------------------------------------------------- slide 2: idea title / proposed solution
s = open(slide(2)).read()
s = s.replace('<a:t>IDEA TITLE</a:t>', '<a:t>NAWI TestBench: OIML R 76 test reports computed to the clause</a:t>')
s = s.replace('sz="3600" b="1" dirty="0"><a:latin typeface="Times New Roman"', 'sz="2400" b="1" dirty="0"><a:latin typeface="Times New Roman"')
s = set_shape_xfrm(s, 15361, 1650000, 0, 8100000, 1143000)
s = set_team(s)
body = [
    heading('Proposed Solution (Describe your Idea/Solution/Prototype)', 1600),
    para(run('A working web application for type-evaluation laboratories: register the instrument, record every OIML R 76 observation as the indicator shows it, and receive the computed verdicts, the standardised report and the certificate.', 1300), bullet=True, sz=1300),
    para(run('Detailed explanation of the proposed solution', 1400, b=True), bullet=False, sz=1400, spcBef=300, spcAft=100),
    para(run('Instrument register with full R 76 particulars; Table 3 admissibility (n, Min, d ≤ e) checked as you type', 1200), lvl=1, sz=1200, spcAft=60),
    para(run('17 tests as data-entry forms: weighing, eccentricity, repeatability, discrimination, tare, zero, tilting, warm-up, temperature, zero drift, voltage, damp heat, creep, zero return, span stability, markings and functional checklists', 1200), lvl=1, sz=1200, spcAft=60),
    para(run('Lab environment (temperature, humidity, pressure, voltage, frequency) logged at start, during and end of testing', 1200), lvl=1, sz=1200, spcAft=60),
    para(run('Engine derives the MPE band, applies P = I + ½e − ΔL and Ec = E − E0, and decides pass / fail per point, per test, per evaluation', 1200), lvl=1, sz=1200, spcAft=60),
    para(run('Report as HTML, PDF and editable Word; certificate of conformity when the full battery passes and an approver signs', 1200), lvl=1, sz=1200),
    para(run('How it addresses the problem', 1400, b=True), bullet=False, sz=1400, spcBef=300, spcAft=100),
    para(run('Replaces spreadsheets and printed MPE tables: no band look-ups, no transcription, no arithmetic by hand', 1200), lvl=1, sz=1200, spcAft=60),
    para(run('Uniform report across all centres; every verdict carries its R 76 clause; searchable repository with role-based access and audit trail', 1200), lvl=1, sz=1200),
    para(run('Innovation and uniqueness of the solution', 1400, b=True), bullet=False, sz=1400, spcBef=300, spcAft=100),
    para(run('The standard is data: a versioned rule-set file, so a revised R 76 is a new file and old reports stay reproducible', 1200), lvl=1, sz=1200, spcAft=60),
    para(run('Live indicator readout shows the corrected error against ± MPE before a reading is saved; metrological validation refuses impossible entries', 1200), lvl=1, sz=1200, spcAft=60),
    para(run('SHA-256 signed approval, numbered certificate, public verification page', 1200), lvl=1, sz=1200),
]
s = replace_shape_body(s, 15362, txbody(body))
s = set_shape_xfrm(s, 15362, 250000, 1150000, 7350000, 5150000)
add_media(2, 'ppt-live-crop.png', 'rId4')
cx, cy = fit('ppt-live-crop.png', 4300000, 2100000)
add_media(2, 'ppt-cert.png', 'rId5')
ccx, ccy = fit('ppt-cert.png', 4300000, 2100000)
s = append_shapes(s, [
    pic(40, 'Live readout', 'rId4', 7700000, 1250000, cx, cy, 'Weighing form with live LCD readout and MPE gauge'),
    textbox(41, 'Caption 1', 7700000, 1250000 + cy + 20000, cx, 300000, [para(run('Recording a reading: corrected error shown against ± MPE live', 1000), bullet=False, sz=1000, spcAft=0)]),
    pic(42, 'Certificate', 'rId5', 7700000 + (cx - ccx) // 2, 1250000 + cy + 360000, ccx, ccy, 'Certificate of conformity'),
    textbox(43, 'Caption 2', 7700000, 1250000 + cy + 360000 + ccy + 20000, cx, 300000, [para(run('Certificate issued after a passing battery is approved and signed', 1000), bullet=False, sz=1000, spcAft=0)]),
])
open(slide(2), 'w').write(s)

# ---------------------------------------------------------------- slide 3: technical approach
s = open(slide(3)).read()
s = set_team(s)
tech = [
    heading('Technologies used', 1600),
    para(run('Node.js 20 + Express 4 ', 1200, b=True) + run('REST API, role checks on every route', 1200), sz=1200, spcAft=60),
    para(run('SQLite (better-sqlite3, WAL) ', 1200, b=True) + run('instruments, tests, observations, environment, checklists, attachments, users, audit', 1200), sz=1200, spcAft=60),
    para(run('Vanilla HTML, CSS, JavaScript + SVG ', 1200, b=True) + run('workbench, MPE envelope chart, seven-segment LCD readout, no build step', 1200), sz=1200, spcAft=60),
    para(run('Rule set as versioned JSON ', 1200, b=True) + run('classes, MPE bands, supply rules, 17 test definitions with clauses', 1200), sz=1200, spcAft=60),
    para(run('Pure evaluation engine ', 1200, b=True) + run('changeover point, zero correction, per-test criteria, load-plan and completeness checks; 47 hand-worked unit tests (node:test)', 1200), sz=1200, spcAft=60),
    para(run('Exports ', 1200, b=True) + run('HTML report, PDF via headless Chromium, DOCX via an in-house OOXML writer (zlib only), JSON', 1200), sz=1200, spcAft=60),
    para(run('Security ', 1200, b=True) + run('scrypt password hashing, HttpOnly cookie sessions, SHA-256 report signatures, public /verify endpoint', 1200), sz=1200, spcAft=60),
    para(run('Standards ', 1200, b=True) + run('OIML R 76-1:2006 (E) constants clause by clause; R 76-2:2007 report layout', 1200), sz=1200),
]
s = replace_shape_body(s, 17410, txbody(tech))
s = set_shape_xfrm(s, 17410, 250000, 1150000, 6350000, 3150000)
add_media(3, 'ppt-dash.png', 'rId4')
dcx, dcy = fit('ppt-dash.png', 5350000, 2950000)
steps = [
    ('Register instrument', 'particulars, Table 3 check'),
    ('Open test', 'purpose, rule set, lab, environment'),
    ('Record observations', 'validation, live MPE readout'),
    ('Evaluate', 'MPE band, Ec, per-test criteria'),
    ('Close', 'observations frozen'),
    ('Approve and sign', 'SHA-256, approver role'),
    ('Report and certificate', 'PDF, DOCX, verify page'),
]
shapes = [pic(50, 'Dashboard', 'rId4', 6600000, 1150000, dcx, dcy, 'Workbench dashboard'),
          textbox(51, 'Caption 3', 6600000, 1150000 + dcy + 10000, dcx, 280000, [para(run('Working prototype: dashboard with live readouts, outcomes and repository', 1000), bullet=False, sz=1000, spcAft=0)]),
          textbox(52, 'Flow heading', 250000, 4380000, 9000000, 330000, [heading('Methodology and process for implementation', 1600)])]
x0, y0, bw, bh, gap = 250000, 4780000, 1480000, 900000, 200000
for i, (a, b) in enumerate(steps):
    x = x0 + i * (bw + gap)
    shapes.append(box(60 + i, f'Step {i + 1}', x, y0, bw, bh, [a, b], fill='0070C0' if i < 4 else ('305496' if i < 6 else '1E7A4E'), sz=900))
    if i < len(steps) - 1: shapes.append(arrow(80 + i, x + bw + 15000, y0 + bh // 2 - 80000, gap - 30000, 160000))
shapes.append(textbox(90, 'Flow note', 250000, 5720000, 11700000, 560000, [
    para(run('Every save re-runs the engine, so verdicts, the error envelope and the completeness list update together. Reports are always recomputed from the stored raw observations against the rule set they were opened under.', 1100), bullet=False, sz=1100, spcAft=0)]))
s = append_shapes(s, shapes)
open(slide(3), 'w').write(s)

# ---------------------------------------------------------------- slide 4: feasibility and viability
s = open(slide(4)).read()
s = set_team(s)
def col(x, cx, hd, items):
    return textbox(70 + x // 100000, f'Col {x}', x, 1250000, cx, 5000000, [heading(hd, 1500)] + [para(run(t, 1200), sz=1200, spcAft=120) for t in items])
cols = [
    col(250000, 3800000, 'Analysis of the feasibility of the idea', [
        'Working prototype already covers the complete R 76 battery, workflow, exports and certificate',
        'Two runtime dependencies; runs on any laboratory PC or a small server, offline if needed',
        'Every constant traced to a clause of R 76-1:2006 and locked by 47 hand-worked tests',
        'Report time falls from hours of spreadsheet work to minutes of data entry',
        'Instrument-wise history and search replace paper files without changing how labs test']),
    col(4200000, 3800000, 'Potential challenges and risks', [
        'Multi-interval and multiple-range instruments (e1, e2, e3) need per-range MPE handling',
        'OIML R 76 is under revision; limits or test procedures may change',
        'Labs hold years of results in spreadsheets that must be brought across',
        'PDF rendering depends on a Chromium browser being present on the server',
        'Laboratory data is sensitive: access, integrity and long-term reproducibility must hold']),
    col(8150000, 3800000, 'Strategies for overcoming these challenges', [
        'Rule set is data: a new edition is a new JSON file; reports pin the version they were judged under',
        'Range-aware evaluation is an extension of the same engine; tests guard existing behaviour',
        'CSV and JSON import for legacy observations; JSON export for integration with portals',
        'DOCX and HTML exports work without Chromium; PDF path is auto-detected or configured',
        'Roles, scrypt passwords, audit trail, signed approvals and a public verification page; TLS at the proxy']),
]
s = replace_shape_body(s, 17410, txbody([para(run('', 100), bullet=False, sz=100, spcAft=0)]))
s = set_shape_xfrm(s, 17410, 0, 0, 10000, 10000)
s = append_shapes(s, cols)
open(slide(4), 'w').write(s)

# ---------------------------------------------------------------- slide 5: impact and benefits
s = open(slide(5)).read()
s = set_team(s)
left = textbox(71, 'Impact', 250000, 1250000, 5700000, 5000000, [
    heading('Potential impact on the target audience', 1500),
    para(run('Department of Consumer Affairs and Legal Metrology laboratories: ', 1200, b=True) + run('one uniform, clause-referenced report format across every test centre; faster model approvals', 1200), sz=1200, spcAft=140),
    para(run('Test engineers: ', 1200, b=True) + run('no manual band look-up or arithmetic; impossible readings refused at entry; the live readout shows the verdict before the point is saved', 1200), sz=1200, spcAft=140),
    para(run('Approving officers: ', 1200, b=True) + run('review a complete, computed record; sign once; certificate issued automatically when the battery passes', 1200), sz=1200, spcAft=140),
    para(run('Manufacturers and applicants: ', 1200, b=True) + run('predictable turnaround, editable Word report for their records, verifiable certificate number', 1200), sz=1200, spcAft=140),
    para(run('Consumers and traders: ', 1200, b=True) + run('instruments in the market have passed a consistently judged evaluation', 1200), sz=1200),
])
right = textbox(72, 'Benefits', 6200000, 1250000, 5750000, 5000000, [
    heading('Benefits of the solution (social, economic, environmental, etc.)', 1500),
    para(run('Social: ', 1200, b=True) + run('fair transactions and consumer protection under the Legal Metrology Act, 2009, rest on approvals that are computed the same way everywhere', 1200), sz=1200, spcAft=140),
    para(run('Economic: ', 1200, b=True) + run('report preparation cut from hours to minutes; fewer repeat tests caused by calculation errors; shorter time to market for approved instruments', 1200), sz=1200, spcAft=140),
    para(run('Governance: ', 1200, b=True) + run('traceable verdicts with clause references, immutable observations, audit trail, signed approvals and public certificate verification', 1200), sz=1200, spcAft=140),
    para(run('Environmental: ', 1200, b=True) + run('paperless records and reports; digital repository replaces physical files at each centre', 1200), sz=1200, spcAft=140),
    para(run('Future-proof: ', 1200, b=True) + run('a revised OIML R 76 is a new rule-set file, not new software; JSON exports integrate with national portals', 1200), sz=1200),
])
s = replace_shape_body(s, 17410, txbody([para(run('', 100), bullet=False, sz=100, spcAft=0)]))
s = set_shape_xfrm(s, 17410, 0, 0, 10000, 10000)
s = append_shapes(s, [left, right])
open(slide(5), 'w').write(s)

# ---------------------------------------------------------------- slide 6: research and references
s = open(slide(6)).read()
s = set_team(s)
refs = [
    heading('Details / Links of the reference and research work', 1600),
    para(run('OIML R 76-1:2006 (E), Non-automatic weighing instruments. Part 1: Metrological and technical requirements. Tests. ', 1200) + run('https://www.oiml.org/en/files/pdf_r/r076-1-e06.pdf', 1200, color='0070C0'), sz=1200, spcAft=160),
    para(run('OIML R 76-2:2007 (E), Part 2: Test report format. ', 1200) + run('https://www.oiml.org/en/files/pdf_r/r076-2-e07.pdf', 1200, color='0070C0'), sz=1200, spcAft=160),
    para(run('The Legal Metrology Act, 2009 and the Legal Metrology (General) Rules, 2011, Department of Consumer Affairs. ', 1200) + run('https://consumeraffairs.gov.in/pages/legal-metrology-act', 1200, color='0070C0'), sz=1200, spcAft=160),
    para(run('Smart India Hackathon 2026, Problem Statement SIH26035, Ministry of Consumer Affairs, Food and Public Distribution. ', 1200) + run('https://www.sih.gov.in', 1200, color='0070C0'), sz=1200, spcAft=160),
    para(run('OIML Certification System (OIML-CS) and the use of OIML certificates for R 76 instruments. ', 1200) + run('https://www.oiml.org/en/oiml-cs', 1200, color='0070C0'), sz=1200, spcAft=160),
    para(run('Clauses implemented: 3.2 Table 3 (classification), 3.5 and Table 6 (MPE), 3.5.3.2 and A.4.4.3 (changeover point, zero correction), 3.6 (eccentricity, repeatability), 3.8.2.2 (discrimination), 3.9.1 to 3.9.4 (tilting, temperature, power supply, creep, zero return), 4.5 and 4.6 (zero and tare devices), 5.3.3 and B.4 (span stability), 5.3.5 and A.5.2 (warm-up), B.2 (damp heat), 7.1 (descriptive markings).', 1200), sz=1200, spcAft=160),
    para(run('Prototype documentation: docs/architecture.md, docs/calculation-methodology.md and docs/deployment.md in the project repository.', 1200), sz=1200),
]
s = replace_shape_body(s, 17410, txbody(refs))
s = set_shape_xfrm(s, 17410, 250000, 1250000, 11700000, 4900000)
open(slide(6), 'w').write(s)

# ---------------------------------------------------------------- drop the instructions slide (7)
os.remove(slide(7)); os.remove(P('ppt', 'slides', '_rels', 'slide7.xml.rels'))
pr = open(P('ppt', '_rels', 'presentation.xml.rels')).read()
pr = re.sub(r'<Relationship Id="rId8" [^>]*slides/slide7.xml"/>', '', pr); open(P('ppt', '_rels', 'presentation.xml.rels'), 'w').write(pr)
px = open(P('ppt', 'presentation.xml')).read()
px = px.replace('<p:sldId id="297" r:id="rId8"/>', ''); open(P('ppt', 'presentation.xml'), 'w').write(px)
ct = open(P('[Content_Types].xml')).read()
ct = re.sub(r'<Override PartName="/ppt/slides/slide7.xml"[^>]*/>', '', ct); open(P('[Content_Types].xml'), 'w').write(ct)
# notesSlide6 belonged to slide 7; leave the part but detach nothing else references it? remove for cleanliness
for f in ['ppt/notesSlides/notesSlide6.xml', 'ppt/notesSlides/_rels/notesSlide6.xml.rels']:
    if os.path.exists(P(f)): os.remove(P(f))
ct = open(P('[Content_Types].xml')).read()
ct = re.sub(r'<Override PartName="/ppt/notesSlides/notesSlide6.xml"[^>]*/>', '', ct); open(P('[Content_Types].xml'), 'w').write(ct)
# docProps/app.xml slide count
ap = P('docProps', 'app.xml')
if os.path.exists(ap):
    a = open(ap).read(); a = a.replace('<Slides>7</Slides>', '<Slides>6</Slides>'); open(ap, 'w').write(a)

# ---------------------------------------------------------------- zip
if os.path.exists(OUT): os.remove(OUT)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write(P('[Content_Types].xml'), '[Content_Types].xml')
    for root, _, files in os.walk(W):
        for f in files:
            full = os.path.join(root, f); arc = os.path.relpath(full, W)
            if arc == '[Content_Types].xml': continue
            z.write(full, arc)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
