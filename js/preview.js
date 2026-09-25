// Draws a flat, viewable copy of the Zahlungsauftrag for students to check their input.
// All positions are taken from the XFA template (in mm from the top-left corner), so the
// preview matches the official form closely. Fonts are Helvetica instead of Verdana.

const PAGE_W = 595.276;
const PAGE_H = 841.89;
const mm = (v) => (v * 72) / 25.4;

const GREY = [0.6, 0.6, 0.6];
const YELLOW = [1, 1, 0.6];

const LABELS = [
  // [text, x, y, size, bold]
  ['zahlungsauftrag', 131.671, 9.112, 14, false],
  ['Zur Kontrolle an die Finanzabteilung weiterleiten', 131.757, 16.889, 7, false],
  ['Workflow Bezeichnung', 101.164, 29.159, 7, true],
  ['Erstellt von :', 115.828, 49.484, 7, false],
  ['Vorname / Name', 101.145, 55.199, 7, false],
  ['Abteilung / Tel. Nummer', 101.145, 59.854, 7, false],
  ['Datum', 101.145, 64.508, 7, false],
  ['Zahlungsempfänger / in', 8.99, 120.042, 7, true],
  ['Vorname und NACHNAME (gross)', 9.17, 125.413, 7, false],
  ['Strasse und Hausnummer', 9.17, 130.807, 7, false],
  ['Postleitzahl und Ort', 9.17, 136.045, 7, false],
  ['LAND (gross)', 9.277, 141.315, 7, false],
  ['Kreditinstitut', 9.344, 147.993, 7, true],
  ['Sonst sind folgende Angaben notwendig:', 9.344, 153.04, 8, true],
  ['Name der Bank', 9.344, 159.142, 7, false],
  ['Postleitzahl und Ort', 9.344, 164.536, 7, false],
  ['LAND (gross)', 9.344, 170.104, 7, false],
  ['SWIFT- oder BIC-Code', 9.344, 175.515, 7, false],
  ['IBAN International Bank Account Number', 9.344, 180.909, 7, false],
  ['Zahlungsgrund', 9.344, 188.653, 7, true],
  ['Seite 1 / 1', 186.851, 288.598, 7, false],
];

const RULES = [118.56, 146.613, 186.447, 194.16]; // horizontal lines at x 8.99, w 190.5

const HINWEIS = [
  [['', true]],
  [['Hinweise zur Verwendung des Zahlungsauftrages:', true]],
  [
    ['Grundsätzlich sollen Lieferanten und Dienstleistende für ihre Waren bzw. Dienstleistungen und auch Spesenabrechnungen ', false],
    ['Rechnungen', true],
    [' stellen. Nur wenn der Aufwand unverhältnismässig gross ausfallen würde, um von diesen eine Rechnung zu bekommen, kann ausnahmsweise anstelle einer Rechnung ein Zahlungsauftrag verwendet werden.', false],
  ],
  [['', false]],
  [['• ', false], ['Für Ausgaben muss eine Originalquittung oder eine Originalrechnung mit Zahlungsnachweis vorhanden sein.', true]],
  [['• Das Formular muss am ', false], ['Computer ausgefüllt', true], [' werden. Von Hand ausgefüllte Formulare werden von BuZ nicht akzeptiert.', false]],
  [['• Das Formular muss mit der ', false], ['Workflow Bezeichnung', true], [' versehen werden.', false]],
];

const WAEHRUNG_NOTE = [
  [['Der Zahlungsauftrag kann nur in einer Währung ausgeführt werden.', true]],
  [['Bei Belegen in unterschiedlichen Währungen, müssen diese in die Auszahlungswährung umgerechnet werden, bevor sie in den Zahlungsauftrag', false]],
  [['eingetragen werden.', false]],
];

