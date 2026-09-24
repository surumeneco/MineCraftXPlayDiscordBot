import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Client } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTerritoryReceiver } from '../src/territory-notifications.js';

const secret = 't'.repeat(48);
const participant = '123456789012345678';
const admin = '223456789012345678';
const discordId = '323456789012345678';
const event = {
  event_id: '11111111-1111-4111-8111-111111111111:approved',
  kind: 'approved' as const,
  application_type: 'new' as const,
  territory_name: '@everyone 広場',
  account_name: '申請者',
  discord_ids: [discordId],
  centroid: { x: 10.4, z: -20.6 },
  nearby_names: ['丘'],
  url: 'https://example.com/territories/11111111-1111-4111-8111-111111111111',
};

let receiver: Server | undefined;
afterEach(async () => {
  if (receiver) await new Promise<void>((resolve, reject) => receiver!.close((error) => error ? reject(error) : resolve()));
  receiver = undefined;
});

async function setup() {
  const post = vi.fn().mockResolvedValue({ id: 'discord-message' });
  const client = { isReady: () => true, rest: { post } } as unknown as Client;
  receiver = await startTerritoryReceiver(client, {
    participantChannelId: participant,
    adminChannelId: admin,
    sharedSecret: secret,
    port: 0,
  });
  const port = (receiver.address() as AddressInfo).port;
  const request = () => fetch(`http://127.0.0.1:${port}/internal/territories`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  return { post, request };
}

describe('territory receiver', () => {
  it('delivers the same event to participant and administrator channels with only explicit user mentions enabled', async () => {
    const { post, request } = await setup();
    expect((await request()).status).toBe(204);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls.map(call => call[0])).toEqual([
      `/channels/${participant}/messages`,
      `/channels/${admin}/messages`,
    ]);
    for (const [, options] of post.mock.calls) {
      expect(options.body.allowed_mentions).toEqual({ parse: [], users: [discordId] });
      expect(options.body.enforce_nonce).toBe(true);
      expect(options.body.content).toContain('<@323456789012345678>');
      expect(options.body.content).toContain('@everyone 広場');
    }
    expect(post.mock.calls[0]![1]!.body.nonce).not.toBe(post.mock.calls[1]![1]!.body.nonce);
  });

  it('keeps per-channel nonces stable across a retry after partial delivery failure', async () => {
    const { post, request } = await setup();
    post.mockResolvedValueOnce({ id: 'participant' }).mockRejectedValueOnce(new Error('admin failed'));
    expect((await request()).status).toBe(502);
    const firstParticipantNonce = post.mock.calls[0]![1]!.body.nonce;
    const firstAdminNonce = post.mock.calls[1]![1]!.body.nonce;

    post.mockResolvedValue({ id: 'retry' });
    expect((await request()).status).toBe(204);
    expect(post.mock.calls[2]![1]!.body.nonce).toBe(firstParticipantNonce);
    expect(post.mock.calls[3]![1]!.body.nonce).toBe(firstAdminNonce);
  });
});
