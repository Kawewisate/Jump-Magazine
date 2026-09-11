// รันโจทย์จริงกับ deepseek-v4-flash ผ่าน OpenRouter เพื่อดูว่า guide + renderer ของ "diagram"
// ใช้งานได้จริงกับโมเดลแค่ไหน — บันทึกผลลัพธ์ดิบไว้ที่ tools/eval-out/*.json แล้วให้
// diagram-gallery.html?eval=1 (รันในเบราว์เซอร์ ที่มี parseDiagramSpec/buildDiagramFigure จริง) มา parse+render ตรวจอีกที
//
// ใช้งาน:  OPENROUTER_API_KEY=sk-or-... node tools/eval-diagrams.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(__dirname, 'eval-out');

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('กรุณาตั้งค่า OPENROUTER_API_KEY ก่อนรัน เช่น: OPENROUTER_API_KEY=sk-or-... node tools/eval-diagrams.mjs');
  process.exit(1);
}

// ---------- โหลด buildLessonSystemPrompt/buildExerciseSystemPrompt จากโค้ดจริงของแอป ----------
// diagrams-*.js ลงทะเบียน guide string ตอนโหลด (ไม่แตะ DOM ตอนลงทะเบียน) จึงรันใน vm context แบบไม่มี DOM จริงได้
const context = {};
context.window = context;
context.console = console;
vm.createContext(context);

const filesToLoad = ['diagrams-core.js', 'diagrams-science.js', 'diagrams-math.js', 'diagrams-concept.js', 'api.js'];
for (const f of filesToLoad) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(code, context, { filename: f });
}
// ดึงชื่อ top-level const ออกมาเป็น property ของ context (vm เก็บ let/const ไว้ใน lexical scope เดียวกันข้ามการรันหลายครั้ง)
vm.runInContext(
  `this.__exports = { buildLessonSystemPrompt, buildExerciseSystemPrompt, CONFIRM_TRIGGER_MESSAGE, buildAttachmentBlock, buildDiagramGuide };`,
  context
);
const { buildLessonSystemPrompt, buildExerciseSystemPrompt, CONFIRM_TRIGGER_MESSAGE, buildAttachmentBlock } =
  context.__exports;

console.log('โหลด guide สำเร็จ ความยาว buildDiagramGuide():', context.__exports.buildDiagramGuide().length, 'ตัวอักษร');

// ---------- เรียก OpenRouter (non-streaming เพื่อความง่าย) ----------
const MODEL = 'deepseek/deepseek-v4-flash-0731';

async function callModel(messages) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, stream: false, reasoning: { effort: 'medium' } }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }
  const json = await resp.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('ไม่มี content ในคำตอบ: ' + JSON.stringify(json).slice(0, 300));
  return content;
}

// ---------- หัวข้อทดสอบ ----------
const TOPICS = [
  { topic: 'แรงเสียดทาน - วัตถุสองก้อนซ้อนกันบนพื้น มีเชือกผูกกำแพง (ดังรูปตัวอย่างในหนังสือ)', mode: 'lesson' },
  { topic: 'พื้นเอียงและแรงบนพื้นเอียง (มัธยมปลาย)', mode: 'lesson' },
  { topic: 'วงจรไฟฟ้าเบื้องต้น ตัวต้านทานต่อแบบอนุกรมและขนาน', mode: 'lesson' },
  { topic: 'เลนส์นูนและการเกิดภาพ', mode: 'lesson' },
  { topic: 'กราฟความเร็ว-เวลา (v-t graph) การเคลื่อนที่แนวตรง', mode: 'lesson' },
  { topic: 'ฟังก์ชันกำลังสอง y = ax^2+bx+c และกราฟพาราโบลา', mode: 'lesson' },
  { topic: 'ทฤษฎีบทพีทาโกรัส', mode: 'lesson' },
  { topic: 'ปริมาตรทรงกระบอกและกรวย', mode: 'lesson' },
  { topic: 'เซตและแผนภาพเวนน์-ออยเลอร์', mode: 'lesson' },
  { topic: 'ความน่าจะเป็นเบื้องต้น การโยนเหรียญ 2 ครั้ง', mode: 'lesson' },
  { topic: 'เศษส่วน ป.4 การเปรียบเทียบเศษส่วน', mode: 'lesson' },
  { topic: 'วัฏจักรน้ำในธรรมชาติ', mode: 'lesson' },
  { topic: 'โครงแบบอิเล็กตรอนและแบบจำลองอะตอมของโบร์', mode: 'lesson' },
  { topic: 'สารประกอบอินทรีย์เบื้องต้น แอลกอฮอล์และกรดคาร์บอกซิลิก', mode: 'lesson' },
  { topic: 'อาณาจักรสุโขทัย เส้นเวลาเหตุการณ์สำคัญ', mode: 'lesson' },
  { topic: 'อัลกอริทึมการเรียงลำดับข้อมูล (sorting) เบื้องต้น', mode: 'lesson' },
  // exercise mode: เน้นทดสอบว่าใส่รูปหลังโจทย์ "ดังรูป" ได้ถูกจุด
  { topic: 'แรงและกฎการเคลื่อนที่ของนิวตัน มีโจทย์ระบบวัตถุ 2 ก้อนดังรูป', mode: 'exercise', level: 2 },
  { topic: 'วงจรไฟฟ้ากระแสตรง คำนวณกระแส/แรงดัน จากวงจรที่กำหนดดังรูป', mode: 'exercise', level: 2 },
  { topic: 'รูปสามเหลี่ยมและพีทาโกรัส หาความยาวด้านจากรูปที่กำหนด', mode: 'exercise', level: 2 },
];

