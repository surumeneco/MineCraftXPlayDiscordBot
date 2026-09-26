import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventNonce, startNoticeReceiver } from '../src/notice-notifications.js';

const secret = 'a'.repeat(48);
const event = {
  event_id: '11111111-1111-4111-8111-111111111111:2:publish',
  kind: 'publish', title: '@everyone 重要', tags: ['案内'],
  url: 'https://example.com/info/notice/%40everyone',
};

let receiver: Server | undefined;
afterEach(async () => {
  if (receiver) await new Promise<void>((resolve, reject) => receiver!.close((error) => error ? reject(error) : resolve()));
  receiver = undefined;
});

async function setup(ready = true) {
  const post = vi.fn().mockResolvedValue({ id: 'discord-message' });
  const client = { isReady: () => ready, rest: { post } } as unknown as Client;
  receiver = await startNoticeReceiver(client, { channelId: '123456789012345678', sharedSecret: secret, port: 0 });
  const port = (receiver.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/internal/notices`;
  const request = (body: unknown, authorization = `Bearer ${secret}`) => fetch(url, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { post, request };
}

describe('notice receiver', () => {
  it('rejects unauthorized calls and never sends to Discord', async () => {
    const { post, request } = await setup();
    expect((await request(event, 'Bearer wrong')).status).toBe(401);
    expect(post).not.toHaveBeenCalled();
  });

  it('sends with a stable nonce, article link and disabled mentions', async () => {
    const { post, request } = await setup();
    expect((await request(event)).status).toBe(204);
    expect(post).toHaveBeenCalledWith('/channels/123456789012345678/messages', {
      body: {
        content: `新しいお知らせが投稿されました: @everyone 重要 🏷️案内\n${event.url}`,
        allowed_mentions: { parse: [] }, nonce: eventNonce(event.event_id), enforce_nonce: true,
      },
    });
  });

  it('reports unavailable Discord and upstream send failures', async () => {
    const unavailable = await setup(false);
    expect((await unavailable.request(event)).status).toBe(503);
    expect(unavailable.post).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => receiver!.close(() => resolve()));
    receiver = undefined;
    const failed = await setup();
    failed.post.mockRejectedValue(new Error('Discord failure'));
    expect((await failed.request(event)).status).toBe(502);
  });
});
