// ตัวควบคุมหลักของแอป: sidebar/session, การเดินเรื่องของโหมด 1 และโหมด 2, การเชื่อม settings

let currentSession = null; // session ที่เปิดดูอยู่
let activeSession = null; // session ที่กำลังเจนอยู่ (ผู้ใช้อาจสลับไปดูงานอื่นระหว่างรอได้)
let isBusy = false;
let pendingAttachment = null; // { name, text }
let isReadingAttachment = false;
let sessionListAnimated = false;
let attachReadSeq = 0; // กันผลอ่านไฟล์เก่ามาทับ เมื่อเลือกไฟล์ใหม่/เปลี่ยนงานระหว่างอ่าน

const el = {
  sessionList: document.getElementById('session-list'),
  btnNewLesson: document.getElementById('btn-new-lesson'),
  btnNewExercise: document.getElementById('btn-new-exercise'),
  welcomeScreen: document.getElementById('welcome-screen'),
  chatView: document.getElementById('chat-view'),
  chatMessages: document.getElementById('chat-messages'),
  sessionTitleDisplay: document.getElementById('session-title-display'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  sendBtn: document.getElementById('send-btn'),
  attachBtn: document.getElementById('attach-btn'),
  attachInput: document.getElementById('attach-input'),
  attachChip: document.getElementById('attach-chip'),
  btnSettings: document.getElementById('btn-settings'),
  themeToggle: document.getElementById('theme-toggle'),
  settingsModal: document.getElementById('settings-modal'),
  settingsForm: document.getElementById('settings-form'),
  settingsApiKey: document.getElementById('settings-apikey'),
  settingsModel: document.getElementById('settings-model'),
  modelChips: document.querySelectorAll('.model-chip'),
  settingsReasoning: document.getElementById('settings-reasoning'),
  settingsEffects: document.getElementById('settings-effects'),
  settingsCancel: document.getElementById('settings-cancel'),
  printOverlay: document.getElementById('print-overlay'),
  printClose: document.getElementById('print-close'),
  printBtn: document.getElementById('print-btn'),
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  hamburgerBtn: document.getElementById('hamburger-btn'),
};

const CHAT_SCROLL_BOTTOM_TOLERANCE = 48;

function isChatNearBottom(container = el.chatMessages) {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= CHAT_SCROLL_BOTTOM_TOLERANCE;
}

function scrollChatToBottom(container = el.chatMessages) {
  if (container) container.scrollTop = container.scrollHeight;
}

function captureChatScrollState() {
  return {
    shouldFollow: isChatNearBottom(),
    scrollTop: el.chatMessages ? el.chatMessages.scrollTop : 0,
  };
}

function restoreChatScrollState(state) {
  if (!state || state.shouldFollow) {
    scrollChatToBottom();
    chatFollowBottom = true;
    return;
  }
  el.chatMessages.scrollTop = state.scrollTop;
  chatFollowBottom = false;
}

// ผู้ใช้อยู่ท้ายแชตไหม — จำค่าไว้จาก scroll event แทนการวัด scrollHeight ทุก token (กัน forced layout)
let chatFollowBottom = true;

// รวมการเขียน DOM ระหว่าง stream ให้เหลือครั้งเดียวต่อเฟรม: ตัวเขียนต้อง idempotent (อ่านสถานะล่าสุดตอน flush)
const pendingUiUpdates = new Map();
let uiUpdateFrame = 0;

function scheduleUiUpdate(key, fn, { follow = false } = {}) {
  pendingUiUpdates.set(key, { fn, follow });
  if (uiUpdateFrame) return;
  uiUpdateFrame = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(flushUiUpdates)
    : setTimeout(flushUiUpdates, 16);
}

function cancelUiUpdates(keys) {
  if (keys) keys.forEach((key) => pendingUiUpdates.delete(key));
  else pendingUiUpdates.clear();
}

function flushUiUpdates() {
  uiUpdateFrame = 0;
  if (!pendingUiUpdates.size) return;
  const updates = [...pendingUiUpdates.values()];
  pendingUiUpdates.clear();
  const shouldFollow = chatFollowBottom && updates.some((u) => u.follow);
  updates.forEach((u) => {
    try {
      u.fn();
    } catch (err) {
      console.error(err);
    }
  });
  if (shouldFollow) scrollChatToBottom();
}

function updateChatDuringStream(update, key = 'chat') {
  scheduleUiUpdate(key, update, { follow: true });
}

function init() {
  window.addEventListener('teacherai-storage-unavailable', showStorageNotice, { once: true });
  applyTheme(getTheme());
  window.FX?.init();
  renderSessionList();
  wireEvents();
  window.MotionUI?.revealView(el.welcomeScreen);
  if (!getSettings().apiKey) {
    setTimeout(openSettingsModal, 300);
  }
}

function wireEvents() {
  el.btnNewLesson.addEventListener('click', () => newSession('lesson'));
  el.btnNewExercise.addEventListener('click', () => newSession('exercise'));
  el.chatForm.addEventListener('submit', onFormSubmit);
  el.attachBtn.addEventListener('click', () => el.attachInput.click());
  el.attachInput.addEventListener('change', onAttachFile);
  el.btnSettings.addEventListener('click', openSettingsModal);
  el.settingsCancel.addEventListener('click', closeSettingsModal);
  el.settingsForm.addEventListener('submit', onSaveSettings);
  el.themeToggle?.addEventListener('click', toggleTheme);
  el.settingsEffects?.addEventListener('click', () => {
    el.settingsEffects.setAttribute('aria-checked', String(el.settingsEffects.getAttribute('aria-checked') !== 'true'));
  });
  el.printClose.addEventListener('click', closePrintPreview);
  el.printBtn.addEventListener('click', exportPdf);
  el.modelChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      el.settingsModel.value = chip.dataset.model;
      updateModelChipHighlight();
    });
  });
  el.settingsModel.addEventListener('input', updateModelChipHighlight);
  el.hamburgerBtn.addEventListener('click', openSidebarDrawer);
  el.sidebarBackdrop.addEventListener('click', closeSidebarDrawer);
  el.chatMessages.addEventListener('scroll', () => {
    chatFollowBottom = isChatNearBottom();
  }, { passive: true });
  el.sessionList.addEventListener('click', onSessionListClick);
  el.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el.chatForm.requestSubmit();
    }
  });
}

