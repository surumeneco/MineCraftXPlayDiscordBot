import { describe, expect, it } from 'vitest';
import { formatTerritoryMessage, parseTerritoryEvent } from '../src/territory-notifications.js';

const base = {
  event_id: 'territory:application:1',
  application_type: 'new' as const,
  territory_name: '海辺',
  account_name: 'ねこ',
  discord_ids: ['981000000000000001'],
  centroid: { x: 10.6, z: -20.4 },
  nearby_names: ['丘'],
  url: 'https://example.com/territories/1',
};

describe('territory notifications', () => {
  it('distinguishes new and edit applications', () => {
    expect(formatTerritoryMessage({ ...base, kind: 'application' })).toContain('領地｢海辺｣を申請しました！');
    expect(formatTerritoryMessage({ ...base, kind: 'application', application_type: 'edit' })).toContain('領地｢海辺｣の変更を申請しました！');
  });
  it('rounds displayed centroid and formats nearby territories', () => {
    const message = formatTerritoryMessage({ ...base, kind: 'application' });
    expect(message).toContain('場所: (11, -20)付近');
    expect(message).toContain('近くの領地: 丘');
  });
  it('uses explicit mentions for review events', () => {
    expect(formatTerritoryMessage({ ...base, kind: 'returned', reason: '境界を確認してください' })).toContain('<@981000000000000001>');
    expect(formatTerritoryMessage({ ...base, kind: 'withdrawn', application_type: 'edit' })).toContain('変更申請を取り下げました。');
  });
  it('formats an immediate rename without pinging the applicant', () => {
    const event = { ...base, kind: 'renamed' as const, previous_name: '旧領地', territory_name: '新領地', discord_ids: [] }
    expect(parseTerritoryEvent(event).kind).toBe('renamed')
    expect(formatTerritoryMessage(event)).toBe('旧領地が新領地に改名されました！')
    expect(() => parseTerritoryEvent({ ...event, previous_name: '' })).toThrow()
  })
  it('rejects malformed mention IDs', () => {
    expect(() => parseTerritoryEvent({ ...base, kind: 'approved', discord_ids: ['@everyone'] })).toThrow();
  });
});
