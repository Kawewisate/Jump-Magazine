// เครื่องมือกลางสำหรับ "รูปประกอบ" — โมเดลเขียนสเปค JSON สั้นๆ ใน ```diagram ... ```
// แล้วเบราว์เซอร์คำนวณตำแหน่ง/วาด SVG เองทั้งหมด (โมเดล flash ไม่ต้องคิดพิกัด)

const DIAGRAM_REGISTRY = {}; // type -> { type, aliases, guide, render }
const DIAGRAM_ALIASES = {}; // alias(lowercase) -> canonical type

const SVG_NS = 'http://www.w3.org/2000/svg';

class DiagramError extends Error {}

function registerDiagram({ type, aliases = [], guide, render }) {
  DIAGRAM_REGISTRY[type] = { type, aliases, guide, render };
  DIAGRAM_ALIASES[type.toLowerCase()] = type;
  aliases.forEach((a) => {
    DIAGRAM_ALIASES[a.toLowerCase()] = type;
  });
}

function resolveDiagramType(rawType) {
  if (!rawType) return null;
  const key = String(rawType).trim().toLowerCase();
  return DIAGRAM_ALIASES[key] || null;
}

// รวม guide ของทุก type ที่ลงทะเบียนไว้ เป็น prompt เดียว — กันไม่ให้ guide กับ renderer หลุดตรงกัน
function buildDiagramGuide() {
  const sections = Object.values(DIAGRAM_REGISTRY)
    .map((d) => `### type: "${d.type}"\n${d.guide.trim()}`)
    .join('\n\n');
  return `## วิธีใส่รูปประกอบ (diagram)

เมื่อต้องการรูปประกอบ ให้แทรกโค้ดบล็อกภาษา "diagram" ที่มี JSON object เดียว (ห้ามมีข้อความอื่นปนในบล็อก) รูปแบบ:

\`\`\`diagram
{"type": "...", ...}
\`\`\`

กติกาทั่วไป (สำคัญมาก):
- JSON ต้องถูกต้อง ใช้ " เท่านั้น ห้ามมี comment ห้ามมี trailing comma
- ห้ามใช้ LaTeX ในรูป ใช้ตัวอักษร/สัญลักษณ์ยูนิโค้ดแทน เช่น m1, m2, θ, Ω, x^2 → x², ลูกศร → →
- ตัวเลขที่ไม่รู้ค่า/โจทย์ให้หา ใช้ "?" หรือตัวแปรแทน
- ตัวเลขในรูปต้องตรงกับโจทย์ในเนื้อหาข้อความเสมอ
- แทรกรูปทันทีหลังประโยคที่พูดถึง "ดังรูป" หรือจุดที่ต้องใช้ภาพประกอบ
- ใช้รูปเท่าที่จำเป็นและช่วยความเข้าใจจริงๆ (ปกติ 3-8 รูปต่อบทเรียน) อย่าใส่พร่ำเพรื่อ ถ้าไม่มี type ไหนเหมาะ ให้ข้ามไปไม่ต้องฝืนใส่

ชนิดรูปที่รองรับ:

${sections}

หากต้องการ flowchart/อัลกอริทึมที่ซับซ้อน ใช้บล็อกภาษา "mermaid" (mermaid flowchart syntax มาตรฐาน) แทนได้เช่นกัน`;
}

// ---------- Tolerant parsing ----------

let json5Promise = null;
function loadJson5() {
  if (window.JSON5) return Promise.resolve(window.JSON5);
  if (!json5Promise) {
    json5Promise = loadScriptOnce('https://cdn.jsdelivr.net/npm/json5@2.2.3/dist/index.min.js').then(
      () => window.JSON5
    );
  }
  return json5Promise;
}

const scriptPromises = {};
function loadScriptOnce(url) {
  if (scriptPromises[url]) return scriptPromises[url];
  scriptPromises[url] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('โหลดไลบรารีไม่สำเร็จ: ' + url));
    document.head.appendChild(s);
  });
  return scriptPromises[url];
}

function cleanupJsonish(raw) {
  return raw
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

// พยายาม parse เป็น JSON ปกติก่อน (เร็วสุด) ถ้าพังค่อยลอง JSON5 (ทน trailing comma/comment/unquoted key)
async function parseDiagramSpec(raw) {
  const cleaned = cleanupJsonish(raw);
  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    try {
      const JSON5 = await loadJson5();
      return JSON5.parse(cleaned);
    } catch (secondErr) {
      throw new DiagramError('รูปแบบ JSON ไม่ถูกต้อง: ' + firstErr.message);
    }
  }
}

