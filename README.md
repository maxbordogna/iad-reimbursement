# Reimbursement form helper

A static web page that lets students fill in the ZHdK payment order (*Zahlungsauftrag*) without Adobe Acrobat. It produces two PDFs:

- **Official form**: the original ZHdK XFA form, filled in, for the finance staff (opens in Adobe Acrobat).
- **Preview**: a flat PDF redrawn from the form's layout, so students can check their entries in any PDF viewer.

Every expense needs two uploads (photo or PDF): the receipt (*Beleg*) and the bank movement (*Kontobewegung*). They become one page per expense, appended to the preview and embedded in the official form as a file attachment (`…_Belege.pdf`). If the student ticks the payment-slip option, the slip is required too: it comes first in the preview and is a separate attachment (`…_Einzahlungsschein.pdf`) in the official form. Acrobat opens the attachments panel automatically. Acrobat draws XFA pages from the template and ignores appended PDF pages, so an attachment is the only way to include them in the official file.

Everything runs in the browser. No data is uploaded or stored.

## How the official form is filled

The form's fields are declared with `bind match="none"`, so the XFA data packet is ignored. Acrobat restores field values from the saved form state (the XFA `form` packet) as long as its checksum matches the unchanged template. `js/xfa-fill.js` writes a new form packet with the original checksum and appends it as an incremental update, the same way Acrobat saves a filled form. Attachments are registered in the document's `Names` dictionary. The catalog, which carries Adobe's Reader-rights signature, is left untouched.

## Files

- `index.html`, `styles.css`, `js/app.js`: the form UI and validation
- `js/xfa-fill.js`: fills the official XFA form
- `js/preview.js`: draws the preview PDF (coordinates taken from the XFA template) and the receipt pages
- `js/uploads.js`: reads uploaded photos (scaled down to 2000 px) and PDFs
- `js/options.js`: **editable lists**: programmes and their courses (the *Reason for payment* dropdown), and country calling codes
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
