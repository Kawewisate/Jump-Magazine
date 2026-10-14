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

// renderDiagrams=false ใช้ตอน stream ข้อความสดๆ (ยังไม่อยากวาดรูปซ้ำๆ ระหว่างพิมพ์)
function renderMarkdownWithMath(container, markdownText, { renderDiagrams = true } = {}) {
  const text = markdownText || '';
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
  if (renderDiagrams && window.renderDiagramsIn) {
    return renderDiagramsIn(container);
  }
  container.diagramsReady = Promise.resolve();
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

// html2pdf (~1 MB) โหลดตอนกดสร้าง PDF ครั้งแรกเท่านั้น; ใช้ร่วมกับ slides.js
async function ensureHtml2pdf() {
  if (typeof window.html2pdf !== 'function') {
    try {
      await loadScriptOnce('https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js');
    } catch {
      // ตกไปที่ข้อความ error ด้านล่าง
    }
  }
  if (typeof window.html2pdf !== 'function') throw new Error('ไม่พบไลบรารีสร้าง PDF กรุณารีโหลดหน้าแล้วลองใหม่');
}

// เอกสาร PDF ใช้ html2canvas + jsPDF ตรงๆ (ไม่ผ่าน html2pdf) เพื่อคุมจุดตัดหน้าเอง
async function ensurePdfLibs() {
  try {
    await Promise.all([
      typeof window.html2canvas === 'function'
        || loadScriptOnce('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'),
      (window.jspdf && window.jspdf.jsPDF)
        || loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'),
    ]);
  } catch {
    // ตกไปที่ข้อความ error ด้านล่าง
  }
  if (typeof window.html2canvas !== 'function' || !(window.jspdf && window.jspdf.jsPDF)) {
    throw new Error('ไม่พบไลบรารีสร้าง PDF กรุณารีโหลดหน้าแล้วลองใหม่');
  }
}

const PDF_MM_TO_PX = 96 / 25.4;
const PDF_MARGIN_MM = 15;
const PDF_CONTENT_W_MM = 210 - PDF_MARGIN_MM * 2;
const PDF_CONTENT_H_MM = 297 - PDF_MARGIN_MM * 2;
const PDF_SCALE = 2;
// canvas ของ Chrome สูงได้ไม่เกิน ~32k px จึง render ทีละก้อนหลายหน้า แทนการถ่ายทั้งเอกสารรวดเดียว
const PDF_CHUNK_MAX_PX = 7000;

// กล่องที่ห้ามตัดกลาง: บรรทัดข้อความทีละบรรทัด + สูตร/รูป/แถวตาราง ทั้งก้อน (พิกัดเทียบขอบบนของหน้า)
function collectUnbreakableRects(root) {
  const originTop = root.getBoundingClientRect().top;
  const rects = [];
  const push = (r) => {
    if (r.height > 0 && r.width > 0) rects.push({ top: r.top - originTop, bottom: r.bottom - originTop });
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.trim()) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) push(r);
  }
  root.querySelectorAll('img, svg, canvas, hr, tr, .katex, .katex-display, figure.diagram').forEach((el) => {
    push(el.getBoundingClientRect());
  });
  return rects;
}

// html2canvas วาด SVG inline แล้วโดนครอปขอบขวาหาย จึงแปลงรูป diagram เป็น <img> ขนาดเท่าที่แสดงจริงก่อน
// (ข้าม SVG ที่มี foreignObject เพราะวาดลง canvas แล้ว canvas จะ taint ส่งออกไม่ได้)
async function rasterizeSvgsForPdf(root) {
  const jobs = [];
  root.querySelectorAll('svg').forEach((svg) => {
    if (svg.parentElement.closest('svg, .katex') || svg.querySelector('foreignObject')) return;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const style = getComputedStyle(svg);
    const copy = svg.cloneNode(true);
    copy.setAttribute('width', r.width);
    copy.setAttribute('height', r.height);
    if (!copy.getAttribute('xmlns')) copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    img.style.cssText = `display:${style.display === 'inline' ? 'inline-block' : style.display};width:${r.width}px;height:${r.height}px;margin:${style.margin};vertical-align:${style.verticalAlign}`;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
    jobs.push(img.decode().then(() => svg.replaceWith(img), () => {}));
  });
  await Promise.all(jobs);
}

// หาจุดตัดหน้า: ตัดได้เฉพาะช่องว่างระหว่างบรรทัด และไม่ปล่อยหัวข้อค้างไว้ท้ายหน้าโดยไม่มีเนื้อหาตาม
// rects/headings = [{top,bottom}] หน่วย px; คืน [[start,end], ...] ของแต่ละหน้า
function computePageSlices(rects, headings, totalHeight, pageHeight) {
  const sorted = rects.slice().sort((a, b) => a.top - b.top);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.top < last.bottom) last.bottom = Math.max(last.bottom, r.bottom);
    else merged.push({ top: r.top, bottom: r.bottom });
  }
  // ช่องว่างที่ตัดได้ (ระหว่างก้อนเนื้อหาที่ติดกัน)
  const gaps = [];
  for (let i = 1; i < merged.length; i++) {
    gaps.push({ top: merged[i - 1].bottom, bottom: merged[i].top });
  }
  const cutInGap = (gap, limit) => Math.min((gap.top + gap.bottom) / 2, limit);
  const minPage = pageHeight * 0.3;

  const slices = [];
  let start = 0;
  while (totalHeight - start > pageHeight + 0.5) {
    const limit = start + pageHeight;
    let cut = null;
    for (let i = gaps.length - 1; i >= 0; i--) {
      const gap = gaps[i];
      if (gap.top >= limit) continue;
      if (gap.top <= start + 1) break;
      cut = cutInGap(gap, limit);
      // หัวข้อที่เป็นเนื้อหาสุดท้ายก่อนจุดตัด → ย้ายหัวข้อไปขึ้นหน้าใหม่พร้อมเนื้อหา
      const orphan = headings.find((h) => h.top > start + minPage && h.bottom <= gap.top + 0.5 && h.bottom >= gap.top - 0.5);
      if (orphan) {
        const before = gaps.slice(0, i).reverse().find((g) => g.bottom <= orphan.top + 0.5);
        if (before && before.top > start + minPage) cut = cutInGap(before, limit);
      }
      break;
    }
    // ไม่มีช่องให้ตัดเลย (เช่นรูปเดียวสูงเกินหน้า) → จำใจตัดที่ขอบหน้า
    if (cut == null || cut <= start + 1) cut = limit;
    slices.push([start, cut]);
    start = cut;
  }
  slices.push([start, totalHeight]);
  return slices;
}

