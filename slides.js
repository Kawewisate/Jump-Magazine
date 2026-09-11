// สไลด์นำเสนอ (16:9) จากเนื้อหาบทเรียนฉบับเต็ม — แบ่งสไลด์ที่หัวข้อ h1/h2/h3
// วัดความสูงจริงในสเตจซ่อนขนาด 1280x720 แล้วดันบล็อกที่ล้นไปสไลด์ถัดไป (ต่อ)

const SLIDE_W = 1280;
const SLIDE_H = 720;
const SLIDE_CONTENT_H = 560; // เผื่อ header/padding

let slideState = { slides: [], index: 0, title: '' };

function getSlideEls() {
  return {
    overlay: document.getElementById('slide-overlay'),
    viewport: document.getElementById('slide-viewport'),
    stage: document.getElementById('slide-stage'),
    counter: document.getElementById('slide-counter'),
    prevBtn: document.getElementById('slide-prev'),
    nextBtn: document.getElementById('slide-next'),
    closeBtn: document.getElementById('slide-close'),
    fullscreenBtn: document.getElementById('slide-fullscreen'),
    pdfBtn: document.getElementById('slide-pdf'),
  };
}

function wireSlideEvents() {
  const el = getSlideEls();
  el.closeBtn.addEventListener('click', closeSlideView);
  el.prevBtn.addEventListener('click', () => gotoSlide(slideState.index - 1));
  el.nextBtn.addEventListener('click', () => gotoSlide(slideState.index + 1));
  el.fullscreenBtn.addEventListener('click', toggleSlideFullscreen);
  el.pdfBtn.addEventListener('click', exportSlidesPdf);
  document.addEventListener('keydown', (e) => {
    if (el.overlay.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); gotoSlide(slideState.index + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); gotoSlide(slideState.index - 1); }
    else if (e.key === 'Escape') { closeSlideView(); }
  });
  window.addEventListener('resize', fitSlideViewport);
}
document.addEventListener('DOMContentLoaded', wireSlideEvents);

// สร้าง DOM สไลด์ทั้งหมดจาก markdown ฉบับเต็ม แล้วเปิด overlay
async function openSlideView(title, markdownText) {
  const el = getSlideEls();
  el.overlay.classList.remove('hidden');
  el.stage.innerHTML = '<div class="slide-loading">กำลังจัดสไลด์...</div>';

  try {
    slideState = await buildSlides(title, markdownText);
  } catch (err) {
    el.stage.innerHTML = `<div class="slide-loading">สร้างสไลด์ไม่สำเร็จ: ${escapeHtml(err.message || String(err))}</div>`;
    return;
  }
  slideState.index = 0;
  renderAllSlides();
  gotoSlide(0);
  fitSlideViewport();
}