function showStorageNotice() {
  if (document.getElementById('storage-warning')) return;
  const notice = document.createElement('div');
  notice.id = 'storage-warning';
  notice.className = 'storage-warning';
  notice.textContent = 'พื้นที่เก็บข้อมูลใช้ไม่ได้ชั่วคราว งานนี้จะอยู่ในหน่วยความจำและอาจหายเมื่อรีโหลดหน้า';
  document.body.appendChild(notice);
}

function applyTheme(theme) {
  const isNight = theme === 'night';
  document.documentElement.dataset.theme = isNight ? 'night' : 'day';
  if (!el.themeToggle) return;
  el.themeToggle.setAttribute('aria-pressed', String(isNight));
  const icon = el.themeToggle.querySelector('.theme-toggle-icon');
  const label = el.themeToggle.querySelector('strong');
  const hint = el.themeToggle.querySelector('small');
  if (icon) icon.textContent = isNight ? '☀' : '☾';
  if (label) label.textContent = isNight ? 'Day Aero' : 'Night Aero';
  if (hint) hint.textContent = isNight ? 'สลับโหมดกลางวัน' : 'สลับโหมดกลางคืน';
}

function toggleTheme() {
  const next = getTheme() === 'night' ? 'day' : 'night';
  saveTheme(next);
  if (window.FX) window.FX.transitionTheme(() => applyTheme(next), el.themeToggle);
  else window.MotionUI?.transitionTheme(() => applyTheme(next));
}

// ---------- Sidebar / session management ----------

let sessionListSignature = null;

function renderSessionList() {
  const sessions = getSessions();
  // ไม่มีอะไรเปลี่ยน (เช่น persistSession ระหว่าง stream) = ไม่ต้องสร้าง DOM ใหม่
  const signature = (currentSession ? currentSession.id : '') + '|' + sessions.map((s) => [s.id, s.mode, s.title || ''].join('~')).join('|');
  if (signature === sessionListSignature && el.sessionList.firstChild) return;
  sessionListSignature = signature;
  el.sessionList.innerHTML = '';
  if (sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'session-empty';
    empty.innerHTML = '<img src="assets/vintage/nuvola-history.png" alt="" width="128" height="128"><strong>ยังไม่มีประวัติงาน</strong><span>เริ่มสร้างสื่อการสอนหรือแบบฝึกหัด แล้วผลงานจะปรากฏที่นี่</span>';
    el.sessionList.appendChild(empty);
    return;
  }
  const firstRender = !sessionListAnimated;
  sessionListAnimated = true;
  let itemIndex = 0;
  const frag = document.createDocumentFragment();
  for (const s of sessions) {
    const item = document.createElement('div');
    item.className = 'session-item' + (currentSession && currentSession.id === s.id ? ' active' : '') + (firstRender ? ' fx-enter' : '');
    item.dataset.sessionId = s.id;
    item.style.setProperty('--i', String(Math.min(itemIndex++, 12)));
    const icon = s.mode === 'lesson' ? '🎨' : '📝';
    item.innerHTML = `<span class="session-icon">${icon}</span><span class="session-title"></span><button class="session-delete" title="ลบ">✕</button>`;
    item.querySelector('.session-title').textContent = s.title || '(งานไม่มีชื่อ)';
    frag.appendChild(item);
  }
  el.sessionList.appendChild(frag);
}

// listener เดียวที่ #session-list แทนการผูก 2 ตัวต่อแถวทุกครั้งที่ render
function onSessionListClick(e) {
  const item = e.target.closest('.session-item');
  if (!item || !el.sessionList.contains(item)) return;
  const id = item.dataset.sessionId;
  if (!e.target.closest('.session-delete')) {
    selectSession(id);
    return;
  }
  if (isBusy && activeSession && activeSession.id === id) {
    alert('งานนี้กำลังสร้างเนื้อหาอยู่ รอให้เสร็จก่อนแล้วค่อยลบ');
    return;
  }
  if (confirm('ลบงานนี้ออกจากประวัติ?')) {
    deleteSession(id);
    if (currentSession && currentSession.id === id) {
      currentSession = null;
      showWelcome();
    }
    renderSessionList();
  }
}

function selectSession(id) {
  closePrintPreview();
  closeSidebarDrawer();
  // กดงานที่เปิดอยู่แล้ว: ไม่ต้องโหลดใหม่จาก storage (สำเนาใน storage อาจเก่ากว่าที่กำลังเจนอยู่)
  if (currentSession && currentSession.id === id) return;
  const session =
    activeSession && activeSession.id === id ? activeSession : getSessions().find((s) => s.id === id);
  if (!session) return;
  if (session !== activeSession) recoverInterruptedSession(session);
  currentSession = session;
  clearPendingAttachment();
  showChatView();
  renderSessionList();
  renderChatView();
}

// งานที่ถูกขัดจังหวะกลางคัน (เช่น รีโหลด/ปิดหน้าระหว่างเจน) จะค้างสถานะ pending/streaming ไว้ใน storage
// แปลงเป็น error เพื่อให้มีปุ่ม "สร้างใหม่ชุดนี้" กดต่อได้
function recoverInterruptedSession(session) {
  if (session.mode !== 'exercise' || !session.exerciseSets) return;
  for (const set of Object.values(session.exerciseSets)) {
    if (set.status === 'pending' || set.status === 'streaming') {
      set.status = 'error';
      set.content = '⚠️ การสร้างถูกขัดจังหวะ กด "สร้างใหม่ชุดนี้" เพื่อลองอีกครั้ง';
    }
  }
}

