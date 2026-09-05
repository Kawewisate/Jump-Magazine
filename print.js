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
