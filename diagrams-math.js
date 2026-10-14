// Renderers: graph, geometry, solid, numberline, chart, venn, tree, fraction

const MATH_STROKE = DIAGRAM_COLORS.ink;
const MATH_ACCENT = DIAGRAM_COLORS.accent;
const MATH_LINE2 = DIAGRAM_COLORS.secondary;
const PALETTE = DIAGRAM_COLORS.series;

// ===================== graph (function/axes plot) =====================
let mathjsReady = null;
function ensureMathjs() {
  if (window.math) return Promise.resolve();
  if (!mathjsReady) mathjsReady = loadScriptOnce('https://cdn.jsdelivr.net/npm/mathjs@13.2.0/lib/browser/math.js');
  return mathjsReady;
}
window.ensureMathjs = ensureMathjs;

registerDiagram({
  type: 'graph',
  aliases: ['function-graph', 'plot'],
  guide: `กราฟฟังก์ชัน/แกน: {"type":"graph","xRange":[-5,5],"yRange":[-5,5],"grid":true,
  "functions":[{"expr":"x^2-2","label":"y=x²-2","color":"accent"}],
  "points":[{"x":1,"y":1,"label":"A"}],
  "lines":[{"kind":"vertical","x":2,"label":"x=2"}],
  "polylines":[{"points":[[0,0],[1,3],[2,2]],"label":"v-t"}],
  "xLabel":"t (s)","yLabel":"v (m/s)"}
- functions: expr เป็นสมการตัวแปร x (syntax คล้าย JS เช่น x^2, sin(x), sqrt(x))
- lines: kind "vertical"|"horizontal", ระบุ x หรือ y
- ถ้าไม่ใส่ functions/polylines จะได้แกนว่างเปล่าให้นักเรียนพล็อตเอง (เหมาะกับใบงาน)
- color: "accent"|"blue"|"green"|"purple" หรือไม่ใส่ (ใช้ลำดับสีอัตโนมัติ)`,
  render(spec) {
    const W = 380, H = 340, pad = 40;
    const [xMin, xMax] = spec.xRange || [-5, 5];
    const [yMin, yMax] = spec.yRange || [-5, 5];
    const plotW = W - pad * 2, plotH = H - pad * 2;
    const sx = (x) => pad + ((x - xMin) / (xMax - xMin)) * plotW;
    const sy = (y) => H - pad - ((y - yMin) / (yMax - yMin)) * plotH;
    const svg = baseSvg(W, H);
    // ป้ายทั้งหมดเก็บไว้วางทีหลังสุด ให้ตัวจัดวางรู้ว่ามีเส้น/จุดอะไรอยู่ตรงไหนแล้วบ้าง
    const placer = createLabelPlacer(W, H);
    const labels = [];

    // เส้นกราฟถูกตัดให้อยู่ในกรอบพล็อต (ไม่ให้พุ่งออกไปทับป้าย/ขอบรูป)
    const clipId = nextClipId('graph-plot');
    svg.appendChild(svgEl('defs', {}, [
      svgEl('clipPath', { id: clipId }, [svgEl('rect', { x: pad, y: pad, width: plotW, height: plotH })]),
    ]));
    const clipped = svgEl('g', { 'clip-path': `url(#${clipId})` });
    const inPlot = ([x, y]) => x >= pad - 1 && x <= W - pad + 1 && y >= pad - 1 && y <= H - pad + 1;

    if (spec.grid !== false) {
      for (let gx = Math.ceil(xMin); gx <= xMax; gx++) {
        svg.appendChild(svgEl('line', { x1: sx(gx), y1: pad, x2: sx(gx), y2: H - pad, stroke: DIAGRAM_COLORS.grid, 'stroke-width': 1 }));
      }
      for (let gy = Math.ceil(yMin); gy <= yMax; gy++) {
        svg.appendChild(svgEl('line', { x1: pad, y1: sy(gy), x2: W - pad, y2: sy(gy), stroke: DIAGRAM_COLORS.grid, 'stroke-width': 1 }));
      }
    }
    // axes
    const x0 = sx(Math.max(xMin, Math.min(0, xMax)));
    const y0 = sy(Math.max(yMin, Math.min(0, yMax)));
    svg.appendChild(arrow(pad, y0, W - pad, y0, { color: MATH_STROKE }));
    svg.appendChild(arrow(x0, H - pad, x0, pad, { color: MATH_STROKE }));
    placer.addSegment(pad, y0, W - pad, y0);
    placer.addSegment(x0, H - pad, x0, pad);
    placer.addBox(W - pad - 10, y0 - 5, W - pad + 3, y0 + 5); // หัวลูกศรแกน x
    placer.addBox(x0 - 5, pad - 3, x0 + 5, pad + 10); // หัวลูกศรแกน y

    function colorFor(name, i) {
      const map = { accent: PALETTE[0], blue: PALETTE[1], green: PALETTE[2], purple: PALETTE[3] };
      return map[name] || PALETTE[i % PALETTE.length];
    }

    // ตำแหน่งรอบจุด (px, py) — 8 ทิศ เริ่มจากขวาบน
    function around(px, py, gap = 8, fontSize = 12) {
      const up = py - gap, down = py + gap + fontSize * 0.8, mid = py + fontSize * 0.35;
      return [
        { x: px + gap, y: up, anchor: 'start' },
        { x: px - gap, y: up, anchor: 'end' },
        { x: px + gap, y: down, anchor: 'start' },
        { x: px - gap, y: down, anchor: 'end' },
        { x: px + gap + 2, y: mid, anchor: 'start' },
        { x: px - gap - 2, y: mid, anchor: 'end' },
        { x: px, y: up - 2, anchor: 'middle' },
        { x: px, y: down + 2, anchor: 'middle' },
      ];
    }

    const functionRuns = [];
    (spec.functions || []).forEach((f, i) => {
      const color = colorFor(f.color, i);
      const n = 200;
      let d = '';
      let penDown = false;
      const runs = [];
      let node;
      try {
        node = window.math ? window.math.compile(f.expr) : null;
      } catch {
        node = null;
      }
      for (let k = 0; k <= n; k++) {
        const x = xMin + ((xMax - xMin) * k) / n;
        let y;
        try {
          y = node ? node.evaluate({ x }) : NaN;
        } catch {
          y = NaN;
        }
        if (!isFinite(y) || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) {
          penDown = false;
          continue;
        }
        const pt = [sx(x), sy(Math.max(yMin - 1, Math.min(yMax + 1, y)))];
        if (!penDown) runs.push([]);
        runs[runs.length - 1].push(pt);
        d += (penDown ? 'L' : 'M') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1) + ' ';
        penDown = true;
      }
      if (d.trim()) clipped.appendChild(svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 2 }));
      runs.forEach((r) => placer.addPolyline(r));
      functionRuns.push({ f, i, color, runs });
    });

    (spec.polylines || []).forEach((pl, i) => {
      const color = colorFor(pl.color, i + (spec.functions || []).length);
      const ptsArr = (pl.points || []).map(([x, y]) => [sx(x), sy(y)]);
      clipped.appendChild(svgEl('polyline', { points: ptsArr.map((p) => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 2 }));
      ptsArr.forEach(([px, py]) => {
        clipped.appendChild(svgEl('circle', { cx: px, cy: py, r: 3, fill: color }));
        placer.addBox(px - 3, py - 3, px + 3, py + 3);
      });
      placer.addPolyline(ptsArr);
      if (pl.label && ptsArr.length) {
        const [ex, ey] = ptsArr[ptsArr.length - 1];
        const cands = [{ x: ex + 10, y: ey + 4, anchor: 'start' }, ...around(ex, ey)];
        // ไล่จุดอื่นของเส้นจากท้ายมาหัว เผื่อปลายเส้นไปชนป้ายแกน
        for (let k = ptsArr.length - 2; k >= 0; k--) cands.push(...around(ptsArr[k][0], ptsArr[k][1]));
        labels.push({ text: pl.label, cands, fill: color });
      }
    });

    svg.appendChild(clipped);

    (spec.lines || []).forEach((l) => {
      if (l.kind === 'vertical') {
        const lx = sx(l.x);
        svg.appendChild(svgEl('line', { x1: lx, y1: pad, x2: lx, y2: H - pad, stroke: MATH_ACCENT, 'stroke-width': 1.5, 'stroke-dasharray': '5,3' }));
        placer.addSegment(lx, pad, lx, H - pad);
        if (l.label) {
          const cands = [
            { x: lx + 7, y: pad + 12, anchor: 'start' },
            { x: lx - 7, y: pad + 12, anchor: 'end' },
            { x: lx, y: pad - 6, anchor: 'middle' },
            { x: lx + 7, y: H - pad - 6, anchor: 'start' },
            { x: lx - 7, y: H - pad - 6, anchor: 'end' },
            { x: lx, y: H - pad + 16, anchor: 'middle' },
          ];
          for (const t of [0.25, 0.5, 0.75]) {
            const ly = pad + plotH * t;
            cands.push({ x: lx + 7, y: ly, anchor: 'start' }, { x: lx - 7, y: ly, anchor: 'end' });
          }
          labels.push({ text: l.label, cands, fill: MATH_ACCENT, fontSize: 11 });
        }
      } else if (l.kind === 'horizontal') {
        const ly = sy(l.y);
        svg.appendChild(svgEl('line', { x1: pad, y1: ly, x2: W - pad, y2: ly, stroke: MATH_ACCENT, 'stroke-width': 1.5, 'stroke-dasharray': '5,3' }));
        placer.addSegment(pad, ly, W - pad, ly);
        if (l.label) {
          const cands = [
            { x: pad + 6, y: ly - 6, anchor: 'start' },
            { x: pad + 6, y: ly + 14, anchor: 'start' },
            { x: W - pad - 6, y: ly - 6, anchor: 'end' },
            { x: W - pad - 6, y: ly + 14, anchor: 'end' },
            { x: pad - 4, y: ly + 4, anchor: 'end' },
          ];
          for (const t of [0.25, 0.5, 0.75]) {
            const lx = pad + plotW * t;
            cands.push({ x: lx, y: ly - 6, anchor: 'middle' }, { x: lx, y: ly + 14, anchor: 'middle' });
          }
          labels.push({ text: l.label, cands, fill: MATH_ACCENT, fontSize: 11 });
        }
      }
    });

    (spec.points || []).forEach((p) => {
      const px = sx(p.x), py = sy(p.y);
      svg.appendChild(svgEl('circle', { cx: px, cy: py, r: 4, fill: MATH_STROKE }));
      placer.addBox(px - 4, py - 4, px + 4, py + 4);
      if (p.label) labels.push({ text: p.label, cands: around(px, py, 7), priority: 1 });
    });

    (spec.vectors || []).forEach((v) => {
      const fx = sx(v.from ? v.from[0] : 0), fy = sy(v.from ? v.from[1] : 0);
      const tx = sx(v.to[0]), ty = sy(v.to[1]);
      svg.appendChild(arrow(fx, fy, tx, ty, { color: MATH_LINE2 }));
      placer.addSegment(fx, fy, tx, ty);
      if (v.label) labels.push({ text: v.label, cands: [{ x: tx + 8, y: ty + 4, anchor: 'start' }, ...around(tx, ty)], fill: MATH_LINE2 });
    });

    // ป้ายชื่อฟังก์ชัน: ลองมุมกรอบแบบ legend ก่อน แล้วค่อยลองวางติดเส้นกราฟ
    functionRuns.forEach(({ f, i, color, runs }) => {
      if (!f.label) return;
      const row = 14 + i * 16;
      const cands = [
        { x: W - pad - 4, y: pad + row, anchor: 'end' },
        { x: pad + 4, y: pad + row, anchor: 'start' },
        { x: W - pad - 4, y: H - pad - 6 - i * 16, anchor: 'end' },
        { x: pad + 4, y: H - pad - 6 - i * 16, anchor: 'start' },
      ];
      const pts = runs.flat().filter(inPlot);
      for (const t of [0.85, 0.7, 0.15, 0.3, 0.55]) {
        if (!pts.length) break;
        const [px, py] = pts[Math.min(pts.length - 1, Math.floor(pts.length * t))];
        cands.push(...around(px, py, 8));
      }
      labels.push({ text: f.label, cands, fill: color });
    });

    // วางตามลำดับความสำคัญ: ชื่อแกน → จุด → ป้ายอื่น → "0" (ถ้าไม่มีที่ว่างก็ไม่ต้องใส่)
    const axisFont = { 'font-size': 12 };
    const xl = placer.place(spec.xLabel || 'x', [
      { x: W - pad + 8, y: y0 + 4, anchor: 'start' },
      { x: W - pad, y: y0 + 18, anchor: 'end' },
      { x: W - pad, y: y0 - 10, anchor: 'end' },
    ], axisFont);
    const yl = placer.place(spec.yLabel || 'y', [
      { x: x0, y: pad - 12, anchor: 'middle' },
      { x: x0 + 10, y: pad - 6, anchor: 'start' },
      { x: x0 - 10, y: pad - 6, anchor: 'end' },
    ], axisFont);
    [xl, yl].forEach((t) => t && svg.appendChild(t));

    labels.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    labels.forEach((lb) => {
      const t = placer.place(lb.text, lb.cands, { fontSize: lb.fontSize || 12, fill: lb.fill });
      if (t) svg.appendChild(t);
    });

    // ถ้ามีจุดที่ผู้ใช้ใส่ป้ายไว้ตรงจุดกำเนิดอยู่แล้ว (เช่น "O") ไม่ต้องใส่ "0" ซ้ำ
    const originTaken = (spec.points || []).some((p) => p.label && Math.hypot(sx(p.x) - x0, sy(p.y) - y0) < 6);
    const zero = originTaken ? null : placer.place('0', [
      { x: x0 - 6, y: y0 + 14, anchor: 'end' },
      { x: x0 + 6, y: y0 + 14, anchor: 'start' },
      { x: x0 - 6, y: y0 - 6, anchor: 'end' },
      { x: x0 + 6, y: y0 - 6, anchor: 'start' },
    ], { fontSize: 11, fill: DIAGRAM_COLORS.muted, optional: true, clearance: 4 });
    if (zero) svg.appendChild(zero);

    return svg;
  },
});

