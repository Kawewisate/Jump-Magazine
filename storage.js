// เก็บข้อมูลทั้งหมดไว้ที่ localStorage ของเบราว์เซอร์เท่านั้น ไม่มีการส่งข้อมูลไปเซิร์ฟเวอร์ใดๆ

const STORAGE_KEYS = {
  SETTINGS: 'teacherAI_settings',
  SESSIONS: 'teacherAI_sessions',
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'deepseek/deepseek-v4-flash-0731',
  reasoningEffort: 'medium',
};

function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

function getSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

let storageFullWarned = false;

function saveSessions(sessions) {
  try {
    // ไม่เก็บ reasoning (ความคิดของโมเดล) ลง storage — ยาวมากและกินพื้นที่ localStorage (~5MB) เร็ว
    const json = JSON.stringify(sessions, (key, value) => (key === 'reasoning' ? undefined : value));
    localStorage.setItem(STORAGE_KEYS.SESSIONS, json);
    storageFullWarned = false;
  } catch (err) {
    console.error(err);
    if (!storageFullWarned) {
      storageFullWarned = true;
      alert('บันทึกประวัติงานไม่สำเร็จ — พื้นที่เก็บข้อมูลของเบราว์เซอร์อาจเต็ม ลองลบงานเก่าที่ไม่ใช้แล้วในแถบประวัติงาน');
    }
  }
}

function upsertSession(session) {
  const sessions = getSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.unshift(session);
  saveSessions(sessions);
}

function deleteSession(id) {
  saveSessions(getSessions().filter((s) => s.id !== id));
}

function createSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