// ---------- SVG helpers ----------

function svgEl(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c) el.appendChild(c);
  }
  return el;
}

const DIAGRAM_FONT = "Sarabun, 'Leelawadee UI', Tahoma, 'Noto Sans Thai', sans-serif";

// Semantic palette shared by every SVG renderer.  Each value keeps the
// original daylight colour as a fallback; Night Aero supplies the CSS custom
// properties on the figure, so already-rendered diagrams switch live.
const DIAGRAM_COLORS = Object.freeze({
  ink: 'var(--diagram-ink, #2D2A26)',
  muted: 'var(--diagram-muted, #6B6459)',
  guide: 'var(--diagram-guide, #C9C2B4)',
  grid: 'var(--diagram-grid, #EAE4D8)',
  canvas: 'var(--diagram-canvas, #FFFFFF)',
  shape: 'var(--diagram-shape, #FFFFFF)',
  solid: 'var(--diagram-solid, #F5F1EA)',
  solidAlt: 'var(--diagram-solid-alt, #EDE9E0)',
  solidWarm: 'var(--diagram-solid-warm, #F0EBE1)',
  warmFill: 'var(--diagram-warm-fill, #FFF3EC)',
  table: 'var(--diagram-table, #D9CBB8)',
  opticFill: 'var(--diagram-optic-fill, #EAF2F8)',
  ray: 'var(--diagram-ray, #8AA0B8)',
  onAccent: 'var(--diagram-on-accent, #FFFFFF)',
  separator: 'var(--diagram-separator, #FFFFFF)',
  accent: 'var(--diagram-accent, #D97757)',
  force: 'var(--diagram-force, #B3432B)',
  secondary: 'var(--diagram-secondary, #3B6EA5)',
  positive: 'var(--diagram-positive, #5B8C3E)',
  series: [
    'var(--diagram-series-1, #D97757)',
    'var(--diagram-series-2, #3B6EA5)',
    'var(--diagram-series-3, #5B8C3E)',
    'var(--diagram-series-4, #9B6BC7)',
    'var(--diagram-series-5, #C79B3B)',
    'var(--diagram-series-6, #B3432B)',
  ],
});

function textEl(x, y, text, attrs = {}) {
  const t = svgEl('text', {
    x,
    y,
    'font-family': DIAGRAM_FONT,
    'font-size': 14,
    fill: DIAGRAM_COLORS.ink,
    'text-anchor': 'middle',
    ...attrs,
  });
  t.textContent = text == null ? '' : String(text);
  return t;
}

// วัดความกว้างข้อความด้วย canvas (ใช้ได้แม้ element ยังไม่ถูก attach เข้า DOM)
let measureCtx = null;
function measureTextWidth(text, fontSize = 14, fontWeight = 'normal') {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `${fontWeight} ${fontSize}px ${DIAGRAM_FONT}`;
  return measureCtx.measureText(String(text)).width;
}

// ---------- ตัวจัดวางป้ายกันข้อความทับกัน ----------
// ป้ายแต่ละอันมีตำแหน่งให้เลือกหลายจุด (candidates) ตัวจัดวางจะเลือกจุดแรกที่ไม่ทับ
// ป้ายอื่น/เส้น/จุด และไม่ล้นขอบรูป ถ้าไม่มีจุดว่างเลยจะเลือกจุดที่ทับน้อยที่สุด
// (ป้าย optional ที่ยังไงก็ทับป้ายอื่นจะถูกตัดทิ้ง ดีกว่าวาดซ้อนจนอ่านไม่ออก)
function textBox(x, y, text, fontSize, anchor) {
  let w;
  try {
    w = measureTextWidth(text, fontSize);
  } catch {
    w = String(text).length * fontSize * 0.6;
  }
  const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
  return { x1: left, y1: y - fontSize * 0.8, x2: left + w, y2: y + fontSize * 0.25 };
}

function boxOverlapArea(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}

