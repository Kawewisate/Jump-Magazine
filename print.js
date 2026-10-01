// แปลงเนื้อหา markdown ที่ AI เจนมาเป็น HTML พรีวิวจัดหน้าสวย แล้วเปิดให้ครูสั่งพิมพ์/บันทึกเป็น PDF เอง

const MATH_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
];

// กลุ่ม 1 = code block / inline code (ปล่อยไว้ตามเดิม), กลุ่ม 2 = สูตร ($$..$$, \[..\], \(..\), $..$)
const CODE_OR_MATH_PATTERN =
  /(```[\s\S]*?```|`[^`\n]+`)|(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?!\s)(?:\\.|[^$\\\n])+\$)/g;

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ต้องดึงสูตรออกก่อนส่งให้ marked ไม่งั้น marked จะกิน backslash escape (\\ → \, \{ → {)
// และตีความ * _ ในสูตรเป็นตัวเอียง ทำให้ KaTeX เรนเดอร์สูตรพัง แล้วค่อยใส่สูตรเดิมกลับหลัง sanitize
function markdownToSafeHtml(markdownText) {
  const mathSegments = [];
  const input = String(markdownText || '');
  let placeholderPrefix = '\uE000MATH_';
  while (input.includes(placeholderPrefix)) placeholderPrefix += '_';
  const protectedText = input.replace(CODE_OR_MATH_PATTERN, (match, code, math) => {
    if (code) return code;
    mathSegments.push(math);
    return `${placeholderPrefix}${mathSegments.length - 1}\uE001`;
  });
  const html = DOMPurify.sanitize(marked.parse(protectedText));
  const placeholderPattern = new RegExp(`${placeholderPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)\\uE001`, 'g');
  return html.replace(placeholderPattern, (_, i) => {
    const segment = mathSegments[Number(i)];
    return segment == null ? _ : escapeHtml(segment);
  });
}

// แคชผล render ที่เสร็จสมบูรณ์ (markdown → HTML + สูตร KaTeX + รูปประกอบ) แบบ LRU
// renderChatView วาดทุกข้อความใหม่หมดทุกครั้งที่สลับงาน/เริ่ม-จบการเจน/แก้รูป ถ้าไม่แคชจะ parse + วาดสูตร + วาดรูปซ้ำทุกรอบ
const RENDER_CACHE_MAX = 16;
const renderCache = new Map(); // markdown -> DocumentFragment (ไม่มีปุ่มแก้รูป)
let renderSeq = 0;

function storeRenderCache(text, container) {
  // รูปที่วาดไม่สำเร็จ (เช่น CDN ล่ม) ไม่แคช เพื่อให้รอบหน้าลองวาดใหม่ได้
  if (container.querySelector('.diagram-fallback')) return;
  const frag = document.createDocumentFragment();
  container.childNodes.forEach((node) => frag.appendChild(node.cloneNode(true)));
  frag.querySelectorAll('.diagram-edit-btn').forEach((btn) => btn.remove());
  renderCache.delete(text);
  renderCache.set(text, frag);
  if (renderCache.size > RENDER_CACHE_MAX) renderCache.delete(renderCache.keys().next().value);
}

// renderDiagrams=false ใช้ตอน stream ข้อความสดๆ (ยังไม่อยากวาดรูปซ้ำๆ ระหว่างพิมพ์)
function renderMarkdownWithMath(container, markdownText, { renderDiagrams = true } = {}) {
  const text = markdownText || '';
  const seq = ++renderSeq;
  container._renderSeq = seq;

  const cached = renderDiagrams && text ? renderCache.get(text) : null;
  if (cached) {
    renderCache.delete(text); // ย้ายไปท้ายสุด (ใช้ล่าสุด)
    renderCache.set(text, cached);
    container.replaceChildren(cached.cloneNode(true));
    container.diagramsReady = Promise.resolve();
    return container.diagramsReady;
  }

  if (window.marked && window.DOMPurify) {
    container.innerHTML = markdownToSafeHtml(text);
  } else {
    // CDN โหลดไม่ขึ้น: แสดงเป็นข้อความล้วน ห้ามยัด HTML จากโมเดลลงหน้าเว็บโดยไม่ผ่าน sanitize
    container.innerHTML = `<div style="white-space: pre-wrap">${escapeHtml(text)}</div>`;
  }
  // KaTeX ก่อน (auto-render ข้าม pre/code โดยธรรมชาติ จึงไม่ยุ่งกับ JSON ของ diagram)
  if (window.renderMathInElement) {
    renderMathInElement(container, {
      delimiters: MATH_DELIMITERS,
      throwOnError: false,
      strict: false,
    });
  }
  // แล้วค่อยแปลงบล็อก ```diagram/```mermaid เป็นรูปจริง
  const ready = renderDiagrams && window.renderDiagramsIn ? renderDiagramsIn(container) : Promise.resolve();
  const cacheable = renderDiagrams && text && window.marked && window.DOMPurify;
  container.diagramsReady = cacheable
    ? Promise.resolve(ready).then(() => {
        // เก็บแคชเฉพาะเมื่อ container ยังเป็นผลของรอบนี้ (ไม่ถูก render ทับระหว่างรอรูป)
        if (container._renderSeq === seq) storeRenderCache(text, container);
      })
    : ready;
  return container.diagramsReady;
}

function openPrintPreview(title, markdownText) {
  document.getElementById('print-title').textContent = title;
  renderMarkdownWithMath(document.getElementById('print-body'), markdownText);
  const overlay = document.getElementById('print-overlay');
  if (window.MotionUI) window.MotionUI.openLayer(overlay);
  else overlay.classList.remove('hidden');
}

function closePrintPreview() {
  const overlay = document.getElementById('print-overlay');
  if (window.MotionUI) window.MotionUI.closeLayer(overlay);
  else overlay.classList.add('hidden');
}

function sanitizeFilename(name) {
  return (name || 'เอกสาร').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'เอกสาร';
}

// html2pdf.js (~900KB) โหลดตอนกดบันทึก PDF ครั้งแรกเท่านั้น
async function ensureHtml2pdf() {
  if (typeof html2pdf === 'function') return;
  await loadScriptOnce('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js');
  if (typeof html2pdf !== 'function') throw new Error('ไม่พบไลบรารีสร้าง PDF กรุณารีโหลดหน้าแล้วลองใหม่');
}

// สร้างไฟล์ PDF ตรงจากเนื้อหาในพรีวิว ด้วย html2pdf.js (html2canvas + jsPDF)
// เลือกวิธีนี้แทนการพึ่ง window.print()/Ctrl+P เพราะเบราว์เซอร์ (โดยเฉพาะ Chrome)
// มีบั๊กเรื่องการแบ่งหน้าพิมพ์กับ element ที่ตั้ง overflow ไว้ ทำให้ได้ PDF หน้าเปล่า/ไม่ครบ
// วิธีนี้ควบคุมการแบ่งหน้าเองทั้งหมด ไม่พึ่ง print engine ของเบราว์เซอร์
async function exportPdf() {
  const pageEl = document.getElementById('print-page');
  const btn = document.getElementById('print-btn');
  const titleText = document.getElementById('print-title').textContent;
  const filename = sanitizeFilename(titleText) + '.pdf';

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ กำลังสร้าง PDF...';
  try {
    await ensureHtml2pdf();
    const printBody = document.getElementById('print-body');
    if (printBody.diagramsReady) await printBody.diagramsReady.catch(() => {});
    pageEl.classList.add('exporting-pdf');
    const opt = {
      filename,
      margin: [15, 15, 15, 15],
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };
    await html2pdf().set(opt).from(pageEl).save();
  } catch (err) {
    alert('สร้าง PDF ไม่สำเร็จ: ' + (err.message || String(err)));
  } finally {
    pageEl.classList.remove('exporting-pdf');
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}
