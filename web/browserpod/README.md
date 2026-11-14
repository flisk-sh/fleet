# Browser pod

A pod that runs in the visitor's own browser tab. No account, no key, no server, no cost.
It is a small real Linux (kernel 6.8 and busybox) on the [v86](https://github.com/copy/v86) x86 emulator, compiled to WebAssembly.

fleetd is the pod host you run on a machine. The browser pod is the pod host that needs no machine.

```js
import { startBrowserPod } from 'https://fleet.flisk.si/browserpod/pod.js';

const pod = await startBrowserPod({ base: 'https://fleet.flisk.si/browserpod/vendor/' });
await pod.write('site/index.html', '<h1>Coffee</h1>');
const r = await pod.run('ls -la site && wc -c site/index.html'); // { stdout, stderr, exitCode }
const f = await pod.read('site/index.html');                     // { content, encoding: 'utf8' | 'base64' }
await pod.stop();
```

Try it: open `/browserpod/` (this folder's `index.html`).

## What it can and cannot do

| | |
|---|---|
| Start | About 3 seconds after the files are in the browser cache (about 12.6 MB the first time) |
| Shell | busybox `sh` with `sed`, `awk`, `tar`, `gzip`, `base64`, `wget`, `curl` |
| Memory | 128 MB by default (`memoryMb`) |
| Files | Kept in the tab's memory. Closing or reloading the tab deletes them |
| Internet | None inside the pod. `curl` and `wget` are there but have no network |
| Python, Node, Flisk | Not in this image. A task that needs them needs a cloud pod |
| Public URL for a port | No. Nothing outside the tab can reach it |
| Speed | Much slower than a real machine: fine for files and shell, not for builds |

So today it fits tasks like "make a web page", text and file work, and shell practice. It does not replace a cloud pod
for apps that install packages or stay online.

## How a command runs

1. The page puts the command into a file on a folder it shares with the pod (9p).
2. It types one short line on the pod's serial console that runs that file.
3. A small runner writes stdout, stderr and the exit code into three files in the shared folder.
4. The page waits for one "done" mark on the console, then reads the three files.

Nothing is parsed out of the console except that mark, so output of any size or shape is safe. A command over its time
is killed and reports exit code 124, as on every fleet provider. Each command starts in `/root`.

## What is inside, and where it comes from

`vendor/get.sh` downloads five files and checks each against a pinned sha256. They are not in this repository.

| File | What | Source | Licence |
|---|---|---|---|
| `libv86.mjs`, `v86.wasm` | The emulator, v86 0.5.473 | npm `v86` | BSD-2-Clause |
| `seabios.bin`, `vgabios.bin` | PC BIOS | [copy/v86 `bios/`](https://github.com/copy/v86/tree/master/bios) | LGPL-3.0 (SeaBIOS), LGPL-2.1 (VGABIOS) |
| `linux.bin` | Linux 6.8.12 and busybox, built with Buildroot | `i.copy.sh/buildroot-bzimage68.bin`, the image the v86 project publishes | GPL-2.0 (kernel, busybox) and others |

`linux.bin` is GPL software built by the v86 author, not by us. Its build files are in
[copy/v86 `tools/`](https://github.com/copy/v86/tree/master/tools) and Buildroot. Serving it from our own domain means we
distribute GPL binaries, so before the first deploy decide between keeping this image with a link to its sources, or
building our own image with Buildroot (which also lets us add tools).

## Serve it

The files are plain static files. In fleet they are Worker static assets (`[assets]` in `wrangler.toml`), served at
`/browserpod/` with open CORS (`web/_headers`), so another site can load them.

```bash
sh web/browserpod/vendor/get.sh
```

A page that loads the pod from another origin needs, in its Content-Security-Policy: this origin in `script-src` and
`connect-src`, and `'wasm-unsafe-eval'` in `script-src`.

## Test

```bash
bun test test/browserpod.test.js
```

The test swaps the emulator for a stand-in whose shared folder is a temp folder and whose console is a real `sh`, so the
runner script and the whole run, write, read and time-out path are exercised without a browser.
