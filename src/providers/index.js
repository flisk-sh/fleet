// Every provider is the same five things: keyHeader, price(size), create, run, stop. Add one by adding a file here.
import boat from './boat.js';
import isorun from './isorun.js';
import e2b from './e2b.js';
import daytona from './daytona.js';
import hopx from './hopx.js';
import runloop from './runloop.js';
import blaxel from './blaxel.js';
import vercel from './vercel.js';
import sprites from './sprites.js';
import morph from './morph.js';
import upstash from './upstash.js';
import tensorlake from './tensorlake.js';
import freestyle from './freestyle.js';
import langsmith from './langsmith.js';
import fleetpod from './fleetpod.js';
import demo from './demo.js';

// Working: daytona, blaxel. Blocked (cannot be tested yet): see `blocked` in the file. Untested: all the others.
export const PROVIDERS = { boat, isorun, e2b, daytona, hopx, runloop, blaxel, vercel, sprites, morph, upstash, tensorlake, freestyle, langsmith, fleetpod, demo };