// สร้างไฟล์ PDF ตรงจากเนื้อหาในพรีวิว ด้วย html2canvas + jsPDF
// ไม่พึ่ง window.print()/Ctrl+P เพราะ Chrome มีบั๊กแบ่งหน้าพิมพ์กับ element ที่ตั้ง overflow ไว้
// และไม่ใช้วิธี html2pdf ที่หั่นภาพยาวทุกๆ 297mm แบบไม่ดูเนื้อหา (บรรทัดโดนตัดครึ่งระหว่างหน้า)
async function exportPdf() {
  const pageEl = document.getElementById('print-page');
  const btn = document.getElementById('print-btn');
  const titleText = document.getElementById('print-title').textContent;
  const filename = sanitizeFilename(titleText) + '.pdf';

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ กำลังสร้าง PDF...';
  let host = null;
  try {
    await ensurePdfLibs();
    const printBody = document.getElementById('print-body');
    if (printBody.diagramsReady) await printBody.diagramsReady.catch(() => {});
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    // จัดหน้าใหม่บนสำเนาที่กว้างเท่าพื้นที่พิมพ์ A4 จริง (สำเนาใช้ id เดิมเพื่อให้ CSS เดิมยังมีผล)
    const contentW = PDF_CONTENT_W_MM * PDF_MM_TO_PX;
    const pageH = PDF_CONTENT_H_MM * PDF_MM_TO_PX;
    host = document.createElement('div');
    host.className = 'pdf-export-host';
    host.style.width = contentW + 'px';
    const clone = pageEl.cloneNode(true);
    clone.classList.add('exporting-pdf');
    clone.querySelectorAll('.diagram-edit-btn').forEach((b) => b.remove());
    const srcCanvases = pageEl.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((c, i) => {
      const src = srcCanvases[i];
      if (src && src.width && src.height) c.getContext('2d').drawImage(src, 0, 0);
    });
    host.appendChild(clone);
    document.body.appendChild(host);

    await rasterizeSvgsForPdf(clone);

    // สูตร display ที่ยาวเกินความกว้างกระดาษ: ย่อฟอนต์ให้พอดีแทนการโดนตัดขอบขวา
    clone.querySelectorAll('.katex-display').forEach((d) => {
      const k = d.querySelector('.katex');
      if (k && k.scrollWidth > d.clientWidth + 1) {
        const size = parseFloat(getComputedStyle(k).fontSize);
        k.style.fontSize = (size * d.clientWidth / k.scrollWidth * 0.98) + 'px';
      }
    });

    const totalH = Math.ceil(clone.getBoundingClientRect().height);
    const originTop = clone.getBoundingClientRect().top;
    const headings = Array.from(clone.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => {
      const r = h.getBoundingClientRect();
      return { top: r.top - originTop, bottom: r.bottom - originTop };
    });
    // ใช้กล่องของบรรทัดหัวข้อจริง (ไม่รวม margin) เป็นตัวเทียบกับช่องว่าง
    const rects = collectUnbreakableRects(clone);
    const headingLines = headings.map((h) => {
      const inside = rects.filter((r) => r.top >= h.top - 0.5 && r.bottom <= h.bottom + 0.5);
      return inside.length
        ? { top: Math.min(...inside.map((r) => r.top)), bottom: Math.max(...inside.map((r) => r.bottom)) }
        : h;
    });
    const slices = computePageSlices(rects, headingLines, totalH, pageH);

    // รวมหน้าที่ติดกันเป็นก้อนเพื่อ render ทีละก้อน
    const chunks = [];
    for (const slice of slices) {
      const last = chunks[chunks.length - 1];
      if (last && slice[1] - last.start <= PDF_CHUNK_MAX_PX) last.slices.push(slice);
      else chunks.push({ start: slice[0], slices: [slice] });
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    let first = true;
    for (const chunk of chunks) {
      const end = chunk.slices[chunk.slices.length - 1][1];
      host.style.height = Math.ceil(end - chunk.start) + 'px';
      clone.style.marginTop = -chunk.start + 'px';
      const canvas = await html2canvas(host, {
        scale: PDF_SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });
      for (const [s, e] of chunk.slices) {
        const sy = Math.round((s - chunk.start) * PDF_SCALE);
        const sh = Math.min(Math.round((e - s) * PDF_SCALE), canvas.height - sy);
        if (sh <= 0) continue;
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sh;
        const ctx = pageCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, sh);
        ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
        if (!first) pdf.addPage();
        first = false;
        const hMm = sh / PDF_SCALE / PDF_MM_TO_PX;
        pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', PDF_MARGIN_MM, PDF_MARGIN_MM, PDF_CONTENT_W_MM, hMm);
      }
    }
    pdf.save(filename);
  } catch (err) {
    alert('สร้าง PDF ไม่สำเร็จ: ' + (err.message || String(err)));
  } finally {
    if (host) host.remove();
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}
