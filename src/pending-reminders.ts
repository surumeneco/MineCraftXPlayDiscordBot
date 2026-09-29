import { createHash } from 'node:crypto';
import { type Client, Routes } from 'discord.js';

export interface PendingApplicationItem {
  id: string;
  name: string;
  application_type: 'new' | 'edit';
  submitted_at: string;
  url: string;
}

export interface PendingReminderEvent {
  event_id: string;
  date: string;
  territories: PendingApplicationItem[];
  companies: PendingApplicationItem[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !day.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseItems(value: unknown): PendingApplicationItem[] {
  if (!Array.isArray(value) || value.length > 5000) throw new Error('Invalid application list');
  return value.map((input: unknown): PendingApplicationItem => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid application');
    const item = input as Record<string, unknown>;
    if (typeof item.id !== 'string' || !uuid.test(item.id)) throw new Error('Invalid application ID');
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) {
      throw new Error('Invalid application name');
    }
    if (item.application_type !== 'new' && item.application_type !== 'edit') {
      throw new Error('Invalid application type');
    }
    if (typeof item.submitted_at !== 'string' || !Number.isFinite(Date.parse(item.submitted_at))) {
      throw new Error('Invalid application date');
    }
    if (typeof item.url !== 'string' || item.url.length > 1000) throw new Error('Invalid application URL');
    let link: URL;
    try { link = new URL(item.url); } catch { throw new Error('Invalid application URL'); }
    if (link.username || link.password || (link.protocol !== 'https:' &&
      !(link.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(link.hostname)))) {
      throw new Error('Invalid application URL');
    }
    return item as unknown as PendingApplicationItem;
  });
}

export function parsePendingReminderEvent(value: unknown): PendingReminderEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid reminder event');
  const input = value as Record<string, unknown>;
  if (!validDay(input.date) || input.event_id !== 'pending-applications:' + input.date) {
    throw new Error('Invalid reminder event ID');
  }
  return {
    event_id: input.event_id as string,
    date: input.date,
    territories: parseItems(input.territories),
    companies: parseItems(input.companies),
  };
}

function entry(item: PendingApplicationItem): string {
  // User-provided names must not introduce extra lines or Discord formatting.
  const name = item.name.replace(/\s+/gu, ' ').replace(/([\\*_~|`>])/gu, '\\$1');
  return '・[' + (item.application_type === 'new' ? '新規' : '変更') + '] ' + name + '\n' + item.url;
}

export function formatPendingReminderMessages(event: PendingReminderEvent): string[] {
  if (event.territories.length + event.companies.length === 0) return ['承認待ちの申請はありません。'];
  const heading = '承認待ちの申請（' + event.date.replace(/-/g, '/') + '）' +
    '\n領地: ' + event.territories.length + '件 / 企業: ' + event.companies.length + '件';
  const sections = [
    ['領地', event.territories] as const,
    ['企業', event.companies] as const,
  ];
  const messages: string[] = [];
  let current = heading;
  for (const [name, items] of sections) {
    if (!items.length) continue;
    const section = '【' + name + '】';
    if (current.length + 1 + section.length > 1900) {
      messages.push(current);
      current = section;
    } else {
      current += '\n' + section;
    }
    for (const item of items) {
      const block = entry(item);
      if (current.length + 1 + block.length > 1900) {
        messages.push(current);
        current = block;
      } else {
        current += '\n' + block;
      }
    }
  }
  if (current) messages.push(current);
  return messages;
}

export function pendingReminderNonce(eventId: string, channelId: string, part: number): string {
  return createHash('sha256').update(eventId + ':' + channelId + ':' + part).digest('hex').slice(0, 24);
}

export async function deliverPendingReminder(
  client: Client,
  adminChannelId: string,
  event: PendingReminderEvent,
): Promise<void> {
  const messages = formatPendingReminderMessages(event);
  for (let index = 0; index < messages.length; index++) {
    await client.rest.post(Routes.channelMessages(adminChannelId), {
      body: {
        content: messages[index],
        allowed_mentions: { parse: [] },
        nonce: pendingReminderNonce(event.event_id, adminChannelId, index),
        enforce_nonce: true,
      },
    });
  }
}
