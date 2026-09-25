// Turns an uploaded file into a document the PDF builders can embed:
// { kind: 'image' | 'pdf', bytes, mime, page, pageCount, name, thumbUrl }
// Photos are scaled down (phone photos are often 10+ MB) and re-encoded as JPEG;
// PDFs are checked so problems show up at upload time rather than when generating.

const MAX_SIDE = 2000; // px, plenty for a receipt on half an A4 page
const MAX_FILE = 30 * 1024 * 1024;

export class UploadError extends Error {}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

async function decodeImage(file) {
  try {
    return await createImageBitmap(file); // applies EXIF rotation
  } catch {
    // Fallback for browsers where createImageBitmap can't read the file
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new UploadError("This image can't be read. Please upload a JPG, PNG or PDF (iPhone HEIC photos: export them as JPG).");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

async function prepareImage(file) {
  const img = await decodeImage(file);
  const w = img.width;
  const h = img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (img.close) img.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return {
    kind: 'image',
    mime: 'image/jpeg',
    bytes: new Uint8Array(await blob.arrayBuffer()),
    page: 0,
    pageCount: 1,
    name: file.name,
    thumbUrl: URL.createObjectURL(blob),
  };
}

async function preparePdf(PDFLib, file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pageCount;
  try {
    const src = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    pageCount = src.getPageCount();
    // Make sure its pages can actually be embedded later
    const test = await PDFLib.PDFDocument.create();
    await test.embedPdf(src, [0]);
  } catch (err) {
    if (/encrypt/i.test(err.message)) {
      throw new UploadError('This PDF is password-protected and can’t be used. Please upload a screenshot of it instead.');
    }
    throw new UploadError('This PDF can’t be read. Please upload a screenshot of it instead.');
  }
  if (!pageCount) throw new UploadError('This PDF has no pages.');
  return { kind: 'pdf', mime: 'application/pdf', bytes, page: 0, pageCount, name: file.name, thumbUrl: null };
}

export async function prepareUpload(PDFLib, file) {
  if (file.size > MAX_FILE) throw new UploadError('This file is larger than 30 MB. Please upload a smaller photo or PDF.');
  if (isPdf(file)) return preparePdf(PDFLib, file);
  if (file.type && !file.type.startsWith('image/')) {
    throw new UploadError('Please upload a photo (JPG, PNG) or a PDF.');
  }
  return prepareImage(file);
}
