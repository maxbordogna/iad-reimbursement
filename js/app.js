import { fillXfa } from './xfa-fill.js';
import { buildPreview, buildReceiptsPdf, buildSlipPdf, formatAmount } from './preview.js';
import { prepareUpload, UploadError } from './uploads.js';
import { PROGRAMMES, COMMON_CODES, COUNTRY_CODES, KEEP_LEADING_ZERO } from './options.js';

const MAX_ROWS = 10; // the form's table allows at most 10 lines


const DOCS = [
  { key: 'receipt', label: 'Receipt', de: 'Beleg', hint: 'The official receipt or invoice' },
  { key: 'bank', label: 'Bank movement', de: 'Kontobewegung', hint: 'The payment in your bank account' },
];
const SLIP = { key: 'slip', label: 'Payment slip', de: 'Einzahlungsschein', hint: 'Photo or PDF of the payment slip / QR-bill' };

const slotHtml = (d, id) => `
  <div class="doc" data-doc="${d.key}">
    <p class="doc-label">${d.label} <span class="de">${d.de}</span></p>
    <label class="drop">
      <input type="file" class="file" accept="image/*,application/pdf,.pdf" id="f${id}-${d.key}" aria-label="${d.label}">
      <span class="drop-text"><strong>Upload photo or PDF</strong><br><small>${d.hint}</small></span>
    </label>
    <div class="doc-info" hidden>
      <img class="thumb" alt="">
      <span class="pdf-badge" hidden>PDF</span>
      <div class="doc-meta">
        <span class="doc-name"></span>
        <label class="page-pick" hidden>Page <select></select></label>
        <button type="button" class="link replace">Replace</button>
      </div>
    </div>
    <p class="doc-status" aria-live="polite"></p>
  </div>`;

const form = document.getElementById('form');
const rowsEl = document.getElementById('rows');
const addRowBtn = document.getElementById('add-row');
const resultEl = document.getElementById('result');
const summaryEl = document.getElementById('error-summary');
const generateBtn = document.getElementById('generate');
const statusEl = document.getElementById('status');
const bankFields = document.getElementById('bank-fields');
const programmeEl = document.getElementById('programme');
const programmeOtherField = document.getElementById('programme-other-field');
const prefixEl = document.getElementById('phone-prefix');
const slipEl = document.getElementById('slip-upload');

// Uploaded documents per expense line: row element -> { receipt, bank }
const rowDocs = new WeakMap();
// The payment slip lives outside the expense lines.
const formDocs = { slip: null };
slipEl.innerHTML = slotHtml(SLIP, 'slip');

const docStore = (slot) => {
  const li = slot.closest('.row');
  return li ? rowDocs.get(li) : formDocs;
};

// ---- setup ----------------------------------------------------------------------------


const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const countryOption = ([country, code]) => `<option value="${esc(country)}">${code} ${esc(country)}</option>`;
const dialCode = (country) => (COUNTRY_CODES.find(([c]) => c === country) || COMMON_CODES.find(([c]) => c === country))?.[1] || '';

programmeEl.innerHTML += [...PROGRAMMES, 'Other'].map((p) => `<option>${esc(p)}</option>`).join('');
prefixEl.innerHTML =
  '<option value="">Country…</option>' +
  COMMON_CODES.map(countryOption).join('') +
  '<optgroup label="All countries">' +
  COUNTRY_CODES.map(countryOption).join('') +
  '</optgroup>';

// "Other" asks for the programme name.
function syncProgramme() {
  const other = programmeEl.value === 'Other';
  programmeOtherField.hidden = !other;
  form.programmeOther.required = other;
}

let rowSeq = 0;
function addRow() {
  const id = ++rowSeq;
  const li = document.createElement('li');
  li.className = 'row';
  li.innerHTML = `
    <div class="row-main">
      <span class="num"></span>
      <input class="text" list="booking-suggestions" placeholder="Description or account line">
      <input class="amount" inputmode="decimal" placeholder="0.00">
      <button type="button" class="remove" aria-label="Remove line">×</button>
    </div>
    <div class="docs">${DOCS.map((d) => slotHtml(d, id)).join('')}</div>`;
  rowDocs.set(li, { receipt: null, bank: null });
  rowsEl.append(li);
  renumber();
  return li;
}

