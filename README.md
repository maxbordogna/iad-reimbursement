# Reimbursement form helper

A static web page that lets students fill in the ZHdK payment order (*Zahlungsauftrag*) without Adobe Acrobat. It produces two PDFs, offered in two steps (the second unlocks once the student confirms the preview):

- **Official form** (`…_FOR_FINANCE.pdf`): the original ZHdK XFA form, filled in, emailed to the finance person of the programme (opens in Adobe Acrobat).
- **Preview** (`…_PREVIEW_do_not_submit.pdf`): a flat PDF redrawn from the form's layout, so students can check their entries in any PDF viewer.

Every expense needs two uploads (photo or PDF): the receipt (*Beleg*) and the bank movement (*Kontobewegung*). They become one page per expense, appended to the preview and embedded in the official form as a file attachment (`…_Belege.pdf`). If the student ticks the payment-slip option, the slip is required too: it comes first in the preview and is a separate attachment (`…_Einzahlungsschein.pdf`) in the official form. Acrobat opens the attachments panel automatically. Acrobat draws XFA pages from the template and ignores appended PDF pages, so an attachment is the only way to include them in the official file.

Everything runs in the browser. No data is uploaded or stored; the only outside request is the purchase date sent to the BAZG to look up an exchange rate.

## How the official form is filled

The form's fields are declared with `bind match="none"`, so the XFA data packet is ignored. Acrobat restores field values from the saved form state (the XFA `form` packet) as long as its checksum matches the unchanged template. `js/xfa-fill.js` writes a new form packet with the original checksum and appends it as an incremental update, the same way Acrobat saves a filled form. Attachments are registered in the document's `Names` dictionary. The catalog, which carries Adobe's Reader-rights signature, is copied byte for byte with only `/PageMode/UseAttachments` added, so Acrobat opens the attachments panel.

## Files

- `index.html`, `styles.css`, `js/app.js`: the form UI and validation
- `js/xfa-fill.js`: fills the official XFA form
- `js/preview.js`: draws the preview PDF (coordinates taken from the XFA template) and the receipt pages
- `js/uploads.js`: reads uploaded photos (scaled down to 2000 px) and PDFs
- `js/exchange.js`: converts expenses paid in another currency at the official BAZG daily rate of the purchase date (reads the data feed behind [rates.bazg.admin.ch](https://www.rates.bazg.admin.ch/home); only the date is sent). If the feed fails, students convert by hand.
- `js/options.js`: **editable lists**: programmes ("Other" is added automatically) and country calling codes
- `assets/iad-logo.svg`, `assets/zhdk-logo-en.svg`: Interaction Design and ZHdK logos at the top of the page
- `assets/Zahlungsauftrag_blank.pdf`: the blank official form
- `vendor/pdf-lib.min.js`: [pdf-lib](https://pdf-lib.js.org) 1.17.1 (MIT)
- `tools/test.mjs`: generates both PDFs from sample data (`node tools/test.mjs <outDir>`)
- `tools/check_xref.py`: strictly checks the official file's cross-reference table (`python3 tools/check_xref.py assets/Zahlungsauftrag_blank.pdf <filled.pdf>`). Run it after any change to `xfa-fill.js`; Acrobat rejects files with broken object offsets ("error 43").

## Run locally

```bash
python3 -m http.server 8936
```

Then open http://localhost:8936. The page has to be served over HTTP, since opening `index.html` as a file blocks loading the PDF.

## If ZHdK updates the form

Replace `assets/Zahlungsauftrag_blank.pdf`, run `tools/test.mjs`, and open the official output in Acrobat. If fields were renamed or moved, update `js/xfa-fill.js` (field names) and `js/preview.js` (positions).
