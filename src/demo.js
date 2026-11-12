// The agent demo: a coding agent's job, run on the signed-in account's own working provider.
// Steps: start a fresh pod on the cheapest working provider the account connected, write a small Python module and
// its tests into it, run the tests with a time limit, stop the pod (always), and report each step with its time.
// Keys come from the account's connected providers and are never shown or stored by this page.
import { createPod, runPod, stopPod, writeFile } from './route.js';
import { esc, shell } from './page.js';

export const DEMO_PROVIDERS = ['daytona', 'blaxel', 'upstash', 'vercel'];

// What the agent wrote: a function and the tests that check it.
export const DEMO_FILES = {
  'work/slug.py': 'def slugify(text):\n    """Lower-case the text and join its words with dashes."""\n    return "-".join(text.lower().split())\n',
  'work/test_slug.py': [
    'import unittest',
    'from slug import slugify',
    '',
    'class SlugifyTests(unittest.TestCase):',
    '    def test_joins_words(self):',
    '        self.assertEqual(slugify("Hello Fleet World"), "hello-fleet-world")',
    '',
    '    def test_empty(self):',
    '        self.assertEqual(slugify(""), "")',
    '',
    '    def test_extra_spaces(self):',
    '        self.assertEqual(slugify("  many   spaces  "), "many-spaces")',
    '',
    'if __name__ == "__main__":',
    '    unittest.main()',
    '',
  ].join('\n'),
};

// Runs the job. keys: { provider: key } for the providers the account has. ctx: the same context pods use (logging, limits).
export async function demoRun(providers, keys, ctx = {}) {
  const steps = [];
  const timed = async (name, fn) => {
    const t = Date.now();
    const r = await fn();
    steps.push({ name, ms: Date.now() - t, ok: r.ok !== false, detail: r.detail || '' });
    return r;
  };
  const started = await timed('Start a sandbox on the cheapest provider you connected', async () => {
    const made = await createPod(providers, keys, { cpu: 1, ram: 1 }, ctx);
    if (made.status !== 201) return { ok: false, detail: made.error || 'no provider could start a sandbox', pod: null };
    const detail = `${made.pod.provider}, $${made.pod.pricePerHour}/h`;
    return { detail, pod: made.pod.id, provider: made.pod.provider };
  });
  if (!started.pod) return { ok: false, steps, error: started.detail };

  const id = started.pod;
  try {
    await timed('Write the agent\'s code and its tests', async () => {
      for (const [path, content] of Object.entries(DEMO_FILES)) {
        const w = await writeFile(providers, keys, id, { path, content }, ctx);
        if (w.status !== 200) return { ok: false, detail: w.error };
      }
      return { detail: `${Object.keys(DEMO_FILES).length} files` };
    });
    let output = '';
    await timed('Run the tests (60 s limit)', async () => {
      const run = await runPod(providers, keys, id, { command: 'python3 -m unittest -v 2>&1', cwd: 'work', timeout: 60 }, ctx);
      if (run.status !== 200) return { ok: false, detail: run.error };
      output = run.result.stdout || run.result.stderr || '';
      const passed = run.result.exitCode === 0;
      return { ok: passed, detail: passed ? 'all tests passed' : `tests failed (exit ${run.result.exitCode})` };
    });
    const tests = output.split('\n').filter((l) => /\.\.\. (ok|FAIL|ERROR)$|^Ran /.test(l));
    return { ok: steps.every((s) => s.ok), steps, provider: started.provider, tests, output };
  } finally {
    const t = Date.now();
    const stopped = await stopPod(providers, keys, id, ctx);
    steps.push({ name: 'Stop the sandbox', ms: Date.now() - t, ok: stopped.status === 200, detail: stopped.status === 200 ? '' : stopped.error });
  }
}

export function demoPage() {
  return shell(
    'Agent demo · fleet',
    `<section class="msg">
<p class="m label">Agent demo</p>
<h1 style="font-size:clamp(40px,6vw,72px)">An agent writes code, tests it, and reports back.</h1>
<p class="lede">Fleet starts a fresh sandbox on the cheapest working provider you connected, writes a small Python module and its tests into it, runs the tests, and stops the sandbox. Your keys are used on the server and never shown here.</p>
<p style="margin-top:24px"><button id="go" class="b inv" type="button">Run the demo</button></p>
<ol id="steps" style="margin-top:28px;padding-left:20px;max-width:760px;line-height:1.9"></ol>
<p id="verdict" class="lede" style="margin-top:18px"></p>
<pre id="out" hidden style="margin-top:14px;white-space:pre-wrap"></pre>
</section>
<script>
(()=>{const go=document.getElementById('go'),steps=document.getElementById('steps'),verdict=document.getElementById('verdict'),out=document.getElementById('out');
const li=(text,cls)=>{const e=document.createElement('li');e.textContent=text;if(cls)e.style.color=cls;steps.appendChild(e);return e};
go.addEventListener('click',async()=>{go.disabled=true;steps.innerHTML='';verdict.textContent='Running on a real sandbox...';out.hidden=true;
  let r;try{const res=await fetch('/console/demo',{method:'POST',headers:{'content-type':'application/json'}});r=await res.json();if(!res.ok)throw new Error(r.error||'failed')}catch(e){verdict.textContent=String(e.message||e);go.disabled=false;return}
  for(const s of r.steps||[]){li((s.ok?'✓ ':'✗ ')+s.name+' · '+(s.ms/1000).toFixed(1)+' s'+(s.detail?' · '+s.detail:''),s.ok?null:'#c2410c')}
  verdict.textContent=r.ok?'The agent\\'s code passed its tests on '+(r.provider||'a provider')+'.':'The demo did not pass. See the steps above.';
  if(r.output){out.textContent=r.output;out.hidden=false}
  go.disabled=false});})();
</script>`,
    '',
  );
}