function openSidebarDrawer() {
  el.sidebar.classList.add('open');
  el.sidebarBackdrop.classList.add('show');
}

function closeSidebarDrawer() {
  el.sidebar.classList.remove('open');
  el.sidebarBackdrop.classList.remove('show');
}

function newSession(mode) {
  closePrintPreview();
  closeSidebarDrawer();
  currentSession = {
    id: createSessionId(),
    mode,
    title: '',
    createdAt: Date.now(),
    messages: [],
    finalGenerated: false,
    exerciseSets: mode === 'exercise' ? {} : undefined,
  };
  clearPendingAttachment();
  showChatView();
  renderChatView({ animateIntro: true });
  renderSessionList();
  el.chatInput.focus();
}

function showWelcome() {
  el.welcomeScreen.classList.remove('hidden');
  el.chatView.classList.add('hidden');
  window.MotionUI?.revealView(el.welcomeScreen);
}

function showChatView() {
  el.welcomeScreen.classList.add('hidden');
  el.chatView.classList.remove('hidden');
  window.MotionUI?.revealView(el.chatView);
  window.FX?.enterView(el.chatView);
}

function persistSession(session) {
  if (!session) return;
  upsertSession(session);
  renderSessionList();
}

// ---------- Attachment handling ----------

async function onAttachFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const readId = ++attachReadSeq;
  isReadingAttachment = true;
  pendingAttachment = null;
  el.attachChip.classList.remove('hidden');
  el.attachChip.textContent = `📎 กำลังอ่านไฟล์ ${file.name} ...`;

  let text = '';
  let error = null;
  try {
    text = await extractTextFromFile(file);
  } catch (err) {
    error = err;
  }
  if (readId !== attachReadSeq) return; // มีการเลือกไฟล์ใหม่หรือเปลี่ยนงานไประหว่างอ่าน
  isReadingAttachment = false;
  if (!error && !text) {
    error = new Error('ไม่พบข้อความในไฟล์ (ถ้าเป็น PDF ที่สแกนมาเป็นรูปภาพ ระบบยังอ่านไม่ได้)');
  }
  pendingAttachment = error ? null : { name: file.name, text };
  renderAttachChip();
  if (error) alert('อ่านไฟล์ไม่สำเร็จ: ' + error.message);
}

function clearPendingAttachment() {
  attachReadSeq++;
  isReadingAttachment = false;
  pendingAttachment = null;
  renderAttachChip();
}

function renderAttachChip() {
  el.attachChip.innerHTML = '';
  if (!pendingAttachment) {
    el.attachChip.classList.add('hidden');
    return;
  }
  el.attachChip.classList.remove('hidden');
  // ใช้ text node — ชื่อไฟล์มาจากผู้ใช้ ห้ามยัดลง innerHTML
  el.attachChip.append(
    `📎 ${pendingAttachment.name} (${pendingAttachment.text.length.toLocaleString()} ตัวอักษร) `
  );
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.id = 'attach-remove';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', clearPendingAttachment);
  el.attachChip.appendChild(removeBtn);
}

// ---------- Diagram streaming placeholder / auto-repair / manual edit ----------

// ระหว่าง stream ยังไม่อยากโชว์ JSON ดิบของรูปประกอบ ให้แทนด้วยข้อความสถานะไปก่อน
// (บล็อกที่ปิดสมบูรณ์แล้ว และบล็อกที่กำลังพิมพ์ค้างอยู่ท้ายข้อความ ก็ครอบคลุมทั้งคู่)
// (แปลงแบบ incremental — ดู stream-text.js; แต่ละสตรีมมีตัวแปลงของตัวเอง)
const streamConverters = new Map();
function displayStreamingText(fullText, streamKey = 'default') {
  let convert = streamConverters.get(streamKey);
  if (!convert) {
    convert = createStreamingTextConverter();
    streamConverters.set(streamKey, convert);
  }
  return convert(fullText);
}

const MAX_DIAGRAM_REPAIRS = 4;

