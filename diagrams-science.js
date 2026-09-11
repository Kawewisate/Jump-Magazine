// Renderers: blocks, incline, pulley, fbd, circuit, optics, atom, molecule

const SCI_STROKE = '#2D2A26';
const SCI_ACCENT = '#D97757';
const SCI_FORCE = '#B3432B';
const SCI_TENSION = '#3B6EA5';

function hatchPattern(id, angle = 45) {
  return svgEl(
    'pattern',
    { id, width: 8, height: 8, patternTransform: `rotate(${angle})`, patternUnits: 'userSpaceOnUse' },
    [svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: SCI_STROKE, 'stroke-width': 1.2 })]
  );
}

function groundHatch(x1, x2, y, id) {
  const g = svgEl('g');
  const defs = svgEl('defs', {}, [hatchPattern(id)]);
  g.appendChild(defs);
  g.appendChild(svgEl('line', { x1, y1: y, x2, y2: y, stroke: SCI_STROKE, 'stroke-width': 2 }));
  g.appendChild(svgEl('rect', { x: x1, y, width: x2 - x1, height: 14, fill: `url(#${id})` }));
  g.appendChild(svgEl('line', { x1, y1: y, x2, y2: y, stroke: SCI_STROKE, 'stroke-width': 2 }));
  return g;
}

