import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type Client, Routes } from 'discord.js';
import type { NoticeNotificationConfig } from './config.js';
import { logger } from './logger.js';

export interface NoticeEvent {
  event_id: string;
  kind: 'publish' | 'update';
  title: string;
  tags: string[];
  url: string;
}

function authorized(header: string | undefined, secret: string): boolean {
  const provided = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function parseNoticeEvent(payload: unknown): NoticeEvent {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid event');
  const event = payload as Record<string, unknown>;
  if (typeof event.event_id !== 'string' || !/^[0-9a-f-]{36,65}:(publish|update)$/.test(event.event_id)) throw new Error('Invalid event ID');
  if (event.kind !== 'publish' && event.kind !== 'update') throw new Error('Invalid event kind');
  if (!event.event_id.endsWith(`:${event.kind}`)) throw new Error('Event ID does not match kind');
  if (typeof event.title !== 'string' || !event.title.trim()) throw new Error('Invalid title');
  if (!Array.isArray(event.tags) || !event.tags.every((tag) => typeof tag === 'string')) throw new Error('Invalid tags');
  if (event.kind === 'publish' && event.tags.length === 0) throw new Error('Published notices require tags');
  if (typeof event.url !== 'string') throw new Error('Invalid URL');
  let url: URL;
  try { url = new URL(event.url); } catch { throw new Error('Invalid URL'); }
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Invalid URL');
  }
  return event as unknown as NoticeEvent;
}

export function formatNoticeMessage(event: NoticeEvent): string {
  const heading = event.kind === 'publish'
    ? `新しいお知らせが投稿されました！${event.title}: ${event.tags.join(' ')}`
    : `お知らせ内容が更新されました: ${event.title}`;
  const space = 2000 - event.url.length - 1;
  if (space < 2) throw new Error('Notice URL exceeds Discord message limit');
  // Title length has no application-level limit. Reserve the link and truncate
  // the display portion rather than making an otherwise valid notice unpublishable.
  const chars = Array.from(heading);
  let prefix = heading;
  if (prefix.length > space) {
    prefix = '';
    for (const char of chars) {
      if (prefix.length + char.length + 1 > space) break;
      prefix += char;
    }
    prefix += '…';
  }
  return `${prefix}\n${event.url}`;
}

export function eventNonce(eventId: string): string {
  return createHash('sha256').update(eventId).digest('hex').slice(0, 24);
}

function reply(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: message }));
}

async function receive(req: IncomingMessage, res: ServerResponse, client: Client, config: NoticeNotificationConfig): Promise<void> {
  if (req.url !== '/internal/notices' || req.method !== 'POST') {
    reply(res, 404, 'Not found');
    return;
  }
  if (!authorized(req.headers.authorization, config.sharedSecret)) {
    reply(res, 401, 'Unauthorized');
    return;
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    reply(res, 415, 'JSON required');
    return;
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > 262144) {
      reply(res, 413, 'Request too large');
      return;
    }
    chunks.push(data);
  }
  let event: NoticeEvent;
  try { event = parseNoticeEvent(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { reply(res, 400, 'Invalid notice event'); return; }
  if (!client.isReady()) { reply(res, 503, 'Discord unavailable'); return; }
  try {
    const content = formatNoticeMessage(event);
    await client.rest.post(Routes.channelMessages(config.channelId), {
      body: { content, allowed_mentions: { parse: [] }, nonce: eventNonce(event.event_id), enforce_nonce: true },
    });
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
  } catch (error) {
    logger.error('Notice delivery failed.', error);
    reply(res, 502, 'Discord delivery failed');
  }
}

export function startNoticeReceiver(client: Client, config: NoticeNotificationConfig): Promise<Server> {
  const server = createServer((req, res) => {
    void receive(req, res, client, config).catch((error: unknown) => {
      logger.error('Notice receiver failed.', error);
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