// ตรวจบล็อก diagram ทั้งหมดใน content แล้วขอให้โมเดลซ่อมบล็อกที่พังทีละบล็อก (จำกัดจำนวนครั้ง)
// คืนค่า { content, repaired } — repaired=true ถ้ามีการแก้อย่างน้อย 1 บล็อก
async function autoRepairDiagrams(content, onStatus) {
  if (!window.validateDiagramBlocks || !/```diagram/.test(content)) return { content, repaired: false };
  let text = content;
  let repairedAny = false;
  let attempts = 0;
  for (let round = 0; round < 2; round++) {
    const results = await validateDiagramBlocks(text);
    const broken = results.filter((r) => !r.ok);
    if (!broken.length) break;
    for (const b of broken) {
      if (attempts >= MAX_DIAGRAM_REPAIRS) break;
      attempts++;
      safeCallback(onStatus, `🔧 กำลังซ่อมรูปประกอบ (${attempts}/${MAX_DIAGRAM_REPAIRS})...`);
      try {
        let guessedType = 'ไม่ทราบชนิด';
        const typeMatch = b.source.match(/"type"\s*:\s*"([^"]+)"/);
        if (typeMatch) guessedType = typeMatch[1];
        const reply = await callOpenRouterText([
          { role: 'system', content: buildDiagramRepairSystemPrompt() },
          { role: 'user', content: buildDiagramRepairUserPrompt(guessedType, b.source, b.error) },
        ]);
        const fixedSource = stripCodeFence(reply);
        JSON.parse(fixedSource.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")); // ตรวจว่าเป็น JSON ถูกต้องก่อนแทนที่
        text = replaceDiagramBlock(text, b.index, fixedSource, b.lang);
        repairedAny = true;
      } catch (err) {
        console.error('diagram repair failed', err);
      }
    }
    if (attempts >= MAX_DIAGRAM_REPAIRS) break;
  }
  return { content: text, repaired: repairedAny };
}

// เรียกจาก event listener ของปุ่ม "✏️ แก้รูปนี้" — คืน source ใหม่ (string) หรือ null ถ้ายกเลิก/พัง
async function requestDiagramEdit(source) {
  const instruction = prompt('ต้องการแก้ไขรูปนี้อย่างไร? (เช่น "เปลี่ยนแรงเป็น 50 N", "เพิ่มป้ายกำกับมุม")');
  if (!instruction || !instruction.trim()) return null;
  const reply = await callOpenRouterText([
    { role: 'system', content: buildDiagramEditSystemPrompt() },
    { role: 'user', content: buildDiagramEditUserPrompt(source, instruction.trim()) },
  ]);
  const fixedSource = stripCodeFence(reply);
  JSON.parse(fixedSource.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
  return fixedSource;
}

// เติมปุ่ม "✏️ แก้รูปนี้" ใต้รูปทุกรูปใน container (ไม่ใช้ใน PDF/สไลด์) — getContent/setContent อ่าน-เขียน markdown ต้นทาง
function attachDiagramEditButtons(container, getContent, setContent) {
  const figures = container.querySelectorAll('figure.diagram:not(.diagram-fallback)');
  figures.forEach((fig) => {
    const blockIndex = Number(fig.dataset.diagramBlockIndex);
    const blockLang = fig.dataset.diagramBlockLang;
    if (!Number.isInteger(blockIndex) || blockLang !== 'diagram') return;
    if (fig.querySelector('.diagram-edit-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'diagram-edit-btn';
    btn.type = 'button';
    btn.textContent = '✏️ แก้รูปนี้';
    btn.addEventListener('click', async () => {
      if (isBusy) return;
      const blocks = extractDiagramBlocks(getContent());
      const target = blocks[blockIndex];
      if (!target || target.lang !== blockLang || target.source.trim() !== (fig.dataset.diagramSource || '').trim()) {
        alert('เนื้อหารูปนี้เปลี่ยนไปแล้ว กรุณาเปิดงานใหม่แล้วลองอีกครั้ง');
        return;
      }
      btn.disabled = true;
      btn.textContent = '⏳ กำลังแก้ไข...';
      const owner = currentSession;
      const originalContent = getContent();
      activeSession = owner;
      setBusy(true);
      try {
        const newSource = await requestDiagramEdit(target.source);
        if (newSource && getContent() === originalContent) {
          JSON.parse(newSource.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"));
          setContent(replaceDiagramBlock(getContent(), blockIndex, newSource, target.lang));
        } else if (newSource) {
          throw new Error('เนื้อหารูปนี้เปลี่ยนไประหว่างแก้ไข จึงไม่ได้นำคำตอบมาใช้');
        }
      } catch (err) {
        alert('แก้รูปไม่สำเร็จ: ' + err.message);
      } finally {
        activeSession = null;
        setBusy(false);
        btn.disabled = false;
        btn.textContent = '✏️ แก้รูปนี้';
      }
    });
    fig.appendChild(btn);
  });
}

// ---------- Chat rendering ----------

// โหนดข้อความที่ render ไว้แล้วของ session ปัจจุบัน — ข้อความที่ไม่เปลี่ยนจะถูกใช้ซ้ำ ไม่ต้อง parse markdown/KaTeX/วาดรูปใหม่
let chatRender = { session: null, entries: [] };

function messageSignature(msg, idx) {
  const isLast = idx === currentSession.messages.length - 1;
  const generatingHere = isBusy && activeSession === currentSession;
  return [
    msg.role, msg.content, msg.displayContent, msg.attachmentName, msg.reasoning, msg.isError, msg.showPdfButton,
    isLast, isLast && generatingHere, isLast && currentSession.finalGenerated,
  ];
}

function sameSignature(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function renderChatView({ animateMessageIndexes = [], animateIntro = false, animateExercise = false, scrollState = null } = {}) {
  cancelUiUpdates(); // ตัวเขียน stream ที่ค้างอยู่จะเขียนทับ DOM ที่กำลังสร้างใหม่
  el.sessionTitleDisplay.textContent = currentSession.title || (currentSession.mode === 'lesson' ? 'ออกแบบสื่อการสอน' : 'ออกแบบแบบฝึกหัด');

  const messages = currentSession.messages;
  const canReuse = chatRender.session === currentSession && chatRender.entries.length > 0 && messages.length > 0
    && chatRender.entries.every((entry) => entry && entry.node.isConnected);
  if (canReuse) {
    // เก็บกวาดส่วนที่ไม่ใช่ข้อความ (การ์ดแบบฝึกหัด) และข้อความส่วนเกิน แล้วค่อยตรวจทีละข้อความ
    el.chatMessages.querySelectorAll('.exercise-context, .exercise-grid').forEach((node) => node.remove());
    chatRender.entries.splice(messages.length).forEach((entry) => entry.node.remove());
  } else {
    el.chatMessages.innerHTML = '';
    chatRender = { session: currentSession, entries: [] };
  }

  if (messages.length === 0) {
    const intro = buildIntroBubble();
    el.chatMessages.appendChild(intro);
    if (animateIntro) {
      window.MotionUI?.reveal(intro, 'motion-enter-soft');
      window.FX?.enterMessage(intro);
    }
  }

  messages.forEach((msg, idx) => {
    const sig = messageSignature(msg, idx);
    const existing = chatRender.entries[idx];
    const animate = animateMessageIndexes.includes(idx);
    if (existing && !animate && existing.node.isConnected && sameSignature(existing.sig, sig)) return;
    const message = buildMessageBubble(msg, idx);
    if (existing && existing.node.isConnected) existing.node.replaceWith(message);
    else el.chatMessages.appendChild(message);
    chatRender.entries[idx] = { node: message, sig };
    if (animate) {
      window.MotionUI?.reveal(message);
      window.FX?.enterMessage(message);
    }
  });

  if (currentSession.mode === 'exercise' && currentSession.exerciseSets) {
    const levels = Object.keys(currentSession.exerciseSets);
    if (levels.length > 0) {
      const context = document.createElement('section');
      context.className = 'exercise-context';
      context.setAttribute('aria-label', 'สรุปแบบฝึกหัด');

      const contextIcon = document.createElement('img');
      contextIcon.src = 'assets/vintage/nuvola-mathematics.png';
      contextIcon.alt = '';
      contextIcon.width = 128;
      contextIcon.height = 128;

      const contextCopy = document.createElement('div');
      contextCopy.className = 'exercise-context-copy';
      const contextKicker = document.createElement('span');
      contextKicker.className = 'exercise-context-kicker';
      contextKicker.textContent = 'แบบฝึกหัดที่สร้างจากหัวข้อ';
      const contextTitle = document.createElement('h2');
      contextTitle.textContent = currentSession.topicText || 'แบบฝึกหัดคณิตศาสตร์';
      const contextHint = document.createElement('p');
      contextHint.textContent = 'จัดชุดโจทย์ให้เหมาะกับผู้เรียน 4 ระดับความยาก';
      contextCopy.append(contextKicker, contextTitle, contextHint);

      const contextStatus = document.createElement('div');
      contextStatus.className = 'exercise-context-status';
      contextStatus.id = 'exercise-context-status';
      context.append(contextIcon, contextCopy, contextStatus);
      el.chatMessages.appendChild(context);
      if (animateExercise) {
        window.MotionUI?.reveal(context, 'motion-enter-soft');
        window.FX?.enterCards([context]);
      }

      const wrap = document.createElement('div');
      wrap.className = 'exercise-grid';
      wrap.id = 'exercise-grid';
      el.chatMessages.appendChild(wrap);
      levels.forEach((level) => renderExerciseCard(Number(level), { animate: animateExercise }));
    }
  }

  restoreChatScrollState(scrollState);
}

function buildIntroBubble() {
  const div = document.createElement('div');
  div.className = 'msg assistant';
  const text =
    currentSession.mode === 'lesson'
      ? 'สวัสดีครับ/ค่ะ บอกชื่อบทเรียนที่อยากได้สื่อการสอน พร้อมข้อแม้ต่างๆ (ถ้ามี) หรือแนบไฟล์เนื้อหาเดิม/หลักสูตรมาได้เลยครับ'
      : 'สวัสดีครับ/ค่ะ บอกชื่อบทเรียน/รายละเอียดที่ต้องการแบบฝึกหัด หรือแนบไฟล์เนื้อหาเดิมมาได้เลย ระบบจะสร้างแบบฝึกหัดให้ 4 ระดับความยาก';
  div.innerHTML = `<div class="msg-bubble">${text}</div>`;
  return div;
}

function buildMessageBubble(msg, idx) {
  const div = document.createElement('div');
  div.className = 'msg ' + msg.role;
  div.id = `msg-${idx}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const isLastMsg = idx === currentSession.messages.length - 1;
  const generatingHere = isBusy && activeSession === currentSession;

  if (msg.role === 'user') {
    bubble.textContent = msg.displayContent || msg.content;
    if (msg.attachmentName) {
      const chip = document.createElement('div');
      chip.className = 'attach-tag';
      chip.textContent = `📎 ${msg.attachmentName}`;
      bubble.appendChild(chip);
    }
    // ข้อความสุดท้ายเป็นของครูแต่ไม่มีคำตอบ = การเจนถูกขัดจังหวะ (เช่น รีโหลดหน้า) ให้กดขอคำตอบใหม่ได้
    if (currentSession.mode === 'lesson' && isLastMsg && !generatingHere) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'regen-btn retry-reply-btn';
      retryBtn.textContent = '🔄 ให้ AI ตอบอีกครั้ง';
      retryBtn.addEventListener('click', () => {
        if (isBusy) return;
        runLessonCompletion(msg.content === CONFIRM_TRIGGER_MESSAGE);
      });
      bubble.appendChild(retryBtn);
    }
  } else if (msg.isError) {
    const errDiv = document.createElement('div');
    errDiv.className = 'error-text';
    errDiv.textContent = msg.content;
    bubble.appendChild(errDiv);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'regen-btn';
    retryBtn.textContent = '🔄 ลองอีกครั้ง';
    retryBtn.addEventListener('click', () => retryLessonCompletion(idx));
    bubble.appendChild(retryBtn);
  } else {
    if (msg.reasoning) {
      const r = document.createElement('div');
      r.className = 'reasoning-block';
      r.textContent = '🧠 ' + msg.reasoning;
      bubble.appendChild(r);
    }
    const content = document.createElement('div');
    content.className = 'markdown-body';
    if (generatingHere && isLastMsg) {
      // กลับมาดูงานที่ยังเจนไม่เสร็จ: แสดงแบบ streaming ต่อ ยังไม่ต้องโชว์ปุ่มยืนยัน/PDF
      content.classList.add('streaming');
      setStreamingText(content, displayStreamingText(msg.content));
      bubble.appendChild(content);
      div.classList.add('is-streaming');
    } else {
      const session = currentSession;
      renderMarkdownWithMath(content, msg.content);
      bubble.appendChild(content);
      Promise.resolve(content.diagramsReady).then(() => {
        if (currentSession !== session) return;
        attachDiagramEditButtons(
          content,
          () => session.messages[idx].content,
          (newContent) => {
            session.messages[idx].content = newContent;
            persistSession(session);
            if (currentSession === session) renderChatView();
          }
        );
      });

      if (currentSession.mode === 'lesson' && isLastMsg && !currentSession.finalGenerated && msg.content) {
        bubble.appendChild(buildConfirmControls());
      }
      if (msg.showPdfButton) {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        const btn = document.createElement('button');
        btn.className = 'pdf-btn';
        btn.textContent = '📄 ดูตัวอย่าง PDF';
        btn.addEventListener('click', () => openPrintPreview(currentSession.title || 'เนื้อหาการสอน', msg.content));
        actions.appendChild(btn);
        const slideBtn = document.createElement('button');
        slideBtn.className = 'pdf-btn slide-view-btn';
        slideBtn.textContent = '🖥️ ดูเป็นสไลด์';
        slideBtn.addEventListener('click', () => openSlideView(currentSession.title || 'เนื้อหาการสอน', msg.content));
        actions.appendChild(slideBtn);
        bubble.appendChild(actions);
      }
    }
  }

  div.appendChild(bubble);
  return div;
}

