// E2B: Keys page -> "Create a key" -> name -> Create -> the dialog shows the key once in a read-only field.
(async () => {
  if (!(await asked())) return;
  try {
    (await waitFor(() => byText('button', /^Create a key$/))).click();
    const dialog = await waitFor(() => document.querySelector('[role=dialog]'));
    typeInto(await waitFor(() => dialog.querySelector('input[placeholder="Enter key name"]')), KEY_NAME);
    (await waitFor(() => dialog.querySelector('button[type=submit]') || byText('button', /^Create$/, dialog))).click();
    const field = await waitFor(() => { const i = dialog.querySelector('input[readonly]'); return i && /^e2b_/.test(i.value) ? i : null; });
    deliver(field.value);
  } catch (e) { console.warn('Fleet Connect: E2B page changed, paste the key by hand.', e); }
})();
