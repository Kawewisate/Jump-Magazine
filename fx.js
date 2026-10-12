// Cinematic FX coordinator. Layers on top of MotionUI; GSAP is optional (falls back to CSS/WAAPI).
(function installFX() {
  const doc = typeof document !== 'undefined' ? document : null;
  const root = doc && doc.documentElement;
  const PARTICLE_LIMIT = 40;
  const COLORS = ['#ffffff', '#8ff0ff', '#7ee86a', '#fff08a', '#5cc8f5'];
  let ready = false;
  let liveParticles = 0;
  let particleHost = null;
  let px = 0;
  let py = 0;
  let frame = 0;

  function reduced() {
    return Boolean(window.MotionUI?.reducedMotion?.());
  }

  function enabled() {
    return Boolean(root && root.dataset && root.dataset.fx === 'full') && !reduced();
  }

  function cleanupOnEnd(element, className, fallbackMs = 2200) {
    const cleanup = () => element.classList.remove(className);
    element.addEventListener('animationend', (event) => {
      if (event.target === element) cleanup();
    });
    window.setTimeout(cleanup, fallbackMs);
  }

  function replay(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    cleanupOnEnd(element, className);
  }

  // ---------- Scene decoration ----------
  function buildScene() {
    const scene = doc.querySelector('.aero-scene');
    if (!scene || scene.querySelector('.fx-layer')) return;
    const add = (className, style) => {
      const node = doc.createElement('div');
      node.className = `fx-layer ${className}`;
      node.setAttribute('aria-hidden', 'true');
      if (style) Object.entries(style).forEach(([key, value]) => node.style.setProperty(key, value));
      scene.appendChild(node);
    };
    add('fx-aurora fx-aurora-1');
    add('fx-aurora fx-aurora-2');
    add('fx-godrays');
    add('fx-caustics');
    const sizes = [78, 34, 52, 22, 64, 40];
    sizes.forEach((size, index) => {
      add('fx-bubble', {
        width: `${size}px`,
        height: `${size}px`,
        left: `${6 + ((index * 37) % 88)}%`,
        bottom: '-12vh',
        '--fx-dur': `${16 + ((index * 5) % 13)}s`,
        '--fx-delay': `${-(index * 3.1)}s`,
        '--fx-sway': `${(index % 2 ? -1 : 1) * (18 + index * 4)}px`,
      });
    });
    if (!doc.getElementById('fx-particles')) {
      particleHost = doc.createElement('div');
      particleHost.id = 'fx-particles';
      particleHost.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(particleHost);
    }
  }

  // Split the welcome heading into words (Thai-aware) so each can animate in.
  function splitHeading() {
    const heading = doc.querySelector('#welcome-screen h2');
    if (!heading || heading.dataset.fxSplit) return;
    heading.dataset.fxSplit = '1';
    const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
    let index = 0;
    [...heading.childNodes].forEach((node) => {
      if (node.nodeType === 3) {
        const pieces = segmenter
          ? [...segmenter.segment(node.textContent)].map((part) => part.segment)
          : node.textContent.split(/(\s+)/);
        const frag = doc.createDocumentFragment();
        let last = null;
        pieces.forEach((piece) => {
          if (!piece) return;
          if (last && /^[/\-.,:;]+$/.test(piece)) {
            last.textContent += piece; // keep punctuation glued so lines never break at "/"
            return;
          }
          if (!piece.trim()) {
            frag.appendChild(doc.createTextNode(piece));
            last = null;
            return;
          }
          const word = doc.createElement('span');
          word.className = 'fx-word';
          word.style.setProperty('--i', String(index++));
          word.textContent = piece;
          frag.appendChild(word);
          last = word;
        });
        node.replaceWith(frag);
      } else if (node.nodeType === 1) {
        node.classList.add('fx-emoji');
      }
    });
  }

  // ---------- Pointer-driven effects ----------
  const TILT_SELECTOR = '.welcome-cta, .welcome-feature, .exercise-card';
  let lastX = 0;
  let lastY = 0;
  let tiltTarget = null;
  let tiltRect = null; // วัดครั้งเดียวต่อการ hover (ล้างเมื่อ scroll/resize/ออกจากการ์ด) แทนการวัดทุก pointermove
  let parallaxHosts = null;

  function getParallaxHosts() {
    // ตัวแปร --fx-px/py เขียนเฉพาะที่ฉากหลังกับภาพ hero (ผู้ใช้จริงมีแค่ 2 ที่นี้) ไม่เขียนที่ :root ที่ทำให้ style recalc ทั้งหน้า
    if (!parallaxHosts || parallaxHosts.some((node) => !node.isConnected)) {
      parallaxHosts = [...doc.querySelectorAll('.aero-scene, .welcome-visual')];
    }
    return parallaxHosts;
  }

  function flushPointer() {
    frame = 0;
    const pxText = px.toFixed(3);
    const pyText = py.toFixed(3);
    getParallaxHosts().forEach((node) => {
      node.style.setProperty('--fx-px', pxText);
      node.style.setProperty('--fx-py', pyText);
    });
    if (tiltTarget && tiltTarget.isConnected) {
      if (!tiltRect) tiltRect = tiltTarget.getBoundingClientRect();
      const x = (lastX - tiltRect.left) / tiltRect.width - 0.5;
      const y = (lastY - tiltRect.top) / tiltRect.height - 0.5;
      tiltTarget.style.setProperty('--fx-tilt-y', `${(x * 10).toFixed(2)}deg`);
      tiltTarget.style.setProperty('--fx-tilt-x', `${(-y * 10).toFixed(2)}deg`);
    }
  }

  function onPointerMove(event) {
    if (event.pointerType === 'touch') return;
    lastX = event.clientX;
    lastY = event.clientY;
    px = (lastX / window.innerWidth - 0.5) * 2;
    py = (lastY / window.innerHeight - 0.5) * 2;
    const target = event.target.closest?.(TILT_SELECTOR) || null;
    if (target !== tiltTarget) {
      tiltTarget = target;
      tiltRect = null;
    }
    if (!frame) frame = window.requestAnimationFrame(flushPointer);
  }

  function onLayoutChange() {
    tiltRect = null;
  }

  function onPointerOut(event) {
    const target = event.target.closest?.(TILT_SELECTOR);
    if (!target) return;
    target.style.removeProperty('--fx-tilt-x');
    target.style.removeProperty('--fx-tilt-y');
    if (target === tiltTarget) {
      tiltTarget = null;
      tiltRect = null;
    }
  }

  const positioned = new WeakSet(); // ปุ่มที่ตรวจ/ตั้ง position แล้ว — ไม่ต้อง getComputedStyle ซ้ำทุกคลิก

  function onClick(event) {
    if (!enabled()) return;
    const target = event.target.closest?.('button, .session-item');
    if (!target || target.disabled) return;
    const rect = target.getBoundingClientRect();
    const dot = doc.createElement('span');
    dot.className = 'fx-ripple';
    dot.style.left = `${event.clientX - rect.left}px`;
    dot.style.top = `${event.clientY - rect.top}px`;
    if (!positioned.has(target)) {
      positioned.add(target);
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
    }
    target.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    window.setTimeout(() => dot.remove(), 900);
  }

  // ---------- Particles ----------
  function burst(x, y, { count = 14, spread = 110, star = true } = {}) {
    if (!enabled() || !particleHost) return;
    for (let i = 0; i < count && liveParticles < PARTICLE_LIMIT; i += 1) {
      const dot = doc.createElement('span');
      dot.className = `fx-particle${star && i % 3 === 0 ? ' is-star' : ''}`;
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.setProperty('--c', COLORS[i % COLORS.length]);
      dot.style.setProperty('--s', `${6 + Math.round(Math.random() * 8)}px`);
      particleHost.appendChild(dot);
      liveParticles += 1;
      const angle = Math.random() * Math.PI * 2;
      const distance = spread * (0.4 + Math.random() * 0.8);
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 30;
      const done = () => {
        if (!dot.isConnected) return;
        dot.remove();
        liveParticles -= 1;
      };
      const keyframes = [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(.2) rotate(240deg)`, opacity: 0 },
      ];
      const options = { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' };
      if (dot.animate) dot.animate(keyframes, options).onfinish = done;
      else done();
    }
  }

  function burstFrom(element, options) {
    if (!element?.getBoundingClientRect) return;
    const rect = element.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 2, options);
  }

  function celebrate() {
    if (!enabled()) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    [0.25, 0.5, 0.75].forEach((fraction, i) => {
      window.setTimeout(() => burst(w * fraction, h * 0.35, { count: 16, spread: 180 }), i * 160);
    });
  }

  // ---------- Entry helpers used by app.js ----------
  function enterMessage(element) {
    if (!enabled() || !element) return;
    replay(element, 'fx-enter');
  }

  function enterCards(nodes) {
    if (!enabled()) return;
    [...(nodes || [])].forEach((node, index) => {
      node.style.setProperty('--fx-i', String(index));
      replay(node, 'fx-enter');
    });
  }

  function enterSessions() {
    if (!enabled()) return;
    doc.querySelectorAll('#session-list .session-item').forEach((item, index) => {
      item.style.setProperty('--i', String(Math.min(index, 12)));
    });
  }

  function markDone(element) {
    if (!enabled() || !element) return;
    replay(element, 'fx-done');
    burstFrom(element, { count: 8, spread: 70 });
  }

  function enterView(element) {
    if (!enabled() || !element || !window.gsap) return;
    // GSAP adds a springy stagger on top of the CSS entry for the direct children of the view.
    const targets = element.querySelectorAll('#chat-header, #chat-input-area');
    if (!targets.length) return;
    window.gsap.from(targets, { y: 26, opacity: 0, duration: 0.7, ease: 'back.out(1.6)', stagger: 0.1, clearProps: 'all' });
  }

  function playIntro() {
    if (!enabled() || !window.gsap) return;
    const sidebarParts = doc.querySelectorAll('#sidebar .sidebar-header, #sidebar .mode-btn, #sidebar .sidebar-section-title, #sidebar .theme-toggle, #sidebar .settings-btn');
    if (sidebarParts.length) {
      window.gsap.from(sidebarParts, { x: -36, opacity: 0, duration: 0.8, ease: 'power4.out', stagger: 0.08, clearProps: 'all' });
    }
  }

  // ---------- Theme transition ----------
  function transitionTheme(applyTheme, originEl) {
    if (!enabled() || !doc.startViewTransition) {
      window.MotionUI?.transitionTheme?.(applyTheme);
      return;
    }
    const rect = originEl?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = doc.startViewTransition(() => applyTheme?.());
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' }
      );
      burst(x, y, { count: 18, spread: 160 });
    }).catch(() => {});
  }

  // ---------- Switch ----------
  function setEnabled(on) {
    if (!root) return;
    root.dataset.fx = on ? 'full' : 'off';
    if (!on && particleHost) {
      particleHost.textContent = '';
      liveParticles = 0;
    }
    if (on) {
      splitHeading();
      buildScene();
    }
  }

  function init() {
    if (ready || !doc) return;
    ready = true;
    let mode = 'full';
    try {
      mode = typeof getSettings === 'function' ? getSettings().effects : 'full';
    } catch {
      mode = 'full';
    }
    root.dataset.fx = mode === 'off' ? 'off' : 'full';
    buildScene();
    splitHeading();
    doc.addEventListener('pointermove', onPointerMove, { passive: true });
    doc.addEventListener('pointerout', onPointerOut, { passive: true });
    doc.addEventListener('scroll', onLayoutChange, { passive: true, capture: true });
    window.addEventListener('resize', onLayoutChange, { passive: true });
    doc.addEventListener('click', onClick, { passive: true });
    playIntro();
  }

  window.FX = { init, enabled, setEnabled, burst, burstFrom, celebrate, enterMessage, enterCards, enterSessions, enterView, markDone, transitionTheme };
})();