function buildConfirmControls() {
  const wrap = document.createElement('div');
  wrap.className = 'confirm-controls';
  const btn = document.createElement('button');
  btn.className = 'confirm-btn';
  btn.textContent = '✅ ใช้แผนนี้ สร้างเนื้อหาเต็ม';
  btn.addEventListener('click', confirmLessonPlan);
  wrap.appendChild(btn);
  const hint = document.createElement('div');
  hint.className = 'confirm-hint';
  hint.textContent = 'หรือพิมพ์ข้อความด้านล่างเพื่อขอแก้ไขแผนก่อนได้';
  wrap.appendChild(hint);
  return wrap;
}

// ---------- Form submit / dispatch ----------

function onFormSubmit(e) {
  e.preventDefault();
  if (isBusy || !currentSession) return;
  const text = el.chatInput.value.trim();
  if (!text) return;
  if (isReadingAttachment) {
    alert('กำลังอ่านไฟล์แนบอยู่ รอสักครู่แล้วค่อยกดส่งอีกครั้ง');
    return;
  }

  const attachment = pendingAttachment;
  el.chatInput.value = '';
  pendingAttachment = null;
  renderAttachChip();

  if (!currentSession.title) {
    currentSession.title = text.slice(0, 40);
  }

  if (currentSession.mode === 'lesson') {
    sendLessonTurn(text, attachment, false);
  } else {
    startExerciseGeneration(text, attachment);
  }
}