// ===================== geometry =====================
registerDiagram({
  type: 'geometry',
  aliases: ['shape', 'triangle'],
  guide: `รูปเรขาคณิต: {"type":"geometry","points":{"A":[0,0],"B":[4,0],"C":[0,3]},
  "segments":[["A","B"],["B","C"],["C","A"]],
  "sideLabels":[{"between":["A","B"],"label":"4 cm"}],
  "angles":[{"at":"A","between":["B","C"],"label":"θ"}],
  "rightAngle":"A","equalMarks":[["A","B"],["A","C"]],"circles":[]}
- points: ชื่อจุด -> [x,y] (หน่วยสัมพัทธ์เท่าไรก็ได้ ระบบ auto-fit ให้)
- rightAngle: ชื่อจุดที่มีมุมฉาก (วาดสัญลักษณ์สี่เหลี่ยมเล็ก) ระบุได้หลายจุดเป็น array ก็ได้
- circles: [{"center":"A","radius":2,"label":""}]`,
  render(spec) {
    const points = spec.points || {};
    const names = Object.keys(points);
    if (!names.length) throw new DiagramError('ไม่มี points');
    const coords = names.map((n) => points[n]);
    const flipY = coords.map(([x, y]) => [x, -y]); // คณิตศาสตร์: y ขึ้นบน, SVG: y ลงล่าง
    // รวม circles เข้าไปในกล่องขอบเขตด้วย (ไม่งั้นสเปคที่มีแค่จุดศูนย์กลาง+circles อย่างเดียว เช่น วงแหวนพลังงานอะตอม จะ auto-fit ผิดขนาดมหาศาล)
    const circleSpecs = spec.circles || [];
    const circleExtentPoints = circleSpecs.flatMap((c) => {
      const center = points[c.center];
      if (!center) return [];
      const [cx, cy] = [center[0], -center[1]];
      const r = c.radius || 0;
      return [[cx - r, cy - r], [cx + r, cy + r]];
    });
    const xs = flipY.map((p) => p[0]).concat(circleExtentPoints.map((p) => p[0]));
    const ys = flipY.map((p) => p[1]).concat(circleExtentPoints.map((p) => p[1]));
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = 220 / Math.max(0.5, Math.max(maxX - minX, maxY - minY));
    const pad = 45;
    const W = (maxX - minX) * scale + pad * 2;
    const H = (maxY - minY) * scale + pad * 2;
    const px = (n) => (points[n][0] - minX) * scale + pad;
    const py = (n) => (-points[n][1] - minY) * scale + pad;

    const svg = baseSvg(Math.max(W, 160), Math.max(H, 160));

    circleSpecs.forEach((c) => {
      svg.appendChild(svgEl('circle', { cx: px(c.center), cy: py(c.center), r: c.radius * scale, fill: 'none', stroke: MATH_LINE2, 'stroke-width': 1.5 }));
      if (c.label) svg.appendChild(textEl(px(c.center) + c.radius * scale, py(c.center) - 6, c.label, { 'font-size': 11, fill: MATH_LINE2 }));
    });

    (spec.segments || []).forEach(([a, b]) => {
      svg.appendChild(svgEl('line', { x1: px(a), y1: py(a), x2: px(b), y2: py(b), stroke: MATH_STROKE, 'stroke-width': 2 }));
    });

    const rightAngles = Array.isArray(spec.rightAngle) ? spec.rightAngle : spec.rightAngle ? [spec.rightAngle] : [];
    rightAngles.forEach((name) => {
      const adj = (spec.segments || []).filter((s) => s.includes(name));
      if (adj.length < 2) return;
      const others = adj.map((s) => (s[0] === name ? s[1] : s[0]));
      const [ox1, oy1] = [px(others[0]) - px(name), py(others[0]) - py(name)];
      const [ox2, oy2] = [px(others[1]) - px(name), py(others[1]) - py(name)];
      const n1 = Math.hypot(ox1, oy1) || 1, n2 = Math.hypot(ox2, oy2) || 1;
      const size = 12;
      const p1 = [px(name) + (ox1 / n1) * size, py(name) + (oy1 / n1) * size];
      const p2 = [px(name) + (ox2 / n2) * size, py(name) + (oy2 / n2) * size];
      const p3 = [p1[0] + (ox2 / n2) * size, p1[1] + (oy2 / n2) * size];
      svg.appendChild(svgEl('polyline', { points: `${p1.join(',')} ${p3.join(',')} ${p2.join(',')}`, fill: 'none', stroke: MATH_STROKE, 'stroke-width': 1.2 }));
    });

    (spec.equalMarks || []).forEach(([a, b], gi) => {
      const midX = (px(a) + px(b)) / 2, midY = (py(a) + py(b)) / 2;
      const dx = px(b) - px(a), dy = py(b) - py(a);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const ticks = (gi % 3) + 1;
      for (let t = 0; t < ticks; t++) {
        const off = (t - (ticks - 1) / 2) * 5;
        svg.appendChild(svgEl('line', {
          x1: midX + (dx / len) * off - nx * 5, y1: midY + (dy / len) * off - ny * 5,
          x2: midX + (dx / len) * off + nx * 5, y2: midY + (dy / len) * off + ny * 5,
          stroke: MATH_STROKE, 'stroke-width': 1.5,
        }));
      }
    });

    names.forEach((n) => {
      svg.appendChild(svgEl('circle', { cx: px(n), cy: py(n), r: 3, fill: MATH_STROKE }));
      const cx0 = W / 2, cy0 = H / 2;
      const dx = px(n) - cx0, dy = py(n) - cy0;
      const len = Math.hypot(dx, dy) || 1;
      svg.appendChild(textEl(px(n) + (dx / len) * 16, py(n) + (dy / len) * 16 + 4, n, { 'font-size': 13, 'font-weight': 'bold' }));
    });

    (spec.sideLabels || []).forEach((sl) => {
      const [a, b] = sl.between;
      svg.appendChild(textEl((px(a) + px(b)) / 2 + 10, (py(a) + py(b)) / 2 - 6, sl.label, { 'font-size': 12, fill: MATH_ACCENT }));
    });

    (spec.angles || []).forEach((ang) => {
      const at = ang.at;
      const [b1, b2] = ang.between;
      const a1 = Math.atan2(py(b1) - py(at), px(b1) - px(at));
      const a2 = Math.atan2(py(b2) - py(at), px(b2) - px(at));
      const r = 24;
      svg.appendChild(svgEl('path', {
        d: `M ${px(at) + r * Math.cos(a1)} ${py(at) + r * Math.sin(a1)} A ${r} ${r} 0 0 ${a2 > a1 ? 1 : 0} ${px(at) + r * Math.cos(a2)} ${py(at) + r * Math.sin(a2)}`,
        fill: 'none', stroke: MATH_ACCENT, 'stroke-width': 1.5,
      }));
      const mid = (a1 + a2) / 2;
      svg.appendChild(textEl(px(at) + (r + 14) * Math.cos(mid), py(at) + (r + 14) * Math.sin(mid), ang.label || '', { 'font-size': 12, fill: MATH_ACCENT }));
    });

    return svg;
  },
});

