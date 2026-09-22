import { describe, expect, it } from 'vitest';
import { eventNonce, formatNoticeMessage, parseNoticeEvent } from '../src/notice-notifications.js';
import { loadConfig } from '../src/config.js';

const event = {
  event_id: '11111111-1111-4111-8111-111111111111:2:publish',
  kind: 'publish',
  title: 'テスト',
  tags: ['建築', 'イベント'],
  url: 'https://example.com/info/notice/%E3%83%86%E3%82%B9%E3%83%88',
} as const;

describe('notice notifications', () => {
  it('formats publication and update differently with tags and the article URL', () => {
    const published = parseNoticeEvent({ ...event, tags: [...event.tags] });
    expect(formatNoticeMessage(published)).toBe(`新しいお知らせが投稿されました: テスト 🏷️建築 イベント\n${event.url}`);
    expect(formatNoticeMessage({ ...published, kind: 'update' })).toBe(`お知らせの内容が更新されました: テスト 🏷️建築 イベント\n${event.url}`);
  });

  it('rejects invalid event IDs, malformed URLs and tagless publication', () => {
    expect(() => parseNoticeEvent({ ...event, event_id: 'invalid' })).toThrow();
    expect(() => parseNoticeEvent({ ...event, url: 'javascript:alert(1)' })).toThrow();
    expect(() => parseNoticeEvent({ ...event, tags: [] })).toThrow();
  });

  it('keeps messages within 2000 UTF-16 units without removing the link', () => {
    const result = formatNoticeMessage({ ...parseNoticeEvent({ ...event, tags: [...event.tags] }), title: '🐻'.repeat(5000) });
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result).toContain('…\nhttps://example.com/info/notice/');
  });

  it('derives a stable distinct 24-character nonce per event', () => {
    expect(eventNonce(event.event_id)).toHaveLength(24);
    expect(eventNonce(event.event_id)).toBe(eventNonce(event.event_id));
    expect(eventNonce(event.event_id)).not.toBe(eventNonce(event.event_id.replace(':publish', ':update')));
  });

  it('requires both notification settings but remains compatible when disabled', () => {
    expect(loadConfig({ DISCORD_BOT_TOKEN: 'token' })).toEqual({ discordBotToken: 'token' });
    expect(() => loadConfig({ DISCORD_BOT_TOKEN: 'token', NOTICE_CHANNEL_ID: '123456789012345678' })).toThrow();
    expect(loadConfig({ DISCORD_BOT_TOKEN: 'token', NOTICE_CHANNEL_ID: '123456789012345678', NOTICE_NOTIFY_SECRET: 'x'.repeat(32) }).noticeNotifications?.port).toBe(3101);
  });
});
