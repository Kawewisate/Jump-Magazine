// แปลงเนื้อหา markdown ที่ AI เจนมาเป็น HTML พรีวิวจัดหน้าสวย แล้วเปิดให้ครูสั่งพิมพ์/บันทึกเป็น PDF เอง

function renderMarkdownWithMath(container, markdownText) {
  const rawHtml = marked.parse(markdownText || '');
  container.innerHTML = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
  if (window.renderMathInElement) {
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
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
    margin: 0,
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