// ===================== solid (3D volume shapes, oblique view) =====================
registerDiagram({
  type: 'solid',
  aliases: ['3d-shape', 'volume'],
  guide: `รูปทรงสามมิติ (มุมมอง oblique): {"type":"solid","shape":"cylinder","dims":{"radius":30,"height":80},"labels":{"radius":"r=3 cm","height":"h=8 cm"}}
- shape: "cube"|"cuboid"(dims:width,depth,height)|"cylinder"(radius,height)|"cone"(radius,height)|"sphere"(radius)|"pyramid"(base,height)|"prism"(base,height,sides)
- labels: label กำกับมิติที่ระบุ (ใช้ key เดียวกับ dims)`,
  render(spec) {
    const shape = spec.shape || 'cuboid';
    const dims = spec.dims || {};
    const labels = spec.labels || {};
    const W = 280, H = 260;
    const svg = baseSvg(W, H);
    const cx = W / 2, cy = H / 2 + 20;
    const dashAttrs = { stroke: MATH_STROKE, 'stroke-width': 1.5, 'stroke-dasharray': '4,3', fill: 'none' };
    const solidAttrs = { stroke: MATH_STROKE, 'stroke-width': 1.8, fill: DIAGRAM_COLORS.solid };

    function skewPt(x, y, z) {
      // oblique projection: z ยิงทแยง 30 องศาขึ้นขวา
      return [x + z * 0.5, y - z * 0.35];
    }

    if (shape === 'cube' || shape === 'cuboid') {
      const w = dims.width || 80, d = dims.depth || (shape === 'cube' ? w : 50), h = dims.height || 80;
      const ox = cx - w / 2 - d * 0.25, oy = cy + h / 2;
      const front = [[ox, oy], [ox + w, oy], [ox + w, oy - h], [ox, oy - h]];
      const back = front.map(([x, y]) => skewPt(x, y, d));
      // back face (dashed, drawn first so front overlaps)
      svg.appendChild(svgEl('polygon', { points: back.map((p) => p.join(',')).join(' '), ...dashAttrs }));
      [0, 1, 3].forEach((i) => svg.appendChild(svgEl('line', { x1: front[i][0], y1: front[i][1], x2: back[i][0], y2: back[i][1], ...dashAttrs })));
      svg.appendChild(svgEl('line', { x1: front[2][0], y1: front[2][1], x2: back[2][0], y2: back[2][1], stroke: MATH_STROKE, 'stroke-width': 1.8 }));
      svg.appendChild(svgEl('polygon', { points: front.map((p) => p.join(',')).join(' '), ...solidAttrs }));
      // top face
      const top = [front[3], front[2], back[2], back[3]];
      svg.appendChild(svgEl('polygon', { points: top.map((p) => p.join(',')).join(' '), fill: DIAGRAM_COLORS.solidAlt, stroke: MATH_STROKE, 'stroke-width': 1.8 }));
      if (labels.width) svg.appendChild(textEl((front[0][0] + front[1][0]) / 2, oy + 20, labels.width, { 'font-size': 12 }));
      if (labels.height) svg.appendChild(textEl(ox - 16, (oy + oy - h) / 2, labels.height, { 'font-size': 12, 'text-anchor': 'end' }));
      if (labels.depth) svg.appendChild(textEl((front[1][0] + back[1][0]) / 2 + 8, (front[1][1] + back[1][1]) / 2 - 6, labels.depth, { 'font-size': 12, 'text-anchor': 'start' }));
    } else if (shape === 'cylinder') {
      const r = dims.radius || 35, h = dims.height || 90;
      const topY = cy - h / 2, botY = cy + h / 2;
      svg.appendChild(svgEl('line', { x1: cx - r, y1: topY, x2: cx - r, y2: botY, stroke: MATH_STROKE, 'stroke-width': 1.8 }));
      svg.appendChild(svgEl('line', { x1: cx + r, y1: topY, x2: cx + r, y2: botY, stroke: MATH_STROKE, 'stroke-width': 1.8 }));
      svg.appendChild(svgEl('ellipse', { cx, cy: botY, rx: r, ry: r * 0.35, ...solidAttrs }));
      svg.appendChild(svgEl('path', { d: `M ${cx - r} ${topY} A ${r} ${r * 0.35} 0 0 0 ${cx + r} ${topY}`, ...dashAttrs }));
      svg.appendChild(svgEl('path', { d: `M ${cx - r} ${topY} A ${r} ${r * 0.35} 0 0 1 ${cx + r} ${topY}`, fill: DIAGRAM_COLORS.solid, stroke: MATH_STROKE, 'stroke-width': 1.8 }));
      if (labels.radius) { svg.appendChild(svgEl('line', { x1: cx, y1: botY, x2: cx + r, y2: botY, stroke: MATH_ACCENT, 'stroke-width': 1.2 })); svg.appendChild(textEl(cx + r / 2, botY + 14, labels.radius, { 'font-size': 11, fill: MATH_ACCENT })); }
      if (labels.height) svg.appendChild(textEl(cx - r - 16, cy, labels.height, { 'font-size': 12, 'text-anchor': 'end' }));
    } else if (shape === 'cone') {
      const r = dims.radius || 40, h = dims.height || 90;
      const apex = [cx, cy - h / 2];
      const botY = cy + h / 2;
      svg.appendChild(svgEl('ellipse', { cx, cy: botY, rx: r, ry: r * 0.35, ...solidAttrs }));
      svg.appendChild(svgEl('line', { x1: apex[0], y1: apex[1], x2: cx - r, y2: botY, stroke: MATH_STROKE, 'stroke-width': 1.8 }));
      svg.appendChild(svgEl('line', { x1: apex[0], y1: apex[1], x2: cx + r, y2: botY, stroke: MATH_STROKE, 'stroke-width': 1.8 }));
      svg.appendChild(svgEl('line', { x1: cx, y1: botY, x2: apex[0], y2: apex[1], ...dashAttrs }));
      if (labels.height) svg.appendChild(textEl(cx + 14, (apex[1] + botY) / 2, labels.height, { 'font-size': 11, fill: MATH_ACCENT, 'text-anchor': 'start' }));
      if (labels.radius) svg.appendChild(textEl(cx + r / 2, botY + 16, labels.radius, { 'font-size': 11, fill: MATH_ACCENT }));
    } else if (shape === 'sphere') {
      const r = dims.radius || 60;
      svg.appendChild(svgEl('circle', { cx, cy, r, ...solidAttrs }));
      svg.appendChild(svgEl('ellipse', { cx, cy, rx: r, ry: r * 0.3, fill: 'none', stroke: MATH_STROKE, 'stroke-width': 1, 'stroke-dasharray': '3,2' }));
      if (labels.radius) { svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: cx + r, y2: cy, stroke: MATH_ACCENT, 'stroke-width': 1.2 })); svg.appendChild(textEl(cx + r / 2, cy - 8, labels.radius, { 'font-size': 11, fill: MATH_ACCENT })); }
    } else if (shape === 'pyramid') {
      const base = dims.base || 90, h = dims.height || 90;
      const apex = [cx, cy - h / 2];
      const b1 = [cx - base / 2, cy + h / 3], b2 = [cx + base / 2 - 20, cy + h / 3 - 15], b3 = [cx + base / 2, cy + h / 2], b4 = [cx - base / 2 + 20, cy + h / 2 + 15];
      svg.appendChild(svgEl('polygon', { points: [b1, b2, b3, b4].map((p) => p.join(',')).join(' '), ...dashAttrs }));
      [b1, b2, b3, b4].forEach((b, i) => {
        svg.appendChild(svgEl('line', { x1: apex[0], y1: apex[1], x2: b[0], y2: b[1], stroke: MATH_STROKE, 'stroke-width': i === 2 ? 1.8 : 1.8 }));
      });
      if (labels.height) svg.appendChild(textEl(apex[0] + 14, (apex[1] + b3[1]) / 2, labels.height, { 'font-size': 11, fill: MATH_ACCENT, 'text-anchor': 'start' }));
    } else {
      throw new DiagramError('ไม่รู้จัก shape ของ solid: ' + shape);
    }
    return svg;
  },
});

