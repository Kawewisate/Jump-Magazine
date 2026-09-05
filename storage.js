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

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
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
