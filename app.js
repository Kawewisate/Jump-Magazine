// ตัวควบคุมหลักของแอป: sidebar/session, การเดินเรื่องของโหมด 1 และโหมด 2, การเชื่อม settings

let currentSession = null; // session ที่เปิดดูอยู่
let activeSession = null; // session ที่กำลังเจนอยู่ (ผู้ใช้อาจสลับไปดูงานอื่นระหว่างรอได้)
let isBusy = false;
let pendingAttachment = null; // { name, text }
let isReadingAttachment = false;
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
  settingsModal: document.getElementById('settings-modal'),
  settingsForm: document.getElementById('settings-form'),
  settingsApiKey: document.getElementById('settings-apikey'),
  settingsModel: document.getElementById('settings-model'),
  modelChips: document.querySelectorAll('.model-chip'),
  settingsReasoning: document.getElementById('settings-reasoning'),
  settingsCancel: document.getElementById('settings-cancel'),
  printOverlay: document.getElementById('print-overlay'),
  printClose: document.getElementById('print-close'),
  printBtn: document.getElementById('print-btn'),
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  hamburgerBtn: document.getElementById('hamburger-btn'),
};

function init() {
  renderSessionList();
  wireEvents();
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
  el.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      el.chatForm.requestSubmit();
    }
  });
}

// ---------- Sidebar / session management ----------

function renderSessionList() {
  const sessions = getSessions();
  el.sessionList.innerHTML = '';
  for (const s of sessions) {
    const item = document.createElement('div');
    item.className = 'session-item' + (currentSession && currentSession.id === s.id ? ' active' : '');
    const icon = s.mode === 'lesson' ? '🎨' : '📝';
    item.innerHTML = `<span class="session-icon">${icon}</span><span class="session-title"></span><button class="session-delete" title="ลบ">✕</button>`;
    item.querySelector('.session-title').textContent = s.title || '(งานไม่มีชื่อ)';
    item.addEventListener('click', (e) => {
      if (e.target.closest('.session-delete')) return;
      selectSession(s.id);
    });
    item.querySelector('.session-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isBusy && activeSession && activeSession.id === s.id) {
        alert('งานนี้กำลังสร้างเนื้อหาอยู่ รอให้เสร็จก่อนแล้วค่อยลบ');
        return;
      }
      if (confirm('ลบงานนี้ออกจากประวัติ?')) {
        deleteSession(s.id);
        if (currentSession && currentSession.id === s.id) {
          currentSession = null;
          showWelcome();
        }
        renderSessionList();
      }
    });
    el.sessionList.appendChild(item);
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
  renderChatView();
  renderSessionList();
  el.chatInput.focus();
}

function showWelcome() {
  el.welcomeScreen.classList.remove('hidden');
  el.chatView.classList.add('hidden');
}

