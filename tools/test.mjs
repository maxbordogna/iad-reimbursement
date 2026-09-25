// Generates both PDFs from sample data: node tools/test.mjs <outDir>
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { fillXfa } from '../js/xfa-fill.js';
import { buildPreview, buildReceiptsPdf, buildSlipPdf } from '../js/preview.js';

const PDFLib = createRequire(import.meta.url)('../vendor/pdf-lib.min.js');
const root = new URL('..', import.meta.url).pathname;
const out = process.argv[2] || '.';

// Sample documents: a PNG image and a two-page PDF (the second page is used).
const png = readFileSync(root + 'assets/zhdk-logo.png');
const pdfDoc = await PDFLib.PDFDocument.create();
for (const label of ['PDF page 1 (not used)', 'PDF page 2: bank movement']) {
  const p = pdfDoc.addPage([595, 420]);
  p.drawText(label, { x: 40, y: 360, size: 24 });
  p.drawRectangle({ x: 40, y: 40, width: 515, height: 280, borderWidth: 2 });
}
const pdf = await pdfDoc.save();
const img = { kind: 'image', mime: 'image/png', bytes: png, page: 0 };
const bankPdf = { kind: 'pdf', mime: 'application/pdf', bytes: pdf, page: 1 };

const data = {
  createdBy: { name: 'Anna Muster', deptTel: 'MA Interaction Design / 079 000 00 00', date: '2026-09-25' },
  workflow: '97209900',
  payee: { fullName: 'Anna MUSTER', street: 'Musterstrasse 12', zipCity: '8005 Zürich', country: 'SCHWEIZ' },
  paymentSlip: false,
  bank: { name: 'TEST BANK (placeholder)', zipCity: '8001 Zürich', country: 'SCHWEIZ', iban: 'CH93 0076 2011 6238 5295 7', swift: 'UBSWCHZH80A' },
  reason: 'Reimbursement FieldTrip Ars Electronica Linz HS26',
  currency: 'CHF',
  rows: [
    { text: '3171097000 Exkursion total gemäss Belegen', amount: '1245.80', receipt: img, bank: bankPdf },
    { text: '3101097000 Materialkosten gemäss Belegen', amount: '38.50', receipt: bankPdf, bank: img },
    { text: 'Train ticket Zürich – Linz (ÖBB), Łódź test', amount: '120.00', receipt: img, bank: img },
  ],
};

const receipts = await buildReceiptsPdf(PDFLib, data);
const xfa = await fillXfa(PDFLib, readFileSync(root + 'assets/Zahlungsauftrag_blank.pdf'), data, [
  { name: 'Zahlungsauftrag_MUSTER_Belege.pdf', bytes: receipts, description: 'Belege und Kontobewegungen' },
]);
writeFileSync(out + '/TEST_official.pdf', xfa);
const prev = await buildPreview(PDFLib, readFileSync(root + 'assets/zhdk-logo.png'), data);
writeFileSync(out + '/TEST_preview.pdf', prev);

// Re-parse the official file to be sure the incremental update is readable.
const re = await PDFLib.PDFDocument.load(xfa, { updateMetadata: false });
const acro = re.catalog.lookup(PDFLib.PDFName.of('AcroForm'));
const arr = acro.lookup(PDFLib.PDFName.of('XFA'));
for (let i = 0; i < arr.size(); i += 2) {
  if (arr.lookup(i).decodeText() === 'form') {
    const s = arr.lookup(i + 1);
    const txt = new TextDecoder().decode(s.contents ?? PDFLib.decodePDFRawStream(s).decode());
    console.log('form packet re-read OK:', txt.includes('Anna MUSTER'), txt.length, 'bytes');
  }
}
const names = re.catalog.lookup(PDFLib.PDFName.of('Names'));
const tree = names.lookup(PDFLib.PDFName.of('EmbeddedFiles')).lookup(PDFLib.PDFName.of('Names'));
await listAttachments('TEST_official', xfa);
console.log('JavaScript kept:', !!names.get(PDFLib.PDFName.of('JavaScript')));
// Variant with a payment slip instead of bank details
const slipData = {
  ...data,
  paymentSlip: true,
  paymentSlipDoc: img,
  bank: { name: '', zipCity: '', country: '', iban: '', swift: '' },
};
const slipReceipts = await buildReceiptsPdf(PDFLib, slipData);
writeFileSync(out + '/TEST_official_slip.pdf', await fillXfa(PDFLib, readFileSync(root + 'assets/Zahlungsauftrag_blank.pdf'), slipData, [
  { name: 'Zahlungsauftrag_MUSTER_Belege.pdf', bytes: slipReceipts, description: 'Belege und Kontobewegungen' },
  { name: 'Zahlungsauftrag_MUSTER_Einzahlungsschein.pdf', bytes: await buildSlipPdf(PDFLib, slipData), description: 'Einzahlungsschein' },
]));
writeFileSync(out + '/TEST_preview_slip.pdf', await buildPreview(PDFLib, readFileSync(root + 'assets/zhdk-logo.png'), slipData));
await listAttachments('TEST_official_slip', readFileSync(out + '/TEST_official_slip.pdf'));
console.log('written to', out);

async function listAttachments(label, bytes) {
  const d = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  const tree = d.catalog.lookup(PDFLib.PDFName.of('Names')).lookup(PDFLib.PDFName.of('EmbeddedFiles')).lookup(PDFLib.PDFName.of('Names'));
  for (let i = 0; i < tree.size(); i += 2) {
    const ef = tree.lookup(i + 1).lookup(PDFLib.PDFName.of('EF')).lookup(PDFLib.PDFName.of('F'));
    const att = await PDFLib.PDFDocument.load(ef.contents);
    console.log(`${label}: ${tree.lookup(i).decodeText()} -> ${att.getPageCount()} page(s)`);
  }
}