// Liang–Barsky: ส่วนของเส้นตรงตัดผ่านกล่องหรือไม่
function segmentHitsBox(x1, y1, x2, y2, b) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const checks = [[-dx, x1 - b.x1], [dx, b.x2 - x1], [-dy, y1 - b.y1], [dy, b.y2 - y1]];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
  }
  return true;
}

function createLabelPlacer(width, height, { margin = 2 } = {}) {
  const placed = [];
  const segments = [];
  const boxes = [];
  const grow = (b, m) => ({ x1: b.x1 - m, y1: b.y1 - m, x2: b.x2 + m, y2: b.y2 + m });

  function cost(box, m) {
    let c = 0;
    if (box.x1 < 0 || box.y1 < 0 || box.x2 > width || box.y2 > height) c += 10000;
    const padded = grow(box, m);
    for (const p of placed) {
      const a = boxOverlapArea(padded, p);
      if (a > 0) c += 1000 + a;
    }
    for (const b of boxes) if (boxOverlapArea(padded, b) > 0) c += 60;
    for (const s of segments) if (segmentHitsBox(s[0], s[1], s[2], s[3], padded)) c += 40;
    return c;
  }

  return {
    addSegment(x1, y1, x2, y2) { segments.push([x1, y1, x2, y2]); },
    addPolyline(pts) {
      for (let i = 1; i < pts.length; i++) segments.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    },
    addBox(x1, y1, x2, y2) { boxes.push({ x1, y1, x2, y2 }); },
    // candidates: [{x, y, anchor}] เรียงตามลำดับที่อยากได้ — คืน text element หรือ null (ถ้า optional แล้วไม่มีที่ลง)
    // clearance: ระยะห่างขั้นต่ำจากของอื่น (ป้ายที่ไม่สำคัญควรเว้นมากหน่อยจะได้ไม่ดูเบียด)
    place(text, candidates, { fontSize = 12, optional = false, clearance = margin, ...attrs } = {}) {
      if (text == null || text === '' || !candidates.length) return null;
      let best = null;
      for (const c of candidates) {
        const box = textBox(c.x, c.y, text, fontSize, c.anchor || 'middle');
        const score = cost(box, clearance);
        if (!best || score < best.score) best = { c, box, score };
        if (score === 0) break;
      }
      if (optional && best.score >= 1000) return null;
      placed.push(best.box);
      return textEl(best.c.x, best.c.y, text, { 'font-size': fontSize, 'text-anchor': best.c.anchor || 'middle', ...attrs });
    },
  };
}

let clipIdSeq = 0;
function nextClipId(prefix = 'clip') {
  clipIdSeq += 1;
  return `${prefix}-${clipIdSeq}`;
}

function arrow(x1, y1, x2, y2, attrs = {}) {
  const { color = DIAGRAM_COLORS.ink, width = 2, markerId = ensureArrowMarker(color), dash } = attrs;
  return svgEl('line', {
    x1,
    y1,
    x2,
    y2,
    stroke: color,
    'stroke-width': width,
    'stroke-dasharray': dash,
    'marker-end': `url(#${markerId})`,
  });
}

const arrowMarkerIds = new Set();
let markerDefs = null;
function ensureArrowMarker(color) {
  const id = 'arrowhead-' + color.replace(/[^a-zA-Z0-9]/g, '');
  if (!arrowMarkerIds.has(id)) {
    arrowMarkerIds.add(id);
    if (!markerDefs) {
      markerDefs = svgEl('defs');
      document.body.appendChild(svgEl('svg', { style: 'position:absolute;width:0;height:0' }, [markerDefs]));
    }
    const marker = svgEl(
      'marker',
      {
        id,
        viewBox: '0 0 10 10',
        refX: 8,
        refY: 5,
        markerWidth: 6,
        markerHeight: 6,
        orient: 'auto-start-reverse',
      },
      [svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color })]
    );
    markerDefs.appendChild(marker);
  }
  return id;
}

// คัดลอก marker def ที่ใช้จริงเข้าไปใน svg root แต่ละรูป (กัน export/print ไม่เห็น marker จาก body กลาง)
function attachLocalDefs(svg) {
  if (!markerDefs) return;
  svg.insertBefore(markerDefs.cloneNode(true), svg.firstChild);
}

