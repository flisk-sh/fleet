// Runs on fleet.flisk.si. Talks to the Providers page with same-window messages.
const PROVIDERS = ['e2b', 'upstash'];
const say = (m) => window.postMessage(m, location.origin);
addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== location.origin || !e.data) return;
  if (e.data.type === 'flisk-connect:hello') say({ type: 'flisk-connect:ready', providers: PROVIDERS });
  if (e.data.type === 'flisk-connect:request' && PROVIDERS.includes(e.data.provider)) chrome.runtime.sendMessage({ type: 'start', provider: e.data.provider });
});
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'key') say({ type: 'flisk-connect:key', provider: m.provider, fields: { key: m.key } });
});
say({ type: 'flisk-connect:ready', providers: PROVIDERS });
