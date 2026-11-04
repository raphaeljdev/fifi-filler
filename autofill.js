// autofill.js — registered only for sites where the user enabled auto-fill.
// Asks the background for the active profile (the background re-checks the
// sender's origin) and fills forms as they appear, empty fields only.
(function (root) {
  'use strict';
  const FF = root.FF;
  if (FF.autofillStarted) return;
  FF.autofillStarted = true;

  const WATCH_MS = 20000;

  chrome.runtime.sendMessage({ type: 'autofill-payload' }).then(payload => {
    if (!payload) return;
    let running = false;
    let timer = null;

    const attempt = async () => {
      if (running) return;
      running = true;
      try {
        await FF.content.fill(payload, { auto: true });
      } finally {
        running = false;
      }
    };

    attempt();
    // SPAs and multi-step forms render fields later.
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(attempt, 400);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), WATCH_MS);
  }).catch(() => { /* extension reloaded or site not allowed */ });
})(globalThis);
