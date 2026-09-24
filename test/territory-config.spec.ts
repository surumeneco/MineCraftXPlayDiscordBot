import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const token = 'bot-token';
const participant = '123456789012345678';
const admin = '223456789012345678';
const secret = 't'.repeat(40);

describe('territory notification configuration', () => {
  it('enables the receiver only when both distinct channels and a strong secret are present', () => {
    const config = loadConfig({
      DISCORD_BOT_TOKEN: token,
      TERRITORY_PARTICIPANT_CHANNEL_ID: participant,
      TERRITORY_ADMIN_CHANNEL_ID: admin,
      TERRITORY_NOTIFY_SECRET: secret,
    });
    expect(config.territoryNotifications).toEqual({
      participantChannelId: participant,
      adminChannelId: admin,
      sharedSecret: secret,
      port: 3103,
    });
  });

  it('rejects incomplete, duplicate-channel, weak-secret and port-conflict settings', () => {
    const base = {
      DISCORD_BOT_TOKEN: token,
      TERRITORY_PARTICIPANT_CHANNEL_ID: participant,
      TERRITORY_ADMIN_CHANNEL_ID: admin,
      TERRITORY_NOTIFY_SECRET: secret,
    };
    expect(() => loadConfig({ ...base, TERRITORY_ADMIN_CHANNEL_ID: '' })).toThrow('TERRITORY_ADMIN_CHANNEL_ID');
    expect(() => loadConfig({ ...base, TERRITORY_ADMIN_CHANNEL_ID: participant })).toThrow('must be different');
    expect(() => loadConfig({ ...base, TERRITORY_NOTIFY_SECRET: 'weak' })).toThrow('TERRITORY_NOTIFY_SECRET');
    expect(() => loadConfig({
      ...base,
      TERRITORY_HTTP_PORT: '3101',
      NOTICE_CHANNEL_ID: '423456789012345678',
      NOTICE_NOTIFY_SECRET: 'n'.repeat(40),
    })).toThrow('TERRITORY_HTTP_PORT');
  });
});
