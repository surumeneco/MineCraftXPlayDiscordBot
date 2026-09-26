import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type Client, Routes } from 'discord.js';
import { logger } from './logger.js';

export interface TerritoryNotificationConfig {
  readonly participantChannelId: string;
  readonly adminChannelId: string;
  readonly sharedSecret: string;
  readonly port: number;
}

export interface TerritoryEvent {
  event_id: string;
  kind: 'application' | 'approved' | 'returned' | 'rejected' | 'withdrawn' | 'renamed';
  application_type: 'new' | 'edit';
  territory_name: string;
  account_name: string;
  discord_ids: string[];
  centroid?: { x: number; z: number };
  nearby_names?: string[];
  reason?: string;
  url: string;
}

function authorized(header: string | undefined, secret: string): boolean {
  const actual = Buffer.from(header ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseTerritoryEvent(payload: unknown): TerritoryEvent {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid event');
  const event = payload as Record<string, unknown>;
  if (typeof event.event_id !== 'string' || event.event_id.length > 200) throw new Error('Invalid event ID');
  if (!['application','approved','returned','rejected','withdrawn','renamed'].includes(String(event.kind))) throw new Error('Invalid event kind');
  if (!['new','edit'].includes(String(event.application_type))) throw new Error('Invalid application type');
  if (typeof event.territory_name !== 'string' || !event.territory_name.trim()) throw new Error('Invalid territory name');
  if (typeof event.account_name !== 'string' || !event.account_name.trim()) throw new Error('Invalid account name');
  if (!Array.isArray(event.discord_ids) || !event.discord_ids.every(id => typeof id === 'string' && /^\d{15,22}$/.test(id))) {
    throw new Error('Invalid Discord IDs');
  }
  if (['approved','returned','rejected','withdrawn'].includes(String(event.kind)) && event.discord_ids.length === 0) {
    throw new Error('Mentionable Discord ID is required');
  }
  if (event.kind === 'application' || event.kind === 'approved') {
    const center = event.centroid as Record<string, unknown> | undefined;
    if (!center || typeof center.x !== 'number' || !Number.isFinite(center.x) || typeof center.z !== 'number' || !Number.isFinite(center.z)) {
      throw new Error('Invalid centroid');
    }
    if (!Array.isArray(event.nearby_names) || !event.nearby_names.every(value => typeof value === 'string')) throw new Error('Invalid nearby territories');
  }
  if ((event.kind === 'returned' || event.kind === 'rejected') && (typeof event.reason !== 'string' || !event.reason.trim())) {
    throw new Error('Reason is required');
  }
  if (typeof event.url !== 'string') throw new Error('Invalid URL');
  let url: URL;
  try { url = new URL(event.url); } catch { throw new Error('Invalid URL'); }
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Invalid URL');
  }
  return event as unknown as TerritoryEvent;
}

function mentions(ids: string[]): string {
  return ids.map(id => `<@${id}>`).join(' ');
}

export function formatTerritoryMessage(event: TerritoryEvent): string {
  const subject = event.application_type === 'edit' ? `領地｢${event.territory_name}｣の変更` : `領地｢${event.territory_name}｣`;
  if (event.kind === 'application') {
    const first = event.application_type === 'edit'
      ? `${event.account_name}が領地｢${event.territory_name}｣の変更を申請しました！`
      : `${event.account_name}が領地｢${event.territory_name}｣を申請しました！`;
    const nearby = event.nearby_names?.length ? event.nearby_names.join('、') : 'なし';
    return `${first}\n場所: (${Math.round(event.centroid!.x)}, ${Math.round(event.centroid!.z)})付近\n近くの領地: ${nearby}\n${event.url}`;
  }
  if (event.kind === 'approved') {
    const nearby = event.nearby_names?.length ? event.nearby_names.join('、') : 'なし';
    return `${mentions(event.discord_ids)}の領地｢${event.territory_name}｣が承認されました！\n場所: (${Math.round(event.centroid!.x)}, ${Math.round(event.centroid!.z)})付近\n近くの領地: ${nearby}\n${event.url}`;
  }
  if (event.kind === 'returned') {
    return `${mentions(event.discord_ids)}の${subject}の申請が差し戻されました。\n差戻理由: ${event.reason}`;
  }
  if (event.kind === 'rejected') {
    return `${mentions(event.discord_ids)}の${subject}の申請が却下されました。\n却下理由: ${event.reason}`;
  }
  return event.application_type === 'edit'
    ? `${mentions(event.discord_ids)}が領地｢${event.territory_name}｣の変更申請を取り下げました。`
    : `${mentions(event.discord_ids)}が領地｢${event.territory_name}｣の申請を取り下げました。`;
}

function eventNonce(eventId: string, channelId: string): string {
  return createHash('sha256').update(`${eventId}:${channelId}`).digest('hex').slice(0, 24);
}

function reply(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify({ error: message }));
}

async function receive(req: IncomingMessage, res: ServerResponse, client: Client, config: TerritoryNotificationConfig): Promise<void> {
  if (req.url !== '/internal/territories' || req.method !== 'POST') return reply(res, 404, 'Not found');
  if (!authorized(req.headers.authorization, config.sharedSecret)) return reply(res, 401, 'Unauthorized');
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, 'JSON required');
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > 262144) return reply(res, 413, 'Request too large');
    chunks.push(data);
  }
  let event: TerritoryEvent;
  try { event = parseTerritoryEvent(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
  catch { return reply(res, 400, 'Invalid territory event'); }
  if (!client.isReady()) return reply(res, 503, 'Discord unavailable');
  try {
    const content = formatTerritoryMessage(event);
    for (const channelId of [config.participantChannelId, config.adminChannelId]) {
      await client.rest.post(Routes.channelMessages(channelId), {
        body: {
          content,
          allowed_mentions: { parse: [], users: event.discord_ids },
          nonce: eventNonce(event.event_id, channelId),
          enforce_nonce: true,
        },
      });
    }
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
  } catch {
    logger.error('Territory notification delivery failed.');
    reply(res, 502, 'Discord delivery failed');
  }
}

export function startTerritoryReceiver(client: Client, config: TerritoryNotificationConfig): Promise<Server> {
  const server = createServer((req, res) => {
    void receive(req, res, client, config).catch(() => {
      logger.error('Territory notification receiver failed.');
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
