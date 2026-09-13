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