// ===================== numberline =====================
registerDiagram({
  type: 'numberline',
  aliases: ['number-line'],
  guide: `เส้นจำนวน: {"type":"numberline","min":-5,"max":5,"points":[{"value":2,"filled":true,"label":"2"}],
  "intervals":[{"from":-1,"to":3,"fromOpen":true,"toOpen":false}]}
- points: filled=จุดทึบ(≤,≥), false=จุดโปร่ง(<,>)
- intervals: ช่วงแรเงา from/to, xxxOpen=true ปลายเปิด`,
  render(spec) {
    const min = spec.min ?? -5, max = spec.max ?? 5;
    const W = 400, H = 90, pad = 30;
    const x = (v) => pad + ((v - min) / (max - min)) * (W - pad * 2);
    const y = 45;
    const svg = baseSvg(W, H);
    svg.appendChild(arrow(pad - 10, y, W - pad + 10, y, { color: MATH_STROKE }));
    for (let v = Math.ceil(min); v <= max; v++) {
      svg.appendChild(svgEl('line', { x1: x(v), y1: y - 5, x2: x(v), y2: y + 5, stroke: MATH_STROKE, 'stroke-width': 1 }));
      svg.appendChild(textEl(x(v), y + 22, v, { 'font-size': 12 }));
    }
    (spec.intervals || []).forEach((iv) => {
      svg.appendChild(svgEl('line', { x1: x(iv.from), y1: y, x2: x(iv.to), y2: y, stroke: MATH_ACCENT, 'stroke-width': 4 }));
    });
    (spec.points || []).forEach((p) => {
      svg.appendChild(svgEl('circle', { cx: x(p.value), cy: y, r: 6, fill: p.filled === false ? DIAGRAM_COLORS.canvas : MATH_ACCENT, stroke: MATH_ACCENT, 'stroke-width': 2 }));
      if (p.label) svg.appendChild(textEl(x(p.value), y - 14, p.label, { 'font-size': 12, fill: MATH_ACCENT }));
    });
    (spec.intervals || []).forEach((iv) => {
      if (iv.fromOpen !== undefined) svg.appendChild(svgEl('circle', { cx: x(iv.from), cy: y, r: 6, fill: iv.fromOpen ? DIAGRAM_COLORS.canvas : MATH_ACCENT, stroke: MATH_ACCENT, 'stroke-width': 2 }));
      if (iv.toOpen !== undefined) svg.appendChild(svgEl('circle', { cx: x(iv.to), cy: y, r: 6, fill: iv.toOpen ? DIAGRAM_COLORS.canvas : MATH_ACCENT, stroke: MATH_ACCENT, 'stroke-width': 2 }));
    });
    return svg;
  },
});

