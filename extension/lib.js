// Shared by the provider scripts: wait for an element, type into a React input, ask the background if this tab was opened by fleet.
const KEY_NAME = 'fleet';
const waitFor = (fn, ms = 15000) => new Promise((ok, fail) => {
  const t0 = Date.now();
  const tick = () => { const v = fn(); if (v) return ok(v); if (Date.now() - t0 > ms) return fail(new Error('timeout')); setTimeout(tick, 150); };
  tick();
});
const byText = (sel, re, root = document) => [...root.querySelectorAll(sel)].find((e) => re.test(e.textContent.trim()));
function typeInto(input, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const asked = () => new Promise((ok) => chrome.runtime.sendMessage({ type: 'ready?' }, (r) => ok(!!(r && r.go))));
const deliver = (key) => chrome.runtime.sendMessage({ type: 'key', key });