function setBusy(busy) {
  isBusy = busy;
  el.sendBtn.disabled = busy;
  el.chatInput.disabled = busy;
  // หยุดฉากพื้นหลังที่เคลื่อนไหวตลอดเวลา ระหว่างที่กำลังสตรีมคำตอบ (ตอนที่ frame time สำคัญที่สุด)
  document.documentElement.classList.toggle('fx-busy', busy);
}

// ---------- Streaming DOM writer: เขียนทีละบรรทัดแทนตั้ง textContent ทั้งก้อนทุกเฟรม ----------
// renderer ผูกกับ "โหนด" ที่ได้รับ ไม่ใช่ session/level — โหนดใหม่ (สลับ session แล้วกลับมา) ได้ renderer ใหม่โดยอัตโนมัติ
const streamRenderers = new WeakMap();
function setStreamingText(container, text) {
  let render = streamRenderers.get(container);
  if (!render) {
    render = createStreamingTextRenderer(container);
    streamRenderers.set(container, render);
  }
  render(text);
}

// ---------- Mode 1: ออกแบบสื่อการสอน ----------

function sendLessonTurn(userText, attachment, isConfirmTrigger) {
  const attachmentBlock = attachment ? buildAttachmentBlock(attachment.name, attachment.text) : '';
  const userMsg = {
    role: 'user',
    content: isConfirmTrigger ? CONFIRM_TRIGGER_MESSAGE : userText + attachmentBlock,
    displayContent: userText,
    attachmentName: attachment ? attachment.name : undefined,
  };
  currentSession.messages.push(userMsg);
  persistSession(currentSession);

  runLessonCompletion(false, [currentSession.messages.length - 1]);
}

function confirmLessonPlan() {
  if (isBusy) return;
  const userMsg = {
    role: 'user',
    content: CONFIRM_TRIGGER_MESSAGE,
    displayContent: '✅ ยืนยันแผนแล้ว สร้างเนื้อหาเต็ม',
  };
  currentSession.messages.push(userMsg);
  persistSession(currentSession);
  runLessonCompletion(true, [currentSession.messages.length - 1]);
}

