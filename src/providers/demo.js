// Demo provider: a simulated pod that lives inside fleet. No machine, no account, no cost.
// It lets anyone (and synthetic test users) walk the whole journey: start, run, stop, and see a pod die.
// It proves fleet's side only, never that a real provider's adapter works.
// Send any value in X-Demo-Key. "ttl=30" makes the pod die after 30 seconds (default 10 minutes, at most 1 hour).

const parseTtl = (key) => {
  const m = /ttl=(\d+)/.exec(String(key || ''));
  return Math.min(3600, Math.max(5, m ? Number(m[1]) : 600)) * 1000;
};
const gone = () => Object.assign(new Error('HTTP 404: demo pod expired'), { status: 404 });
const expiryOf = (id) => parseInt(String(id).split('-')[0], 36);

export default {
  label: 'Demo (simulated)',
  keyHeader: 'X-Demo-Key',
  demo: true,
  priceSource: '',
  note: 'Not a real machine. Fleet answers like a provider so you can try the whole flow without an account.',
  price: () => 0,

  async create(key) {
    const rand = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(36)).join('');
    return { id: `${(Date.now() + parseTtl(key)).toString(36)}-${rand}` };
  },

  async run(key, id, command) {
    if (!(expiryOf(id) > Date.now())) throw gone();
    const echo = /^\s*echo\s+(.*)$/s.exec(command);
    const said = echo ? `${echo[1].replace(/^(['"])(.*)\1$/s, '$2')}\n` : '';
    const left = Math.round((expiryOf(id) - Date.now()) / 1000);
    return {
      stdout: `${said}[demo pod: simulated by fleet, no real machine ran "${command}". It dies in ${left} s.]\n`,
      stderr: '',
      exitCode: 0,
    };
  },

  async stop(key, id) {
    if (!(expiryOf(id) > Date.now())) throw gone();
  },
};
