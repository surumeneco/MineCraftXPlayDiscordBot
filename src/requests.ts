import { timingSafeEqual } from 'node:crypto';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { type Client, Routes } from 'discord.js';
import { logger } from './logger.js';

export interface RequestReceiverConfig {
  readonly channelId: string;
  readonly sharedSecret: string;
  readonly port: number;
}

export function parseRequest(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid request');
  const body = (payload as Record<string, unknown>).content;
  if (typeof body !== 'string' || !body.trim() || body.length > 2000) throw new Error('Request must contain 1 to 2000 characters');
  return body;
}

function authorized(header: string | undefined, secret: string): boolean {
  const actual = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function reply(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: message }));
}

async function receive(req: IncomingMessage, res: ServerResponse, client: Client, config: RequestReceiverConfig): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/internal/requests') return reply(res, 404, 'Not found');
  if (!authorized(req.headers.authorization, config.sharedSecret)) return reply(res, 401, 'Unauthorized');
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, 'JSON required');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > 16384) return reply(res, 413, 'Request too large');
    chunks.push(data);
  }
  let content: string;
  try { content = parseRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { return reply(res, 400, 'Invalid request'); }
  if (!client.isReady()) return reply(res, 503, 'Discord unavailable');
  try {
    await client.rest.post(Routes.channelMessages(config.channelId), {
      body: { content, allowed_mentions: { parse: [] } },
    });
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
  } catch (error) {
    logger.error('Request delivery failed.', error);
    reply(res, 502, 'Discord delivery failed');
  }
}

export function startRequestReceiver(client: Client, config: RequestReceiverConfig): Promise<Server> {
  const server = createServer((req, res) => {
    void receive(req, res, client, config).catch((error: unknown) => {
      logger.error('Request receiver failed.', error);
      if (!res.headersSent) reply(res, 500, 'Internal error');
      else res.end();
    });
  });
  return new Promise<Server>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