// ===================== chart =====================
registerDiagram({
  type: 'chart',
  aliases: ['bar-chart', 'pie-chart', 'graph-chart'],
  guide: `แผนภูมิข้อมูล: {"type":"chart","kind":"bar","data":[{"label":"จ.","value":5},{"label":"อ.","value":8}],"xLabel":"วัน","yLabel":"จำนวน"}
- kind: "bar"|"line"|"pie"|"scatter"|"histogram"
- scatter ใช้ data เป็น [{"x":1,"y":2}], อื่นๆ ใช้ {"label","value"}`,
  render(spec) {
    const kind = spec.kind || 'bar';
    const data = spec.data || [];
    const W = 360, H = 300, pad = 45;
    const svg = baseSvg(W, H);
    if (kind === 'pie') {
      const total = data.reduce((s, d) => s + d.value, 0) || 1;
      const cx = W / 2 - 40, cy = H / 2, r = 90;
      let ang = -Math.PI / 2;
      data.forEach((d, i) => {
        const slice = (d.value / total) * 2 * Math.PI;
        const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
        const x2 = cx + r * Math.cos(ang + slice), y2 = cy + r * Math.sin(ang + slice);
        const large = slice > Math.PI ? 1 : 0;
        svg.appendChild(svgEl('path', { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, fill: PALETTE[i % PALETTE.length], stroke: DIAGRAM_COLORS.separator, 'stroke-width': 1.5 }));
        const midAng = ang + slice / 2;
        svg.appendChild(svgEl('circle', { cx: W - 55, cy: 30 + i * 20, r: 6, fill: PALETTE[i % PALETTE.length] }));
        svg.appendChild(textEl(W - 42, 34 + i * 20, `${d.label} (${d.value})`, { 'font-size': 11, 'text-anchor': 'start' }));
        ang += slice;
      });
      return svg;
    }
    const values = kind === 'scatter' ? data.map((d) => d.y) : data.map((d) => d.value);
    const maxV = Math.max(...values, 1) * 1.15;
    const minV = kind === 'scatter' ? Math.min(0, ...values) : 0;
    const plotW = W - pad * 2, plotH = H - pad * 2;
    const xVals = kind === 'scatter' ? data.map((d) => d.x) : data.map((_, i) => i);
    const minX = kind === 'scatter' ? Math.min(...xVals) : -0.5;
    const maxX = kind === 'scatter' ? Math.max(...xVals) : data.length - 0.5;
    const sx = (v) => pad + ((v - minX) / (maxX - minX || 1)) * plotW;
    const sy = (v) => H - pad - ((v - minV) / (maxV - minV)) * plotH;
    svg.appendChild(svgEl('line', { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: MATH_STROKE, 'stroke-width': 1.5 }));
    svg.appendChild(svgEl('line', { x1: pad, y1: pad, x2: pad, y2: H - pad, stroke: MATH_STROKE, 'stroke-width': 1.5 }));
    if (spec.xLabel) svg.appendChild(textEl(W / 2, H - 6, spec.xLabel, { 'font-size': 11 }));
    if (spec.yLabel) svg.appendChild(textEl(14, pad - 10, spec.yLabel, { 'font-size': 11, 'text-anchor': 'start' }));

    if (kind === 'bar' || kind === 'histogram') {
      const bw = (plotW / data.length) * 0.6;
      data.forEach((d, i) => {
        const x = sx(i) - bw / 2;
        const y = sy(d.value);
        svg.appendChild(svgEl('rect', { x, y, width: bw, height: H - pad - y, fill: PALETTE[i % PALETTE.length] }));
        svg.appendChild(textEl(sx(i), H - pad + 16, d.label, { 'font-size': 11 }));
        svg.appendChild(textEl(sx(i), y - 6, d.value, { 'font-size': 10, fill: DIAGRAM_COLORS.muted }));
      });
    } else if (kind === 'line') {
      const pts = data.map((d, i) => `${sx(i)},${sy(d.value)}`).join(' ');
      svg.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: PALETTE[0], 'stroke-width': 2 }));
      data.forEach((d, i) => {
        svg.appendChild(svgEl('circle', { cx: sx(i), cy: sy(d.value), r: 3.5, fill: PALETTE[0] }));
        svg.appendChild(textEl(sx(i), H - pad + 16, d.label, { 'font-size': 11 }));
      });
    } else if (kind === 'scatter') {
      data.forEach((d) => svg.appendChild(svgEl('circle', { cx: sx(d.x), cy: sy(d.y), r: 4, fill: PALETTE[0] })));
    }
    return svg;
  },
});

