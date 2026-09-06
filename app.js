// ตัวควบคุมหลักของแอป: sidebar/session, การเดินเรื่องของโหมด 1 และโหมด 2, การเชื่อม settings

let currentSession = null;
let isBusy = false;
let pendingAttachment = null; // { name, text }

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
    if (e.key === 'Enter' && !e.shiftKey) {
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
  const session = getSessions().find((s) => s.id === id);
  if (!session) return;
  closePrintPreview();
  closeSidebarDrawer();
  currentSession = session;
  showChatView();
  renderSessionList();
  renderChatView();
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

function persistCurrentSession() {
  if (!currentSession) return;
  upsertSession(currentSession);
  renderSessionList();
}

// ---------- Attachment handling ----------

async function onAttachFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  el.attachChip.classList.remove('hidden');
  el.attachChip.textContent = `📎 กำลังอ่านไฟล์ ${file.name} ...`;
  try {
    const text = await extractTextFromFile(file);
    pendingAttachment = { name: file.name, text };
    renderAttachChip();
  } catch (err) {
    pendingAttachment = null;
    el.attachChip.classList.add('hidden');
    alert('อ่านไฟล์ไม่สำเร็จ: ' + err.message);
  }
}

function renderAttachChip() {
  if (!pendingAttachment) {
    el.attachChip.classList.add('hidden');
    el.attachChip.innerHTML = '';
    return;
  }
  el.attachChip.classList.remove('hidden');
  el.attachChip.innerHTML = `📎 ${pendingAttachment.name} (${pendingAttachment.text.length.toLocaleString()} ตัวอักษร) <button type="button" id="attach-remove">✕</button>`;
  document.getElementById('attach-remove').addEventListener('click', () => {
    pendingAttachment = null;
    renderAttachChip();
  });
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

  if (msg.role === 'user') {
    bubble.textContent = msg.displayContent || msg.content;
    if (msg.attachmentName) {
      const chip = document.createElement('div');
      chip.className = 'attach-tag';
      chip.textContent = `📎 ${msg.attachmentName}`;
      bubble.appendChild(chip);
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
    renderMarkdownWithMath(content, msg.content);
    bubble.appendChild(content);

    const isLastMsg = idx === currentSession.messages.length - 1;
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
  persistCurrentSession();

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
  persistCurrentSession();
  runLessonCompletion(true);
}

function runLessonCompletion(isFinalStep) {
  setBusy(true);
  const apiMessages = [
    { role: 'system', content: buildLessonSystemPrompt() },
    ...currentSession.messages.filter((m) => !m.isError).map((m) => ({ role: m.role, content: m.content })),
  ];

  const assistantMsg = { role: 'assistant', content: '', reasoning: '', isFinalAttempt: !!isFinalStep };
  currentSession.messages.push(assistantMsg);
  const idx = currentSession.messages.length - 1;
  renderChatView();
  const bubbleEl = () => document.querySelector(`#msg-${idx} .msg-bubble`);

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
        currentSession.finalGenerated = true;
        assistantMsg.showPdfButton = true;
      }
      setBusy(false);
      renderChatView();
      persistCurrentSession();
    },
    onError: (err) => {
      assistantMsg.content = '⚠️ เกิดข้อผิดพลาด: ' + err.message;
      assistantMsg.isError = true;
      setBusy(false);
      renderChatView();
      persistCurrentSession();
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
  persistCurrentSession();

  runExerciseQueue([1, 2, 3, 4]);
}

async function runExerciseQueue(levels) {
  setBusy(true);
  for (const level of levels) {
    await generateExerciseLevel(level);
  }
  setBusy(false);
}

function generateExerciseLevel(level) {
  return new Promise((resolve) => {
    const set = currentSession.exerciseSets[level];
    set.status = 'streaming';
    set.content = '';
    set.reasoning = '';
    renderExerciseCard(level);

    const attachmentBlock = currentSession.attachment
      ? buildAttachmentBlock(currentSession.attachment.name, currentSession.attachment.text)
      : '';
    const apiMessages = [
      { role: 'system', content: buildExerciseSystemPrompt(level) },
      { role: 'user', content: currentSession.topicText + attachmentBlock },
    ];

    callOpenRouterStream(apiMessages, {
      onReasoningToken: (chunk) => {
        set.reasoning += chunk;
        updateExerciseCardBody(level);
      },
      onToken: (_delta, fullText) => {
        set.content = fullText;
        updateExerciseCardBody(level);
      },
      onDone: (fullText) => {
        set.content = fullText;
        set.status = 'done';
        renderExerciseCard(level);
        persistCurrentSession();
        resolve();
      },
      onError: (err) => {
        set.status = 'error';
        set.content = '⚠️ เกิดข้อผิดพลาด: ' + err.message;
        renderExerciseCard(level);
        persistCurrentSession();
        resolve();
      },
    });
  });
}

function regenerateExerciseLevel(level) {
  if (isBusy) return;
  setBusy(true);
  generateExerciseLevel(level).then(() => setBusy(false));
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
