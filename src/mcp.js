// MCP over HTTP (JSON-RPC, one request per POST). Three tools that call the same code as the HTTP API.
import { createPod, runPod, stopPod } from './route.js';

const TOOLS = [
  {
    name: 'pod_create',
    description:
      'Start a pod (an isolated Linux machine for an agent) on the cheapest provider you sent a key for. Moves to the next provider if one fails. Returns the pod id.',
    inputSchema: {
      type: 'object',
      properties: {
        cpu: { type: 'integer', description: 'vCPUs, default 2' },
        ram: { type: 'number', description: 'GB of memory, default 4' },
        provider: { type: 'string', description: 'Use only this provider (boat, isorun, e2b, daytona)' },
      },
    },
  },
  {
    name: 'pod_run',
    description: 'Run one shell command in a pod. Returns stdout, stderr and the exit code.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, command: { type: 'string' } },
      required: ['id', 'command'],
    },
  },
  {
    name: 'pod_stop',
    description: 'Stop a pod. Always stop pods you no longer need: the provider bills while it runs.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

export async function handleMcp(message, providers, keys, ctx) {
  const { id, method, params } = message || {};
  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: params?.protocolVersion || '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'fleet', version: '0.1.0' },
    });
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const args = params?.arguments || {};
    let out;
    if (params?.name === 'pod_create') out = await createPod(providers, keys, args, ctx);
    else if (params?.name === 'pod_run') out = await runPod(providers, keys, args.id, args, ctx);
    else if (params?.name === 'pod_stop') out = await stopPod(providers, keys, args.id, ctx);
    else return fail(id, -32602, `unknown tool ${params?.name}`);
    const ok = out.status < 400;
    const payload = ok ? out.pod || out.result : { error: out.error, failed: out.failed };
    return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: !ok });
  }
  return fail(id, -32601, `unknown method ${method}`);
}