// ภาษาไทยไม่เว้นวรรคระหว่างคำ: ตัดเป็นคำด้วย Intl.Segmenter (ไม่มีก็ตัดทีละตัวอักษร)
let thaiSegmenter;
function splitWordPieces(word) {
  if (!/[฀-๿]/.test(word)) return [word];
  if (thaiSegmenter === undefined) {
    thaiSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  }
  if (!thaiSegmenter) return Array.from(word);
  return Array.from(thaiSegmenter.segment(word), (s) => s.segment);
}

function wrapTextLines(text, maxWidth, fontSize = 14, fontWeight = 'normal') {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  const fits = (s) => measureTextWidth(s, fontSize, fontWeight) <= maxWidth;
  for (const w of words) {
    splitWordPieces(w).forEach((piece, i) => {
      const candidate = cur ? cur + (i === 0 ? ' ' : '') + piece : piece;
      if (!cur || fits(candidate)) {
        cur = candidate;
        return;
      }
      lines.push(cur);
      cur = piece;
    });
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function multilineText(x, y, text, attrs = {}) {
  const { lineHeight = 16, ...rest } = attrs;
  const g = svgEl('g');
  const lines = String(text).split('\n');
  lines.forEach((line, i) => {
    g.appendChild(textEl(x, y + i * lineHeight, line, rest));
  });
  return g;
}

// ---------- Rendering pipeline ----------

function makeFallbackFigure(rawSource, errMessage, meta = {}) {
  const fig = document.createElement('figure');
  fig.className = 'diagram diagram-fallback';
  if (Number.isInteger(meta.blockIndex)) fig.dataset.diagramBlockIndex = String(meta.blockIndex);
  if (meta.blockLang) fig.dataset.diagramBlockLang = meta.blockLang;
  fig.dataset.diagramSource = rawSource;
  const warn = document.createElement('div');
  warn.className = 'diagram-fallback-msg';
  warn.textContent = '⚠️ วาดรูปประกอบไม่สำเร็จ: ' + errMessage;
  fig.appendChild(warn);
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'ดูสเปครูปดิบ';
  details.appendChild(summary);
  const pre = document.createElement('pre');
  pre.textContent = rawSource;
  details.appendChild(pre);
  fig.appendChild(details);
  return fig;
}

async function buildDiagramFigure(spec, meta = {}) {
  const type = resolveDiagramType(spec.type);
  if (!type) throw new DiagramError('ไม่รู้จักชนิดรูป "' + spec.type + '"');
  const def = DIAGRAM_REGISTRY[type];
  const svg = def.render(spec);
  if (!svg) throw new DiagramError('renderer ไม่คืนค่า SVG');
  // renderer บาง type (เช่น molecule) โหลดไลบรารี CDN แบบ lazy แล้ววาดต่อแบบ async
  if (svg._moleculePending) await svg._moleculePending;
  attachLocalDefs(svg);
  svg.setAttribute('font-family', DIAGRAM_FONT);
  const fig = document.createElement('figure');
  fig.className = 'diagram diagram-' + type;
  if (Number.isInteger(meta.blockIndex)) fig.dataset.diagramBlockIndex = String(meta.blockIndex);
  if (meta.blockLang) fig.dataset.diagramBlockLang = meta.blockLang;
  if (meta.rawSource != null) fig.dataset.diagramSource = meta.rawSource;
  svg.dataset.diagramType = type;
  fig.appendChild(svg);
  if (spec.caption) {
    const cap = document.createElement('figcaption');
    cap.textContent = spec.caption;
    fig.appendChild(cap);
  }
  return fig;
}

// ดึงทุกบล็อก ```diagram หรือ ```mermaid จาก markdown ดิบ (ก่อนแปลงเป็น HTML)
const DIAGRAM_BLOCK_PATTERN = /```(diagram|mermaid)\r?\n([\s\S]*?)```/g;

function extractDiagramBlocks(markdownText) {
  const blocks = [];
  let m;
  const re = new RegExp(DIAGRAM_BLOCK_PATTERN);
  while ((m = re.exec(markdownText || ''))) {
    blocks.push({ lang: m[1], source: m[2], index: blocks.length, fullMatch: m[0] });
  }
  return blocks;
}

function replaceDiagramBlock(markdownText, index, newInnerSource, lang = 'diagram') {
  let i = -1;
  return (markdownText || '').replace(DIAGRAM_BLOCK_PATTERN, (full, blockLang, src) => {
    i++;
    if (i !== index) return full;
    return '```' + lang + '\n' + newInnerSource.trim() + '\n```';
  });
}

// ตรวจว่าทุกบล็อก diagram parse+render ผ่านไหม (ใช้ตอน auto-repair) — ไม่ยุ่งกับ mermaid (ปล่อยให้ mermaid.js เช็คเอง)
async function validateDiagramBlocks(markdownText) {
  const blocks = extractDiagramBlocks(markdownText);
  const results = [];
  if (window.ensureMathjs && /"functions"/.test(markdownText || '')) {
    await window.ensureMathjs().catch(() => {});
  }
  for (const b of blocks) {
    if (b.lang === 'mermaid') {
      results.push({ ...b, ok: true });
      continue;
    }
    try {
      const spec = await parseDiagramSpec(b.source);
      await buildDiagramFigure(spec);
      results.push({ ...b, ok: true });
    } catch (err) {
      results.push({ ...b, ok: false, error: err.message });
    }
  }
  return results;
}

let mermaidInitDone = false;
async function ensureMermaid() {
  if (!window.mermaid) {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js');
  }
  if (!mermaidInitDone) {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'neutral' });
    mermaidInitDone = true;
  }
  return window.mermaid;
}

