// แปลงข้อความที่กำลัง stream ให้ซ่อน JSON ดิบของรูปประกอบ โดยสแกนเฉพาะส่วนท้ายที่เพิ่มมาใหม่
// (บล็อกที่ปิดสมบูรณ์แล้วจะถูก "ตรึง" ไว้ ไม่ต้องสแกนซ้ำทุก token) — ผลลัพธ์ต้องเหมือนการสแกนทั้งข้อความทุกประการ

const DIAGRAM_STREAM_PLACEHOLDER = '[🖼️ กำลังวาดรูปประกอบ...]';

function convertStreamingChunk(text) {
  let out = text.replace(/```(diagram|mermaid)\n[\s\S]*?```/g, DIAGRAM_STREAM_PLACEHOLDER);
  const openFence = out.match(/```(diagram|mermaid)\n[\s\S]*$/);
  if (openFence) {
    out = out.slice(0, openFence.index) + DIAGRAM_STREAM_PLACEHOLDER;
  }
  return out;
}

function createStreamingTextConverter() {
  let settledSource = ''; // ส่วนต้นที่ปิดบล็อกครบแล้ว (ต้นฉบับ)
  let settledOutput = ''; // ผลแปลงของส่วนต้นนั้น
  return function convert(fullText) {
    const text = String(fullText || '');
    if (!text.startsWith(settledSource)) {
      settledSource = '';
      settledOutput = '';
    }
    const tail = text.slice(settledSource.length);
    if (tail.indexOf('```') === -1) return settledOutput + tail; // ไม่มี fence เลย: ไม่ต้องรัน regex
    const result = settledOutput + convertStreamingChunk(tail);
    // ตรึงถึงท้ายบล็อกที่ปิดแล้วอันสุดท้ายของ tail
    let lastEnd = -1;
    const closed = /```(diagram|mermaid)\n[\s\S]*?```/g;
    let m;
    while ((m = closed.exec(tail))) lastEnd = m.index + m[0].length;
    if (lastEnd > 0) {
      const settledTail = tail.slice(0, lastEnd);
      settledOutput += convertStreamingChunk(settledTail);
      settledSource += settledTail;
    }
    return result;
  };
}

// คืนบรรทัดที่ "ปิดครบแล้ว" (จบด้วย \n) ที่ยังไม่เคยส่งออกไปนับจาก committedLen ของ text เดิม
// รวมถึงส่วนท้ายที่ยังไม่จบบรรทัด (tail) — ล้วน pure function เพื่อทดสอบได้โดยไม่ต้องมี DOM
// คุณสมบัติ: lines.join('\n') + (lines.length ? '\n' : '') + tail ต้องเท่ากับ text.slice(committedLen) เสมอ
function splitStreamLines(committedLen, text) {
  const newText = String(text || '').slice(committedLen);
  const lastNewline = newText.lastIndexOf('\n');
  if (lastNewline === -1) {
    return { lines: [], tail: newText, newCommittedLen: committedLen };
  }
  const lines = newText.slice(0, lastNewline).split('\n');
  const tail = newText.slice(lastNewline + 1);
  return { lines, tail, newCommittedLen: committedLen + lastNewline + 1 };
}

const ZERO_WIDTH_SPACE = '​';

// Renderer ที่เขียน DOM ทีละบรรทัดใหม่แทนการตั้ง textContent ทั้งก้อนทุกเฟรม
// บรรทัดที่ปิดแล้ว (จบด้วย \n) จะถูกสร้างเป็น <div class="stream-line"> ครั้งเดียวแล้วไม่แตะอีก
// มีแค่บรรทัดสุดท้าย (tail) เท่านั้นที่ถูกเขียนทับทุกครั้ง — ผลลัพธ์ที่มองเห็นเหมือนตั้ง textContent เป๊ะ
// doc: เผื่อฉีด document ปลอมเข้ามาตอนเทสต์ (ไม่มี DOM จริงใน node)
function createStreamingTextRenderer(container, doc) {
  const ownerDoc = doc || (typeof document !== 'undefined' ? document : container && container.ownerDocument) || null;
  let committedLen = 0;
  let sourceText = '';
  let tailNode = null;

  function reset() {
    tailNode = ownerDoc.createElement('div');
    tailNode.className = 'stream-line';
    if (container.replaceChildren) container.replaceChildren(tailNode);
    else {
      container.textContent = '';
      container.appendChild(tailNode);
    }
    committedLen = 0;
    sourceText = '';
  }

  reset();

  return function render(fullText) {
    const text = String(fullText || '');
    if (text === sourceText) return;
    if (!text.startsWith(sourceText)) reset();
    const { lines, tail, newCommittedLen } = splitStreamLines(committedLen, text);
    if (lines.length) {
      const frag = ownerDoc.createDocumentFragment();
      lines.forEach((line) => {
        const div = ownerDoc.createElement('div');
        div.className = 'stream-line';
        div.textContent = line.length ? line : ZERO_WIDTH_SPACE;
        frag.appendChild(div);
      });
      container.insertBefore(frag, tailNode);
      committedLen = newCommittedLen;
    }
    tailNode.textContent = tail;
    sourceText = text;
  };
}
