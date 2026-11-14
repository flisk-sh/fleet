// Opens the provider's key page, and carries the new key back to the fleet tab that asked.
const PAGES = {
  e2b: 'https://console.e2b.dev/dashboard?tab=keys',
  upstash: 'https://console.upstash.com/box',
};
const pending = {}; // provider tab id -> { provider, fleetTab }
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.type === 'start' && PAGES[m.provider]) {
    const fleetTab = sender.tab.id;
    chrome.tabs.create({ url: PAGES[m.provider], active: true }).then((tab) => { pending[tab.id] = { provider: m.provider, fleetTab }; });
  } else if (m.type === 'ready?') {
    reply({ go: !!pending[sender.tab.id] });
  } else if (m.type === 'key' && pending[sender.tab.id]) {
    const { provider, fleetTab } = pending[sender.tab.id];
    delete pending[sender.tab.id];
    chrome.tabs.sendMessage(fleetTab, { type: 'key', provider, key: m.key });
    chrome.tabs.update(fleetTab, { active: true });
    chrome.tabs.remove(sender.tab.id);
  }
});
