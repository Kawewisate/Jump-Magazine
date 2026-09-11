// เรียก OpenRouter Chat Completions API ตรงจาก browser (ไม่มี backend คั่นกลาง)

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const CONFIRM_TRIGGER_MESSAGE =
  'ครูยืนยันแผนแล้ว กรุณาสร้างเนื้อหาการสอนฉบับเต็มตามแผนที่ตกลงกัน';

function buildLessonSystemPrompt() {
  return `คุณคือผู้ช่วยครูผู้เชี่ยวชาญด้านการออกแบบหลักสูตรและสื่อการสอนสำหรับโรงเรียนไทย การทำงานของคุณแบ่งเป็น 2 ขั้นตอนตามบริบทการสนทนา:

ขั้นที่ 1 — เมื่อครูเพิ่งบอกชื่อบทเรียน/รายละเอียด/ข้อแม้ (หรือขอให้แก้ไขแผนที่เสนอไป): ให้ตอบเฉพาะ (ก) แผนการสอนโดยสรุป (จุดประสงค์การเรียนรู้, ระดับชั้นที่เหมาะสม, ระยะเวลาที่แนะนำ, สื่อ/อุปกรณ์) (ข) สารบัญเนื้อหาแบบคร่าวๆ เป็นหัวข้อ-หัวข้อย่อย และ (ค) รูปประกอบที่วางแผนจะวาด (ถ้ามี) เขียนสั้นๆ เป็นข้อๆ ว่าจะมีรูปอะไรบ้างประกอบหัวข้อไหน (ไม่ต้องใส่โค้ด JSON ในขั้นนี้) เขียนเป็นภาษาไทย กระชับ ชัดเจน จบด้วยคำถามว่าต้องการแก้ไขอะไรเพิ่มหรือไม่ ห้ามเขียนเนื้อหาบทเรียนฉบับเต็มในขั้นตอนนี้เด็ดขาด

ขั้นที่ 2 — เมื่อครูส่งข้อความว่า "${CONFIRM_TRIGGER_MESSAGE}": ให้เขียนเนื้อหาการสอนฉบับเต็มตามสารบัญที่ตกลงกันไว้ก่อนหน้านี้ เป็นเนื้อหา text ล้วนสำหรับใช้พิมพ์เป็นเอกสารประกอบการสอน แบ่งหัวข้อ/หัวข้อย่อยชัดเจนตามสารบัญ อธิบายละเอียดเข้าใจง่ายเหมาะกับระดับชั้นที่ระบุ หากมีสูตรคณิตศาสตร์/วิทยาศาสตร์ (โดยเฉพาะระดับมัธยมปลาย) ให้เขียนด้วย LaTeX โดยใช้ $...$ สำหรับสูตรในบรรทัดเดียว และ $$...$$ สำหรับสูตรแยกบรรทัด แทรกรูปประกอบตามที่วางแผนไว้ในขั้นที่ 1 ตามกติกาการวาดรูปด้านล่าง ห้ามใส่ข้อความทักทาย คุย หรือคำถามใดๆ ในขั้นตอนนี้ ให้เขียนเนื้อหาล้วนๆ เท่านั้น

${buildDiagramGuide()}`;
}

const EXERCISE_LEVEL_SPECS = {
  1: 'ระดับ 1: ง่ายมากที่สุด (ปูพื้นฐาน) — สร้างโจทย์แบบ quiz ง่ายๆ อย่างน้อย 12-15 ข้อ เน้นความจำ/ความเข้าใจพื้นฐานล้วนๆ คำถามสั้น ตรงไปตรงมา ห้ามมีการประยุกต์ซับซ้อน เหมาะเป็นด่านแรกให้นักเรียนที่ยังไม่มั่นใจในเนื้อหาเลย',
  2: 'ระดับ 2: ปานกลาง (ทั่วไป) — สร้างโจทย์แบบฝึกหัดทั่วไป อย่างน้อย 10-12 ข้อ ความยากระดับปกติที่พบในแบบฝึกหัดท้ายบทเรียนทั่วไป ต้องใช้ความเข้าใจและคำนวณ/วิเคราะห์บ้าง แต่ไม่ซับซ้อนมาก',
  3: 'ระดับ 3: ประยุกต์ — สร้างโจทย์อย่างน้อย 8-10 ข้อ ระดับความยากเทียบเท่าข้อสอบทั่วไปในโรงเรียน ต้องผสมผสานหลายแนวคิดเข้าด้วยกัน มีโจทย์ประยุกต์กับสถานการณ์จริงปนอยู่ด้วย',
  4: 'ระดับ 4: ศึกษาต่อ (ยากที่สุด) — สร้างโจทย์อย่างน้อย 5-8 ข้อ ระดับความยากเทียบเท่าข้อสอบคัดเลือกเข้ามหาวิทยาลัยหรือข้อสอบแข่งขันระดับมัธยมปลาย ต้องยากมากๆ ซับซ้อนหลายขั้นตอน ผสมผสานหลายบทเรียนเข้าด้วยกันถ้าเหมาะสม ยากถึงระดับที่นักเรียนทั่วไปแทบทำไม่ได้เลย ให้ใส่เฉลยละเอียดท้ายชุดเพราะโจทย์ยากมาก',
};

