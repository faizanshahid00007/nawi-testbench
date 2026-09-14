'use strict';

// A minimal Office Open XML writer: enough of WordprocessingML to produce a
// report that opens in Word, LibreOffice and Google Docs and can be edited.
// Documents are described as a flat list of blocks:
//   { type: 'heading', level, text }
//   { type: 'para', text, style?: 'small'|'note', bold? }
//   { type: 'kv', rows: [[key, value], ...] }
//   { type: 'table', columns: [{ label, align? }], rows: [[cell, ...]], widths? }
//   { type: 'pagebreak' }
// Only zlib from Node's standard library is used.

const zlib = require('zlib');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, date } = dosDateTime();
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + deflated.length;
  }
  const centralSize = centrals.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

/* ---- WordprocessingML ---------------------------------------------------- */

const run = (text, { bold, size, color, italic } = {}) => {
  const props = [
    bold ? '<w:b/>' : '',
    italic ? '<w:i/>' : '',
    size ? `<w:sz w:val="${size}"/>` : '',
    color ? `<w:color w:val="${color}"/>` : ''
  ].join('');
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};

const para = (runs, { align, spacingAfter = 80, style, keepNext } = {}) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keepNext ? '<w:keepNext/>' : ''}` +
  `<w:spacing w:after="${spacingAfter}"/>${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${runs}</w:p>`;

const cell = (content, { width, align, shade, bold, size = 17, color } = {}) =>
  `<w:tc><w:tcPr>${width ? `<w:tcW w:w="${width}" w:type="dxa"/>` : ''}${shade ? `<w:shd w:val="clear" w:fill="${shade}"/>` : ''}</w:tcPr>` +
  para(run(content, { bold, size, color }), { align, spacingAfter: 0 }) + '</w:tc>';

function table(block) {
  const total = 9360;
  const n = block.columns.length;
  const widths = block.widths || block.columns.map(() => Math.floor(total / n));
  const borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFC7CC"/>`).join('') + '</w:tblBorders>';
  const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${block.columns.map((c, i) =>
    cell(c.label, { width: widths[i], align: c.align, shade: 'E8EEF0', bold: true, size: 16 })).join('')}</w:tr>`;
  const rows = block.rows.map((r) => `<w:tr>${r.map((v, i) => {
    const c = typeof v === 'object' && v !== null ? v : { text: v };
    return cell(c.text, { width: widths[i], align: block.columns[i].align, bold: c.bold, color: c.color });
  }).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borders}` +
    `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${header}${rows}</w:tbl>${para('', { spacingAfter: 120 })}`;
}

function kv(block) {
  const rows = block.rows.map(([k, v]) =>
    `<w:tr>${cell(k, { width: 3000, shade: 'F3F6F7', size: 17 })}${cell(v, { width: 6360, bold: true, size: 17 })}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblBorders>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="DDE3E6"/></w:tblBorders>` +
    `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6360"/></w:tblGrid>${rows}</w:tbl>${para('', { spacingAfter: 120 })}`;
}

function block(b) {
  switch (b.type) {
    case 'heading': {
      const size = b.level === 1 ? 32 : b.level === 2 ? 26 : 22;
      return para(run(b.text, { bold: true, size, color: b.level === 1 ? '0D4F5C' : '1B2A2C' }),
        { spacingAfter: b.level === 1 ? 160 : 100, keepNext: true, style: `Heading${b.level}` });
    }
    case 'para': {
      const size = b.style === 'small' ? 16 : b.style === 'note' ? 17 : 20;
      const color = b.style === 'small' || b.style === 'note' ? '5A6A6C' : undefined;
      return para(run(b.text, { bold: b.bold, size, color, italic: b.style === 'note' }), { align: b.align });
    }
    case 'kv': return kv(b);
    case 'table': return table(b);
    case 'pagebreak': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    default: return '';
  }
}

function build({ title, blocks, footer }) {
  const body = blocks.map(block).join('');
  const sect = `<w:sectPr>${footer ? '<w:footerReference w:type="default" r:id="rIdFooter"/>' : ''}` +
    `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
  const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${para(run(footer || '', { size: 15, color: '7C8A8C' }), { align: 'center', spacingAfter: 0 })}</w:ftr>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
</w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(title)}</dc:title><dc:creator>NAWI TestBench</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`;

  return zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['docProps/core.xml', core],
    ['word/_rels/document.xml.rels', docRels],
    ['word/document.xml', document],
    ['word/styles.xml', styles],
    ['word/footer1.xml', footerXml]
  ]);
}

module.exports = { build, zip, crc32 };