// ===================== venn =====================
registerDiagram({
  type: 'venn',
  aliases: ['venn-diagram', 'sets'],
  guide: `แผนภาพเวนน์ (2-3 เซต): {"type":"venn","sets":[{"label":"A","items":"2,4,6"},{"label":"B","items":"3,6,9"}],"universe":"1..10"}
- sets: 2 หรือ 3 เซต, items คือข้อความที่จะแสดงในวงกลม (เขียนเป็น string ตามต้องการ ไม่ต้องคำนวณ intersection เอง ระบบวาดวงซ้อนให้)
- universe: label มุมบนซ้ายแสดงเซตทั้งหมด (ถ้ามี)
- both: (เฉพาะ 2 เซต) ข้อความในส่วนที่ซ้อนกัน เช่น "6" หรือ "ทั้งสองแบบ" (ถ้ามี)
- items ยาวเป็นประโยคได้ คั่นแต่ละข้อด้วย , หรือส่งเป็น array ระบบตัดบรรทัดและขยายวงให้พอดีเอง`,
  render(spec) {
    const sets = (spec.sets || []).slice(0, 3);
    if (sets.length === 3) return renderVenn3(spec, sets);
    return renderVenn2(spec, sets);
  },
});

const VENN_FONT = 12;
const VENN_LINE = 16;
const VENN_ITEM_GAP = 4;
const VENN_PAD = 10;

// items: array หรือ string — ข้อสั้นๆ (เช่น "2,4,6") จับรวมบรรทัดเดียวกัน ข้อยาวขึ้นบรรทัดใหม่ทีละข้อ
function vennItems(raw) {
  if (raw == null || raw === '') return [];
  const list = Array.isArray(raw)
    ? raw.map((x) => String(x).trim())
    : String(raw).split(/[\n;,]/).map((x) => x.trim());
  return list.filter(Boolean);
}

function vennLines(raw, width) {
  const items = vennItems(raw);
  if (!items.length) return [];
  if (items.every((x) => x.length <= 6)) {
    return wrapTextLines(items.join(', '), width, VENN_FONT).map((text) => ({ text, gap: 0 }));
  }
  const out = [];
  items.forEach((item, i) => {
    wrapTextLines(item, width, VENN_FONT).forEach((text, j) => out.push({ text, gap: i > 0 && j === 0 ? VENN_ITEM_GAP : 0 }));
  });
  return out;
}

function vennBlockHeight(lines) {
  return lines.reduce((h, l) => h + VENN_LINE + l.gap, 0);
}