// ===================== blocks =====================
// วัตถุวางเรียง/ซ้อนกันบนพื้น มีเชือกผูกกำแพง/สปริง/แรงกระทำ — ตรงกับภาพตัวอย่างของผู้ใช้
registerDiagram({
  type: 'blocks',
  aliases: ['block-system', 'stacked-blocks'],
  guide: `แสดงวัตถุก้อนสี่เหลี่ยมวางบนพื้น (และอาจซ้อนกันได้). โครงสร้าง:
{"type":"blocks","wall":true,"blocks":[
  {"id":"A","label":"10.0 kg","on":"B","width":70,"height":50},
  {"id":"B","label":"20.0 kg","width":110,"height":60}
],"ropes":[{"from":"wall","to":"A","label":""}],
"forces":[{"on":"B","dir":"right","label":"100 N","value":100}],
"surface":"rough"}
- "on" ใส่ id ของก้อนที่มันวางทับอยู่ (ไม่ใส่ = วางบนพื้น) ก้อนที่ "on" จะถูกจัดวางซ้อนให้อัตโนมัติ
- blocks เรียงจากซ้ายไปขวาตามลำดับที่ให้มาบนพื้นเดียวกัน (ที่ไม่ได้ on ก้อนอื่น)
- ropes: from/to เป็น "wall"(ซ้าย) หรือ id ก้อน, มี label แรงตึงได้
- forces: on=id ก้อน, dir เป็น "right"|"left"|"up"|"down", label เป็นข้อความ เช่น "100 N"
- surface: "rough"(มีเส้นลายพื้นผิวขรุขระ) หรือ "smooth"(เส้นเรียบ) ค่าเริ่มต้น "rough"
- wall: true เพื่อวาดกำแพงด้านซ้าย`,
  render(spec) {
    const blocks = spec.blocks || [];
    const byId = {};
    blocks.forEach((b) => (byId[b.id] = b));
    const groundBlocks = blocks.filter((b) => !b.on);
    const groundY = 220;
    const wallX = spec.wall ? 60 : 20;
    let cursorX = wallX + (spec.wall ? 40 : 20);
    const gap = 50;
    groundBlocks.forEach((b) => {
      const w = b.width || 90;
      b._x = cursorX;
      b._w = w;
      b._h = b.height || 55;
      b._y = groundY - b._h;
      cursorX += w + gap;
    });
    // วางก้อนที่ on อยู่บนก้อนอื่น (ซ้อนกึ่งกลาง)
    blocks
      .filter((b) => b.on)
      .forEach((b) => {
        const base = byId[b.on];
        if (!base) return;
        const w = b.width || Math.max(50, (base._w || 90) * 0.6);
        b._w = w;
        b._h = b.height || 45;
        b._x = (base._x || 0) + ((base._w || 90) - w) / 2;
        b._y = (base._y || groundY) - b._h;
      });

    const totalW = Math.max(cursorX + 20, wallX + 300);
    const svg = baseSvg(totalW, 320);
    svg.appendChild(groundHatch(0, totalW, groundY, 'blocks-ground'));
    if (spec.wall) {
      const defs = svgEl('defs', {}, [hatchPattern('blocks-wall', -45)]);
      svg.appendChild(defs);
      svg.appendChild(svgEl('rect', { x: 10, y: groundY - 160, width: 20, height: 160, fill: 'url(#blocks-wall)' }));
      svg.appendChild(svgEl('line', { x1: 30, y1: groundY - 160, x2: 30, y2: groundY, stroke: SCI_STROKE, 'stroke-width': 2 }));
    }

    const rough = (spec.surface || 'rough') !== 'smooth';
    blocks.forEach((b) => {
      svg.appendChild(
        svgEl('rect', {
          x: b._x,
          y: b._y,
          width: b._w,
          height: b._h,
          fill: '#FFFFFF',
          stroke: SCI_STROKE,
          'stroke-width': 2,
          rx: 3,
        })
      );
      svg.appendChild(multilineText(b._x + b._w / 2, b._y + b._h / 2 + 5, b.label || b.id, { 'font-size': 14 }));
      if (rough && !b.on) {
        for (let x = b._x + 6; x < b._x + b._w - 4; x += 10) {
          svg.appendChild(svgEl('line', { x1: x, y1: b._y + b._h, x2: x - 6, y2: b._y + b._h + 8, stroke: SCI_STROKE, 'stroke-width': 1 }));
        }
      }
    });

    (spec.ropes || []).forEach((r) => {
      const toB = byId[r.to];
      if (!toB) return;
      const fromX = r.from === 'wall' ? 30 : (byId[r.from] ? byId[r.from]._x + byId[r.from]._w : 30);
      const y = toB._y + toB._h / 2;
      svg.appendChild(svgEl('line', { x1: fromX, y1: y, x2: toB._x, y2: y, stroke: SCI_TENSION, 'stroke-width': 2, 'stroke-dasharray': '1,0' }));
      if (r.label) svg.appendChild(textEl((fromX + toB._x) / 2, y - 10, r.label, { fill: SCI_TENSION, 'font-size': 13 }));
    });

    (spec.forces || []).forEach((f) => {
      const b = byId[f.on];
      if (!b) return;
      const cy = b._y + b._h / 2;
      const cx = b._x + b._w / 2;
      const len = 60;
      let x1 = cx, y1 = cy, x2 = cx, y2 = cy;
      if (f.dir === 'right') { x1 = b._x + b._w; x2 = x1 + len; }
      else if (f.dir === 'left') { x1 = b._x; x2 = x1 - len; }
      else if (f.dir === 'up') { y1 = b._y; y2 = y1 - len; }
      else if (f.dir === 'down') { y1 = b._y + b._h; y2 = y1 + len; }
      svg.appendChild(arrow(x1, y1, x2, y2, { color: SCI_FORCE, width: 2.5 }));
      const lx = (x1 + x2) / 2;
      const ly = f.dir === 'up' ? y2 - 8 : f.dir === 'down' ? y2 + 16 : y2 - 8;
      svg.appendChild(textEl(lx, ly, f.label || '', { fill: SCI_FORCE, 'font-size': 13 }));
    });

    return svg;
  },
});

