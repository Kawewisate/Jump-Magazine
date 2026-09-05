// เรียก OpenRouter Chat Completions API ตรงจาก browser (ไม่มี backend คั่นกลาง)

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const CONFIRM_TRIGGER_MESSAGE =
  'ครูยืนยันแผนแล้ว กรุณาสร้างเนื้อหาการสอนฉบับเต็มตามแผนที่ตกลงกัน';

function buildLessonSystemPrompt() {
  return `คุณคือผู้ช่วยครูผู้เชี่ยวชาญด้านการออกแบบหลักสูตรและสื่อการสอนสำหรับโรงเรียนไทย การทำงานของคุณแบ่งเป็น 2 ขั้นตอนตามบริบทการสนทนา:

ขั้นที่ 1 — เมื่อครูเพิ่งบอกชื่อบทเรียน/รายละเอียด/ข้อแม้ (หรือขอให้แก้ไขแผนที่เสนอไป): ให้ตอบเฉพาะ (ก) แผนการสอนโดยสรุป (จุดประสงค์การเรียนรู้, ระดับชั้นที่เหมาะสม, ระยะเวลาที่แนะนำ, สื่อ/อุปกรณ์) และ (ข) สารบัญเนื้อหาแบบคร่าวๆ เป็นหัวข้อ-หัวข้อย่อย เขียนเป็นภาษาไทย กระชับ ชัดเจน จบด้วยคำถามว่าต้องการแก้ไขอะไรเพิ่มหรือไม่ ห้ามเขียนเนื้อหาบทเรียนฉบับเต็มในขั้นตอนนี้เด็ดขาด

ขั้นที่ 2 — เมื่อครูส่งข้อความว่า "${CONFIRM_TRIGGER_MESSAGE}": ให้เขียนเนื้อหาการสอนฉบับเต็มตามสารบัญที่ตกลงกันไว้ก่อนหน้านี้ เป็นเนื้อหา text ล้วนสำหรับใช้พิมพ์เป็นเอกสารประกอบการสอน แบ่งหัวข้อ/หัวข้อย่อยชัดเจนตามสารบัญ อธิบายละเอียดเข้าใจง่ายเหมาะกับระดับชั้นที่ระบุ หากมีสูตรคณิตศาสตร์/วิทยาศาสตร์ (โดยเฉพาะระดับมัธยมปลาย) ให้เขียนด้วย LaTeX โดยใช้ $...$ สำหรับสูตรในบรรทัดเดียว และ $$...$$ สำหรับสูตรแยกบรรทัด ห้ามใส่ข้อความทักทาย คุย หรือคำถามใดๆ ในขั้นตอนนี้ ให้เขียนเนื้อหาล้วนๆ เท่านั้น`;
}

const EXERCISE_LEVEL_SPECS = {
  1: 'ระดับ 1: ง่ายมากที่สุด (ปูพื้นฐาน) — สร้างโจทย์แบบ quiz ง่ายๆ อย่างน้อย 12-15 ข้อ เน้นความจำ/ความเข้าใจพื้นฐานล้วนๆ คำถามสั้น ตรงไปตรงมา ห้ามมีการประยุกต์ซับซ้อน เหมาะเป็นด่านแรกให้นักเรียนที่ยังไม่มั่นใจในเนื้อหาเลย',
  2: 'ระดับ 2: ปานกลาง (ทั่วไป) — สร้างโจทย์แบบฝึกหัดทั่วไป อย่างน้อย 10-12 ข้อ ความยากระดับปกติที่พบในแบบฝึกหัดท้ายบทเรียนทั่วไป ต้องใช้ความเข้าใจและคำนวณ/วิเคราะห์บ้าง แต่ไม่ซับซ้อนมาก',
  3: 'ระดับ 3: ประยุกต์ — สร้างโจทย์อย่างน้อย 8-10 ข้อ ระดับความยากเทียบเท่าข้อสอบทั่วไปในโรงเรียน ต้องผสมผสานหลายแนวคิดเข้าด้วยกัน มีโจทย์ประยุกต์กับสถานการณ์จริงปนอยู่ด้วย',
  4: 'ระดับ 4: ศึกษาต่อ (ยากที่สุด) — สร้างโจทย์อย่างน้อย 5-8 ข้อ ระดับความยากเทียบเท่าข้อสอบคัดเลือกเข้ามหาวิทยาลัยหรือข้อสอบแข่งขันระดับมัธยมปลาย ต้องยากมากๆ ซับซ้อนหลายขั้นตอน ผสมผสานหลายบทเรียนเข้าด้วยกันถ้าเหมาะสม ยากถึงระดับที่นักเรียนทั่วไปแทบทำไม่ได้เลย ให้ใส่เฉลยละเอียดท้ายชุดเพราะโจทย์ยากมาก',
};

function buildExerciseSystemPrompt(level) {
  return `คุณคือผู้ช่วยครูออกแบบแบบฝึกหัดสำหรับนักเรียนไทย ครูจะบอกชื่อบทเรียน/รายละเอียด (และอาจแนบเอกสารอ้างอิง) มาให้ คุณต้องสร้างแบบฝึกหัดตามระดับความยากที่กำหนดไว้เท่านั้น ตอบเป็น text ล้วน มีเลขข้อกำกับชัดเจน ห้ามเขียนคำอธิบายอื่นนอกจากโจทย์และเฉลย ใช้ LaTeX ($...$ สำหรับในบรรทัด, $$...$$ สำหรับแยกบรรทัด) กับสูตรคณิตศาสตร์/วิทยาศาสตร์ถ้ามี

${EXERCISE_LEVEL_SPECS[level]}`;
}

function buildAttachmentBlock(attachmentName, attachmentText) {
  if (!attachmentText) return '';
  return `\n\n[เอกสารอ้างอิงที่ครูอัปโหลด: ${attachmentName}]\n${attachmentText}\n[จบเอกสารอ้างอิง]`;
}

/**
 * เรียก OpenRouter แบบ streaming (SSE)
 * callbacks: onReasoningToken(text), onToken(delta, fullText), onDone(fullText), onError(err)
 */
async function callOpenRouterStream(messages, callbacks) {
  const { onReasoningToken, onToken, onDone, onError } = callbacks;
  const settings = getSettings();

  if (!settings.apiKey) {
    onError(new Error('กรุณาตั้งค่า OpenRouter API key ในหน้า Settings ก่อนใช้งาน'));
    return;
  }

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

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = json.choices && json.choices[0] && json.choices[0].delta;
        if (!delta) continue;
        if (delta.reasoning && onReasoningToken) {
          onReasoningToken(delta.reasoning);
        }
        if (delta.content) {
          fullText += delta.content;
          onToken(delta.content, fullText);
        }
      }
    }

    onDone(fullText);
  } catch (err) {
    onError(err);
  }
}
