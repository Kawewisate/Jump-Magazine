// Small, dependency-free motion coordinator shared by the app, print preview and slides.
(function installMotionUI() {
  const reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  function reducedMotion() {
    return Boolean(reducedQuery?.matches);
  }

  function removeAfterAnimation(element, className, fallbackMs = 450) {
    if (!element) return;
    const cleanup = () => element.classList.remove(className);
    element.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, reducedMotion() ? 0 : fallbackMs);
  }

  function reveal(element, className = 'motion-enter') {
    if (!element) return;
    element.classList.remove(className);
    // Force a fresh animation when the same node is reused by a renderer.
    void element.offsetWidth;
    element.classList.add(className);
    removeAfterAnimation(element, className);
  }

  function revealView(element) {
    reveal(element, 'motion-view-enter');
  }

  function revealStagger(elements, className = 'motion-enter') {
    [...(elements || [])].forEach((element, index) => {
      element.style.setProperty('--motion-index', String(index));
      reveal(element, className);
    });
  }

  function openLayer(layer) {
    if (!layer) return;
    layer.classList.remove('motion-layer-closing');
    layer.classList.add('motion-layer');
    layer.classList.remove('hidden');
  }

  function closeLayer(layer) {
    if (!layer || layer.classList.contains('hidden')) return;
    layer.classList.add('motion-layer', 'motion-layer-closing');
    layer.addEventListener('animationend', (event) => {
      if (event.target !== layer || !layer.classList.contains('motion-layer-closing')) return; // เปิดซ้ำระหว่างปิด: ห้ามซ่อน
      layer.classList.add('hidden');
      layer.classList.remove('motion-layer', 'motion-layer-closing');
    }, { once: true });
    window.setTimeout(() => {
      if (layer.classList.contains('motion-layer-closing')) {
        layer.classList.add('hidden');
        layer.classList.remove('motion-layer', 'motion-layer-closing');
      }
    }, reducedMotion() ? 0 : 180);
  }

  function transitionTheme(applyTheme) {
    document.documentElement.classList.add('motion-theme-transition');
    applyTheme?.();
    window.setTimeout(() => document.documentElement.classList.remove('motion-theme-transition'), reducedMotion() ? 0 : 420);
  }

  window.MotionUI = { reducedMotion, reveal, revealView, revealStagger, openLayer, closeLayer, transitionTheme };
})();
