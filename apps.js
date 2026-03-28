// Compatibility shim: some environments reference "apps.js" by mistake.
// Keep this tiny bridge so either filename works without breaking the Math Hub.
if (!window.__futureflowAppLoaded) {
  window.__futureflowAppLoaded = true;
  const script = document.createElement('script');
  script.src = 'app.js';
  script.defer = true;
  document.head.appendChild(script);
}
