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
  const protectedText = markdownText.replace(CODE_OR_MATH_PATTERN, (match, code, math) => {
    if (code) return code;
    mathSegments.push(math);
    return `%%MATH${mathSegments.length - 1}%%`;
  });
  const html = DOMPurify.sanitize(marked.parse(protectedText));
  return html.replace(/%%MATH(\d+)%%/g, (_, i) => escapeHtml(mathSegments[Number(i)]));
}

function renderMarkdownWithMath(container, markdownText) {
  const text = markdownText || '';
  if (window.marked && window.DOMPurify) {
    container.innerHTML = markdownToSafeHtml(text);
  } else {
    // CDN โหลดไม่ขึ้น: แสดงเป็นข้อความล้วน ห้ามยัด HTML จากโมเดลลงหน้าเว็บโดยไม่ผ่าน sanitize
    container.innerHTML = `<div style="white-space: pre-wrap">${escapeHtml(text)}</div>`;
  }
  if (window.renderMathInElement) {
    renderMathInElement(container, {
      delimiters: MATH_DELIMITERS,
      throwOnError: false,
      strict: false,
    });
  }
}

function openPrintPreview(title, markdownText) {
  document.getElementById('print-title').textContent = title;
  renderMarkdownWithMath(document.getElementById('print-body'), markdownText);
  document.getElementById('print-overlay').classList.remove('hidden');
}

function closePrintPreview() {
  document.getElementById('print-overlay').classList.add('hidden');
}

function sanitizeFilename(name) {
  return (name || 'เอกสาร').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'เอกสาร';
}

// สร้างไฟล์ PDF ตรงจากเนื้อหาในพรีวิว ด้วย html2pdf.js (html2canvas + jsPDF)
// เลือกวิธีนี้แทนการพึ่ง window.print()/Ctrl+P เพราะเบราว์เซอร์ (โดยเฉพาะ Chrome)
// มีบั๊กเรื่องการแบ่งหน้าพิมพ์กับ element ที่ตั้ง overflow ไว้ ทำให้ได้ PDF หน้าเปล่า/ไม่ครบ
// วิธีนี้ควบคุมการแบ่งหน้าเองทั้งหมด ไม่พึ่ง print engine ของเบราว์เซอร์
function exportPdf() {
  const pageEl = document.getElementById('print-page');
  const btn = document.getElementById('print-btn');
  const titleText = document.getElementById('print-title').textContent;
  const filename = sanitizeFilename(titleText) + '.pdf';

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ กำลังสร้าง PDF...';
  pageEl.classList.add('exporting-pdf');

  const opt = {
    filename,
    // ขอบกระดาษต้องตั้งที่ html2pdf (ใช้กับทุกหน้า) — padding ของ element มีผลแค่ต้นหน้าแรกกับท้ายหน้าสุดท้าย
    margin: [15, 15, 15, 15],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  return html2pdf()
    .set(opt)
    .from(pageEl)
    .save()
    .catch((err) => {
      alert('สร้าง PDF ไม่สำเร็จ: ' + err.message);
    })
    .finally(() => {
      pageEl.classList.remove('exporting-pdf');
      btn.disabled = false;
      btn.textContent = originalLabel;
    });
}