// Table: x, y and column widths from the template (first column holds the +/- buttons,
// which are not printed).
const TABLE = { x: 9.239, y: 210.792, cols: [4.762, 0.9, 8.807, 125.515, 25.391, 24.369], rowH: 5.005 };

export function formatAmount(n) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return (n < 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + '.' + dec;
}

export function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso || '';
}

// Helvetica (WinAnsi) cannot draw every character: fall back to the base letter
// (ć → c, Ł → L) and only then to "?". The official XFA file keeps the original text.
const EXTRA = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h', ı: 'i', Ŀ: 'L', ŀ: 'l', ſ: 's' };
function makeClean(font) {
  const charset = new Set(font.getCharacterSet());
  const drawable = (ch) => ch === '\n' || charset.has(ch.codePointAt(0));
  return (s) =>
    Array.from(String(s ?? '').replace(/[\r\t]/g, ' '))
      .map((ch) => {
        if (drawable(ch)) return ch;
        const alt = EXTRA[ch] ?? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return Array.from(alt).every(drawable) && alt ? alt : '?';
      })
      .join('');
}

export async function buildPreview(PDFLib, logoBytes, d) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle('Zahlungsauftrag – Preview');
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const col = (c) => rgb(c[0], c[1], c[2]);

  const clean = makeClean(regular);

  const Y = (yTop) => PAGE_H - mm(yTop);

  function text(str, x, yTop, { size = 7, font = regular, color = [0, 0, 0] } = {}) {
    // XFA places text from the top of its box; approximate the baseline from the ascent.
    page.drawText(clean(str), { x: mm(x), y: Y(yTop) - size * 0.93, size, font, color: col(color) });
  }

  // Single-line value inside a box, vertically centred; shrinks the font to fit.
  function value(str, x, yTop, w, h, { size = 8, font = bold, align = 'left', inset = 0.5 } = {}) {
    const s = clean(str);
    if (!s) return;
    const maxW = mm(w - 2 * inset);
    let sz = size;
    while (sz > 5 && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.25;
    const tw = font.widthOfTextAtSize(s, sz);
    const x0 = align === 'right' ? mm(x + w - inset) - tw : mm(x + inset);
    const yb = Y(yTop + h / 2) - sz * 0.35;
    page.drawText(s, { x: x0, y: yb, size: sz, font, color: col([0, 0, 0]) });
  }

  function box(x, yTop, w, h, color = YELLOW) {
    page.drawRectangle({ x: mm(x), y: Y(yTop + h), width: mm(w), height: mm(h), color: col(color) });
  }

  // Word-wrapped paragraphs made of [text, isBold] runs.
  function richText(paras, x, yTop, w, size = 7, lineH = 1.25) {
    const maxW = mm(w);
    let y = Y(yTop) - size * 0.93;
    for (const runs of paras) {
      let line = [];
      let lineW = 0;
      const flush = () => {
        let cx = mm(x);
        for (const [t, b] of line) {
          const f = b ? bold : regular;
          page.drawText(t, { x: cx, y, size, font: f });
          cx += f.widthOfTextAtSize(t, size);
        }
        line = [];
        lineW = 0;
        y -= size * lineH;
      };
      for (const [t, b] of runs) {
        const f = b ? bold : regular;
        for (const word of clean(t).split(/(?<= )/)) {
          const ww = f.widthOfTextAtSize(word, size);
          if (lineW + ww > maxW && line.length) flush();
          const last = line[line.length - 1];
          if (last && last[1] === b) last[0] += word;
          else line.push([word, b]);
          lineW += ww;
        }
      }
      flush();
    }
  }

  // Multi-line value (the Workflow field is a tall box).
  function multiline(str, x, yTop, w, h, size = 8) {
    const maxW = mm(w - 1);
    const lines = [];
    for (const para of clean(str).split('\n')) {
      let cur = '';
      for (const word of para.split(/(?<= )/)) {
        if (cur && bold.widthOfTextAtSize(cur + word, size) > maxW) {
          lines.push(cur);
          cur = word;
        } else cur += word;
      }
      lines.push(cur);
    }
    const maxLines = Math.floor(mm(h) / (size * 1.2));
    lines.slice(0, maxLines).forEach((l, i) => {
      page.drawText(l.trimEnd(), { x: mm(x + 0.5), y: Y(yTop) - size * (0.95 + i * 1.2), size, font: bold });
    });
  }

  // --- static parts -------------------------------------------------------------------
  const logo = await doc.embedPng(logoBytes);
  const logoH = 34.429;
  page.drawImage(logo, { x: mm(8.557), y: Y(9.111 + logoH), width: mm((logoH * logo.width) / logo.height), height: mm(logoH) });

  for (const [t, x, y, size, b] of LABELS) text(t, x, y, { size, font: b ? bold : regular });
  for (const y of RULES) {
    page.drawLine({ start: { x: mm(8.99), y: Y(y) }, end: { x: mm(8.99 + 190.5), y: Y(y) }, thickness: 0.5 });
  }
  richText(HINWEIS, 8.99, 70.478, 190.172);
  richText(WAEHRUNG_NOTE, 9.344, 196.5, 195);

  // --- header fields ------------------------------------------------------------------
  const HX = 146.384;
  const HW = 52.911;
  box(HX, 29.368, HW, 16.173);
  multiline(d.workflow, HX, 29.368 + 0.4, HW, 16.173);
  for (const [v, y] of [
    [d.createdBy.name, 54.449],
    [d.createdBy.deptTel, 59.104],
    [formatDate(d.createdBy.date), 64.018],
  ]) {
    box(HX, y, HW, 4.572);
    value(v, HX, y, HW, 4.572);
  }

  // --- payee and bank -----------------------------------------------------------------
  const FW = 128.053;
  const FH = 4.572;
  const fields = [
    [d.payee.fullName, 71.437, 124.711],
    [d.payee.street, 71.437, 130.105],
    [d.payee.zipCity, 71.437, 135.343],
    [d.payee.country, 71.544, 140.613],
    [d.bank.name, 71.544, 158.44],
    [d.bank.zipCity, 71.544, 163.834],
    [d.bank.country, 71.544, 169.402],
    [d.bank.swift, 71.544, 174.813],
    [d.bank.iban, 71.544, 180.207],
    [d.reason, 71.544, 187.94],
  ];
  for (const [v, x, y] of fields) {
    box(x, y, FW, FH);
    value(v, x, y, FW, FH);
  }

  // Payment-slip checkbox
  const cb = 3.5278;
  page.drawRectangle({ x: mm(71.544), y: Y(148.263 + cb), width: mm(cb), height: mm(cb), color: col([1, 1, 1]), borderColor: col([0, 0, 0]), borderWidth: 0.5 });
  if (d.paymentSlip) {
    const x0 = mm(71.544);
    const y0 = Y(148.263 + cb);
    const s = mm(cb);
    page.drawLine({ start: { x: x0 + s * 0.2, y: y0 + s * 0.5 }, end: { x: x0 + s * 0.42, y: y0 + s * 0.22 }, thickness: 1 });
    page.drawLine({ start: { x: x0 + s * 0.42, y: y0 + s * 0.22 }, end: { x: x0 + s * 0.82, y: y0 + s * 0.82 }, thickness: 1 });
  }
  text('Ein Einzahlungsschein liegt diesem Zahlungsauftrag bei.', 71.544 + 5.472, 148.263 + 0.4);

  // --- expense table ------------------------------------------------------------------
  const cx = [];
  TABLE.cols.reduce((x, w) => (cx.push(x), x + w), TABLE.x);
  const [, , cBeleg, cText, cAmount, cCur] = cx;
  const [, , wBeleg, wText, wAmount, wCur] = TABLE.cols;

  function cellLines(x, w, y) {
    for (const yy of [y, y + TABLE.rowH]) {
      page.drawLine({ start: { x: mm(x + 0.5), y: Y(yy) }, end: { x: mm(x + w - 0.5), y: Y(yy) }, thickness: 0.4, color: col(GREY) });
    }
  }

  let y = TABLE.y;
  value('Beleg', cBeleg, y, wBeleg + 3, TABLE.rowH, { size: 7, font: regular, inset: 1 });
  value('Buchungstext', cText, y, wText, TABLE.rowH, { size: 7, font: regular, inset: 1 });
  value('Betrag und Auszahlungs-Währung', cAmount, y, wAmount + wCur, TABLE.rowH, { size: 7, font: regular, inset: 1 });
  y += TABLE.rowH;

  d.rows.forEach((r, i) => {
    if (i % 2 === 0) box(cBeleg + 0.5, y, cCur + wCur - cBeleg - 1, TABLE.rowH);
    for (const [x, w] of [[cBeleg, wBeleg], [cText, wText], [cAmount, wAmount], [cCur, wCur]]) cellLines(x, w, y);
    value(String(i + 1), cBeleg, y, wBeleg, TABLE.rowH, { size: 7, font: regular, inset: 1 });
    value(r.text, cText, y, wText, TABLE.rowH, { size: 7, font: regular, inset: 1 });
    value(r.amount === '' ? '' : formatAmount(Number(r.amount)), cAmount, y, wAmount, TABLE.rowH, { size: 7, font: regular, align: 'right', inset: 1 });
    value(d.currency, cCur, y, wCur, TABLE.rowH, { size: 7, font: regular, inset: 1 });
    y += TABLE.rowH;
  });

  const total = d.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  cellLines(cAmount, wAmount, y);
  cellLines(cCur, wCur, y);
  value(formatAmount(total), cAmount, y, wAmount, TABLE.rowH, { size: 7, font: bold, align: 'right', inset: 1 });
  value(d.currency, cCur, y, wCur, TABLE.rowH, { size: 7, font: bold, inset: 1 });

  // --- preview marker -----------------------------------------------------------------
  text('PREVIEW – for checking only. Submit the official form file, not this one.', 9.344, 288.598, { color: [0.55, 0.55, 0.55] });

  await addReceiptPages(PDFLib, doc, d);
  return doc.save();
}

