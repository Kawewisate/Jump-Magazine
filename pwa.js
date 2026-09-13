// Register the app shell only when the page is served from an origin that can
// support service workers. Opening index.html directly via file:// remains a
// supported development path, but cannot be made installable by the browser.
if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch((error) => console.warn('PWA service worker registration failed:', error));
  });
}

// Leave installation to Chrome/Edge's own three-dot menu. Preventing the
// default event suppresses automatic mini-infobars without faking browser UI.
window.addEventListener('beforeinstallprompt', (event) => event.preventDefault());