function closeSlideView() {
  const el = getSlideEls();
  el.overlay.classList.add('hidden');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function toggleSlideFullscreen() {
  const el = getSlideEls();
  if (!document.fullscreenElement) {
    el.overlay.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
  setTimeout(fitSlideViewport, 150);
}

async function buildSlides(title, markdownText) {
  // measuring stage นอกจอ ขนาดจริง 1280x720 เพื่อให้ scrollHeight สะท้อนของจริง
  const measure = document.createElement('div');
  measure.className = 'slide-measure';
  measure.style.cssText = `position:fixed; left:-9999px; top:0; width:${SLIDE_W}px;`;
  document.body.appendChild(measure);

  const bodyHtml = markdownToSafeHtml(markdownText || '');
  const parsed = document.createElement('div');
  parsed.innerHTML = bodyHtml;
  measure.appendChild(parsed);
  if (window.renderMathInElement) {
    renderMathInElement(parsed, { delimiters: MATH_DELIMITERS, throwOnError: false, strict: false });
  }
  if (window.renderDiagramsIn) {
    await renderDiagramsIn(parsed);
  }

  const topNodes = Array.from(parsed.children);
  const slides = [];
  let current = null;

  function newSlide(heading) {
    current = { heading: heading || '', nodes: [] };
    slides.push(current);
  }

  // สไลด์แรก: title slide
  slides.push({ heading: title, nodes: [], isTitle: true });

  topNodes.forEach((node) => {
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    if ((tag === 'h1' || tag === 'h2' || tag === 'h3') && node.textContent.trim()) {
      newSlide(node.textContent.trim());
    } else {
      if (!current) newSlide('');
      current.nodes.push(node);
    }
  });

  // หัวข้อที่ตามด้วยหัวข้อย่อยทันที (ไม่มีเนื้อหาคั่น) จะไม่มีตัวเอง — ยุบรวมเป็นสไลด์เดียวกับหัวข้อถัดไป
  // (เช่น h1 ชื่อเรื่องตามด้วย h2 หัวข้อแรกทันที ไม่ต้องมีสไลด์ห้วนๆ คั่นกลาง)
  const nonEmpty = slides.filter((s, i) => s.isTitle || s.nodes.length > 0 || i === slides.length - 1);

  // วัดความสูงจริงของแต่ละ node แล้วแบ่งสไลด์ที่ล้น (สร้างสไลด์ "(ต่อ)" ต่อจากหัวข้อเดิม)
  const measured = [];
  for (const slide of nonEmpty) {
    if (slide.isTitle || !slide.nodes.length) {
      measured.push(slide);
      continue;
    }
    let chunks = [{ heading: slide.heading, nodes: [] }];
    let heightSoFar = 0;
    const probe = document.createElement('div');
    probe.className = 'slide-body-probe';
    probe.style.cssText = `width:${SLIDE_W - 160}px;`;
    measure.appendChild(probe);
    for (const node of slide.nodes) {
      probe.appendChild(node.cloneNode(true));
      const h = probe.scrollHeight;
      const nodeH = h - heightSoFar;
      if (heightSoFar > 0 && heightSoFar + nodeH > SLIDE_CONTENT_H) {
        chunks.push({ heading: slide.heading + '(ต่อ)', nodes: [] });
        probe.innerHTML = '';
        probe.appendChild(node.cloneNode(true));
        heightSoFar = probe.scrollHeight;
      } else {
        heightSoFar = h;
      }
      chunks[chunks.length - 1].nodes.push(node);
    }
    probe.remove();
    measured.push(...chunks);
  }

  document.body.removeChild(measure);
  return { slides: measured, index: 0, title };
}

function renderAllSlides() {
  const el = getSlideEls();
  el.stage.innerHTML = '';
  slideState.slides.forEach((slide, i) => {
    const div = document.createElement('div');
    div.className = 'slide-page';
    div.dataset.index = i;
    const bar = document.createElement('div');
    bar.className = 'slide-accent-bar';
    div.appendChild(bar);
    if (slide.isTitle) {
      const h = document.createElement('h1');
      h.className = 'slide-title-text';
      h.textContent = slide.heading;
      div.appendChild(h);
      const sub = document.createElement('div');
      sub.className = 'slide-subtitle';
      sub.textContent = 'สื่อการสอนโดย ผู้ช่วยครู AI';
      div.appendChild(sub);
    } else {
      if (slide.heading) {
        const h = document.createElement('h2');
        h.className = 'slide-heading';
        h.textContent = slide.heading;
        div.appendChild(h);
      }
      const body = document.createElement('div');
      body.className = 'slide-body markdown-body';
      slide.nodes.forEach((n) => body.appendChild(n.cloneNode(true)));
      div.appendChild(body);
    }
    el.stage.appendChild(div);
  });
}

function gotoSlide(i) {
  const total = slideState.slides.length;
  if (total === 0) return;
  slideState.index = Math.max(0, Math.min(total - 1, i));
  const el = getSlideEls();
  Array.from(el.stage.children).forEach((c, idx) => {
    c.classList.toggle('active', idx === slideState.index);
  });
  el.counter.textContent = `${slideState.index + 1} / ${total}`;
  el.prevBtn.disabled = slideState.index === 0;
  el.nextBtn.disabled = slideState.index === total - 1;
}

// scale ทั้งสเตจให้พอดีกับ viewport ปัจจุบัน (คงสัดส่วน 16:9)
function fitSlideViewport() {
  const el = getSlideEls();
  if (el.overlay.classList.contains('hidden')) return;
  const vw = el.viewport.clientWidth;
  const vh = el.viewport.clientHeight;
  const scale = Math.min(vw / SLIDE_W, vh / SLIDE_H);
  el.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

async function exportSlidesPdf() {
  const el = getSlideEls();
  const btn = el.pdfBtn;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ กำลังสร้าง PDF...';
  const container = document.createElement('div');
  slideState.slides.forEach((_, i) => {
    const page = el.stage.children[i].cloneNode(true);
    page.classList.add('slide-pdf-page');
    page.style.transform = 'none';
    container.appendChild(page);
  });
  document.body.appendChild(container);
  const opt = {
    filename: sanitizeFilename(slideState.title || 'สไลด์') + '.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'px', format: [SLIDE_W, SLIDE_H], orientation: 'landscape' },
    pagebreak: { mode: ['css'], before: '.slide-pdf-page' },
    margin: 0,
  };
  try {
    await html2pdf().set(opt).from(container).save();
  } catch (err) {
    alert('สร้าง PDF สไลด์ไม่สำเร็จ: ' + err.message);
  } finally {
    document.body.removeChild(container);
    btn.disabled = false;
    btn.textContent = original;
  }
}