// ===================== incline =====================
registerDiagram({
  type: 'incline',
  aliases: ['inclined-plane', 'ramp'],
  guide: `พื้นเอียงมีวัตถุอยู่บนพื้นเอียง: {"type":"incline","angle":30,"label":"m = 5 kg","forces":["weight","normal","friction"],"pulley":false}
- angle: มุมเป็นองศา (10-60 แนะนำ)
- forces: เลือกจาก "weight"(mg ลงแนวดิ่ง),"normal"(N ตั้งฉากพื้นเอียง),"friction"(f ขนานพื้นเอียง),"applied"(แรงลากขนานพื้นเอียง)
- pulley: true ถ้ามีลูกรอกที่ปลายบนพื้นเอียงต่อเชือกไปห้อยมวลอีกก้อน (hangingLabel ระบุ label มวลที่ห้อย)`,
  render(spec) {
    const angle = (spec.angle || 30) * (Math.PI / 180);
    const W = 420, H = 300;
    const baseY = 260, baseX1 = 30, baseX2 = 380;
    const topX = baseX1, topY = baseY - (baseX2 - baseX1) * Math.tan(angle);
    const svg = baseSvg(W, H);
    svg.appendChild(svgEl('polygon', { points: `${baseX1},${topY} ${baseX2},${baseY} ${baseX1},${baseY}`, fill: '#F0EBE1', stroke: SCI_STROKE, 'stroke-width': 2 }));
    svg.appendChild(groundHatch(baseX1, baseX2, baseY, 'incline-ground'));
    // มุม arc
    svg.appendChild(svgEl('path', { d: `M ${baseX1 + 40} ${baseY} A 40 40 0 0 0 ${baseX1 + 40 * Math.cos(angle)} ${baseY - 40 * Math.sin(angle)}`, fill: 'none', stroke: SCI_STROKE, 'stroke-width': 1.2 }));
    svg.appendChild(textEl(baseX1 + 55, baseY - 14, (spec.angle || 30) + '°', { 'font-size': 13 }));

    // ตำแหน่งวัตถุกึ่งกลางพื้นเอียง
    const t = 0.55;
    const bx = baseX1 + (baseX2 - baseX1) * t;
    const by = baseY - (baseX2 - baseX1) * t * Math.tan(angle);
    const bw = 55, bh = 40;
    const cx = bx - (bw / 2) * Math.sin(angle);
    const cy = by - (bh / 2) * Math.cos(angle) - 2;
    const g = svgEl('g', { transform: `translate(${cx} ${cy}) rotate(${-(spec.angle || 30)})` });
    g.appendChild(svgEl('rect', { x: -bw / 2, y: -bh, width: bw, height: bh, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
    g.appendChild(textEl(0, -bh / 2 + 5, spec.label || 'm', { 'font-size': 13 }));
    svg.appendChild(g);

    const forces = spec.forces || ['weight', 'normal'];
    const nx = -Math.sin(angle), ny = -Math.cos(angle); // normal direction (out of incline)
    const px = Math.cos(angle), py = -Math.sin(angle); // along incline (down-slope positive is -px,-py)
    const originX = bx, originY = by - bh / 2 * Math.cos(angle) - 6;
    if (forces.includes('weight')) {
      svg.appendChild(arrow(originX, originY, originX, originY + 55, { color: SCI_FORCE }));
      svg.appendChild(textEl(originX + 18, originY + 60, 'mg', { fill: SCI_FORCE, 'font-size': 13 }));
    }
    if (forces.includes('normal')) {
      svg.appendChild(arrow(originX, originY, originX + nx * 55, originY + ny * 55, { color: SCI_TENSION }));
      svg.appendChild(textEl(originX + nx * 65, originY + ny * 65, 'N', { fill: SCI_TENSION, 'font-size': 13 }));
    }
    if (forces.includes('friction')) {
      svg.appendChild(arrow(originX, originY, originX + px * 45, originY + py * 45, { color: SCI_ACCENT }));
      svg.appendChild(textEl(originX + px * 58, originY + py * 58 - 6, 'f', { fill: SCI_ACCENT, 'font-size': 13 }));
    }
    if (forces.includes('applied')) {
      svg.appendChild(arrow(originX, originY, originX - px * 50, originY - py * 50, { color: '#5B8C3E' }));
      svg.appendChild(textEl(originX - px * 62, originY - py * 62, spec.appliedLabel || 'F', { fill: '#5B8C3E', 'font-size': 13 }));
    }
    if (spec.pulley) {
      svg.appendChild(svgEl('circle', { cx: topX, cy: topY, r: 10, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(svgEl('line', { x1: bx, y1: by - bh * Math.cos(angle), x2: topX, y2: topY, stroke: SCI_TENSION, 'stroke-width': 2 }));
      svg.appendChild(svgEl('line', { x1: topX + 10, y1: topY, x2: topX + 10, y2: topY + 70, stroke: SCI_TENSION, 'stroke-width': 2 }));
      svg.appendChild(svgEl('rect', { x: topX - 5, y: topY + 70, width: 30, height: 30, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(textEl(topX + 10, topY + 90, spec.hangingLabel || 'M', { 'font-size': 12 }));
    }
    return svg;
  },
});

// ===================== pulley =====================
registerDiagram({
  type: 'pulley',
  aliases: ['atwood'],
  guide: `ระบบรอก: {"type":"pulley","style":"atwood","left":"m1 = 2 kg","right":"m2 = 3 kg"}
- style: "atwood" (รอกแขวนลอย มวลสองก้อนคนละข้าง) หรือ "table" (มวลหนึ่งก้อนบนโต๊ะ ต่อเชือกผ่านรอกขอบโต๊ะไปห้อยอีกก้อน)
- left/right หรือ table/hanging: label ของมวลแต่ละก้อน`,
  render(spec) {
    const svg = baseSvg(320, 300);
    if (spec.style === 'table') {
      const tableY = 150, tableX1 = 30, tableX2 = 220;
      svg.appendChild(svgEl('rect', { x: tableX1, y: tableY, width: tableX2 - tableX1, height: 10, fill: '#D9CBB8', stroke: SCI_STROKE }));
      svg.appendChild(svgEl('line', { x1: tableX1 + 10, y1: tableY + 10, x2: tableX1 + 10, y2: 270, stroke: SCI_STROKE, 'stroke-width': 3 }));
      svg.appendChild(svgEl('rect', { x: 100, y: tableY - 35, width: 50, height: 35, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(textEl(125, tableY - 15, spec.table || 'm1', { 'font-size': 12 }));
      svg.appendChild(svgEl('circle', { cx: tableX2, cy: tableY - 10, r: 12, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(svgEl('line', { x1: 150, y1: tableY - 17, x2: tableX2 - 12, y2: tableY - 10, stroke: SCI_TENSION, 'stroke-width': 2 }));
      svg.appendChild(svgEl('line', { x1: tableX2 + 12, y1: tableY - 10, x2: tableX2 + 12, y2: tableY + 60, stroke: SCI_TENSION, 'stroke-width': 2 }));
      svg.appendChild(svgEl('rect', { x: tableX2 - 3, y: tableY + 60, width: 30, height: 40, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(textEl(tableX2 + 12, tableY + 85, spec.hanging || 'm2', { 'font-size': 12 }));
    } else {
      const cx = 160, cy = 40, r = 18;
      svg.appendChild(svgEl('circle', { cx, cy, r, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(svgEl('line', { x1: cx - 4, y1: cy - r - 20, x2: cx - 4, y2: cy - r, stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(svgEl('line', { x1: cx + 4, y1: cy - r - 20, x2: cx + 4, y2: cy - r, stroke: SCI_STROKE, 'stroke-width': 2 }));
      svg.appendChild(svgEl('line', { x1: cx - 10, y1: cy - r - 20, x2: cx + 10, y2: cy - r - 20, stroke: SCI_STROKE, 'stroke-width': 3 }));
      [-1, 1].forEach((side) => {
        const x = cx + side * r;
        svg.appendChild(svgEl('line', { x1: x, y1: cy, x2: x, y2: 180, stroke: SCI_TENSION, 'stroke-width': 2 }));
        svg.appendChild(svgEl('rect', { x: x - 20, y: 180, width: 40, height: 45, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
        svg.appendChild(textEl(x, 205, side < 0 ? spec.left || 'm1' : spec.right || 'm2', { 'font-size': 12 }));
      });
    }
    return svg;
  },
});

// ===================== fbd (free body diagram) =====================
registerDiagram({
  type: 'fbd',
  aliases: ['free-body', 'freebody'],
  guide: `แผนภาพแรงลัพธ์แบบจุด: {"type":"fbd","forces":[{"angle":90,"label":"N","length":60},{"angle":270,"label":"mg"},{"angle":0,"label":"F=20N"},{"angle":200,"label":"f"}],"axes":true}
- angle: องศา วัดทวนเข็มจากแกน x บวก (0=ขวา,90=บน,180=ซ้าย,270=ล่าง)
- length: ทางเลือก ความยาวลูกศร (พิกเซล) ค่าเริ่มต้น 60
- axes: true เพื่อวาดแกน x,y จางๆ อ้างอิง`,
  render(spec) {
    const size = 260;
    const cx = size / 2, cy = size / 2;
    const svg = baseSvg(size, size);
    if (spec.axes) {
      svg.appendChild(svgEl('line', { x1: 15, y1: cy, x2: size - 15, y2: cy, stroke: '#C9C2B4', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
      svg.appendChild(svgEl('line', { x1: cx, y1: 15, x2: cx, y2: size - 15, stroke: '#C9C2B4', 'stroke-width': 1, 'stroke-dasharray': '4,3' }));
    }
    svg.appendChild(svgEl('circle', { cx, cy, r: 5, fill: SCI_STROKE }));
    (spec.forces || []).forEach((f) => {
      const rad = (f.angle || 0) * (Math.PI / 180);
      const len = f.length || 60;
      const x2 = cx + Math.cos(rad) * len;
      const y2 = cy - Math.sin(rad) * len;
      svg.appendChild(arrow(cx, cy, x2, y2, { color: SCI_FORCE, width: 2.5 }));
      const lx = cx + Math.cos(rad) * (len + 16);
      const ly = cy - Math.sin(rad) * (len + 16);
      svg.appendChild(textEl(lx, ly, f.label || '', { fill: SCI_FORCE, 'font-size': 13 }));
    });
    return svg;
  },
});

// ===================== circuit =====================
registerDiagram({
  type: 'circuit',
  aliases: ['electric-circuit'],
  guide: `วงจรไฟฟ้าอย่างง่าย (แบตเตอรี่ + องค์ประกอบต่อเรียง/ขนาน): {"type":"circuit","battery":"12V","path":[
  {"kind":"resistor","label":"R1=2Ω"},
  {"kind":"parallel","branches":[
    [{"kind":"bulb","label":"L1"}],
    [{"kind":"resistor","label":"R2=4Ω"},{"kind":"switch"}]
  ]},
  {"kind":"ammeter"}
]}
- kind ที่รองรับ: "resistor","bulb","switch","ammeter","voltmeter","capacitor","diode","wire"
- path เป็น array เรียงตามลำดับวงจร element "parallel" มี branches เป็น array ของ path ย่อย (ต่อขนานกัน)`,
  render(spec) {
    const path = spec.path || [];
    // เดินสาย horizontal ในกรอบสี่เหลี่ยม แถวบน = องค์ประกอบเรียงกัน, ขนาน = แตกกิ่งแนวตั้ง
    const rowH = 90, elW = 90;
    function layoutPath(p) {
      let width = 0;
      let maxRows = 1;
      const items = p.map((el) => {
        if (el.kind === 'parallel') {
          const subs = el.branches.map(layoutPath);
          const w = Math.max(...subs.map((s) => s.width)) + 40;
          maxRows = Math.max(maxRows, subs.length);
          width += w;
          return { parallel: true, subs, w };
        }
        width += elW;
        maxRows = Math.max(maxRows, 1);
        return { el, w: elW };
      });
      return { items, width, rows: maxRows };
    }
    const layout = layoutPath(path);
    const totalW = Math.max(layout.width + 120, 300);
    const totalH = 100 + layout.rows * rowH;
    const svg = baseSvg(totalW, totalH);
    const topY = 40, botY = totalH - 40;
    const leftX = 40, rightX = totalW - 40;

    // battery ด้านซ้าย (แนวตั้ง)
    svg.appendChild(svgEl('line', { x1: leftX, y1: topY, x2: leftX, y2: cyMid(topY, botY) - 12, stroke: SCI_STROKE, 'stroke-width': 2 }));
    svg.appendChild(svgEl('line', { x1: leftX - 12, y1: cyMid(topY, botY) - 12, x2: leftX + 12, y2: cyMid(topY, botY) - 12, stroke: SCI_STROKE, 'stroke-width': 3 }));
    svg.appendChild(svgEl('line', { x1: leftX - 7, y1: cyMid(topY, botY) - 2, x2: leftX + 7, y2: cyMid(topY, botY) - 2, stroke: SCI_STROKE, 'stroke-width': 1.5 }));
    svg.appendChild(svgEl('line', { x1: leftX, y1: cyMid(topY, botY) + 2, x2: leftX, y2: botY, stroke: SCI_STROKE, 'stroke-width': 2 }));
    svg.appendChild(textEl(leftX - 22, cyMid(topY, botY), spec.battery || '', { 'font-size': 13 }));

    function cyMid(a, b) { return (a + b) / 2; }

    function drawWire(x1, y, x2) {
      svg.appendChild(svgEl('line', { x1, y1: y, x2: x2, y2: y, stroke: SCI_STROKE, 'stroke-width': 2 }));
    }
    function drawElement(kind, label, cx, y) {
      const w = 40;
      drawWire(cx - elW / 2, y, cx - w / 2);
      drawWire(cx + w / 2, y, cx + elW / 2);
      if (kind === 'resistor') {
        const pts = [];
        const n = 6;
        for (let i = 0; i <= n; i++) {
          const x = cx - w / 2 + (w / n) * i;
          const yy = i === 0 || i === n ? y : y + (i % 2 === 0 ? 10 : -10);
          pts.push(`${x},${yy}`);
        }
        svg.appendChild(svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: SCI_STROKE, 'stroke-width': 2 }));
      } else if (kind === 'bulb') {
        svg.appendChild(svgEl('circle', { cx, cy: y, r: w / 2, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
        svg.appendChild(svgEl('line', { x1: cx - 12, y1: y - 12, x2: cx + 12, y2: y + 12, stroke: SCI_STROKE, 'stroke-width': 1.5 }));
        svg.appendChild(svgEl('line', { x1: cx - 12, y1: y + 12, x2: cx + 12, y2: y - 12, stroke: SCI_STROKE, 'stroke-width': 1.5 }));
      } else if (kind === 'switch') {
        svg.appendChild(svgEl('circle', { cx: cx - w / 2, cy: y, r: 3, fill: SCI_STROKE }));
        svg.appendChild(svgEl('circle', { cx: cx + w / 2, cy: y, r: 3, fill: SCI_STROKE }));
        svg.appendChild(svgEl('line', { x1: cx - w / 2, y1: y, x2: cx + w / 2 - 6, y2: y - 14, stroke: SCI_STROKE, 'stroke-width': 2 }));
      } else if (kind === 'ammeter' || kind === 'voltmeter') {
        svg.appendChild(svgEl('circle', { cx, cy: y, r: w / 2, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
        svg.appendChild(textEl(cx, y + 5, kind === 'ammeter' ? 'A' : 'V', { 'font-size': 14, 'font-weight': 'bold' }));
      } else if (kind === 'capacitor') {
        svg.appendChild(svgEl('line', { x1: cx - 5, y1: y - 16, x2: cx - 5, y2: y + 16, stroke: SCI_STROKE, 'stroke-width': 2.5 }));
        svg.appendChild(svgEl('line', { x1: cx + 5, y1: y - 16, x2: cx + 5, y2: y + 16, stroke: SCI_STROKE, 'stroke-width': 2.5 }));
      } else if (kind === 'diode') {
        svg.appendChild(svgEl('polygon', { points: `${cx - 12},${y - 12} ${cx - 12},${y + 12} ${cx + 12},${y}`, fill: '#fff', stroke: SCI_STROKE, 'stroke-width': 2 }));
        svg.appendChild(svgEl('line', { x1: cx + 12, y1: y - 12, x2: cx + 12, y2: y + 12, stroke: SCI_STROKE, 'stroke-width': 2 }));
      }
      if (label) svg.appendChild(textEl(cx, y - w / 2 - 10, label, { 'font-size': 12 }));
    }

    function drawItems(items, x, yTop, yBot) {
      let cx = x;
      const midY = cyMid(yTop, yBot);
      items.forEach((it) => {
        if (it.parallel) {
          const branchX1 = cx;
          const branchX2 = cx + it.w;
          const n = it.subs.length;
          const spanH = yBot - yTop;
          it.subs.forEach((sub, i) => {
                const y = n === 1 ? midY : yTop + (spanH * (i + 0.5)) / n;
            drawWire(branchX1, y, branchX1 + 15);
            drawItems(sub.items, branchX1 + 15, y, y);
            drawWire(branchX2 - 15, y, branchX2);
          });
          svg.appendChild(svgEl('line', { x1: branchX1, y1: yTop, x2: branchX1, y2: yBot, stroke: SCI_STROKE, 'stroke-width': 2 }));
          svg.appendChild(svgEl('line', { x1: branchX2, y1: yTop, x2: branchX2, y2: yBot, stroke: SCI_STROKE, 'stroke-width': 2 }));
          cx = branchX2;
        } else {
          drawElement(it.el.kind, it.el.label, cx + it.w / 2, midY);
          cx += it.w;
        }
      });
      return cx;
    }

    const endX = drawItems(layout.items, leftX + 20, topY, botY);
    drawWire(leftX, topY, leftX + 20);
    drawWire(endX, topY, rightX);
    svg.appendChild(svgEl('line', { x1: rightX, y1: topY, x2: rightX, y2: botY, stroke: SCI_STROKE, 'stroke-width': 2 }));
    drawWire(leftX, botY, rightX);
    return svg;
  },
});

// ===================== optics =====================
registerDiagram({
  type: 'optics',
  aliases: ['lens', 'mirror'],
  guide: `เลนส์/กระจก: {"type":"optics","device":"convex-lens","f":40,"objectDist":60,"objectHeight":30}
- device: "convex-lens" | "concave-lens" | "concave-mirror" | "convex-mirror" | "plane-mirror"
- f: ความยาวโฟกัส (พิกเซลสัมพัทธ์ เช่น 30-60), objectDist: ระยะวัตถุจากเลนส์/กระจก, objectHeight: ความสูงวัตถุ
ระบบจะคำนวณตำแหน่ง/ลักษณะภาพ (จริง/เสมือน) ให้อัตโนมัติจากสูตร 1/f = 1/do + 1/di`,
  render(spec) {
    const W = 480, H = 260, axisY = 130, centerX = 240;
    const f = spec.f || 40;
    const doD = spec.objectDist || 70;
    const hO = spec.objectHeight || 30;
    const svg = baseSvg(W, H);
    svg.appendChild(svgEl('line', { x1: 10, y1: axisY, x2: W - 10, y2: axisY, stroke: '#C9C2B4', 'stroke-width': 1 }));
    const isMirror = (spec.device || '').includes('mirror');
    const isConvexLike = (spec.device || 'convex-lens').startsWith('convex');

    if (isMirror) {
      svg.appendChild(svgEl('line', { x1: centerX, y1: 20, x2: centerX, y2: H - 20, stroke: SCI_STROKE, 'stroke-width': 3 }));
    } else {
      const curve = isConvexLike ? 18 : -18;
      svg.appendChild(
        svgEl('path', {
          d: `M ${centerX} 20 Q ${centerX + curve} ${axisY} ${centerX} ${H - 20} Q ${centerX - curve} ${axisY} ${centerX} 20`,
          fill: '#EAF2F8',
          stroke: SCI_STROKE,
          'stroke-width': 2,
        })
      );
    }
    // F, 2F markers
    [1, 2].forEach((n) => {
      [-1, 1].forEach((side) => {
        const x = centerX + side * f * n;
        if (x > 10 && x < W - 10) {
          svg.appendChild(svgEl('circle', { cx: x, cy: axisY, r: 2.5, fill: SCI_STROKE }));
          svg.appendChild(textEl(x, axisY + 16, n === 1 ? 'F' : '2F', { 'font-size': 11 }));
        }
      });
    });

    // object arrow (ซ้ายของเลนส์/กระจก)
    const oX = centerX - doD;
    svg.appendChild(arrow(oX, axisY, oX, axisY - hO, { color: '#5B8C3E' }));
    svg.appendChild(textEl(oX, axisY - hO - 8, 'วัตถุ', { fill: '#5B8C3E', 'font-size': 11 }));

    // 1/f = 1/do + 1/di  ->  di = f*do/(do-f)
    let di, magnitude, real;
    if (isConvexLike || (isMirror && spec.device === 'concave-mirror')) {
      const denom = doD - f;
      if (Math.abs(denom) < 1e-6) { di = Infinity; } else { di = (f * doD) / denom; }
      real = di > 0;
    } else {
      // concave lens / convex mirror: เสมือนเสมอ
      di = -(f * doD) / (doD + f);
      real = false;
    }
    if (isFinite(di)) {
      magnitude = Math.abs((di / doD) * hO);
      magnitude = Math.min(magnitude, 90);
      const iX = isMirror ? centerX - di : centerX + di;
      const dash = real ? undefined : '4,3';
      const dir = real ? -1 : 1;
      svg.appendChild(arrow(iX, axisY, iX, axisY + dir * magnitude, { color: SCI_FORCE, dash }));
      svg.appendChild(textEl(iX, axisY + dir * magnitude + (dir > 0 ? 16 : -8), real ? 'ภาพจริง' : 'ภาพเสมือน', { fill: SCI_FORCE, 'font-size': 11 }));
      // principal rays
      svg.appendChild(svgEl('line', { x1: oX, y1: axisY - hO, x2: centerX, y2: axisY - hO, stroke: '#8AA0B8', 'stroke-width': 1, 'stroke-dasharray': '3,2' }));
      svg.appendChild(svgEl('line', { x1: centerX, y1: axisY - hO, x2: iX, y2: axisY + dir * magnitude, stroke: '#8AA0B8', 'stroke-width': 1, 'stroke-dasharray': '3,2' }));
      svg.appendChild(svgEl('line', { x1: oX, y1: axisY - hO, x2: centerX, y2: axisY, stroke: '#8AA0B8', 'stroke-width': 1, 'stroke-dasharray': '3,2' }));
      svg.appendChild(svgEl('line', { x1: centerX, y1: axisY, x2: iX, y2: axisY + dir * magnitude, stroke: '#8AA0B8', 'stroke-width': 1, 'stroke-dasharray': '3,2' }));
    }
    return svg;
  },
});

// ===================== atom (Bohr model) =====================
registerDiagram({
  type: 'atom',
  aliases: ['bohr', 'bohr-model'],
  guide: `แบบจำลองอะตอมโบร์: {"type":"atom","element":"Na","shells":[2,8,1]}
- shells: จำนวนอิเล็กตรอนแต่ละชั้นวงโคจร (ชั้นในสุดก่อน)`,
  render(spec) {
    const shells = spec.shells || [2, 8, 1];
    const size = 40 + shells.length * 45;
    const cx = size, cy = size;
    const svg = baseSvg(size * 2, size * 2);
    svg.appendChild(svgEl('circle', { cx, cy, r: 10, fill: SCI_ACCENT }));
    svg.appendChild(textEl(cx, cy + 4, spec.element || '', { fill: '#fff', 'font-size': 11, 'font-weight': 'bold' }));
    shells.forEach((count, i) => {
      const r = 35 + i * 32;
      svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: '#C9C2B4', 'stroke-width': 1 }));
      for (let k = 0; k < count; k++) {
        const ang = (2 * Math.PI * k) / count + i * 0.3;
        const ex = cx + r * Math.cos(ang);
        const ey = cy + r * Math.sin(ang);
        svg.appendChild(svgEl('circle', { cx: ex, cy: ey, r: 4.5, fill: SCI_TENSION }));
      }
    });
    return svg;
  },
});

// ===================== molecule (SMILES via SmilesDrawer, lazy) =====================
let smilesReady = null;
function ensureSmilesDrawer() {
  if (window.SmilesDrawer) return Promise.resolve();
  if (!smilesReady) {
    smilesReady = loadScriptOnce('https://cdn.jsdelivr.net/npm/smiles-drawer@2.1.7/dist/smiles-drawer.min.js');
  }
  return smilesReady;
}

registerDiagram({
  type: 'molecule',
  aliases: ['smiles', 'structural-formula'],
  guide: `สูตรโครงสร้างสารอินทรีย์จาก SMILES: {"type":"molecule","smiles":"CCO","label":"เอทานอล"}
- smiles: สัญกรณ์ SMILES มาตรฐาน (เช่น น้ำ=O, มีเทน=C, เอทานอล=CCO, เบนซีน=c1ccccc1, กรดอะซิติก=CC(=O)O)`,
  render(spec) {
    // molecule ต้อง async โหลด SmilesDrawer แต่ registry คาดว่า render คืน element ทันที
    // จึงคืน placeholder แล้วอัปเดตทีหลังเมื่อโหลดเสร็จ (renderDiagramsIn จะรอ moleculeReady ด้วย)
    const holder = svgEl('svg', { viewBox: '0 0 300 250', width: 300, height: 250 });
    const placeholderText = textEl(150, 125, 'กำลังวาดโครงสร้าง...', { 'font-size': 12, fill: '#6B6459' });
    holder.appendChild(placeholderText);
    holder._moleculePending = ensureSmilesDrawer().then(() => {
      return new Promise((resolve, reject) => {
        try {
          const options = { width: 300, height: 250, bondThickness: 1.2, atomVisualization: 'default' };
          const drawer = new window.SmilesDrawer.SvgDrawer(options);
          window.SmilesDrawer.parse(
            spec.smiles,
            (tree) => {
              while (holder.firstChild) holder.removeChild(holder.firstChild);
              drawer.draw(tree, holder, 'light', null);
              resolve();
            },
            (err) => reject(new DiagramError('SMILES ไม่ถูกต้อง: ' + err))
          );
        } catch (err) {
          reject(err);
        }
      });
    });
    return holder;
  },
});