function showChatView() {
  el.welcomeScreen.classList.add('hidden');
  el.chatView.classList.remove('hidden');
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

// ---------- Chat rendering ----------

function renderChatView() {
  el.chatMessages.innerHTML = '';
  el.sessionTitleDisplay.textContent = currentSession.title || (currentSession.mode === 'lesson' ? 'ออกแบบสื่อการสอน' : 'ออกแบบแบบฝึกหัด');

  if (currentSession.messages.length === 0) {
    el.chatMessages.appendChild(buildIntroBubble());
  }

  currentSession.messages.forEach((msg, idx) => {
    el.chatMessages.appendChild(buildMessageBubble(msg, idx));
  });

  if (currentSession.mode === 'exercise' && currentSession.exerciseSets) {
    const levels = Object.keys(currentSession.exerciseSets);
    if (levels.length > 0) {
      const wrap = document.createElement('div');
      wrap.className = 'exercise-grid';
      wrap.id = 'exercise-grid';
      el.chatMessages.appendChild(wrap);
      levels.forEach((level) => renderExerciseCard(Number(level)));
    }
  }

  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
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
      content.textContent = msg.content;
      bubble.appendChild(content);
    } else {
      renderMarkdownWithMath(content, msg.content);
      bubble.appendChild(content);

      if (currentSession.mode === 'lesson' && isLastMsg && !currentSession.finalGenerated && msg.content) {
        bubble.appendChild(buildConfirmControls());
      }
      if (msg.showPdfButton) {
        const btn = document.createElement('button');
        btn.className = 'pdf-btn';
        btn.textContent = '📄 ดูตัวอย่าง PDF';
        btn.addEventListener('click', () => openPrintPreview(currentSession.title || 'เนื้อหาการสอน', msg.content));
        bubble.appendChild(btn);
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
  renderChatView();
  persistSession(currentSession);

  runLessonCompletion();
}

function confirmLessonPlan() {
  if (isBusy) return;
  const userMsg = {
    role: 'user',
    content: CONFIRM_TRIGGER_MESSAGE,
    displayContent: '✅ ยืนยันแผนแล้ว สร้างเนื้อหาเต็ม',
  };
  currentSession.messages.push(userMsg);
  renderChatView();
  persistSession(currentSession);
  runLessonCompletion(true);
}

function runLessonCompletion(isFinalStep) {
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
  renderChatView();
  const isViewing = () => currentSession === session;
  const bubbleEl = () => (isViewing() ? document.querySelector(`#msg-${idx} .msg-bubble`) : null);

  const finish = () => {
    activeSession = null;
    setBusy(false);
    persistSession(session);
    if (isViewing()) renderChatView();
  };

  callOpenRouterStream(apiMessages, {
    onReasoningToken: (chunk) => {
      assistantMsg.reasoning += chunk;
      const b = bubbleEl();
      if (b) {
        let r = b.querySelector('.reasoning-block');
        if (!r) {
          r = document.createElement('div');
          r.className = 'reasoning-block';
          b.prepend(r);
        }
        r.textContent = '🧠 ' + assistantMsg.reasoning;
      }
    },
    onToken: (_delta, fullText) => {
      assistantMsg.content = fullText;
      const b = bubbleEl();
      if (b) {
        let c = b.querySelector('.markdown-body');
        if (!c) {
          c = document.createElement('div');
          c.className = 'markdown-body streaming';
          b.appendChild(c);
        }
        c.textContent = fullText;
      }
    },
    onDone: (fullText) => {
      assistantMsg.content = fullText;
      if (isFinalStep) {
        session.finalGenerated = true;
        assistantMsg.showPdfButton = true;
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
  1: 'ระดับ 1: ง่ายมาก (ปูพื้นฐาน)',
  2: 'ระดับ 2: ปานกลาง',
  3: 'ระดับ 3: ประยุกต์',
  4: 'ระดับ 4: ศึกษาต่อ (ยากที่สุด)',
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
  renderChatView();
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
      if (full) renderExerciseCard(level);
      else updateExerciseCardBody(level);
    };
    const finish = () => {
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
      onDone: (fullText) => {
        set.content = fullText;
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

function renderExerciseCard(level) {
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
  }
  updateExerciseCardBody(level);
  updateExerciseCardFooter(level);
}

function updateExerciseCardBody(level) {
  const set = currentSession.exerciseSets[level];
  const body = document.getElementById(`exercise-body-${level}`);
  if (!body) return;
  if (set.status === 'pending') {
    body.textContent = 'รอคิว...';
  } else if (set.status === 'streaming') {
    if (set.content) {
      body.textContent = set.content;
    } else if (set.reasoning) {
      body.textContent = '🧠 กำลังคิด: ' + set.reasoning;
    } else {
      body.textContent = 'กำลังสร้าง...';
    }
  } else {
    renderMarkdownWithMath(body, set.content);
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
  updateModelChipHighlight();
  el.settingsModal.classList.remove('hidden');
}

function closeSettingsModal() {
  el.settingsModal.classList.add('hidden');
}

function onSaveSettings(e) {
  e.preventDefault();
  saveSettings({
    apiKey: el.settingsApiKey.value.trim(),
    model: el.settingsModel.value.trim() || DEFAULT_SETTINGS.model,
    reasoningEffort: el.settingsReasoning.value,
  });
  closeSettingsModal();
}

document.addEventListener('DOMContentLoaded', init);
