// Browser pod: a pod that runs in the visitor's own browser tab. No account, no key, no server.
// It is a small real Linux (kernel + busybox) on the v86 x86 emulator (WebAssembly). Same contract as every fleet
// provider: start, run, write, read, stop. It is the tab's memory: closing the tab ends the pod and its files.
//
// How a command runs: the command text goes into a file on a folder shared with the page (9p), a one-line call on the
// serial console runs it, and stdout, stderr and the exit code come back as files. Nothing is parsed out of the console
// except one "done" mark, so any output (binary, huge, with prompts in it) is safe.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const OUT_CAP = 1_000_000;
export const MAX_FILE = 256 * 1024; // same cap as fleet's file calls

// The runner inside the pod. $1 = call number, $2 = seconds before the command is killed.
// The image's busybox has no `timeout`, so a second shell does the killing.
export const RUNNER = `cd "$HOME" 2>/dev/null
sh "/mnt/.pod/c$1" >"/mnt/.pod/o$1" 2>"/mnt/.pod/e$1" </dev/null &
p=$!
( sleep "$2"; pkill -9 -P $p; kill -9 $p ) >/dev/null 2>&1 &
w=$!
wait $p
x=$?
pkill -P $w >/dev/null 2>&1; kill $w >/dev/null 2>&1
echo $x >"/mnt/.pod/x$1"
`;

// Paths come from a model: keep them inside the pod as plain text for a single-quoted shell word.
export const sq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

// Exit status as fleet reports it: 124 when the time ran out (busybox reports 137 for a KILL).
export function exitOf(text, timedOut) {
  const n = Number.parseInt(String(text).trim(), 10);
  if (timedOut || n === 137) return 124;
  return Number.isFinite(n) ? n : -1;
}

const clipBytes = (u) => dec.decode(u.length > OUT_CAP ? u.subarray(0, OUT_CAP) : u);

// engine: the v86 instance (or a fake with the same five methods, for tests).
export function podOver(engine, { wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let serial = '';
  let waiters = [];
  let n = 0;
  let queue = Promise.resolve();
  let dead = false;
  engine.add_listener('serial0-output-byte', (b) => {
    serial += String.fromCharCode(b);
    if (serial.length > 20_000) serial = serial.slice(-10_000);
    waiters = waiters.filter((w) => {
      if (!serial.includes(w.mark)) return true;
      w.done(true);
      return false;
    });
  });
  // Resolves true when the mark shows on the console, false when the time runs out.
  const seen = (mark, ms) =>
    new Promise((resolve) => {
      if (serial.includes(mark)) return resolve(true);
      const w = { mark, done: resolve };
      waiters.push(w);
      wait(ms).then(() => {
        waiters = waiters.filter((x) => x !== w);
        resolve(false);
      });
    });
  const type = (line) => engine.serial0_send(`${line}\n`);
  const one = (job) => {
    const next = queue.then(job, job);
    queue = next.catch(() => {});
    return next;
  };
  const file = (name) => engine.read_file(`/.pod/${name}`).catch(() => new Uint8Array());

  async function exec(command, timeout) {
    if (dead) throw new Error('this browser pod has stopped');
    const id = ++n;
    await engine.create_file(`/.pod/c${id}`, enc.encode(`${command}\n`));
    // The mark is typed with a gap ('' between the letters) so the console's echo of this line never matches it.
    type(`sh /mnt/.pod/run ${id} ${timeout}; echo "@@pod""done${id}@@"`);
    const ok = await seen(`@@poddone${id}@@`, (timeout + 15) * 1000);
    const [o, e, x] = await Promise.all([file(`o${id}`), file(`e${id}`), file(`x${id}`)]);
    type(`rm -f /mnt/.pod/c${id} /mnt/.pod/o${id} /mnt/.pod/e${id} /mnt/.pod/x${id}`);
    return { stdout: clipBytes(o), stderr: clipBytes(e), exitCode: exitOf(dec.decode(x), !ok) };
  }

  return {
    // Called once after the engine is created: waits for the shell and shares the folder.
    async ready(bootMs = 120_000) {
      // The image logs in on the serial console and shows a prompt ending in "% ".
      if (!(await seen('% ', bootMs))) throw new Error('the browser pod did not start in time');
      // The shared folder's own directory is made from inside: the page can only add files to a folder that exists.
      type('stty -echo; mount -t 9p host9p /mnt 2>/dev/null; mkdir -p /mnt/.pod; export HOME=/root; echo "@@pod""up@@"');
      if (!(await seen('@@podup@@', 30_000))) throw new Error('the browser pod could not share its folder');
      await engine.create_file('/.pod/run', enc.encode(RUNNER));
    },
    run: (command, { timeout = 60 } = {}) => one(() => exec(String(command), Math.min(Math.max(Number(timeout) || 60, 1), 600))),
    write: (path, content) =>
      one(async () => {
        const bytes = typeof content === 'string' ? enc.encode(content) : content;
        if (bytes.length > MAX_FILE) throw new Error(`file is over ${MAX_FILE / 1024} KB`);
        await engine.create_file('/.pod/in', bytes);
        const r = await exec(`p=${sq(path)}; mkdir -p "$(dirname "$p")" && cp /mnt/.pod/in "$p"`, 30);
        if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `could not write ${path}`);
      }),
    read: (path) =>
      one(async () => {
        const r = await exec(`p=${sq(path)}; [ -f "$p" ] || { echo "no such file: $p" >&2; exit 2; }; [ "$(wc -c <"$p")" -le ${MAX_FILE} ] || { echo "file is over ${MAX_FILE / 1024} KB" >&2; exit 3; }; cp "$p" /mnt/.pod/out`, 30);
        if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `could not read ${path}`);
        const bytes = await engine.read_file('/.pod/out');
        try {
          return { content: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf8' };
        } catch {
          let bin = '';
          for (const b of bytes) bin += String.fromCharCode(b);
          return { content: btoa(bin), encoding: 'base64' };
        }
      }),
    async stop() {
      dead = true;
      await Promise.resolve(engine.destroy?.()).catch(() => {});
    },
  };
}

// Starts the Linux in this tab. base: the address the engine and image files are served from (browserpod/vendor).
export async function startBrowserPod({ base, memoryMb = 128, bootMs } = {}) {
  const root = String(base).replace(/\/?$/, '/');
  const { V86 } = await import(/* @vite-ignore */ `${root}libv86.mjs`);
  const engine = new V86({
    wasm_path: `${root}v86.wasm`,
    bios: { url: `${root}seabios.bin` },
    vga_bios: { url: `${root}vgabios.bin` },
    bzimage: { url: `${root}linux.bin` },
    cmdline: 'tsc=reliable mitigations=off random.trust_cpu=on',
    memory_size: memoryMb * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
    filesystem: {},
    autostart: true,
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
  });
  const pod = podOver(engine);
  await pod.ready(bootMs);
  return pod;
}
