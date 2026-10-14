// Lectura de documentos en el navegador: texto, PDF (con pdf.js) y Word (.docx).
// Nada se sube a internet: el texto se extrae aquí y se envía solo a tu propio servidor.

const DOC_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.html', '.htm', '.xml', '.pdf', '.docx'];

async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractPdf(file);
  if (name.endsWith('.docx')) return extractDocx(file);
  if (name.endsWith('.doc')) throw new Error('Los .doc antiguos no se pueden leer. Guárdalo como .docx o PDF.');
  if (DOC_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    const text = await file.text();
    return name.endsWith('.html') || name.endsWith('.htm')
      ? new DOMParser().parseFromString(text, 'text/html').body.innerText
      : text;
  }
  throw new Error(`Formato no soportado. Usa: ${DOC_EXTENSIONS.join(', ')}`);
}

// PDF: pdf.js se carga solo la primera vez que hace falta
let pdfjs = null;
async function extractPdf(file) {
  if (!pdfjs) {
    pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.mjs';
  }
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    let line = '';
    for (const item of content.items) {
      line += item.str + (item.hasEOL ? '\n' : '');
    }
    pages.push(line);
  }
  const text = pages.join('\n\n');
  if (!text.trim()) throw new Error('Este PDF no tiene texto seleccionable (¿es un documento escaneado o una imagen?).');
  return text;
}

// DOCX: es un ZIP; leemos word/document.xml con el descompresor nativo del navegador
async function extractDocx(file) {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Fin del directorio central (firma 0x06054b50), buscando desde el final
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo .docx está dañado.');

  const entries = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  for (let n = 0; n < entries; n++) {
    const method = view.getUint16(ptr + 10, true);
    const size = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

    if (name === 'word/document.xml') {
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const data = bytes.subarray(start, start + size);
      const xml =
        method === 0
          ? new TextDecoder().decode(data)
          : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      const plain = xml
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br\/>|<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '');
      return new DOMParser().parseFromString(plain, 'text/html').documentElement.textContent;
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('No se encontró el texto dentro del .docx.');
}

// Palabras más frecuentes (sin palabras vacías): pistas para que el modelo elija mejor las palabras clave
const STOPWORDS = new Set(
  `para como pero más esta este esto estos estas entre sobre también desde hasta donde cuando porque según
  todo todos toda todas otro otra otros otras cada mismo misma puede pueden debe deben tiene tienen hace hacen
  ser sido está están estaba fueron será sus del las los una uno unos unas que con por sin muy ya hay fue han
  había sea son les nos ese esa eso esos esas aquí allí así bien solo sólo cual cuales quien quienes cómo qué
  mientras durante tanto tras ante bajo dicho dicha parte forma vez veces año años además embargo través
  the and that this with from have were which their there been will would could should about into than them
  they these those then also more most other some such only over very what when where while your just`.split(/\s+/),
);

function topWords(text, limit = 15) {
  const counts = new Map();
  for (const word of text.toLowerCase().match(/\p{L}{4,}/gu) || []) {
    if (!STOPWORDS.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

// Divide un texto largo en trozos de ~size caracteres, cortando en saltos de párrafo o de frase
function splitText(text, size) {
  const chunks = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < size * 0.5) cut = rest.lastIndexOf('. ', size) + 1;
    if (cut < size * 0.5) cut = size;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  if (rest.trim()) chunks.push(rest.trim());
  return chunks;
}
