#!/bin/sh
# Downloads the browser pod's engine and Linux image into this folder and checks every file against a pinned sha256.
# They are not in git: the Linux image is GPL software (see ../README.md, "What is inside"). Run before a deploy.
set -eu
cd "$(dirname "$0")"
V86=0.5.473
get() { # name url sha256
  if [ -f "$1" ] && echo "$3  $1" | shasum -a 256 -c - >/dev/null 2>&1; then echo "ok    $1"; return; fi
  curl -fsSL --retry 3 -o "$1.part" "$2"
  echo "$3  $1.part" | shasum -a 256 -c - >/dev/null || { echo "checksum mismatch: $1" >&2; rm -f "$1.part"; exit 1; }
  mv "$1.part" "$1"; echo "fetched $1"
}
get libv86.mjs  "https://cdn.jsdelivr.net/npm/v86@$V86/build/libv86.mjs" f9f3b4cae7dafb882e10e51aae9137ec52d5aed5ffbc9026f9081c73bbaae4c8
get v86.wasm    "https://cdn.jsdelivr.net/npm/v86@$V86/build/v86.wasm"   2f0c4150f266415b754a84a32e6f8e4c975a1d3abb94c78b047fa30027db1ef1
get seabios.bin "https://raw.githubusercontent.com/copy/v86/master/bios/seabios.bin" 73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98
get vgabios.bin "https://raw.githubusercontent.com/copy/v86/master/bios/vgabios.bin" a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880
get linux.bin   "https://i.copy.sh/buildroot-bzimage68.bin" 507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c
