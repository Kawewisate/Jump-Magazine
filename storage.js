// เก็บข้อมูลทั้งหมดไว้ที่ localStorage ของเบราว์เซอร์เท่านั้น ไม่มีการส่งข้อมูลไปเซิร์ฟเวอร์ใดๆ

const STORAGE_KEYS = {
  SETTINGS: 'teacherAI_settings',
  SESSIONS: 'teacherAI_sessions',
  THEME: 'teacherAI_theme',
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'deepseek/deepseek-v4-flash-0731',
  reasoningEffort: 'medium',
};

const storageCache = new Map();
let storageMemoryOnly = false;
let storageNoticeSent = false;

function markStorageUnavailable() {
  storageMemoryOnly = true;
  if (storageNoticeSent) return;
  storageNoticeSent = true;
  try {
    window.dispatchEvent(new Event('teacherai-storage-unavailable'));
  } catch {
    // The app can still operate in memory during tests or restricted contexts.
  }
}

function readStorage(key) {
  if (storageCache.has(key)) return storageCache.get(key);
  if (storageMemoryOnly || typeof localStorage === 'undefined') {
    markStorageUnavailable();
    return null;
  }
  try {
    const value = localStorage.getItem(key);
    storageCache.set(key, value);
    return value;
  } catch {
    markStorageUnavailable();
    return null;
  }
}

function writeStorage(key, value) {
  storageCache.set(key, value);
  if (storageMemoryOnly || typeof localStorage === 'undefined') {
    markStorageUnavailable();
    return false;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    markStorageUnavailable();
    return false;
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSettings(value) {
  if (!isPlainObject(value)) return { ...DEFAULT_SETTINGS };
  const reasoningEffort = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(value.reasoningEffort)
    ? value.reasoningEffort
    : DEFAULT_SETTINGS.reasoningEffort;
  return {
    ...DEFAULT_SETTINGS,
    apiKey: typeof value.apiKey === 'string' ? value.apiKey : DEFAULT_SETTINGS.apiKey,
    model: typeof value.model === 'string' && value.model.trim() ? value.model : DEFAULT_SETTINGS.model,
    reasoningEffort,
  };
}

function normalizeSession(value) {
  if (!isPlainObject(value) || typeof value.id !== 'string' || !value.id || !['lesson', 'exercise'].includes(value.mode)) return null;
  const messages = Array.isArray(value.messages)
    ? value.messages.filter((m) => isPlainObject(m) && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    : [];
  const session = { ...value, messages };
  if (value.exerciseSets && isPlainObject(value.exerciseSets)) {
    session.exerciseSets = Object.fromEntries(Object.entries(value.exerciseSets).filter(([, set]) =>
      isPlainObject(set) && ['pending', 'streaming', 'repairing', 'done', 'error'].includes(set.status) && typeof set.content === 'string'
    ));
  }
  return session;
}

function getSettings() {
  try {
    const raw = readStorage(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  writeStorage(STORAGE_KEYS.SETTINGS, JSON.stringify(normalizeSettings(settings)));
}

function getTheme() {
  return readStorage(STORAGE_KEYS.THEME) === 'night' ? 'night' : 'day';
}

function saveTheme(theme) {
  writeStorage(STORAGE_KEYS.THEME, theme === 'night' ? 'night' : 'day');
}

function getSessions() {
  try {
    const raw = readStorage(STORAGE_KEYS.SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeSession).filter(Boolean) : [];
  } catch {
    return [];
  }
}

let storageFullWarned = false;

function saveSessions(sessions) {
  try {
    // ไม่เก็บ reasoning (ความคิดของโมเดล) ลง storage — ยาวมากและกินพื้นที่ localStorage (~5MB) เร็ว
    const json = JSON.stringify(sessions, (key, value) => (key === 'reasoning' ? undefined : value));
    writeStorage(STORAGE_KEYS.SESSIONS, json);
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