async function runTopic(t) {
  const results = [];
  if (t.mode === 'lesson') {
    const sys = buildLessonSystemPrompt();
    const userMsg1 = t.topic;
    console.log('▶ [lesson step1]', t.topic);
    const planReply = await callModel([
      { role: 'system', content: sys },
      { role: 'user', content: userMsg1 },
    ]);
    results.push({ step: 'plan', content: planReply });

    console.log('▶ [lesson step2 - confirm]', t.topic);
    const fullReply = await callModel([
      { role: 'system', content: sys },
      { role: 'user', content: userMsg1 },
      { role: 'assistant', content: planReply },
      { role: 'user', content: CONFIRM_TRIGGER_MESSAGE },
    ]);
    results.push({ step: 'final', content: fullReply });
  } else {
    const sys = buildExerciseSystemPrompt(t.level || 2);
    console.log('▶ [exercise level', t.level || 2, ']', t.topic);
    const reply = await callModel([
      { role: 'system', content: sys },
      { role: 'user', content: t.topic },
    ]);
    results.push({ step: 'exercise-level-' + (t.level || 2), content: reply });
  }
  return results;
}

function countDiagramBlocks(text) {
  return (text.match(/```(diagram|mermaid)\n/g) || []).length;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const indexFiles = [];
  let totalBlocks = 0;
  for (const t of TOPICS) {
    const safeName = t.topic.replace(/[^\w฀-๿]+/g, '_').slice(0, 50);
    const filename = `${t.mode}-${safeName}.json`;
    try {
      const results = await runTopic(t);
      const blockCount = results.reduce((s, r) => s + countDiagramBlocks(r.content), 0);
      totalBlocks += blockCount;
      const record = { topic: t.topic, mode: t.mode, results, blockCount };
      fs.writeFileSync(path.join(OUT_DIR, filename), JSON.stringify(record, null, 2), 'utf8');
      indexFiles.push(filename);
      console.log(`  ✔ ${blockCount} diagram block(s) saved -> ${filename}`);
    } catch (err) {
      console.error(`  ✘ ล้มเหลว: ${err.message}`);
      fs.writeFileSync(
        path.join(OUT_DIR, filename),
        JSON.stringify({ topic: t.topic, mode: t.mode, error: err.message, results: [] }, null, 2),
        'utf8'
      );
      indexFiles.push(filename);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(indexFiles, null, 2), 'utf8');
  console.log(`\nเสร็จสิ้น: ${indexFiles.length} หัวข้อ, รวม ${totalBlocks} diagram block(s)`);
  console.log('เปิด diagram-gallery.html?eval=1 ในเบราว์เซอร์ (ผ่าน static server) เพื่อดูผล parse/render จริง');
}

main().catch((err) => {
  console.error('เกิดข้อผิดพลาดร้ายแรง:', err);
  process.exit(1);
});