function renumber() {
  const rows = [...rowsEl.children];
  rows.forEach((li, i) => {
    const n = i + 1;
    li.querySelector('.num').textContent = n;
    li.querySelector('.text').setAttribute('aria-label', `Booking text, line ${n}`);
    li.querySelector('.amount').setAttribute('aria-label', `Amount, line ${n}`);
    li.querySelector('.remove').setAttribute('aria-label', `Remove line ${n}`);
    li.querySelector('.remove').disabled = rows.length === 1;
    for (const d of DOCS) {
      li.querySelector(`[data-doc="${d.key}"] .file`).setAttribute('aria-label', `${d.label} for line ${n}`);
    }
  });
  addRowBtn.disabled = rows.length >= MAX_ROWS;
  updateTotal();
}

function releaseDocs(li) {
  for (const doc of Object.values(rowDocs.get(li) || {})) if (doc?.thumbUrl) URL.revokeObjectURL(doc.thumbUrl);
}

addRowBtn.addEventListener('click', () => {
  addRow().querySelector('.text').focus();
  invalidateResult();
  refresh();
});

rowsEl.addEventListener('click', (e) => {
  const remove = e.target.closest('.remove');
  if (remove) {
    const li = remove.closest('.row');
    releaseDocs(li);
    li.remove();
    renumber();
    invalidateResult();
    refresh();
  }
});

form.addEventListener('click', (e) => {
  const replace = e.target.closest('.replace');
  if (replace) replace.closest('.doc').querySelector('.file').click();
});

// ---- uploads --------------------------------------------------------------------------

function showDoc(slot, doc) {
  const info = slot.querySelector('.doc-info');
  const drop = slot.querySelector('.drop');
  info.hidden = !doc;
  drop.classList.toggle('has-file', !!doc);
  if (!doc) return;
  const thumb = slot.querySelector('.thumb');
  thumb.hidden = !doc.thumbUrl;
  if (doc.thumbUrl) thumb.src = doc.thumbUrl;
  slot.querySelector('.pdf-badge').hidden = doc.kind !== 'pdf';
  slot.querySelector('.doc-name').textContent = doc.name;
  const pick = slot.querySelector('.page-pick');
  pick.hidden = doc.pageCount < 2;
  if (doc.pageCount > 1) {
    pick.querySelector('select').innerHTML = Array.from(
      { length: doc.pageCount },
      (_, i) => `<option value="${i}">${i + 1} of ${doc.pageCount}</option>`
    ).join('');
  }
}

form.addEventListener('change', async (e) => {
  const slot = e.target.closest('.doc');
  if (!slot) return;
  const key = slot.dataset.doc;
  const docs = docStore(slot);

  if (e.target.matches('.page-pick select')) {
    docs[key].page = Number(e.target.value);
    invalidateResult();
    return;
  }
  if (!e.target.matches('.file') || !e.target.files[0]) return;

  const file = e.target.files[0];
  e.target.value = ''; // allow re-selecting the same file
  const status = slot.querySelector('.doc-status');
  status.className = 'doc-status';
  status.textContent = 'Reading file…';
  try {
    const doc = await prepareUpload(window.PDFLib, file);
    if (docs[key]?.thumbUrl) URL.revokeObjectURL(docs[key].thumbUrl);
    docs[key] = doc;
    status.textContent = doc.pageCount > 1 ? 'This PDF has several pages: choose the one with the payment.' : '';
    slot.classList.remove('invalid');
    slot.querySelector('.field-error')?.remove();
    showDoc(slot, doc);
  } catch (err) {
    if (!(err instanceof UploadError)) console.error(err);
    status.className = 'doc-status error';
    status.textContent = err instanceof UploadError ? err.message : 'This file can’t be used. Please try a JPG, PNG or PDF.';
  }
  invalidateResult();
  refresh();
});

