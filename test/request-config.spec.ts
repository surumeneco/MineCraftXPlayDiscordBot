import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const token = 'bot-token';
const channelId = '123456789012345678';
const secret = 'r'.repeat(40);

describe('request receiver configuration', () => {
  it('does not enable receivers when settings are omitted', () => {
    expect(loadConfig({ DISCORD_BOT_TOKEN: token })).toEqual({ discordBotToken: token });
  });

  it('enables request delivery without enabling notice notifications', () => {
    expect(loadConfig({ DISCORD_BOT_TOKEN: token, REQUEST_CHANNEL_ID: channelId, REQUEST_NOTIFY_SECRET: secret })).toEqual({
      discordBotToken: token,
      requests: { channelId, sharedSecret: secret, port: 3102 },
    });
  });

  it('allows independent request and notice ports', () => {
    const config = loadConfig({ DISCORD_BOT_TOKEN: token, REQUEST_CHANNEL_ID: channelId,
      REQUEST_NOTIFY_SECRET: secret, NOTICE_CHANNEL_ID: channelId, NOTICE_NOTIFY_SECRET: 'n'.repeat(40) });
    expect(config.requests?.port).toBe(3102);
    expect(config.noticeNotifications?.port).toBe(3101);
  });

  it('rejects incomplete or invalid request configuration and port conflicts', () => {
    const base = { DISCORD_BOT_TOKEN: token, REQUEST_CHANNEL_ID: channelId, REQUEST_NOTIFY_SECRET: secret };
    expect(() => loadConfig({ ...base, REQUEST_CHANNEL_ID: '' })).toThrow('REQUEST_CHANNEL_ID');
    expect(() => loadConfig({ ...base, REQUEST_NOTIFY_SECRET: 'weak' })).toThrow('REQUEST_NOTIFY_SECRET');
    expect(() => loadConfig({ ...base, REQUEST_HTTP_PORT: '3101', NOTICE_CHANNEL_ID: channelId,
      NOTICE_NOTIFY_SECRET: 'n'.repeat(40) })).toThrow('REQUEST_HTTP_PORT');
  });
});