function buildExerciseSystemPrompt(level) {
  return `คุณคือผู้ช่วยครูออกแบบแบบฝึกหัดสำหรับนักเรียนไทย ครูจะบอกชื่อบทเรียน/รายละเอียด (และอาจแนบเอกสารอ้างอิง) มาให้ คุณต้องสร้างแบบฝึกหัดตามระดับความยากที่กำหนดไว้เท่านั้น ตอบเป็น text ล้วน มีเลขข้อกำกับชัดเจน ห้ามเขียนคำอธิบายอื่นนอกจากโจทย์และเฉลย ใช้ LaTeX ($...$ สำหรับในบรรทัด, $$...$$ สำหรับแยกบรรทัด) กับสูตรคณิตศาสตร์/วิทยาศาสตร์ถ้ามี ถ้าข้อไหนมีคำว่า "ดังรูป" หรือจำเป็นต้องมีรูปประกอบเพื่อให้ทำโจทย์ได้ ให้แทรกรูปประกอบทันทีหลังโจทย์ข้อนั้นตามกติกาการวาดรูปด้านล่าง

${EXERCISE_LEVEL_SPECS[level]}

${buildDiagramGuide()}`;
}

// ---------- Diagram repair / edit ----------

function buildDiagramRepairSystemPrompt() {
  return `คุณคือผู้ช่วยแก้โค้ด JSON ของรูปประกอบ (diagram) ที่วาดไม่สำเร็จ ให้แก้เฉพาะ JSON ให้ถูกต้องตามสเปคด้านล่าง โดยคงความหมาย/ตัวเลข/label เดิมไว้ให้มากที่สุด ตอบกลับเป็น JSON object เดียวเท่านั้น ห้ามมีข้อความอื่น ห้ามใส่ \`\`\` ล้อมรอบ

${buildDiagramGuide()}`;
}

function buildDiagramRepairUserPrompt(type, source, errorMessage) {
  return `รูปประกอบชนิด "${type}" นี้วาดไม่สำเร็จ เพราะ: ${errorMessage}

โค้ด JSON เดิม:
${source}

กรุณาแก้ไขให้ถูกต้องแล้วตอบ JSON object ที่แก้แล้วมาเท่านั้น`;
}

function buildDiagramEditSystemPrompt() {
  return `คุณคือผู้ช่วยแก้ไขรูปประกอบ (diagram) ตามคำขอของครู ให้แก้ JSON ตามคำสั่งที่ได้รับ โดยคงส่วนอื่นที่ไม่เกี่ยวข้องไว้เหมือนเดิม ตอบกลับเป็น JSON object เดียวเท่านั้น ห้ามมีข้อความอื่น ห้ามใส่ \`\`\` ล้อมรอบ

${buildDiagramGuide()}`;
}

function buildDiagramEditUserPrompt(source, instruction) {
  return `โค้ด JSON ของรูปประกอบเดิม:
${source}

คำขอแก้ไขจากครู: ${instruction}

กรุณาแก้ไขแล้วตอบ JSON object ที่แก้แล้วมาเท่านั้น`;
}

// เรียก API แบบรอผลลัพธ์เดียวจบ (ห่อ callOpenRouterStream เป็น Promise) ใช้กับงานสั้นๆ เช่นซ่อม/แก้รูป
function callOpenRouterText(messages) {
  return new Promise((resolve, reject) => {
    callOpenRouterStream(messages, {
      onDone: (fullText) => resolve(fullText),
      onError: (err) => reject(err),
    });
  });
}

// ตัดรั้ว ```json ... ``` หรือ ```...``` ที่โมเดลอาจใส่มาแม้บอกว่าห้ามแล้ว
function stripCodeFence(text) {
  const trimmed = (text || '').trim();
  const m = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : trimmed;
}

function buildAttachmentBlock(attachmentName, attachmentText) {
  if (!attachmentText) return '';
  return `\n\n[เอกสารอ้างอิงที่ครูอัปโหลด: ${attachmentName}]\n${attachmentText}\n[จบเอกสารอ้างอิง]`;
}

// เรียก callback ของ UI แยกจาก try ของ network — ถ้าฝั่ง UI พัง จะได้ไม่ถูกนับเป็น error ของ API
// แล้วไปเขียนทับเนื้อหาที่เจนเสร็จแล้วด้วยข้อความ error
function safeCallback(fn, ...args) {
  if (!fn) return;
  try {
    fn(...args);
  } catch (err) {
    console.error(err);
  }
}

/**
 * เรียก OpenRouter แบบ streaming (SSE)
 * callbacks: onReasoningToken(text), onToken(delta, fullText), onDone(fullText), onError(err)
 */
async function callOpenRouterStream(messages, callbacks) {
  const { onReasoningToken, onToken, onDone, onError } = callbacks;
  const settings = getSettings();

  if (!settings.apiKey) {
    safeCallback(onError, new Error('กรุณาตั้งค่า OpenRouter API key ในหน้า Settings ก่อนใช้งาน'));
    return;
  }

  let fullText = '';
  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.href,
        'X-Title': 'Teacher AI Assistant',
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        reasoning: { effort: settings.reasoningEffort },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`เรียก API ไม่สำเร็จ (${resp.status}): ${errText.slice(0, 300)}`);
    }

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        return;
      }
      // OpenRouter ส่ง error กลางสตรีมมาเป็น chunk ที่มี field "error" (HTTP status ยังเป็น 200)
      if (json.error) {
        throw new Error(`โมเดลตอบกลับด้วยข้อผิดพลาด: ${json.error.message || JSON.stringify(json.error)}`);
      }
      const delta = json.choices && json.choices[0] && json.choices[0].delta;
      if (!delta) return;
      if (delta.reasoning) {
        safeCallback(onReasoningToken, delta.reasoning);
      }
      if (delta.content) {
        fullText += delta.content;
        safeCallback(onToken, delta.content, fullText);
      }
    };

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handleLine);
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer);

    if (!fullText) {
      throw new Error('โมเดลไม่ส่งคำตอบกลับมา ลองใหม่อีกครั้ง หรือเปลี่ยนโมเดลในหน้าตั้งค่า');
    }
  } catch (err) {
    safeCallback(onError, err);
    return;
  }

  safeCallback(onDone, fullText);
}