// วางบรรทัดให้กึ่งกลางแนวตั้งที่ cy; xAt(y) บอกจุดกึ่งกลางแนวนอนของบรรทัดที่ระดับ y
function drawVennLines(svg, lines, cy, xAt) {
  let y = cy - vennBlockHeight(lines) / 2;
  lines.forEach((l) => {
    y += l.gap;
    const mid = y + VENN_LINE / 2;
    svg.appendChild(textEl(xAt(mid - cy), mid + VENN_FONT * 0.35, l.text, { 'font-size': VENN_FONT }));
    y += VENN_LINE;
  });
}

function maxLineWidth(lines) {
  return lines.reduce((m, l) => Math.max(m, measureTextWidth(l.text, VENN_FONT)), 0);
}

// 2 เซต (หรือ 1): ใช้วงรีที่สูงขึ้นได้ตามปริมาณข้อความ ความกว้างรูปจึงไม่บานจนตัวหนังสือเล็กบนมือถือ
// ส่วนเฉพาะของแต่ละวงกว้างคงที่ = ระยะห่างจุดศูนย์กลาง d ทุกระดับ y ส่วนซ้อนกว้าง 2·rx·√(1−y²/ry²) − d
function renderVenn2(spec, sets) {
  const two = sets.length === 2;
  const hasBoth = two && vennItems(spec.both || spec.intersection).length > 0;
  let layout = null;
  for (const rx of [85, 100, 115, 130]) {
    const d = two ? rx * (hasBoth ? 1.15 : 1.4) : 0;
    const soloW = (two ? d : rx * 1.6) - VENN_PAD * 2;
    const solo = sets.map((s) => vennLines(s.items, soloW));
    const soloH = Math.max(0, ...solo.map(vennBlockHeight));
    let ry = Math.max(rx * 0.85, soloH / 1.5);
    let both = [];
    if (hasBoth) {
      for (let tries = 0; tries < 40; tries++, ry += 6) {
        const half = (h) => 2 * rx * Math.sqrt(Math.max(0, 1 - (h / ry) ** 2)) - d - VENN_PAD * 2;
        let w = half(0);
        for (let k = 0; k < 4 && w > 20; k++) {
          both = vennLines(spec.both || spec.intersection, w);
          const need = half(vennBlockHeight(both) / 2);
          if (maxLineWidth(both) <= need) { w = -1; break; }
          w = need;
        }
        if (w === -1) break;
      }
    }
    layout = { rx, ry, d, solo, both };
    if (ry <= rx * 1.35 && Math.max(...solo.map((l) => l.length)) <= 6) break;
  }
  const { rx, ry, d, solo, both } = layout;

  const margin = 20;
  const top = spec.universe ? 52 : 34;
  const W = Math.round(2 * rx + d + margin * 2);
  const H = Math.round(top + 2 * ry + margin);
  const cy = top + ry;
  const cxs = two ? [W / 2 - d / 2, W / 2 + d / 2] : [W / 2];
  const svg = baseSvg(W, H);
  if (spec.universe) {
    svg.appendChild(svgEl('rect', { x: 5, y: 5, width: W - 10, height: H - 10, fill: 'none', stroke: MATH_STROKE, 'stroke-width': 1.5 }));
    svg.appendChild(textEl(16, 22, spec.universe, { 'font-size': 11, 'text-anchor': 'start' }));
  }
  sets.forEach((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    svg.appendChild(svgEl('ellipse', { cx: cxs[i], cy, rx, ry, fill: color, opacity: 0.25, stroke: color, 'stroke-width': 2 }));
  });
  const edge = (y) => rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2));
  sets.forEach((s, i) => {
    // ชื่อเซตอยู่เหนือส่วนเฉพาะของวงตัวเอง (ไม่ใช่กลางวง) จะได้ไม่ชนกัน
    const labelX = two ? cxs[i] + (i === 0 ? -1 : 1) * rx * 0.4 : cxs[i];
    svg.appendChild(textEl(labelX, cy - ry - 8, s.label, { 'font-size': 13, 'font-weight': 'bold' }));
    if (!solo[i].length) return;
    if (two) {
      drawVennLines(svg, solo[i], cy, (y) => (i === 0 ? cxs[0] - edge(y) + d / 2 : cxs[1] + edge(y) - d / 2));
    } else {
      drawVennLines(svg, solo[i], cy, () => cxs[0]);
    }
  });
  if (both.length) drawVennLines(svg, both, cy, () => W / 2);
  return svg;
}

// 3 เซต: วงกลมวางเป็นสามเหลี่ยมด้านเท่า ด้าน = r ข้อความของแต่ละเซตอยู่ในส่วนเฉพาะด้านนอก
function renderVenn3(spec, sets) {
  let r = 80;
  let lines;
  for (; r <= 150; r += 10) {
    lines = sets.map((s) => vennLines(s.items, r * 0.75));
    if (Math.max(...lines.map(vennBlockHeight)) <= r * 0.6) break;
  }
  r = Math.min(r, 150);
  const dist = r / Math.sqrt(3);
  const dirs = [[-Math.sqrt(3) / 2, -0.5], [Math.sqrt(3) / 2, -0.5], [0, 1]];
  const margin = 24;
  const top = spec.universe ? 52 : 34;
  const W = Math.round(2 * (dist * Math.sqrt(3) / 2 + r) + margin * 2);
  const H = Math.round(top + (dist * 0.5 + r) + (dist + r) + margin + 16);
  const gx = W / 2;
  const gy = top + dist * 0.5 + r;
  const svg = baseSvg(W, H);
  if (spec.universe) {
    svg.appendChild(svgEl('rect', { x: 5, y: 5, width: W - 10, height: H - 10, fill: 'none', stroke: MATH_STROKE, 'stroke-width': 1.5 }));
    svg.appendChild(textEl(16, 22, spec.universe, { 'font-size': 11, 'text-anchor': 'start' }));
  }
  sets.forEach((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    const [ux, uy] = dirs[i];
    svg.appendChild(svgEl('circle', { cx: gx + ux * dist, cy: gy + uy * dist, r, fill: color, opacity: 0.25, stroke: color, 'stroke-width': 2 }));
  });
  sets.forEach((s, i) => {
    const [ux, uy] = dirs[i];
    const labelX = i === 2 ? gx : gx + ux * (dist + r * 0.55);
    const labelY = i === 2 ? gy + dist + r + 16 : gy + uy * dist - r - 8;
    svg.appendChild(textEl(labelX, labelY, s.label, { 'font-size': 13, 'font-weight': 'bold' }));
    if (lines[i].length) {
      const t = dist + r * 0.5;
      drawVennLines(svg, lines[i], gy + uy * t, () => gx + ux * t);
    }
  });
  return svg;
}

