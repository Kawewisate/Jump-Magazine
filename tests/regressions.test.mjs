import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);

function load(file, extras = {}) {
  const context = { console, TextDecoder, TextEncoder, setTimeout, clearTimeout, AbortController, ...extras };
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
  assert.equal(manifest.name, 'ผู้ช่วยครู AI');
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
  assert.match(html, /<script src="pwa\.js"><\/script>/);
  assert.doesNotMatch(html, /beforeinstallprompt|Install app|ติดตั้งเป็นแอป/i);
});

test('service worker keeps API traffic network-only and supports navigation fallback', () => {
  const worker = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /openrouter\.ai/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /caches\.match\('\.\/index\.html'\)/);
});

test('stream that goes silent is aborted by the idle timeout instead of hanging forever', async () => {
  const context = load('api.js', {
    location: { href: 'http://localhost/' },
    getSettings: () => ({ apiKey: 'test', model: 'test' }),
    fetch: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });
  vm.runInContext('STREAM_IDLE_TIMEOUT_MS = 20', context);
  const events = [];
  await context.callOpenRouterStream([], {
    onDone: () => events.push('done'),
    onError: (err) => events.push(err.message),
  });
  assert.equal(events.length, 1);
  assert.match(events[0], /ค้าง/);
});

test('storage event from another tab drops the cached sessions', () => {
  const store = { teacherAI_sessions: '[]' };
  const listeners = {};
  const context = load('storage.js', {
    localStorage: { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } },
    addEventListener: (name, callback) => { listeners[name] = callback; },
    dispatchEvent: () => true,
    Event: class { constructor(type) { this.type = type; } },
  });
  assert.deepEqual(Array.from(context.getSessions()), []);
  store.teacherAI_sessions = JSON.stringify([{ id: 'a', mode: 'lesson', title: 'จากอีกแท็บ', messages: [] }]);
  assert.deepEqual(Array.from(context.getSessions()), [], 'cache is still stale before the event');
  listeners.storage({ key: 'teacherAI_sessions' });
  assert.equal(context.getSessions()[0].id, 'a');
  assert.equal(context.getSessionSummaries()[0].title, 'จากอีกแท็บ');
});

test('session summaries follow saves without re-parsing history', () => {
  const store = {};
  const context = load('storage.js', {
    localStorage: { getItem: (key) => store[key] ?? null, setItem: (key, value) => { store[key] = value; } },
  });
  context.upsertSession({ id: 'a', mode: 'lesson', title: 'A', messages: [] });
  context.upsertSession({ id: 'b', mode: 'exercise', title: 'B', messages: [] });
  assert.deepEqual(Array.from(context.getSessionSummaries(), (s) => s.id), ['b', 'a']);
  context.deleteSession('b');
  assert.deepEqual(Array.from(context.getSessionSummaries(), (s) => s.id), ['a']);
});

test('a CDN script that failed to load can be retried', async () => {
  let attempts = 0;
  const document = {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild: (script) => {
        attempts++;
        queueMicrotask(() => (attempts === 1 ? script.onerror() : script.onload()));
      },
    },
  };
  const context = load('diagrams-core.js', { document });
  await assert.rejects(context.loadScriptOnce('https://cdn.example/lib.js'), /โหลดไลบรารีไม่สำเร็จ/);
  await context.loadScriptOnce('https://cdn.example/lib.js');
  assert.equal(attempts, 2);
});

function loadApp(extras = {}) {
  const element = () => ({ addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  return load('app.js', {
    document: { getElementById: element, querySelectorAll: () => [], addEventListener() {} },
    ...extras,
  });
}

test('interrupted exercise sets (including ones stuck repairing) become retryable errors', () => {
  const context = loadApp();
  const session = {
    mode: 'exercise',
    exerciseSets: {
      1: { status: 'pending', content: '' },
      2: { status: 'streaming', content: 'x' },
      3: { status: 'repairing', content: 'y' },
      4: { status: 'done', content: 'z' },
    },
  };
  context.recoverInterruptedSession(session);
  assert.deepEqual(Object.values(session.exerciseSets).map((set) => set.status), ['error', 'error', 'error', 'done']);
});

test('frame scheduler coalesces updates and can be cancelled', () => {
  const frames = [];
  const context = loadApp({
    requestAnimationFrame: (fn) => frames.push(fn),
    cancelAnimationFrame: () => { frames.length = 0; },
  });
  let calls = 0;
  const scheduler = context.createFrameScheduler(() => { calls++; });
  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(calls, 1);
  scheduler.schedule();
  scheduler.cancel();
  frames.forEach((fn) => fn && fn());
  assert.equal(calls, 1, 'cancelled frame must not fire');
});

test('re-opening a layer while it is closing is not undone by the old close animation', async () => {
  const context = load('motion.js', {
    document: { documentElement: { classList: { add() {}, remove() {} } } },
    matchMedia: () => ({ matches: false }),
  });
  const classes = new Set();
  const listeners = {};
  const layer = {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  context.MotionUI.openLayer(layer);
  context.MotionUI.closeLayer(layer);
  context.MotionUI.openLayer(layer);
  listeners.animationend({ target: layer });
  assert.equal(classes.has('hidden'), false);
});

test('stylesheets only reference asset files that exist', () => {
  const html = fs.readFileSync(new URL('index.html', root), 'utf8');
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]).filter((href) => !/^https?:/.test(href));
  assert.ok(sheets.length > 0);
  for (const sheet of sheets) {
    const css = fs.readFileSync(new URL(sheet, root), 'utf8');
    for (const [, ref] of css.matchAll(/url\(['"]?(assets\/[^'")]+)['"]?\)/g)) {
      assert.ok(fs.existsSync(new URL(ref, root)), `${sheet} references missing ${ref}`);
    }
  }
});