// ---- parsing & validation -------------------------------------------------------------

// Accepts 1234.5, 1'234.50, 1 234,50 and 12,5; returns a "1234.50" string or null.
function parseAmount(raw) {
  let s = raw.trim().replace(/['’\s]/g, '');
  if (!s) return null;
  if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n.toFixed(2) : null;
}

function ibanIsValid(raw) {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

// "+41" and "079 123 45 67" -> "+41 79 123 45 67" (Italy and San Marino keep the 0)
function formatPhone(code, number) {
  let n = number.trim().replace(/\s+/g, ' ');
  if (!KEEP_LEADING_ZERO.has(code)) n = n.replace(/^0(?=\d)/, '');
  return `${code} ${n}`;
}

const formatIban = (raw) => raw.replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
const swiftIsValid = (raw) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(raw.replace(/\s+/g, '').toUpperCase());

function updateTotal() {
  const total = [...rowsEl.querySelectorAll('.amount')].reduce((s, el) => s + (Number(parseAmount(el.value)) || 0), 0);
  document.getElementById('total').textContent = formatAmount(total);
  document.getElementById('total-cur').textContent = form.currency.value;
}

// With a payment slip the bank details aren't needed (as on the original form), but the
// slip itself has to be uploaded.
function syncBankState() {
  const slip = form.paymentSlip.checked;
  bankFields.hidden = slip;
  slipEl.hidden = !slip;
  for (const el of bankFields.querySelectorAll('[data-bank]')) el.required = !slip;
}

const LABELS = {
  createdFirst: 'Filled in by: first name',
  createdLast: 'Filled in by: last name',
  programme: 'Programme',
  programmeOther: 'Programme name',
  phonePrefix: 'Phone: country code',
  phoneNumber: 'Phone number',
  createdDate: 'Filled in by: date',
  payeeFirst: 'Payee: first name',
  payeeLast: 'Payee: last name',
  payeeStreet: 'Payee: street and number',
  payeeZipCity: 'Payee: postcode and town',
  payeeCountry: 'Payee: country',
  bankName: 'Bank name',
  bankZipCity: 'Bank postcode and town',
  bankCountry: 'Bank country',
  bankSwift: 'SWIFT / BIC',
  bankIban: 'IBAN',
  reason: 'Reason for payment',
  currency: 'Payout currency',
};

// Returns every problem as { el, message, summary }. Pure: doesn't touch the page.
function findProblems() {
  const problems = [];
  const add = (el, message, summary) => problems.push({ el, message, summary });

  for (const el of form.querySelectorAll('input[name]:not([type="radio"]), textarea[name], select[name]')) {
    if (el.required && !el.value.trim()) add(el, 'Please fill this in.', `${LABELS[el.name]} is missing`);
  }
  if (!form.currency.value) add(form.currency[0], 'Choose CHF or EUR.', 'Payout currency is missing');
  const phone = form.phoneNumber;
  if (phone.value.trim() && !/^[\d\s\-/().]{4,}$/.test(phone.value.trim())) {
    add(phone, 'Use digits only, e.g. 79 123 45 67.', 'Phone number is not valid');
  }
  if (form.paymentSlip.checked && !formDocs.slip) {
    add(slipEl.querySelector('.file'), 'Upload the payment slip.', 'Payment slip is missing');
  }
  if (!form.paymentSlip.checked) {
    const { bankIban: iban, bankSwift: swift } = form;
    if (iban.value.trim() && !ibanIsValid(iban.value)) {
      add(iban, "This IBAN isn't valid. Please check it for typos.", 'IBAN is not valid');
    }
    if (swift.value.trim() && !swiftIsValid(swift.value)) {
      add(swift, 'A SWIFT/BIC code has 8 or 11 characters, e.g. UBSWCHZH80A.', 'SWIFT / BIC is not valid');
    }
  }

  [...rowsEl.children].forEach((li, i) => {
    const n = i + 1;
    const text = li.querySelector('.text');
    const amount = li.querySelector('.amount');
    if (!text.value.trim()) add(text, 'Add a booking text.', `Line ${n}: booking text is missing`);
    if (!parseAmount(amount.value)) add(amount, 'Enter an amount like 12.50.', `Line ${n}: amount is missing or not valid`);
    const docs = rowDocs.get(li);
    for (const d of DOCS) {
      if (!docs[d.key]) {
        add(li.querySelector(`[data-doc="${d.key}"] .file`), `Upload the ${d.label.toLowerCase()}.`, `Line ${n}: ${d.label.toLowerCase()} is missing`);
      }
    }
  });
  return problems;
}

function clearErrors() {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.doc.invalid').forEach((el) => el.classList.remove('invalid'));
  form.querySelectorAll('.field-error').forEach((el) => el.remove());
  summaryEl.hidden = true;
}

// Highlights every problem and lists them at the top of the form.
function showProblems(problems) {
  clearErrors();
  problems.forEach(({ el, message }, i) => {
    el.setAttribute('aria-invalid', 'true');
    const msg = document.createElement('span');
    msg.className = 'field-error';
    msg.id = `err-${i}`;
    msg.textContent = message;
    el.setAttribute('aria-describedby', msg.id);
    const slot = el.closest('.doc');
    if (slot) slot.classList.add('invalid');
    (slot || el.closest('.row') || el.closest('.field')).append(msg);
  });

  const ul = summaryEl.querySelector('ul');
  ul.innerHTML = '';
  for (const { el, summary } of problems) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = summary;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      el.focus();
      el.scrollIntoView({ block: 'center' });
    });
    li.append(a);
    ul.append(li);
  }
  summaryEl.hidden = false;
  summaryEl.focus();
}

