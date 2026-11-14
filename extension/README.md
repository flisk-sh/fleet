# Fleet Connect (Chrome extension)

One press to connect a sandbox provider to fleet. On fleet.flisk.si → Providers, a card shows **Connect with extension**. The extension opens the provider's key page, creates a key named `fleet`, reads it once and fills fleet's connect form. Works today for **E2B** and **Upstash Box**. You must already be signed in to the provider. Daytona and others are not covered yet.

Try it: `chrome://extensions` → Developer mode → Load unpacked → this folder.

The key goes from the provider's page to the fleet tab through the extension only; it is never logged or stored by the extension. If a provider changes its page, the script stops and you paste the key by hand as before.
