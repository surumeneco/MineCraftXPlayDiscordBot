import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseRequest, startRequestReceiver } from '../src/requests.js';

const secret = 'r'.repeat(48);
let receiver: Server | undefined;
afterEach(async () => {
  if (receiver) await new Promise<void>((resolve, reject) => receiver!.close((error) => error ? reject(error) : resolve()));
  receiver = undefined;
});

async function setup(ready = true) {
  const post = vi.fn().mockResolvedValue({ id: 'discord-message' });
  const client = { isReady: () => ready, rest: { post } } as unknown as Client;
  receiver = await startRequestReceiver(client, { channelId: '123456789012345678', sharedSecret: secret, port: 0 });
  const port = (receiver.address() as AddressInfo).port;
  const request = (body: unknown, authorization = `Bearer ${secret}`) => fetch(`http://127.0.0.1:${port}/internal/requests`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { post, request };
}

describe('anonymous request validation', () => {
  it('preserves original whitespace and rejects empty or too-long input', () => {
    expect(parseRequest({ content: '  要望\n内容  ' })).toBe('  要望\n内容  ');
    expect(() => parseRequest({ content: '   ' })).toThrow();
    expect(() => parseRequest({ content: 'x'.repeat(2001) })).toThrow();
    expect(parseRequest({ content: 'x'.repeat(2000) })).toHaveLength(2000);
    expect(() => parseRequest({ content: 10 })).toThrow();
  });

  it('rejects unauthorized requests without calling Discord', async () => {
    const { post, request } = await setup();
    expect((await request({ content: 'hello' }, 'Bearer invalid')).status).toBe(401);
    expect(post).not.toHaveBeenCalled();
  });

  it('sends only the unmodified body with all mentions disabled', async () => {
    const { post, request } = await setup();
    const content = '  @everyone\n要望  ';
    expect((await request({ content })).status).toBe(204);
    expect(post).toHaveBeenCalledWith('/channels/123456789012345678/messages', {
      body: { content, allowed_mentions: { parse: [] } },
    });
  });

  it('rejects invalid input and reports Discord failures', async () => {
    const { post, request } = await setup();
    expect((await request({ content: ' ' })).status).toBe(400);
    expect((await request({ content: 'x'.repeat(2001) })).status).toBe(400);
    expect(post).not.toHaveBeenCalled();
    post.mockRejectedValue(new Error('Discord failure'));
    expect((await request({ content: 'valid' })).status).toBe(502);
  });

  it('does not claim delivery if Discord is unavailable', async () => {
    const { post, request } = await setup(false);
    expect((await request({ content: 'valid' })).status).toBe(503);
    expect(post).not.toHaveBeenCalled();
  });
});