// ===================== tree (probability / classification / factor tree) =====================
registerDiagram({
  type: 'tree',
  aliases: ['tree-diagram', 'probability-tree', 'factor-tree'],
  guide: `แผนภาพต้นไม้: {"type":"tree","direction":"horizontal","root":"เริ่ม","children":[
  {"label":"A","edgeLabel":"1/2","children":[{"label":"AA","edgeLabel":"1/2"},{"label":"AB","edgeLabel":"1/2"}]},
  {"label":"B","edgeLabel":"1/2"}
]}
- direction: "horizontal"(ซ้าย→ขวา) หรือ "vertical"(บน→ล่าง) ค่าเริ่มต้น horizontal
- edgeLabel: ป้ายกำกับกิ่ง (เช่น ความน่าจะเป็น) ไม่ใส่ก็ได้`,
  render(spec) {
    const horizontal = (spec.direction || 'horizontal') === 'horizontal';
    // คำนวณความลึก/จำนวนใบเพื่อกำหนดขนาด
    function countLeaves(node) {
      if (!node.children || !node.children.length) return 1;
      return node.children.reduce((s, c) => s + countLeaves(c), 0);
    }
    function depth(node) {
      if (!node.children || !node.children.length) return 1;
      return 1 + Math.max(...node.children.map(depth));
    }
    const root = { label: spec.root || '', children: spec.children || [] };
    const leaves = countLeaves(root);
    const dep = depth(root);
    const levelGap = 110, leafGap = 55;
    const W = horizontal ? dep * levelGap + 60 : leaves * leafGap + 60;
    const H = horizontal ? leaves * leafGap + 40 : dep * levelGap + 40;
    const svg = baseSvg(Math.max(W, 160), Math.max(H, 120));

    let leafCursor = 0;
    function layout(node, level) {
      let x, y;
      if (!node.children || !node.children.length) {
        const pos = leafCursor * leafGap + leafGap / 2 + 10;
        leafCursor++;
        x = horizontal ? level * levelGap + 40 : pos;
        y = horizontal ? pos : level * levelGap + 30;
        node._x = x; node._y = y;
        return;
      }
      node.children.forEach((c) => layout(c, level + 1));
      const first = node.children[0], last = node.children[node.children.length - 1];
      if (horizontal) { x = level * levelGap + 40; y = (first._y + last._y) / 2; }
      else { x = (first._x + last._x) / 2; y = level * levelGap + 30; }
      node._x = x; node._y = y;
    }
    layout(root, 0);

    function draw(node) {
      (node.children || []).forEach((c) => {
        svg.appendChild(svgEl('line', { x1: node._x, y1: node._y, x2: c._x, y2: c._y, stroke: MATH_STROKE, 'stroke-width': 1.5 }));
        if (c.edgeLabel) {
          const mx = (node._x + c._x) / 2, my = (node._y + c._y) / 2;
          svg.appendChild(textEl(mx, my - 6, c.edgeLabel, { 'font-size': 11, fill: MATH_ACCENT }));
        }
        draw(c);
      });
      svg.appendChild(svgEl('circle', { cx: node._x, cy: node._y, r: 4, fill: MATH_STROKE }));
      svg.appendChild(textEl(node._x, node._y - 10, node.label, { 'font-size': 12, 'text-anchor': horizontal ? 'start' : 'middle', dx: horizontal ? 8 : 0 }));
    }
    draw(root);
    return svg;
  },
});

// ===================== fraction =====================
registerDiagram({
  type: 'fraction',
  aliases: ['fraction-model'],
  guide: `แบบจำลองเศษส่วน: {"type":"fraction","style":"bar","total":8,"shaded":3,"label":"3/8"}
- style: "bar"(แท่งแบ่งช่อง) | "circle"(วงกลมแบ่งเสี้ยว) | "grid"(ตาราง เหมาะกับ total เป็นเลขกำลังสอง เช่น 9,16)
- ถ้าเป็นเศษเกิน (shaded > total เช่น 5/3) ระบบจะวาดหลายรูปทั้งหมดต่อกันให้เองแทนรูปเดียว (เช่น 5/3 → รูปเต็ม 3/3 หนึ่งรูป ต่อด้วย 2/3)`,
  render(spec) {
    const total = spec.total || 4;
    const shaded = spec.shaded || 0;
    const style = spec.style || 'bar';
    const wholes = Math.max(1, Math.ceil(shaded / total)); // เศษเกิน: แบ่งเป็นหลายรูปเต็ม
    const W = (style === 'bar' ? 220 : 150) * wholes + (wholes - 1) * 16;
    const H = style === 'bar' ? 90 : 190;
    const svg = baseSvg(W, H);
    for (let g = 0; g < wholes; g++) {
      const shadedHere = Math.max(0, Math.min(total, shaded - g * total));
      const offsetX = style === 'bar' ? g * (220 + 16) : g * (150 + 16);
      drawFractionWhole(svg, style, total, shadedHere, offsetX);
    }
    if (spec.label) svg.appendChild(textEl(W / 2, H - 6, spec.label, { 'font-size': 13, 'font-weight': 'bold' }));
    return svg;
  },
});

function drawFractionWhole(svg, style, total, shaded, offsetX) {
  if (style === 'bar') {
    const W = 220;
    const w = (W - 20) / total;
    for (let i = 0; i < total; i++) {
      svg.appendChild(svgEl('rect', { x: offsetX + 10 + i * w, y: 20, width: w, height: 40, fill: i < shaded ? MATH_ACCENT : DIAGRAM_COLORS.canvas, stroke: MATH_STROKE, 'stroke-width': 1.5 }));
    }
  } else if (style === 'circle') {
    const W = 150, H = 190;
    const cx = offsetX + W / 2, cy = H / 2 - 10, r = 65;
    for (let i = 0; i < total; i++) {
      const a1 = (2 * Math.PI * i) / total - Math.PI / 2;
      const a2 = (2 * Math.PI * (i + 1)) / total - Math.PI / 2;
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      svg.appendChild(svgEl('path', { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`, fill: i < shaded ? MATH_ACCENT : DIAGRAM_COLORS.canvas, stroke: MATH_STROKE, 'stroke-width': 1.2 }));
    }
  } else {
    const W = 150;
    const side = Math.round(Math.sqrt(total)) || 1;
    const cell = (W - 20) / side;
    for (let i = 0; i < total; i++) {
      const gx = i % side, gy = Math.floor(i / side);
      svg.appendChild(svgEl('rect', { x: offsetX + 10 + gx * cell, y: 10 + gy * cell, width: cell, height: cell, fill: i < shaded ? MATH_ACCENT : DIAGRAM_COLORS.canvas, stroke: MATH_STROKE, 'stroke-width': 1.2 }));
    }
  }
}
