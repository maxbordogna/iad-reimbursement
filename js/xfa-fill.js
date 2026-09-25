// Fills the official ZHdK "Zahlungsauftrag" (an Adobe XFA form) for the finance staff.
//
// Every field in the form's template is declared with <bind match="none">, so the XFA
// "datasets" packet is ignored. Acrobat instead restores field values from the saved
// form state (the XFA "form" packet), provided its checksum matches the unchanged
// template. We therefore write a new form packet (keeping the original checksum) and
// append it as an incremental update, the same way Acrobat saves a filled form.
// Acrobat renders XFA pages from the template and ignores appended PDF pages, so the
// receipts travel as an embedded file attachment instead.

const enc = new TextEncoder();

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function field(name, value, kind = 'text') {
  if (value === undefined || value === null || value === '') {
    return `<field name="${name}"><value override="1"/></field>`;
  }
  return `<field name="${name}"><value override="1"><${kind}>${esc(value)}</${kind}></value></field>`;
}

// Builds the <form> packet. Field order matters: the template has two fields named
// land_text and two named strasse_hausnummer_text, which are matched by position
// (payee first, then bank).
export function buildFormPacket(d, checksum) {
  const rows = d.rows
    .map((r, i) => {
      const fill = i % 2 === 0 ? '255,255,153' : '255,255,255';
      return (
        '<subform name="detail">' +
        `<field name="Lfdnr"><value><float>${i + 1}.00000000</float></value></field>` +
        field('Buchungstext', r.text) +
        field('Betrag', r.amount, 'decimal') +
        `<subform name="TF">${field('Waehrung', d.currency)}</subform>` +
        `<border><fill><color value="${fill}"/></fill></border>` +
        '</subform>'
      );
    })
    .join('');

  return (
    `<form checksum="${esc(checksum)}" xmlns="http://www.xfa.org/schema/xfa-form/2.8/">` +
    '<subform name="Formular"><instanceManager name="_Inhalt"/><subform name="Inhalt">' +
    '<instanceManager name="_Tabelle"/><subform name="Tabelle"><instanceManager name="_detail"/>' +
    rows +
    '<instanceManager name="_footer"/><subform name="footer"><instanceManager name="_SF"/>' +
    '<subform name="SF" presence="visible"/></subform></subform>' +
    field('auszahlung.name', d.createdBy.name) +
    field('auszahlung.vorname', d.createdBy.deptTel) +
    field('auszahlung.datum', d.createdBy.date, 'date') +
    field('WORKFLOW_TEXT', d.workflow) +
    field('vor_nachname_text', d.payee.fullName) +
    field('strasse_hausnummer_text', d.payee.street) +
    field('land_text', d.payee.country) +
    `<field name="ez_ja"><value override="1"><integer>${d.paymentSlip ? 1 : 0}</integer></value></field>` +
    field('land_text', d.bank.country) +
    field('strasse_hausnummer_text', d.bank.zipCity) +
    field('namederbank_text', d.bank.name) +
    field('iban_text', d.bank.iban) +
    field('swiftoderbic_text', d.bank.swift) +
    field('zahlungsgrund_text', d.reason) +
    field('PLZ_Ort_text', d.payee.zipCity) +
    '</subform><pageSet name="MP"><pageArea name="MP1"/></pageSet></subform></form>'
  );
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function lastStartXref(bytes) {
  const tail = bytesToBinary(bytes.subarray(Math.max(0, bytes.length - 1024)));
  const m = [...tail.matchAll(/startxref\s+(\d+)/g)].pop();
  if (!m) throw new Error('startxref not found');
  return Number(m[1]);
}

// /Size of the latest cross-reference section: one more than the highest object number
// in use. pdf-lib's largestObjectNumber skips xref and object streams, so new objects
// numbered from it could overwrite existing ones.
function xrefSize(bytes, offset) {
  const head = bytesToBinary(bytes.subarray(offset, offset + 4096));
  const m = /\/Size\s+(\d+)/.exec(head);
  if (!m) throw new Error('xref /Size not found');
  return Number(m[1]);
}

// Returns the latest raw definition of object `num` ("num 0 obj ... endobj") as bytes, or
// null if it lives in an object stream. Copying the bytes keeps the catalog's embedded
// Reader-rights signature exactly as it was.
// One char per byte. (TextDecoder('latin1') is really windows-1252 and would alter
// bytes 0x80-0x9F, corrupting binary data such as the signature.)
function bytesToBinary(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
}

function rawObject(bytes, num) {
  const text = bytesToBinary(bytes);
  let start = -1;
  for (const m of text.matchAll(new RegExp(`(?<=^|[\\r\\n])${num} 0 obj`, 'g'))) start = m.index;
  if (start < 0) return null;
  const end = /endobj/g;
  end.lastIndex = start;
  const e = end.exec(text);
  return e ? text.slice(start, e.index) : null;
}

const hexText = (s) =>
  '<FEFF' + Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase() + '>';

// attachments: [{ name, bytes, description }] are embedded as file attachments
// (Acrobat's paperclip panel). They are registered in the document's Names dictionary,
// a separate object, so the catalog, which holds Adobe's Reader-rights signature,
// stays untouched.
export async function fillXfa(PDFLib, srcBytes, data, attachments = []) {
  const { PDFDocument, PDFName, PDFArray, PDFDict, PDFRef, decodePDFRawStream } = PDFLib;
  const src = new Uint8Array(srcBytes);
  const doc = await PDFDocument.load(src, { updateMetadata: false, ignoreEncryption: true });

  const acroForm = doc.catalog.lookup(PDFName.of('AcroForm'));
  const xfa = acroForm && acroForm.lookup(PDFName.of('XFA'));
  if (!(xfa instanceof PDFArray)) throw new Error('This PDF has no XFA form.');

  let formRef = null;
  for (let i = 0; i < xfa.size(); i += 2) {
    if (xfa.lookup(i).decodeText() === 'form') formRef = xfa.get(i + 1);
  }
  if (!formRef) throw new Error('XFA form packet not found.');

  const oldPacket = new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(formRef)).decode());
  const checksum = (oldPacket.match(/checksum="([^"]+)"/) || [])[1];
  if (!checksum) throw new Error('XFA form checksum not found.');

  // Objects to write in the update: { num, parts: Uint8Array[] }
  const objects = [];
  const obj = (num, dict, stream) => {
    const body = typeof dict === 'string' ? enc.encode(dict) : dict; // raw bytes allowed
    objects.push({
      num,
      parts: stream
        ? [enc.encode(`${num} 0 obj\n`), body, enc.encode('\nstream\n'), stream, enc.encode('\nendstream\nendobj\n')]
        : [enc.encode(`${num} 0 obj\n`), body, enc.encode('\nendobj\n')],
    });
  };

  const packet = enc.encode(buildFormPacket(data, checksum));
  obj(formRef.objectNumber, `<</Type/EmbeddedFile/Length ${packet.length}>>`, packet);

  const prev = lastStartXref(src);
  let next = Math.max(doc.context.largestObjectNumber + 1, xrefSize(src, prev));
  if (attachments.length) {
    const namesRef = doc.catalog.get(PDFName.of('Names'));
    if (!(namesRef instanceof PDFRef)) throw new Error('Unexpected PDF structure (Names).');
    const names = doc.context.lookup(namesRef, PDFDict);

    const entries = [];
    for (const a of [...attachments].sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const bytes = new Uint8Array(a.bytes);
      const fileNum = next++;
      const specNum = next++;
      obj(fileNum, `<</Type/EmbeddedFile/Subtype/application#2Fpdf/Params<</Size ${bytes.length}>>/Length ${bytes.length}>>`, bytes);
      obj(
        specNum,
        `<</Type/Filespec/F ${hexText(a.name)}/UF ${hexText(a.name)}` +
          (a.description ? `/Desc ${hexText(a.description)}` : '') +
          `/EF<</F ${fileNum} 0 R/UF ${fileNum} 0 R>>>>`
      );
      entries.push(`${hexText(a.name)} ${specNum} 0 R`);
    }
    const treeNum = next++;
    obj(treeNum, `<</Names[${entries.join(' ')}]>>`);

    // Rewrite the Names dictionary (it only holds simple references) with EmbeddedFiles added.
    const kept = names
      .entries()
      .filter(([k]) => k.toString() !== '/EmbeddedFiles')
      .map(([k, v]) => `${k.toString()} ${v.toString()}`)
      .join('');
    obj(namesRef.objectNumber, `<<${kept}/EmbeddedFiles ${treeNum} 0 R>>`);

    // Ask Acrobat to open the attachments panel, so staff see the receipts right away.
    const root = doc.context.trailerInfo.Root;
    const catalog = rawObject(src, root.objectNumber);
    if (catalog) {
      const body = catalog
        .replace(/^\d+ 0 obj\s*/, '')
        .replace(/\/PageMode\s*\/\w+/, '')
        .replace(/>>\s*$/, '/PageMode/UseAttachments>>');
      // byte-for-byte copy: the signature stays unchanged
      obj(root.objectNumber, Uint8Array.from(body, (c) => c.charCodeAt(0)));
    }
  }

  const xrefNum = next;
  const { Root, Info, ID } = doc.context.trailerInfo;

  const parts = [src, enc.encode('\n')];
  let offset = src.length + 1;
  const offsets = new Map();
  for (const o of objects) {
    offsets.set(o.num, offset);
    for (const p of o.parts) {
      parts.push(p);
      offset += p.length;
    }
  }
  offsets.set(xrefNum, offset);

  // Cross-reference stream; entries are [type(1) offset(4) generation(2)], ascending by number.
  const nums = [...offsets.keys()].sort((a, b) => a - b);
  const table = new Uint8Array(nums.length * 7);
  const view = new DataView(table.buffer);
  nums.forEach((n, i) => {
    view.setUint8(i * 7, 1);
    view.setUint32(i * 7 + 1, offsets.get(n));
  });

  const dict =
    `<</Type/XRef/Size ${xrefNum + 1}/Index[${nums.map((n) => `${n} 1`).join(' ')}]/W[1 4 2]` +
    `/Root ${Root}` +
    (Info ? `/Info ${Info}` : '') +
    (ID ? `/ID ${ID}` : '') +
    `/Prev ${prev}/Length ${table.length}>>`;
  parts.push(
    enc.encode(`${xrefNum} 0 obj\n${dict}\nstream\n`),
    table,
    enc.encode(`\nendstream\nendobj\nstartxref\n${offsets.get(xrefNum)}\n%%EOF\n`)
  );

  return concat(parts);
}
