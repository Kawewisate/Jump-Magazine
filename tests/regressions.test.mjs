import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);

function load(file, extras = {}) {
  const context = { console, TextDecoder, TextEncoder, ...extras };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL(file, root), 'utf8'), context, { filename: file });
  return context;
}

function sse(payload) {
  let sent = false;
  return async () => ({
    ok: true,
    body: {
      getReader: () => ({
        read: async () => sent
          ? { done: true }
          : (sent = true, { done: false, value: new TextEncoder().encode(payload) }),
        cancel: async () => {},
      }),
    },
  });
}

test('stream requires an explicit successful terminal event', async () => {
  const context = load('api.js', {
    location: { href: 'http://localhost/' },
    getSettings: () => ({ apiKey: 'test', model: 'test' }),
    fetch: sse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
  });
  const events = [];
  await context.callOpenRouterStream([], {
    onDone: () => events.push('done'),
    onError: () => events.push('error'),
  });
  assert.deepEqual(events, ['error']);
});

test('literal math placeholders do not collide with formula placeholders', () => {
  const context = load('print.js', {
    marked: { parse: (value) => value },
    DOMPurify: { sanitize: (value) => value },
  });
  assert.equal(context.markdownToSafeHtml('%%MATH0%%'), '%%MATH0%%');
  assert.match(context.markdownToSafeHtml('x $a+b$'), /x \$a\+b\$/);
});

test('pdf page cuts land between lines and keep headings with their content', () => {
  const { computePageSlices } = load('print.js');
  // บรรทัดสูง 20px ห่างกัน 10px: 0-20, 30-50, ..., บรรทัดที่ 4 (90-110) คร่อมขอบหน้า 100px
  const lines = Array.from({ length: 10 }, (_, i) => ({ top: i * 30, bottom: i * 30 + 20 }));
  const slices = computePageSlices(lines, [], 290, 100);
  for (const [, end] of slices.slice(0, -1)) {
    assert.ok(lines.every((l) => end <= l.top || end >= l.bottom), `cut ${end} splits a line`);
  }
  assert.deepEqual(Array.from(slices[0]), [0, 85]);

  // หัวข้อ (60-80) เป็นบรรทัดสุดท้ายก่อนจุดตัด → ต้องย้ายไปหน้าถัดไป
  const withHeading = computePageSlices(lines, [{ top: 60, bottom: 80 }], 290, 100);
  assert.deepEqual(Array.from(withHeading[0]), [0, 55]);
});

test('malformed or wrongly shaped history degrades to an empty session list', () => {
  const context = load('storage.js', {
    localStorage: { getItem: () => '{"bad":true}' },
  });
  assert.deepEqual(Array.from(context.getSessions()), []);
});

test('motion coordinator respects reduced motion and still resolves UI state', async () => {
  const context = load('motion.js', {
    setTimeout,
    document: { documentElement: { classList: { add() {}, remove() {} } } },
    matchMedia: () => ({ matches: true }),
  });
  const classes = new Set(['hidden']);
  const listeners = {};
  const element = {
    offsetWidth: 0,
    style: { setProperty() {} },
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };

  assert.equal(context.MotionUI.reducedMotion(), true);
  context.MotionUI.openLayer(element);
  assert.equal(classes.has('hidden'), false);
  context.MotionUI.reveal(element);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(classes.has('motion-enter'), false);
  context.MotionUI.closeLayer(element);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(classes.has('hidden'), true);
  assert.equal(typeof listeners.animationend, 'function');
});

test('PWA manifest defines a relative standalone install', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'ครูพร้อมสอน');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.theme_color, '#0d82c4');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(new URL(icon.src, root)));
});

test('index links PWA metadata and registration without an app-owned install UI', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /<script (?:defer )?src="pwa\.js"><\/script>/);
  assert.doesNotMatch(html, /beforeinstallprompt|Install app|ติดตั้งเป็นแอป/i);
});

test('service worker keeps API traffic network-only and supports navigation fallback', () => {
  const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /openrouter\.ai/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /caches\.match\('\.\/index\.html'\)/);
});

test('fx layer is off when disabled or reduced-motion, and works without gsap', () => {
  const makeRoot = (fx) => ({ documentElement: { dataset: { fx } } });
  const on = load('fx.js', { setTimeout, innerWidth: 800, innerHeight: 600, document: makeRoot('full'), MotionUI: { reducedMotion: () => false } });
  assert.equal(on.FX.enabled(), true);
  const off = load('fx.js', { document: makeRoot('off'), MotionUI: { reducedMotion: () => false } });
  assert.equal(off.FX.enabled(), false);
  const reduced = load('fx.js', { document: makeRoot('full'), MotionUI: { reducedMotion: () => true } });
  assert.equal(reduced.FX.enabled(), false);
  assert.doesNotThrow(() => on.FX.enterMessage(null));
  assert.doesNotThrow(() => on.FX.celebrate());
});

