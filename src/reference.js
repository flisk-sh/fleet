// Third-party facts for the podlytics "Isolation & state" tab. Not measured by fleet.
// Sources: LogRocket, "Comparing AI agent sandbox platforms" (2026-08-04) and Upstash, "AI agent sandbox providers compared 2026" (checked Nov 2026). Tensorlake and Freestyle rows: Upstash comparison plus each vendor's docs.
// tier: 1 microVM, 2 gVisor, 3 container. cold: vendor claim or the article's own measurement, never fleet's.
export const REFERENCE = {
  daytona: { tier: 3, gpu: true, byoc: 'BYOC', rate: { cpu: 0.0504, mem: 0.0162, mode: 'wall' }, isolation: 'Docker container by default; VM classes opt-in', persistence: 'Disk snapshots, fork, pause/resume', billing: 'Wall-clock vCPU + RAM', cold: 'LogRocket measured 742 ms create, 1254 ms resume; vendor says under 90 ms' },
  e2b: { tier: 1, gpu: false, byoc: 'BYOC (Enterprise)', rate: { cpu: 0.0504, mem: 0.0162, mode: 'wall' }, isolation: 'Firecracker microVM', persistence: 'Pause/resume, memory + disk snapshots', billing: 'Wall-clock vCPU + RAM', cold: 'LogRocket measured 717 ms create, 662 ms resume' },
  blaxel: { tier: 1, gpu: false, byoc: 'Own metal, VPC link', rate: { mem: 0.0414, mode: 'mem' }, isolation: 'microVM', persistence: 'Perpetual standby, snapshots', billing: 'Memory only, nothing in standby', cold: 'LogRocket measured 2824 ms create, 1924 ms resume; vendor says about 25 ms from standby' },
  vercel: { tier: 1, gpu: false, byoc: null, rate: { cpu: 0.128, mem: 0.0212, mode: 'cpuActive' }, isolation: 'Firecracker microVM', persistence: 'Persistent by default, disk snapshots', billing: 'Active CPU, memory for the full time', cold: 'LogRocket measured 1852 ms create, 3333 ms resume' },
  sprites: { tier: 1, gpu: false, byoc: null, rate: { cpu: 0.07, mem: 0.04375, mode: 'active' }, isolation: 'Firecracker microVM', persistence: 'Persistent disk, checkpoints', billing: 'CPU and RAM actually used, nothing idle', cold: 'Vendor: about 300 ms checkpoint; Upstash: 1-2 s create, 100-500 ms warm wake' },
  runloop: { tier: 1, gpu: false, byoc: 'VPC (Enterprise)', rate: { cpu: 0.108, mem: 0.0252, mode: 'wall' }, isolation: 'microVM on a custom hypervisor', persistence: 'Disk snapshots; suspend/resume on Pro', billing: 'Wall-clock CPU + RAM', cold: 'Vendor: a few seconds (docs)' },
  upstash: { tier: 3, gpu: false, byoc: null, rate: { cpu: 0.1, mem: 0, mode: 'active' }, isolation: 'Container (own filesystem, processes, network namespace)', persistence: 'Auto-pause, keep-alive or 3-day TTL', billing: 'Active CPU only, memory free', cold: 'Upstash measured about 2.5 s create, 0.4 s resume (own runs, Europe)' },
  tensorlake: { tier: 1, gpu: true, byoc: 'BYOC (AWS)', rate: { cpu: 0.07, mem: 0.015, mode: 'active' }, isolation: 'Firecracker / Cloud Hypervisor microVM; gVisor for GPU sandboxes', persistence: 'Suspend/resume with memory, filesystem snapshots, clone', billing: 'Active CPU (20% floor) + allocated RAM + disk', cold: 'Vendor: a few hundred ms' },
  freestyle: { tier: 1, gpu: false, byoc: null, rate: { cpu: 0.04032, mem: 0.0129, mode: 'wall' }, isolation: 'Full Linux VM (KVM) with its own kernel', persistence: 'Pause with memory, snapshots, branching; runs for weeks', billing: 'Wall-clock vCPU + RAM; paused VMs pay storage only', cold: 'Vendor: about 65 ms provision, p99 under 400 ms' },
  langsmith: { tier: 1, gpu: false, byoc: 'BYOC and self-hosted', rate: { cpu: 0.0576, mem: 0.01845, mode: 'wall' }, isolation: 'microVM', persistence: 'Snapshots (memory snapshots over REST only); disposable or persistent filesystem', billing: 'Allocated vCPU + memory per hour, in LSU ($1 each)', cold: 'Vendor does not publish a figure' },
};
export const REFERENCE_TIERS = { 1: 'microVM', 2: 'gVisor', 3: 'container' };

// Two workloads from the LogRocket article, priced per provider at 2 vCPU / 4 GB with the rates above (list prices, credits ignored).
// burst: 30,000 stateless sessions a month, each alive 5 min with 30 s of CPU. state: 50 agents, each busy 2 h a day for 30 days
// and kept (paused) for the other 22 h. Only Vercel bills memory while paused, as the article found; Blaxel and Sprites cost nothing idle.
export function scenarios(rate, size = { cpu: 2, ram: 4 }) {
  if (!rate) return null;
  const cpu = rate.cpu || 0;
  const mem = rate.mem || 0;
  const hr = (activeCpuHrs, memHrs, wallHrs) => {
    if (rate.mode === 'wall') return wallHrs * (cpu * size.cpu + mem * size.ram);
    if (rate.mode === 'mem') return memHrs * mem * size.ram;
    if (rate.mode === 'cpuActive') return activeCpuHrs * cpu * size.cpu + wallHrs * mem * size.ram;
    return activeCpuHrs * cpu * size.cpu + memHrs * mem * size.ram; // active: CPU and memory only while running
  };
  const burst = 30000;
  const state = 50 * 30 * 2;
  const round = (v) => Math.round(v);
  const bw = (burst * 300) / 3600;
  return {
    burst: round(hr((burst * 30) / 3600, bw, bw)),
    state: round(hr(state, state, rate.mode === 'cpuActive' ? 50 * 30 * 24 : state)),
  };
}