// Enables "Generate" only when everything is complete.
function refresh() {
  const n = findProblems().length;
  generateBtn.disabled = n > 0;
  statusEl.hidden = n === 0;
  statusEl.querySelector('.status-text').textContent =
    n === 1 ? 'One field is not complete yet.' : `${n} fields are not complete yet.`;
}

document.getElementById('show-missing').addEventListener('click', () => showProblems(findProblems()));

function collectData() {
  const v = (name) => form[name].value.trim();
  const upper = (name) => v(name).toUpperCase();
  return {
    createdBy: {
      name: `${v('createdFirst')} ${v('createdLast')}`,
      deptTel: `${programmeEl.value === 'Other' ? v('programmeOther') : v('programme')} / ${formatPhone(dialCode(v('phonePrefix')), v('phoneNumber'))}`,
      date: v('createdDate'),
    },
    workflow: '', // filled in later by the programme's secretary
    payee: {
      fullName: `${v('payeeFirst')} ${upper('payeeLast')}`,
      street: v('payeeStreet'),
      zipCity: v('payeeZipCity'),
      country: upper('payeeCountry'),
    },
    paymentSlip: form.paymentSlip.checked,
    paymentSlipDoc: form.paymentSlip.checked ? formDocs.slip : null,
    // Bank details typed before ticking "payment slip" are hidden, so leave them out.
    bank: form.paymentSlip.checked
      ? { name: '', zipCity: '', country: '', swift: '', iban: '' }
      : {
          name: v('bankName'),
          zipCity: v('bankZipCity'),
          country: upper('bankCountry'),
          swift: upper('bankSwift').replace(/\s+/g, ''),
          iban: formatIban(v('bankIban')),
        },
    reason: v('reason'),
    currency: form.currency.value,
    rows: [...rowsEl.children].map((li) => ({
      text: li.querySelector('.text').value.trim(),
      amount: parseAmount(li.querySelector('.amount').value),
      ...rowDocs.get(li),
    })),
  };
}

// ---- generation -----------------------------------------------------------------------

