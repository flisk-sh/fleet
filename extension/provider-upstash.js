// Upstash Box: API Keys -> "API Key" -> name -> Create -> a second dialog shows the key once as text.
(async () => {
  if (!(await asked())) return;
  try {
    (await waitFor(() => byText('button', /^API Key$/))).click();
    const dialog = await waitFor(() => document.querySelector('[role=dialog]'));
    typeInto(await waitFor(() => dialog.querySelector('input[placeholder="my-api-key"]')), KEY_NAME);
    (await waitFor(() => byText('button', /^Create$/, dialog))).click();
    const el = await waitFor(() => [...document.querySelectorAll('[role=dialog] *')].find((e) => !e.children.length && /^box_[A-Za-z0-9]{20,}$/.test(e.textContent.trim())));
    deliver(el.textContent.trim());
  } catch (e) { console.warn('Fleet Connect: Upstash page changed, paste the key by hand.', e); }
})();
