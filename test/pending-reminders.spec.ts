import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatPendingReminderMessages, parsePendingReminderEvent, pendingReminderNonce,
} from '../src/pending-reminders.js';
import { startTerritoryReceiver } from '../src/territory-notifications.js';

const secret = 'q'.repeat(48);
const participant = '123456789012345678';
const admin = '223456789012345678';
const id = '11111111-1111-4111-8111-111111111111';
const event = {
  event_id: 'pending-applications:2026-09-29',
  date: '2026-09-29',
  territories: [{
    id, name: '@everyone 広場', application_type: 'new' as const,
    submitted_at: '2026-09-28T00:00:00.000Z',
    url: 'https://example.com/admin/territories/' + id,
  }],
  companies: [{
    id, name: '建築組合', application_type: 'edit' as const,
    submitted_at: '2026-09-28T01:00:00.000Z',
    url: 'https://example.com/admin/companies/' + id,
  }],
};

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
});

async function setup() {
  const post = vi.fn().mockResolvedValue({ id: 'message' });
  const client = { isReady: () => true, rest: { post } } as unknown as Client;
  server = await startTerritoryReceiver(client, {
    participantChannelId: participant, adminChannelId: admin, sharedSecret: secret, port: 0,
  });
  const port = (server.address() as AddressInfo).port;
  const send = (body: unknown, token = secret) => fetch('http://127.0.0.1:' + port + '/internal/pending-applications', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { post, send };
}

describe('pending reminder format', () => {
  it('sends the exact requested sentence when both lists are empty', () => {
    const result = formatPendingReminderMessages(parsePendingReminderEvent({
      ...event, territories: [], companies: [],
    }));
    expect(result).toEqual(['承認待ちの申請はありません。']);
  });

  it('includes counts, new/edit distinctions and review links', () => {
    const messages = formatPendingReminderMessages(parsePendingReminderEvent(event));
    expect(messages.join('\n')).toContain('領地: 1件 / 企業: 1件');
    expect(messages.join('\n')).toContain('[新規] @everyone 広場');
    expect(messages.join('\n')).toContain('[変更] 建築組合');
    expect(messages.join('\n')).toContain('/admin/territories/' + id);
    expect(messages.join('\n')).toContain('/admin/companies/' + id);
  });

  it('splits long lists into Discord-safe messages', () => {
    const input = { ...event, territories: Array.from({ length: 60 }, (_, n) => ({
      ...event.territories[0]!, name: '領地' + n + '_'.repeat(80),
    })) };
    const messages = formatPendingReminderMessages(parsePendingReminderEvent(input));
    expect(messages.length).toBeGreaterThan(2);
    expect(messages.every(message => message.length <= 1900)).toBe(true);
  });

  it('rejects invalid dates and untrusted URLs', () => {
    expect(() => parsePendingReminderEvent({ ...event, date: '2026-09-30' })).toThrow();
    expect(() => parsePendingReminderEvent({ ...event, date: '2026-02-30', event_id: 'pending-applications:2026-02-30' })).toThrow();
    expect(() => parsePendingReminderEvent({
      ...event, territories: [{ ...event.territories[0], url: 'https://user:pass@example.com' }],
    })).toThrow();
  });

  it('keeps per-part nonces deterministic', () => {
    expect(pendingReminderNonce(event.event_id, admin, 0)).toBe(pendingReminderNonce(event.event_id, admin, 0));
    expect(pendingReminderNonce(event.event_id, admin, 0)).not.toBe(pendingReminderNonce(event.event_id, admin, 1));
  });
});

describe('pending reminder HTTP receiver', () => {
  it('delivers only to administrators without allowing user mentions', async () => {
    const { post, send } = await setup();
    expect((await send(event)).status).toBe(204);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toBe('/channels/' + admin + '/messages');
    expect(post.mock.calls[0]?.[1]?.body.allowed_mentions).toEqual({ parse: [] });
    expect(post.mock.calls[0]?.[1]?.body.enforce_nonce).toBe(true);
  });

  it('delivers the zero-pending sentence and rejects unauthorized requests', async () => {
    const { post, send } = await setup();
    expect((await send({ ...event, territories: [], companies: [] }, 'wrong')).status).toBe(401);
    expect(post).not.toHaveBeenCalled();
    expect((await send({ ...event, territories: [], companies: [] })).status).toBe(204);
    expect(post.mock.calls[0]?.[1]?.body.content).toBe('承認待ちの申請はありません。');
  });

  it('fails on invalid events and sends a stable nonce when retried', async () => {
    const { post, send } = await setup();
    expect((await send({ ...event, event_id: 'invalid' })).status).toBe(400);
    post.mockRejectedValueOnce(new Error('discord error'));
    expect((await send(event)).status).toBe(502);
    post.mockResolvedValue({ id: 'after-retry' });
    expect((await send(event)).status).toBe(204);
    expect(post.mock.calls[1]?.[1]?.body.nonce).toBe(post.mock.calls[0]?.[1]?.body.nonce);
  });
});