const fetchBytes = (url) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${url}`);
    return r.arrayBuffer();
  });
let assets;
const loadAssets = () =>
  (assets ??= Promise.all([fetchBytes('assets/Zahlungsauftrag_blank.pdf'), fetchBytes('assets/zhdk-logo.png')]));

const confirmEl = document.getElementById('confirm-checked');
const stepSend = document.getElementById('step-send');
function syncStep2() {
  const ok = confirmEl.checked;
  stepSend.toggleAttribute('data-locked', !ok);
  document.getElementById('stepper-1').className = ok ? 'done' : 'current';
  document.getElementById('stepper-2').className = ok ? 'current' : '';
  document.querySelector('.next-hint').hidden = !ok;
  document.getElementById('dl-official').setAttribute('aria-disabled', String(!confirmEl.checked));
}
confirmEl.addEventListener('change', () => {
  syncStep2();
  if (confirmEl.checked) stepSend.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

let urls = [];
function invalidateResult() {
  if (resultEl.hidden) return;
  resultEl.hidden = true;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  generateBtn.textContent = 'Generate PDFs again';
}

const fileSafe = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const problems = findProblems();
  if (problems.length) {
    showProblems(problems);
    return;
  }
  clearErrors();
  const data = collectData();
  // YYYYMMDD_Zahlungsauftrag_Name_Reason, e.g. 20260925_Zahlungsauftrag_Muster_Field_Trip_Linz_BA_Semester_4
  // (the reason is shortened so file names stay manageable)
  const base = [
    data.createdBy.date.replace(/-/g, ''),
    'Zahlungsauftrag',
    fileSafe(form.payeeLast.value.trim()),
    fileSafe(data.reason).slice(0, 50).replace(/_$/, ''),
  ].filter(Boolean).join('_');

  generateBtn.disabled = true;
  generateBtn.textContent = 'Generating…';
  try {
    const [blank, logo] = await loadAssets();
    const [receipts, preview] = await Promise.all([
      buildReceiptsPdf(window.PDFLib, data),
      buildPreview(window.PDFLib, logo, data),
    ]);
    const attachments = [{ name: `${base}_Belege.pdf`, bytes: receipts, description: 'Belege und Kontobewegungen' }];
    if (data.paymentSlip) {
      attachments.push({ name: `${base}_Einzahlungsschein.pdf`, bytes: await buildSlipPdf(window.PDFLib, data), description: 'Einzahlungsschein' });
    }
    const official = await fillXfa(window.PDFLib, blank, data, attachments);

    urls.forEach((u) => URL.revokeObjectURL(u));
    const officialUrl = URL.createObjectURL(new Blob([official], { type: 'application/pdf' }));
    const previewUrl = URL.createObjectURL(new Blob([preview], { type: 'application/pdf' }));
    urls = [officialUrl, previewUrl];

    Object.assign(document.getElementById('dl-official'), { href: officialUrl, download: `${base}_FOR_FINANCE.pdf` });
    Object.assign(document.getElementById('dl-preview'), { href: previewUrl, download: `${base}_PREVIEW_do_not_submit.pdf` });
    confirmEl.checked = false;
    syncStep2();
    document.getElementById('open-preview').href = previewUrl;
    document.getElementById('preview-frame').src = previewUrl;

    resultEl.hidden = false;
    resultEl.focus();
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    generateBtn.textContent = 'Generate PDFs again';
  } catch (err) {
    console.error(err);
    alert(`Sorry, something went wrong while creating the PDFs:\n${err.message}`);
    generateBtn.textContent = 'Generate PDFs';
  } finally {
    refresh();
  }
});

// Any change after generating makes the downloaded files outdated.
form.addEventListener('input', (e) => {
  if (e.target.matches('.amount') || e.target.name === 'currency') updateTotal();
  if (e.target.getAttribute('aria-invalid')) {
    e.target.removeAttribute('aria-invalid');
    document.getElementById(e.target.getAttribute('aria-describedby'))?.remove();
  }
  invalidateResult();
  refresh();
});
form.addEventListener('change', (e) => {
  if (e.target.name === 'paymentSlip') syncBankState();
  if (e.target === programmeEl) syncProgramme();
  if (e.target.name === 'currency') updateTotal();
  refresh();
});

addRow();
syncBankState();
syncProgramme();
refresh();