function runLessonCompletion(isFinalStep, animateMessageIndexes = []) {
  // ผูกกับ session ที่เริ่มเจน ไม่ใช่ currentSession — ผู้ใช้อาจสลับไปดูงานอื่นระหว่างรอ
  const session = currentSession;
  activeSession = session;
  setBusy(true);
  const apiMessages = [
    { role: 'system', content: buildLessonSystemPrompt() },
    ...session.messages.filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.content })),
  ];

  const assistantMsg = { role: 'assistant', content: '', reasoning: '', isFinalAttempt: !!isFinalStep };
  session.messages.push(assistantMsg);
  const idx = session.messages.length - 1;
  renderChatView({ animateMessageIndexes: [...animateMessageIndexes, idx] });
  const isViewing = () => currentSession === session;
  const bubbleEl = () => (isViewing() ? document.querySelector(`#msg-${idx} .msg-bubble`) : null);

  const streamKey = `lesson-${session.id}-${idx}`;
  const finish = () => {
    cancelUiUpdates();
    streamConverters.delete(streamKey);
    const scrollState = isViewing() ? captureChatScrollState() : null;
    activeSession = null;
    setBusy(false);
    persistSession(session);
    if (isViewing()) renderChatView({ scrollState });
  };

  callOpenRouterStream(apiMessages, {
    onReasoningToken: (chunk) => {
      assistantMsg.reasoning += chunk;
      updateChatDuringStream(() => {
        const b = bubbleEl();
        if (b) {
          let r = b.querySelector('.reasoning-block');
          if (!r) {
            r = document.createElement('div');
            r.className = 'reasoning-block';
            b.prepend(r);
          }
          setStreamingText(r, '🧠 ' + assistantMsg.reasoning);
        }
      }, 'reasoning');
    },
    onToken: (_delta, fullText) => {
      assistantMsg.content = fullText;
      updateChatDuringStream(() => {
        const b = bubbleEl();
        if (b) {
          let c = b.querySelector('.markdown-body');
          if (!c) {
            c = document.createElement('div');
            c.className = 'markdown-body streaming';
            b.appendChild(c);
          }
          setStreamingText(c, displayStreamingText(assistantMsg.content, streamKey));
        }
      }, 'content');
    },
    onDone: async (fullText) => {
      assistantMsg.content = fullText;
      if (isFinalStep) {
        cancelUiUpdates(); // token สุดท้ายที่ค้างอยู่ต้องไม่มาเขียนทับข้อความสถานะ
        const b = bubbleEl();
        if (b) {
          updateChatDuringStream(() => {
            const c = b.querySelector('.markdown-body');
            if (c) c.textContent = '🔧 กำลังตรวจรูปประกอบ...';
          }, 'status');
        }
        try {
          const { content: repaired } = await autoRepairDiagrams(fullText, (status) => {
            updateChatDuringStream(() => {
              const bb = bubbleEl();
              const cc = bb && bb.querySelector('.markdown-body');
              if (cc) cc.textContent = status;
            }, 'status');
          });
          assistantMsg.content = repaired;
        } catch (err) {
          console.error(err);
        }
        session.finalGenerated = true;
        assistantMsg.showPdfButton = true;
        if (currentSession === session) window.FX?.celebrate();
      }
      finish();
    },
    onError: (err) => {
      assistantMsg.content = '⚠️ เกิดข้อผิดพลาด: ' + err.message;
      assistantMsg.isError = true;
      finish();
    },
  });
}

function retryLessonCompletion(idx) {
  if (isBusy) return;
  const wasFinal = currentSession.messages[idx].isFinalAttempt;
  currentSession.messages.splice(idx, 1);
  renderChatView();
  runLessonCompletion(wasFinal);
}

// ---------- Mode 2: ออกแบบแบบฝึกหัด ----------

const EXERCISE_LEVEL_LABELS = {
  1: 'ระดับ 1 · พื้นฐาน',
  2: 'ระดับ 2 · เข้าใจ',
  3: 'ระดับ 3 · ประยุกต์',
  4: 'ระดับ 4 · ท้าทาย',
};

function startExerciseGeneration(topicText, attachment) {
  const userMsg = {
    role: 'user',
    content: topicText,
    displayContent: topicText,
    attachmentName: attachment ? attachment.name : undefined,
  };
  currentSession.messages.push(userMsg);
  currentSession.topicText = topicText;
  currentSession.attachment = attachment || null;
  currentSession.exerciseSets = { 1: { status: 'pending', content: '' }, 2: { status: 'pending', content: '' }, 3: { status: 'pending', content: '' }, 4: { status: 'pending', content: '' } };
  renderChatView({ animateMessageIndexes: [currentSession.messages.length - 1], animateExercise: true });
  persistSession(currentSession);

  runExerciseQueue([1, 2, 3, 4]);
}

async function runExerciseQueue(levels) {
  const session = currentSession;
  activeSession = session;
  setBusy(true);
  try {
    for (const level of levels) {
      await generateExerciseLevel(session, level);
    }
  } finally {
    activeSession = null;
    setBusy(false);
  }
}

function generateExerciseLevel(session, level) {
  return new Promise((resolve) => {
    const set = session.exerciseSets[level];
    set.status = 'streaming';
    set.content = '';
    set.reasoning = '';

    // อัปเดตการ์ดเฉพาะตอนที่ผู้ใช้กำลังดู session นี้อยู่
    const refreshCard = (full) => {
      if (currentSession !== session) return;
      if (full) {
        cancelUiUpdates([`card-${level}`]);
        renderExerciseCard(level);
      } else {
        // รวมการอัปเดตการ์ดเป็นครั้งเดียวต่อเฟรม (ตัวเขียนอ่านสถานะล่าสุดตอน flush)
        scheduleUiUpdate(`card-${level}`, () => {
          if (currentSession === session) updateExerciseCardBody(level);
        });
      }
    };
    const finish = () => {
      streamConverters.delete(`ex-${level}`);
      try {
        persistSession(session);
        refreshCard(true);
      } finally {
        resolve();
      }
    };
    refreshCard(true);

    const attachmentBlock = session.attachment
      ? buildAttachmentBlock(session.attachment.name, session.attachment.text)
      : '';
    const apiMessages = [
      { role: 'system', content: buildExerciseSystemPrompt(level) },
      { role: 'user', content: session.topicText + attachmentBlock },
    ];

    callOpenRouterStream(apiMessages, {
      onReasoningToken: (chunk) => {
        set.reasoning += chunk;
        refreshCard(false);
      },
      onToken: (_delta, fullText) => {
        set.content = fullText;
        refreshCard(false);
      },
      onDone: async (fullText) => {
        set.content = fullText;
        set.status = 'repairing';
        refreshCard(false);
        try {
          const { content: repaired } = await autoRepairDiagrams(fullText, (status) => {
            set.repairStatus = status;
            refreshCard(false);
          });
          set.content = repaired;
        } catch (err) {
          console.error(err);
        }
        set.status = 'done';
        finish();
      },
      onError: (err) => {
        set.status = 'error';
        set.content = '⚠️ เกิดข้อผิดพลาด: ' + err.message;
        finish();
      },
    });
  });
}

