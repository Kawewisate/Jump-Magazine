// Renderers: flow, cycle, timeline, mindmap

const CON_STROKE = '#2D2A26';
const CON_ACCENT = '#D97757';
const CON_BOX = '#F5F1EA';

function boxWithText(svg, cx, cy, w, h, text, attrs = {}) {
  svg.appendChild(svgEl('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 8, fill: CON_BOX, stroke: CON_STROKE, 'stroke-width': 1.8, ...attrs }));
  const lines = wrapTextLines(text, w - 16, 13);
  const startY = cy - ((lines.length - 1) * 16) / 2 + 4;
  svg.appendChild(multilineText(cx, startY, lines.join('\n'), { 'font-size': 13, lineHeight: 16 }));
}

// ===================== flow =====================
registerDiagram({
  type: 'flow',
  aliases: ['flowchart', 'process'],
  guide: `ขั้นตอนกระบวนการเรียงเส้นตรง: {"type":"flow","direction":"horizontal","steps":["เริ่มต้น","ขั้นที่ 1","ขั้นที่ 2","สิ้นสุด"]}
- direction: "horizontal" หรือ "vertical"`,
  render(spec) {
    const steps = spec.steps || [];
    const horizontal = (spec.direction || 'horizontal') === 'horizontal';
    const boxW = 130, boxH = 55, gap = 45;
    const n = steps.length;
    const W = horizontal ? n * boxW + (n - 1) * gap + 30 : boxW + 30;
    const H = horizontal ? boxH + 30 : n * boxH + (n - 1) * gap + 30;
    const svg = baseSvg(Math.max(W, 100), Math.max(H, 100));
    steps.forEach((s, i) => {
      const cx = horizontal ? 15 + boxW / 2 + i * (boxW + gap) : W / 2;
      const cy = horizontal ? H / 2 : 15 + boxH / 2 + i * (boxH + gap);
      boxWithText(svg, cx, cy, boxW, boxH, s);
      if (i < n - 1) {
        if (horizontal) svg.appendChild(arrow(cx + boxW / 2, cy, cx + boxW / 2 + gap, cy, { color: CON_ACCENT }));
        else svg.appendChild(arrow(cx, cy + boxH / 2, cx, cy + boxH / 2 + gap, { color: CON_ACCENT }));
      }
    });
    return svg;
  },
});

// ===================== cycle =====================
registerDiagram({
  type: 'cycle',
  aliases: ['cycle-diagram', 'life-cycle'],
  guide: `วัฏจักร/กระบวนการวนซ้ำ: {"type":"cycle","steps":["การระเหย","การควบแน่น","การตกตะกอน","การไหลบ่า"]}`,
  render(spec) {
    const steps = spec.steps || [];
    const n = steps.length || 1;
    const size = 320;
    const cx = size / 2, cy = size / 2, r = size / 2 - 70;
    const svg = baseSvg(size, size);
    const boxW = 110, boxH = 50;
    const positions = steps.map((_, i) => {
      const ang = (2 * Math.PI * i) / n - Math.PI / 2;
      return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
    });
    positions.forEach(([x1, y1], i) => {
      const [x2, y2] = positions[(i + 1) % n];
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const shrink = 65;
      const sx1 = x1 + (dx / len) * shrink, sy1 = y1 + (dy / len) * shrink;
      const sx2 = x2 - (dx / len) * shrink, sy2 = y2 - (dy / len) * shrink;
      const mx = (sx1 + sx2) / 2 + (dy / len) * 18;
      const my = (sy1 + sy2) / 2 - (dx / len) * 18;
      svg.appendChild(svgEl('path', { d: `M ${sx1} ${sy1} Q ${mx} ${my} ${sx2} ${sy2}`, fill: 'none', stroke: CON_ACCENT, 'stroke-width': 2, 'marker-end': `url(#${ensureArrowMarker(CON_ACCENT)})` }));
    });
    positions.forEach(([x, y], i) => boxWithText(svg, x, y, boxW, boxH, steps[i]));
    return svg;
  },
});

// ===================== timeline =====================
registerDiagram({
  type: 'timeline',
  aliases: ['history-timeline'],
  guide: `เส้นเวลาเหตุการณ์: {"type":"timeline","events":[{"date":"พ.ศ. 1800","label":"ก่อตั้งสุโขทัย"},{"date":"พ.ศ. 1920","label":"สิ้นสุดยุคสุโขทัย"}]}`,
  render(spec) {
    const events = spec.events || [];
    const n = events.length || 1;
    const gap = 140;
    const W = n * gap + 60;
    const H = 220;
    const y = H / 2;
    const svg = baseSvg(Math.max(W, 200), H);
    svg.appendChild(svgEl('line', { x1: 30, y1: y, x2: W - 30, y2: y, stroke: CON_STROKE, 'stroke-width': 2 }));
    events.forEach((e, i) => {
      const x = 30 + gap / 2 + i * gap;
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: 6, fill: CON_ACCENT, stroke: CON_STROKE, 'stroke-width': 1.5 }));
      const above = i % 2 === 0;
      const labelY = above ? y - 40 : y + 55;
      svg.appendChild(svgEl('line', { x1: x, y1: y, x2: x, y2: above ? labelY + 14 : labelY - 14, stroke: '#C9C2B4', 'stroke-width': 1 }));
      svg.appendChild(textEl(x, above ? y - 16 : y + 30, e.date, { 'font-size': 12, 'font-weight': 'bold', fill: CON_ACCENT }));
      const lines = wrapTextLines(e.label, gap - 10, 12);
      svg.appendChild(multilineText(x, labelY, lines.join('\n'), { 'font-size': 12, lineHeight: 15 }));
    });
    return svg;
  },
});

// ===================== mindmap =====================
registerDiagram({
  type: 'mindmap',
  aliases: ['mind-map', 'concept-map'],
  guide: `แผนผังความคิด: {"type":"mindmap","center":"หัวข้อหลัก","branches":[
  {"label":"หัวข้อย่อย 1","items":["รายละเอียด A","รายละเอียด B"]},
  {"label":"หัวข้อย่อย 2","items":["รายละเอียด C"]}
]}`,
  render(spec) {
    const branches = spec.branches || [];
    const n = branches.length || 1;
    const size = 420;
    const cx = size / 2, cy = size / 2, r = 140;
    const svg = baseSvg(size, size);
    branches.forEach((b, i) => {
      const ang = (2 * Math.PI * i) / n - Math.PI / 2;
      const bx = cx + r * Math.cos(ang), by = cy + r * Math.sin(ang);
      svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: bx, y2: by, stroke: CON_ACCENT, 'stroke-width': 2 }));
      boxWithText(svg, bx, by, 120, 44, b.label, { fill: '#FFF3EC', stroke: CON_ACCENT });
      const dir = Math.cos(ang) >= 0 ? 1 : -1;
      (b.items || []).forEach((item, j) => {
        const ix = bx + dir * 90;
        const iy = by + (j - (b.items.length - 1) / 2) * 30;
        svg.appendChild(svgEl('line', { x1: bx + dir * 60, y1: by, x2: ix - dir * 45, y2: iy, stroke: '#C9C2B4', 'stroke-width': 1 }));
        svg.appendChild(textEl(ix, iy + 4, item, { 'font-size': 11, 'text-anchor': dir >= 0 ? 'start' : 'end' }));
      });
    });
    boxWithText(svg, cx, cy, 130, 55, spec.center || '', { fill: '#FFFFFF', 'stroke-width': 2.4 });
    return svg;
  },
});
