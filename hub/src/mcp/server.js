// MCP stdio server: a thin adapter from MCP tool calls to hub methods.
import os from 'node:os';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HubClient } from '../client.js';
import { TOOLS, toolsByName } from './tools.js';
import { hubUrl } from '../config.js';

const client = new HubClient({
  url: process.env.BROWSER_HUB_URL || hubUrl('/agent'),
  label: process.env.BROWSER_HUB_LABEL || `${path.basename(process.cwd())}@${os.hostname()}`,
  browser: process.env.BROWSER_HUB_BROWSER || null,
});

const server = new Server({ name: 'browser-hub', version: '0.2.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolsByName.get(req.params.name);
  if (!tool) return fail(`Unknown tool ${req.params.name}`);
  try {
    const result = await client.call(tool.method, req.params.arguments || {});
    return render(tool, result);
  } catch (e) {
    return fail(`${e.code || 'ERROR'}: ${e.message}`);
  }
});

function render(tool, result) {
  if (result?.image) {
    const { image, ...rest } = result;
    return { content: [{ type: 'image', data: image.base64, mimeType: image.mimeType }, { type: 'text', text: JSON.stringify(rest) }] };
  }
  if (tool.textField && typeof result?.[tool.textField] === 'string') {
    const { [tool.textField]: text, ...rest } = result;
    return { content: [{ type: 'text', text: `${JSON.stringify(rest)}\n${text}` }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] };
}

function fail(text) {
  return { isError: true, content: [{ type: 'text', text }] };
}

const transport = new StdioServerTransport();
transport.onclose = () => { client.close(); process.exit(0); };
await server.connect(transport);