function regenerateExerciseLevel(level) {
  if (isBusy) return;
  runExerciseQueue([level]);
}

function renderExerciseCard(level, { animate = false } = {}) {
  const grid = document.getElementById('exercise-grid');
  if (!grid) return;
  const set = currentSession.exerciseSets[level];
  let card = document.getElementById(`exercise-card-${level}`);
  if (!card) {
    card = document.createElement('div');
    card.className = 'exercise-card';
    card.id = `exercise-card-${level}`;
    card.innerHTML = `
      <div class="exercise-card-header">${EXERCISE_LEVEL_LABELS[level]}</div>
      <div class="exercise-card-body markdown-body" id="exercise-body-${level}"></div>
      <div class="exercise-card-footer" id="exercise-footer-${level}"></div>
    `;
    grid.appendChild(card);
    if (animate) {
      window.MotionUI?.reveal(card);
      window.FX?.enterCards([card]);
      card.style.setProperty('--fx-i', String(grid.querySelectorAll('.exercise-card').length));
    }
  }
  updateExerciseCardBody(level);
  updateExerciseCardFooter(level);
  updateExerciseContextStatus();
}

function updateExerciseContextStatus() {
  const status = document.getElementById('exercise-context-status');
  if (!status || !currentSession || !currentSession.exerciseSets) return;
  const sets = Object.values(currentSession.exerciseSets);
  const done = sets.filter((set) => set.status === 'done').length;
  const hasError = sets.some((set) => set.status === 'error');
  status.textContent = done === sets.length && sets.length > 0
    ? '✓ สร้างครบ 4 ระดับแล้ว'
    : hasError
      ? `สร้างแล้ว ${done}/${sets.length} ระดับ · มีบางชุดต้องลองใหม่`
      : `กำลังสร้าง ${done}/${sets.length} ระดับ`;
  const complete = done === sets.length && sets.length > 0;
  const justCompleted = complete && !status.classList.contains('is-complete') && isBusy && activeSession === currentSession;
  status.classList.toggle('is-complete', complete);
  if (justCompleted) window.FX?.celebrate();
  status.classList.toggle('has-error', hasError);
}

function updateExerciseCardBody(level) {
  const session = currentSession;
  const set = session.exerciseSets[level];
  const body = document.getElementById(`exercise-body-${level}`);
  if (!body) return;
  if (set.status === 'pending') {
    body.textContent = 'รอคิว...';
  } else if (set.status === 'streaming') {
    if (set.content) {
      setStreamingText(body, displayStreamingText(set.content, `ex-${level}`));
    } else if (set.reasoning) {
      setStreamingText(body, '🧠 กำลังคิด: ' + set.reasoning);
    } else {
      body.textContent = 'กำลังสร้าง...';
    }
  } else if (set.status === 'repairing') {
    body.textContent = set.repairStatus || '🔧 กำลังตรวจรูปประกอบ...';
  } else {
    renderMarkdownWithMath(body, set.content);
    Promise.resolve(body.diagramsReady).then(() => {
      if (currentSession !== session) return;
      attachDiagramEditButtons(
        body,
        () => session.exerciseSets[level].content,
        (newContent) => {
          session.exerciseSets[level].content = newContent;
          persistSession(session);
          if (currentSession === session) updateExerciseCardBody(level);
        }
      );
    });
  }
}

function updateExerciseCardFooter(level) {
  const set = currentSession.exerciseSets[level];
  const footer = document.getElementById(`exercise-footer-${level}`);
  if (!footer) return;
  footer.innerHTML = '';
  if (set.status === 'done' || set.status === 'error') {
    if (set.status === 'done') {
      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'pdf-btn';
      pdfBtn.textContent = '📄 ดู/บันทึก PDF';
      pdfBtn.addEventListener('click', () =>
        openPrintPreview(`${currentSession.title || 'แบบฝึกหัด'} — ${EXERCISE_LEVEL_LABELS[level]}`, set.content)
      );
      footer.appendChild(pdfBtn);
    }
    const regenBtn = document.createElement('button');
    regenBtn.className = 'regen-btn';
    regenBtn.textContent = '🔄 สร้างใหม่ชุดนี้';
    regenBtn.addEventListener('click', () => regenerateExerciseLevel(level));
    footer.appendChild(regenBtn);
  }
}

// ---------- Settings modal ----------

function updateModelChipHighlight() {
  el.modelChips.forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.model === el.settingsModel.value.trim());
  });
}

function openSettingsModal() {
  const s = getSettings();
  el.settingsApiKey.value = s.apiKey;
  el.settingsModel.value = s.model;
  el.settingsReasoning.value = s.reasoningEffort;
  el.settingsEffects?.setAttribute('aria-checked', String(s.effects !== 'off'));
  updateModelChipHighlight();
  if (window.MotionUI) window.MotionUI.openLayer(el.settingsModal);
  else el.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  if (window.MotionUI) window.MotionUI.closeLayer(el.settingsModal);
  else el.settingsModal.classList.add('hidden');
}

function onSaveSettings(e) {
  e.preventDefault();
  saveSettings({
    apiKey: el.settingsApiKey.value.trim(),
    model: el.settingsModel.value.trim() || DEFAULT_SETTINGS.model,
    reasoningEffort: el.settingsReasoning.value,
    effects: el.settingsEffects?.getAttribute('aria-checked') === 'false' ? 'off' : 'full',
  });
  window.FX?.setEnabled(getSettings().effects !== 'off');
  closeSettingsModal();
}

document.addEventListener('DOMContentLoaded', init);