// ---- receipt pages ----------------------------------------------------------------------
// One A4 page per expense: the receipt (Beleg) in the top half, the bank movement below.
// Each document is { kind: 'image' | 'pdf', bytes, mime, page }. A payment slip, if any,
// gets its own page before them.

async function embedDoc(doc, file) {
  if (file.kind === 'pdf') {
    const [p] = await doc.embedPdf(file.bytes, [file.page || 0]);
    return { draw: (page, opts) => page.drawPage(p, opts), width: p.width, height: p.height };
  }
  const img = file.mime === 'image/png' ? await doc.embedPng(file.bytes) : await doc.embedJpg(file.bytes);
  return { draw: (page, opts) => page.drawImage(img, opts), width: img.width, height: img.height };
}

// parts: which pages to add; the preview gets both, the attachments one each.
export async function addReceiptPages(PDFLib, doc, d, { slip = true, expenses = true } = {}) {
  const { StandardFonts, rgb } = PDFLib;
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = makeClean(regular);
  const M = mm(15);
  const n = d.rows.length;

  // Payment slip (Einzahlungsschein) first, on its own page using the full area
  if (slip && d.paymentSlip && d.paymentSlipDoc) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const top = PAGE_H - M;
    page.drawText('Einzahlungsschein', { x: M, y: top - 12, size: 12, font: bold });
    page.drawText('Payment slip', { x: M, y: top - 27, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3) });
    page.drawLine({ start: { x: M, y: top - 34 }, end: { x: PAGE_W - M, y: top - 34 }, thickness: 0.5 });
    const boxTop = top - 34 - mm(6);
    const boxH = boxTop - M - 16 - mm(6);
    const boxW = PAGE_W - 2 * M;
    page.drawRectangle({ x: M, y: boxTop - boxH, width: boxW, height: boxH, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
    const e = await embedDoc(doc, d.paymentSlipDoc);
    const s = Math.min((boxW - 12) / e.width, (boxH - 12) / e.height);
    e.draw(page, { x: M + (boxW - e.width * s) / 2, y: boxTop - boxH + (boxH - e.height * s) / 2, width: e.width * s, height: e.height * s });
    footer(page);
  }

  for (const [i, r] of (expenses ? d.rows : []).entries()) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const top = PAGE_H - M;

    // Header: "Beleg 1 / 3", booking text, amount
    page.drawText(`Beleg ${i + 1} / ${n}`, { x: M, y: top - 12, size: 12, font: bold });
    const amount = `${formatAmount(Number(r.amount))} ${d.currency}`;
    page.drawText(clean(amount), { x: PAGE_W - M - bold.widthOfTextAtSize(clean(amount), 12), y: top - 12, size: 12, font: bold });
    let desc = clean(r.text);
    const maxW = PAGE_W - 2 * M;
    while (desc.length > 1 && regular.widthOfTextAtSize(desc, 9) > maxW) desc = desc.slice(0, -2) + '…';
    page.drawText(desc, { x: M, y: top - 27, size: 9, font: regular, color: rgb(0.3, 0.3, 0.3) });
    page.drawLine({ start: { x: M, y: top - 34 }, end: { x: PAGE_W - M, y: top - 34 }, thickness: 0.5 });

    // Two equal areas below the header
    const footerH = 16;
    const gap = mm(6);
    const areaTop = top - 34 - gap;
    const areaH = (areaTop - M - footerH - gap) / 2;
    const areas = [
      ['RECEIPT (BELEG)', r.receipt, areaTop],
      ['BANK MOVEMENT (KONTOBEWEGUNG)', r.bank, areaTop - areaH - gap],
    ];
    for (const [label, file, yTop] of areas) {
      page.drawText(label, { x: M, y: yTop - 8, size: 7.5, font: bold, color: rgb(0.35, 0.35, 0.35) });
      const boxTop = yTop - 14;
      const boxH = areaH - 14;
      page.drawRectangle({ x: M, y: boxTop - boxH, width: maxW, height: boxH, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });
      if (!file) continue;
      const e = await embedDoc(doc, file);
      const pad = 6;
      const s = Math.min((maxW - 2 * pad) / e.width, (boxH - 2 * pad) / e.height);
      const w = e.width * s;
      const h = e.height * s;
      e.draw(page, { x: M + (maxW - w) / 2, y: boxTop - boxH + (boxH - h) / 2, width: w, height: h });
    }

    footer(page);
  }

  function footer(page) {
    const foot = clean(`Zahlungsauftrag · ${d.payee.fullName} · ${d.reason}`);
    page.drawText(foot.length > 110 ? foot.slice(0, 109) + '…' : foot, { x: M, y: M, size: 7, font: regular, color: rgb(0.55, 0.55, 0.55) });
  }
}

// Expense pages only (receipts and bank movements), attached to the official form.
export async function buildReceiptsPdf(PDFLib, d) {
  const doc = await PDFLib.PDFDocument.create();
  doc.setTitle(`Belege – ${d.payee.fullName}`);
  await addReceiptPages(PDFLib, doc, d, { slip: false });
  return doc.save();
}

// Payment slip page only, attached to the official form as its own file.
export async function buildSlipPdf(PDFLib, d) {
  const doc = await PDFLib.PDFDocument.create();
  doc.setTitle(`Einzahlungsschein – ${d.payee.fullName}`);
  await addReceiptPages(PDFLib, doc, d, { expenses: false });
  return doc.save();
}