let mermaidSeq = 0;
async function renderMermaidInto(container, source, meta = {}) {
  const mermaid = await ensureMermaid();
  const id = 'mmd-' + Date.now() + '-' + mermaidSeq++;
  const { svg } = await mermaid.render(id, source.trim());
  const fig = document.createElement('figure');
  fig.className = 'diagram diagram-mermaid';
  if (Number.isInteger(meta.blockIndex)) fig.dataset.diagramBlockIndex = String(meta.blockIndex);
  fig.dataset.diagramBlockLang = 'mermaid';
  fig.dataset.diagramSource = source;
  fig.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
  container.replaceWith(fig);
}

// แทนที่ <pre><code class="language-diagram|language-mermaid"> ในผลลัพธ์ markdownToSafeHtml ด้วยรูปจริง
// คืน promise ที่ resolve เมื่อวาดครบทุกรูป (ใช้รอก่อน export PDF ได้)
function renderDiagramsIn(container) {
  const codeBlocks = Array.from(container.querySelectorAll('pre > code'));
  // preload mathjs ล่วงหน้าถ้ามี diagram type "graph" ที่ใช้ functions (render เป็น sync จึงต้องพร้อมก่อน parse)
  const needsMathjs = codeBlocks.some(
    (c) => /language-diagram\b/.test(c.className || '') && /"type"\s*:\s*"(function-graph|plot|graph)"/.test(c.textContent) && /"functions"/.test(c.textContent)
  );
  const preload = needsMathjs && window.ensureMathjs ? window.ensureMathjs().catch(() => {}) : Promise.resolve();
  const jobs = [];
  let blockIndex = 0;
  for (const code of codeBlocks) {
    const cls = code.className || '';
    const isDiagram = /language-diagram\b/.test(cls);
    const isMermaid = /language-mermaid\b/.test(cls);
    if (!isDiagram && !isMermaid) continue;
    const pre = code.parentElement;
    const rawSource = code.textContent;
    const meta = { blockIndex, blockLang: isMermaid ? 'mermaid' : 'diagram', rawSource };
    blockIndex++;
    if (isMermaid) {
      jobs.push(
        renderMermaidInto(pre, rawSource, meta).catch((err) => {
          pre.replaceWith(makeFallbackFigure(rawSource, err.message || String(err), meta));
        })
      );
    } else {
      jobs.push(
        preload
          .then(() => parseDiagramSpec(rawSource))
          .then((spec) => buildDiagramFigure(spec, meta))
          .then((fig) => {
            pre.replaceWith(fig);
          })
          .catch((err) => {
            pre.replaceWith(makeFallbackFigure(rawSource, err.message || String(err), meta));
          })
      );
    }
  }
  const ready = Promise.all(jobs);
  container.diagramsReady = ready;
  return ready;
}

// ---------- shared geometry helpers used across renderer files ----------

function autoViewBox(points, pad = 20) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
  return { minX, minY, w, h };
}

function baseSvg(width, height, extraAttrs = {}) {
  return svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    xmlns: SVG_NS,
    ...extraAttrs,
  });
}