function makeFakeSceneDocument() {
  function makeEl(className = '') {
    const el = {
      className,
      attributes: {},
      style: { setProperty() {} },
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      querySelector(sel) {
        if (sel === '.fx-layer') return this.children.find((c) => c.className.includes('fx-layer')) || null;
        return null;
      },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
    return el;
  }
  const scene = makeEl('aero-scene');
  const byId = {};
  return {
    documentElement: { dataset: {} },
    scene,
    querySelector: (sel) => (sel === '.aero-scene' ? scene : null),
    querySelectorAll: () => [],
    createElement: (tag) => makeEl(),
    getElementById: (id) => byId[id] || null,
    body: { appendChild: (node) => { node.id ??= 'fx-particles'; byId[node.id] = node; } },
    addEventListener() {},
  };
}

test('fx background scene drops the heavy rotating aurora layer and caps bubbles at 6', () => {
  const doc = makeFakeSceneDocument();
  const ctx = load('fx.js', { document: doc, MotionUI: { reducedMotion: () => false } });
  ctx.FX.setEnabled(true);
  const classNames = doc.scene.children.map((c) => c.className);
  assert.ok(!classNames.some((c) => c.includes('fx-aurora-3')), 'fx-aurora-3 should be removed');
  assert.equal(classNames.filter((c) => c.includes('fx-aurora')).length, 2);
  assert.equal(classNames.filter((c) => c.includes('fx-bubble')).length, 6);
});

test('effects setting normalizes to full or off', () => {
  const context = load('storage.js', { localStorage: { getItem: () => JSON.stringify({ effects: 'weird' }) } });
  assert.equal(context.getSettings().effects, 'full');
  const off = load('storage.js', { localStorage: { getItem: () => JSON.stringify({ effects: 'off' }) } });
  assert.equal(off.getSettings().effects, 'off');
});

test('incremental streaming text conversion matches a full rescan at every prefix', () => {
  const ctx = load('stream-text.js');
  const text = 'intro\n```diagram\n{"type":"x"}\n```\nmiddle ``` stray\n```mermaid\ngraph TD\n```\nend\n```diagram\n{"open":';
  const convert = ctx.createStreamingTextConverter();
  for (let i = 0; i <= text.length; i += 1) {
    const prefix = text.slice(0, i);
    assert.equal(convert(prefix), ctx.convertStreamingChunk(prefix), `prefix length ${i}`);
  }
  assert.equal(convert(text), ctx.convertStreamingChunk(text));
  // a fresh, unrelated text resets the settled prefix instead of reusing it
  assert.equal(convert('other'), 'other');
});

test('splitStreamLines always reconstructs the exact remaining text', () => {
  const ctx = load('stream-text.js');
  const text = 'สวัสดี ครับ\n\nสอง\n```diagram\n{"a":1}\n```\nthird line\nend';
  for (let committedLen = 0; committedLen <= text.length; committedLen += 1) {
    for (let i = committedLen; i <= text.length; i += 1) {
      const prefix = text.slice(0, i);
      const { lines, tail } = ctx.splitStreamLines(committedLen, prefix);
      const rebuilt = (lines.length ? lines.join('\n') + '\n' : '') + tail;
      assert.equal(rebuilt, prefix.slice(committedLen), `committedLen=${committedLen} i=${i}`);
    }
  }
});

function makeFakeStreamingDom() {
  function makeEl() {
    return {
      className: '',
      textContent: '',
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      insertBefore(node, ref) {
        const incoming = node.__fragment ? node.children.splice(0) : [node];
        const idx = ref ? this.children.indexOf(ref) : this.children.length;
        this.children.splice(idx === -1 ? this.children.length : idx, 0, ...incoming);
      },
      replaceChildren(...nodes) { this.children = nodes; },
    };
  }
  const doc = {
    createElement: () => makeEl(),
    createDocumentFragment: () => ({ __fragment: true, children: [], appendChild(child) { this.children.push(child); return child; } }),
  };
  return { doc, container: makeEl() };
}

function visibleText(container) {
  return container.children.map((c) => (c.textContent === '​' ? '' : c.textContent)).join('\n');
}

test('incremental line renderer always shows exactly what a full rescan would show', () => {
  const ctx = load('stream-text.js');
  const text = 'สวัสดี ครับ\n\nสอง\n```diagram\n{"a":1}\n```\nthird line\nend';
  const { doc, container } = makeFakeStreamingDom();
  const render = ctx.createStreamingTextRenderer(container, doc);
  const convert = ctx.createStreamingTextConverter();
  for (let i = 0; i <= text.length; i += 1) {
    const converted = convert(text.slice(0, i));
    render(converted);
    assert.equal(visibleText(container), converted, `prefix length ${i}`);
  }
});

test('incremental line renderer resets cleanly when fed text that is not a continuation', () => {
  const ctx = load('stream-text.js');
  const { doc, container } = makeFakeStreamingDom();
  const render = ctx.createStreamingTextRenderer(container, doc);
  render('first line\nsecond');
  assert.equal(visibleText(container), 'first line\nsecond');
  render('unrelated new answer\nwith two lines');
  assert.equal(visibleText(container), 'unrelated new answer\nwith two lines');
});

test('sessions are readable right after a debounced write and flush on demand', () => {
  const store = new Map();
  let writes = 0;
  const ctx = load('storage.js', {
    setTimeout,
    clearTimeout,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { writes += 1; store.set(k, v); } },
  });
  const a = { id: 'a', mode: 'lesson', messages: [], title: 'A' };
  const b = { id: 'b', mode: 'exercise', messages: [], title: 'B' };
  ctx.upsertSession(a);
  ctx.upsertSession(b);
  ctx.upsertSession({ ...a, title: 'A2' });
  assert.deepEqual(Array.from(ctx.getSessions()).map((s) => `${s.id}:${s.title}`), ['b:B', 'a:A2']);
  ctx.flushSessions();
  assert.equal(writes, 1, 'burst of upserts serializes once');
  assert.equal(JSON.parse(store.get('teacherAI_sessions')).length, 2);
  ctx.deleteSession('a');
  assert.deepEqual(Array.from(ctx.getSessions()).map((s) => s.id), ['b']);
});

test('heavy optional libraries are not loaded eagerly and local scripts are deferred', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /pdfjs-dist|mammoth|html2pdf/);
  assert.match(html, /<script defer src="app\.js"><\/script>/);
  assert.match(html, /<script defer src="stream-text\.js"><\/script>/);
  const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /stream-text\.js/);
});
