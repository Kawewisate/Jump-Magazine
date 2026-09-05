// แปลงไฟล์ที่ครูอัปโหลด (.pdf / .docx / .txt) ให้เป็นข้อความล้วน — ทำงานฝั่ง client ทั้งหมด

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

const MAX_ATTACHED_CHARS = 15000;

function truncateForPrompt(text) {
  if (text.length <= MAX_ATTACHED_CHARS) return text;
  return text.slice(0, MAX_ATTACHED_CHARS) + '\n...[ตัดเนื้อหาส่วนที่เหลือออก เพราะยาวเกินไป]';
}

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return text;
}

async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractTextFromFile(file) {
  const name = file.name.toLowerCase();
  let raw;
  if (name.endsWith('.txt')) {
    raw = await file.text();
  } else if (name.endsWith('.pdf')) {
    raw = await extractPdfText(file);
  } else if (name.endsWith('.docx')) {
    raw = await extractDocxText(file);
  } else {
    throw new Error('ไม่รองรับไฟล์ประเภทนี้ (รองรับเฉพาะ .pdf, .docx, .txt)');
  }
  return truncateForPrompt(raw.trim());
}
