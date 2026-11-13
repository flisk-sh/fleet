import { expect, test } from 'bun:test';
import { handle } from '../src/index.js';

test('HEAD works like GET without a body', async () => {
  for (const path of ['/', '/docs']) {
    const g = await handle(new Request(`https://fleet.test${path}`), {});
    const h = await handle(new Request(`https://fleet.test${path}`, { method: 'HEAD' }), {});
    expect(h.status).toBe(g.status);
    expect(await h.text()).toBe('');
  }
});
